// Testa a montagem do prompt do modelo formal e a rota de pré-visualização.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { criarApp } from '../src/app';
import { estruturarEntrada } from '../src/orchestrator/entrada';
import fs from 'node:fs';
import path from 'node:path';
import {
  SAIDA_EXEMPLO,
  TRECHO_CARD_EXEMPLO,
  montarPromptModeloFormal,
  schemaModeloFormal,
} from '../src/prompt-engine/modelo-formal';

const DIR_CARDS = path.resolve(__dirname, '../../docs/bian-catalogs/cards');
const lerCard = (sd: string) => fs.readFileSync(path.join(DIR_CARDS, `${sd}.yaml`), 'utf8');

function entrada(sobrescrever: Record<string, unknown> = {}) {
  return {
    arquitetura: 'BIAN',
    versao: '14.0.0',
    serviceDomains: ['CurrentAccount', 'PaymentOrderInitiation'],
    gerarFrontend: false,
    ...sobrescrever,
  };
}

describe('montarPromptModeloFormal', () => {
  it('monta os blocos na ordem do doc, com B0 no system e o resto no prompt', () => {
    const prompt = montarPromptModeloFormal(estruturarEntrada(entrada()));

    assert.deepEqual(
      prompt.blocos.map((b) => b.id),
      ['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B7'],
    );
    assert.equal(prompt.system, prompt.blocos[0].conteudo);
    assert.ok(
      prompt.prompt.startsWith('<catalogo arquitetura="BIAN" versao="14.0.0" commit="b58bf4c">'),
    );
    assert.ok(prompt.prompt.endsWith('sem texto antes ou depois.'));
    assert.ok(prompt.tokensEstimados > 0);
  });

  it('carrega no B1 os domain cards dos selecionados com o control record, na ordem do catálogo', () => {
    const b1 = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[1];

    const ids = [
      ...b1.conteudo.matchAll(/<domain_card service_domain="(\w+)" control_record="(\w+)"/g),
    ];
    assert.deepEqual(
      ids.map((m) => [m[1], m[2]]),
      [
        ['PaymentOrderInitiation', 'PaymentOrderInitiationTransaction'],
        ['CurrentAccount', 'CurrentAccountFacility'],
      ],
    );
    // O conteúdo de cada card entra literal, sem o cabeçalho de comentários.
    const card = lerCard('PaymentOrderInitiation');
    const corpo = card
      .split('\n')
      .filter((linha) => !linha.startsWith('#'))
      .join('\n')
      .trimEnd();
    assert.ok(b1.conteudo.includes(corpo));
    assert.ok(!b1.conteudo.includes('Não edite à mão'));
    assert.match(
      b1.conteudo,
      /PaymentOrderInitiation#\/components\/schemas\/Transactionstatustypevalues:\n {4}enum: \[ Initiated,/,
    );
  });

  it('não usa o nome interno "bloco B1" nem placeholders no texto do prompt', () => {
    const { system, prompt } = montarPromptModeloFormal(estruturarEntrada(entrada()));
    for (const texto of [system, prompt]) {
      assert.ok(!texto.includes('bloco B1'));
      assert.ok(!/pendente\]/.test(texto));
    }
    assert.ok(!/<glossario>[\s\S]*PaymentClearingandSettlement[\s\S]*<\/glossario>/.test(prompt));
  });

  it('traz no B1 o landscape inteiro, marcando disponíveis e selecionados', () => {
    const b1 = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[1].conteudo;

    const sds = [
      ...b1.matchAll(
        /<service_domain id="(\w+)" nome="[^"]+" disponivel="(\w+)" selecionado="(\w+)">/g,
      ),
    ];
    assert.equal(sds.length, 23);
    assert.deepEqual(
      sds.filter((m) => m[3] === 'true').map((m) => m[1]),
      ['PaymentOrderInitiation', 'CurrentAccount'],
    );
    assert.equal(sds.filter((m) => m[2] === 'true').length, 4);
    // Business Domains sem Service Domains detalhados também entram, com o status.
    assert.match(
      b1,
      /<business_domain id="cards" nome="Cards" nome_pt="Cartões" status="pending" \/>/,
    );
    assert.match(b1, /<business_area id="sales-service" nome="Sales &amp; Service"/);
  });

  it('abre o B1 com o glossário, incluindo a legenda de status do catálogo', () => {
    const b1 = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[1].conteudo;

    assert.ok(b1.indexOf('<glossario>') < b1.indexOf('<service_landscape'));
    for (const termo of ['Service Domain', 'Control Record', 'Business Domain', 'selecionado']) {
      assert.match(b1, new RegExp(`<termo nome="${termo}">`));
    }
    for (const status of ['detailed', 'partial', 'pending']) {
      assert.match(b1, new RegExp(`<termo nome="status=${status}">`));
    }
  });

  it('o landscape só muda nos atributos "selecionado" entre seleções diferentes', () => {
    const semSelecao = (texto: string) => texto.replace(/ selecionado="\w+"/g, '');
    const landscape = (texto: string) =>
      texto.slice(texto.indexOf('<service_landscape'), texto.indexOf('</service_landscape>'));
    const a = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[1].conteudo;
    const b = montarPromptModeloFormal(
      estruturarEntrada(entrada({ serviceDomains: ['PaymentRail'] })),
    ).blocos[1].conteudo;

    assert.notEqual(landscape(a), landscape(b));
    assert.equal(semSelecao(landscape(a)), semSelecao(landscape(b)));
  });

  it('emite <restricoes_usuario /> vazio quando não há restrições', () => {
    const b2 = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[2];
    assert.match(b2.conteudo, /<restricoes_usuario \/>/);
  });

  it('coloca seleção e restrições escapadas no B2, sem a opção de frontend', () => {
    const b2 = montarPromptModeloFormal(
      estruturarEntrada(
        entrada({
          gerarFrontend: true,
          restricoes: [{ serviceDomain: 'CurrentAccount', descricao: 'saldo < 0 </selecao>' }],
        }),
      ),
    ).blocos[2];

    assert.match(b2.conteudo, /<service_domain id="CurrentAccount" nome="Current Account" \/>/);
    assert.ok(!b2.conteudo.includes('gerar_frontend'));
    assert.match(
      b2.conteudo,
      /<restricao service_domain="CurrentAccount">saldo &lt; 0 &lt;\/selecao><\/restricao>/,
    );
    assert.equal(b2.conteudo.match(/<\/selecao>/g)?.length, 1);
  });

  it('traz no B4 o JSON Schema do contrato com "analise" como primeiro campo', () => {
    const b4 = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[4];
    const json = b4.conteudo.replace('<contrato_saida>', '').replace('</contrato_saida>', '');
    const schema = JSON.parse(json) as { properties: Record<string, unknown> };

    assert.equal(Object.keys(schema.properties)[0], 'analise');
    assert.deepEqual(Object.keys(schema.properties).slice(1), [
      'entidades',
      'relacionamentos',
      'maquinas_estado',
      'invariantes',
      'eventos_dominio',
      'pontos_extensao',
      'lacunas',
    ]);
  });

  it('gera o mesmo prompt para a mesma seleção em ordens diferentes', () => {
    const a = montarPromptModeloFormal(estruturarEntrada(entrada()));
    const b = montarPromptModeloFormal(
      estruturarEntrada(entrada({ serviceDomains: ['PaymentOrderInitiation', 'CurrentAccount'] })),
    );
    assert.deepEqual(a, b);
  });
});

