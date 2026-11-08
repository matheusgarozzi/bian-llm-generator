// Gatekeeper (CONF-01 a CONF-07) e ciclo de 3 tentativas do orquestrador, sem LLM real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexarCards, indexarServiceDomains, validarModeloFormal } from '../src/gatekeeper';
import { gerarModeloFormal } from '../src/orchestrator/gerar-modelo';
import { estruturarEntrada } from '../src/orchestrator/entrada';
import { SAIDA_EXEMPLO, TRECHO_CARD_EXEMPLO } from '../src/prompt-engine/modelo-formal';
import { lerDomainCard } from '../src/prompt-engine/modelo-formal/cards';
import { parse } from 'yaml';
import type { ModeloFormal } from '../src/prompt-engine/modelo-formal';

const indiceSO = indexarCards([TRECHO_CARD_EXEMPLO]);
const copia = (): ModeloFormal => structuredClone(SAIDA_EXEMPLO);
const regras = (m: unknown) => validarModeloFormal(m, indiceSO).violacoes.map((v) => v.regra);

test('o exemplo few-shot é aprovado em todas as regras', () => {
  const r = validarModeloFormal(SAIDA_EXEMPLO, indiceSO);
  assert.deepEqual(r.violacoes, []);
  assert.equal(r.aprovado, true);
  assert.equal(r.regrasAplicadas.length, 12);
});

test('CONF-01: JSON fora do contrato', () => {
  assert.deepEqual([...new Set(regras({ entidades: 'x' }))], ['CONF-01']);
});

test('CONF-02: item de catálogo sem fonte', () => {
  const m = copia();
  m.entidades[0].atributos[0].fonte = null;
  assert.ok(regras(m).includes('CONF-02'));
});

test('CONF-03: fonte inventada', () => {
  const m = copia();
  m.entidades[0].fonte = 'StandingOrder#/components/schemas/NaoExiste';
  assert.deepEqual(regras(m), ['CONF-03']);
});

test('CONF-04: valor de enum inventado', () => {
  const m = copia();
  const comEnum = m.entidades[0].atributos.find((a) => a.valores)!;
  comEnum.valores = [...comEnum.valores!, 'ValorInventado'];
  assert.deepEqual(regras(m), ['CONF-04']);
});

test('CONF-05: campo fora do card marcado como catálogo', () => {
  const m = copia();
  const attr = m.entidades[0].atributos.find((a) => a.origem === 'catalogo')!;
  attr.nome = 'documentNumber';
  assert.ok(regras(m).includes('CONF-05'));
});

test('CONF-06: transição com estado não declarado', () => {
  const m = copia();
  m.maquinas_estado = [
    { entidade: 'StandingOrderFacility', campo: 'StandingOrderStatus', estados: ['A', 'B'], transicoes: [{ de: 'A', para: 'C' }], origem: 'derivado', fonte: null },
  ];
  assert.deepEqual(regras(m), ['CONF-06']);
});

test('CONF-07: entidade que não é control record selecionado', () => {
  const m = copia();
  m.entidades[0].control_record = 'PaymentOrderInitiationTransaction';
  assert.ok(regras(m).includes('CONF-07'));
});

const entrada = () =>
  estruturarEntrada({ arquitetura: 'BIAN', versao: '14.0.0', serviceDomains: ['PaymentRail'], gerarFrontend: false, restricoes: [] });

