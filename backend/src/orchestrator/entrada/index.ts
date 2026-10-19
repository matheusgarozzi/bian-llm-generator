// Leitura e estruturação da entrada do usuário (task #63, Motor de Orquestração).
export {
  carregarCatalogo,
  catalogoPadrao,
  type BusinessAreaCatalogo,
  type BusinessDomainCatalogo,
  type Catalogo,
  type ServiceDomainCatalogo,
} from './catalogo';
export {
  schemaEntrada,
  MAX_RESTRICOES,
  MAX_DESCRICAO_RESTRICAO,
  type Entrada,
  type Restricao,
} from './schema';
export {
  estruturarEntrada,
  ErroEntrada,
  type EntradaEstruturada,
  type ServiceDomainEstruturado,
} from './estruturar';
