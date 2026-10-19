# Estrutura do Prompt de Geração do Modelo Formal

## 1. Objetivo e escopo

Define a organização em blocos do prompt responsável por gerar o modelo
formal de regras de negócio a partir de uma seleção de Service Domains.

Fora do escopo: os prompts de geração de código (RF011 a RF017) e de
documentação (RF018 a RF020), que terão tarefas próprias.

Requisitos atendidos: RF002 a RF006 (conteúdo gerado), RF008 e RF009
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

### 3.1 Implementação e medição (task #63)

O condensador é `backend/scripts/condensar-catalogo.ts`
(`npm run catalogo:condensar`). Ele lê os YAMLs OpenAPI oficiais de
`docs/bian-catalogs/oas3/`, baixados do repositório `bian-official/public`
no commit `b58bf4c2c300dd018afc084e9bb24b7adaaa3500`
(`release14.0.0/semantic-apis/oas3/yamls`), e grava um card por Service
Domain em `docs/bian-catalogs/cards/`, mais um `manifesto.json` com o
commit e os tamanhos. É determinístico: rodar de novo gera arquivos
idênticos.

Decisões tomadas ao aplicar as regras:

- **Formato compacto (R6).** Cada schema aparece pelo identificador
  canônico. Cada campo ocupa uma linha, `Campo: tipo — descrição`, em que o
  tipo é um primitivo com formato (`string(Text)`) ou o nome de outro schema
  do mesmo card. Enums vão numa lista em linha. Só isso reduz o card de
  `PaymentOrderInitiation` de 157 KB (YAML expandido) para 116 KB, sem perder
  conteúdo.
- **Enums sem a descrição por valor (R3 e R4).** No YAML oficial, a
  descrição de cada schema de enum é um parágrafo por valor
  (`Paymentpurposevalues` tem quase 10 KB). O card mantém todos os valores
  literais, mas não esse texto; as descrições de campos e de schemas
  continuam integrais. Com isso os cards grandes caem para ~45 KB. A
  constante `INCLUIR_DESCRICAO_DE_ENUM` religa o texto.
- **Behaviour qualifiers** entram só pelo nome, extraídos das tags `BQ -`
  das operações, porque não são alcançáveis por `$ref` a partir do control
  record (R1).
- **Profundidade (R2)** mantida em 3. Os schemas além do limite são listados
  em `tipos_nao_expandidos`; os enums são visitados em qualquer
  profundidade (R3).

Tamanhos medidos:

| Service Domain | Schemas | Card | ~Tokens |
|---|---|---|---|
| PaymentOrderInitiation | 110 | 48,9 KB | ~11.000 |
| CurrentAccount | 114 | 46,0 KB | ~11.800 |
| PaymentRail | 17 | 5,9 KB | ~1.500 |
| PartyReferenceDataDirectory | 12 | 4,2 KB | ~1.000 |
| StandingOrder (só few-shot) | 93 | 40,2 KB | — |

A meta de 12 a 20 KB vale para os domínios pequenos, mas não para
`PaymentOrderInitiation` e `CurrentAccount`. Nos dois, só se chega a ela
cortando conteúdo: a profundidade 2 economiza ~15% e tirar as descrições
dos campos, ~25%. As duas medidas reduzem a fidelidade, que é o mecanismo
de assertividade da seção 2. Por isso ficaram desligadas até haver medição
de qualidade com o modelo.

## 4. Estrutura em blocos

Ordem deliberada: material de referência primeiro, instrução operacional
por último, já que modelos atendem com mais peso ao conteúdo final do
prompt.

### B0 — Papel e enquadramento (system)

Define o papel: tradutor estrutural de arquitetura de referência para
modelo formal de domínio. Estabelece as duas regras não negociáveis:
nada é afirmado sem fonte em `<domain_cards>`, e o que for derivado precisa
ser declarado como tal. O texto do prompt nunca cita os nomes internos dos
blocos (B1, B4…), só as tags XML que o modelo de fato vê.

### B1 — Catálogo (glossário, landscape e domain cards)

Três partes dentro de `<catalogo>`:

