// Arbre de compétences : il débloque des informations et des marchés,
// jamais de bonus artificiel sur les gains (doc Projet §7).
// Chaque nœud a une position dans l'arbre (colonne, niveau) et peut
// demander plusieurs prérequis : les branches se rejoignent.
export type Branch = "Racine" | "Marchés" | "Entreprises" | "Relations" | "Actualités" | "Dossiers";

export interface ResearchNode {
  id: string;
  branch: Branch;
  name: string;
  description: string;
  cost: number;
  requires: string[];
  /** Position dans l'arbre : colonne (0 à 4, demi-colonnes permises) et niveau. */
  col: number;
  row: number;
}

export const RESEARCH: ResearchNode[] = [
  { id: "hq", branch: "Racine", name: "Bureau d'analyse", description: "Le point de départ de votre empire. Tout part d'ici.", cost: 0, requires: [], col: 2, row: 0 },

  { id: "us_stocks", branch: "Marchés", name: "Actions américaines", description: "Les grandes entreprises cotées aux États-Unis.", cost: 0, requires: ["hq"], col: 0, row: 1 },
  { id: "eu_stocks", branch: "Marchés", name: "Actions européennes", description: "LVMH, Airbus, TotalEnergies, SAP, ASML…", cost: 15_000, requires: ["us_stocks"], col: 0, row: 2 },
  { id: "etf", branch: "Marchés", name: "ETF et indices", description: "Investir sur un indice entier : S&P 500, Nasdaq 100, CAC 40. Demande de connaître les marchés et les secteurs.", cost: 40_000, requires: ["eu_stocks", "sector_view"], col: 0.5, row: 3 },

  { id: "history_1y", branch: "Entreprises", name: "Historique 1 an", description: "Débloque le graphique sur 1 an dans les fiches.", cost: 10_000, requires: ["hq"], col: 1, row: 1 },
  { id: "sector_view", branch: "Entreprises", name: "Analyse sectorielle", description: "Performance moyenne par secteur dans les Marchés.", cost: 20_000, requires: ["history_1y"], col: 1, row: 2 },

  { id: "relations_1", branch: "Relations", name: "Relations directes", description: "Fournisseurs, clients, concurrents et partenaires.", cost: 0, requires: ["hq"], col: 2, row: 1 },
  { id: "supply_chain", branch: "Relations", name: "Chaînes d'approvisionnement", description: "Affiche aussi les relations de second niveau.", cost: 25_000, requires: ["relations_1"], col: 2, row: 2 },

  { id: "news_1", branch: "Actualités", name: "Flux d'actualités", description: "Les actualités économiques liées aux entreprises.", cost: 0, requires: ["hq"], col: 3, row: 1 },
  { id: "folders_1", branch: "Dossiers", name: "Dossiers", description: "Jusqu'à 2 dossiers d'analyse.", cost: 0, requires: ["hq"], col: 4, row: 1 },
  { id: "folders_plus", branch: "Dossiers", name: "Dossiers illimités", description: "Autant de dossiers que vous voulez.", cost: 12_000, requires: ["folders_1"], col: 4, row: 2 },
  { id: "news_filters", branch: "Actualités", name: "Filtres avancés", description: "Filtrer les actualités par dossier, par thème et par pays.", cost: 8_000, requires: ["news_1", "folders_1"], col: 3.5, row: 2.6 },
];

export const RESEARCH_BY_ID: Record<string, ResearchNode> = Object.fromEntries(RESEARCH.map((n) => [n.id, n]));
export const STARTING_RESEARCH = RESEARCH.filter((n) => n.cost === 0).map((n) => n.id);
export const FOLDER_LIMIT_BASE = 2;

export const BRANCH_COLOR: Record<Branch, string> = {
  Racine: "#0F172A",
  "Marchés": "#2563EB",
  Entreprises: "#0EA5E9",
  Relations: "#8B5CF6",
  "Actualités": "#F59E0B",
  Dossiers: "#10B981",
};
