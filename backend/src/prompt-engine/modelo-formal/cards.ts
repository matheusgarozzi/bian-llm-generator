// Leitor dos domain cards gerados por scripts/condensar-catalogo.ts (docs/bian-catalogs/cards).
import fs from 'node:fs';
import path from 'node:path';

// Mesma profundidade em src/ e dist/, então o caminho relativo vale para os dois.
const DIR_CARDS = path.resolve(__dirname, '../../../../docs/bian-catalogs/cards');

interface Manifesto {
  versaoBian: string;
  commitBian: string;
  cards: Record<string, { schemas: number; bytes: number }>;
}

let manifestoEmCache: Manifesto | undefined;

export function manifestoDosCards(): Manifesto {
  manifestoEmCache ??= JSON.parse(fs.readFileSync(path.join(DIR_CARDS, 'manifesto.json'), 'utf8'));
  return manifestoEmCache!;
}

const cardsEmCache = new Map<string, string>();

// Devolve o card sem as linhas de comentário do cabeçalho, que não interessam ao modelo.
export function lerDomainCard(serviceDomain: string): string {
  let card = cardsEmCache.get(serviceDomain);
  if (card === undefined) {
    const caminho = path.join(DIR_CARDS, `${serviceDomain}.yaml`);
    if (!fs.existsSync(caminho)) {
      throw new Error(
        `Domain card de ${serviceDomain} não encontrado em ${caminho}. Rode "npm run catalogo:condensar".`,
      );
    }
    card = fs
      .readFileSync(caminho, 'utf8')
      .split('\n')
      .filter((linha) => !linha.startsWith('#'))
      .join('\n')
      .trimEnd();
    cardsEmCache.set(serviceDomain, card);
  }
  return card;
}
