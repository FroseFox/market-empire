// Arbre de recherche : il débloque des informations et des marchés,
// jamais de bonus artificiel sur les gains (doc Projet §7).
export type Branch = "Marchés" | "Entreprises" | "Relations" | "Actualités" | "Dossiers";

export interface ResearchNode {
  id: string;
  branch: Branch;
  name: string;
  description: string;
  cost: number;
  requires?: string;
}

export const RESEARCH: ResearchNode[] = [
  { id: "us_stocks", branch: "Marchés", name: "Actions américaines", description: "Les grandes entreprises cotées aux États-Unis.", cost: 0 },
  { id: "eu_stocks", branch: "Marchés", name: "Actions européennes", description: "LVMH, Airbus, TotalEnergies, SAP, ASML…", cost: 15_000, requires: "us_stocks" },
  { id: "etf", branch: "Marchés", name: "ETF et indices", description: "Investir sur un indice entier (S&P 500, Nasdaq 100, CAC 40).", cost: 40_000, requires: "eu_stocks" },

  { id: "history_1y", branch: "Entreprises", name: "Historique 1 an", description: "Débloque le graphique sur 1 an dans les fiches.", cost: 10_000 },
  { id: "sector_view", branch: "Entreprises", name: "Analyse sectorielle", description: "Performance moyenne par secteur dans les Marchés.", cost: 20_000, requires: "history_1y" },

  { id: "relations_1", branch: "Relations", name: "Relations directes", description: "Fournisseurs, clients, concurrents et partenaires.", cost: 0 },
  { id: "supply_chain", branch: "Relations", name: "Chaînes d'approvisionnement", description: "Affiche aussi les relations de second niveau.", cost: 25_000, requires: "relations_1" },

  { id: "news_1", branch: "Actualités", name: "Flux d'actualités", description: "Les actualités économiques liées aux entreprises.", cost: 0 },
  { id: "news_filters", branch: "Actualités", name: "Filtres avancés", description: "Filtrer par secteur, par pays ou par dossier.", cost: 8_000, requires: "news_1" },

  { id: "folders_1", branch: "Dossiers", name: "Dossiers", description: "Jusqu'à 2 dossiers d'analyse.", cost: 0 },
  { id: "folders_plus", branch: "Dossiers", name: "Dossiers illimités", description: "Autant de dossiers que vous voulez.", cost: 12_000, requires: "folders_1" },
];

export const RESEARCH_BY_ID: Record<string, ResearchNode> = Object.fromEntries(RESEARCH.map((n) => [n.id, n]));
export const STARTING_RESEARCH = RESEARCH.filter((n) => n.cost === 0).map((n) => n.id);
export const BRANCHES: Branch[] = ["Marchés", "Entreprises", "Relations", "Actualités", "Dossiers"];
export const FOLDER_LIMIT_BASE = 2;
