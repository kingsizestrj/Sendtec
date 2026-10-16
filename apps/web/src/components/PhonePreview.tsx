import { ExternalLink, Image as ImageIcon, Phone, Reply } from 'lucide-react';
import { fill } from '../lib/template';
import { localMedia } from '../lib/format';

/** Pré-visualização estilo WhatsApp de um modelo. */
export function PhonePreview({
  headerFormat,
  headerText,
  imageUrl,
  body,
  footer,
  buttons = [],
  values = {},
  company = 'Sua empresa',
}: {
  headerFormat?: string | null;
  headerText?: string | null;
  imageUrl?: string | null;
  body: string;
  footer?: string | null;
  buttons?: { type: string; text: string }[];
  values?: Record<string, string>;
  company?: string;
}) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const rich = (t: string) =>
    fill(t, values)
      .split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
      .map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <b key={i}>{part.slice(1, -1)}</b>
        ) : part.startsWith('_') && part.endsWith('_') && part.length > 2 ? (
          <i key={i}>{part.slice(1, -1)}</i>
        ) : part.startsWith('~') && part.endsWith('~') && part.length > 2 ? (
          <s key={i}>{part.slice(1, -1)}</s>
        ) : (
          <span key={i}>{part}</span>
        ),
      );

  return (
    <div className="mx-auto w-[300px] rounded-[2.6rem] bg-gradient-to-b from-zinc-700 to-zinc-900 p-2.5 shadow-2xl shadow-fuchsia-900/30">
      <div className="overflow-hidden rounded-[2.1rem] bg-[#0b141a]">
        <div className="flex items-center gap-3 bg-[#1f2c34] px-4 pb-3 pt-6">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold">{company.charAt(0)}</div>
          <div>
            <div className="text-sm font-semibold leading-tight">{company}</div>
            <div className="text-[11px] text-emerald-400">Conta comercial</div>
          </div>
        </div>
        <div
          className="min-h-[430px] px-3 py-4"
          style={{
            backgroundColor: '#0b141a',
            backgroundImage: 'radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
          }}
        >
          <div className="max-w-[94%] rounded-xl rounded-tl-sm bg-[#1f2c34] p-1.5 text-[13px] leading-snug text-[#e9edef] shadow">
            {headerFormat === 'IMAGE' &&
              (imageUrl ? (
                <img src={localMedia(imageUrl)!} className="mb-1 aspect-[1.91/1] w-full rounded-lg object-cover" />
              ) : (
                <div className="mb-1 grid aspect-[1.91/1] w-full place-items-center rounded-lg bg-white/5 text-ink-400">
                  <ImageIcon className="h-8 w-8" />
                </div>
              ))}
            <div className="px-1.5 pb-1 pt-0.5">
              {headerFormat === 'TEXT' && headerText && <div className="mb-1 font-bold">{rich(headerText)}</div>}
              <div className="whitespace-pre-wrap break-words">{body ? rich(body) : <span className="text-ink-400">Digite a mensagem…</span>}</div>
              {footer && <div className="mt-1.5 text-[11px] text-[#8696a0]">{footer}</div>}
              <div className="mt-0.5 text-right text-[10px] text-[#8696a0]">{time}</div>
            </div>
            {buttons.length > 0 && (
              <div className="-mx-1.5 -mb-1.5 mt-1 divide-y divide-white/5 border-t border-white/5">
                {buttons.map((b, i) => (
                  <div key={i} className="flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-[#53bdeb]">
                    {b.type === 'URL' ? <ExternalLink className="h-3.5 w-3.5" /> : b.type === 'PHONE_NUMBER' ? <Phone className="h-3.5 w-3.5" /> : <Reply className="h-3.5 w-3.5" />}
                    {b.text || 'Botão'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
