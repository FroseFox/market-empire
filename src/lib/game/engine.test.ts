import { describe, expect, it } from "vitest";
import { build, buy, moveBuilding, catchUp, computeCity, createFolder, DAY_MS, demolish, doResearch, newGame, normalize, sell, tickDay, updateFolder } from "./engine";
import * as E from "./engine";
import { isRoad } from "./layout";
import { STARTING_CASH } from "./config";

const T0 = Date.UTC(2026, 8, 27, 12);

describe("ville de départ (doc Équilibrage §2)", () => {
  const g = newGame(T0);
  const c = computeCity(g);
  it("250 habitants, 250 logements, 150 emplois", () => {
    expect(g.population).toBe(250);
    expect(c.housing).toBe(250);
    expect(c.jobs).toBe(150);
  });
  it("≈ 500 €/jour de revenus locaux", () => {
    expect(c.income.total).toBeGreaterThan(420);
    expect(c.income.total).toBeLessThan(620);
  });
  it("énergie et nourriture suffisantes", () => {
    expect(c.energy.balance).toBeGreaterThanOrEqual(0);
    expect(c.food.balance).toBeGreaterThanOrEqual(0);
  });
  it("flux net positif", () => expect(c.net).toBeGreaterThan(0));
  it("patrimoine initial = 100 000 € (la ville offerte ne compte pas)", () => {
    expect(g.history[0].netWorth).toBe(STARTING_CASH);
  });
});

describe("bourse", () => {
  it("achat puis vente avec frais", () => {
    let g = newGame(T0);
    const r = buy(g, "AAPL", 10, 200, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    g = r.state;
    expect(g.cash).toBe(STARTING_CASH - 2000 - 2); // 0,1 % de frais
    expect(g.holdings.AAPL.qty).toBe(10);
    const s = sell(g, "AAPL", 10, 220, T0);
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.state.holdings.AAPL).toBeUndefined();
      expect(s.state.cash).toBeCloseTo(STARTING_CASH - 2002 + 2200 - 2.2, 2);
    }
  });
  it("refuse un achat au-delà des liquidités", () => {
    expect(buy(newGame(T0), "NVDA", 10_000, 200, T0).ok).toBe(false);
  });
  it("refuse de vendre plus que détenu", () => {
    const r = buy(newGame(T0), "KO", 5, 60, T0);
    if (r.ok) expect(sell(r.state, "KO", 6, 60, T0).ok).toBe(false);
  });
});

describe("ville", () => {
  it("construire des logements + emplois fait croître la population", () => {
    let g = newGame(T0);
    for (const id of ["house_s", "house_s", "shop", "shop"]) {
      const r = build(g, id, T0); expect(r.ok).toBe(true); if (r.ok) g = r.state;
    }
    const before = g.population;
    for (let i = 0; i < 10; i++) g = tickDay(g, {}, T0 + i * DAY_MS);
    expect(g.population).toBeGreaterThan(before);
    expect(g.population).toBeLessThanOrEqual(computeCity(g).housing);
  });
  it("bâtiment verrouillé tant que la population est trop faible", () => {
    expect(build(newGame(T0), "house_m", T0).ok).toBe(false);
  });
  it("démolition rembourse 50 %", () => {
    const r = build(newGame(T0), "shop", T0);
    if (!r.ok) throw new Error();
    const d = demolish(r.state, "shop", T0);
    expect(d.ok && d.state.cash).toBe(STARTING_CASH - 15_000 + 7_500);
  });
  it("trop de logements sans emplois → chômage", () => {
    let g = newGame(T0);
    for (let i = 0; i < 4; i++) { const r = build(g, "house_s", T0); if (r.ok) g = r.state; }
    for (let i = 0; i < 40; i++) g = tickDay(g, {}, T0 + i * DAY_MS);
    expect(computeCity(g).unemploymentRate).toBeGreaterThan(0.2);
  });
});

describe("temps", () => {
  it("rattrape les jours écoulés, plafonné", () => {
    const g = newGame(T0);
    const { state, days } = catchUp(g, T0 + 3.5 * DAY_MS, {});
    expect(days).toBe(3);
    expect(state.day).toBe(4);
    expect(state.lastTick).toBe(T0 + 3 * DAY_MS);
    const far = catchUp(g, T0 + 1000 * DAY_MS, {});
    expect(far.days).toBe(24);
  });
});

