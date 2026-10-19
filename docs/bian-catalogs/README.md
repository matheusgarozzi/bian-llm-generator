# BIAN Catalogs

Nesta pasta ficam os recortes do catálogo BIAN Service Landscape, release 14.0, referentes ao grupo funcional de Pagamentos (Payments), utilizados como base de conhecimento para a geração de arquiteturas de referência.

| Caminho | O que é |
|---|---|
| `bian_catalog.json` | Catálogo estruturado da task #35: Business Areas, Business Domains e os 23 Service Domains detalhados, com o recorte do MVP em `mvpScope`. Alimenta a tela de seleção e o landscape do prompt. |
| `oas3/` | YAMLs OpenAPI oficiais, sem alteração, baixados de [bian-official/public](https://github.com/bian-official/public) no commit `b58bf4c2c300dd018afc084e9bb24b7adaaa3500` (`release14.0.0/semantic-apis/oas3/yamls`). São os 4 pilotos do MVP e o `StandingOrder`, usado só no exemplo few-shot. |
| `cards/` | Domain cards gerados a partir de `oas3/` pelo condensador (`npm run catalogo:condensar` no backend), mais o `manifesto.json` com o commit e os tamanhos. Não edite à mão. |

As regras do condensador e os tamanhos medidos estão em `docs/prompt/estrutura-modelo-formal.md`, seção 3.
