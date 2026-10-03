// Robot de test d'équilibrage (pur) : joue la ville seule, sans la bourse, avec une stratégie simple et raisonnable.
// Sert à mesurer le rythme de progression (voir sim.test.ts), pas à jouer à la place du joueur.
import { BUILDINGS, EXPORT_RATIO, MAINTENANCE_RATE, RESOURCE_PRICES, SERVICE_IDS, type BuildingType } from "./config";
import * as E from "./engine";

/** Le robot vise ce qu'il peut s'offrir tout de suite ou en économisant une vingtaine de jours. */
let reach = 0;
const can = (g: E.GameState, b: BuildingType) => b.buildable !== false && (!b.unlockPop || g.population >= b.unlockPop) && b.cost <= g.cash + reach;
/** Meilleur rapport utilité / prix ; à rapport proche, le plus gros bâtiment (pour ne pas couvrir la carte de petits). */
function best(g: E.GameState, score: (b: BuildingType) => number) {
  const list = BUILDINGS.filter((b) => can(g, b) && score(b) > 0).sort((a, b) => score(b) / b.cost - score(a) / a.cost);
  if (!list.length) return undefined;
  const top = score(list[0]) / list[0].cost;
  return list.filter((b) => score(b) / b.cost >= top * 0.7).sort((a, b) => b.cost - a.cost)[0];
}
const profit = (b: BuildingType) => (b.revenue ?? 0) + (b.foodProd ?? 0) * RESOURCE_PRICES.food * EXPORT_RATIO - (b.energyUse ?? 0) * RESOURCE_PRICES.energy - b.cost * MAINTENANCE_RATE;

/** Ce que le robot construirait maintenant, ou null s'il préfère attendre. */
function choose(g: E.GameState): BuildingType | undefined {
  const c = E.computeCity(g);
  reach = Math.max(0, c.net) * 20;
  // Déficits et équipements : réglés dès qu'on en a les moyens. Si les importations pèsent lourd, on économise pour ça.
  const fix = (c.energy.balance < 0 && best(g, (b) => b.energyProd ?? 0)) || (c.food.balance < 0 && best(g, (b) => b.foodProd ?? 0))
    || SERVICE_IDS.map((id) => c.services[id].needed && c.services[id].coverage < 1 && best(g, (b) => (b.service === id ? b.serves ?? 0 : 0))).find(Boolean);
  if (fix) return fix;
  if (c.expenses.imports > c.income.total * 0.12) return undefined;
  // Des chômeurs : des emplois rentables. Des postes vacants ou une ville pleine : des logements.
  if (c.unemploymentRate > 0.04) return best(g, (b) => (b.jobs && profit(b) > 0 ? profit(b) : 0));
  if (c.freeHousing < Math.max(50, c.housing * 0.1)) return best(g, (b) => b.housing ?? 0);
  // Des postes vacants attirent de nouveaux habitants : on en garde toujours un peu d'avance
  if (c.openJobs < c.active * 0.15) return best(g, (b) => (b.jobs && profit(b) > 0 ? profit(b) : 0));
  return undefined;
}

export interface SimDay { day: number; population: number; net: number; cash: number; rank: number; buildings: number; satisfaction: number }

/** Joue `days` jours de ville. `claim` = encaisser les subventions d'objectifs. */
export function simulate(days: number, claim = true): { days: SimDay[]; final: E.GameState } {
  let g = E.newGame(0);
  const out: SimDay[] = [];
  for (let d = 0; d < days; d++) {
    if (claim) for (const s of E.goalStatuses(g)) if (s.done && !s.claimed) { const r = E.claimGoal(g, s.goal.id, d); if (r.ok) g = r.state; }
    for (let i = 0; i < 40; i++) {
      const b = choose(g);
      if (!b) break;
      if (b.cost > g.cash) break; // il économise
      const r = E.build(g, b.id, d);
      if (!r.ok || r.state.plots.length === g.plots.length) break; // plus de place
      g = r.state;
    }
    g = E.tickDay(g, {}, d);
    const c = E.computeCity(g);
    out.push({ day: g.day, population: g.population, net: c.net, cash: g.cash, rank: c.rank, buildings: g.plots.length, satisfaction: c.satisfaction });
  }
  return { days: out, final: g };
}
