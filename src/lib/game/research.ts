// Arbre de compétences : il débloque des marchés, des outils d'analyse, et des améliorations
// pour la ville, la Banque et le commerce. Il ne touche jamais aux cours de bourse, qui restent ceux du vrai marché.
// Chaque nœud a une position dans l'arbre (colonne, niveau) et peut
// demander plusieurs prérequis : les branches se rejoignent.
export type Branch = "Racine" | "Marchés" | "Entreprises" | "Relations" | "Actualités" | "Ville" | "Banque" | "Commerce";

export interface ResearchNode {
  id: string;
  branch: Branch;
  name: string;
  description: string;
  cost: number;
  requires: string[];
  /** Position dans l'arbre : colonne (fractions permises) et niveau. */
  col: number;
  row: number;
}

/** Ce que changent les recherches à effet (0,25 = 25 %). Le moteur lit ces valeurs, les descriptions aussi. */
export const RESEARCH_FX = {
  firm_slot: 1,          // sites d'entreprise en plus
  city_works: 0.25,      // rénovation moins chère
  city_materials: 0.15,  // vétusté plus lente
  city_shield: 0.25,     // catastrophes moins fortes
  city_tourism: 0.1,     // revenus du tourisme
  city_welcome: 0.15,    // nouveaux habitants
  bank_rates: 0.25,      // intérêts
  bank_fees: 0.2,        // frais de courtage
  bank_capital: 0.1,     // capital produit
  bank_cap: 0.25,        // mise maximale
  trade_customs: 0.05,   // points de prix à l'export
  trade_imports: 0.1,    // importations moins chères
  trade_defense: 0.5,    // pertes subies pendant un blocus
} as const;
export type ResearchFx = keyof typeof RESEARCH_FX;
/** Valeur de l'effet d'une recherche si le joueur l'a, 0 sinon. */
export const researchFx = (state: { research?: string[] }, id: ResearchFx): number => (state.research?.includes(id) ? RESEARCH_FX[id] : 0);
const p = (id: ResearchFx) => `${Math.round(RESEARCH_FX[id] * 100)} %`;