1. **Glossário.** Define os termos que o modelo encontra no bloco
   (Business Area, Business Domain, Service Domain, Control Record,
   Behaviour Qualifier, domain card, os atributos `disponivel` e
   `selecionado`) e como ler o card (`schemas`, `campos`, `enum`,
   `tipos_nao_expandidos`). Traz também a legenda de `status` dos Business
   Domains, copiada de `meta.status_legend` do catálogo. Não usa exemplos
   de Service Domains específicos, para não puxar o modelo para eles.
2. **Landscape completo.** Todo o `bian_catalog.json` da task #35: as 5
   Business Areas, os 34 Business Domains (com `status`) e os 23 Service
   Domains com descrição, marcando `disponivel` (piloto do MVP) e
   `selecionado`. Entra inteiro em todo prompt para o modelo situar a
   seleção e nomear corretamente referências a domínios não selecionados.
3. **Domain cards**, um por Service Domain selecionado. Só eles são fonte
   citável.

```
<catalogo arquitetura="BIAN" versao="14.0.0" commit="b58bf4c">
  <glossario>
    <termo nome="Control Record">...</termo>
    <termo nome="status=pending">...</termo>
  </glossario>
  <service_landscape grupo_funcional_mvp="Payments">
    <business_area id="operations-execution" nome="Operations &amp; Execution" nome_pt="Operações e Execução">
      <business_domain id="payments" nome="Payments" nome_pt="Pagamentos" status="detailed">
        <service_domain id="PaymentOrderInitiation" nome="Payment Order Initiation" disponivel="true" selecionado="true">descrição</service_domain>
        ...
      </business_domain>
      <business_domain id="cards" nome="Cards" nome_pt="Cartões" status="pending" />
    </business_area>
  </service_landscape>
  <domain_cards>
    <domain_card service_domain="PaymentOrderInitiation" control_record="PaymentOrderInitiationTransaction" arquivo="PaymentOrderInitiation.yaml">
service_domain: PaymentOrderInitiation
control_record: PaymentOrderInitiationTransaction
...
schemas:
  PaymentOrderInitiation#/components/schemas/Amount:
    campos:
      AmountValue: string(Value)
      AmountCurrency: Currencycode
      ...
  PaymentOrderInitiation#/components/schemas/Transactionstatustypevalues:
    enum: [ Initiated, Executed, Cancelled, ... ]
tipos_nao_expandidos: [ ... ]
    </domain_card>
  </domain_cards>
</catalogo>
```

O card entra sem recuo e sem escape, exatamente como saiu do condensador,
só sem o cabeçalho de comentários. Recuar as ~700 linhas de um card grande
custaria cerca de 1.000 tokens.

O identificador de cada schema dentro do card é o que o modelo deve citar
no campo `fonte` da saída. O B3 deixa explícito que o landscape e o
glossário são contexto: não são fonte de campos, tipos ou enums, e só os
Service Domains com `selecionado="true"` são modelados.

