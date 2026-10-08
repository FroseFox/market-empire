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

/** Impôt local par habitant et par jour (avant modificateurs).
 *  Rythme calé avec le robot de lib/game/sim.ts : à 1,1 € (valeur du doc), une ville seule mettait plus de 550 jours
 *  pour atteindre 1 500 habitants. Les impôts et les revenus des entreprises ont été relevés (× 2 environ)
 *  pour qu'une partie tienne en 2 semaines à 1 mois. */
export const TAX_PER_RESIDENT = 2.5;

/** Dotation de démarrage : l'État soutient les petites communes. Versée chaque jour, elle diminue à mesure que la
 *  population grandit et disparaît à `untilPop` habitants. Elle accélère seulement le début de partie (où l'on
 *  posait un bâtiment par jour réel) sans raccourcir la suite : passé ce seuil, le rythme est inchangé. */
/* Réglage mesuré avec le robot de lib/game/sim.ts : sans dotation, Petite ville demandait 11 jours réels et la ville ne
 * comptait que 29 bâtiments après deux semaines ; avec, 3 jours et 48 bâtiments. Capitale économique reste à 3-4 semaines. */
export const START_GRANT = { perDay: 10_000, untilPop: 6_000 };

/** Entretien quotidien d'un bâtiment, en fraction de son coût. */
export const MAINTENANCE_RATE = 0.001;

/** Remboursement lors d'une démolition. */
export const DEMOLISH_REFUND = 0.5;

/** Frais de courtage : 0,1 % (minimum 1 €). */
export const TRADE_FEE_RATE = 0.001;
export const TRADE_FEE_MIN = 1;

// ─── Effet de levier ──────────────────────────────────────────
// La ville tourne 24 fois plus vite que la bourse (1 jour de ville = 1 heure réelle, les cours suivent le temps réel) :
// sans levier, un placement ne pèse rien face aux revenus de la ville. Le levier ne touche pas aux cours :
// il multiplie l'exposition du joueur, donc ses gains comme ses pertes.
// Il n'y a qu'une seule façon d'investir : chaque achat est multiplié par le levier de la ville (voir BANK).
export const LEVERAGE = {
  /** Levier maximal par type d'actif, comme chez un vrai courtier : plus l'actif est volatil, moins on prête. */
  maxByKind: { stock: 5, etf: 5, commodity: 5, crypto: 2 } as Record<string, number>,
  /** Intérêts sur la somme empruntée, par jour de ville. */
  dayRate: 0.0002,
  /** La ligne est vendue d'office quand il ne reste plus que cette part de la mise. */
  liquidation: 0.1,
};

// ─── Banque de la ville (lien ville → bourse) ─────────────────
/** Chaque niveau fixe le levier de tous les achats et le plafond de mise totale en bourse.
 *  Le niveau suivant s'achète avec les liquidités de la ville, à partir d'un rang donné (indice dans CITY_RANKS). */
export const BANK: { lev: number; cap: number; cost: number; minRank: number }[] = [
  { lev: 1.5, cap: 50_000, cost: 0, minRank: 0 },
  { lev: 2, cap: 150_000, cost: 25_000, minRank: 1 },
  { lev: 2.5, cap: 500_000, cost: 100_000, minRank: 2 },
  { lev: 3, cap: 2_000_000, cost: 400_000, minRank: 3 },
  { lev: 4, cap: 10_000_000, cost: 1_500_000, minRank: 4 },
  { lev: 5, cap: Infinity, cost: 6_000_000, minRank: 5 },
];

// ─── Capital (lien bourse → ville) ────────────────────────────
// Deuxième monnaie : seuls les placements en produisent. Les gros bâtiments en demandent en plus de leur prix,
// donc une ville ne grandit plus sans la bourse. Ce n'est jamais un conseil : n'importe quel actif en produit,
// au prorata de ce que vaut la ligne.
export const CAPITAL = {
  /** Capital produit par jour de ville, en part de la valeur des placements. */
  dayRate: 0.02,
  /** Capital demandé par un bâtiment, en part de son prix… */
  share: 0.1,
  /** …à partir de ce prix (les petits bâtiments du début n'en demandent pas). */
  fromCost: 100_000,
  /** Parties d'avant le capital : elles reçoivent ce nombre de jours de production d'avance. */
  legacyDays: 10,
};

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
export type ServiceId = "park" | "school" | "safety" | "hospital";
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
  safety: { label: "Sécurité", needPop: 4_000, weight: 0.05 },
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
  { name: "Mégapole", pop: 250_000 },
  { name: "Ville-monde", pop: 600_000 },
];

