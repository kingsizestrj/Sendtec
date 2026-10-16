/**
 * Catálogo de tabelas e campos do IXC exibidos no construtor de filtros.
 * Qualquer outro campo pode ser usado digitando o nome técnico ("campo personalizado").
 */
export interface FieldDef {
  field: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'enum';
  options?: { value: string; label: string }[];
  lookup?: 'cidade' | 'filial' | 'plano' | 'tipo_cliente' | 'colaborador' | 'assunto' | 'vendedor';
  ops?: string[]; // operadores permitidos (padrão: todos)
}

export interface TableDef {
  table: string;
  label: string;
  clientKey: string; // campo que aponta para o cliente
  fields: FieldDef[];
  virtual?: boolean; // filtros calculados pelo Sendtec (não é uma tabela do IXC)
}

const simNao = [
  { value: 'S', label: 'Sim' },
  { value: 'N', label: 'Não' },
];

export const IXC_TABLES: TableDef[] = [
  {
    table: 'cliente',
    label: 'Cliente',
    clientKey: 'id',
    fields: [
      { field: 'ativo', label: 'Ativo', type: 'enum', options: simNao },
      { field: 'tipo_pessoa', label: 'Tipo de pessoa', type: 'enum', options: [{ value: 'F', label: 'Física' }, { value: 'J', label: 'Jurídica' }] },
      { field: 'cidade', label: 'Cidade', type: 'enum', lookup: 'cidade' },
      { field: 'bairro', label: 'Bairro', type: 'text' },
      { field: 'endereco', label: 'Endereço', type: 'text' },
      { field: 'cep', label: 'CEP', type: 'text' },
      { field: 'filial_id', label: 'Filial', type: 'enum', lookup: 'filial' },
      { field: 'id_tipo_cliente', label: 'Tipo de cliente', type: 'enum', lookup: 'tipo_cliente' },
      { field: 'razao', label: 'Nome / Razão social', type: 'text' },
      { field: 'cnpj_cpf', label: 'CPF / CNPJ', type: 'text' },
      { field: 'data_cadastro', label: 'Data de cadastro', type: 'date' },
      { field: 'data_nascimento', label: 'Data de nascimento', type: 'date' },
      { field: 'email', label: 'E-mail', type: 'text' },
      { field: 'id_vendedor', label: 'Vendedor', type: 'enum', lookup: 'vendedor' },
      { field: 'id_condominio', label: 'ID do condomínio', type: 'number' },
      { field: 'id', label: 'ID do cliente', type: 'number' },
    ],
  },
  {
    table: 'cliente_contrato',
    label: 'Contrato',
    clientKey: 'id_cliente',
    fields: [
      {
        field: 'status',
        label: 'Status do contrato',
        type: 'enum',
        options: [
          { value: 'A', label: 'Ativo' },
          { value: 'I', label: 'Inativo' },
          { value: 'P', label: 'Pré-contrato' },
          { value: 'N', label: 'Negativado' },
          { value: 'D', label: 'Desistiu' },
        ],
      },
      {
        field: 'status_internet',
        label: 'Status da internet',
        type: 'enum',
        options: [
          { value: 'A', label: 'Ativo' },
          { value: 'D', label: 'Desativado' },
          { value: 'CM', label: 'Bloqueio manual' },
          { value: 'CA', label: 'Bloqueio automático' },
          { value: 'FA', label: 'Financeiro em atraso' },
          { value: 'AA', label: 'Aguardando assinatura' },
        ],
      },
      { field: 'id_vd_contrato', label: 'Plano', type: 'enum', lookup: 'plano' },
      { field: 'id_vendedor', label: 'Vendedor', type: 'enum', lookup: 'vendedor' },
      { field: 'fidelidade', label: 'Fidelidade (meses)', type: 'number' },
      { field: 'contrato', label: 'Nome do plano', type: 'text' },
      { field: 'num_parcelas_atraso', label: 'Parcelas em atraso', type: 'number' },
      { field: 'pago_ate_data', label: 'Pago até', type: 'date' },
      { field: 'data_ativacao', label: 'Data de ativação', type: 'date' },
      { field: 'data_expiracao', label: 'Data de expiração', type: 'date' },
      { field: 'data_cancelamento', label: 'Data de cancelamento', type: 'date' },
      { field: 'bairro', label: 'Bairro (instalação)', type: 'text' },
      { field: 'cidade', label: 'Cidade (instalação)', type: 'enum', lookup: 'cidade' },
      { field: 'id_filial', label: 'Filial do contrato', type: 'enum', lookup: 'filial' },
    ],
  },
  {
    table: 'fn_areceber',
    label: 'Financeiro',
    clientKey: 'id_cliente',
    fields: [
      {
        field: 'status',
        label: 'Status do título',
        type: 'enum',
        options: [
          { value: 'A', label: 'Aberto' },
          { value: 'R', label: 'Recebido' },
          { value: 'P', label: 'Parcial' },
          { value: 'C', label: 'Cancelado' },
        ],
      },
      { field: 'data_vencimento', label: 'Data de vencimento', type: 'date' },
      { field: 'liberado', label: 'Título liberado', type: 'enum', options: simNao },
      { field: 'valor', label: 'Valor', type: 'number' },
      { field: 'valor_aberto', label: 'Valor em aberto', type: 'number' },
      { field: 'data_emissao', label: 'Data de emissão', type: 'date' },
      { field: 'id_contrato', label: 'ID do contrato', type: 'number' },
    ],
  },
  {
    table: 'su_oss_chamado',
    label: 'Ordem de serviço',
    clientKey: 'id_cliente',
    fields: [
      {
        field: 'status',
        label: 'Status da OS',
        type: 'enum',
        options: [
          { value: 'A', label: 'Aberta' },
          { value: 'AN', label: 'Análise' },
          { value: 'EN', label: 'Encaminhada' },
          { value: 'AS', label: 'Assumida' },
          { value: 'AG', label: 'Agendada' },
          { value: 'DS', label: 'Deslocamento' },
          { value: 'EX', label: 'Em execução' },
          { value: 'F', label: 'Finalizada' },
          { value: 'RAG', label: 'Aguardando reagendamento' },
        ],
      },
      { field: 'id_tecnico', label: 'Colaborador (técnico)', type: 'enum', lookup: 'colaborador' },
      { field: 'id_assunto', label: 'Assunto', type: 'enum', lookup: 'assunto' },
      { field: 'mensagem', label: 'Mensagem da OS', type: 'text' },
      { field: 'mensagem_resposta', label: 'Mensagem de resposta/fechamento', type: 'text' },
      { field: 'data_abertura', label: 'Data de abertura', type: 'datetime' },
      { field: 'data_agenda', label: 'Data agendada', type: 'datetime' },
      { field: 'data_fechamento', label: 'Data de fechamento', type: 'datetime' },
      { field: 'bairro', label: 'Bairro da OS', type: 'text' },
      { field: 'id_cidade', label: 'Cidade da OS', type: 'enum', lookup: 'cidade' },
      { field: 'protocolo', label: 'Protocolo', type: 'text' },
      { field: 'id', label: 'Número da OS', type: 'number' },
    ],
  },
  {
    table: 'sendtec',
    label: 'Relacionamento',
    clientKey: 'id',
    virtual: true,
    fields: [
      {
        field: 'aniversario',
        label: 'Aniversário',
        type: 'enum',
        ops: ['='],
        options: [
          { value: 'hoje', label: 'Faz aniversário hoje' },
          { value: 'semana', label: 'Nos próximos 7 dias' },
          { value: 'mes', label: 'Neste mês' },
        ],
      },
      {
        field: 'pagamento',
        label: 'Histórico de pagamento',
        type: 'enum',
        ops: ['='],
        options: [
          { value: 'em_dia_6', label: 'Bom pagador (em dia nos últimos 6 meses)' },
          { value: 'em_dia_12', label: 'Bom pagador (em dia nos últimos 12 meses)' },
          { value: 'atrasou_6', label: 'Atrasou nos últimos 6 meses' },
          { value: 'atrasou_12', label: 'Atrasou nos últimos 12 meses' },
        ],
      },
      { field: 'tempo_casa', label: 'Tempo de casa (meses, pela 1ª ativação)', type: 'number', ops: ['>=', '<='] },
    ],
  },
];