Decisão e custo: incluir o landscape inteiro se afasta do recorte mínimo
da seção 2, mas o bloco é fixo (só os atributos `selecionado` mudam entre
seleções), não depende do LLM e custa cerca de 3.300 tokens medidos. Desses,
~900 são os 31 Business Domains `pending`, sem nenhum Service Domain. Uma
revisão sugeriu mandar só os Business Domains com Service Domains (Party,
Payments e Account Management). A decisão foi manter o catálogo inteiro,
porque o custo é de ~4% do prompt com os cards reais. Se a medição de
qualidade mostrar diluição de atenção, esse corte é o primeiro a fazer.
A `note` das Business Areas do JSON (ex.: "validar contra o portal antes de
citar no TCC") não entra no prompt, porque é recado para a equipe.

### B2 — Seleção do usuário

Não é descrição em linguagem natural. Contém a lista de Service Domains
selecionados e as restrições declaradas pelo usuário sobre o domínio (ex.:
moedas aceitas, limite de valor), em `<restricoes_usuario>`. Quando não há
nenhuma, a tag vai vazia (`<restricoes_usuario />`), para o modelo saber
que não há. Restrições declaradas entram como candidatas a invariante
derivada, nunca como alteração do catálogo.

A opção de frontend do RF017 faz parte da entrada, mas não entra neste
prompt: ela não afeta o modelo formal e fica para o prompt de geração de
código.

```
<selecao>
  <service_domain id="PaymentOrderInitiation" nome="Payment Order Initiation" />
  <restricoes_usuario>
    <restricao service_domain="PaymentOrderInitiation">Aceitar apenas BRL</restricao>
  </restricoes_usuario>
</selecao>
```

#### Contrato de entrada (task #63)

O bloco é preenchido a partir de `estruturarEntrada`
(`backend/src/orchestrator/entrada/`), exposta em `POST /api/generate`.
Corpo aceito (campos fora do contrato são rejeitados):

```
{
  "arquitetura": "BIAN",
  "versao": "14.0.0",
  "serviceDomains": ["PaymentOrderInitiation", "CurrentAccount"],
  "gerarFrontend": true,
  "restricoes": [
    { "serviceDomain": "PaymentOrderInitiation", "descricao": "Aceitar apenas BRL" }
  ]
}
```

Validação determinística, sem LLM, contra
`docs/bian-catalogs/bian_catalog.json`. Qualquer falha responde 400 com
uma mensagem por item:

| Regra | Rejeita |
|---|---|
| Contrato | Corpo malformado, `arquitetura` diferente de `BIAN`, campo extra (ex.: requisito em texto livre) |
| Seleção | Lista vazia; ID inexistente no catálogo; ID fora do recorte do MVP (`mvpScope.pilotServiceDomains`) |
| Versão | `versao` diferente de `meta.version` do catálogo |
| Restrições | Mais de 10; descrição vazia ou com mais de 500 caracteres; restrição ligada a domínio não selecionado |

Estrutura devolvida, em forma canônica (RNF005): duplicados removidos,
Service Domains na ordem do catálogo (Business Area > Business Domain >
Service Domain), não na ordem de clique, e restrições ordenadas por
domínio e texto. IDs e nomes são copiados literalmente do catálogo
(RNF006).

```
{
  "arquitetura": "BIAN",
  "versao": "14.0.0",
  "serviceDomains": [
    { "id": "PaymentOrderInitiation", "nome": "Payment Order Initiation",
      "controlRecord": "PaymentOrderInitiationTransaction",
      "arquivoOrigem": "PaymentOrderInitiation.yaml" },
    { "id": "CurrentAccount", "nome": "Current Account",
      "controlRecord": "CurrentAccountFacility",
      "arquivoOrigem": "CurrentAccount.yaml" }
  ],
  "gerarFrontend": true,
  "restricoes": [ ... ],
  "hash": "<sha256 da estrutura acima>"
}
```

`serviceDomains` define quais domain cards entram no B1 (`id` e
`controlRecord` preenchem a tag `<domain_card>`). O `hash` identifica
rodadas repetidas da mesma entrada no plano de validação. Os control
records não constam no JSON da task #35 e foram tirados de
`docs/modelo-dominio-bian.md`.

`GET /api/catalogo/service-domains` lista os 23 Service Domains do
catálogo, com `disponivel: true` nos quatro pilotos e `motivoIndisponivel`
nos demais, além dos Business Domains sem Service Domains detalhados, para
a tela de seleção (RF022) explicar por que cada opção está bloqueada.

### B3 — Restrições técnicas e de conformidade

- Usar exclusivamente a terminologia de `<domain_cards>`; não traduzir nem
  parafrasear nomes de schema, campo ou valor de enum (RNF006).
- Valores de enum devem ser copiados literalmente da lista do card.
- Não inventar campo, tipo ou valor que não esteja em `<domain_cards>`.
- Só identificadores de `<domain_cards>` podem ir em `fonte`; o glossário e
  o landscape são contexto.
- Quando uma informação necessária não existir em `<domain_cards>`,
  registrar em `lacunas` em vez de preencher por conhecimento próprio.
- Invariantes, transições de estado e cardinalidades são sempre `derivado`,
  porque o catálogo BIAN não declara nenhum dos três.
- Modelar apenas os Service Domains de `<selecao>`.
- **O que vira entidade:** só o control record de cada Service Domain
  selecionado, com os campos dele como atributos. Os demais schemas
  (objetos, enums, `Datetime`, `Identifier`…) aparecem só como `tipo` de
  atributo. É a mesma decisão do modelo de domínio da task #50 (uma
  entidade por control record, objetos aninhados como tipo). Deixá-la
  explícita evita que cada rodada decida de um jeito (RNF005).