test('ciclo: reprova, realimenta o motivo e aprova na 2ª tentativa', async () => {
  const prompts: string[] = [];
  const fonte = 'PaymentRail#/components/schemas/PaymentRailOperatingSession';
  const entidade = 'PaymentRailOperatingSession';
  const campos = Object.entries(parse(lerDomainCard('PaymentRail')).schemas[fonte].campos as Record<string, string>);
  const valido: ModeloFormal = {
    analise: 'ok', pontos_extensao: [], lacunas: [],
    entidades: [{ nome: entidade, control_record: entidade, origem: 'catalogo', fonte,
      atributos: campos.map(([nome, tipo]) => ({ nome, tipo, obrigatorio: null, valores: null, fonte, origem: 'catalogo' as const })) }],
    relacionamentos: [{ de: entidade, para: 'PartyReferenceDataDirectory', papel: 'Provedor', cardinalidade: '1..1', externo: true, fonte: null, origem: 'derivado' }],
    maquinas_estado: [{ entidade, campo: 'PaymentRailOperatingSessionStatus', estados: ['Aberta', 'Fechada'], transicoes: [{ de: 'Aberta', para: 'Fechada' }], fonte: null, origem: 'derivado' }],
    invariantes: [{ id: 'INV01', expressao: 'PaymentRailOperatingSessionReference é único.', entidades_afetadas: [entidade], justificativa: 'x', origem: 'derivado' }],
    eventos_dominio: [{ nome: 'SessaoFechada', gatilho: 'Aberta para Fechada', payload: ['PaymentRailOperatingSessionReference'], fonte: null, origem: 'derivado' }],
  };
  const invalido = structuredClone(valido);
  invalido.entidades[0].fonte = 'PaymentRail#/components/schemas/Inventado';
  let n = 0;
  const r = await gerarModeloFormal(entrada(), async ({ prompt }) => { prompts.push(prompt); return n++ === 0 ? invalido : valido; });
  assert.equal(r.status, 'CONCLUIDA');
  assert.equal(r.tentativas.length, 2);
  assert.match(prompts[1], /<reprovacao tentativa="2" de="3">/);
  assert.match(prompts[1], /CONF-03/);
});

test('ciclo: encerra com FALHA_VALIDACAO após 3 reprovações', async () => {
  const r = await gerarModeloFormal(entrada(), async () => ({ lixo: true }));
  assert.equal(r.status, 'FALHA_VALIDACAO');
  assert.equal(r.tentativas.length, 3);
});

test('ciclo: erro de conexão vira FALHA_INFRA sem novas tentativas', async () => {
  const r = await gerarModeloFormal(entrada(), async () => { throw new Error('fetch failed'); });
  assert.equal(r.status, 'FALHA_INFRA');
  assert.equal(r.tentativas.length, 0);
});

test('CONF-08: campo do control record omitido', () => {
  const m = copia();
  m.entidades[0].atributos = m.entidades[0].atributos.filter((a) => a.nome !== 'StandingOrderFrequency');
  assert.deepEqual(regras(m), ['CONF-08']);
});

test('CONF-09: sem máquina de estados', () => {
  const m = copia();
  m.maquinas_estado = [];
  assert.deepEqual(regras(m), ['CONF-09']);
});

test('CONF-09: máquina sobre campo que não é de status', () => {
  const m = copia();
  m.maquinas_estado[0].campo = 'DateType';
  assert.ok(regras(m).includes('CONF-09'));
});

test('CONF-10: sem eventos e payload fora do card', () => {
  const m = copia();
  m.eventos_dominio[0].payload = ['CampoInventado'];
  assert.deepEqual(regras(m), ['CONF-10']);
  m.eventos_dominio = [];
  assert.deepEqual(regras(m), ['CONF-10']);
});

test('CONF-11: relacionamento com o próprio domínio selecionado', () => {
  const m = copia();
  m.relacionamentos[0].para = 'StandingOrder';
  assert.deepEqual(regras(m), ['CONF-11']);
});

test('CONF-12: invariante citando campo inexistente', () => {
  const m = copia();
  m.invariantes[0].expressao = 'SessionDuration deve ser positiva.';
  assert.deepEqual(regras(m), ['CONF-12']);
});

test('CONF-12: entidade sem invariante', () => {
  const m = copia();
  m.invariantes = [];
  assert.deepEqual(regras(m), ['CONF-12']);
});
