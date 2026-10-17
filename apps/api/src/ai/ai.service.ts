import Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { VARIABLE_SOURCES } from '../ixc/ixc.catalog';
import { MediaService } from '../media/media.service';
import { countVars, DraftIssue, draftIssues, imageIssues, imageSize, TemplateDraft } from '../templates/template-utils';

// preço por milhão de tokens (entrada, saída) em US$, para mostrar o custo de cada uso
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
};

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const BUTTON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['QUICK_REPLY', 'URL'] },
    text: { type: 'string' },
    url: { type: ['string', 'null'] },
  },
  required: ['type', 'text', 'url'],
  additionalProperties: false,
};

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'nome do modelo: minúsculas, números e _' },
    category: { type: 'string', enum: ['MARKETING', 'UTILITY'] },
    headerText: { type: ['string', 'null'] },
    body: { type: 'string' },
    examples: { type: 'array', items: { type: 'string' } },
    footer: { type: ['string', 'null'] },
    buttons: { type: 'array', items: BUTTON_SCHEMA },
  },
  required: ['name', 'category', 'headerText', 'body', 'examples', 'footer', 'buttons'],
  additionalProperties: false,
};

const VARIABLES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { n: { type: 'integer' }, meaning: { type: 'string' }, source: { type: 'string' } },
    required: ['n', 'meaning', 'source'],
    additionalProperties: false,
  },
};

const GENERATE_SCHEMA = {
  type: 'object',
  properties: {
    imageSummary: { type: ['string', 'null'], description: 'o que a imagem do cabeçalho mostra (null se não houver imagem)' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'rótulo curto da abordagem, ex.: "Direta", "Calorosa", "Urgência leve"' },
          categoryReason: { type: 'string' },
          draft: DRAFT_SCHEMA,
          variables: VARIABLES_SCHEMA,
        },
        required: ['title', 'categoryReason', 'draft', 'variables'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions', 'imageSummary'],
  additionalProperties: false,
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'atencao', 'alto_risco'] },
    summary: { type: 'string' },
    suggestedCategory: { type: 'string', enum: ['MARKETING', 'UTILITY'] },
    categoryReason: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['bloqueia', 'risco', 'dica'] },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'problem', 'fix'],
        additionalProperties: false,
      },
    },
    improved: { anyOf: [DRAFT_SCHEMA, { type: 'null' }] },
    imageAdvice: { type: ['string', 'null'], description: 'o que mudar na arte (null se não houver imagem ou se ela estiver boa)' },
  },
  required: ['verdict', 'summary', 'suggestedCategory', 'categoryReason', 'issues', 'improved', 'imageAdvice'],
  additionalProperties: false,
};

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    explanation: { type: 'string', description: 'o que provavelmente causou a rejeição, em português simples' },
    changes: { type: 'array', items: { type: 'string' } },
    improved: DRAFT_SCHEMA,
    imageAdvice: { type: ['string', 'null'], description: 'o que mudar na arte, se a imagem pode ter causado a rejeição' },
  },
  required: ['explanation', 'changes', 'improved', 'imageAdvice'],
  additionalProperties: false,
};

const RULES = `Regras da Meta para modelos de WhatsApp (siga todas):
- Variáveis no formato {{1}}, {{2}}… em sequência, só no corpo. Nunca no início nem no fim do texto (termine com texto ou pontuação). Nunca duas variáveis seguidas sem palavras entre elas. Poucas variáveis para o tamanho do texto.
- Corpo até 1024 caracteres (ideal: 250 a 550), título até 60, rodapé até 60, texto de botão até 25.
- Nada de links encurtados (bit.ly etc.); links só em botão de URL com https e domínio completo.
- Sem promessas exageradas ou garantias ("100% garantido", "a melhor do Brasil", "grátis para sempre"), sem pressão agressiva ("ÚLTIMA CHANCE!!!"), sem CAIXA ALTA, no máximo 2 ou 3 emojis.
- Sem pedir dados sensíveis (senha, cartão, CPF completo) e sem conteúdo ameaçador na cobrança (nada de "seu nome será negativado").
- Categoria UTILITY: só mensagens sobre algo que o cliente já tem ou fez (fatura, vencimento, manutenção, visita técnica, confirmação, mudança no serviço), sem nenhuma oferta, desconto ou incentivo. Se houver qualquer promoção, upgrade, indicação ou convite, é MARKETING (a Meta reclassifica ou rejeita utilidade com tom promocional).
- MARKETING deve oferecer saída: botão de resposta rápida "Sair" (o sistema descadastra quem toca nele).
- Exemplos das variáveis realistas e coerentes com o texto (nome, valor "R$ 99,90", data "10/11/2026").
- Nome do modelo em minúsculas, números e _, descritivo (ex.: lembrete_fatura_d3).
- A Meta também analisa a IMAGEM do cabeçalho: promessas exageradas, preços ou condições escritos na arte que não batem com o texto, arte promocional em modelo de UTILITY, texto ilegível no celular e conteúdo enganoso causam rejeição.`;

