// Étapes du guide de démarrage. Chacune se valide toute seule, d'après l'état de la partie.
import { BUILDING_BY_ID, STARTING_BUILDINGS } from "./config";
import type { GameState } from "./engine";
import { STARTING_RESEARCH } from "./research";

export interface GuideStep { id: string; title: string; text: string; href: string; cta: string; done: (g: GameState) => boolean }

/** Bâtiments construits par le joueur (hors ville de départ) répondant à un critère. */
const built = (g: GameState, test: (id: string) => boolean) =>
  Object.entries(g.buildings).some(([id, n]) => test(id) && n > (STARTING_BUILDINGS[id] ?? 0));

export const GUIDE: GuideStep[] = [
  { id: "invest", title: "Investissez en bourse", href: "/marches", cta: "Ouvrir les Marchés",
    text: "Choisissez une entreprise, tapez votre mise en euros et achetez : la Banque de votre ville la multiplie, et vos placements produisent le capital que les gros bâtiments demandent. Les cours suivent la vraie bourse : à vous de juger, je ne donne jamais de conseil d'achat.",
    done: (g) => Object.keys(g.holdings).length > 0 || g.transactions.some((t) => t.kind === "buy") },
  { id: "housing", title: "Logez de nouveaux habitants", href: "/ville", cta: "Aller à la Ville",
    text: "Dans la Ville, ouvrez « Construire » et posez un Petit quartier. Chaque habitant paie des impôts tous les jours.",
    done: (g) => built(g, (id) => !!BUILDING_BY_ID[id]?.housing) },
  { id: "jobs", title: "Créez des emplois", href: "/ville", cta: "Aller à la Ville",
    text: "Des habitants sans travail sont mécontents. Construisez un Commerce ou une Petite usine : ils rapportent en plus des revenus.",
    done: (g) => built(g, (id) => !!BUILDING_BY_ID[id]?.jobs && id !== "branch") },
  { id: "goal", title: "Encaissez une subvention", href: "/ville", cta: "Voir les Objectifs",
    text: "Le bouton « Objectifs » de la Ville liste des paliers à atteindre. Le premier, 500 habitants, rapporte 5 000 €.",
    done: (g) => (g.goals?.length ?? 0) > 0 },
  { id: "research", title: "Débloquez une recherche", href: "/recherche", cta: "Voir la Recherche",
    text: "L'arbre de compétences ouvre de nouveaux marchés et de meilleurs outils d'analyse. Il ne donne jamais de bonus sur vos gains.",
    done: (g) => g.research.length > STARTING_RESEARCH.length },
];

/** Première étape pas encore faite, ou -1 quand le guide est terminé. */
export const guideIndex = (g: GameState) => GUIDE.findIndex((s) => !s.done(g));
