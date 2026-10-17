/** Utilitários para ler a estrutura de componentes de um modelo da Meta. */
export function countVars(text: string | undefined): number {
  const nums = [...(text ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export function componentsInfo(components: any[]) {
  const header = components.find((c) => c.type === 'HEADER');
  const body = components.find((c) => c.type === 'BODY');
  const footer = components.find((c) => c.type === 'FOOTER');
  const buttons: any[] = components.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  return {
    headerFormat: (header?.format as string | undefined) ?? null,
    headerText: header?.format === 'TEXT' ? (header.text as string) : null,
    bodyText: (body?.text as string) ?? '',
    bodyVars: countVars(body?.text),
    footerText: (footer?.text as string) ?? null,
    buttons,
    // índices dos botões de URL com sufixo dinâmico
    dynamicUrlButtons: buttons.map((b, i) => (b.type === 'URL' && countVars(b.url) > 0 ? i : -1)).filter((i) => i >= 0),
  };
}

export function renderText(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => values[n] ?? `{{${n}}}`);
}

/** Rascunho de modelo usado pela IA e pela revisão (mesmo formato do formulário). */
export interface TemplateDraft {
  name: string;
  category: 'MARKETING' | 'UTILITY';
  headerText?: string | null;
  body: string;
  examples: string[];
  footer?: string | null;
  buttons: { type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string | null; phoneNumber?: string | null }[];
}

export interface DraftIssue {
  severity: 'bloqueia' | 'risco' | 'dica';
  problem: string;
  fix: string;
}

const SHORTENERS = /\b(bit\.ly|tinyurl\.com|cutt\.ly|is\.gd|t\.co|goo\.gl|ow\.ly|rebrand\.ly|s\.id|encurtador\.com\.br|shorturl\.at|tiny\.cc|rb\.gy|u\.to|abre\.ai|l1nk\.dev)\//i;

/** Regras objetivas da Meta, conferidas sem IA (rápido e de graça). */
export function draftIssues(d: TemplateDraft): DraftIssue[] {
  const out: DraftIssue[] = [];
  const add = (severity: DraftIssue['severity'], problem: string, fix: string) => out.push({ severity, problem, fix });
  const body = (d.body ?? '').trim();
  if (d.name && !/^[a-z0-9_]{1,512}$/.test(d.name)) add('bloqueia', 'Nome do modelo com caracteres inválidos', 'Use só letras minúsculas, números e _');
  if (!body) add('bloqueia', 'Texto da mensagem vazio', 'Escreva o corpo da mensagem');
  if (body.length > 1024) add('bloqueia', `Texto com ${body.length} caracteres (máximo 1024)`, 'Encurte a mensagem');
  const vars = countVars(body);
  const found = new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));
  for (let i = 1; i <= vars; i++) if (!found.has(i)) add('bloqueia', `Variáveis fora de sequência: falta {{${i}}}`, 'Numere as variáveis em ordem: {{1}}, {{2}}, {{3}}…');
  if (/^\s*\{\{\s*\d+\s*\}\}/.test(body)) add('bloqueia', 'Mensagem começa com uma variável', 'Comece com uma palavra, ex.: "Olá, {{1}}!"');
  if (/\{\{\s*\d+\s*\}\}\s*$/.test(body)) add('bloqueia', 'Mensagem termina com uma variável', 'Termine com texto ou pontuação, ex.: "… vence em {{2}}. Qualquer dúvida, estamos aqui."');
  if (/\{\{\s*\d+\s*\}\}[\s,.;:!?-]*\{\{\s*\d+\s*\}\}/.test(body)) add('risco', 'Duas variáveis seguidas, sem texto entre elas', 'Coloque palavras entre as variáveis');
  if (vars > 0) {
    const words = body.replace(/\{\{\s*\d+\s*\}\}/g, ' ').split(/\s+/).filter(Boolean).length;
    if (words < vars * 3 + 2) add('risco', 'Muitas variáveis para um texto tão curto', 'A Meta rejeita modelos em que as variáveis dominam o texto; escreva mais contexto fixo');
  }
  if ((d.examples ?? []).slice(0, vars).filter((e) => e?.trim()).length < vars) add('bloqueia', 'Falta exemplo para alguma variável', 'Preencha um exemplo realista para cada {{n}}');
  const allText = [body, d.headerText, d.footer, ...(d.buttons ?? []).map((b) => b.url)].filter(Boolean).join(' ');
  if (SHORTENERS.test(allText)) add('bloqueia', 'Link encurtado (bit.ly e similares)', 'A Meta rejeita encurtadores: use o endereço completo do seu domínio');
  if (d.headerText && d.headerText.length > 60) add('bloqueia', 'Título com mais de 60 caracteres', 'Encurte o título');
  if (d.headerText && /\{\{\s*\d+\s*\}\}/.test(d.headerText)) add('risco', 'Variável no título', 'O Sendtec preenche variáveis só no corpo; deixe o título fixo');
  if (d.footer && d.footer.length > 60) add('bloqueia', 'Rodapé com mais de 60 caracteres', 'Encurte o rodapé');
  if ((d.buttons ?? []).length > 10) add('bloqueia', 'Mais de 10 botões', 'Use no máximo 10 botões');
  for (const b of d.buttons ?? []) {
    if (!b.text?.trim()) add('bloqueia', 'Botão sem texto', 'Dê um texto curto ao botão');
    else if (b.text.length > 25) add('bloqueia', `Botão "${b.text}" com mais de 25 caracteres`, 'Encurte o texto do botão');
    if (b.type === 'URL' && !/^https:\/\//.test(b.url ?? '')) add('bloqueia', `Botão "${b.text}" sem link https`, 'Informe um endereço começando com https://');
  }
  if (/(\p{Extended_Pictographic}.*){6,}/u.test(body)) add('risco', 'Excesso de emojis', 'Use no máximo 2 ou 3 emojis');
  if (/(!{2,}|\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{6,}\b.*\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{6,}\b)/.test(body)) add('risco', 'Tom de "grito" (CAIXA ALTA ou !!!)', 'Escreva em tom normal; a Meta e os clientes penalizam mensagens agressivas');
  if (d.category === 'MARKETING' && !(d.buttons ?? []).some((b) => /sair|parar|descadastr/i.test(b.text)) && !/sair|parar|descadastr/i.test(`${body} ${d.footer ?? ''}`)) {
    add('dica', 'Sem opção de descadastro', 'Adicione um botão "Sair": o Sendtec registra o descadastro sozinho e isso protege a qualidade do número');
  }
  return out;
}

/** Largura e altura de um PNG ou JPEG lendo só o cabeçalho do arquivo. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Regras objetivas para a imagem do cabeçalho. */
export function imageIssues(size: { width: number; height: number } | null, bytes: number): DraftIssue[] {
  const out: DraftIssue[] = [];
  if (bytes > 5 * 1024 * 1024) out.push({ severity: 'bloqueia', problem: 'Imagem com mais de 5 MB', fix: 'Exporte a arte em JPG com qualidade menor' });
  if (!size) return out;
  if (size.width < 600) out.push({ severity: 'risco', problem: `Imagem pequena (${size.width}×${size.height})`, fix: 'Use pelo menos 1200 px de largura para não ficar borrada no celular' });
  const ratio = size.width / size.height;
  if (ratio < 1.91 * 0.75 || ratio > 1.91 * 1.25) {
    out.push({ severity: 'dica', problem: `Proporção ${ratio.toFixed(2)}:1 (ideal 1,91:1)`, fix: 'O WhatsApp corta as bordas; o ideal é 1200×628 com o texto longe das bordas' });
  }
  return out;
}
