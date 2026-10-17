import { Bot, CheckCircle2, Pencil, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import type { Campaign, Roteiro } from '../lib/types';
import { EMPTY_SCRIPT, ScriptEditor, scriptFromServer, scriptProblem, useScriptDefaults } from './ScriptEditor';
import { Button, Card, Modal, useToast } from './ui';

/** Situação do roteiro da IA de atendimento na página da campanha (dá para editar depois do disparo). */
export function CampaignScriptCard({ campaign, onChange, labelPrefix = 'campanha' }: { campaign: Campaign; onChange: () => void; labelPrefix?: string }) {
  const toast = useToast();
  const defaults = useScriptDefaults();
  const [editing, setEditing] = useState<Roteiro | null>(null);
  const [busy, setBusy] = useState('');
  const [remote, setRemote] = useState<{ origem?: string; atualizado_em?: string; ativo?: boolean } | null | undefined>(undefined);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
      onChange();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const check = () =>
    run('check', async () => {
      const r = await api<{ remote: any }>(`/campaigns/${campaign.id}/script`);
      setRemote(r.remote);
    });

  const save = () =>
    run(
      'save',
      async () => {
        await api(`/campaigns/${campaign.id}/script`, { method: 'PUT', body: { script: { ...editing, nome: editing!.nome.trim() || campaign.name } } });
        setEditing(null);
      },
      'Roteiro salvo e enviado ao sistema de atendimento',
    );

  const remove = () => {
    if (!confirm('Remover o roteiro? Quem responder à campanha volta para o atendimento normal da IA.')) return;
    run('remove', () => api(`/campaigns/${campaign.id}/script`, { method: 'PUT', body: { script: null } }), 'Roteiro desativado');
  };

  const s = campaign.script;
  if (!s && campaign.status === 'CANCELLED') return null;
  const draft = editing ? { ...editing, nome: editing.nome || campaign.name } : null;

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-fuchsia-300">
            <Bot className="h-5 w-5" />
          </div>
          <div className="text-sm">
            <div className="font-bold">Roteiro da IA de atendimento</div>
            {s ? (
              <>
                <div className="text-ink-300">
                  {s.nome} · equipe {s.equipe} · {s.valido_ate ? `válido até ${s.valido_ate.slice(0, 10).split('-').reverse().join('/')}` : 'sem prazo'}
                  {!s.ativo && ' · inativo'}
                </div>
                {campaign.scriptError ? (
                  <div className="mt-1 flex items-start gap-1.5 text-rose-300">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {campaign.scriptError}
                  </div>
                ) : campaign.scriptSyncedAt ? (
                  <div className="mt-1 flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> Gravado no sistema de atendimento em {fmtDateTime(campaign.scriptSyncedAt)}
                  </div>
                ) : (
                  <div className="mt-1 text-amber-300">Ainda não enviado (é enviado antes do disparo)</div>
                )}
                {remote !== undefined && (
                  <div className="mt-1 text-xs text-ink-400">
                    {remote
                      ? `No atendimento: ${remote.ativo === false ? 'inativo' : 'ativo'}${remote.atualizado_em ? `, atualizado em ${fmtDateTime(remote.atualizado_em)}` : ''}${remote.origem ? ` (origem: ${remote.origem})` : ''}`
                      : 'O sistema de atendimento não tem roteiro com este código.'}
                  </div>
                )}
              </>
            ) : (
              <div className="text-ink-400">Sem roteiro: quem responder cai no atendimento normal da IA.</div>
            )}
            {campaign.code && <div className="mt-1 font-mono text-[11px] text-ink-400">etiqueta: {labelPrefix}-{campaign.code}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {s && defaults?.enabled && (
            <>
              <Button size="sm" variant="ghost" loading={busy === 'check'} onClick={check}>
                Conferir no atendimento
              </Button>
              <Button size="sm" variant="outline" loading={busy === 'sync'} onClick={() => run('sync', () => api(`/campaigns/${campaign.id}/script/sync`, { method: 'POST' }), 'Roteiro reenviado')} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                Reenviar
              </Button>
            </>
          )}
          {campaign.status !== 'CANCELLED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(scriptFromServer(s) ?? { ...EMPTY_SCRIPT, nome: campaign.name, valido_ate: defaults?.validUntil || null })}
              icon={<Pencil className="h-3.5 w-3.5" />}
            >
              {s ? 'Editar' : 'Criar roteiro'}
            </Button>
          )}
          {s && campaign.status !== 'CANCELLED' && (
            <Button size="sm" variant="ghost" loading={busy === 'remove'} onClick={remove}>
              Remover
            </Button>
          )}
        </div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Roteiro da IA de atendimento" wide>
        {draft && (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <ScriptEditor value={editing!} onChange={setEditing} context={{ campaignName: campaign.name, templateId: campaign.templateId }} />
            {scriptProblem(draft) && <p className="text-xs text-amber-300">{scriptProblem(draft)}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button loading={busy === 'save'} disabled={!!scriptProblem(draft)} onClick={save}>
                Salvar e enviar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