/** Operadores aceitos pelo grid_param do IXC. */
export const OPERATORS = [
  { value: '=', label: 'é igual a' },
  { value: '!=', label: 'é diferente de' },
  { value: '>', label: 'maior que' },
  { value: '>=', label: 'maior ou igual a' },
  { value: '<', label: 'menor que' },
  { value: '<=', label: 'menor ou igual a' },
  { value: 'L', label: 'contém' },
  { value: 'NL', label: 'não contém' },
  { value: 'IN', label: 'é um destes' },
  { value: 'NI', label: 'não é nenhum destes' },
  { value: 'BE', label: 'entre' },
  { value: 'NBE', label: 'fora do intervalo' },
];

/** Campos disponíveis para preencher variáveis dos modelos. */
export const VARIABLE_SOURCES = [
  {
    source: 'cliente',
    label: 'Cliente',
    fields: [
      { field: 'primeiro_nome', label: 'Primeiro nome' },
      { field: 'razao', label: 'Nome completo' },
      { field: 'fantasia', label: 'Nome fantasia' },
      { field: 'cnpj_cpf', label: 'CPF / CNPJ' },
      { field: 'email', label: 'E-mail' },
      { field: 'endereco', label: 'Endereço' },
      { field: 'numero', label: 'Número' },
      { field: 'bairro', label: 'Bairro' },
      { field: 'cidade_nome', label: 'Cidade' },
      { field: 'cep', label: 'CEP' },
      { field: 'id', label: 'Código do cliente' },
    ],
  },
  {
    source: 'contrato',
    label: 'Contrato (primeiro ativo)',
    fields: [
      { field: 'contrato', label: 'Nome do plano' },
      { field: 'id', label: 'Número do contrato' },
      { field: 'data_ativacao', label: 'Data de ativação' },
    ],
  },
  {
    source: 'fatura',
    label: 'Fatura (aberta mais antiga)',
    fields: [
      { field: 'valor_aberto', label: 'Valor em aberto' },
      { field: 'valor', label: 'Valor original' },
      { field: 'data_vencimento', label: 'Vencimento' },
      { field: 'pix_copia_cola', label: 'PIX copia e cola' },
      { field: 'linha_digitavel', label: 'Linha digitável' },
      { field: 'gateway_link', label: 'Link de pagamento' },
      { field: 'id', label: 'Número da fatura' },
    ],
  },
];
