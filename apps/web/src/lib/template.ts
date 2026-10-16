export function countVars(text?: string): number {
  const nums = [...(text ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export function templateInfo(components: any[] = []) {
  const header = components.find((c) => c.type === 'HEADER');
  const body = components.find((c) => c.type === 'BODY');
  const footer = components.find((c) => c.type === 'FOOTER');
  const buttons: any[] = components.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  return {
    headerFormat: (header?.format as string) ?? null,
    headerText: header?.format === 'TEXT' ? header.text : null,
    bodyText: body?.text ?? '',
    bodyVars: countVars(body?.text),
    footerText: footer?.text ?? null,
    buttons,
    dynamicUrlButtons: buttons.map((b, i) => (b.type === 'URL' && countVars(b.url) > 0 ? i : -1)).filter((i) => i >= 0),
  };
}

export function fill(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => values[n] || `{{${n}}}`);
}
