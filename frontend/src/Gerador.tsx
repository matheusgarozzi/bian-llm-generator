import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PainelPrompt, type Previa, type PromptModeloFormal } from './PainelPrompt';
import { Tooltip } from './Tooltip';

// Tela de seleção (RF022): o usuário escolhe Service Domains do catálogo (RF001), sem digitar
// requisitos em texto livre, e diz se quer o frontend React (RF017).

// Mesmos limites do contrato em backend/src/orchestrator/entrada/schema.ts.
const MAX_RESTRICOES = 10;
const MAX_DESCRICAO_RESTRICAO = 500;

interface ServiceDomain {
  id: string;
  nome: string;
  nomePt: string;
  descricao: string;
  businessDomain: string;
  businessDomainNome: string;
  disponivel: boolean;
  motivoIndisponivel?: string;
}

interface BusinessDomainSemDetalhe {
  id: string;
  nome: string;
  nomePt: string;
  businessAreaNome: string;
  motivoIndisponivel: string;
}

interface Catalogo {
  arquitetura: 'BIAN';
  versao: string;
  serviceDomains: ServiceDomain[];
  businessDomainsSemDetalhe: BusinessDomainSemDetalhe[];
}

interface Restricao {
  serviceDomain: string;
  descricao: string;
}

interface EntradaEstruturada {
  arquitetura: 'BIAN';
  versao: string;
  serviceDomains: Array<{ id: string; nome: string; controlRecord: string; arquivoOrigem: string }>;
  gerarFrontend: boolean;
  restricoes: Restricao[];
  hash: string;
}

interface Violacao {
  regra: string;
  caminho: string;
  descricao: string;
  acaoEsperada: string;
}

interface Tentativa {
  numero: number;
  tokensEstimados: number;
  duracaoMs: number;
  relatorio: { aprovado: boolean; violacoes: Violacao[]; regrasAplicadas: string[] };
}

// Resposta de POST /api/gerar (UC03 + UC04).
interface ResultadoGeracao {
  entrada: EntradaEstruturada;
  status: 'CONCLUIDA' | 'FALHA_VALIDACAO' | 'FALHA_INFRA';
  modelo: Record<string, unknown> | null;
  tentativas: Tentativa[];
  erro?: string;
}

type Envio =
  | { estado: 'parado' }
  | { estado: 'enviando' }
  | { estado: 'ok'; resultado: ResultadoGeracao }
  | { estado: 'erro'; problemas: string[] };

// Agrupa por Business Domain mantendo a ordem do catálogo.
function agrupar(serviceDomains: ServiceDomain[]) {
  const grupos = new Map<string, { nome: string; itens: ServiceDomain[] }>();
  for (const sd of serviceDomains) {
    const grupo = grupos.get(sd.businessDomain) ?? { nome: sd.businessDomainNome, itens: [] };
    grupo.itens.push(sd);
    grupos.set(sd.businessDomain, grupo);
  }
  return [...grupos.values()];
}

// Contrato de POST /api/generate e /api/prompt/preview.
function corpoDaEntrada(
  catalogo: Catalogo,
  serviceDomains: string[],
  gerarFrontend: boolean,
  restricoes: Restricao[],
) {
  return {
    arquitetura: catalogo.arquitetura,
    versao: catalogo.versao,
    serviceDomains,
    gerarFrontend,
    restricoes,
  };
}

