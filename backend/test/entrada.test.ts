// Testa a leitura e estruturação da entrada do usuário contra o catálogo real (docs/bian-catalogs).
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { criarApp } from '../src/app';
import { ErroEntrada, catalogoPadrao, estruturarEntrada } from '../src/orchestrator/entrada';

function entrada(sobrescrever: Record<string, unknown> = {}) {
  return {
    arquitetura: 'BIAN',
    versao: '14.0.0',
    serviceDomains: ['PaymentOrderInitiation', 'CurrentAccount'],
    gerarFrontend: true,
    ...sobrescrever,
  };
}

function problemasDe(corpo: unknown): string[] {
  try {
    estruturarEntrada(corpo);
  } catch (erro) {
    assert.ok(erro instanceof ErroEntrada, `esperava ErroEntrada, veio ${String(erro)}`);
    return erro.problemas;
  }
  assert.fail('esperava a entrada ser rejeitada');
}

describe('catálogo', () => {
  it('carrega os 23 Service Domains com os 4 pilotos disponíveis', () => {
    const catalogo = catalogoPadrao();
    assert.equal(catalogo.versao, '14.0.0');
    assert.equal(catalogo.serviceDomains.length, 23);
    assert.deepEqual(
      catalogo.serviceDomains.filter((sd) => sd.disponivel).map((sd) => sd.id),
      ['PartyReferenceDataDirectory', 'PaymentOrderInitiation', 'PaymentRail', 'CurrentAccount'],
    );
  });

  it('explica por que cada Service Domain e Business Domain está bloqueado', () => {
    const catalogo = catalogoPadrao();
    for (const sd of catalogo.serviceDomains) {
      assert.equal(Boolean(sd.motivoIndisponivel), !sd.disponivel, sd.id);
    }
    assert.match(
      catalogo.porId.get('DirectDebit')!.motivoIndisponivel!,
      /Fora do recorte do MVP\. O grupo funcional definido pelo orientador é Payments/,
    );
    const cards = catalogo.businessAreas
      .flatMap((area) => area.businessDomains)
      .find((dominio) => dominio.id === 'cards')!;
    assert.match(
      cards.motivoIndisponivel!,
      /catálogo\. Status "pending": Apenas o nome do Business Domain/,
    );
  });
});

