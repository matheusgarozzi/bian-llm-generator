# Estrutura do Prompt de Geração do Modelo Formal

## 1. Objetivo e escopo

Define a organização em blocos do prompt responsável por gerar o modelo
formal de regras de negócio a partir de uma seleção de Service Domains.

Fora do escopo: os prompts de geração de código (RF011 a RF017) e de
documentação (RF018 a RF020), que terão tarefas próprias.

Requisitos atendidos: RF002 a RF006 (conteúdo gerado), RF007 e RF008
(validação e realimentação), RNF004 (custo de tokens), RNF005 (mitigação
estocástica), RNF006 (terminologia e alinhamento normativo).

## 2. Princípio central: template invariante, catálogo variável

O prompt é um template fixo. O que muda entre uma geração e outra é apenas
o conteúdo injetado no bloco de catálogo. Isso é o que permite ao mesmo
prompt operar sobre qualquer um dos 322 Service Domains do BIAN sem
reescrita, e sobre outras arquiteturas de referência no Projeto Final II.

A assertividade não vem do tamanho do prompt, vem de três mecanismos:

1. **Recorte determinístico.** O catálogo injetado é produzido por um
   condensador em código, não pelo LLM, e contém apenas os schemas
   alcançáveis a partir do control record selecionado.
2. **Citação obrigatória da fonte.** Cada elemento gerado declara de qual
   schema do YAML ele veio. Um elemento sem fonte válida é reprovado pelo
   validador sem necessidade de julgamento semântico.
3. **Fronteira explícita entre extraído e derivado.** O modelo é obrigado a
   classificar cada item, espelhando a distinção adotada na tarefa 50.

## 3. Estratégia de condensação do catálogo

Problema: `PaymentOrderInitiation.yaml` tem 176 KB e 137 schemas. Injetar o
arquivo inteiro viola o RNF004 e dilui a atenção do modelo.

Solução: pré-processamento offline que gera um **domain card** por Service
Domain, versionado no repositório junto com o hash do commit do BIAN.

Regras do condensador, aplicadas em código:

| Regra | Descrição |
|---|---|
| R1 | Partir do control record do Service Domain e seguir apenas as referências `$ref` alcançáveis a partir dele |
| R2 | Limitar a profundidade de expansão a 3 níveis; abaixo disso, manter só o nome do tipo |
| R3 | Preservar integralmente todos os enums alcançáveis, com os valores literais |
| R4 | Preservar as descrições dos campos, que carregam a semântica ISO 20022 |
| R5 | Descartar `HTTPError`, respostas de erro e schemas não alcançáveis |
| R6 | Emitir o card em YAML achatado, com o caminho canônico de cada schema como identificador estável (ex.: `PaymentOrderInitiation#/components/schemas/Amount`) |
| R7 | Registrar no card o arquivo de origem, a versão do BIAN e o commit |

Justificativa da abordagem por pré-condensação em vez de sumarização em
tempo de execução: processar contexto longo por sumarização intermediária é
uma técnica reconhecida de mitigação de alucinação, mas fazê-la offline e
de forma determinística elimina a variabilidade que uma sumarização por LLM
introduziria no baseline de validação.

Meta de tamanho: 12 a 20 KB por domain card. A verificação empírica dessa
meta é tarefa da Sprint 3.

## 4. Estrutura em blocos

Ordem deliberada: material de referência primeiro, instrução operacional
por último, já que modelos atendem com mais peso ao conteúdo final do
prompt.

### B0 — Papel e enquadramento (system)

Define o papel: tradutor estrutural de arquitetura de referência para
modelo formal de domínio. Estabelece as duas regras não negociáveis:
nada é afirmado sem fonte no catálogo, e o que for derivado precisa ser
declarado como tal.

### B1 — Catálogo (domain card)

Delimitado por tags XML, uma por Service Domain selecionado:

