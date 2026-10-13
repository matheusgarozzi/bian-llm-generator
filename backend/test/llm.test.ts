// Testa o cliente do LLM contra um servidor falso compatível com OpenAI.
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { setTimeout } from 'node:timers';
import { z } from 'zod';
import { ErroLLM, gerarObjeto, type LLMConfig } from '../src/llm';

type Comportamento = 'ok' | 'fora-do-schema' | 'lento' | 'erro-500';

const schema = z.object({ serviceDomain: z.string(), operacoes: z.array(z.string()) });

let comportamento: Comportamento = 'ok';
let ultimaRequisicao: Record<string, unknown> | undefined;
let chamadas = 0;

function respostaChat(conteudo: string) {
  return {
    id: 'chatcmpl-falso',
    object: 'chat.completion',
    created: 0,
    model: 'qwen/qwen3.5-9b',
    choices: [
      { index: 0, message: { role: 'assistant', content: conteudo }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
}

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (parte) => (corpo += parte));
  req.on('end', () => {
    chamadas++;
    ultimaRequisicao = JSON.parse(corpo);
    res.setHeader('content-type', 'application/json');
    if (comportamento === 'erro-500') {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: { message: 'Model not loaded' } }));
      return;
    }
    if (comportamento === 'lento') {
      setTimeout(() => res.end(JSON.stringify(respostaChat('{}'))), 1_000);
      return;
    }
    const conteudo =
      comportamento === 'ok'
        ? JSON.stringify({ serviceDomain: 'Payment Order Initiation', operacoes: ['Initiate'] })
        : JSON.stringify({ outroCampo: 42 });
    res.end(JSON.stringify(respostaChat(conteudo)));
  });
});

let config: LLMConfig;

before(async () => {
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const { port } = servidor.address() as AddressInfo;
  config = {
    baseURL: `http://127.0.0.1:${port}/v1`,
    modelo: 'qwen/qwen3.5-9b',
    temperature: 0,
    chatTemperature: 0.7,
    topP: 1,
    timeoutMs: 5_000,
    maxRetries: 0,
  };
});

after(() => {
  servidor.closeAllConnections();
  servidor.close();
});

beforeEach(() => {
  comportamento = 'ok';
  ultimaRequisicao = undefined;
  chamadas = 0;
});

async function erroDe(promessa: Promise<unknown>): Promise<ErroLLM> {
  const erro = await promessa.then(
    () => assert.fail('esperava que a chamada falhasse'),
    (e: unknown) => e,
  );
  assert.ok(erro instanceof ErroLLM, `esperava ErroLLM, veio ${String(erro)}`);
  return erro;
}

describe('gerarObjeto', () => {
  it('devolve o objeto validado e envia modelo, temperature, top_p e json_schema', async () => {
    const resultado = await gerarObjeto({ schema, prompt: 'teste', config });

    assert.deepEqual(resultado, {
      serviceDomain: 'Payment Order Initiation',
      operacoes: ['Initiate'],
    });
    assert.equal(ultimaRequisicao?.model, 'qwen/qwen3.5-9b');
    assert.equal(ultimaRequisicao?.temperature, 0);
    assert.equal(ultimaRequisicao?.top_p, 1);
    const formato = ultimaRequisicao?.response_format as { type: string };
    assert.equal(formato.type, 'json_schema');
  });

  it('acusa resposta_invalida quando o LLM foge do schema', async () => {
    comportamento = 'fora-do-schema';
    const erro = await erroDe(gerarObjeto({ schema, prompt: 'teste', config }));
    assert.equal(erro.tipo, 'resposta_invalida');
  });

  it('acusa timeout quando o LLM demora mais que o limite', async () => {
    comportamento = 'lento';
    const erro = await erroDe(
      gerarObjeto({ schema, prompt: 'teste', config: { ...config, timeoutMs: 200 } }),
    );
    assert.equal(erro.tipo, 'timeout');
  });

  it('acusa indisponivel quando o servidor responde com erro', async () => {
    comportamento = 'erro-500';
    const erro = await erroDe(gerarObjeto({ schema, prompt: 'teste', config }));
    assert.equal(erro.tipo, 'indisponivel');
  });

  it('repete a chamada conforme maxRetries antes de desistir', async () => {
    comportamento = 'erro-500';
    await erroDe(gerarObjeto({ schema, prompt: 'teste', config: { ...config, maxRetries: 1 } }));
    assert.equal(chamadas, 2);
  });

  it('acusa indisponivel quando não há servidor no endereço', async () => {
    const erro = await erroDe(
      gerarObjeto({
        schema,
        prompt: 'teste',
        config: { ...config, baseURL: 'http://127.0.0.1:1/v1' },
      }),
    );
    assert.equal(erro.tipo, 'indisponivel');
  });
});
