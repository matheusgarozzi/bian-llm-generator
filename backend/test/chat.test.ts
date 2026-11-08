// Testa a rota POST /api/chat contra um servidor falso compatível com OpenAI (streaming SSE).
import { montarPromptSistemaChat } from '../src/prompt-engine/chat';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { criarApp } from '../src/app';
import type { LLMConfig } from '../src/llm';

type Comportamento = 'ok' | 'erro-500';

let comportamento: Comportamento = 'ok';
let ultimaRequisicao: Record<string, unknown> | undefined;

function trechoSSE(conteudo: string | null, finishReason: string | null = null): string {
  const trecho = {
    id: 'chatcmpl-falso',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'qwen/qwen3.5-9b',
    choices: [
      {
        index: 0,
        delta: conteudo === null ? {} : { role: 'assistant', content: conteudo },
        finish_reason: finishReason,
      },
    ],
  };
  return `data: ${JSON.stringify(trecho)}\n\n`;
}

const llmFalso = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (parte) => (corpo += parte));
  req.on('end', () => {
    ultimaRequisicao = JSON.parse(corpo);
    if (comportamento === 'erro-500') {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { message: 'Model not loaded' } }));
      return;
    }
    res.setHeader('content-type', 'text/event-stream');
    for (const parte of ['<think>pensando', '...</think>', 'Olá, ', 'sou o assistente BIAN.']) {
      res.write(trechoSSE(parte));
    }
    res.write(trechoSSE(null, 'stop'));
    res.end('data: [DONE]\n\n');
  });
});

let backend: http.Server;
let urlChat: string;

before(async () => {
  await new Promise<void>((resolve) => llmFalso.listen(0, '127.0.0.1', resolve));
  const config: LLMConfig = {
    baseURL: `http://127.0.0.1:${(llmFalso.address() as AddressInfo).port}/v1`,
    modelo: 'qwen/qwen3.5-9b',
    temperature: 0,
    chatTemperature: 0.7,
    topP: 1,
    timeoutMs: 5_000,
    maxRetries: 0,
  };
  backend = criarApp(config).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => backend.once('listening', resolve));
  urlChat = `http://127.0.0.1:${(backend.address() as AddressInfo).port}/api/chat`;
});

after(() => {
  for (const servidor of [llmFalso, backend]) {
    servidor.closeAllConnections();
    servidor.close();
  }
});

beforeEach(() => {
  comportamento = 'ok';
  ultimaRequisicao = undefined;
});

const historico = [
  { id: '1', role: 'user', parts: [{ type: 'text', text: 'O que é um Service Domain?' }] },
];

// Lê o stream SSE de UI messages do AI SDK e devolve os eventos (JSON) na ordem.
async function eventosDe(resposta: Response): Promise<Array<Record<string, unknown>>> {
  const texto = await resposta.text();
  return texto
    .split('\n')
    .filter((linha) => linha.startsWith('data: ') && linha !== 'data: [DONE]')
    .map((linha) => JSON.parse(linha.slice('data: '.length)));
}

function juntar(eventos: Array<Record<string, unknown>>, tipo: string): string {
  return eventos
    .filter((e) => e.type === tipo)
    .map((e) => e.delta)
    .join('');
}

async function postarChat(corpo: unknown): Promise<Response> {
  return fetch(urlChat, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

describe('POST /api/chat', () => {
  it('devolve a resposta em streaming com o raciocínio separado do texto', async () => {
    const resposta = await postarChat({ messages: historico });

    assert.equal(resposta.status, 200);
    const eventos = await eventosDe(resposta);
    assert.equal(juntar(eventos, 'text-delta'), 'Olá, sou o assistente BIAN.');
    assert.equal(juntar(eventos, 'reasoning-delta'), 'pensando...');
  });

  it('envia o prompt de sistema, o histórico e a temperatura do chat ao LLM', async () => {
    await (await postarChat({ messages: historico })).text();

    assert.equal(ultimaRequisicao?.temperature, 0.7);
    assert.equal(ultimaRequisicao?.stream, true);
    const mensagens = ultimaRequisicao?.messages as Array<{ role: string; content: unknown }>;
    assert.equal(mensagens[0].role, 'system');
    assert.match(String(mensagens[0].content), /BIAN/);
    assert.equal(mensagens[1].role, 'user');
    assert.match(JSON.stringify(mensagens[1].content), /Service Domain/);
  });

  it('responde 400 quando o corpo não traz mensagens válidas', async () => {
    const resposta = await postarChat({ messages: [{ role: 'user' }] });
    assert.equal(resposta.status, 400);
    const corpo = (await resposta.json()) as { erro: string };
    assert.match(corpo.erro, /Mensagens inválidas/);
  });

  it('envia um evento de erro legível quando o LLM está indisponível', async () => {
    comportamento = 'erro-500';
    const eventos = await eventosDe(await postarChat({ messages: historico }));

    const erro = eventos.find((e) => e.type === 'error');
    assert.ok(erro, 'esperava um evento de erro no stream');
    assert.match(String(erro.errorText), /Não foi possível falar com o LLM/);
  });
});

it('o prompt do chat traz o catálogo real e proíbe inventar operações', () => {
  const prompt = montarPromptSistemaChat();
  assert.match(prompt, /Service Domain: PaymentRail/);
  assert.match(prompt, /Control Record: PaymentRailOperatingSession/);
  assert.match(prompt, /PaymentRailOperatingSessionStatus/);
  assert.match(prompt, /Service Operations/);
  assert.equal(prompt.includes('undefined'), false);
});