const IMAGE_HINT = `A imagem anexada é o cabeçalho do modelo. Leia o que ela mostra (texto escrito, preço, plano, datas, promoção). O texto deve complementar a arte, sem repetir tudo o que já está escrito nela e sem contradizê-la (mesmo preço, mesmo plano, mesmas datas). Se a arte for promocional, a categoria é MARKETING. Não use headerText (o cabeçalho é a imagem).`;

const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    nome: { type: 'string' },
    instrucoes: { type: 'string' },
    oferta: { type: ['string', 'null'] },
    duvidas: {
      type: 'array',
      items: { type: 'object', properties: { pergunta: { type: 'string' }, resposta: { type: 'string' } }, required: ['pergunta', 'resposta'], additionalProperties: false },
    },
    quando_humano: { type: ['string', 'null'] },
    equipe: { type: 'string', enum: ['vendas', 'suporte', 'financeiro'] },
  },
  required: ['nome', 'instrucoes', 'oferta', 'duvidas', 'quando_humano', 'equipe'],
  additionalProperties: false,
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private settings: SettingsService, private media: MediaService) {}

  /** Prepara a imagem do cabeçalho para a IA "ver" e confere as regras objetivas dela. */
  private async image(mediaId?: string | null): Promise<{ block: Anthropic.ImageBlockParam | null; issues: DraftIssue[] }> {
    if (!mediaId) return { block: null, issues: [] };
    const { media, buffer } = await this.media.read(mediaId);
    const issues = imageIssues(imageSize(buffer), buffer.length);
    // a API aceita até 5 MB por imagem depois de codificada; acima disso a IA escreve sem ver a arte
    if (buffer.length > 3.7 * 1024 * 1024) {
      issues.push({ severity: 'dica', problem: 'A IA não analisou a imagem (arquivo grande)', fix: 'Use uma imagem com menos de 3,5 MB para a IA conferir a arte' });
      return { block: null, issues };
    }
    const mediaType = media.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    return { block: { type: 'image', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } }, issues };
  }

  async status() {
    const ai = await this.settings.get('ai');
    return { enabled: !!ai.apiKey, model: ai.model };
  }

  async test() {
    const { usage } = await this.call<{ ok: boolean }>(
      'Responda apenas com o JSON pedido.',
      'Teste de conexão: devolva ok = true.',
      { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
      'low',
    );
    return { ok: true, model: usage.model };
  }

  private variablesHelp() {
    return VARIABLE_SOURCES.map((s) => `${s.label}: ${s.fields.map((f) => f.label).join(', ')}`).join('\n');
  }

  private async system() {
    const [ai, general] = await Promise.all([this.settings.get('ai'), this.settings.get('general')]);
    return `Você é redator(a) especialista em mensagens de WhatsApp para provedores de internet brasileiros e conhece a fundo as políticas de modelos da Meta (WhatsApp Business API).
Empresa: ${general.companyName}.
Tom da marca: ${ai.brandTone || 'próximo, claro e respeitoso'}.

${RULES}

Dados que o sistema consegue colocar nas variáveis (vindos do IXC Provedor). Use só estes:
${this.variablesHelp()}

Escreva sempre em português do Brasil. Use *negrito* do WhatsApp com moderação.`;
  }

  /** Gera 3 versões de modelo a partir do objetivo descrito pelo usuário. */
  async generate(input: { objective: string; category?: 'AUTO' | 'MARKETING' | 'UTILITY'; notes?: string; mediaId?: string | null }) {
    const img = await this.image(input.mediaId);
    const objective = input.objective?.trim() || (img.block ? 'Divulgar o que a imagem anexada mostra.' : '');
    if (!objective || objective.length < 8) throw new BadRequestException('Descreva o objetivo da mensagem com um pouco mais de detalhe');
    if (objective.length > 2000) throw new BadRequestException('Objetivo muito longo (máximo 2000 caracteres)');
    const cat = input.category && input.category !== 'AUTO' ? `A categoria deve ser ${input.category}.` : 'Escolha a categoria correta (MARKETING ou UTILITY) e explique por quê.';
    const prompt = `Objetivo da mensagem:
<objetivo>
${objective}
</objetivo>
${input.notes?.trim() ? `Observações extras: ${input.notes.trim().slice(0, 500)}\n` : ''}
Crie exatamente 3 versões diferentes de modelo (abordagens distintas, ex.: direta, calorosa, com benefício em destaque). ${cat}
Para cada uma: draft completo (com exemplos para cada variável, rodapé curto opcional e botões quando fizer sentido), "variables" dizendo o que cada {{n}} significa e de qual dado do sistema vem (ex.: "Cliente > Primeiro nome"), e "categoryReason" em uma frase.${img.block ? `\n\n${IMAGE_HINT} Em "imageSummary", descreva em uma frase o que a imagem mostra.` : '\n"imageSummary" = null.'}`;
    const { data, usage } = await this.call<{ imageSummary: string | null; suggestions: { title: string; categoryReason: string; draft: TemplateDraft; variables: any[] }[] }>(
      await this.system(),
      prompt,
      GENERATE_SCHEMA,
      'medium',
      img.block,
    );
    const suggestions = (data.suggestions ?? []).slice(0, 3).map((s) => {
      const draft = this.normalize(s.draft);
      if (img.block) draft.headerText = null;
      return { ...s, draft, issues: draftIssues(draft) };
    });
    return { suggestions, imageSummary: img.block ? data.imageSummary : null, imageIssues: img.issues, usage };
  }

  /** Revisa um rascunho antes de enviar: regras objetivas + análise da IA. */
  async review(draftIn: TemplateDraft & { mediaId?: string | null }) {
    const draft = this.normalize(draftIn);
    const img = await this.image(draftIn.mediaId);
    const local = [...draftIssues(draft), ...img.issues];
    const prompt = `Revise este modelo antes de enviá-lo à Meta. Aponte tudo que pode causar rejeição, reclassificação de categoria ou reclamação dos clientes, e diga se a categoria escolhida está certa.
Se houver qualquer problema, devolva em "improved" uma versão corrigida mantendo a intenção e o estilo (mesmas variáveis sempre que possível); se estiver bom, "improved" = null.
"verdict": ok (pode enviar), atencao (riscos menores) ou alto_risco (provável rejeição).

Modelo (JSON):
${JSON.stringify(draft, null, 2)}

Problemas já detectados pelas regras automáticas (não repita, mas corrija na versão melhorada):
${local.length ? local.map((i) => `- ${i.problem}`).join('\n') : '- nenhum'}${
      img.block
        ? `\n\nA imagem anexada é o cabeçalho deste modelo: revise também a arte (promessas, preços e datas coerentes com o texto, tom promocional x categoria, legibilidade no celular). Problemas da arte vão em "issues" e a recomendação em "imageAdvice" (a IA não edita a imagem; diga o que mudar). Se a arte estiver boa, "imageAdvice" = null.`
        : '\n"imageAdvice" = null.'
    }`;
    const { data, usage } = await this.call<{
      verdict: 'ok' | 'atencao' | 'alto_risco';
      summary: string;
      suggestedCategory: 'MARKETING' | 'UTILITY';
      categoryReason: string;
      issues: DraftIssue[];
      improved: TemplateDraft | null;
      imageAdvice: string | null;
    }>(await this.system(), prompt, REVIEW_SCHEMA, 'medium', img.block);
    const issues = [...local, ...(data.issues ?? [])];
    // uma regra objetiva que bloqueia vale mais que a opinião da IA
    const verdict = local.some((i) => i.severity === 'bloqueia') ? 'alto_risco' : data.verdict;
    const improved = data.improved ? this.normalize(data.improved) : null;
    if (improved && img.block) improved.headerText = null;
    return { ...data, imageAdvice: img.block ? data.imageAdvice : null, verdict, issues, improved, improvedIssues: improved ? draftIssues(improved) : [], usage };
  }

  /** Explica uma rejeição da Meta e propõe uma versão corrigida. */
  async fixRejected(draftIn: TemplateDraft, reason: string | null, mediaId?: string | null) {
    const draft = this.normalize(draftIn);
    const img = await this.image(mediaId);
    const prompt = `Este modelo foi REJEITADO pela Meta.
Motivo informado pela Meta: ${reason?.trim() || 'não informado'}
(Motivos comuns: INVALID_FORMAT = formato/variáveis; TAG_CONTENT_MISMATCH = conteúdo não bate com a categoria; PROMOTIONAL / ABUSIVE_CONTENT = tom promocional ou agressivo; SCAM = parece golpe; INCORRECT_CATEGORY = categoria errada.)

Modelo rejeitado (JSON):
${JSON.stringify(draft, null, 2)}

Explique em português simples, para alguém que não é técnico, o que provavelmente causou a rejeição. Liste as mudanças feitas e devolva em "improved" uma versão corrigida com alta chance de aprovação, mantendo o objetivo. Use um nome novo (ex.: acrescente _v2).${
      img.block
        ? `\n\nA imagem anexada é o cabeçalho do modelo rejeitado. Considere que a arte pode ter causado a rejeição; se for o caso, explique e diga em "imageAdvice" o que mudar nela (a IA não edita a imagem). ${IMAGE_HINT}`
        : '\n"imageAdvice" = null.'
    }`;
    const { data, usage } = await this.call<{ explanation: string; changes: string[]; improved: TemplateDraft; imageAdvice: string | null }>(
      await this.system(),
      prompt,
      FIX_SCHEMA,
      'medium',
      img.block,
    );
    const improved = this.normalize(data.improved);
    if (img.block) improved.headerText = null;
    return { ...data, imageAdvice: img.block ? data.imageAdvice : null, improved, issues: [...draftIssues(improved), ...img.issues], usage };
  }

  /** Rascunho do roteiro que a IA de atendimento segue com quem responder à campanha. */
  async generateScript(input: { campaignName: string; templateText?: string | null; category?: string | null; objective?: string | null; offer?: string | null }) {
    const general = await this.settings.get('general');
    const ai = await this.settings.get('ai');
    const system = `Você escreve roteiros para a IA de atendimento no WhatsApp de um provedor de internet brasileiro (${general.companyName}).
O roteiro orienta a IA a responder clientes que reagirem a uma campanha. Tom da marca: ${ai.brandTone || 'próximo, claro e respeitoso'}.
Regras para o roteiro:
- A IA de campanha só explica, tira dúvidas e transfere para a equipe escolhida. Nunca escreva que ela fecha venda, faz upgrade, abre OS, gera boleto ou altera cadastro.
- Não repita regras fixas que o sistema já aplica (não inventar preço, voltar ao atendimento normal se o cliente mudar de assunto, orientar sobre o SAIR).
- "oferta" é a ÚNICA fonte de preço, condição e validade que a IA pode citar. Use só o que foi informado no texto da campanha ou nas observações. Se faltar preço, condição ou validade, escreva no lugar exato "[PREENCHA: …]" dizendo o que falta. Se a campanha não tiver oferta (aviso, cobrança), oferta = null.
- "instrucoes": objetivo da campanha, tom e como conduzir a conversa, em tópicos curtos (até ~1500 caracteres).
- "duvidas": 4 a 8 perguntas que clientes provavelmente farão, com respostas curtas e corretas. Nada de dados que não foram informados; quando não souber, a resposta é transferir para a equipe.
- "quando_humano": situações que vão direto para uma pessoa (reclamação, cancelamento, cliente irritado, pedido de negociação…).
- "equipe": vendas para ofertas e upgrades, financeiro para cobrança, suporte para avisos técnicos e manutenção.
- "nome": curto e descritivo (até 60 caracteres).
Escreva em português do Brasil.`;
    const prompt = `Campanha: ${input.campaignName || 'sem nome'}
Categoria do modelo: ${input.category ?? 'não informada'}
Mensagem que o cliente vai receber:
<mensagem>
${input.templateText?.trim() || '(não informada)'}
</mensagem>
${input.objective?.trim() ? `Objetivo e observações de quem criou a campanha:\n<observacoes>\n${input.objective.trim().slice(0, 2000)}\n</observacoes>\n` : ''}${input.offer?.trim() ? `Oferta informada (use exatamente estes dados):\n<oferta>\n${input.offer.trim().slice(0, 2000)}\n</oferta>\n` : ''}
Escreva o roteiro.`;
    const { data, usage } = await this.call<{ nome: string; instrucoes: string; oferta: string | null; duvidas: { pergunta: string; resposta: string }[]; quando_humano: string | null; equipe: 'vendas' | 'suporte' | 'financeiro' }>(
      system,
      prompt,
      SCRIPT_SCHEMA,
      'medium',
    );
    const cut = (t: string | null | undefined, n: number) => (t ? t.trim().slice(0, n) : null);
    const script = {
      nome: cut(data.nome, 120) ?? input.campaignName.slice(0, 120),
      instrucoes: cut(data.instrucoes, 8000) ?? '',
      oferta: cut(data.oferta, 4000),
      duvidas: (data.duvidas ?? []).slice(0, 30).map((d) => ({ pergunta: d.pergunta.trim().slice(0, 300), resposta: d.resposta.trim().slice(0, 1000) })),
      quando_humano: cut(data.quando_humano, 2000),
      equipe: ['vendas', 'suporte', 'financeiro'].includes(data.equipe) ? data.equipe : 'vendas',
    };
    return { script, usage };
  }

  /** Ajusta o que a IA devolveu ao formato que o formulário e a Meta aceitam. */
  private normalize(d: TemplateDraft): TemplateDraft {
    const body = (d?.body ?? '').trim();
    const vars = countVars(body);
    const examples = Array.from({ length: vars }, (_, i) => String(d?.examples?.[i] ?? '').trim());
    const name = String(d?.name ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 100);
    return {
      name,
      category: d?.category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
      headerText: d?.headerText?.trim() || null,
      body,
      examples,
      footer: d?.footer?.trim() || null,
      buttons: (d?.buttons ?? []).slice(0, 10).map((b) => ({
        type: b.type === 'URL' ? 'URL' : b.type === 'PHONE_NUMBER' ? 'PHONE_NUMBER' : 'QUICK_REPLY',
        text: String(b.text ?? '').trim(),
        ...(b.type === 'URL' ? { url: b.url ?? 'https://' } : {}),
        ...(b.type === 'PHONE_NUMBER' ? { phoneNumber: b.phoneNumber ?? '' } : {}),
      })),
    };
  }

  private async call<T>(
    system: string,
    prompt: string,
    schema: Record<string, unknown>,
    effort: 'low' | 'medium',
    image?: Anthropic.ImageBlockParam | null,
  ): Promise<{ data: T; usage: AiUsage }> {
    const ai = await this.settings.get('ai');
    if (!ai.apiKey) throw new ServiceUnavailableException('IA não configurada: informe a chave da API em Configurações → Inteligência artificial');
    const model = ai.model || 'claude-haiku-5-5';
    const client = new Anthropic({ apiKey: ai.apiKey, maxRetries: 2, timeout: 120_000 });
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort, format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content: image ? [image, { type: 'text', text: prompt }] : prompt }],
      });
    } catch (e) {
      throw new ServiceUnavailableException(this.errorMessage(e));
    }
    const [inPrice, outPrice] = PRICES[model] ?? PRICES['claude-sonnet-5-5'];
    const usage: AiUsage = {
      model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      costUsd: Number(((res.usage.input_tokens * inPrice + res.usage.output_tokens * outPrice) / 1e6).toFixed(5)),
    };
    if (res.stop_reason === 'refusal') throw new BadRequestException('A IA recusou este pedido. Reformule o objetivo da mensagem.');
    if (res.stop_reason === 'max_tokens') throw new ServiceUnavailableException('A resposta da IA ficou longa demais. Tente um objetivo mais curto.');
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    try {
      return { data: JSON.parse(text) as T, usage };
    } catch {
      this.logger.warn(`Resposta da IA fora do formato (stop_reason=${res.stop_reason})`);
      throw new ServiceUnavailableException('A IA devolveu uma resposta incompleta. Tente de novo.');
    }
  }

  private errorMessage(e: unknown): string {
    if (e instanceof Anthropic.AuthenticationError) return 'Chave da API da IA inválida. Confira em Configurações → Inteligência artificial.';
    if (e instanceof Anthropic.PermissionDeniedError) return 'A chave da API não tem permissão para este modelo.';
    if (e instanceof Anthropic.RateLimitError) return 'Limite de uso da IA atingido no momento. Aguarde um minuto e tente de novo.';
    if (e instanceof Anthropic.NotFoundError) return 'Modelo de IA não encontrado. Escolha outro em Configurações.';
    if (e instanceof Anthropic.BadRequestError) {
      if (/credit balance/i.test(e.message)) return 'Sem créditos na conta da Anthropic. Adicione créditos em console.anthropic.com.';
      return `Pedido recusado pela API da IA: ${e.message}`;
    }
    if (e instanceof Anthropic.InternalServerError) return 'A API da IA está instável agora. Tente de novo em instantes.';
    if (e instanceof Anthropic.APIConnectionError) return 'Sem conexão com a API da IA (api.anthropic.com). Verifique a internet do servidor.';
    if (e instanceof Anthropic.APIError) return `Erro da API da IA (${e.status}): ${e.message}`;
    return `Erro ao chamar a IA: ${(e as Error)?.message ?? e}`;
  }
}
