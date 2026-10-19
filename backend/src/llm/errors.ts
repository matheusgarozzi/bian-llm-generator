// Erro tipado das chamadas ao LLM, para quem chama saber o que deu errado sem olhar a mensagem.
export type TipoErroLLM = 'timeout' | 'resposta_invalida' | 'indisponivel' | 'desconhecido';

export class ErroLLM extends Error {
  readonly tipo: TipoErroLLM;

  constructor(tipo: TipoErroLLM, mensagem: string, causa?: unknown) {
    super(mensagem, { cause: causa });
    this.name = 'ErroLLM';
    this.tipo = tipo;
  }
}
