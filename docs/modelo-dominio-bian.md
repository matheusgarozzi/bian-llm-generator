Mapeamento de Entidades, Atributos e Relacionamentos

## Método e proveniência

Fonte: repositório oficial `bian-official/public`, pasta `release14.0.0`,
subpasta `semantic-apis/oas3 /yamls` (o espaço no nome da pasta é literal e
exige aspas na linha de comando).

- Commit: `b58bf4c2c300dd018afc084e9bb24b7adaaa3500` (`refs/heads/main`)
- Data da extração: 27/09/2026
- Especificações OpenAPI 3.0.1, versão 14.0.0, licença Apache 2.0

Observação sobre o repositório: não existe tag nem branch `release14.0.0`.
O repositório tem apenas `main`, e as releases são pastas dentro dele.
Clonar por tag falha.

Cada atributo abaixo traz duas colunas de classificação:

- **Origem.** `Catálogo` quando o atributo existe no schema BIAN indicado;
  `Derivado` quando foi acrescentado pela equipe, com justificativa.
- **Obrigatório.** Sim ou não. **Esta coluna é inteiramente derivada.**
  Nenhum schema do BIAN 14.0.0 declara `required`, então toda
  obrigatoriedade registrada aqui é decisão de modelagem do projeto, não
  exigência do catálogo.

Service Domains selecionados para o MVP:

| Service Domain | Arquivo | Control Record | Paths | Schemas |
|---|---|---|---|---|
| Payment Order Initiation | `PaymentOrderInitiation.yaml` | `PaymentOrderInitiationTransaction` | 7 | 137 |
| Payment Rail | `PaymentRail.yaml` | `PaymentRailOperatingSession` | 36 | 36 |
| Party Reference Data Directory | `PartyReferenceDataDirectory.yaml` | `PartyReferenceDataDirectoryEntry` | 17 | 67 |

Referenciado por ID, fora da seleção: **Current Account**
(`CurrentAccount.yaml`, control record `CurrentAccountFacility`).

---

## 1. PaymentOrderInitiationTransaction

Raiz de agregado. Descrição oficial do Service Domain: captura os dados do
pagador e do recebedor e as demais propriedades do pagamento, e inicia a
orquestração da transação, com suporte a pagamentos recorrentes e agendados.

| Atributo | Tipo BIAN | Origem | Obrigatório | Observação |
|---|---|---|---|---|
| `PaymentTransactionType` | `Transactiontypevalues` | Catálogo | Sim | Enum: FinancialTransaction, BusinessTransaction, BankingTransaction, AccountingTransaction, BookingTransaction, AllocationTransaction, DeliveryTransaction, ProductionTransaction |
| `PaymentTransaction` | `PaymentTransaction` | Catálogo | Sim | Objeto aninhado com 30 propriedades; o MVP usa o subconjunto abaixo |
| `CustomerReference` | `Involvedparty` | Catálogo | Sim | Cliente que origina a ordem |
| `PayerReference` | `Payer` | Catálogo | Sim | Referência ao pagador |
| `PayerBankReference` | `PayerBank` | Catálogo | Não | |
| `PayeeReference` | `Payee` | Catálogo | Sim | Referência ao recebedor |
| `PayeeBankReference` | `PayeeBank` | Catálogo | Não | |
| `PayerProductInstanceReference` | `ProductAgreement` | Catálogo | Sim | Conta de origem, referência ao domínio Current Account |
| `PayeeProductInstanceReference` | `ProductAgreement` | Catálogo | Não | Conta de destino |
| `Amount` | `Amount` | Catálogo | Sim | Objeto: `AmountValue`, `AmountCurrency`, `DecimalPointPosition`, `AmountType` |
| `Currency` | `Currencycode` | Catálogo | Sim | Código ISO 4217, três letras |
| `Date` | `Datetime` | Catálogo | Sim | Objeto: `DateTimeContent`, `TimeZoneCode`, `DaylightSavingIndicator`, `DateTimeType` |
| `DateType` | `Datetimetypevalues` | Catálogo | Não | |
| `PaymentMechanism` | `Paymentmechanismtypevalues` | Catálogo | Sim | Enum com apenas dois valores no 14.0.0: `ACH` e `SWIFT` |
| `PaymentPurpose` | `string` (format Text) | Catálogo | Não | Capturado para fins de referência e conformidade |
| `PaymentFeesCharges` | `FeeArrangement` | Catálogo | Não | Fora do escopo do MVP |
| `RecurringPaymentRecord` | `PaymentArrangement` | Catálogo | Não | Fora do escopo do MVP |

Subconjunto usado de `PaymentTransaction`:

| Atributo | Tipo BIAN | Origem | Obrigatório |
|---|---|---|---|
| `PaymentTransactionIdentification` | `Paymentidentification` → `Identifier` | Catálogo | Sim |
| `PaymentTransactionAmount` | `Amount` | Catálogo | Sim |
| `PaymentTransactionCurrency` | `Currencytypevalues` | Catálogo | Sim |
| `PaymentTransactionStatus` | `Paymenttransactionstatus` | Catálogo | Sim |
| `PaymentTransactionDatetime` | `Paymentdatetime` | Catálogo | Não |
| `PaymentTransactionCreditDebitIndicator` | `Debitcreditindicatortvalues` | Catálogo | Não |
| `TransactionStatus` | `Transactionstatus` → `Transactionstatustypevalues` | Catálogo | Sim |

---

## 2. PaymentRailOperatingSession

Raiz de agregado do Service Domain Payment Rail. Descrição oficial: trata da
interface operacional com provedores de serviço de pagamento, formatando
transações de saída e roteando as de entrada durante sessões operacionais
agendadas.

**Correção de entendimento:** este control record modela a *sessão
operacional* do trilho, não um pagamento individual. Não existe status de
compensação por pagamento no catálogo.

| Atributo | Tipo BIAN | Origem | Obrigatório | Observação |
|---|---|---|---|---|
| `PaymentRailOperatingSessionReference` | `Session` | Catálogo | Sim | Identificação da sessão |
| `PaymentRailOperatingSessionType` | `Sessiontype` | Catálogo | Sim | |
| `PaymentRailOperatingSessionStatus` | `Status` | Catálogo | Sim | Objeto: `StatusReason`, `StatusDateTime`, `StatusValidityPeriod`, `StatusInvolvedPartyReference` |
| `PaymentRailOperatingSessionSchedule` | `Schedule` | Catálogo | Sim | Janela operacional do trilho |
| `PaymentRailOperatingSessionServiceProviderReference` | `Involvedparty` | Catálogo | Sim | Provedor do trilho |
| `PaymentRailOperatingSessionServiceProviderSchedule` | `Schedule` | Catálogo | Não | |
| `PaymentRailOperatingSessionServiceType` | `Servicetype` | Catálogo | Não | |
| `PaymentRailOperatingSessionUsageLog` | `Log` | Catálogo | Não | |

Behaviour qualifiers relevantes, todos com a mesma forma (`Preconditions`,
`Schedule`, `BusinessService`, `PaymentRailOperatingSessionReference`,
`<Nome>FunctionReference`, `<Nome>FunctionType`): `OutboundTransaction`,
`InboundTransaction`, `PaymentClearingandSettlement`,
`PaymentAccountReconciliation`.

---

## 3. PartyReferenceDataDirectoryEntry

Raiz de agregado. Descrição oficial: mantém informações de referência sobre
partes, cobrindo dados gerais, contatos, associações e demografia.

| Atributo | Tipo BIAN | Origem | Obrigatório | Observação |
|---|---|---|---|---|
| `PartyReference` | `Party` | Catálogo | Sim | Objeto aninhado, ver abaixo |
| `PartyType` | `Partytypevalues` | Catálogo | Sim | Enum: `Person`, `Organisation` |
| `DirectoryEntryDate` | `Datetime` | Catálogo | Não | |
| `DirectoryEntryDateType` | `Directoryentrydatetypevalues` | Catálogo | Não | |

Estrutura de `Party`:

| Atributo | Tipo BIAN | Origem | Obrigatório |
|---|---|---|---|
| `PartyName` | `Name` | Catálogo | Sim |
| `PartyType` | `Partytypevalues` | Catálogo | Sim |
| `PartyIdentification` | `Partyidentification` | Catálogo | Sim |
| `PartyDateTime` | `Datetime` | Catálogo | Não |
| `PartyLegalStructureType` | `Partylegalstructuretypevalues` | Catálogo | Não |
| `PartyActivityIndicator` | `Industrycode` | Catálogo | Não |

`Partyidentification` = `PartyIdentificationType` (enum) +
`PartyIdentification` (`Identifier`).

Valores do enum `Partyidentificationtypevalues` relevantes ao contexto
brasileiro: `Taxidentificationnumber` (CNPJ e CPF como identificação
fiscal), `Nationalregistrationnumber`, `LEI(LegalEntityIdentifier)`,
`Passportnumber`, `Identitycardnumber`.

**Nota:** CPF e CNPJ não existem como conceito no BIAN. São representados
por `PartyIdentificationType = Taxidentificationnumber` com o valor no
`Identifier`. Modelar um campo `documentNumber` violaria o RNF006.

---

## 4. Relacionamentos

