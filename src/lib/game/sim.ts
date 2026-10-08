// Robot de test d'équilibrage (pur) : joue la ville avec une stratégie simple et raisonnable. En bourse il ne spécule pas :
// il place une part fixe de sa fortune à cours constant, juste de quoi produire le capital que les gros bâtiments demandent.
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
  // Pollution : des espaces verts dès qu'elle pèse sur la satisfaction
  if (c.pollution.penalty > 0.04) { const green = best(g, (b) => -(b.pollution ?? 0)); if (green) return green; }
  if (c.expenses.imports > c.income.total * 0.12) return undefined;
  // Des chômeurs : des emplois rentables. Des postes vacants ou une ville pleine : des logements.
  if (c.unemploymentRate > 0.04) return best(g, (b) => (b.jobs && profit(b) > 0 ? profit(b) : 0));
  if (c.freeHousing < Math.max(50, c.housing * 0.1)) return best(g, (b) => b.housing ?? 0);
  // Des postes vacants attirent de nouveaux habitants : on en garde toujours un peu d'avance
  if (c.openJobs < c.active * 0.15) return best(g, (b) => (b.jobs && profit(b) > 0 ? profit(b) : 0));
  return undefined;
}

export interface SimDay { day: number; population: number; net: number; cash: number; rank: number; buildings: number; satisfaction: number }

/** Part de sa fortune (liquidités + mises) que le robot garde placée en bourse. */
const INVESTED = 0.25;
const SYMBOL = "AAPL", PRICES = { [SYMBOL]: 100 };
/** Agrandit la Banque dès qu'elle bride les placements, puis complète la mise jusqu'à la part visée. */
function place(g: E.GameState, d: number): E.GameState {
  const staked = E.portfolioCost(g.holdings), target = (g.cash + staked) * INVESTED;
  const next = E.nextBank(g);
  if (next && target > E.investCap(g) && next.cost <= g.cash * 0.3) { const r = E.upgradeBank(g, d); if (r.ok) g = r.state; }
  const more = Math.min(target, E.investCap(g)) - staked;
  if (more < 1_000) return g;
  const r = E.buy(g, SYMBOL, E.sharesFor(more * E.cityLeverage(g, SYMBOL), PRICES[SYMBOL]), PRICES[SYMBOL], d);
  return r.ok ? r.state : g;
}

/** Joue `days` jours de ville. `claim` = encaisser les subventions d'objectifs, `invest` = placer en bourse.
 *  `waits` = nombre de jours où un bâtiment a attendu faute de capital. */
export function simulate(days: number, claim = true, invest = true): { days: SimDay[]; final: E.GameState; waits: number } {
  let g = E.newGame(0);
  let waits = 0;
  const out: SimDay[] = [];
  for (let d = 0; d < days; d++) {
    if (claim) for (const s of E.goalStatuses(g)) if (s.done && !s.claimed) { const r = E.claimGoal(g, s.goal.id, d); if (r.ok) g = r.state; }
    // Rénovation dès que la vétusté commence à coûter, si elle ne vide pas la caisse
    if ((g.wear ?? 0) >= 0.3 && E.renovateCost(g) <= g.cash * 0.6) { const r = E.renovate(g, d); if (r.ok) g = r.state; }
    if (invest) g = place(g, d);
    for (let i = 0; i < 40; i++) {
      const b = choose(g);
      if (!b) break;
      if (b.cost > g.cash) break; // il économise
      if (E.capitalCost(b) > (g.capital ?? 0)) { waits++; break; } // il attend que ses placements produisent le capital
      const r = E.build(g, b.id, d);
      if (!r.ok) break; // plus de place
      g = r.state;
    }
    g = E.tickDay(g, PRICES, d);
    const c = E.computeCity(g);
    out.push({ day: g.day, population: g.population, net: c.net, cash: g.cash, rank: c.rank, buildings: g.plots.length, satisfaction: c.satisfaction });
  }
  return { days: out, final: g, waits };
}
