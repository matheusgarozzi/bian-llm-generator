# Execuções exploratórias de 08/11/2026

Execuções feitas fora do plano de validação do Capítulo 4, uma por Service Domain, para verificar o ciclo
seleção → prompt → LLM → validador com o modelo real. Não substituem as rodadas do plano.

Ambiente: LM Studio 0.4.28, modelo `qwen/qwen3.5-9b` em CPU (sem GPU), contexto de 32.768 tokens,
`parallel 1`, temperatura 0, top_p 1, `reasoning_effort=none`, timeout de 3.600.000 ms, sem novas tentativas de rede.
Cada arquivo é a resposta completa de `POST /api/gerar`: entrada, status, modelo e o relatório de cada tentativa.

## 7-regras (validador CONF-01 a CONF-07, commit e264880)

| Service Domain | Status | Tentativas | Tempo |
|---|---|---|---|
| Payment Rail | CONCLUIDA | 1 | 9 min 44 s |
| Party Reference Data Directory | CONCLUIDA | 1 | 6 min 49 s |
| Payment Order Initiation | CONCLUIDA | 1 | 22 min 57 s |
| Current Account | CONCLUIDA | 1 | 30 min 24 s |

## 12-regras (validador CONF-01 a CONF-12)

| Arquivo | Status | Tentativas | Motivo |
|---|---|---|---|
| PartyReferenceDataDirectory-rodada1.json | FALHA_VALIDACAO | 3 | CONF-05 nas três: atributos de enum citavam o schema do enum como fonte |
| PartyReferenceDataDirectory-rodada2.json | FALHA_INFRA | 1 | Após a correção do retorno da CONF-05: a 1ª tentativa reprovou só em CONF-09; o servidor do LLM parou na 2ª |

Os demais domínios ainda não têm execução completa com as 12 regras.