```
<catalogo arquitetura="BIAN" versao="14.0.0" commit="b58bf4c">
  <service_domain id="PaymentOrderInitiation" control_record="PaymentOrderInitiationTransaction">
    ...domain card condensado...
  </service_domain>
</catalogo>
```

O identificador de cada schema dentro do card é o que o modelo deve citar
no campo `fonte` da saída.

### B2 — Seleção do usuário

Não é descrição em linguagem natural. Contém a lista de Service Domains
selecionados, a opção de frontend do RF016 e, quando houver, restrições
declaradas pelo usuário sobre o domínio (ex.: moedas aceitas, limite de
valor). Restrições declaradas entram como candidatas a invariante derivada,
nunca como alteração do catálogo.

### B3 — Restrições técnicas e de conformidade

- Usar exclusivamente a terminologia do catálogo; não traduzir nem
  parafrasear nomes de schema, campo ou valor de enum (RNF006).
- Valores de enum devem ser copiados literalmente da lista fornecida.
- Não inventar campo, tipo ou valor que não esteja no bloco B1.
- Quando uma informação necessária não existir no catálogo, registrar em
  `lacunas` em vez de preencher por conhecimento próprio.
- Invariantes, transições de estado e cardinalidades são sempre `derivado`,
  porque o catálogo BIAN não declara nenhum dos três.

### B4 — Contrato de saída

JSON Schema completo, com aninhamento máximo de 3 níveis. Estrutura de alto
nível:

```
{
  "analise": "string",
  "entidades": [ { "nome", "control_record", "fonte", "origem",
                   "atributos": [ { "nome","tipo","fonte","origem","obrigatorio" } ] } ],
  "relacionamentos": [ { "de","para","papel","cardinalidade","fonte","origem" } ],
  "maquinas_estado": [ { "entidade","campo","estados","transicoes","fonte","origem" } ],
  "invariantes": [ { "id","expressao","entidades_afetadas","justificativa","origem" } ],
  "eventos_dominio": [ { "nome","gatilho","payload","fonte","origem" } ],
  "pontos_extensao": [ { "nome","alvo","motivo" } ],
  "lacunas": [ { "item","motivo" } ]
}
```

Decisões de projeto do contrato:

- **`analise` vem primeiro, de propósito.** O modelo gera da esquerda para
  a direita; um campo de raciocínio antes dos campos de resposta faz o
  raciocínio acontecer antes do compromisso, em vez de virar
  racionalização posterior. É cadeia de pensamento embutida no schema.
- **`origem` é enum fechado:** `catalogo` ou `derivado`.
- **`fonte`** é obrigatório quando `origem = catalogo` e deve conter um
  identificador presente em B1. Essa é a regra que o validador consegue
  checar sem interpretar semântica.
- **`lacunas`** dá ao modelo uma saída legítima para o que não sabe, o que
  reduz a pressão por inventar.
- Aninhamento máximo de 3 níveis, seguindo a recomendação de que schemas
  profundos aumentam a taxa de erro.

### B5 — Exemplo de referência (few-shot)

Um exemplo curto e completo, com uma entidade, um atributo, um
relacionamento e uma lacuna, mostrando a forma esperada. O exemplo usa um
Service Domain diferente do que está sendo gerado, para não induzir cópia.

### B6 — Realimentação (presente apenas nas tentativas 2 e 3)

Bloco inserido pelo orquestrador quando o validador reprova, atendendo ao
RF008:

```
<reprovacao tentativa="2" de="3">
  <regra_violada>CONF-03</regra_violada>
  <descricao>Campo 'documentNumber' não existe em PartyReferenceDataDirectory</descricao>
  <caminho>entidades[2].atributos[4]</caminho>
  <acao_esperada>Remover o campo ou substituir por PartyIdentification com
  PartyIdentificationType = Taxidentificationnumber</acao_esperada>
</reprovacao>
```

Regras deste bloco:

- Só o relatório da tentativa imediatamente anterior é enviado, não o
  histórico completo, para conter o crescimento de tokens.
