// Glossário que abre o bloco B1: explica ao modelo os termos e atributos usados no catálogo.
// Os status de Business Domain não estão aqui porque vêm do próprio JSON (meta.status_legend).
// Sem exemplos ligados a Service Domains específicos, para não puxar o modelo para eles.
export const GLOSSARIO: Array<{ termo: string; definicao: string }> = [
  {
    termo: 'BIAN',
    definicao:
      'Banking Industry Architecture Network: arquitetura de referência que decompõe as capacidades de um banco em Service Domains com fronteiras de responsabilidade bem definidas.',
  },
  {
    termo: 'Service Landscape',
    definicao:
      'Mapa hierárquico do BIAN em três níveis: Business Area > Business Domain > Service Domain. Aparece em <service_landscape>.',
  },
  {
    termo: 'Business Area',
    definicao: 'Agrupamento de mais alto nível do landscape.',
  },
  {
    termo: 'Business Domain',
    definicao:
      'Agrupamento de Service Domains afins dentro de uma Business Area. O atributo "status" diz o quanto ele foi detalhado no catálogo.',
  },
  {
    termo: 'Service Domain',
    definicao:
      'Menor unidade funcional do BIAN: é dono exclusivo de uma responsabilidade de negócio e a expõe por uma API semântica. O atributo "id" é o nome técnico da API e deve ser citado literalmente.',
  },
  {
    termo: 'Control Record',
    definicao:
      'Registro principal que um Service Domain controla ao longo do ciclo de vida. No modelo formal é a entidade raiz do agregado do Service Domain.',
  },
  {
    termo: 'Behaviour Qualifier',
    definicao:
      'Subdivisão do Control Record que detalha um aspecto do seu comportamento. O card lista os nomes em "behaviour_qualifiers", sem expandi-los.',
  },
  {
    termo: 'Domain card',
    definicao:
      'Recorte condensado do YAML oficial de um Service Domain selecionado, partindo do Control Record. Única fonte citável de schemas, campos e enums.',
  },
  {
    termo: 'schemas (no card)',
    definicao:
      'Cada chave é o identificador canônico de um schema, no formato <ServiceDomain>#/components/schemas/<Nome>; é esse identificador que vai no campo "fonte".',
  },
  {
    termo: 'campos (no card)',
    definicao:
      'Uma linha por campo, no formato "Campo: tipo — descrição". O tipo é um primitivo com o formato entre parênteses, como string(Text), ou o nome de outro schema do mesmo card.',
  },
  {
    termo: 'enum (no card)',
    definicao:
      'Lista fechada de valores literais do schema; copie os valores exatamente como estão.',
  },
  {
    termo: 'tipos_nao_expandidos (no card)',
    definicao:
      'Schemas alcançáveis além do limite de profundidade do recorte: existem no catálogo, mas sem campos detalhados.',
  },
  {
    termo: 'disponivel',
    definicao:
      'Atributo do Service Domain no landscape: "true" se está no recorte do MVP e pode ser selecionado.',
  },
  {
    termo: 'selecionado',
    definicao:
      'Atributo do Service Domain no landscape: "true" se o usuário o escolheu. Só os selecionados devem ser modelados; os demais servem de contexto.',
  },
];