| Relacionamento | Cardinalidade | Origem | Tipo |
|---|---|---|---|
| `PaymentOrderInitiationTransaction` → `Party` (papel Payer) | 1..1 | Catálogo, via `PayerReference` | Referência entre agregados |
| `PaymentOrderInitiationTransaction` → `Party` (papel Payee) | 1..1 | Catálogo, via `PayeeReference` | Referência entre agregados |
| `PaymentOrderInitiationTransaction` → `Party` (papel Customer) | 0..1 | Catálogo, via `CustomerReference` | Referência entre agregados |
| `PaymentOrderInitiationTransaction` → `ProductAgreement` (conta de origem) | 1..1 | Catálogo | Referência externa ao domínio Current Account, fora da seleção |
| `PaymentOrderInitiationTransaction` → `ProductAgreement` (conta de destino) | 0..1 | Catálogo | Referência externa |
| `PaymentOrderInitiationTransaction` → `PaymentTransaction` | 1..1 | Catálogo | Composição dentro do agregado |
| `PaymentOrderInitiationTransaction` → `PaymentRailOperatingSession` | 0..1 | **Derivado** | Não há referência declarada no catálogo. A ligação entre a ordem e a sessão do trilho é decisão de modelagem da equipe. |
| `PaymentRailOperatingSession` → `PaymentClearingandSettlement` | 0..n | Catálogo | Behaviour qualifier |
| `PaymentRailOperatingSession` → `Involvedparty` (provedor) | 1..1 | Catálogo | Referência externa |

Nota sobre cardinalidade: nenhuma das cardinalidades acima está declarada no
catálogo. A coluna Origem indica se o *relacionamento* existe no schema, não
se a cardinalidade existe. Toda cardinalidade é derivada.

**Decisão de bounded context:** o papel de pagador ou recebedor NÃO é
atributo de `Party`. Ele pertence ao vínculo entre a parte e o pagamento, e
está materializado nos atributos `PayerReference` e `PayeeReference` do
agregado de pagamento. A mesma `Party` pode ser pagadora numa ordem e
recebedora em outra.

---

## 5. Máquina de estados

Origem: `Transactionstatustypevalues`, em `PaymentOrderInitiation.yaml`.
Valores do catálogo, com a grafia literal: `Initiated`, `Executed`,
`Cancelled`, `Confirmed`, `Suspended`, `Pending`, `Completed`, `Notified`,
`Booked`, `Rejected`.

Existe também `Paymenttransactionstatustypevalues`, alinhado ao ISO 20022,
com 17 valores: `Received`, `Acceptedtechnicalvalidation`,
`Acceptedcustomerprofile`, `Accepted`, `Acceptedsettlementinprocess`,
`Acceptedsettlementcompleted`, `Acceptedcreditsettlementcompleted`,
`Acceptedwithchange`, `Partiallyaccepted`, `Pending`, `Rejected`,
`Paymentcancelled`, `Acceptedcancellationrequest`,
`Rejectedcancellationrequest`, `Partiallyacceptedcancellationrequest`,
`Pendingcancellationrequest`, `Nocancellationprocess`.

Recorte adotado no MVP, derivado: `Initiated` → `Pending` → `Executed` →
`Completed`, com `Rejected` e `Cancelled` como terminais alcançáveis a
partir de `Initiated` e `Pending`.

**As transições são 100% derivadas.** O catálogo lista os valores possíveis
e não declara nenhuma transição válida entre eles.

---

## 6. Invariantes

Todas derivadas. Nenhum schema do BIAN 14.0.0 declara `required`, `minimum`,
`pattern` ou qualquer restrição de valor.

| ID | Invariante | Justificativa |
|---|---|---|
| INV01 | `Amount.AmountValue` deve ser maior que zero | Regra de negócio elementar de pagamento |
| INV02 | `Currency` deve ser um código ISO 4217 válido de três letras | Exigido pela descrição do próprio tipo `Currencycode` |
| INV03 | `PayerReference` e `PayeeReference` devem referenciar partes distintas | Evita autopagamento |
| INV04 | `PaymentTransactionDatetime` é obrigatório quando o status é `Executed` | Rastreabilidade da liquidação |
| INV05 | `PaymentMechanism` deve pertencer ao enum do catálogo | Conformidade estrutural |
| INV06 | Transição para estado terminal é irreversível | Consistência da máquina de estados |

---

## 7. O que o catálogo NÃO fornece

Registro explícito, para uso na seção de resultados e na validação do
Capítulo 6:

1. Nenhuma obrigatoriedade de campo. Todos os 137 schemas de
   `PaymentOrderInitiation.yaml` estão sem `required`.
2. Nenhuma restrição de valor além dos enums.
3. Nenhuma transição de estado, apenas a lista de estados possíveis.
4. Nenhuma cardinalidade de relacionamento.
5. Nenhum evento de domínio nos arquivos OpenAPI. Os eventos estão nos
   AsyncAPI 3.x, em pasta separada, ainda não inspecionada.

Os itens 1 a 4 são exatamente o que o modelo formal intermediário do projeto
precisa acrescentar, e é por isso que ele é a etapa que agrega valor.

---

## 8. Pendência registrada

A escolha de `Payment Rail` como terceiro Service Domain do MVP está em
aberto. O control record dele é uma sessão operacional, que combina mal com
uma ordem de pagamento no mesmo modelo de domínio. `Current Account` seria
mais coeso, já que as contas de origem e destino já são referenciadas pela
ordem de pagamento. Se a troca for feita, este documento precisa ser
revisado.