export const RESEARCH: ResearchNode[] = [
  { id: "hq", branch: "Racine", name: "Bureau d'analyse", description: "Le point de départ de votre empire. Tout part d'ici.", cost: 0, requires: [], col: 3.95, row: 0 },

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
  { id: "firm_slot", branch: "Entreprises", name: "Zone d'activités", description: "Votre ville peut accueillir un site d'entreprise de plus que ce que son rang permet.", cost: 300_000, requires: ["portfolio_breakdown"], col: 2, row: 5 },

  { id: "relations_1", branch: "Relations", name: "Relations directes", description: "Fournisseurs, clients, concurrents et partenaires.", cost: 0, requires: ["hq"], col: 3, row: 1 },
  { id: "supply_chain", branch: "Relations", name: "Chaînes d'approvisionnement", description: "Affiche aussi les relations de second niveau.", cost: 25_000, requires: ["relations_1"], col: 3, row: 2 },

  { id: "chain_exposure", branch: "Relations", name: "Exposition aux chaînes", description: "Dans Relations, voyez ce que vous détenez dans la chaîne affichée : montant et part de votre portefeuille.", cost: 40_000, requires: ["supply_chain"], col: 3, row: 3 },

  { id: "news_1", branch: "Actualités", name: "Flux d'actualités", description: "Les actualités économiques liées aux entreprises.", cost: 0, requires: ["hq"], col: 4, row: 1 },
  { id: "news_filters", branch: "Actualités", name: "Filtres avancés", description: "Filtrer les actualités par thème et par pays.", cost: 8_000, requires: ["news_1"], col: 4, row: 2 },
  { id: "chain_news", branch: "Actualités", name: "Actualités de mes chaînes", description: "Un filtre pour les nouvelles qui touchent les fournisseurs, clients et concurrents de vos positions.", cost: 35_000, requires: ["news_filters", "supply_chain"], col: 4, row: 3 },

  // Ville : des outils de gestion, puis des améliorations de la ville elle-même
  { id: "city_upgrade", branch: "Ville", name: "Rénovation urbaine", description: "Améliorez un bâtiment sur place vers sa version supérieure en payant seulement la différence de prix, sans le démolir.", cost: 15_000, requires: ["hq"], col: 5, row: 1 },
  { id: "city_forecast", branch: "Ville", name: "Prévisions de la ville", description: "La Ville affiche la population et le flux net attendus dans 7 jours si rien ne change.", cost: 20_000, requires: ["city_upgrade"], col: 5, row: 2 },
  { id: "city_audit", branch: "Ville", name: "Audit des bâtiments", description: "La fiche de chaque bâtiment montre ce qu'il rapporte et coûte réellement par jour, selon le personnel disponible et vos ressources.", cost: 30_000, requires: ["city_forecast"], col: 5, row: 3 },
  { id: "city_tourism", branch: "Ville", name: "Office de tourisme", description: `Les bâtiments touristiques (musée, hôtel, stade, parc d'attractions) rapportent ${p("city_tourism")} de plus.`, cost: 200_000, requires: ["city_audit"], col: 5, row: 4 },
  { id: "city_welcome", branch: "Ville", name: "Accueil des habitants", description: `Les nouveaux habitants arrivent ${p("city_welcome")} plus vite, tant qu'il reste des logements.`, cost: 400_000, requires: ["city_tourism"], col: 5, row: 5 },
  { id: "city_works", branch: "Ville", name: "Chantiers efficaces", description: `Une rénovation coûte ${p("city_works")} de moins.`, cost: 60_000, requires: ["city_upgrade"], col: 5.95, row: 2 },
  { id: "city_materials", branch: "Ville", name: "Matériaux durables", description: `La vétusté avance ${p("city_materials")} moins vite, en plus de l'effet des Ateliers municipaux.`, cost: 150_000, requires: ["city_works"], col: 5.95, row: 3 },
  { id: "city_shield", branch: "Ville", name: "Plan de prévention", description: `Les catastrophes (tempête, inondation, épidémie…) frappent ${p("city_shield")} moins fort, en plus de la protection des équipements.`, cost: 300_000, requires: ["city_materials"], col: 5.95, row: 4 },

  // Banque : de meilleures conditions pour investir. Les cours, eux, ne changent jamais.
  { id: "bank_rates", branch: "Banque", name: "Négociation des taux", description: `Les intérêts sur ce que la Banque vous prête baissent de ${p("bank_rates")}.`, cost: 50_000, requires: ["hq"], col: 6.95, row: 1 },
  { id: "bank_fees", branch: "Banque", name: "Courtier attitré", description: `Les frais de courtage baissent de ${p("bank_fees")}, à l'achat comme à la vente.`, cost: 150_000, requires: ["bank_rates"], col: 6.95, row: 2 },
  { id: "bank_capital", branch: "Banque", name: "Gestion de fortune", description: `Vos placements produisent ${p("bank_capital")} de capital en plus.`, cost: 500_000, requires: ["bank_fees"], col: 6.95, row: 3 },
  { id: "bank_cap", branch: "Banque", name: "Ligne de crédit", description: `La mise totale que la Banque vous laisse placer augmente de ${p("bank_cap")}.`, cost: 1_200_000, requires: ["bank_capital"], col: 6.95, row: 4 },

  // Commerce : mieux vendre, mieux acheter, mieux résister
  { id: "trade_customs", branch: "Commerce", name: "Accords douaniers", description: `Vos surplus d'énergie et de nourriture s'exportent ${Math.round(RESEARCH_FX.trade_customs * 100)} points plus cher, en plus de l'effet du Port de commerce.`, cost: 80_000, requires: ["hq"], col: 7.9, row: 1 },
  { id: "trade_imports", branch: "Commerce", name: "Centrale d'achat", description: `Ce que la ville importe au prix du marché coûte ${p("trade_imports")} de moins. Les contrats entre joueurs ne changent pas.`, cost: 200_000, requires: ["trade_customs"], col: 7.9, row: 2 },
  { id: "trade_defense", branch: "Commerce", name: "Routes de secours", description: `Sous blocus, vos exportations perdent ${p("trade_defense")} de moins.`, cost: 450_000, requires: ["trade_imports"], col: 7.9, row: 3 },
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
  Banque: "#0D9488",
  Commerce: "#16A34A",
};