export function Gerador() {
  const [catalogo, setCatalogo] = useState<Catalogo>();
  const [erroCatalogo, setErroCatalogo] = useState<string>();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [gerarFrontend, setGerarFrontend] = useState(true);
  const [restricoes, setRestricoes] = useState<Restricao[]>([]);
  const [envio, setEnvio] = useState<Envio>({ estado: 'parado' });
  const [previa, setPrevia] = useState<Previa>({ estado: 'vazio' });

  // Linha de restrição ainda sem texto não vai para o backend.
  const restricoesPreenchidas = useMemo(
    () => restricoes.filter((r) => r.descricao.trim() !== ''),
    [restricoes],
  );

  useEffect(() => {
    fetch('/api/catalogo/service-domains')
      .then((resposta) => {
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        return resposta.json() as Promise<Catalogo>;
      })
      .then(setCatalogo)
      .catch((erro: Error) =>
        setErroCatalogo(`Não foi possível carregar o catálogo do backend (${erro.message}).`),
      );
  }, []);

  // Remonta o prompt a cada mudança da seleção; o atraso evita uma requisição por tecla digitada.
  useEffect(() => {
    if (!catalogo || selecionados.length === 0) return;
    const cancelamento = new AbortController();
    const espera = setTimeout(async () => {
      setPrevia((atual) => ({
        estado: 'carregando',
        anterior: atual.estado === 'ok' ? atual.prompt : undefined,
      }));
      try {
        const resposta = await fetch('/api/prompt/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            corpoDaEntrada(catalogo, selecionados, gerarFrontend, restricoesPreenchidas),
          ),
          signal: cancelamento.signal,
        });
        const corpo = await resposta.json();
        setPrevia(
          resposta.ok
            ? { estado: 'ok', prompt: corpo.prompt as PromptModeloFormal }
            : { estado: 'erro', problemas: corpo.problemas ?? [corpo.erro] },
        );
      } catch (erro) {
        if (cancelamento.signal.aborted) return;
        setPrevia({ estado: 'erro', problemas: [`Falha ao falar com o backend: ${String(erro)}`] });
      }
    }, 300);
    return () => {
      clearTimeout(espera);
      cancelamento.abort();
    };
  }, [catalogo, selecionados, gerarFrontend, restricoesPreenchidas]);

  const grupos = useMemo(() => agrupar(catalogo?.serviceDomains ?? []), [catalogo]);
  const nomePorId = useMemo(
    () => new Map(catalogo?.serviceDomains.map((sd) => [sd.id, sd.nome])),
    [catalogo],
  );

  function alternar(id: string) {
    if (selecionados.includes(id)) {
      setSelecionados(selecionados.filter((s) => s !== id));
      // Restrição sempre pertence a um domínio selecionado.
      setRestricoes(restricoes.filter((r) => r.serviceDomain !== id));
    } else {
      setSelecionados([...selecionados, id]);
    }
    setEnvio({ estado: 'parado' });
  }

  function alterarRestricao(indice: number, mudanca: Partial<Restricao>) {
    setRestricoes(restricoes.map((r, i) => (i === indice ? { ...r, ...mudanca } : r)));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!catalogo) return;
    setEnvio({ estado: 'enviando' });
    try {
      const resposta = await fetch('/api/gerar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          corpoDaEntrada(catalogo, selecionados, gerarFrontend, restricoesPreenchidas),
        ),
      });
      const corpo = await resposta.json();
      if (resposta.ok || corpo.status === 'FALHA_INFRA') {
        setEnvio({ estado: 'ok', resultado: corpo as ResultadoGeracao });
      } else {
        setEnvio({ estado: 'erro', problemas: corpo.problemas ?? [corpo.erro] });
      }
    } catch (erro) {
      setEnvio({ estado: 'erro', problemas: [`Falha ao falar com o backend: ${String(erro)}`] });
    }
  }

  if (erroCatalogo) return <p className="erro">{erroCatalogo}</p>;
  if (!catalogo) return <p className="vazio">Carregando catálogo…</p>;

  return (
    <div className="tela-gerador">
      <form className="gerador" onSubmit={enviar}>
        <p className="legenda">
          Catálogo {catalogo.arquitetura} {catalogo.versao}. Selecione um ou mais Service Domains;
          passe o mouse (ou o foco do teclado) num item bloqueado para ver o motivo.
        </p>

        {grupos.map((grupo) => (
          <fieldset key={grupo.nome} className="grupo">
            <legend>{grupo.nome}</legend>
            {grupo.itens.map((sd) => {
              const item = (
                <label
                  key={sd.id}
                  className={`service-domain${sd.disponivel ? '' : ' indisponivel'}`}
                >
                  <input
                    type="checkbox"
                    checked={selecionados.includes(sd.id)}
                    disabled={!sd.disponivel}
                    onChange={() => alternar(sd.id)}
                  />
                  <span>
                    <strong>{sd.nome}</strong> <span className="nome-pt">({sd.nomePt})</span>
                    {!sd.disponivel && <span className="selo">Bloqueado</span>}
                    <small>{sd.descricao}</small>
                  </span>
                </label>
              );
              return sd.motivoIndisponivel ? (
                <Tooltip key={sd.id} texto={sd.motivoIndisponivel}>
                  {item}
                </Tooltip>
              ) : (
                item
              );
            })}
          </fieldset>
        ))}

        {/* Business Domains do landscape sem Service Domains detalhados: não há o que selecionar. */}
        <details className="grupo sem-detalhe">
          <summary>
            Outros Business Domains do catálogo ({catalogo.businessDomainsSemDetalhe.length}),
            bloqueados
          </summary>
          <div className="selos">
            {catalogo.businessDomainsSemDetalhe.map((dominio) => (
              <Tooltip
                key={dominio.id}
                texto={`${dominio.businessAreaNome} > ${dominio.nome} (${dominio.nomePt}). ${dominio.motivoIndisponivel}`}
              >
                <span className="selo">{dominio.nome}</span>
              </Tooltip>
            ))}
          </div>
        </details>

        <label className="opcao">
          <input
            type="checkbox"
            checked={gerarFrontend}
            onChange={(evento) => setGerarFrontend(evento.target.checked)}
          />
          Gerar também o frontend React
        </label>

        <fieldset className="grupo">
          <legend>Restrições (opcional)</legend>
          {restricoes.length === 0 && (
            <p className="legenda">
              Regras de negócio sobre um domínio selecionado, ex.: moedas aceitas ou limite de
              valor.
            </p>
          )}
          {restricoes.map((restricao, indice) => (
            <div key={indice} className="restricao">
              <select
                value={restricao.serviceDomain}
                onChange={(evento) =>
                  alterarRestricao(indice, { serviceDomain: evento.target.value })
                }
              >
                {selecionados.map((id) => (
                  <option key={id} value={id}>
                    {nomePorId.get(id)}
                  </option>
                ))}
              </select>
              <input
                value={restricao.descricao}
                maxLength={MAX_DESCRICAO_RESTRICAO}
                placeholder="Ex.: aceitar apenas BRL"
                onChange={(evento) => alterarRestricao(indice, { descricao: evento.target.value })}
              />
              <button
                type="button"
                onClick={() => setRestricoes(restricoes.filter((_, i) => i !== indice))}
              >
                Remover
              </button>
            </div>
          ))}
          <div className="acoes">
            <button
              type="button"
              disabled={selecionados.length === 0 || restricoes.length >= MAX_RESTRICOES}
              onClick={() =>
                setRestricoes([...restricoes, { serviceDomain: selecionados[0], descricao: '' }])
              }
            >
              Adicionar restrição
            </button>
          </div>
        </fieldset>

        <div className="acoes">
          <button type="submit" disabled={selecionados.length === 0 || envio.estado === 'enviando'}>
            {envio.estado === 'enviando' ? 'Gerando modelo formal com o LLM…' : 'Gerar modelo formal'}
          </button>
        </div>

        {envio.estado === 'erro' && (
          <div className="erro">
            <p>A seleção foi recusada:</p>
            <ul>
              {envio.problemas.map((problema) => (
                <li key={problema}>{problema}</li>
              ))}
            </ul>
          </div>
        )}

        {envio.estado === 'ok' && <Resultado resultado={envio.resultado} />}
      </form>
      <PainelPrompt previa={selecionados.length === 0 ? { estado: 'vazio' } : previa} />
    </div>
  );
}

