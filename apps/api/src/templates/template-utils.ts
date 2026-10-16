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
