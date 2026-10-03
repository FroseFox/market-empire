// Arbre de compétences : il débloque des informations et des marchés,
// jamais de bonus artificiel sur les gains (doc Projet §7).
// Chaque nœud a une position dans l'arbre (colonne, niveau) et peut
// demander plusieurs prérequis : les branches se rejoignent.
export type Branch = "Racine" | "Marchés" | "Entreprises" | "Relations" | "Actualités" | "Ville";

export interface ResearchNode {
  id: string;
  branch: Branch;
  name: string;
  description: string;
  cost: number;
  requires: string[];
  /** Position dans l'arbre : colonne (0 à 5, fractions permises) et niveau. */
  col: number;
  row: number;
}

export const RESEARCH: ResearchNode[] = [
  { id: "hq", branch: "Racine", name: "Bureau d'analyse", description: "Le point de départ de votre empire. Tout part d'ici.", cost: 0, requires: [], col: 2.5, row: 0 },

  { id: "us_stocks", branch: "Marchés", name: "Actions américaines", description: "Les grandes entreprises cotées aux États-Unis, plus TSMC.", cost: 0, requires: ["hq"], col: 0.5, row: 1 },
  { id: "eu_stocks", branch: "Marchés", name: "Actions européennes", description: "LVMH, Hermès, Airbus, TotalEnergies, SAP, ASML, Nestlé, Shell, Ferrari…", cost: 15_000, requires: ["us_stocks"], col: 0, row: 2 },
  { id: "crypto", branch: "Marchés", name: "Cryptomonnaies", description: "Bitcoin, Ethereum, Solana… Cotées jour et nuit, très volatiles, achetables par fractions.", cost: 20_000, requires: ["us_stocks"], col: 1, row: 2 },
  { id: "world_stocks", branch: "Marchés", name: "Actions d'Asie et du monde", description: "Sony, Nintendo, Toyota, Alibaba, Tencent, Shopify, MercadoLibre, Petrobras…", cost: 30_000, requires: ["eu_stocks"], col: 0, row: 3 },
  { id: "etf", branch: "Marchés", name: "ETF et indices", description: "Investir sur un indice entier, un pays ou un secteur : S&P 500, Nasdaq, Japon, semi-conducteurs… Demande de connaître les marchés et les secteurs.", cost: 40_000, requires: ["eu_stocks", "sector_view"], col: 1.2, row: 3 },
  { id: "commodities", branch: "Marchés", name: "Matières premières", description: "Or, argent, cuivre, pétrole, gaz, blé… via des ETF qui suivent leur cours.", cost: 35_000, requires: ["etf"], col: 1.2, row: 4 },

  { id: "history_1y", branch: "Entreprises", name: "Historique 1 an", description: "Débloque le graphique sur 1 an dans les fiches.", cost: 10_000, requires: ["hq"], col: 2, row: 1 },
  { id: "sector_view", branch: "Entreprises", name: "Analyse sectorielle", description: "Performance moyenne par secteur dans les Marchés.", cost: 20_000, requires: ["history_1y"], col: 2, row: 2 },

  { id: "realized_pnl", branch: "Entreprises", name: "Plus-values réalisées", description: "Le Portefeuille affiche le gain ou la perte de chaque vente et le total réalisé.", cost: 20_000, requires: ["sector_view"], col: 2, row: 3 },
  { id: "portfolio_breakdown", branch: "Entreprises", name: "Analyse du portefeuille", description: "Répartition de vos investissements par secteur, par région et par type d'actif.", cost: 30_000, requires: ["realized_pnl"], col: 2, row: 4 },

  { id: "relations_1", branch: "Relations", name: "Relations directes", description: "Fournisseurs, clients, concurrents et partenaires.", cost: 0, requires: ["hq"], col: 3, row: 1 },
  { id: "supply_chain", branch: "Relations", name: "Chaînes d'approvisionnement", description: "Affiche aussi les relations de second niveau.", cost: 25_000, requires: ["relations_1"], col: 3, row: 2 },

  { id: "chain_exposure", branch: "Relations", name: "Exposition aux chaînes", description: "Dans Relations, voyez ce que vous détenez dans la chaîne affichée : montant et part de votre portefeuille.", cost: 40_000, requires: ["supply_chain"], col: 3, row: 3 },

  { id: "news_1", branch: "Actualités", name: "Flux d'actualités", description: "Les actualités économiques liées aux entreprises.", cost: 0, requires: ["hq"], col: 4, row: 1 },
  { id: "news_filters", branch: "Actualités", name: "Filtres avancés", description: "Filtrer les actualités par thème et par pays.", cost: 8_000, requires: ["news_1"], col: 4, row: 2 },
  { id: "chain_news", branch: "Actualités", name: "Actualités de mes chaînes", description: "Un filtre pour les nouvelles qui touchent les fournisseurs, clients et concurrents de vos positions.", cost: 35_000, requires: ["news_filters", "supply_chain"], col: 4, row: 3 },

  // Ville : des outils de gestion, jamais de revenu en plus
  { id: "city_upgrade", branch: "Ville", name: "Rénovation urbaine", description: "Améliorez un bâtiment sur place vers sa version supérieure en payant seulement la différence de prix, sans le démolir.", cost: 15_000, requires: ["hq"], col: 5, row: 1 },
  { id: "city_forecast", branch: "Ville", name: "Prévisions de la ville", description: "La Ville affiche la population et le flux net attendus dans 7 jours si rien ne change.", cost: 20_000, requires: ["city_upgrade"], col: 5, row: 2 },
  { id: "city_audit", branch: "Ville", name: "Audit des bâtiments", description: "La fiche de chaque bâtiment montre ce qu'il rapporte et coûte réellement par jour, selon le personnel disponible et vos ressources.", cost: 30_000, requires: ["city_forecast"], col: 5, row: 3 },
];

export const RESEARCH_BY_ID: Record<string, ResearchNode> = Object.fromEntries(RESEARCH.map((n) => [n.id, n]));
export const STARTING_RESEARCH = RESEARCH.filter((n) => n.cost === 0).map((n) => n.id);
/** Recherches retirées du jeu (les dossiers d'analyse) et leur prix : remboursées aux joueurs qui les avaient. */
export const RETIRED_RESEARCH: Record<string, number> = { folders_1: 0, folders_plus: 12_000, folder_tracking: 18_000, folder_links: 25_000 };

export const BRANCH_COLOR: Record<Branch, string> = {
  Racine: "#0F172A",
  "Marchés": "#2563EB",
  Entreprises: "#0EA5E9",
  Relations: "#8B5CF6",
  "Actualités": "#F59E0B",
  Ville: "#EC4899",
};