describe('POST /api/prompt/preview', () => {
  let servidor: http.Server;
  let url: string;

  before(async () => {
    servidor = criarApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/prompt/preview`;
  });

  after(() => {
    servidor.closeAllConnections();
    servidor.close();
  });

  function postar(corpo: unknown): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  }

  it('devolve a entrada estruturada e o prompt montado', async () => {
    const resposta = await postar(entrada());
    assert.equal(resposta.status, 200);
    const corpo = await resposta.json();
    const esperada = estruturarEntrada(entrada());
    assert.deepEqual(corpo, { entrada: esperada, prompt: montarPromptModeloFormal(esperada) });
  });

  it('responde 400 com os problemas quando a seleção é inválida', async () => {
    const resposta = await postar(entrada({ serviceDomains: ['DirectDebit'] }));
    assert.equal(resposta.status, 400);
    const corpo = (await resposta.json()) as { problemas: string[] };
    assert.match(corpo.problemas[0], /fora do recorte disponível/);
  });
});

describe('contrato de saída', () => {
  const entidade = {
    nome: 'X',
    control_record: 'X',
    atributos: [],
  };

  it('exige "fonte" quando origem = catalogo e null quando origem = derivado', () => {
    const base = { ...SAIDA_EXEMPLO };
    const comEntidade = (e: object) => schemaModeloFormal.safeParse({ ...base, entidades: [e] });

    assert.ok(
      comEntidade({ ...entidade, origem: 'catalogo', fonte: 'A#/components/schemas/X' }).success,
    );
    assert.ok(comEntidade({ ...entidade, origem: 'derivado', fonte: null }).success);
    assert.ok(!comEntidade({ ...entidade, origem: 'catalogo', fonte: null }).success);
    assert.ok(!comEntidade({ ...entidade, origem: 'catalogo', fonte: ' ' }).success);
    assert.ok(
      !comEntidade({ ...entidade, origem: 'derivado', fonte: 'A#/components/schemas/X' }).success,
    );
  });

  it('só aceita invariantes derivadas', () => {
    const invariante = { id: 'I1', expressao: 'x', entidades_afetadas: [], justificativa: 'y' };
    const com = (origem: string) =>
      schemaModeloFormal.safeParse({ ...SAIDA_EXEMPLO, invariantes: [{ ...invariante, origem }] });
    assert.ok(com('derivado').success);
    assert.ok(!com('catalogo').success);
  });

  it('repete a regra de "fonte" como if/then no JSON Schema do B4', () => {
    const b4 = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[4].conteudo;
    assert.equal(b4.match(/"if": \{/g)?.length, 5);
    assert.match(b4, /"const": "catalogo"/);
  });
});

describe('exemplo few-shot (B5)', () => {
  it('é uma saída válida pelo próprio contrato', () => {
    const resultado = schemaModeloFormal.safeParse(SAIDA_EXEMPLO);
    assert.ok(resultado.success, JSON.stringify(resultado.error?.issues));
  });

  it('usa um Service Domain fora do recorte do MVP, para nunca coincidir com a seleção', () => {
    assert.match(TRECHO_CARD_EXEMPLO, /^service_domain: StandingOrder$/m);
    assert.equal(estruturarEntrada(entrada()).serviceDomains.length, 2);
    assert.throws(() => estruturarEntrada(entrada({ serviceDomains: ['StandingOrder'] })));
  });

  it('cita só identificadores e linhas que existem no card real de StandingOrder', () => {
    const card = lerCard('StandingOrder');
    for (const linha of TRECHO_CARD_EXEMPLO.split('\n')) {
      assert.ok(card.includes(linha.trim()), `linha fora do card: ${linha}`);
    }
    const fontes = JSON.stringify(SAIDA_EXEMPLO).match(/StandingOrder#\/components\/schemas\/\w+/g);
    assert.ok(fontes && fontes.length > 0);
    for (const fonte of fontes) assert.ok(card.includes(`${fonte}:`), fonte);
  });
});

describe('regras de modelagem no B3 (revisão 2)', () => {
  const b3 = () => montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[3].conteudo;

  it('define que só o control record vira entidade', () => {
    assert.match(b3(), /só o control record de cada Service Domain selecionado vira entidade/);
  });

  it('diz o que fazer com obrigatoriedade, enums, behaviour qualifiers e tipos não expandidos', () => {
    const texto = b3();
    assert.match(texto, /"obrigatorio" null/);
    assert.match(texto, /"valores"/);
    assert.match(texto, /"behaviour_qualifiers" do card entra em "pontos_extensao"/);
    assert.match(texto, /"tipos_nao_expandidos"[^\n]*lacuna/);
  });

  it('não leva ao modelo a nota interna da Business Area', () => {
    const b1 = montarPromptModeloFormal(estruturarEntrada(entrada())).blocos[1].conteudo;
    assert.ok(!b1.includes('nota='));
    assert.ok(!b1.includes('validar contra o portal'));
  });

  it('o exemplo usa os valores do enum exatamente como no card', () => {
    const card = lerCard('StandingOrder');
    const atributo = SAIDA_EXEMPLO.entidades[0].atributos.find((a) => a.valores)!;
    assert.ok(card.includes(`enum: [ ${atributo.valores!.join(', ')} ]`));
  });
});