// ─── Objectifs de ville ───────────────────────────────────────
/** Ce qu'un objectif mesure (calculé par le moteur). */
export type GoalMetric = "population" | "net" | "autonomy" | "satisfaction" | "services" | "projects" | "branches";
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
  { id: "net_1k", label: "Flux net de 2 500 € par jour", metric: "net", target: 2_500, reward: 10_000 },
  { id: "pop_2k", label: "Atteindre 2 000 habitants", metric: "population", target: 2_000, reward: 20_000 },
  { id: "autonomy", label: "Autonomie en énergie et en nourriture", metric: "autonomy", target: 1, minPop: 2_000, reward: 25_000 },
  { id: "happy", label: "Satisfaction de 95 %", metric: "satisfaction", target: 0.95, minPop: 5_000, reward: 50_000 },
  { id: "services", label: "Tous les équipements publics couverts", metric: "services", target: 1, minPop: 8_000, reward: 60_000 },
  { id: "net_10k", label: "Flux net de 25 000 € par jour", metric: "net", target: 25_000, reward: 75_000 },
  { id: "pop_10k", label: "Atteindre 10 000 habitants", metric: "population", target: 10_000, reward: 100_000 },
  { id: "pop_40k", label: "Devenir une métropole (40 000 habitants)", metric: "population", target: 40_000, reward: 400_000 },
  // Objectifs longs (fin de partie)
  { id: "branches_3", label: "Accueillir 3 entreprises dont vous êtes actionnaire", metric: "branches", target: 3, reward: 150_000 },
  { id: "pop_100k", label: "Devenir une capitale économique (100 000 habitants)", metric: "population", target: 100_000, reward: 1_000_000 },
  { id: "project_1", label: "Achever un premier grand projet", metric: "projects", target: 1, reward: 500_000 },
  { id: "pop_250k", label: "Devenir une mégapole (250 000 habitants)", metric: "population", target: 250_000, reward: 3_000_000 },
  { id: "project_all", label: "Achever les quatre grands projets", metric: "projects", target: 4, reward: 10_000_000 },
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
  /** Pollution émise par jour (négatif : le bâtiment en absorbe). */
  pollution?: number;
  /** Population minimale pour débloquer le bâtiment. */
  unlockPop?: number;
  buildable?: boolean;
  description: string;
}

/** Amélioration sur place (recherche « Rénovation urbaine ») : bâtiment → sa version supérieure, pour la différence de prix. */
export const UPGRADES: Record<string, string> = {
  house_s: "house_m", house_m: "house_l", house_l: "house_xl", house_xl: "house_tower",
  factory_s: "factory_m", factory_m: "factory_l",
  farm_s: "farm_m", farm_m: "farm_l",
  power_s: "power_m", power_m: "power_l",
  shop: "market", market: "mall",
  services: "bank",
  solar: "wind",
  park: "park_l", school: "university",
};
/** Nombre de jours simulés par la recherche « Prévisions de la ville ». */
export const FORECAST_DAYS = 7;

