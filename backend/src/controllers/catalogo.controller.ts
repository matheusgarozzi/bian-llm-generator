// GET /api/catalogo/service-domains: lista para a tela de seleção (RF022).
// Devolve todos os Service Domains; só os marcados como `disponivel` podem ser selecionados, e os
// demais trazem o motivo em `motivoIndisponivel`. Business Domains sem Service Domains detalhados
// vêm à parte, também com o motivo.
import type { Request, Response } from 'express';
import { catalogoPadrao, type Catalogo } from '../orchestrator/entrada';

export function criarCatalogoController(catalogo?: Catalogo) {
  return (_req: Request, res: Response): void => {
    const { arquitetura, versao, serviceDomains, businessAreas } = catalogo ?? catalogoPadrao();
    res.json({
      arquitetura,
      versao,
      serviceDomains: serviceDomains.map((sd) => ({
        id: sd.id,
        nome: sd.nome,
        nomePt: sd.nomePt,
        descricao: sd.descricao,
        businessArea: sd.businessArea,
        businessDomain: sd.businessDomain,
        businessDomainNome: sd.businessDomainNome,
        disponivel: sd.disponivel,
        motivoIndisponivel: sd.motivoIndisponivel,
      })),
      businessDomainsSemDetalhe: businessAreas.flatMap((area) =>
        area.businessDomains
          .filter((dominio) => dominio.serviceDomains.length === 0)
          .map((dominio) => ({
            id: dominio.id,
            nome: dominio.nome,
            nomePt: dominio.nomePt,
            businessAreaNome: area.nome,
            motivoIndisponivel: dominio.motivoIndisponivel,
          })),
      ),
    });
  };
}