describe('estruturarEntrada', () => {
  it('estrutura uma seleção válida com nome, control record e arquivo do catálogo', () => {
    const resultado = estruturarEntrada(entrada());

    assert.equal(resultado.arquitetura, 'BIAN');
    assert.equal(resultado.versao, '14.0.0');
    assert.equal(resultado.gerarFrontend, true);
    assert.deepEqual(resultado.restricoes, []);
    assert.deepEqual(resultado.serviceDomains, [
      {
        id: 'PaymentOrderInitiation',
        nome: 'Payment Order Initiation',
        controlRecord: 'PaymentOrderInitiationTransaction',
        arquivoOrigem: 'PaymentOrderInitiation.yaml',
      },
      {
        id: 'CurrentAccount',
        nome: 'Current Account',
        controlRecord: 'CurrentAccountFacility',
        arquivoOrigem: 'CurrentAccount.yaml',
      },
    ]);
    assert.match(resultado.hash, /^[0-9a-f]{64}$/);
  });

  it('gera saída idêntica para a mesma seleção em ordens diferentes', () => {
    const restricoes = [
      { serviceDomain: 'PaymentOrderInitiation', descricao: 'Aceitar apenas BRL' },
      { serviceDomain: 'PartyReferenceDataDirectory', descricao: 'Exigir CPF ou CNPJ' },
      { serviceDomain: 'PaymentOrderInitiation', descricao: 'Valor máximo de 10.000' },
    ];
    const a = estruturarEntrada(
      entrada({
        serviceDomains: ['PaymentRail', 'PaymentOrderInitiation', 'PartyReferenceDataDirectory'],
        restricoes,
      }),
    );
    const b = estruturarEntrada(
      entrada({
        serviceDomains: ['PartyReferenceDataDirectory', 'PaymentRail', 'PaymentOrderInitiation'],
        restricoes: [...restricoes].reverse(),
      }),
    );

    assert.deepEqual(a, b);
    assert.deepEqual(
      a.serviceDomains.map((sd) => sd.id),
      ['PartyReferenceDataDirectory', 'PaymentOrderInitiation', 'PaymentRail'],
    );
  });

  it('remove Service Domains e restrições duplicados', () => {
    const restricao = { serviceDomain: 'CurrentAccount', descricao: 'Sem cheque especial' };
    const resultado = estruturarEntrada(
      entrada({
        serviceDomains: ['CurrentAccount', 'CurrentAccount', ' CurrentAccount '],
        restricoes: [restricao, { ...restricao, descricao: ' Sem cheque especial ' }],
      }),
    );

    assert.deepEqual(
      resultado.serviceDomains.map((sd) => sd.id),
      ['CurrentAccount'],
    );
    assert.deepEqual(resultado.restricoes, [restricao]);
    assert.equal(
      resultado.hash,
      estruturarEntrada(entrada({ serviceDomains: ['CurrentAccount'], restricoes: [restricao] }))
        .hash,
    );
  });

  it('muda o hash quando a seleção muda', () => {
    const comFrontend = estruturarEntrada(entrada());
    const semFrontend = estruturarEntrada(entrada({ gerarFrontend: false }));
    assert.notEqual(comFrontend.hash, semFrontend.hash);
  });

  it('rejeita lista vazia', () => {
    const problemas = problemasDe(entrada({ serviceDomains: [] }));
    assert.deepEqual(problemas, ['serviceDomains: Selecione ao menos um Service Domain']);
  });

  it('rejeita ID inexistente e domínio fora do recorte, com uma mensagem por item', () => {
    const problemas = problemasDe(
      entrada({ serviceDomains: ['PaymentRail', 'Inexistente', 'DirectDebit'] }),
    );
    assert.equal(problemas.length, 2);
    assert.match(problemas[0], /"Inexistente" não existe no catálogo BIAN 14\.0\.0/);
    assert.match(problemas[1], /"DirectDebit" está fora do recorte disponível/);
  });

  it('rejeita versão diferente da do catálogo', () => {
    const problemas = problemasDe(entrada({ versao: '13.0.0' }));
    assert.deepEqual(problemas, ['versao: "13.0.0" difere da versão do catálogo (14.0.0)']);
  });

  it('rejeita restrição ligada a um domínio não selecionado', () => {
    const problemas = problemasDe(
      entrada({ restricoes: [{ serviceDomain: 'PaymentRail', descricao: 'Só PIX' }] }),
    );
    assert.deepEqual(problemas, [
      'restricoes: "PaymentRail" não está entre os Service Domains selecionados',
    ]);
  });

  it('rejeita corpo malformado e campos fora do contrato', () => {
    assert.ok(problemasDe(undefined).length > 0);
    assert.ok(
      problemasDe(entrada({ serviceDomains: 'PaymentRail' }))[0].startsWith('serviceDomains:'),
    );
    assert.ok(problemasDe(entrada({ gerarFrontend: 'sim' }))[0].startsWith('gerarFrontend:'));
    assert.ok(problemasDe(entrada({ arquitetura: 'TOGAF' }))[0].startsWith('arquitetura:'));
    assert.ok(problemasDe(entrada({ requisitos: 'quero um sistema de PIX' })).length > 0);
    assert.ok(
      problemasDe(
        entrada({ restricoes: [{ serviceDomain: 'CurrentAccount', descricao: 'x'.repeat(501) }] }),
      )[0].startsWith('restricoes.0.descricao:'),
    );
  });
});

describe('rotas da entrada', () => {
  let servidor: http.Server;
  let base: string;

  before(async () => {
    servidor = criarApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  after(() => {
    servidor.closeAllConnections();
    servidor.close();
  });

  function postar(corpo: string): Promise<Response> {
    return fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: corpo,
    });
  }

  it('POST /api/generate devolve a entrada estruturada', async () => {
    const resposta = await postar(JSON.stringify(entrada()));
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), estruturarEntrada(entrada()));
  });

  it('POST /api/generate responde 400 com os problemas por item', async () => {
    const resposta = await postar(JSON.stringify(entrada({ serviceDomains: ['Inexistente'] })));
    assert.equal(resposta.status, 400);
    const corpo = (await resposta.json()) as { erro: string; problemas: string[] };
    assert.equal(corpo.erro, 'Entrada inválida');
    assert.match(corpo.problemas[0], /"Inexistente" não existe/);
  });

  it('POST /api/generate responde 400 em JSON quando o corpo não é JSON', async () => {
    const resposta = await postar('{"serviceDomains": [');
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), { erro: 'Corpo da requisição não é um JSON válido' });
  });

  it('GET /api/catalogo/service-domains lista o catálogo marcando os disponíveis', async () => {
    const resposta = await fetch(`${base}/api/catalogo/service-domains`);
    assert.equal(resposta.status, 200);
    const corpo = (await resposta.json()) as {
      versao: string;
      serviceDomains: Array<{ id: string; disponivel: boolean; motivoIndisponivel?: string }>;
      businessDomainsSemDetalhe: Array<{ id: string; motivoIndisponivel: string }>;
    };
    assert.equal(corpo.versao, '14.0.0');
    assert.equal(corpo.serviceDomains.length, 23);
    assert.equal(corpo.serviceDomains.filter((sd) => sd.disponivel).length, 4);
    assert.ok(
      corpo.serviceDomains.filter((sd) => !sd.disponivel).every((sd) => sd.motivoIndisponivel),
    );
    assert.equal(corpo.businessDomainsSemDetalhe.length, 31);
    assert.ok(corpo.businessDomainsSemDetalhe.every((dominio) => dominio.motivoIndisponivel));
  });
});