export const BUILDINGS: BuildingType[] = [
  // 🏠 Logements
  { id: "house_s", name: "Petit quartier", category: "housing", cost: 20_000, housing: 100, description: "+100 habitants" },
  { id: "house_m", name: "Quartier résidentiel", category: "housing", cost: 75_000, housing: 500, unlockPop: 500, description: "+500 habitants" },
  { id: "house_l", name: "Grand quartier", category: "housing", cost: 300_000, housing: 2_500, unlockPop: 2_000, description: "+2 500 habitants" },
  { id: "house_eco", name: "Écoquartier", category: "housing", cost: 500_000, housing: 3_000, energyProd: 150, unlockPop: 4_000, pollution: -20, description: "+3 000 habitants, toits solaires" },
  { id: "house_xl", name: "Centre résidentiel", category: "housing", cost: 1_500_000, housing: 15_000, unlockPop: 10_000, description: "+15 000 habitants" },
  { id: "house_tower", name: "Tour d'habitation", category: "housing", cost: 5_000_000, housing: 55_000, energyUse: 400, unlockPop: 40_000, description: "+55 000 habitants sur un seul carreau" },

  // 🏪 Commerce & services
  { id: "shop", name: "Commerce", category: "commerce", cost: 15_000, jobs: 40, revenue: 240, energyUse: 5, description: "Boutiques de quartier" },
  { id: "market", name: "Marché couvert", category: "commerce", cost: 60_000, jobs: 120, revenue: 1_040, energyUse: 15, unlockPop: 800, description: "Halle et commerçants" },
  { id: "hotel", name: "Hôtel", category: "commerce", cost: 180_000, jobs: 150, revenue: 3_000, energyUse: 40, unlockPop: 2_500, description: "Peu d'emplois, beaucoup de revenus" },
  { id: "mall", name: "Centre commercial", category: "commerce", cost: 350_000, jobs: 600, revenue: 6_400, energyUse: 90, unlockPop: 4_000, pollution: 8, description: "Grande surface et galerie" },
  { id: "services", name: "Entreprise de services", category: "services", cost: 100_000, jobs: 150, revenue: 1_200, energyUse: 15, unlockPop: 600, description: "Bureaux, conseil, santé" },
  { id: "bank", name: "Banque", category: "services", cost: 400_000, jobs: 300, revenue: 6_000, energyUse: 40, unlockPop: 5_000, description: "Siège bancaire régional" },
  { id: "tech", name: "Campus technologique", category: "services", cost: 1_200_000, jobs: 1_500, revenue: 22_000, energyUse: 300, unlockPop: 12_000, description: "Emplois qualifiés, très énergivore" },

  // 🏭 Industrie
  { id: "factory_s", name: "Petite usine", category: "industry", cost: 50_000, jobs: 100, revenue: 700, energyUse: 30, pollution: 10, description: "Consomme de l'énergie" },
  { id: "warehouse", name: "Entrepôt logistique", category: "industry", cost: 120_000, jobs: 250, revenue: 1_400, energyUse: 20, unlockPop: 1_000, pollution: 5, description: "Beaucoup d'emplois, peu d'énergie" },
  { id: "factory_m", name: "Usine moyenne", category: "industry", cost: 250_000, jobs: 500, revenue: 4_000, energyUse: 150, unlockPop: 1_500, pollution: 40, description: "Grosse consommatrice d'énergie" },
  { id: "factory_l", name: "Complexe industriel", category: "industry", cost: 1_000_000, jobs: 2_000, revenue: 18_000, energyUse: 600, unlockPop: 6_000, pollution: 150, description: "Pilier d'une grande ville" },

  { id: "foodplant", name: "Usine agroalimentaire", category: "industry", cost: 300_000, jobs: 350, revenue: 2_400, energyUse: 80, foodProd: 1_000, unlockPop: 3_000, pollution: 20, description: "Revenus et +1 000 nourriture/j" },

  // 🌾 Agriculture
  { id: "farm_s", name: "Petite exploitation", category: "agriculture", cost: 40_000, jobs: 60, revenue: 200, foodProd: 100, energyUse: 5, pollution: -3, description: "+100 nourriture/j" },
  { id: "greenhouse", name: "Serres", category: "agriculture", cost: 150_000, jobs: 80, revenue: 400, foodProd: 900, energyUse: 60, unlockPop: 1_000, description: "+900 nourriture/j, consomme de l'énergie" },
  { id: "farm_m", name: "Exploitation moyenne", category: "agriculture", cost: 200_000, jobs: 200, revenue: 800, foodProd: 700, energyUse: 20, unlockPop: 1_500, pollution: -8, description: "+700 nourriture/j" },
  { id: "ranch", name: "Élevage", category: "agriculture", cost: 250_000, jobs: 150, revenue: 1_000, foodProd: 1_200, energyUse: 15, unlockPop: 2_500, pollution: -5, description: "+1 200 nourriture/j" },
  { id: "farm_l", name: "Grande exploitation", category: "agriculture", cost: 1_000_000, jobs: 800, revenue: 3_000, foodProd: 5_000, energyUse: 100, unlockPop: 8_000, pollution: -25, description: "+5 000 nourriture/j" },

  // ⚡ Énergie
  { id: "power_s", name: "Petite centrale", category: "energy", cost: 50_000, jobs: 20, energyProd: 100, description: "+100 énergie/j" },
  { id: "solar", name: "Parc solaire", category: "energy", cost: 120_000, jobs: 5, energyProd: 220, unlockPop: 800, description: "+220 énergie/j, presque sans personnel" },
  { id: "power_m", name: "Centrale moyenne", category: "energy", cost: 300_000, jobs: 80, energyProd: 750, unlockPop: 1_500, pollution: 60, description: "+750 énergie/j" },
  { id: "wind", name: "Parc éolien", category: "energy", cost: 400_000, jobs: 15, energyProd: 900, unlockPop: 3_000, description: "+900 énergie/j, presque sans personnel" },
  { id: "power_l", name: "Grande centrale", category: "energy", cost: 1_500_000, jobs: 300, energyProd: 5_000, unlockPop: 8_000, pollution: 120, description: "+5 000 énergie/j" },

  // 🌳 Équipements publics (pas de revenu direct : ils soutiennent la satisfaction)
  { id: "park", name: "Parc", category: "public", cost: 25_000, jobs: 5, service: "park", serves: 1_500, unlockPop: 500, pollution: -25, description: "Espaces verts pour 1 500 habitants" },
  { id: "school", name: "École", category: "public", cost: 120_000, jobs: 60, energyUse: 10, service: "school", serves: 4_000, unlockPop: 1_500, description: "Scolarise 4 000 habitants" },
  { id: "fire", name: "Caserne de pompiers", category: "public", cost: 90_000, jobs: 40, energyUse: 10, service: "safety", serves: 6_000, unlockPop: 2_500, description: "Protège 6 000 habitants" },
  { id: "park_l", name: "Grand parc", category: "public", cost: 140_000, jobs: 20, service: "park", serves: 10_000, unlockPop: 5_000, pollution: -150, description: "Espaces verts pour 10 000 habitants" },
  { id: "university", name: "Université", category: "public", cost: 500_000, jobs: 300, energyUse: 40, service: "school", serves: 20_000, unlockPop: 8_000, description: "Forme 20 000 habitants" },
  { id: "hospital", name: "Hôpital", category: "public", cost: 450_000, jobs: 250, energyUse: 40, service: "hospital", serves: 12_000, unlockPop: 5_000, description: "Soigne 12 000 habitants" },

  // 🏛️ Bâtiments de départ (non constructibles)
  { id: "townhall", name: "Mairie", category: "civic", cost: 30_000, jobs: 30, energyUse: 5, buildable: false, description: "Administration de la ville" },
  // 🏢 Site d'une entreprise implantée : un par entreprise, posé par le jeu (ses effets viennent de BRANCH_EFFECTS)
  { id: "branch", name: "Site d'entreprise", category: "services", cost: 0, buildable: false, description: "Entreprise dont vous êtes actionnaire" },
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

// ─── Entreprises implantées (lien bourse → ville) ─────────────
// Une entreprise dont le joueur est actionnaire peut ouvrir un site dans sa ville : il apporte emplois et revenus
// tant que la participation est conservée. Ce n'est jamais un conseil d'achat : l'effet ne dépend pas du cours.
export type BranchFamily = "Tech" | "Finance" | "Consommation" | "Santé" | "Industrie" | "Énergie et matières";
/** Valeur minimale de la participation (en €) au moment de l'implantation. */
export const BRANCH_MIN_VALUE = 10_000;
/** Frais d'implantation : ce montant × (nombre de sites déjà ouverts + 1). */
export const BRANCH_COST = 40_000;
export interface BranchEffect { label: string; jobs: number; revenue: number; energyUse?: number; energyProd?: number; foodProd?: number; service?: ServiceId; serves?: number }
export const BRANCH_EFFECTS: Record<BranchFamily, BranchEffect> = {
  Tech: { label: "Centre de recherche", jobs: 250, revenue: 1_400, energyUse: 40 },
  Finance: { label: "Agence régionale", jobs: 120, revenue: 1_600, energyUse: 10 },
  Consommation: { label: "Magasin phare", jobs: 300, revenue: 1_200, energyUse: 25 },
  "Santé": { label: "Laboratoire", jobs: 150, revenue: 900, energyUse: 20, service: "hospital", serves: 4_000 },
  Industrie: { label: "Site de production", jobs: 400, revenue: 1_300, energyUse: 80 },
  "Énergie et matières": { label: "Site énergétique", jobs: 60, revenue: 300, energyProd: 350 },
};

// ─── Spécialités des pays ─────────────────────────────────────
export type Specialty = "energy" | "agri" | "industry" | "commerce" | "services" | "finance";
export const SPECIALTY_LABEL: Record<Specialty, string> = {
  energy: "Énergie", agri: "Agriculture", industry: "Industrie", commerce: "Commerce et tourisme", services: "Services", finance: "Finance",
};
/** Bonus de la spécialité selon la catégorie de prix du pays (1 à 4) : un pays cher apporte plus. */
export const SPECIALTY_BONUS = [0.06, 0.1, 0.15, 0.2] as const;
/** Spécialité « Finance » : la baisse des frais de courtage vaut ce multiple du bonus (catégorie 4 : −40 %). */
export const FINANCE_FEE_FACTOR = 2;

// ─── Places financières ───────────────────────────────────────
/** Ouvrir un bureau dans une place financière (gratuit si la ville est dans son pays). */
export const HUB_DESK_COST = 120_000;
/** Frais de courtage sur les actifs que la place couvre, bureau ouvert. */
export const HUB_FEE_FACTOR = 0.5;

// ─── Commerce entre joueurs ───────────────────────────────────
/** Prix d'un contrat entre joueurs, en part du prix plein : entre l'export (70 %) et l'import (100 %). */
export const CONTRACT_RATIO = 0.85;
export const MAX_CONTRACTS = 6;

// ─── Tensions de la ville ─────────────────────────────────────
/** Pollution nette pour 100 habitants → points de satisfaction perdus (plafonnés). */
export const POLLUTION_FACTOR = 0.04;
export const POLLUTION_MAX = 0.15;
/** Vétusté : gagnée chaque jour à partir du rang « Bourg » (100 % en un peu plus de 330 jours sans rénovation). */
export const WEAR_PER_DAY = 0.003;
/** À 100 % de vétusté : entretien doublé et satisfaction en baisse de 10 points. */
export const WEAR_MAINTENANCE = 1;
export const WEAR_SATISFACTION = 0.1;
/** Coût d'une rénovation complète : vétusté × valeur des bâtiments × ce taux. */
export const RENOVATE_RATE = 0.03;
/** Les attentes en équipements montent avec le rang : +10 % de pénalité par rang. */
export const NEED_PER_RANK = 0.1;

// ─── Orientation de la ville ──────────────────────────────────
// Un choix qui engage : chaque orientation a un avantage et un revers. On n'en a qu'une à la fois.
export type OrientationId = "industrial" | "green" | "financial" | "merchant";
export interface Orientation {
  id: OrientationId; name: string; pro: string; con: string;
  /** Revenus par catégorie de bâtiment (+0,2 = +20 %). */
  revenue?: Partial<Record<Category, number>>;
  /** Multiplicateurs : pollution émise, production d'énergie, de nourriture, frais de courtage. */
  pollution?: number; energy?: number; food?: number; fees?: number;
  /** Points de satisfaction. */
  satisfaction?: number;
}
export const ORIENTATIONS: Orientation[] = [
  { id: "industrial", name: "Cité industrielle", pro: "Industrie : revenus +20 %", con: "Pollution +30 %, services −10 %", revenue: { industry: 0.2, services: -0.1 }, pollution: 1.3 },
  { id: "green", name: "Ville verte", pro: "Pollution −60 %, satisfaction +3 points, énergie +10 %", con: "Industrie : revenus −15 %", revenue: { industry: -0.15 }, pollution: 0.4, satisfaction: 0.03, energy: 1.1 },
  { id: "financial", name: "Place d'affaires", pro: "Services : revenus +15 %, frais de courtage −15 %", con: "Production de nourriture −15 %", revenue: { services: 0.15 }, fees: 0.85, food: 0.85 },
  { id: "merchant", name: "Carrefour marchand", pro: "Commerce : revenus +20 %", con: "Industrie : revenus −10 %, énergie −10 %", revenue: { commerce: 0.2, industry: -0.1 }, energy: 0.9 },
];
export const ORIENTATION_BY_ID = Object.fromEntries(ORIENTATIONS.map((o) => [o.id, o])) as Record<OrientationId, Orientation>;
/** Rang à partir duquel on choisit une orientation (indice dans CITY_RANKS). Le premier choix est gratuit. */
export const ORIENTATION_MIN_RANK = 2;
/** Changer d'orientation : ce montant × le rang de la ville. */
export const ORIENTATION_CHANGE_COST = 150_000;

// ─── Fonctions qui s'ouvrent avec le rang ─────────────────────
/** Pour ne pas tout montrer d'un coup : chaque système apparaît au rang où il devient utile. */
export type FeatureId = "firms" | "orientation" | "trade" | "hubs" | "projects";
export const FEATURES: { id: FeatureId; rank: number; label: string; text: string; href: string }[] = [
  { id: "firms", rank: 1, label: "Entreprises implantées", text: "Une entreprise dont vous êtes actionnaire peut ouvrir un site dans votre ville (bouton Entreprises).", href: "/ville" },
  { id: "orientation", rank: ORIENTATION_MIN_RANK, label: "Orientation de la ville", text: "Choisissez ce que votre ville veut être : industrielle, verte, d'affaires ou marchande (bouton Objectifs).", href: "/ville" },
  { id: "trade", rank: 2, label: "Commerce entre joueurs", text: "Achetez par contrat le surplus d'énergie ou de nourriture d'un autre joueur (Monde › Commerce).", href: "/monde" },
  { id: "hubs", rank: 2, label: "Places financières", text: "Ouvrez un bureau dans une place financière pour réduire vos frais de courtage (Monde).", href: "/monde" },
  { id: "projects", rank: 3, label: "Grands projets et territoire", text: "Agrandissez votre territoire et lancez des projets qui marquent votre ville (bouton Objectifs).", href: "/ville" },
];

// ─── Territoire ───────────────────────────────────────────────
/** Agrandissements du territoire : côté de la carte, prix, rang de ville minimal. Compté dans le patrimoine. */
export const TERRITORY: { size: number; cost: number; minRank: number }[] = [
  { size: 32, cost: 0, minRank: 0 },
  { size: 40, cost: 2_000_000, minRank: 4 },
  { size: 48, cost: 10_000_000, minRank: 6 },
];

// ─── Grands projets (fin de partie) ───────────────────────────
export interface Project {
  id: string; name: string; description: string; cost: number;
  /** Rang de ville minimal (indice dans CITY_RANKS). */
  minRank: number;
  prestige: number;
  /** Avantage permanent. */
  perk: { kind: "revenue"; category: Category; bonus: number } | { kind: "fees"; factor: number } | { kind: "satisfaction"; bonus: number };
}
export const PROJECTS: Project[] = [
  { id: "airport", name: "Aéroport international", description: "Commerces : +10 % de revenus.", cost: 4_000_000, minRank: 4, prestige: 100, perk: { kind: "revenue", category: "commerce", bonus: 0.1 } },
  { id: "exchange", name: "Bourse de la ville", description: "Frais de courtage : −25 % sur tous les actifs.", cost: 12_000_000, minRank: 5, prestige: 250, perk: { kind: "fees", factor: 0.75 } },
  { id: "expo", name: "Exposition universelle", description: "Satisfaction : +3 points.", cost: 35_000_000, minRank: 6, prestige: 600, perk: { kind: "satisfaction", bonus: 0.03 } },
  { id: "space", name: "Centre spatial", description: "Services : +10 % de revenus.", cost: 90_000_000, minRank: 7, prestige: 1_500, perk: { kind: "revenue", category: "services", bonus: 0.1 } },
];
export const PROJECT_BY_ID: Record<string, Project> = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));
/** Prestige : rang, objectifs et grands projets. */
export const PRESTIGE_PER_RANK = 50;
export const PRESTIGE_PER_GOAL = 10;