describe("carte", () => {
  it("chaque bâtiment a une place, jamais sur une route ni en double", () => {
    let g = newGame(T0);
    g = { ...g, cash: 10_000_000 };
    for (const id of ["house_s", "house_s", "shop", "factory_s", "farm_s", "power_s"]) { const r = build(g, id, T0); if (r.ok) g = r.state; }
    const total = Object.values(g.buildings).reduce((a, b) => a + b, 0);
    expect(g.plots.length).toBe(total);
    expect(new Set(g.plots.map((p) => `${p.x},${p.y}`)).size).toBe(total);
    expect(g.plots.some((p) => isRoad(p.x, p.y))).toBe(false);
    const d = demolish(g, "shop", T0);
    if (d.ok) expect(d.state.plots.filter((p) => p.id === "shop").length).toBe(1);
  });
  it("répare une ancienne sauvegarde sans plan", () => {
    const g = newGame(T0);
    const old = { ...g, plots: undefined } as unknown as typeof g;
    expect(normalize(old).plots.length).toBe(5);
  });
});

describe("recherche et dossiers", () => {
  it("les actions européennes demandent une recherche", () => {
    const g = newGame(T0);
    expect(buy(g, "MC", 1, 500, T0).ok).toBe(false);
    const r = doResearch(g, "eu_stocks", T0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.cash).toBe(STARTING_CASH - 15_000);
      expect(buy(r.state, "MC", 1, 500, T0).ok).toBe(true);
    }
  });
  it("respecte les prérequis multiples", () => {
    let g = { ...newGame(T0), cash: 1_000_000 };
    expect(doResearch(g, "etf", T0).ok).toBe(false);
    for (const id of ["eu_stocks", "history_1y"]) { const r = doResearch(g, id, T0); if (r.ok) g = r.state; }
    expect(doResearch(g, "etf", T0).ok).toBe(false); // manque l'analyse sectorielle
    const r = doResearch(g, "sector_view", T0); if (r.ok) g = r.state;
    expect(doResearch(g, "etf", T0).ok).toBe(true);
  });
  it("2 dossiers maximum au départ", () => {
    let g = newGame(T0);
    for (const n of ["IA", "Énergie"]) { const r = createFolder(g, n, T0); if (r.ok) g = r.state; }
    expect(createFolder(g, "Luxe", T0).ok).toBe(false);
    const u = updateFolder(g, g.folders[0].id, { symbols: ["NVDA", "AMD", "NVDA"] });
    expect(u.ok && u.state.folders[0].symbols).toEqual(["NVDA", "AMD"]);
  });
});

