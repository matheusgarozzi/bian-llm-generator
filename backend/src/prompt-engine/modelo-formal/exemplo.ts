// Exemplo few-shot do bloco B5: entidade, atributos (um primitivo e um enum), relacionamento
// externo, ponto de extensão para o behaviour qualifier e lacunas.
// Usa StandingOrder, que está fora do recorte do MVP, para nunca coincidir com a seleção e não
// induzir cópia. Os identificadores existem em docs/bian-catalogs/cards/StandingOrder.yaml; o
// teste test/prompt.test.ts confere isso e valida a saída contra o schema do contrato.
import type { ModeloFormal } from './schema';

const FONTE = 'StandingOrder#/components/schemas/StandingOrderFacility';

// Trecho literal do card de StandingOrder.
export const TRECHO_CARD_EXEMPLO = `service_domain: StandingOrder
control_record: StandingOrderFacility
behaviour_qualifiers: [ StandingOrderPayment ]
schemas:
  ${FONTE}:
    campos:
      StandingOrderDebtorAccount: Account
      StandingOrderFrequency: Frequency
      StandingOrderStatus: Status
      StandingOrderType: Standingordertypevalues
      NumberofPayments: string(Number) — Number of the payments that will be made in completing this frequency sequence including any executed since the sequence start date.
  StandingOrder#/components/schemas/Standingordertypevalues:
    enum: [ UserDefinedStandingOrder, PredefinedStandingOrder ]`;

export const SAIDA_EXEMPLO: ModeloFormal = {
  analise:
    'StandingOrderFacility é o control record e vira a única entidade; Account e Frequency ficam como tipo de atributo. ' +
    'StandingOrderType é enum, então os valores são copiados do card. O card não declara obrigatoriedade. ' +
    'StandingOrderDebtorAccount aponta para Account sem dizer de qual Service Domain é a conta; ligar a CurrentAccount é decisão de modelagem. ' +
    'StandingOrderPayment é behaviour qualifier sem schema no card.',
  entidades: [
    {
      nome: 'StandingOrderFacility',
      control_record: 'StandingOrderFacility',
      fonte: FONTE,
      origem: 'catalogo',
      atributos: [
        {
          nome: 'StandingOrderDebtorAccount',
          tipo: 'Account',
          obrigatorio: null,
          valores: null,
          fonte: FONTE,
          origem: 'catalogo',
        },
        {
          nome: 'StandingOrderFrequency',
          tipo: 'Frequency',
          obrigatorio: null,
          valores: null,
          fonte: FONTE,
          origem: 'catalogo',
        },
        {
          nome: 'StandingOrderStatus',
          tipo: 'Status',
          obrigatorio: null,
          valores: null,
          fonte: FONTE,
          origem: 'catalogo',
        },
        {
          nome: 'StandingOrderType',
          tipo: 'Standingordertypevalues',
          obrigatorio: null,
          valores: ['UserDefinedStandingOrder', 'PredefinedStandingOrder'],
          fonte: FONTE,
          origem: 'catalogo',
        },
        {
          nome: 'NumberofPayments',
          tipo: 'string(Number)',
          obrigatorio: null,
          valores: null,
          fonte: FONTE,
          origem: 'catalogo',
        },
      ],
    },
  ],
  relacionamentos: [
    {
      de: 'StandingOrderFacility',
      para: 'CurrentAccount',
      papel: 'StandingOrderDebtorAccount',
      cardinalidade: '1..1',
      externo: true,
      fonte: null,
      origem: 'derivado',
    },
  ],
  maquinas_estado: [
    {
      entidade: 'StandingOrderFacility',
      campo: 'StandingOrderStatus',
      estados: ['Registrada', 'Ativa', 'Suspensa', 'Encerrada'],
      transicoes: [
        { de: 'Registrada', para: 'Ativa' },
        { de: 'Ativa', para: 'Suspensa' },
        { de: 'Suspensa', para: 'Ativa' },
        { de: 'Ativa', para: 'Encerrada' },
      ],
      fonte: null,
      origem: 'derivado',
    },
  ],
  invariantes: [
    {
      id: 'INV01',
      expressao: 'NumberofPayments deve ser maior que zero quando informado.',
      entidades_afetadas: ['StandingOrderFacility'],
      justificativa: 'Uma ordem permanente com sequência definida precisa de ao menos um pagamento.',
      origem: 'derivado',
    },
  ],
  eventos_dominio: [
    {
      nome: 'OrdemPermanenteAtivada',
      gatilho: 'Transição de Registrada para Ativa',
      payload: ['StandingOrderStatus', 'StandingOrderFrequency'],
      fonte: null,
      origem: 'derivado',
    },
  ],
  pontos_extensao: [
    {
      nome: 'StandingOrderPayment',
      alvo: 'StandingOrderFacility',
      motivo: 'Behaviour qualifier declarado no catálogo, sem schema detalhado no card.',
    },
  ],
  lacunas: [
    {
      item: 'Estados do ciclo de vida de StandingOrderStatus',
      motivo: 'O card não traz enum de status; os estados foram derivados.',
    },
    {
      item: 'Obrigatoriedade dos atributos',
      motivo: 'O catálogo não declara quais campos são obrigatórios.',
    },
    {
      item: 'Regra de cálculo da próxima execução a partir de StandingOrderFrequency',
      motivo: 'O card declara o campo de frequência, mas não a regra de agendamento.',
    },
  ],
};
