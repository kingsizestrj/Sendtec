import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { MediaService } from '../media/media.service';
import { componentsInfo, draftIssues, imageIssues, imageSize, TemplateDraft } from '../templates/template-utils';
import { AiService, AiUsage } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private ai: AiService, private audit: AuditService, private prisma: PrismaService, private media: MediaService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  /** Regras objetivas, sem IA (usado na hora, enquanto o usuário digita). */
  @Post('templates/check')
  async check(@Body() body: TemplateDraft & { mediaId?: string | null }) {
    const issues = draftIssues(body);
    if (body.mediaId) {
      const { buffer } = await this.media.read(body.mediaId).catch(() => ({ buffer: null as Buffer | null }));
      if (buffer) issues.push(...imageIssues(imageSize(buffer), buffer.length));
    }
    return { issues };
  }

  @Post('scripts/generate')
  async generateScript(@Body() body: { campaignName: string; templateId?: string | null; objective?: string | null; offer?: string | null }, @CurrentUser() user: AuthUser) {
    const t = body.templateId ? await this.prisma.template.findUnique({ where: { id: body.templateId } }) : null;
    const info = t ? componentsInfo(t.components as any[]) : null;
    const templateText = info ? [info.headerText, info.bodyText, info.footerText, ...info.buttons.map((b: any) => `[botão: ${b.text}]`)].filter(Boolean).join('\n') : null;
    const r = await this.ai.generateScript({ campaignName: body.campaignName, templateText, category: t?.category, objective: body.objective, offer: body.offer });
    await this.log(user, 'Gerou roteiro da IA de atendimento', null, r.usage, { campanha: body.campaignName });
    return r;
  }

  @Post('templates/generate')
  async generate(@Body() body: { objective: string; category?: 'AUTO' | 'MARKETING' | 'UTILITY'; notes?: string; mediaId?: string | null }, @CurrentUser() user: AuthUser) {
    const r = await this.ai.generate(body);
    await this.log(user, 'Gerou modelos com IA', null, r.usage, { objetivo: (body.objective ?? '').slice(0, 200), imagem: !!body.mediaId });
    return r;
  }

  @Post('templates/review')
  async review(@Body() body: TemplateDraft & { mediaId?: string | null }, @CurrentUser() user: AuthUser) {
    const r = await this.ai.review(body);
    await this.log(user, 'Revisou modelo com IA', null, r.usage, { modelo: body.name, resultado: r.verdict });
    return r;
  }

  @Post('templates/:id/fix')
  async fix(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const t = await this.prisma.template.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Modelo não encontrado');
    const info = componentsInfo(t.components as any[]);
    const body = (t.components as any[]).find((c) => c.type === 'BODY');
    const draft: TemplateDraft = {
      name: t.name,
      category: t.category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
      headerText: info.headerText,
      body: info.bodyText,
      examples: body?.example?.body_text?.[0] ?? [],
      footer: info.footerText,
      buttons: info.buttons.map((b: any) => ({ type: b.type, text: b.text, url: b.url, phoneNumber: b.phone_number })),
    };
    const r = await this.ai.fixRejected(draft, t.rejectedReason, info.headerFormat === 'IMAGE' ? t.headerMediaId : null);
    await this.log(user, 'Pediu correção de modelo rejeitado à IA', id, r.usage, { modelo: t.name });
    return { ...r, headerFormat: info.headerFormat, headerMediaId: t.headerMediaId };
  }

  private log(user: AuthUser, action: string, entityId: string | null, usage: AiUsage, details: Record<string, unknown>) {
    return this.audit.log(user, action, 'modelo', entityId, { ...details, ia: usage.model, tokens: usage.inputTokens + usage.outputTokens, custoUsd: usage.costUsd });
  }
}
