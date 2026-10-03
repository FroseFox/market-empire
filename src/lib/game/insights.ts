// Alertes et objectifs. Règle de la charte : une alerte n'apparaît que si
// le joueur peut agir dessus.
import type { CityStats, GameState, Prices } from "./engine";
import { goalStatuses, portfolioValue } from "./engine";
import { SERVICES, SERVICE_IDS } from "./config";

export type AlertLevel = "info" | "warning" | "danger" | "success";
export interface Alert { id: string; level: AlertLevel; title: string; detail: string; href: string }

export function computeAlerts(state: GameState, city: CityStats, prices: Prices): Alert[] {
  const out: Alert[] = [];
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

  if (state.cash < 0) {
    out.push({ id: "cash", level: "danger", title: "Liquidités négatives", detail: "Vendez des actifs ou démolissez un bâtiment.", href: "/portefeuille" });
  }
  if (city.energy.balance < 0) {
    out.push({ id: "energy", level: "warning", title: "Votre ville manque d'énergie", detail: `Déficit de ${fmt(-city.energy.balance)}/j, importé au prix fort.`, href: "/ville" });
  }
  if (city.food.balance < 0) {
    out.push({ id: "food", level: "warning", title: "Vous devez importer de la nourriture", detail: `Déficit de ${fmt(-city.food.balance)}/j.`, href: "/ville" });
  }
  if (city.unemployed > 0 && city.unemploymentRate >= 0.08) {
    out.push({ id: "jobs", level: "warning", title: `${fmt(city.unemployed)} habitants recherchent un emploi`, detail: "Construisez un commerce, une usine ou des services.", href: "/ville" });
  }
  if (city.freeHousing === 0 && city.openJobs > 0) {
    out.push({ id: "housing", level: "info", title: "Votre ville est pleine", detail: `${fmt(city.openJobs)} emplois attendent des habitants : construisez des logements.`, href: "/ville" });
  }
  const missing = SERVICE_IDS.filter((id) => city.services[id].needed && city.services[id].coverage < 1);
  if (missing.length) {
    out.push({ id: "services", level: "warning", title: "Il manque des équipements publics", detail: `${missing.map((id) => SERVICES[id].label).join(", ")} : la satisfaction baisse.`, href: "/ville" });
  }
  const toClaim = goalStatuses(state, city).filter((g) => g.done && !g.claimed);
  if (toClaim.length) {
    out.push({ id: "goals", level: "success", title: `${toClaim.length} subvention${toClaim.length > 1 ? "s" : ""} à encaisser`, detail: `${fmt(toClaim.reduce((a, g) => a + g.goal.reward, 0))} € vous attendent dans Ville › Objectifs.`, href: "/ville" });
  }
  const pv = portfolioValue(state.holdings, prices);
  if (pv > 5_000) {
    for (const [sym, h] of Object.entries(state.holdings)) {
      const share = (h.qty * (prices[sym] ?? h.avgCost)) / pv;
      if (share >= 0.3 && Object.keys(state.holdings).length > 1) {
        out.push({ id: `conc-${sym}`, level: "info", title: `${sym} représente ${Math.round(share * 100)} % de votre portefeuille`, detail: "Risque de concentration.", href: "/portefeuille" });
      }
    }
  }
  return out;
}

export interface Objective { id: string; title: string; current: number; target: number; done: boolean; unit?: string }

export function computeObjectives(state: GameState, city: CityStats, netWorth: number): Objective[] {
  const positions = Object.keys(state.holdings).length;
  const list: Objective[] = [
    { id: "first-trade", title: "Réaliser un premier investissement", current: Math.min(positions, 1), target: 1, done: false },
    { id: "pop-500", title: "Atteindre 500 habitants", current: state.population, target: 500, done: false },
    { id: "trade-pos", title: "Balance commerciale positive", current: city.tradeBalance > 0 ? 1 : 0, target: 1, done: false },
    { id: "diversify", title: "Détenir 5 actions différentes", current: positions, target: 5, done: false },
    { id: "nw-250k", title: "Atteindre 250 000 € de patrimoine", current: netWorth, target: 250_000, done: false, unit: "€" },
    { id: "pop-1000", title: "Atteindre 1 000 habitants", current: state.population, target: 1_000, done: false },
    { id: "pop-5000", title: "Atteindre 5 000 habitants", current: state.population, target: 5_000, done: false },
    { id: "nw-1m", title: "Atteindre 1 000 000 € de patrimoine", current: netWorth, target: 1_000_000, done: false, unit: "€" },
  ];
  for (const o of list) o.done = o.current >= o.target;
  return list;
}