- **Enums:** atributo cujo tipo é um enum do card leva os valores literais
  em `valores` (CONF-04); nos demais, `valores` é `null`.
- **Obrigatoriedade:** nenhum schema dos YAMLs oficiais tem `required` (os
  `required: true` dos arquivos são de parâmetros de rota). Por isso
  `obrigatorio` é `null`, com uma única lacuna registrando a ausência.
- **Behaviour qualifiers** do card entram em `pontos_extensao`, com `alvo` =
  control record.
- **`tipos_nao_expandidos`** podem ser usados como `tipo`, mas cada um
  usado gera uma lacuna.
- **Referência externa:** um Service Domain não selecionado entra em
  `relacionamentos`, com `para` = id do Service Domain e `externo = true`,
  sem entidades dele. A origem é `catalogo`, com `fonte` no schema que
  declara o campo de referência, só se o card disser explicitamente qual é o
  domínio de destino; caso contrário, `derivado` com `fonte` null.

### B4 — Contrato de saída

JSON Schema completo, com aninhamento máximo de 3 níveis. Estrutura de alto
nível:

```
{
  "analise": "string",
  "entidades": [ { "nome", "control_record", "fonte", "origem",
                   "atributos": [ { "nome","tipo","fonte","origem","obrigatorio","valores" } ] } ],
  "relacionamentos": [ { "de","para","papel","cardinalidade","externo","fonte","origem" } ],
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
- **`origem` é enum fechado:** `catalogo` ou `derivado`. Em `invariantes`
  só `derivado` é aceito (CONF-06).
- **`fonte`** é obrigatório quando `origem = catalogo` e deve conter um
  identificador presente em `<domain_cards>`; com `origem = derivado`, é
  `null`. Essa é a regra que o validador consegue checar sem interpretar
  semântica. Ela está no schema de duas formas: refinamento no Zod
  (`backend/src/prompt-engine/modelo-formal/schema.ts`) e `if/then/else` no
  JSON Schema do prompt, porque refinamentos do Zod não aparecem no JSON
  Schema.
- **`externo`** em `relacionamentos` marca a referência a um Service Domain
  não selecionado, para o validador não exigir que `para` seja uma entidade
  do modelo.
- **`obrigatorio`** aceita `null` (não declarado no card) e **`valores`**
  guarda os valores do enum ou `null`. Os dois são obrigatórios no JSON,
  porque vários modos de saída estruturada exigem todas as propriedades
  presentes.
- **`if/then/else`** é JSON Schema válido, mas alguns modos de saída
  estruturada o ignoram ou rejeitam. A CONF-02 precisa continuar no
  validador de qualquer jeito; hoje ela já é checada pelo refinamento do
  Zod ao fazer o parse da saída.
- **`lacunas`** dá ao modelo uma saída legítima para o que não sabe, o que
  reduz a pressão por inventar.
- Aninhamento máximo de 3 níveis, seguindo a recomendação de que schemas
  profundos aumentam a taxa de erro.

### B5 — Exemplo de referência (few-shot)

Um exemplo curto e completo, com uma entidade, um atributo, um
relacionamento e uma lacuna, mostrando a forma esperada. O exemplo usa um
Service Domain diferente do que está sendo gerado, para não induzir cópia.

Implementação (`backend/src/prompt-engine/modelo-formal/exemplo.ts`): usa
`StandingOrder`, que está fora do recorte do MVP e por isso nunca coincide
com a seleção. O bloco traz um trecho literal do card de `StandingOrder` e
a saída correspondente. A saída tem a entidade `StandingOrderFacility` e
dois atributos: `StandingOrderType`, um enum com os `valores` copiados, e
`NumberofPayments`, um primitivo. Os dois têm `obrigatorio` null. Tem
também uma referência externa a `CurrentAccount`, com origem `derivado`
porque o card só diz `Account`, o behaviour qualifier `StandingOrderPayment`
em `pontos_extensao` e duas lacunas: a obrigatoriedade e a regra de
agendamento. Os testes validam a saída contra o
próprio contrato e conferem que cada linha e cada `fonte` existem no card
real.

### B6 — Realimentação (presente apenas nas tentativas 2 e 3)

Bloco inserido pelo orquestrador quando o validador reprova, atendendo ao
RF009:

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
Valores medidos com os cards reais, estimando ~4 caracteres por token. O
tokenizador do Qwen pode contar mais em trechos com muitos identificadores.

| Bloco | Medido | Observação |
|---|---|---|
| B0 | ~90 tokens | Fixo |
| B1 (glossário e landscape) | ~3.500 tokens | Fixo; catálogo inteiro da task #35 |
| B1 (domain cards) | 1.000 a 11.800 por Service Domain | Dominante; ver a tabela da seção 3.1 |
| B2 | ~50 a 200 tokens | Variável com as restrições declaradas |
| B3 | ~330 tokens | Fixo |
| B4 | ~2.750 tokens | Fixo; JSON Schema gerado do Zod, com `if/then` |
| B5 | ~500 tokens | Fixo |
| B6 | ~200 tokens (estimado) | Só nas tentativas 2 e 3 |
| B7 | ~80 tokens | Fixo |

Prompt completo por seleção:

| Seleção | ~Tokens |
|---|---|
| PartyReferenceDataDirectory + PaymentRail | 9.900 |
| PartyReferenceDataDirectory + PaymentOrderInitiation | 20.900 |
| Os três acima | 22.400 |
| Os quatro pilotos | 34.100 |

O limite de três tentativas do RF009 torna o custo máximo por geração
previsível, que é o que o RNF004 exige. Consequência prática para o LLM
local: o *Context Length* do modelo no LM Studio precisa comportar o prompt
e a resposta. Com os quatro pilotos, isso dá pelo menos ~40 mil tokens.

## 7. Ciclo completo

O desenho segue o padrão consolidado de geração estruturada:
gerar, validar, reparar, repetir, com limite de tentativas.

```
Seleção → Condensador (código) → Prompt B0..B5,B7 → LLM
   → Parsing de formato → Validação determinística (RF008)
       ├── aprovado → segue para geração de código
       └── reprovado → B6 + saída anterior → LLM (até 3x)
                        └── 3ª falha → relatório ao usuário (RF009)
