// Alertes et objectifs. Règle de la charte : une alerte n'apparaît que si
// le joueur peut agir dessus.
import type { CityStats, GameState, Prices } from "./engine";
import { activeBranches, branchLimit, capitalPerDay, cityRank, featureOpen, goalStatuses, holdingValue, investCap, investRoom, nextBank, portfolioValue, renovateCost } from "./engine";
import { BRANCH_MIN_VALUE, CAPITAL, CITY_RANKS, ORIENTATION_MIN_RANK, SERVICES, SERVICE_IDS } from "./config";
import { ASSET_BY_SYMBOL } from "../market/universe";

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
  if (city.wear >= 0.5) {
    out.push({ id: "wear", level: "warning", title: "Votre ville vieillit", detail: `Vétusté de ${Math.round(city.wear * 100)} % : l'entretien augmente. Rénovez depuis la page Ville.`, href: "/ville" });
  }
  const asleep = (state.branches?.length ?? 0) - city.branches;
  if (asleep > 0) {
    out.push({ id: "branches", level: "info", title: `${asleep} entreprise${asleep > 1 ? "s" : ""} implantée${asleep > 1 ? "s" : ""} en sommeil`, detail: "Leur site ne tourne plus : vous ne détenez plus la participation de départ.", href: "/ville" });
  }
  const toClaim = goalStatuses(state, city).filter((g) => g.done && !g.claimed);
  if (toClaim.length) {
    out.push({ id: "goals", level: "success", title: `${toClaim.length} subvention${toClaim.length > 1 ? "s" : ""} à encaisser`, detail: `${fmt(toClaim.reduce((a, g) => a + g.goal.reward, 0))} € vous attendent dans Ville › Objectifs.`, href: "/ville" });
  }
  const pv = portfolioValue(state.holdings, prices);
  if (pv > 5_000) {
    for (const [sym, h] of Object.entries(state.holdings)) {
      const share = holdingValue(h, prices[sym] ?? h.avgCost) / pv;
      if (share >= 0.3 && Object.keys(state.holdings).length > 1) {
        out.push({ id: `conc-${sym}`, level: "info", title: `${sym} représente ${Math.round(share * 100)} % de votre portefeuille`, detail: "Risque de concentration.", href: "/portefeuille" });
      }
    }
  }
  return out;
}

export interface NextAction { id: string; title: string; text: string; href: string; tone: "good" | "bad" | "info" }

/** Les gestes les plus utiles maintenant, du plus pressant au moins pressant. Ne concerne que la ville et la progression :
 *  le jeu ne suggère jamais d'acheter ou de vendre un actif. */
