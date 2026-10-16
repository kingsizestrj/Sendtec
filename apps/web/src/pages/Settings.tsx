import { CheckCircle2, Copy, Database, Globe, MessagesSquare, PlugZap, Save, XCircle } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, Field, PageHeader, Spinner, Toggle, useToast } from '../components/ui';

type S = any;

function Section({ icon, title, subtitle, children, onTest, testing, result }: {
  icon: ReactNode; title: string; subtitle: string; children: ReactNode; onTest?: () => void; testing?: boolean; result?: any;
}) {
  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-fuchsia-300">{icon}</div>
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="text-sm text-ink-300">{subtitle}</p>
          </div>
        </div>
        {onTest && (
          <Button variant="outline" size="sm" loading={testing} onClick={onTest} icon={<PlugZap className="h-3.5 w-3.5" />}>
            Testar conexão
          </Button>
        )}
      </div>
      {result && (
        <div className={`mb-5 flex items-start gap-2 rounded-xl p-3 text-sm ${result.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>
          {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <span>{result.message}</span>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<S | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [results, setResults] = useState<Record<string, any>>({});

  useEffect(() => {
    api('/settings').then(setS);
  }, []);
  if (!s) return <Spinner className="mx-auto mt-24 h-8 w-8" />;

  const set = (section: string, key: string, value: unknown) => setS({ ...s, [section]: { ...s[section], [key]: value } });

  const save = async () => {
    setSaving(true);
    try {
      setS(await api('/settings', { method: 'PUT', body: s }));
      toast('Configurações salvas');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async (target: string) => {
    setTesting(target);
    try {
      await api('/settings', { method: 'PUT', body: s });
      const r = await api('/settings/test', { body: { target } });
      let message = r.error;
      if (r.ok && target === 'ixc') message = `Conectado! ${r.totalClientes.toLocaleString('pt-BR')} clientes no IXC.`;
      if (r.ok && target === 'meta') message = `Conectado à conta "${r.name}".${r.appIdHint ? ` App ID deste token: ${r.appIdHint} (preencha o campo para enviar imagens).` : ''}`;
      if (r.ok && target === 'chatwoot') {
        message = !r.inboxFound
          ? `Conectado, mas a caixa ${s.chatwoot.inboxId} não foi encontrada. Disponíveis: ${r.inboxes.map((i: any) => `${i.id} - ${i.name}`).join(', ')}`
          : r.inboxIsWhatsapp
            ? `Conectado! Caixa de entrada do WhatsApp encontrada${r.templates !== null ? ` com ${r.templates} modelo(s) sincronizado(s)` : ''}.`
            : 'Conectado, mas a caixa escolhida não é do canal WhatsApp Cloud.';
        if (!r.inboxFound || !r.inboxIsWhatsapp) r.ok = false;
      }
      setResults({ ...results, [target]: { ok: r.ok, message } });
    } catch (e: any) {
      setResults({ ...results, [target]: { ok: false, message: e.message } });
    } finally {
      setTesting('');
    }
  };

  const webhookUrl = `${(s.general.publicUrl || window.location.origin).replace(/\/+$/, '')}/api/webhooks/chatwoot?token=${s.chatwoot.webhookToken}`;

  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="Integrações com IXC, Chatwoot e Meta"
        actions={
          <Button loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>
            Salvar tudo
          </Button>
        }
      />
      <div className="space-y-6">
        <Section icon={<Database className="h-5 w-5" />} title="IXC Provedor" subtitle="Fonte dos clientes, contratos e faturas" onTest={() => test('ixc')} testing={testing === 'ixc'} result={results.ixc}>
          <Field label="URL do IXC" hint="Ex.: https://ixc.seuprovedor.com.br">
            <input className="input" value={s.ixc.baseUrl} onChange={(e) => set('ixc', 'baseUrl', e.target.value)} />
          </Field>
          <Field label="Token da API" hint='Formato "id:token" (Configurações > Usuários > Token no IXC)'>
            <input className="input" type="password" value={s.ixc.token} onChange={(e) => set('ixc', 'token', e.target.value)} />
          </Field>
          <Field label="Campos de telefone (ordem de preferência)" hint="Separados por vírgula">
            <input className="input" value={s.ixc.phoneFields.join(', ')} onChange={(e) => set('ixc', 'phoneFields', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          </Field>
          <Field label="DDD padrão" hint="Usado quando o telefone foi cadastrado sem DDD">
            <input className="input" maxLength={2} value={s.ixc.defaultDdd ?? ''} onChange={(e) => set('ixc', 'defaultDdd', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Coordenadas usadas no mapa" hint="O contrato guarda o endereço de instalação; sem coordenadas nele, usa as do cliente">
            <select className="input" value={s.ixc.coordSource ?? 'cliente'} onChange={(e) => set('ixc', 'coordSource', e.target.value)}>
              <option value="cliente">Cadastro do cliente</option>
              <option value="contrato">Endereço de instalação (contrato)</option>
            </select>
          </Field>
          <Toggle checked={s.ixc.ignoreSsl} onChange={(v) => set('ixc', 'ignoreSsl', v)} label="Aceitar certificado SSL próprio (autoassinado)" />
        </Section>

        <Section icon={<MessagesSquare className="h-5 w-5" />} title="Chatwoot" subtitle="As mensagens saem pela caixa do WhatsApp e ficam registradas nas conversas" onTest={() => test('chatwoot')} testing={testing === 'chatwoot'} result={results.chatwoot}>
          <Field label="URL do Chatwoot">
            <input className="input" value={s.chatwoot.baseUrl} onChange={(e) => set('chatwoot', 'baseUrl', e.target.value)} />
          </Field>
          <Field label="Token de acesso" hint="Perfil > Token de acesso (de um administrador ou bot de agente)">
            <input className="input" type="password" value={s.chatwoot.apiToken} onChange={(e) => set('chatwoot', 'apiToken', e.target.value)} />
          </Field>
          <Field label="ID da conta">
            <input className="input" type="number" value={s.chatwoot.accountId} onChange={(e) => set('chatwoot', 'accountId', Number(e.target.value))} />
          </Field>
          <Field label="ID da caixa de entrada do WhatsApp" hint='O "Testar conexão" lista as caixas disponíveis'>
            <input className="input" type="number" value={s.chatwoot.inboxId} onChange={(e) => set('chatwoot', 'inboxId', Number(e.target.value))} />
          </Field>
          <Field label="Prefixo da etiqueta">
            <input className="input" value={s.chatwoot.labelPrefix} onChange={(e) => set('chatwoot', 'labelPrefix', e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Toggle checked={s.chatwoot.legacyParams} onChange={(v) => set('chatwoot', 'legacyParams', v)} label="Formato antigo de parâmetros (Chatwoot anterior à 4.4)" />
          </div>
          <div className="md:col-span-2">
            <span className="label">URL do webhook (cadastre no Chatwoot)</span>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={webhookUrl} />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast('URL copiada');
                }}
                icon={<Copy className="h-4 w-4" />}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              No Chatwoot: Configurações → Integrações → Webhooks → Adicionar. Marque "Mensagem criada" e "Mensagem atualizada". É por ele que chegam as entregas, leituras e descadastros.
            </p>
          </div>
        </Section>

        <Section icon={<PlugZap className="h-5 w-5" />} title="Meta — WhatsApp Business" subtitle="Usado para criar modelos e acompanhar a aprovação" onTest={() => test('meta')} testing={testing === 'meta'} result={results.meta}>
          <Field label="ID da conta do WhatsApp Business (WABA)">
            <input className="input" value={s.meta.wabaId} onChange={(e) => set('meta', 'wabaId', e.target.value)} />
          </Field>
          <Field label="ID do aplicativo (App ID)" hint="Necessário para enviar imagens de modelo">
            <input className="input" value={s.meta.appId} onChange={(e) => set('meta', 'appId', e.target.value)} />
          </Field>
          <Field label="Token permanente (usuário do sistema)" hint="Permissões: whatsapp_business_management e whatsapp_business_messaging">
            <input className="input" type="password" value={s.meta.accessToken} onChange={(e) => set('meta', 'accessToken', e.target.value)} />
          </Field>
          <Field label="Versão da Graph API">
            <input className="input" value={s.meta.graphVersion} onChange={(e) => set('meta', 'graphVersion', e.target.value)} />
          </Field>
        </Section>

        <Section icon={<Globe className="h-5 w-5" />} title="Geral" subtitle="Envio, descadastro e aparência">
          <Field label="Nome da empresa">
            <input className="input" value={s.general.companyName} onChange={(e) => set('general', 'companyName', e.target.value)} />
          </Field>
          <Field label="URL pública do Sendtec" hint="A Meta baixa as imagens de cabeçalho por esta URL — precisa ser acessível pela internet (HTTPS)">
            <input className="input" value={s.general.publicUrl} onChange={(e) => set('general', 'publicUrl', e.target.value)} placeholder="https://sendtec.seuprovedor.com.br" />
          </Field>
          <Field label="Mensagens por segundo" hint="Recomendado: 1 a 10. Valores altos podem afetar a qualidade do número.">
            <input className="input" type="number" min={0.2} max={50} step={0.1} value={s.general.sendRatePerSecond} onChange={(e) => set('general', 'sendRatePerSecond', Number(e.target.value))} />
          </Field>
          <Field label="Palavras de descadastro" hint="Separadas por vírgula; maiúsculas e acentos são ignorados">
            <input className="input" value={s.general.optOutKeywords.join(', ')} onChange={(e) => set('general', 'optOutKeywords', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          </Field>
          <Field label="Resposta automática ao descadastro" className="md:col-span-2" hint="Deixe em branco para não responder">
            <input className="input" value={s.general.optOutReply} onChange={(e) => set('general', 'optOutReply', e.target.value)} />
          </Field>
          <Field label="Centro do mapa (latitude, longitude)">
            <input
              className="input"
              defaultValue={s.general.mapCenter.join(', ')}
              onBlur={(e) => {
                const [lat, lng] = e.target.value.split(',').map((x) => Number(x.trim()));
                if (Number.isFinite(lat) && Number.isFinite(lng)) set('general', 'mapCenter', [lat, lng]);
              }}
            />
          </Field>
        </Section>
      </div>
    </>
  );
}
