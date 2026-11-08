// Gatekeeper (CONF-01 a CONF-07) e ciclo de 3 tentativas do orquestrador, sem LLM real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexarServiceDomains, validarModeloFormal } from '../src/gatekeeper';
import { gerarModeloFormal } from '../src/orchestrator/gerar-modelo';
import { estruturarEntrada } from '../src/orchestrator/entrada';
import { SAIDA_EXEMPLO } from '../src/prompt-engine/modelo-formal';
import type { ModeloFormal } from '../src/prompt-engine/modelo-formal';

const indiceSO = indexarServiceDomains(['StandingOrder']);
const copia = (): ModeloFormal => structuredClone(SAIDA_EXEMPLO);
const regras = (m: unknown) => validarModeloFormal(m, indiceSO).violacoes.map((v) => v.regra);

test('o exemplo few-shot é aprovado em todas as regras', () => {
  const r = validarModeloFormal(SAIDA_EXEMPLO, indiceSO);
  assert.deepEqual(r.violacoes, []);
  assert.equal(r.aprovado, true);
  assert.equal(r.regrasAplicadas.length, 7);
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
  assert.deepEqual(regras(m), ['CONF-05']);
});

test('CONF-06: transição com estado não declarado', () => {
  const m = copia();
  m.maquinas_estado = [
    { entidade: 'StandingOrderFacility', campo: 'Status', estados: ['A', 'B'], transicoes: [{ de: 'A', para: 'C' }], origem: 'derivado', fonte: null },
  ];
  assert.deepEqual(regras(m), ['CONF-06']);
});

test('CONF-07: entidade que não é control record selecionado', () => {
  const m = copia();
  m.entidades[0].control_record = 'PaymentOrderInitiationTransaction';
  assert.deepEqual(regras(m), ['CONF-07']);
});

const entrada = () =>
  estruturarEntrada({ arquitetura: 'BIAN', versao: '14.0.0', serviceDomains: ['PaymentRail'], gerarFrontend: false, restricoes: [] });

test('ciclo: reprova, realimenta o motivo e aprova na 2ª tentativa', async () => {
  const prompts: string[] = [];
  const valido: ModeloFormal = {
    analise: 'ok', relacionamentos: [], maquinas_estado: [], invariantes: [], eventos_dominio: [], pontos_extensao: [], lacunas: [],
    entidades: [{ nome: 'PaymentRailOperatingSession', control_record: 'PaymentRailOperatingSession', origem: 'catalogo', fonte: 'PaymentRail#/components/schemas/PaymentRailOperatingSession', atributos: [] }],
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