const TITULO_STATUS = {
  CONCLUIDA: 'Modelo formal aprovado pelo validador',
  FALHA_VALIDACAO: 'Modelo reprovado após 3 tentativas',
  FALHA_INFRA: 'Falha ao falar com o LLM',
} as const;

// Resultado da geração: status, uma linha por tentativa com as violações do gatekeeper e o JSON.
function Resultado({ resultado }: { resultado: ResultadoGeracao }) {
  const baixar = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(resultado.modelo, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-formal.json';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={`resultado status-${resultado.status.toLowerCase()}`}>
      <h3>{TITULO_STATUS[resultado.status]}</h3>
      {resultado.erro && <p className="erro">{resultado.erro}</p>}
      <ol className="tentativas">
        {resultado.tentativas.map((t) => (
          <li key={t.numero}>
            <strong>
              Tentativa {t.numero}: {t.relatorio.aprovado ? 'aprovada' : 'reprovada'}
            </strong>{' '}
            <small>
              ({(t.duracaoMs / 1000).toFixed(1)} s, ~{t.tokensEstimados.toLocaleString('pt-BR')}{' '}
              tokens; regras {t.relatorio.regrasAplicadas.join(', ')})
            </small>
            {t.relatorio.violacoes.length > 0 && (
              <ul>
                {t.relatorio.violacoes.map((v, i) => (
                  <li key={i}>
                    <code>{v.regra}</code> {v.descricao} {v.caminho && <code>{v.caminho}</code>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {resultado.modelo && (
        <details open>
          <summary>
            Modelo formal gerado{' '}
            <button type="button" onClick={baixar}>
              Baixar JSON
            </button>
          </summary>
          <pre>{JSON.stringify(resultado.modelo, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
