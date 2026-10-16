import { BookmarkPlus, Download, FolderOpen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, tokenStore } from '../lib/api';
import type { AudienceSpec } from '../lib/types';
import { Button, Field, Modal, useToast } from './ui';

export interface SavedAudience { id: string; name: string; audience: AudienceSpec; createdBy?: { name: string }; _count?: { steps: number } }

export function useSavedAudiences() {
  const [list, setList] = useState<SavedAudience[]>([]);
  const reload = () => api<SavedAudience[]>('/audiences').then(setList).catch(() => undefined);
  useEffect(() => {
    reload();
  }, []);
  return { list, reload };
}

/** Baixa em CSV quem vai receber o público informado. */
export async function exportAudience(spec: AudienceSpec, filename: string) {
  const res = await fetch('/api/ixc/audience/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStore.get()}` },
    body: JSON.stringify(spec),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Falha ao exportar');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Carregar/salvar público e exportar a lista (etapa Público da campanha). */
export function AudienceToolbar({ spec, onLoad, canSave }: { spec: AudienceSpec; onLoad: (a: AudienceSpec) => void; canSave: boolean }) {
  const toast = useToast();
  const { list, reload } = useSavedAudiences();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [exporting, setExporting] = useState(false);

  const save = async () => {
    try {
      const existing = list.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) await api(`/audiences/${existing.id}`, { method: 'PATCH', body: { audience: spec } });
      else await api('/audiences', { body: { name, audience: spec } });
      toast(existing ? 'Público atualizado' : 'Público salvo');
      setSaveOpen(false);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const remove = async (a: SavedAudience) => {
    if (!confirm(`Excluir o público "${a.name}"?`)) return;
    try {
      await api(`/audiences/${a.id}`, { method: 'DELETE' });
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSave && (
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-ink-400" />
          <select
            className="input w-64"
            value=""
            onChange={(e) => {
              const a = list.find((x) => x.id === e.target.value);
              if (a) {
                onLoad(a.audience);
                setName(a.name);
                toast(`Público "${a.name}" carregado`);
              }
            }}
          >
            <option value="">{list.length ? 'Carregar público salvo…' : 'Nenhum público salvo'}</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} icon={<BookmarkPlus className="h-3.5 w-3.5" />}>
            Salvar público
          </Button>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        loading={exporting}
        onClick={async () => {
          setExporting(true);
          try {
            await exportAudience(spec, 'publico-sendtec.csv');
          } catch (e: any) {
            toast(e.message, 'error');
          } finally {
            setExporting(false);
          }
        }}
        icon={<Download className="h-3.5 w-3.5" />}
      >
        Exportar CSV
      </Button>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Salvar público">
        <div className="space-y-4">
          <p className="text-sm text-ink-300">Salva os filtros, as áreas do mapa e os clientes removidos. Ao usar de novo, a lista é buscada no IXC na hora — sempre atualizada.</p>
          <Field label="Nome" hint="Use o nome de um público existente para atualizá-lo">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Inadimplentes Martins Lage" list="saved-audiences" />
            <datalist id="saved-audiences">
              {list.map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
          </Field>
          <Button className="w-full" disabled={!name.trim()} onClick={save}>
            Salvar
          </Button>
          {list.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto border-t border-white/5 pt-3">
              {list.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.03]">
                  <span>
                    {a.name}
                    {a._count?.steps ? <span className="ml-2 text-xs text-ink-400">usado em {a._count.steps} régua(s)</span> : null}
                  </span>
                  <button onClick={() => remove(a)} className="rounded p-1 text-ink-400 hover:text-rose-300" title="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