- O relatório aponta o caminho JSON exato do erro.
- A saída anterior é reenviada junto, para correção pontual em vez de
  regeneração do zero.
- Após a terceira reprovação o ciclo encerra e o erro vai ao usuário
  (RF009).

### B7 — Instrução final

Posicionada por último. Reafirma em uma frase o que gerar, reafirma a
proibição de inventar e a obrigação de citar fonte, e determina que a
resposta seja exclusivamente o JSON do contrato, sem texto ao redor.

## 5. Parâmetros de inferência (RNF005)

| Parâmetro | Valor | Justificativa |
|---|---|---|
| `temperature` | 0 | Reduzir a variação natural entre execuções, condição para o plano de validação por rodadas repetidas |
| `top_p` | 1 | Evitar interação com a temperatura zero |
| Geração por schema | ativada | Usar `generateObject` do Vercel AI SDK, elevando a garantia de formato do nível de prompt para o nível de decodificação |
| `maxTokens` | a calibrar | Definir na Sprint 3, a partir do tamanho medido das saídas |

O schema permanece também no bloco B4 mesmo com geração por schema ativa.
A redundância custa poucos tokens e preserva o funcionamento caso o
provedor escolhido não suporte o recurso, ou seja trocado.

## 6. Orçamento de tokens (RNF004)

| Bloco | Estimativa | Observação |
|---|---|---|
| B0 | ~300 tokens | Fixo |
| B1 | 3.000 a 5.000 por Service Domain | Dominante; alvo de 12 a 20 KB por card |
| B2 | ~200 tokens | Variável com as restrições declaradas |
| B3 | ~400 tokens | Fixo |
| B4 | ~600 tokens | Fixo |
| B5 | ~500 tokens | Fixo |
| B6 | ~200 tokens | Só nas tentativas 2 e 3 |
| B7 | ~150 tokens | Fixo |

Com três Service Domains, a estimativa fica entre 12.000 e 18.000 tokens de
entrada por tentativa. O limite de três tentativas do RF008 torna o custo
máximo por geração previsível, que é o que o RNF004 exige.

Todas as estimativas acima são teóricas e precisam ser medidas na Sprint 3.

## 7. Ciclo completo

O desenho segue o padrão consolidado de geração estruturada:
gerar, validar, reparar, repetir, com limite de tentativas.

```
Seleção → Condensador (código) → Prompt B0..B5,B7 → LLM
   → Parsing de formato → Validação determinística (RF007)
       ├── aprovado → segue para geração de código
       └── reprovado → B6 + saída anterior → LLM (até 3x)
                        └── 3ª falha → relatório ao usuário (RF009)
```

## 8. Regras de validação derivadas desta estrutura

O contrato de saída foi desenhado para que o validador do RF007 seja
puramente estrutural, sem julgamento semântico:

| ID | Regra |
|---|---|
| CONF-01 | A saída é JSON válido e conforme ao contrato de B4 |
| CONF-02 | Todo item com `origem = catalogo` tem `fonte` preenchida |
| CONF-03 | Todo valor de `fonte` existe entre os identificadores de B1 |
| CONF-04 | Todo valor de enum pertence literalmente à lista do catálogo |
| CONF-05 | Nenhum nome de campo fora dos presentes no catálogo carrega `origem = catalogo` |
| CONF-06 | Toda invariante, transição e cardinalidade tem `origem = derivado` |
| CONF-07 | Toda entidade referencia um control record existente em B1 |

## 9. Pendências

- Medir o tamanho real dos domain cards e validar a meta de 12 a 20 KB.
- Definir se os eventos de domínio saem dos AsyncAPI 3.x, ainda não
  inspecionados, ou se ficam integralmente como derivados nesta fase.
- Calibrar `maxTokens` com saídas reais.
- O terceiro Service Domain do exemplo depende da decisão pendente sobre
  `Payment Rail` versus `Current Account`, registrada na tarefa 50.