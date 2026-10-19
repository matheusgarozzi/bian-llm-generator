// Leitor do catálogo BIAN (docs/bian-catalogs/bian_catalog.json, task #35): carrega uma vez e indexa por id.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Mesma profundidade em src/ e dist/, então o caminho relativo vale para os dois.
const CAMINHO_PADRAO = path.resolve(__dirname, '../../../../docs/bian-catalogs/bian_catalog.json');

// O JSON da #35 não traz control records. Valores copiados de docs/modelo-dominio-bian.md (task #50).
const CONTROL_RECORDS: Record<string, string> = {
  PaymentOrderInitiation: 'PaymentOrderInitiationTransaction',
  PaymentRail: 'PaymentRailOperatingSession',
  PartyReferenceDataDirectory: 'PartyReferenceDataDirectoryEntry',
  CurrentAccount: 'CurrentAccountFacility',
};

// Só o que o leitor usa; o resto do JSON é ignorado.
const schemaArquivo = z.object({
  meta: z.object({
    version: z.string(),
    status_legend: z.record(z.string(), z.string()),
  }),
  mvpScope: z.object({
    functionalGroupDecidedByAdvisor: z.string(),
    pilotServiceDomains: z.array(z.string()),
  }),
  businessAreas: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      namePt: z.string(),
      note: z.string().optional(),
      businessDomains: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          namePt: z.string(),
          status: z.string(),
          serviceDomains: z.array(
            z.object({
              apiName: z.string(),
              name: z.string(),
              namePt: z.string(),
              descriptionPt: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export interface ServiceDomainCatalogo {
  id: string;
  nome: string;
  nomePt: string;
  descricao: string;
  businessArea: string;
  businessDomain: string;
  businessDomainNome: string;
  // Posição na ordem do arquivo (Business Area > Business Domain > Service Domain).
  ordem: number;
  // Piloto do MVP, com control record conhecido e domain card previsto.
  disponivel: boolean;
  // Por que não pode ser selecionado; ausente quando disponível.
  motivoIndisponivel?: string;
  controlRecord?: string;
  arquivoOrigem?: string;
}

export interface BusinessDomainCatalogo {
  id: string;
  nome: string;
  nomePt: string;
  status: string;
  // Preenchido quando o Business Domain não tem Service Domains detalhados no catálogo.
  motivoIndisponivel?: string;
  serviceDomains: ServiceDomainCatalogo[];
}

export interface BusinessAreaCatalogo {
  id: string;
  nome: string;
  nomePt: string;
  nota?: string;
  businessDomains: BusinessDomainCatalogo[];
}

export interface Catalogo {
  arquitetura: 'BIAN';
  versao: string;
  grupoFuncionalMvp: string;
  // Significado de cada status de Business Domain (meta.status_legend do JSON).
  legendaStatus: Record<string, string>;
  businessAreas: BusinessAreaCatalogo[];
  serviceDomains: ServiceDomainCatalogo[];
  porId: Map<string, ServiceDomainCatalogo>;
}

export function carregarCatalogo(caminho: string = CAMINHO_PADRAO): Catalogo {
  const arquivo = schemaArquivo.parse(JSON.parse(fs.readFileSync(caminho, 'utf8')));
  const pilotos = arquivo.mvpScope.pilotServiceDomains;
  const grupoFuncional = arquivo.mvpScope.functionalGroupDecidedByAdvisor;
  const legendaStatus = arquivo.meta.status_legend;

  const motivoForaDoRecorte =
    `Fora do recorte do MVP. O grupo funcional definido pelo orientador é ${grupoFuncional}, ` +
    `e o recorte piloto cobre só o ciclo de um pagamento simples (${pilotos.join(', ')}). ` +
    'Este Service Domain ainda não tem control record mapeado nem domain card.';

  const serviceDomains: ServiceDomainCatalogo[] = [];
  const businessAreas = arquivo.businessAreas.map((area): BusinessAreaCatalogo => ({
    id: area.id,
    nome: area.name,
    nomePt: area.namePt,
    nota: area.note,
    businessDomains: area.businessDomains.map((dominio): BusinessDomainCatalogo => {
      const sds = dominio.serviceDomains.map((sd): ServiceDomainCatalogo => {
        const disponivel = pilotos.includes(sd.apiName);
        const item: ServiceDomainCatalogo = {
          id: sd.apiName,
          nome: sd.name,
          nomePt: sd.namePt,
          descricao: sd.descriptionPt,
          businessArea: area.id,
          businessDomain: dominio.id,
          businessDomainNome: dominio.name,
          ordem: serviceDomains.length,
          disponivel,
          motivoIndisponivel: disponivel ? undefined : motivoForaDoRecorte,
          controlRecord: disponivel ? CONTROL_RECORDS[sd.apiName] : undefined,
          arquivoOrigem: disponivel ? `${sd.apiName}.yaml` : undefined,
        };
        serviceDomains.push(item);
        return item;
      });
      return {
        id: dominio.id,
        nome: dominio.name,
        nomePt: dominio.namePt,
        status: dominio.status,
        motivoIndisponivel:
          sds.length === 0
            ? 'Nenhum Service Domain deste Business Domain foi detalhado no catálogo. ' +
              `Status "${dominio.status}": ${legendaStatus[dominio.status] ?? 'sem legenda'}`
            : undefined,
        serviceDomains: sds,
      };
    }),
  }));

  const porId = new Map(serviceDomains.map((sd) => [sd.id, sd]));
  for (const piloto of pilotos) {
    if (!porId.has(piloto)) {
      throw new Error(`Catálogo inconsistente: piloto ${piloto} não está entre os Service Domains`);
    }
    if (!CONTROL_RECORDS[piloto]) {
      throw new Error(`Catálogo inconsistente: piloto ${piloto} sem control record mapeado`);
    }
  }

  return {
    arquitetura: 'BIAN',
    versao: arquivo.meta.version,
    grupoFuncionalMvp: grupoFuncional,
    legendaStatus,
    businessAreas,
    serviceDomains,
    porId,
  };
}

let catalogoEmCache: Catalogo | undefined;

export function catalogoPadrao(): Catalogo {
  catalogoEmCache ??= carregarCatalogo();
  return catalogoEmCache;
}
