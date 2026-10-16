import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetaClient } from '../meta/meta.client';
import { MediaService } from '../media/media.service';
import { countVars } from './template-utils';

export interface TemplateButtonInput {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  urlExample?: string;
  phoneNumber?: string;
}

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  header: { type: 'NONE' | 'TEXT' | 'IMAGE'; text?: string; mediaId?: string };
  body: { text: string; examples: string[] };
  footer?: string;
  buttons?: TemplateButtonInput[];
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(private prisma: PrismaService, private meta: MetaClient, private media: MediaService) {}

  list() {
    return this.prisma.template.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const t = await this.prisma.template.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Modelo não encontrado');
    return { ...t, headerMediaUrl: t.headerMediaId ? await this.media.publicUrl(t.headerMediaId) : null };
  }

  private validate(input: CreateTemplateInput) {
    if (!/^[a-z0-9_]{1,512}$/.test(input.name)) {
      throw new BadRequestException('Nome do modelo: use apenas letras minúsculas, números e _ (ex.: promo_fibra_outubro)');
    }
    if (!['MARKETING', 'UTILITY'].includes(input.category)) throw new BadRequestException('Categoria inválida');
    const text = input.body?.text?.trim();
    if (!text) throw new BadRequestException('O corpo da mensagem é obrigatório');
    if (text.length > 1024) throw new BadRequestException('O corpo pode ter no máximo 1024 caracteres');
    const vars = countVars(text);
    const found = new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));
    for (let i = 1; i <= vars; i++) if (!found.has(i)) throw new BadRequestException(`As variáveis devem ser sequenciais: falta {{${i}}}`);
    if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(text)) throw new BadRequestException('A Meta não aceita variável no início ou no fim do texto');
    if ((input.body.examples ?? []).slice(0, vars).some((e) => !e?.trim()) || (input.body.examples ?? []).length < vars) {
      throw new BadRequestException('Preencha um exemplo para cada variável');
    }
    if (input.header.type === 'TEXT' && (!input.header.text || input.header.text.length > 60)) {
      throw new BadRequestException('O título deve ter entre 1 e 60 caracteres');
    }
    if (input.header.type === 'IMAGE' && !input.header.mediaId) throw new BadRequestException('Envie a imagem do cabeçalho');
    if (input.footer && input.footer.length > 60) throw new BadRequestException('O rodapé pode ter no máximo 60 caracteres');
    if ((input.buttons ?? []).length > 10) throw new BadRequestException('Máximo de 10 botões');
  }

  async create(input: CreateTemplateInput) {
    this.validate(input);
    const components: any[] = [];

    if (input.header.type === 'TEXT') {
      components.push({ type: 'HEADER', format: 'TEXT', text: input.header.text });
    } else if (input.header.type === 'IMAGE') {
      const { media, buffer } = await this.media.read(input.header.mediaId!);
      const handle = await this.meta.uploadForTemplate(buffer, media.filename, media.mimeType);
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [handle] } });
    }

    const vars = countVars(input.body.text);
    components.push({
      type: 'BODY',
      text: input.body.text,
      ...(vars ? { example: { body_text: [input.body.examples.slice(0, vars)] } } : {}),
    });

    if (input.footer?.trim()) components.push({ type: 'FOOTER', text: input.footer.trim() });

    if (input.buttons?.length) {
      components.push({
        type: 'BUTTONS',
        buttons: input.buttons.map((b) => {
          if (b.type === 'URL') {
            return { type: 'URL', text: b.text, url: b.url, ...(countVars(b.url) ? { example: [b.urlExample || b.url] } : {}) };
          }
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
          return { type: 'QUICK_REPLY', text: b.text };
        }),
      });
    }

    const res = await this.meta.createTemplate({ name: input.name, language: input.language || 'pt_BR', category: input.category, components });
    return this.prisma.template.upsert({
      where: { name_language: { name: input.name, language: input.language || 'pt_BR' } },
      create: {
        metaId: res.id,
        name: input.name,
        language: input.language || 'pt_BR',
        category: res.category || input.category,
        status: res.status || 'PENDING',
        components,
        headerMediaId: input.header.type === 'IMAGE' ? input.header.mediaId : null,
        lastSyncedAt: new Date(),
      },
      update: {
        metaId: res.id,
        category: res.category || input.category,
        status: res.status || 'PENDING',
        components,
        headerMediaId: input.header.type === 'IMAGE' ? input.header.mediaId : null,
        lastSyncedAt: new Date(),
      },
    });
  }

  /** Sincroniza status, categoria e qualidade de todos os modelos com a Meta. */
  async sync() {
    const remote = await this.meta.listTemplates();
    const seen = new Set<string>();
    for (const t of remote) {
      seen.add(t.id);
      const data = {
        metaId: t.id,
        category: t.category,
        status: t.status,
        rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
        qualityScore: t.quality_score?.score ?? null,
        components: t.components as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      };
      await this.prisma.template.upsert({
        where: { name_language: { name: t.name, language: t.language } },
        create: { name: t.name, language: t.language, ...data },
        update: data,
      });
    }
    // modelos apagados direto no Gerenciador do WhatsApp
    await this.prisma.template.updateMany({
      where: { metaId: { notIn: [...seen] }, status: { not: 'DELETED' } },
      data: { status: 'DELETED' },
    });
    return { total: remote.length };
  }

  async hasPending() {
    return (await this.prisma.template.count({ where: { status: { in: ['PENDING', 'IN_APPEAL', 'PENDING_DELETION'] } } })) > 0;
  }

  async remove(id: string) {
    const t = await this.get(id);
    if (t.status !== 'DELETED') await this.meta.deleteTemplate(t.name, t.metaId);
    const used = await this.prisma.campaign.count({ where: { templateId: id } });
    if (used) return this.prisma.template.update({ where: { id }, data: { status: 'DELETED' } });
    return this.prisma.template.delete({ where: { id } });
  }
}
