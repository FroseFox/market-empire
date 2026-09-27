// ─────────────────────────────────────────────────────────────
// Market Empire — paramètres d'équilibrage (source : doc « Équilibrage V0.1 »)
// Tous les chiffres sont des valeurs de prototypage, faites pour être ajustées.
// ─────────────────────────────────────────────────────────────

/** Durée réelle d'un « jour » économique de la ville, en minutes.
 *  60 = un jour de ville par heure réelle (la bourse, elle, suit le temps réel).
 *  Mettre 1440 pour un vrai jour. */
export const DAY_LENGTH_MINUTES = 60;

/** Nombre max de jours rattrapés quand le joueur revient après une absence. */
export const MAX_CATCHUP_DAYS = 24;

export const STARTING_CASH = 100_000;
export const STARTING_POPULATION = 250;

/** Part de la population qui cherche un emploi (population active). */
export const ACTIVE_RATIO = 0.6;

/** Impôt local par habitant et par jour (avant modificateurs). */
export const TAX_PER_RESIDENT = 1.1;

/** Entretien quotidien d'un bâtiment, en fraction de son coût. */
export const MAINTENANCE_RATE = 0.001;

/** Remboursement lors d'une démolition. */
export const DEMOLISH_REFUND = 0.5;

/** Frais de courtage : 0,1 % (minimum 1 €). */
export const TRADE_FEE_RATE = 0.001;
export const TRADE_FEE_MIN = 1;

/** Consommation par habitant et par jour. */
export const ENERGY_PER_RESIDENT = 0.2;
export const FOOD_PER_RESIDENT = 0.35;

/** Prix des ressources (€/unité). Import au prix plein, export à 70 %.
 *  NB : le doc prévoit 10 €/unité pour l'énergie ; à ce prix une petite centrale
 *  (100 unités/j) rapportait 1 000 €/j en export, bien plus qu'un commerce.
 *  Valeur réduite pour garder l'équilibre, à retester. */
export const RESOURCE_PRICES = { energy: 2, food: 1.5 } as const;
export const EXPORT_RATIO = 0.7;

export type Category = "housing" | "commerce" | "industry" | "services" | "agriculture" | "energy" | "civic";

export interface BuildingType {
  id: string;
  name: string;
  category: Category;
  cost: number;
  housing?: number;
  jobs?: number;
  revenue?: number; // €/jour
  energyProd?: number;
  energyUse?: number;
  foodProd?: number;
  /** Population minimale pour débloquer le bâtiment. */
  unlockPop?: number;
  buildable?: boolean;
  description: string;
}

export const BUILDINGS: BuildingType[] = [
  // 🏠 Logements
  { id: "house_s", name: "Petit quartier", category: "housing", cost: 20_000, housing: 100, description: "+100 habitants" },
  { id: "house_m", name: "Quartier résidentiel", category: "housing", cost: 75_000, housing: 500, unlockPop: 500, description: "+500 habitants" },
  { id: "house_l", name: "Grand quartier", category: "housing", cost: 300_000, housing: 2_500, unlockPop: 2_000, description: "+2 500 habitants" },
  { id: "house_xl", name: "Centre résidentiel", category: "housing", cost: 1_500_000, housing: 15_000, unlockPop: 10_000, description: "+15 000 habitants" },

  // 🏪 Commerce & services
  { id: "shop", name: "Commerce", category: "commerce", cost: 15_000, jobs: 40, revenue: 120, energyUse: 5, description: "Boutiques de quartier" },
  { id: "services", name: "Entreprise de services", category: "services", cost: 100_000, jobs: 150, revenue: 600, energyUse: 15, unlockPop: 600, description: "Bureaux, conseil, santé" },

  // 🏭 Industrie
  { id: "factory_s", name: "Petite usine", category: "industry", cost: 50_000, jobs: 100, revenue: 350, energyUse: 30, description: "Consomme de l'énergie" },
  { id: "factory_m", name: "Usine moyenne", category: "industry", cost: 250_000, jobs: 500, revenue: 2_000, energyUse: 150, unlockPop: 1_500, description: "Grosse consommatrice d'énergie" },
  { id: "factory_l", name: "Complexe industriel", category: "industry", cost: 1_000_000, jobs: 2_000, revenue: 9_000, energyUse: 600, unlockPop: 6_000, description: "Pilier d'une grande ville" },

  // 🌾 Agriculture
  { id: "farm_s", name: "Petite exploitation", category: "agriculture", cost: 40_000, jobs: 60, revenue: 100, foodProd: 100, energyUse: 5, description: "+100 nourriture/j" },
  { id: "farm_m", name: "Exploitation moyenne", category: "agriculture", cost: 200_000, jobs: 200, revenue: 400, foodProd: 700, energyUse: 20, unlockPop: 1_500, description: "+700 nourriture/j" },
  { id: "farm_l", name: "Grande exploitation", category: "agriculture", cost: 1_000_000, jobs: 800, revenue: 1_500, foodProd: 5_000, energyUse: 100, unlockPop: 8_000, description: "+5 000 nourriture/j" },

  // ⚡ Énergie
  { id: "power_s", name: "Petite centrale", category: "energy", cost: 50_000, jobs: 20, energyProd: 100, description: "+100 énergie/j" },
  { id: "power_m", name: "Centrale moyenne", category: "energy", cost: 300_000, jobs: 80, energyProd: 750, unlockPop: 1_500, description: "+750 énergie/j" },
  { id: "power_l", name: "Grande centrale", category: "energy", cost: 1_500_000, jobs: 300, energyProd: 5_000, unlockPop: 8_000, description: "+5 000 énergie/j" },

  // 🏛️ Bâtiments de départ (non constructibles)
  { id: "townhall", name: "Mairie", category: "civic", cost: 30_000, jobs: 30, energyUse: 5, buildable: false, description: "Administration de la ville" },
  { id: "village", name: "Village d'origine", category: "housing", cost: 50_000, housing: 250, buildable: false, description: "250 logements" },
];

export const BUILDING_BY_ID: Record<string, BuildingType> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** Ville de départ : 250 habitants, 250 logements, 150 emplois (doc §2). */
export const STARTING_BUILDINGS: Record<string, number> = {
  village: 1,
  townhall: 1,
  shop: 1,
  farm_s: 1,
  power_s: 1,
};

export const CATEGORY_LABELS: Record<Category, string> = {
  housing: "Logements",
  commerce: "Commerce",
  services: "Services",
  industry: "Industrie",
  agriculture: "Agriculture",
  energy: "Énergie",
  civic: "Administration",
};
