export type Role = 'ADMIN' | 'OPERATOR';
export interface User { id: string; name: string; email: string; role: Role; active?: boolean; createdAt?: string }

export interface Template {
  id: string;
  metaId: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  rejectedReason: string | null;
  qualityScore: string | null;
  components: any[];
  headerMediaId: string | null;
  headerMediaUrl?: string | null;
  updatedAt: string;
}

export type Area = { type: 'Polygon'; coordinates: number[][][] } | { type: 'Circle'; center: [number, number]; radius: number };
export interface AudienceFilter { table: string; field: string; op: string; value: string; value2?: string }
export interface AudienceSpec { filters: AudienceFilter[]; areas: Area[]; excludedClientIds: string[] }
export interface AudienceClient { id: string; name: string; phone: string | null; lat: number | null; lng: number | null; bairro: string; cidade: string; inArea: boolean }
export interface AudienceResult {
  clients: AudienceClient[];
  selected: AudienceClient[];
  stats: { matched: number; withCoords: number; inArea: number; withoutPhone: number; duplicates: number; excluded: number; selected: number };
}

export interface VariableMapping { source: 'cliente' | 'contrato' | 'fatura' | 'fixo'; field?: string; value?: string; fallback?: string; format?: string }
export interface VariablesConfig { body: Record<string, VariableMapping>; buttons?: Record<string, VariableMapping> }

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  templateId: string;
  template: Template;
  audience: AudienceSpec;
  variables: VariablesConfig;
  headerMediaUrl: string | null;
  respectOptOut: boolean;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  createdBy: { name: string };
  counts: Record<string, number>;
}

export interface Recipient {
  id: string;
  ixcClientId: string;
  name: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  chatwootConversationId: number | null;
}

export interface Catalog {
  tables: {
    table: string;
    label: string;
    virtual?: boolean;
    fields: { field: string; label: string; type: string; options?: { value: string; label: string }[]; lookup?: string; ops?: string[] }[];
  }[];
  operators: { value: string; label: string }[];
  variableSources: { source: string; label: string; fields: { field: string; label: string }[] }[];
}
