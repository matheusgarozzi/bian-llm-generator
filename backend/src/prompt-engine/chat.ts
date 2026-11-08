// Prompt de sistema do chat livre, ancorado em um resumo determinístico dos domain cards.
import { parse } from 'yaml';
import { lerDomainCard, manifestoDosCards } from './modelo-formal/cards';

interface CardResumivel {
  service_domain: string;
  control_record: string;
  descricao?: string;
  behaviour_qualifiers?: string[];
  schemas: Record<string, { campos?: Record<string, string> }>;
}

function resumirCard(serviceDomain: string): string {
  const card = parse(lerDomainCard(serviceDomain)) as CardResumivel;
  const controlRecord = card.schemas[`${serviceDomain}#/components/schemas/${card.control_record}`];
  return [
    `- Service Domain: ${card.service_domain}`,
    `  Control Record: ${card.control_record}`,
    `  Descrição oficial: ${card.descricao ?? 'não informada'}`,
    `  Behaviour Qualifiers: ${(card.behaviour_qualifiers ?? []).join(', ') || 'nenhum'}`,
    `  Campos do Control Record: ${Object.keys(controlRecord?.campos ?? {}).join(', ') || 'não informados'}`,
  ].join('\n');
}

let promptEmCache: string | undefined;

export function montarPromptSistemaChat(): string {
  if (promptEmCache) return promptEmCache;
  const { versaoBian, cards } = manifestoDosCards();
  const resumo = Object.keys(cards).sort().map(resumirCard).join('\n');
  promptEmCache = `Você é um assistente sobre a arquitetura de referência BIAN, usado no gerador deste projeto.
Responda sempre em português do Brasil, de forma clara e objetiva.

<catalogo versao="${versaoBian}">
${resumo}
</catalogo>

Regras:
1. O catálogo acima é a única fonte verificada. Ao citar Service Domains, Control Records, campos ou Behaviour Qualifiers, use somente os nomes que aparecem nele, exatamente como estão escritos.
2. Se perguntarem sobre um elemento fora do catálogo, diga que ele não está no recorte carregado e que você não pode confirmar se existe no BIAN. Não sugira substitutos com nomes que não estejam no catálogo.
3. O catálogo não traz nomes de Service Operations nem transições de estado. Não invente esses nomes nem apresente um ciclo de vida como definido pelo BIAN; diga que essa informação não consta do catálogo carregado.
4. Conceitos gerais do BIAN podem ser explicados sem citar nomes específicos. Ao usar exemplos, tire-os do catálogo.
5. Sobre outros padrões, como o TM Forum ODA, afirme apenas o que tiver certeza e deixe claro que isso não vem do catálogo.
6. Se a pergunta não tiver relação com arquitetura de referência, recuse brevemente.`;
  return promptEmCache;
}
