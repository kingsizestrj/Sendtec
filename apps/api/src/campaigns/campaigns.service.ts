import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecipientStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CampaignRunner } from './campaign-runner.service';
import { AudienceSpec } from '../ixc/audience.service';
import { VariablesConfig } from './variables.service';
import { componentsInfo } from '../templates/template-utils';

export interface CampaignInput {
  name: string;
  templateId: string;
  audience: AudienceSpec;
  variables: VariablesConfig;
  headerMediaUrl?: string | null;
  respectOptOut?: boolean;
  scheduledAt?: string | null;
}

const EDITABLE = ['DRAFT', 'SCHEDULED'];

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService, private runner: CampaignRunner) {}

  private async counts(campaignIds: string[]) {
    const grouped = await this.prisma.campaignRecipient.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: campaignIds } },
      _count: true,
    });
    const out: Record<string, Record<string, number>> = {};
    for (const g of grouped) {
      out[g.campaignId] ??= {};
      out[g.campaignId][g.status] = g._count;
    }
    return out;
  }

  async list() {
    const campaigns = await this.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { template: { select: { name: true, category: true } }, createdBy: { select: { name: true } } },
    });
    const counts = await this.counts(campaigns.map((c) => c.id));
    return campaigns.map((c) => ({ ...c, counts: counts[c.id] ?? {} }));
  }

  async get(id: string) {
    const c = await this.prisma.campaign.findUnique({
      where: { id },
      include: { template: true, createdBy: { select: { name: true } } },
    });
    if (!c) throw new NotFoundException('Campanha não encontrada');
    const counts = (await this.counts([id]))[id] ?? {};
    return { ...c, counts };
  }

  private async validate(input: CampaignInput) {
    if (!input.name?.trim()) throw new BadRequestException('Dê um nome para a campanha');
    const template = await this.prisma.template.findUnique({ where: { id: input.templateId } });
    if (!template) throw new BadRequestException('Escolha um modelo');
    const info = componentsInfo(template.components as any[]);
    for (let i = 1; i <= info.bodyVars; i++) {
      const m = input.variables?.body?.[String(i)];
      if (!m || (m.source === 'fixo' ? !m.value : !m.field)) throw new BadRequestException(`Defina o valor da variável {{${i}}}`);
    }
    for (const idx of info.dynamicUrlButtons) {
      const m = input.variables?.buttons?.[String(idx)];
      if (!m || (m.source === 'fixo' ? !m.value : !m.field)) throw new BadRequestException(`Defina o valor do link do botão ${idx + 1}`);
    }
    return template;
  }

  private data(input: CampaignInput) {
    return {
      name: input.name.trim(),
      templateId: input.templateId,
      audience: (input.audience ?? { filters: [], areas: [], excludedClientIds: [] }) as unknown as Prisma.InputJsonValue,
      variables: (input.variables ?? { body: {} }) as unknown as Prisma.InputJsonValue,
      headerMediaUrl: input.headerMediaUrl || null,
      respectOptOut: input.respectOptOut ?? true,
    };
  }

  async create(input: CampaignInput, userId: string) {
    await this.validate(input);
    return this.prisma.campaign.create({ data: { ...this.data(input), createdById: userId } });
  }

  async update(id: string, input: CampaignInput) {
    const c = await this.get(id);
    if (!EDITABLE.includes(c.status)) throw new BadRequestException('Só é possível editar campanhas em rascunho ou agendadas');
    await this.validate(input);
    return this.prisma.campaign.update({ where: { id }, data: { ...this.data(input), status: 'DRAFT', scheduledAt: null } });
  }

  async remove(id: string) {
    const c = await this.get(id);
    if (!EDITABLE.includes(c.status) && !['COMPLETED', 'CANCELLED', 'FAILED'].includes(c.status)) {
      throw new BadRequestException('Pause ou cancele a campanha antes de excluir');
    }
    await this.prisma.campaign.delete({ where: { id } });
    return { ok: true };
  }

  /** Dispara agora ou agenda para scheduledAt. */
  async start(id: string, scheduledAt?: string | null) {
    const c = await this.get(id);
    if (!EDITABLE.includes(c.status)) throw new BadRequestException('Esta campanha já foi iniciada');
    if (c.template.status !== 'APPROVED') throw new BadRequestException(`O modelo ainda não está aprovado pela Meta (${c.template.status})`);
    if (scheduledAt) {
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60000) throw new BadRequestException('Data de agendamento inválida');
      return this.prisma.campaign.update({ where: { id }, data: { status: 'SCHEDULED', scheduledAt: when } });
    }
    await this.prisma.campaign.update({ where: { id }, data: { status: 'RUNNING', scheduledAt: null } });
    this.runner.launch(id);
    return this.get(id);
  }

  async pause(id: string) {
    const c = await this.get(id);
    if (c.status !== 'RUNNING') throw new BadRequestException('A campanha não está em andamento');
    return this.prisma.campaign.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  async resume(id: string) {
    const c = await this.get(id);
    if (!['PAUSED', 'FAILED'].includes(c.status)) throw new BadRequestException('A campanha não está pausada');
    await this.prisma.campaign.update({ where: { id }, data: { status: 'RUNNING', finishedAt: null } });
    this.runner.launch(id);
    return this.get(id);
  }

  async cancel(id: string) {
    const c = await this.get(id);
    if (['COMPLETED', 'CANCELLED'].includes(c.status)) throw new BadRequestException('A campanha já terminou');
    await this.prisma.campaignRecipient.updateMany({
      where: { campaignId: id, status: 'PENDING' },
      data: { status: 'SKIPPED', error: 'Campanha cancelada' },
    });
    return this.prisma.campaign.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date(), scheduledAt: null } });
  }

  /** Reenvia apenas para quem falhou. */
  async retryFailed(id: string) {
    const c = await this.get(id);
    if (['RUNNING'].includes(c.status)) throw new BadRequestException('Aguarde a campanha terminar');
    const { count } = await this.prisma.campaignRecipient.updateMany({
      where: { campaignId: id, status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });
    if (!count) throw new BadRequestException('Nenhum envio com falha');
    await this.prisma.campaign.update({ where: { id }, data: { status: 'RUNNING', finishedAt: null } });
    this.runner.launch(id);
    return { requeued: count };
  }

  async recipients(id: string, q: { status?: string; search?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 50));
    const where: Prisma.CampaignRecipientWhereInput = {
      campaignId: id,
      ...(q.status ? { status: q.status as RecipientStatus } : {}),
      ...(q.search
        ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }, { ixcClientId: q.search }] }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.campaignRecipient.count({ where }),
      this.prisma.campaignRecipient.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        omit: { clientData: true },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async csv(id: string) {
    const rows = await this.prisma.campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { createdAt: 'asc' }, omit: { clientData: true } });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fmt = (d: Date | null) => (d ? d.toISOString() : '');
    const header = ['id_ixc', 'nome', 'telefone', 'status', 'erro', 'enviado_em', 'entregue_em', 'lido_em', 'conversa_chatwoot'];
    const lines = rows.map((r) =>
      [r.ixcClientId, r.name, r.phone, r.status, r.error, fmt(r.sentAt), fmt(r.deliveredAt), fmt(r.readAt), r.chatwootConversationId].map(esc).join(';'),
    );
    return '﻿' + [header.join(';'), ...lines].join('\n');
  }
}