describe("placement libre", () => {
  it("construire sur un carreau choisi, refuser route et doublon, déplacer", () => {
    let g = newGame(T0);
    expect(build(g, "shop", T0, { x: 4, y: 5 }).ok).toBe(false); // route
    const taken = g.plots[0];
    expect(build(g, "shop", T0, { x: taken.x, y: taken.y }).ok).toBe(false); // occupé
    const r = build(g, "shop", T0, { x: 13, y: 13 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    g = r.state;
    expect(g.plots.some((p) => p.id === "shop" && p.x === 13 && p.y === 13)).toBe(true);
    const m = moveBuilding(g, { x: 13, y: 13 }, { x: 13, y: 14 });
    expect(m.ok && m.state.plots.some((p) => p.x === 13 && p.y === 14)).toBe(true);
    expect(moveBuilding(g, { x: 13, y: 13 }, { x: 12, y: 12 }).ok).toBe(false); // route (12 % 4 == 0)
    const d = demolish(g, "shop", T0, { x: 13, y: 13 });
    expect(d.ok && d.state.plots.some((p) => p.x === 13 && p.y === 13)).toBe(false);
  });
});

describe("bilan de période", () => {
  it("explique exactement la variation du patrimoine", () => {
    const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
    const worth = (g: E.GameState, p: E.Prices) => g.cash + E.portfolioValue(g.holdings, p) + E.computeCity(g).assetValue;
    let g = E.newGame(0);
    let cityFlow = 0;
    g = ok(E.buy(g, "AAPL", 100, 200, 1));          // frais : 20 €
    g = ok(E.build(g, "house_s", 2));               // neutre : liquidités → ville
    for (let d = 0; d < 3; d++) { cityFlow += E.computeCity(g).net; g = E.tickDay(g, { AAPL: 200 }, 10 + d); }
    g = ok(E.demolish(g, "house_s", 20));           // perte : la moitié du coût
    g = ok(E.sell(g, "AAPL", 50, 220, 21));         // frais : 11 €
    const prices = { AAPL: 220 };                   // +20 € × 100 titres = +2 000 €
    const r = E.periodReport(g, worth(g, prices), Infinity);
    expect(r.days).toBe(3);
    expect(r.start).toBe(100_000);
    expect(r.fees).toBeCloseTo(31, 2);
    // Vente de 50 titres à 220 € achetés 200 € : +1 000 € moins 11 € de frais.
    expect(g.transactions[0].gain).toBeCloseTo(989, 2);
    expect(g.realized).toBeCloseTo(989, 2);
    expect(r.city).toBeCloseTo(cityFlow, 1);
    expect(r.demolish).toBeGreaterThan(0);
    expect(r.market).toBeCloseTo(2000, 1);
    expect(r.start + r.market + r.city - r.fees - r.research - r.demolish).toBeCloseTo(r.end, 1);
    // Sur le dernier jour seulement : la période ne reprend que ce qui s'est passé depuis.
    expect(E.periodReport(g, worth(g, prices), 1).fees).toBeCloseTo(11, 2);
  });
});

describe("dossiers : suivi depuis l'ajout", () => {
  it("retient le cours du jour d'ajout et l'oublie au retrait", () => {
    const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
    let g = ok(E.createFolder(E.newGame(0), "IA", 5, ["NVDA"], { NVDA: 100 }));
    const id = g.folders[0].id;
    g = ok(E.updateFolder(g, id, { symbols: ["NVDA", "AMD", "TSM"] }, 9, { NVDA: 150, AMD: 80 }));
    expect(g.folders[0].added).toEqual({ NVDA: { at: 5, price: 100 }, AMD: { at: 9, price: 80 } }); // TSM : cours inconnu
    g = ok(E.updateFolder(g, id, { notes: "x" }));
    expect(g.folders[0].added?.NVDA.price).toBe(100);
    g = ok(E.updateFolder(g, id, { symbols: ["AMD"] }, 12, {}));
    expect(g.folders[0].added).toEqual({ AMD: { at: 9, price: 80 } });
  });
});

describe("progression de la ville", () => {
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  it("rang selon la population", () => {
    expect(E.cityRank(250)).toBe(0);
    expect(E.cityRank(500)).toBe(1);
    expect(E.cityRank(1_000_000)).toBe(6);
  });
  it("les équipements publics soutiennent la satisfaction d'une grande ville", () => {
    const base = { house_l: 2, factory_m: 6, power_m: 2, farm_m: 4 };
    const without = computeCity({ buildings: base, population: 5_000 });
    const withAll = computeCity({ buildings: { ...base, park: 4, school: 2 }, population: 5_000 });
    expect(without.services.park).toMatchObject({ needed: true, coverage: 0 });
    expect(without.services.hospital.needed).toBe(false);
    expect(withAll.services.school.coverage).toBe(1);
    expect(withAll.satisfaction).toBeGreaterThan(without.satisfaction + 0.08);
    // La ville de départ n'attend encore rien
    expect(Object.values(computeCity(newGame(T0)).services).some((sv) => sv.needed)).toBe(false);
  });
  it("une subvention d'objectif s'encaisse une seule fois et entre dans le flux de la ville", () => {
    let g = newGame(T0);
    expect(E.claimGoal(g, "pop_500", T0).ok).toBe(false);
    g = { ...g, population: 500 };
    const before = g.cash;
    g = ok(E.claimGoal(g, "pop_500", T0));
    expect(g.cash).toBe(before + 5_000);
    expect(E.claimGoal(g, "pop_500", T0).ok).toBe(false);
    const worth = (s: E.GameState) => s.cash + E.computeCity(s).assetValue;
    const r = E.periodReport(g, worth(g), Infinity);
    expect(r.city).toBe(5_000);
    expect(r.market).toBeCloseTo(0, 2);
    const next = tickDay(g, {}, T0 + DAY_MS);
    expect(next.today).toBeUndefined();
    expect(next.history[next.history.length - 1].flow).toBeCloseTo(E.computeCity(g).net + 5_000, 1);
  });
});

describe("déménagement", () => {
  it("débite le prix du pays et refuse sans les moyens", () => {
    const g = newGame(T0);
    const r = E.relocate(g, "620", T0, "250"); // Portugal : catégorie 1
    if (!r.ok) throw new Error(r.error);
    expect(r.state.country).toBe("620");
    expect(r.state.cash).toBe(STARTING_CASH - 50_000);
    expect(r.state.transactions[0].kind).toBe("move");
    expect(E.relocate(g, "840", T0, "250").ok).toBe(false);   // États-Unis : trop cher au départ
    expect(E.relocate(g, "250", T0, "250").ok).toBe(false);   // déjà sur place
    expect(E.relocate(g, "999", T0, "250").ok).toBe(false);   // pays non jouable
    expect(E.periodReport(r.state, r.state.cash, Infinity).market).toBeCloseTo(0, 2);
  });
});
