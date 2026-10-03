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

export type Category = "housing" | "commerce" | "industry" | "services" | "agriculture" | "energy" | "public" | "civic";

// ─── Équipements publics ──────────────────────────────────────
// Une ville qui grandit attend des équipements. Chacun dessert un nombre d'habitants ;
// la couverture (capacité / population) joue sur la satisfaction, donc sur les impôts et la croissance.
export type ServiceId = "park" | "school" | "hospital";
export interface ServiceRule {
  label: string;
  /** Population à partir de laquelle les habitants l'attendent. */
  needPop: number;
  /** Satisfaction perdue quand le besoin n'est pas couvert du tout. */
  weight: number;
}
export const SERVICES: Record<ServiceId, ServiceRule> = {
  park: { label: "Espaces verts", needPop: 1_000, weight: 0.04 },
  school: { label: "Écoles", needPop: 2_500, weight: 0.05 },
  hospital: { label: "Santé", needPop: 8_000, weight: 0.06 },
};
export const SERVICE_IDS = Object.keys(SERVICES) as ServiceId[];
/** Satisfaction gagnée par équipement entièrement couvert (même avant que le besoin n'apparaisse). */
export const SERVICE_BONUS = 0.015;

// ─── Rangs de ville ───────────────────────────────────────────
/** Paliers de population : donnent un cap au joueur et rythment les déblocages. */
export const CITY_RANKS: { name: string; pop: number }[] = [
  { name: "Village", pop: 0 },
  { name: "Bourg", pop: 500 },
  { name: "Petite ville", pop: 1_500 },
  { name: "Ville", pop: 5_000 },
  { name: "Grande ville", pop: 15_000 },
  { name: "Métropole", pop: 40_000 },
  { name: "Capitale économique", pop: 100_000 },
];

// ─── Objectifs de ville ───────────────────────────────────────
/** Ce qu'un objectif mesure (calculé par le moteur). */
export type GoalMetric = "population" | "net" | "autonomy" | "satisfaction" | "services";
export interface Goal {
  id: string;
  label: string;
  metric: GoalMetric;
  target: number;
  /** Population minimale pour que l'objectif compte (évite de le valider avec une ville minuscule). */
  minPop?: number;
  /** Subvention versée une seule fois. */
  reward: number;
}
export const GOALS: Goal[] = [
  { id: "pop_500", label: "Atteindre 500 habitants", metric: "population", target: 500, reward: 5_000 },
  { id: "net_1k", label: "Flux net de 1 000 € par jour", metric: "net", target: 1_000, reward: 10_000 },
  { id: "pop_2k", label: "Atteindre 2 000 habitants", metric: "population", target: 2_000, reward: 20_000 },
  { id: "autonomy", label: "Autonomie en énergie et en nourriture", metric: "autonomy", target: 1, minPop: 2_000, reward: 25_000 },
  { id: "happy", label: "Satisfaction de 95 %", metric: "satisfaction", target: 0.95, minPop: 5_000, reward: 50_000 },
  { id: "services", label: "Tous les équipements publics couverts", metric: "services", target: 1, minPop: 8_000, reward: 60_000 },
  { id: "net_10k", label: "Flux net de 10 000 € par jour", metric: "net", target: 10_000, reward: 75_000 },
  { id: "pop_10k", label: "Atteindre 10 000 habitants", metric: "population", target: 10_000, reward: 100_000 },
  { id: "pop_40k", label: "Devenir une métropole (40 000 habitants)", metric: "population", target: 40_000, reward: 400_000 },
];

// ─── Monde ────────────────────────────────────────────────────
/** Prix d'installation dans un pays, selon son poids économique (catégories 1 à 4, voir lib/world/countries). */
export const COUNTRY_PRICES = [50_000, 200_000, 600_000, 1_500_000] as const;

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
  /** Équipement public : besoin couvert et nombre d'habitants desservis. */
  service?: ServiceId;
  serves?: number;
  /** Population minimale pour débloquer le bâtiment. */
  unlockPop?: number;
  buildable?: boolean;
  description: string;
}

/** Amélioration sur place (recherche « Rénovation urbaine ») : bâtiment → sa version supérieure, pour la différence de prix. */
export const UPGRADES: Record<string, string> = {
  house_s: "house_m", house_m: "house_l", house_l: "house_xl",
  factory_s: "factory_m", factory_m: "factory_l",
  farm_s: "farm_m", farm_m: "farm_l",
  power_s: "power_m", power_m: "power_l",
  shop: "services",
};
/** Nombre de jours simulés par la recherche « Prévisions de la ville ». */
export const FORECAST_DAYS = 7;

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

  // 🌳 Équipements publics (pas de revenu direct : ils soutiennent la satisfaction)
  { id: "park", name: "Parc", category: "public", cost: 25_000, jobs: 5, service: "park", serves: 1_500, unlockPop: 500, description: "Espaces verts pour 1 500 habitants" },
  { id: "school", name: "École", category: "public", cost: 120_000, jobs: 60, energyUse: 10, service: "school", serves: 4_000, unlockPop: 1_500, description: "Scolarise 4 000 habitants" },
  { id: "hospital", name: "Hôpital", category: "public", cost: 450_000, jobs: 250, energyUse: 40, service: "hospital", serves: 12_000, unlockPop: 5_000, description: "Soigne 12 000 habitants" },

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
  public: "Équipements",
  civic: "Administration",
};
