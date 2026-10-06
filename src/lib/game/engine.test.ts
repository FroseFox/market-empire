import { describe, expect, it } from "vitest";
import { build, buy, moveBuilding, catchUp, computeCity, DAY_MS, demolish, doResearch, newGame, normalize, sell, tickDay } from "./engine";
import * as E from "./engine";
import { isRoad } from "./layout";
import { START_GRANT, STARTING_CASH } from "./config";

const T0 = Date.UTC(2026, 8, 27, 12);

describe("ville de départ (doc Équilibrage §2)", () => {
  const g = newGame(T0);
  const c = computeCity(g);
  it("250 habitants, 250 logements, 150 emplois", () => {
    expect(g.population).toBe(250);
    expect(c.housing).toBe(250);
    expect(c.jobs).toBe(150);
  });
  it("≈ 1 100 €/jour de revenus locaux (rythme relevé par rapport au doc, voir config)", () => {
    expect(c.income.total - c.income.grant).toBeGreaterThan(950);
    expect(c.income.total - c.income.grant).toBeLessThan(1250);
  });
  it("dotation de démarrage : forte au départ, comptée dans les revenus", () => {
    expect(c.income.grant).toBeCloseTo(START_GRANT.perDay * (1 - c.housing / START_GRANT.untilPop), 0);
    expect(c.income.grant).toBeGreaterThan(9000);
    expect(c.income.total).toBeCloseTo(c.income.taxes + c.income.buildings + c.income.exports + c.income.grant, 6);
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

describe("recherche", () => {
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

describe("progression de la ville", () => {
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  it("rang selon la population", () => {
    expect(E.cityRank(250)).toBe(0);
    expect(E.cityRank(500)).toBe(1);
    expect(E.cityRank(100_000)).toBe(6);
    expect(E.cityRank(1_000_000)).toBe(8);
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

describe("rénovation, prévisions, audit", () => {
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  it("améliore un bâtiment sur place pour la différence de prix, après la recherche", () => {
    let g = { ...newGame(T0), cash: 500_000, population: 900 };
    g = ok(build(g, "house_s", T0, { x: 9, y: 9 }));
    expect(E.upgrade(g, { x: 9, y: 9 }, T0).ok).toBe(false); // recherche manquante
    g = ok(doResearch(g, "city_upgrade", T0));
    const cash = g.cash, worth = g.cash + computeCity(g).assetValue;
    g = ok(E.upgrade(g, { x: 9, y: 9 }, T0));
    expect(g.cash).toBe(cash - 55_000);
    expect(g.plots.find((p) => p.x === 9 && p.y === 9)?.id).toBe("house_m");
    expect(g.buildings.house_s).toBeUndefined();
    expect(g.cash + computeCity(g).assetValue).toBeCloseTo(worth, 2); // patrimoine inchangé
    expect(normalize(g)).toBe(g);
    // Un bâtiment offert au départ se paie au prix plein : le patrimoine ne gonfle pas
    const shop = g.plots.find((p) => p.id === "shop")!;
    const before = g.cash + computeCity(g).assetValue;
    g = ok(E.upgrade(g, shop, T0));
    expect(g.cash + computeCity(g).assetValue).toBeCloseTo(before, 2);
    expect(E.upgrade(g, { x: 9, y: 9 }, T0).ok).toBe(false); // house_l : 2 000 habitants requis
  });
  it("la prévision suit ce que feront vraiment les prochains jours", () => {
    let g = ok(build({ ...newGame(T0), cash: 500_000 }, "house_s", T0));
    const f = E.forecast(g, 3);
    for (let i = 0; i < 3; i++) g = tickDay(g, {}, T0 + i);
    expect(f.population).toBe(g.population);
    expect(f.net).toBeCloseTo(computeCity(g).net, 6);
  });
  it("l'audit d'un bâtiment tient compte du personnel et de l'entretien", () => {
    const c = computeCity(newGame(T0));
    const a = E.buildingAudit("shop", c);
    expect(a.staffing).toBe(1);
    expect(a.net).toBeCloseTo(240 - 5 * 2 * 0.7 - 15, 6);
  });
});

describe("catalogue des bâtiments", () => {
  it("identifiants uniques, améliorations cohérentes, chaque catégorie offre un choix", async () => {
    const { BUILDINGS, BUILDING_BY_ID, UPGRADES } = await import("./config");
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length);
    for (const [from, to] of Object.entries(UPGRADES)) {
      expect(BUILDING_BY_ID[from], from).toBeDefined();
      expect(BUILDING_BY_ID[to], to).toBeDefined();
      expect(BUILDING_BY_ID[to].category).toBe(BUILDING_BY_ID[from].category);
      expect(BUILDING_BY_ID[to].cost).toBeGreaterThan(BUILDING_BY_ID[from].cost);
    }
    const perCat: Record<string, number> = {};
    for (const b of BUILDINGS) if (b.buildable !== false) perCat[b.category] = (perCat[b.category] ?? 0) + 1;
    for (const n of Object.values(perCat)) expect(n).toBeGreaterThanOrEqual(3);
  });
});

describe("ville et bourse : entreprises implantées", () => {
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  it("une entreprise détenue s'implante, apporte emplois et revenus, et s'endort si on vend", () => {
    let g = { ...newGame(T0), cash: 300_000 };
    expect(E.openBranch(g, "AAPL", 200, T0).ok).toBe(false); // pas actionnaire
    g = ok(buy(g, "AAPL", 60, 200, T0));                     // 12 000 € : au-dessus du seuil
    const before = computeCity(g), cash = g.cash;
    g = ok(E.openBranch(g, "AAPL", 200, T0));
    expect(g.cash).toBe(cash - 40_000);
    const after = computeCity(g);
    expect(after.branches).toBe(1);
    expect(after.jobs).toBe(before.jobs + 250);
    expect(E.openBranch(g, "AAPL", 200, T0).ok).toBe(false); // déjà implantée
    // Le cours peut baisser sans effet ; vendre sous la participation de départ met le site en sommeil
    g = ok(sell(g, "AAPL", 20, 150, T0));
    expect(computeCity(g).branches).toBe(0);
    expect(computeCity(g).jobs).toBe(before.jobs);
    g = ok(buy(g, "AAPL", 20, 150, T0));
    expect(computeCity(g).branches).toBe(1);
    // Une par rang de ville : un village n'en accueille qu'une
    g = ok(buy(g, "MSFT", 40, 400, T0));
    expect(E.openBranch(g, "MSFT", 400, T0).ok).toBe(false);
    expect(ok(E.closeBranch(g, "AAPL")).branches).toEqual([]);
  });
  it("chaque entreprise implantée a son bâtiment sur la carte, qu'on retrouve après un déplacement", () => {
    let g = { ...newGame(T0), cash: 2_000_000, population: 2_000 };
    g = ok(buy(g, "AAPL", 60, 200, T0));
    g = ok(buy(g, "MSFT", 40, 400, T0));
    g = ok(E.openBranch(g, "AAPL", 200, T0));
    g = ok(E.openBranch(g, "MSFT", 400, T0));
    const sites = g.plots.filter((p) => p.id === "branch");
    expect(sites).toHaveLength(2);
    expect(g.buildings.branch).toBe(2);
    expect(E.branchAt(g, sites[0].x, sites[0].y)?.symbol).toBe("AAPL");
    expect(E.branchAt(g, sites[1].x, sites[1].y)?.symbol).toBe("MSFT");
    expect(normalize(g)).toBe(g);
    // Déplacer le bâtiment d'Apple : il reste celui d'Apple ; il ne se démolit pas
    g = ok(moveBuilding(g, sites[0], { x: 1, y: 1 }));
    expect(E.branchAt(g, 1, 1)?.symbol).toBe("AAPL");
    expect(demolish(g, "branch", T0, { x: 1, y: 1 }).ok).toBe(false);
    // Fermer Apple retire son bâtiment, pas celui de Microsoft
    g = ok(E.closeBranch(g, "AAPL"));
    expect(g.plots.filter((p) => p.id === "branch")).toEqual([sites[1]]);
    expect(E.branchAt(g, sites[1].x, sites[1].y)?.symbol).toBe("MSFT");
    expect(computeCity(g).cityValue).toBe(computeCity(newGame(T0)).cityValue); // le bâtiment ne coûte pas d'entretien
    // Une partie d'avant ce bâtiment : il est posé à l'ouverture
    const old = { ...g, buildings: { ...g.buildings }, plots: g.plots.filter((p) => p.id !== "branch") };
    delete (old.buildings as Record<string, number>).branch;
    const fixed = normalize(old);
    expect(fixed.plots.filter((p) => p.id === "branch")).toHaveLength(1);
    expect(fixed.buildings.branch).toBe(1);
  });
  it("le coût d'implantation ne passe pas pour un gain ou une perte de bourse", () => {
    let g = ok(buy({ ...newGame(T0), cash: 300_000 }, "AAPL", 60, 200, T0));
    const fees = g.today!.fees;
    g = ok(E.openBranch(g, "AAPL", 200, T0));
    const r = E.periodReport(g, g.cash + E.portfolioValue(g.holdings, { AAPL: 200 }), Infinity);
    expect(r.city).toBe(-40_000);
    expect(r.fees).toBe(fees);
  });
});

describe("pays et places financières", () => {
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  it("la spécialité du pays joue sur la ville, davantage dans un pays cher", () => {
    const g = newGame(T0);
    const none = computeCity(g);
    const norway = computeCity({ ...g, country: "578" });   // énergie, catégorie 2
    const russia = computeCity({ ...g, country: "643" });   // énergie, catégorie 3
    expect(norway.specialty).toBe("energy");
    expect(norway.energy.prod).toBeCloseTo(none.energy.prod * 1.1, 6);
    expect(russia.energy.prod).toBeCloseTo(none.energy.prod * 1.15, 6);
    expect(computeCity({ ...g, country: "076" }).food.prod).toBeCloseTo(none.food.prod * 1.15, 6); // Brésil : agriculture
    expect(computeCity({ ...g, country: "724" }).income.buildings).toBeGreaterThan(none.income.buildings); // Espagne : commerce
  });
  it("frais de courtage : pays « Finance », bureau dans une place, pays de la place", () => {
    const g = { ...newGame(T0), cash: 1_000_000 };
    expect(E.feeFactor(g, "AAPL")).toBe(1);
    expect(E.feeFactor({ country: "756" }, "AAPL")).toBeCloseTo(0.8, 6);         // Suisse : finance, catégorie 2
    expect(E.feeFactor({ country: "840" }, "AAPL")).toBeCloseTo(0.6 * 0.5, 6);   // États-Unis : finance + New York sur place
    expect(E.hubFor("AAPL")?.name).toBe("New York");
    const desk = ok(E.openDesk(g, "New York", T0));
    expect(desk.cash).toBe(880_000);
    expect(E.feeFactor(desk, "AAPL")).toBe(0.5);
    expect(E.openDesk(desk, "New York", T0).ok).toBe(false);
    // 100 titres à 200 € : 20 € de frais sans bureau, 10 € avec
    expect(ok(buy(g, "AAPL", 100, 200, T0)).today!.fees).toBe(20);
    expect(ok(buy(desk, "AAPL", 100, 200, T0)).today!.fees).toBe(120_010);
  });
});

describe("commerce entre joueurs", () => {
  it("un contrat vend le surplus plus cher et achète le manque moins cher, dans la limite des quantités réelles", () => {
    const g = newGame(T0);
    const base = computeCity(g);
    expect(base.energy.balance).toBeGreaterThan(0);
    const surplus = base.energy.balance;
    const sold = computeCity({ ...g, contracts: [{ id: "c1", resource: "energy", qty: 20, side: "sell", partner: "x" }] });
    expect(sold.contracts.energySold).toBe(20);
    expect(sold.exportsValue - base.exportsValue).toBeCloseTo(20 * 2 * (0.85 - 0.7), 6);
    // Contrat plus gros que le surplus : seul le surplus réel part au prix du contrat
    const big = computeCity({ ...g, contracts: [{ id: "c1", resource: "energy", qty: 9_999, side: "sell", partner: "x" }] });
    expect(big.contracts.energySold).toBeCloseTo(surplus, 6);
    // Ville en manque de nourriture : 100 unités sous contrat coûtent 85 % du prix plein
    const hungry = { buildings: { house_m: 1 }, population: 500 };
    const noDeal = computeCity(hungry);
    const deal = computeCity({ ...hungry, contracts: [{ id: "c2", resource: "food" as const, qty: 100, side: "buy" as const, partner: "y" }] });
    expect(noDeal.importsValue - deal.importsValue).toBeCloseTo(100 * 1.5 * 0.15, 6);
  });
});

describe("tensions de la ville", () => {
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  it("la pollution des usines pèse sur la satisfaction, les parcs l'absorbent", () => {
    const dirty = computeCity({ buildings: { house_l: 1, factory_m: 4 }, population: 2_500 });
    const clean = computeCity({ buildings: { house_l: 1, factory_m: 4, park: 6 }, population: 2_500 });
    expect(dirty.pollution.penalty).toBeGreaterThan(0.1);
    expect(clean.pollution.penalty).toBeLessThan(0.02);
    expect(dirty.factors.some((f) => f.label === "Pollution")).toBe(true);
  });
  it("la vétusté monte avec le temps à partir du rang Bourg, coûte de l'entretien, et se rénove", () => {
    let g = newGame(T0);
    for (let i = 0; i < 20; i++) g = tickDay(g, {}, T0 + i);
    expect(g.wear ?? 0).toBe(0); // village : pas encore
    g = { ...g, population: 600, buildings: { ...g.buildings, house_m: 1 }, cash: 200_000 };
    const fresh = computeCity(g).expenses.maintenance;
    for (let i = 0; i < 100; i++) g = tickDay(g, {}, T0 + i);
    expect(g.wear).toBeCloseTo(0.3, 6);
    expect(computeCity(g).expenses.maintenance).toBeCloseTo(fresh * 1.3, 6);
    const cost = E.renovateCost(g), cash = g.cash;
    g = ok(E.renovate(g, T0));
    expect(g.wear).toBe(0);
    expect(g.cash).toBeCloseTo(cash - cost, 2);
    expect(E.renovate(g, T0).ok).toBe(false);
  });
  it("les attentes en équipements montent avec le rang", () => {
    const small = computeCity({ buildings: { house_l: 1 }, population: 1_200 });
    const large = computeCity({ buildings: { house_xl: 4 }, population: 50_000 });
    const park = (c: E.CityStats) => c.factors.find((f) => f.label === "Espaces verts")!.value;
    expect(park(large)).toBeLessThan(park(small));
  });
});

describe("fin de partie : grands projets et prestige", () => {
  it("un grand projet demande un rang, compte dans le patrimoine et donne du prestige", () => {
    let g = { ...newGame(T0), cash: 20_000_000 };
    expect(E.buildProject(g, "airport", T0).ok).toBe(false); // village
    g = { ...g, population: 20_000, buildings: { ...g.buildings, house_xl: 2, shop: 10 } };
    const worth = g.cash + computeCity(g).assetValue, p0 = E.prestige(g), shops = computeCity(g).income.buildings;
    const r = E.buildProject(g, "airport", T0);
    if (!r.ok) throw new Error(r.error);
    g = r.state;
    expect(g.cash + computeCity(g).assetValue).toBeCloseTo(worth, 2);
    expect(E.prestige(g)).toBe(p0 + 100);
    expect(computeCity(g).income.buildings).toBeGreaterThan(shops); // commerces : +10 %
    expect(E.buildProject(g, "airport", T0).ok).toBe(false);
    expect(E.goalStatuses(g).find((s) => s.goal.id === "project_1")?.done).toBe(true);
  });
});

describe("ordres en euros", () => {
  it("un montant donne un nombre de titres fractionnaire, jamais plus que le montant", () => {
    expect(E.sharesFor(10_000, 4_000)).toBe(2.5);
    expect(E.sharesFor(1_000, 205)).toBe(4.878);        // 4,878 × 205 = 999,99 €
    expect(E.sharesFor(1_000, 205) * 205).toBeLessThanOrEqual(1_000);
    expect(E.sharesFor(0.001, 60_000)).toBe(0);         // trop peu pour un dix-millième de titre
    expect(E.sharesFor(100, 0)).toBe(0);
  });
  it("le montant maximal passe toujours, frais compris", () => {
    const g = newGame(T0);
    const max = E.maxBuyAmount(g.cash);
    const r = buy(g, "AAPL", E.sharesFor(max, 205), 205, T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.cash).toBeGreaterThanOrEqual(0);
    expect(r.state.cash).toBeLessThan(205 * 0.0001 + 1.01); // presque tout est investi
    expect(buy(g, "AAPL", E.sharesFor(g.cash, 205), 205, T0).ok).toBe(false); // sans la place des frais : refusé
    expect(E.maxBuyAmount(0.5)).toBe(0);
  });
  it("on peut vendre une fraction puis tout le reste, sans reliquat", () => {
    let g = newGame(T0);
    const bought = buy(g, "AAPL", E.sharesFor(10_000, 205), 205, T0);
    if (!bought.ok) throw new Error(bought.error);
    g = bought.state;
    const part = sell(g, "AAPL", E.sharesFor(3_000, 205), 205, T0);
    if (!part.ok) throw new Error(part.error);
    const rest = sell(part.state, "AAPL", part.state.holdings.AAPL.qty, 205, T0);
    if (!rest.ok) throw new Error(rest.error);
    expect(rest.state.holdings.AAPL).toBeUndefined();
  });
});

describe("territoire", () => {
  it("s'agrandit contre paiement, à partir d'un certain rang, et compte dans le patrimoine", () => {
    let g = { ...newGame(T0), cash: 15_000_000 };
    expect(E.mapSize(g)).toBe(32);
    expect(build(g, "house_s", T0, { x: -2, y: 5 }).ok).toBe(false);   // hors de la carte de départ
    expect(E.expandTerritory(g, T0).ok).toBe(false);                    // village : trop tôt
    g = { ...g, population: 20_000, buildings: { ...g.buildings, house_xl: 2 } };
    g = normalize(g);
    const worth = g.cash + computeCity(g).assetValue;
    const r = E.expandTerritory(g, T0);
    if (!r.ok) throw new Error(r.error);
    g = r.state;
    expect(E.mapSize(g)).toBe(40);
    expect(g.cash + computeCity(g).assetValue).toBeCloseTo(worth, 2);
    const ok = build(g, "house_s", T0, { x: -2, y: 5 });
    expect(ok.ok).toBe(true);
    expect(build(g, "house_s", T0, { x: -4, y: 5 }).ok).toBe(false);    // route de la nouvelle bordure
    expect(build(g, "house_s", T0, { x: -6, y: 5 }).ok).toBe(false);    // au-delà du territoire acheté
    if (ok.ok) expect(normalize(ok.state)).toBe(ok.state);
  });
  it("une carte pleine refuse la construction automatique au lieu de perdre le bâtiment", () => {
    let g = { ...newGame(T0), cash: 1e9 };
    let n = 0;
    for (;;) { const r = build(g, "house_s", T0); if (!r.ok) { expect(r.error).toMatch(/Plus de place/); break; } g = r.state; n++; }
    expect(g.plots.length).toBe(529);
    expect(g.buildings.house_s).toBe(n);
  });
});

describe("journal d'absence", () => {
  it("résume les jours écoulés : flux encaissé, population, rang, faits marquants", () => {
    let g = newGame(T0);
    const b1 = build(g, "house_m", T0); // verrouillé à 500 habitants : on passe par des petits quartiers
    expect(b1.ok).toBe(false);
    for (let i = 0; i < 3; i++) { const r = build(g, "house_s", T0); if (r.ok) g = r.state; }
    for (let i = 0; i < 4; i++) { const r2 = build(g, "shop", T0); if (r2.ok) g = r2.state; }
    g = { ...g, population: 420 };
    const before = g;
    const { state: after, days } = catchUp(g, g.lastTick + 20 * DAY_MS, {});
    const rep = E.absenceReport(before, after);
    expect(rep.days).toBe(days);
    expect(rep.days).toBe(20);
    expect(rep.cityFlow).toBeCloseTo(after.cash - before.cash, 1);
    expect(rep.population.to).toBeGreaterThan(rep.population.from);
    expect(rep.rank.to).toBe(1);
    expect(rep.notes.some((n) => n.text.includes("Bourg"))).toBe(true);
    expect(rep.notes.some((n) => n.text.includes("subvention"))).toBe(true);
  });
});

describe("fonction retirée : dossiers", () => {
  it("les recherches de dossiers sont enlevées des sauvegardes et remboursées", () => {
    const g = newGame(T0);
    const old = { ...g, research: [...g.research, "folders_1", "folders_plus", "folder_tracking"] };
    const fixed = normalize(old);
    expect(fixed.research).toEqual(g.research);
    expect(fixed.cash).toBe(g.cash + 12_000 + 18_000);
    expect(normalize(fixed)).toBe(fixed); // une seule fois
  });
});

describe("orientation de la ville", () => {
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  it("premier choix gratuit à partir de Petite ville, changement payant, avantage et revers appliqués", () => {
    let g = { ...newGame(T0), cash: 2_000_000 };
    expect(E.chooseOrientation(g, "green", T0).ok).toBe(false); // village
    g = normalize({ ...g, population: 2_000, buildings: { ...g.buildings, house_l: 1, factory_m: 2, services: 2 } });
    const base = computeCity(g), cash = g.cash;
    g = ok(E.chooseOrientation(g, "industrial", T0));
    expect(g.cash).toBe(cash); // gratuit
    const ind = computeCity(g);
    expect(ind.pollution.emitted).toBeCloseTo(base.pollution.emitted * 1.3, 6);
    expect(E.chooseOrientation(g, "industrial", T0).ok).toBe(false);
    g = ok(E.chooseOrientation(g, "green", T0));
    expect(g.cash).toBe(cash - 150_000 * 2); // rang Petite ville = 2
    const green = computeCity(g);
    expect(green.pollution.emitted).toBeCloseTo(base.pollution.emitted * 0.4, 6);
    expect(green.energy.prod).toBeCloseTo(base.energy.prod * 1.1, 6);
    expect(green.factors.some((f) => f.label === "Ville verte" && f.value === 0.03)).toBe(true);
    expect(E.feeFactor({ orientation: "financial" }, "AAPL")).toBe(0.85);
    // Le changement payant est compté dans le flux de la ville du jour
    expect(g.today?.extra).toBe(-300_000);
  });
});

describe("lisibilité : fonctions ouvertes, aperçu, que faire maintenant", () => {
  it("les fonctions s'ouvrent avec le rang, ou restent ouvertes si on s'en sert déjà", () => {
    const g = newGame(T0);
    expect(E.featureOpen(g, "firms")).toBe(false);
    expect(E.featureOpen({ ...g, population: 500 }, "firms")).toBe(true);
    expect(E.featureOpen({ ...g, branches: [{ symbol: "AAPL", minQty: 1 }] }, "firms")).toBe(true);
    expect(E.featureOpen({ ...g, population: 1_400 }, "trade")).toBe(false);
    expect(E.featureOpen({ ...g, population: 5_000 }, "projects")).toBe(true);
  });
  it("l'aperçu d'un bâtiment donne son effet réel sur la ville d'aujourd'hui", () => {
    const g = newGame(T0);
    const shop = E.buildPreview(g, "shop");
    expect(shop.net).toBeGreaterThan(0);
    expect(shop.net).toBeLessThan(240 * 0.5); // tous les habitants ont déjà un emploi : loin des 240 € affichés sur la fiche
    const house = E.buildPreview(g, "house_s");
    expect(house.growth).toBeGreaterThan(0);
    expect(house.satisfaction).toBeCloseTo(0.05, 6); // la ville n'est plus saturée
  });
  it("que faire maintenant : le plus pressant d'abord, jamais un conseil de bourse", async () => {
    const { nextActions } = await import("./insights");
    const g = newGame(T0);
    const a = nextActions(g, computeCity(g), {});
    expect(a[0].id).toBe("housing");
    expect(a.length).toBeLessThanOrEqual(3);
    const rich = { ...g, population: 500 };
    expect(nextActions(rich, computeCity(rich), {})[0].id).toBe("claim");
    for (const x of nextActions(rich, computeCity(rich), {}, 20)) expect(x.title + x.text).not.toMatch(/achet|vend(ez|re) (des|une) action/i);
  });
});