```

## 8. Regras de validação derivadas desta estrutura

O contrato de saída foi desenhado para que o validador do RF008 seja
puramente estrutural, sem julgamento semântico:

| ID | Regra |
|---|---|
| CONF-01 | A saída é JSON válido e conforme ao contrato de B4 |
| CONF-02 | Todo item com `origem = catalogo` tem `fonte` preenchida |
| CONF-03 | Todo valor de `fonte` existe entre os identificadores de B1 |
| CONF-04 | Todo item de `valores` pertence literalmente à lista do enum do card indicado em `tipo` |
| CONF-05 | Nenhum nome de campo fora dos presentes no catálogo carrega `origem = catalogo` |
| CONF-06 | Toda invariante, transição e cardinalidade tem `origem = derivado` |
| CONF-07 | Toda entidade é o control record de um Service Domain selecionado (`nome` = `control_record` do card) |

## 9. Pendências

- Rodar o prompt contra o Qwen local e medir a qualidade da saída (taxa de
  aprovação nas regras CONF). Só com isso dá para decidir se vale reduzir
  os cards grandes (profundidade 2, descrições cortadas) ou o landscape.
- Testar a geração por schema no provedor da task #65 (LM Studio). Ainda
  não foi feito porque o servidor não estava no ar na rodada de revisão.
  Saber se ele rejeita o schema com `if/then` ou só o ignora; no primeiro
  caso, a cópia enviada ao `Output.object` precisa sair sem essas chaves.
  Conferir se o LM Studio respeita o `if/then` do JSON Schema na geração
  por schema, ou se a regra de `fonte` fica só no texto e no validador.
- Definir se os eventos de domínio saem dos AsyncAPI 3.x, ainda não
  inspecionados, ou se ficam integralmente como derivados nesta fase.
- Calibrar `maxTokens` com saídas reais.

Resolvidas:

- A dúvida entre `Payment Rail` e `Current Account`, registrada na tarefa
  50, foi fechada na tarefa 44 incluindo os dois no recorte do MVP
  (relatório de revisão, seção 6).
- Medir o tamanho real dos domain cards: feito na seção 3.1. A meta de 12 a
  20 KB vale só para os domínios pequenos.