export function nextActions(state: GameState, city: CityStats, prices: Prices, max = 3): NextAction[] {
  const out: NextAction[] = [];
  const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
  const claim = goalStatuses(state, city).filter((g) => g.done && !g.claimed);
  if (claim.length) out.push({ id: "claim", tone: "good", title: `Encaissez ${claim.length > 1 ? `${claim.length} subventions` : "votre subvention"}`, text: `${fmt(claim.reduce((a, g) => a + g.goal.reward, 0))} € à récupérer dans Ville › Objectifs.`, href: "/ville" });
  if (city.event) out.push({ id: "event", tone: city.event.kind === "bonus" ? "good" : "bad", title: city.event.name, text: `${city.event.effect}. Encore ${city.event.daysLeft} jour${city.event.daysLeft > 1 ? "s" : ""}.`, href: "/ville" });
  if (state.cash < 0) out.push({ id: "cash", tone: "bad", title: "Redressez vos liquidités", text: "Elles sont négatives : vendez un actif ou démolissez un bâtiment.", href: "/portefeuille" });
  if (city.unemploymentRate >= 0.08) out.push({ id: "jobs", tone: "bad", title: "Créez des emplois", text: `${fmt(city.unemployed)} habitants sans travail : la satisfaction et les impôts baissent.`, href: "/ville" });
  if (city.energy.balance < 0) out.push({ id: "energy", tone: "bad", title: "Produisez plus d'énergie", text: `Il en manque ${fmt(-city.energy.balance)} par jour, importée au prix fort.`, href: "/ville" });
  if (city.food.balance < 0) out.push({ id: "food", tone: "bad", title: "Produisez plus de nourriture", text: `Il en manque ${fmt(-city.food.balance)} par jour, importée au prix fort.`, href: "/ville" });
  const missing = SERVICE_IDS.filter((id) => city.services[id].needed && city.services[id].coverage < 1);
  if (missing.length) out.push({ id: "services", tone: "bad", title: "Construisez des équipements publics", text: `Les habitants attendent : ${missing.map((id) => SERVICES[id].label.toLowerCase()).join(", ")}.`, href: "/ville" });
  if (city.pollution.penalty >= 0.05) out.push({ id: "pollution", tone: "bad", title: "Réduisez la pollution", text: `Elle coûte ${Math.round(city.pollution.penalty * 100)} points de satisfaction : parcs et écoquartiers l'absorbent.`, href: "/ville" });
  if (city.wear >= 0.4 && renovateCost(state) <= state.cash) out.push({ id: "wear", tone: "bad", title: "Rénovez la ville", text: `Vétusté de ${Math.round(city.wear * 100)} % : l'entretien augmente chaque jour.`, href: "/ville" });
  if (city.freeHousing === 0 && city.housing > 0) out.push({ id: "housing", tone: "info", title: "Construisez des logements", text: city.openJobs > 0 ? `${fmt(city.openJobs)} emplois attendent des habitants.` : "Tous les logements sont occupés : la population ne grandit plus.", href: "/ville" });
  // Lien bourse ↔ ville : on rappelle la règle (pas de capital sans placement), jamais quel actif choisir
  if (cityRank(state.population) >= 1 && capitalPerDay(state.holdings, prices) <= 0) out.push({ id: "capital", tone: "info", title: "Produisez du capital", text: `Rien n'est placé en bourse : les bâtiments à partir de ${fmt(CAPITAL.fromCost)} € demandent du capital, que seuls vos placements produisent.`, href: "/marches" });
  const bank = nextBank(state);
  if (bank && cityRank(state.population) >= bank.minRank && bank.cost <= state.cash && investRoom(state) < investCap(state) * 0.1) out.push({ id: "bank", tone: "info", title: "Agrandissez la Banque de la ville", text: `Votre plafond de mise est presque atteint : le niveau suivant donne un levier ×${bank.lev.toLocaleString("fr-FR")}.`, href: "/portefeuille" });
  if (cityRank(state.population) >= ORIENTATION_MIN_RANK && !state.orientation) out.push({ id: "orientation", tone: "info", title: "Choisissez l'orientation de votre ville", text: "Industrielle, verte, d'affaires ou marchande : le premier choix est gratuit.", href: "/ville" });
  if (featureOpen(state, "firms") && (state.branches?.length ?? 0) < branchLimit(state)) {
    const taken = new Set((state.branches ?? []).map((b) => b.symbol));
    const eligible = Object.entries(state.holdings).find(([s, h]) => !taken.has(s) && ASSET_BY_SYMBOL[s]?.kind === "stock" && h.qty * (prices[s] ?? h.avgCost) >= BRANCH_MIN_VALUE);
    if (eligible) out.push({ id: "branch", tone: "info", title: "Une entreprise peut s'implanter", text: `Vous êtes actionnaire de ${ASSET_BY_SYMBOL[eligible[0]].name} : elle peut ouvrir un site dans votre ville.`, href: "/ville" });
  }
  if (activeBranches(state).length < (state.branches?.length ?? 0)) out.push({ id: "asleep", tone: "info", title: "Un site d'entreprise est en sommeil", text: "Il ne rapporte plus : vous ne détenez plus la participation de départ.", href: "/ville" });
  const next = CITY_RANKS[city.rank + 1];
  if (next && out.length < max) out.push({ id: "rank", tone: "info", title: `Visez le rang « ${next.name} »`, text: `Encore ${fmt(next.pop - state.population)} habitants : logements, emplois et satisfaction font venir du monde.`, href: "/ville" });
  return out.slice(0, max);
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
