export interface IxcSettings {
  baseUrl: string; // ex.: https://ixc.seuprovedor.com.br
  token: string; // "id_usuario:token" gerado no IXC
  ignoreSsl: boolean;
  phoneFields: string[]; // ordem de preferência dos campos de telefone
  defaultDdd?: string;
  coordSource: 'cliente' | 'contrato'; // contrato = endereço de instalação (cai no do cliente se vazio)
}

export interface ChatwootSettings {
  baseUrl: string;
  apiToken: string;
  accountId: number;
  inboxId: number;
  webhookToken: string; // vai na URL do webhook (?token=) para validar as chamadas
  legacyParams: boolean; // formato antigo de processed_params (Chatwoot < 4.4)
  labelPrefix: string;
}

export interface MetaSettings {
  wabaId: string;
  appId: string;
  accessToken: string;
  graphVersion: string;
}

export interface GeneralSettings {
  companyName: string;
  publicUrl: string; // URL pública do Sendtec (imagens de cabeçalho precisam ser acessíveis pela Meta)
  sendRatePerSecond: number;
  optOutKeywords: string[];
  optOutReply: string;
  mapCenter: [number, number]; // [lat, lng]
  notifyPhones: string[]; // WhatsApp que recebem o resumo quando uma campanha termina
  notifyTemplateId: string; // modelo de utilidade com {{1}} usado nesses avisos
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean; // SSL direto (porta 465)
  user: string;
  pass: string;
  from: string; // ex.: "Sendtec <sendtec@seuprovedor.com.br>"
}

export interface AllSettings {
  ixc: IxcSettings;
  chatwoot: ChatwootSettings;
  meta: MetaSettings;
  general: GeneralSettings;
  smtp: SmtpSettings;
}

export const DEFAULT_SETTINGS: AllSettings = {
  ixc: { baseUrl: '', token: '', ignoreSsl: true, phoneFields: ['whatsapp', 'telefone_celular', 'fone'], defaultDdd: '', coordSource: 'cliente' },
  chatwoot: { baseUrl: '', apiToken: '', accountId: 1, inboxId: 0, webhookToken: '', legacyParams: false, labelPrefix: 'campanha' },
  meta: { wabaId: '', appId: '', accessToken: '', graphVersion: 'v21.0' },
  general: {
    companyName: 'Sendtec',
    publicUrl: '',
    sendRatePerSecond: 5,
    optOutKeywords: ['SAIR', 'PARAR', 'STOP', 'CANCELAR', 'DESCADASTRAR'],
    optOutReply: 'Pronto! Você não receberá mais nossas mensagens promocionais. 💜',
    mapCenter: [-15.78, -47.93],
    notifyPhones: [],
    notifyTemplateId: '',
  },
  smtp: { host: '', port: 587, secure: false, user: '', pass: '', from: '' },
};

/** Campos que nunca são devolvidos para o navegador em texto puro. */
export const SECRET_FIELDS: Record<keyof AllSettings, string[]> = {
  ixc: ['token'],
  chatwoot: ['apiToken'],
  meta: ['accessToken'],
  general: [],
  smtp: ['pass'],
};
