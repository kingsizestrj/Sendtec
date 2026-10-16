export const fmtNumber = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR');
export const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtPhone = (p?: string | null) => {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(p ?? '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p ?? '';
};
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Imagens servidas pelo próprio Sendtec são exibidas pelo caminho local (a URL pública pode não ser acessível da rede interna). */
export const localMedia = (url?: string | null) => (url ? url.replace(/^https?:\/\/[^/]+(?=\/api\/media\/)/, '') : url);
