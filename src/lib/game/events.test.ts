import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { BLOCKADE, EXPORT_RATIO, SANDBOX, SHARES, BANK } from "./config";
import { CITY_EVENTS, EVENTS, EVENT_BY_ID, effectText, eventStrength, pickEvent, scaledEffect } from "./events";
import { RESEARCH } from "./research";
import { pack, unpack } from "./pack";

const T0 = 1_700_000_000_000;
const town = (extra: Record<string, number> = {}): E.GameState => ({ ...E.newGame(T0), day: 10, population: 20_000, buildings: { house_xl: 2, power_l: 2, farm_l: 2, tech: 8, park_l: 3, school: 5, fire: 4, hospital: 2, ...extra } });
const during = (g: E.GameState, id: string, strength = 1): E.GameState => ({ ...g, event: { id, until: g.day + 5, strength } });

describe("événement de la semaine", () => {
  it("le jeu décide une fois par semaine, pas avant", () => {
    let g = E.newGame(T0);
    for (let d = 0; d < EVENTS.every - 2; d++) g = E.tickDay(g, {}, T0);
    expect(g.event).toBeUndefined();
    expect(g.eventWeek ?? 0).toBe(0);
    g = E.tickDay(g, {}, T0);
    expect(g.day).toBe(EVENTS.every);
    expect(g.eventWeek).toBe(1);
    const again = E.tickDay(g, {}, T0);
    expect(again.eventWeek).toBe(1);                 // pas de second tirage la même semaine
    expect(again.event).toEqual(g.event);
  });

  it("le tirage est le même sur tous les appareils, et dépend de la ville", () => {
    const c = E.computeCity(town());
    expect(pickEvent(c, 42)?.id).toBe(pickEvent(c, 42)?.id);
    const seen = new Set<string>();
    for (let s = 1; s < 400; s++) seen.add(pickEvent(c, s * 7919)?.id ?? "rien");
    expect(seen.has("rien")).toBe(true);             // certaines semaines, il ne se passe rien
    expect(seen.size).toBeGreaterThan(5);
    expect(seen.has("festival")).toBe(false);        // pas de tourisme dans cette ville : pas de festival
    expect(pickEvent(c, 7, true)).not.toBeNull();    // mode test : toujours un événement
    // Une ville très polluée risque bien plus un pic de pollution
    const count = (city: E.CityStats, test: (id: string | undefined) => boolean) => { let n = 0; for (let s = 1; s <= 1000; s++) if (test(pickEvent(city, s * 7919)?.id)) n++; return n; };
    const dirty = E.computeCity(town({ factory_l: 12, park_l: 0 }));
    expect(count(dirty, (id) => id === "smog")).toBeGreaterThan(count(c, (id) => id === "smog") + 50);
    // Environ une semaine sur quatre sans rien ; le reste se partage entre coups de pouce et catastrophes
    const quiet = count(c, (id) => id === undefined), bad = count(c, (id) => !!id && EVENT_BY_ID[id].kind === "disaster");
    expect(quiet).toBeGreaterThan(180); expect(quiet).toBeLessThan(320);
    expect(bad).toBeGreaterThan(150);
    expect(1000 - quiet - bad).toBeGreaterThan(bad);   // ville bien tenue : plus de chance que de malchance
    expect(count(dirty, (id) => !!id && EVENT_BY_ID[id].kind === "disaster")).toBeGreaterThan(bad);
  });

  it("chaque événement change vraiment quelque chose, puis s'arrête", () => {
    const g = town({ museum: 2 }), base = E.computeCity(g);
    expect(base.event).toBeNull();
    expect(E.computeCity(during(g, "storm")).energy.prod).toBeCloseTo(base.energy.prod * 0.7, 4);
    expect(E.computeCity(during(g, "drought")).food.prod).toBeCloseTo(base.food.prod * 0.6, 4);
    expect(E.computeCity(during(g, "flood")).expenses.maintenance).toBeCloseTo(base.expenses.maintenance * 2, 4);
    expect(E.computeCity(during(g, "harvest")).food.prod).toBeCloseTo(base.food.prod * 1.3, 4);
    expect(E.computeCity(during(g, "smog")).factors.find((f) => f.label === "Pic de pollution")?.value).toBeCloseTo(-0.05, 6);
    expect(E.computeCity(during(g, "festival")).tourism.revenue).toBeGreaterThan(base.tourism.revenue * 1.4);
    expect(E.computeCity(during(g, "strike")).income.buildings).toBeLessThan(base.income.buildings * 0.85);
    const live = E.computeCity(during(g, "storm"));
    expect(live.event).toMatchObject({ id: "storm", kind: "disaster", daysLeft: 5 });
    expect(live.event!.effect).toContain("énergie produite −30 %");
    // Passé la date de fin, tout redevient normal
    expect(E.computeCity({ ...during(g, "storm"), day: g.day + 5 }).energy.prod).toBeCloseTo(base.energy.prod, 6);
    for (const def of CITY_EVENTS) expect(effectText(def).length, def.name).toBeGreaterThan(5);
  });

  it("les équipements atténuent les catastrophes", () => {
    const covered = E.computeCity(town()), bare = E.computeCity(town({ fire: 0, hospital: 0 }));
    expect(eventStrength(EVENT_BY_ID.storm, covered)).toBeCloseTo(1 - EVENTS.guardCut, 6);
    expect(eventStrength(EVENT_BY_ID.storm, bare)).toBe(1);
    expect(eventStrength(EVENT_BY_ID.epidemic, covered)).toBeCloseTo(0.5, 6);
    expect(eventStrength(EVENT_BY_ID.drought, covered)).toBe(1);   // rien ne protège d'une sécheresse
    expect(scaledEffect(EVENT_BY_ID.storm, 0.5).energy).toBeCloseTo(0.85, 6);
  });

  it("l'aide de la région est versée une seule fois, d'un coup", () => {
    const g = town(), c = E.computeCity(g);
    let seed = 1;
    while (pickEvent(c, seed)?.id !== "grant") seed++;
    const r = E.rollEvent(g, c, seed, T0);
    expect(r.cash).toBeCloseTo(3 * c.operating, 2);
    expect(r.state.cash).toBeCloseTo(g.cash + r.cash, 2);
    expect(r.state.event).toEqual({ id: "grant", until: g.day + EVENTS.duration, strength: 1 });
    expect(r.state.transactions[0].label).toContain("Aide exceptionnelle");
  });

  it("survit à la sauvegarde en ligne", () => {
    const g = during(E.newGame(T0), "storm", 0.5);
    expect(E.normalize(unpack(JSON.parse(JSON.stringify(pack({ ...g, eventWeek: 3 }))))).event).toEqual(g.event);
  });
});

describe("guerre économique", () => {
  const alliance = (extra: Partial<E.AllianceState> = {}): E.AllianceState => ({ id: "a", name: "Alpha", tag: "AAA", treasury: 0, leader: "me", members: ["me"], gift: 0, ...extra });
  const EMPTY: E.ShareState = { credit: 0, float: 0, sold: 0, held: [], holders: [] };

  it("blocus : les villes bloquées exportent moins cher, celles qui bloquent un peu plus cher", () => {
    const g = town(), base = E.computeCity(g);
    expect(base.energy.balance).toBeGreaterThan(0);
    const blocked = E.computeCity({ ...g, alliance: alliance({ blockadedBy: { tag: "BBB", until: T0 } }) });
    expect(blocked.effects.exportRatio).toBeCloseTo(EXPORT_RATIO - BLOCKADE.targetLoss, 6);
    expect(blocked.exportsValue).toBeCloseTo(base.exportsValue * (EXPORT_RATIO - BLOCKADE.targetLoss) / EXPORT_RATIO, 4);
    expect(E.computeCity({ ...g, alliance: alliance({ blockading: { tag: "BBB", until: T0 } }) }).effects.exportRatio).toBeCloseTo(EXPORT_RATIO + BLOCKADE.attackerGain, 6);
    expect(E.computeCity({ ...g, alliance: alliance() }).effects.exportRatio).toBeCloseTo(EXPORT_RATIO, 6);
  });

  it("tribut : contrôler une ville rapporte une part de son flux, que son propriétaire paie", () => {
    const g = town(), base = E.computeCity(g);
    const owner = E.computeCity({ ...g, shares: { ...EMPTY, float: 490, sold: 490, holders: [{ holder: "h", name: "Raider", qty: SHARES.control }, { holder: "x", name: "Petit", qty: 90 }] } });
    expect(owner.tribute.paid).toBeCloseTo(base.operating * SHARES.tribute, 4);
    expect(owner.expenses.dividends).toBeCloseTo(base.operating * (0.49 + SHARES.tribute), 4);
    // Sous le seuil de contrôle : des dividendes, pas de tribut
    expect(E.computeCity({ ...g, shares: { ...EMPTY, float: 490, sold: 399, holders: [{ holder: "h", name: "Gros", qty: SHARES.control - 1 }] } }).tribute.paid).toBe(0);
    const holder = E.computeCity({ ...g, shares: { ...EMPTY, held: [{ city: "c", name: "Cible", qty: SHARES.control, cost: 1, netWorth: 1_000_000, income: 50_000 }] } });
    expect(holder.tribute.received).toBeCloseTo(5_000, 6);
    expect(holder.income.dividends).toBeCloseTo(50_000 * SHARES.control / SHARES.total + 5_000, 6);
  });
});

describe("mode test", () => {
  it("donne argent et capital sans limite, débloque tout, et garde la vraie partie de côté", () => {
    const real = { ...E.newGame(T0), cash: 12_345, cityName: "Vraie ville" };
    const g = E.enterSandbox(real, pack(real));
    expect(g.cash).toBe(SANDBOX.cash);
    expect(g.capital).toBe(SANDBOX.capital);
    expect(E.cityRank(g.population)).toBe(8);
    expect(g.bank).toBe(BANK.length - 1);
    expect(g.research).toHaveLength(RESEARCH.length);
    expect(E.build(g, "themepark", T0).ok).toBe(true);           // bâtiment de fin de partie, dès le premier jour
    const back = E.normalize(unpack(g.sandbox!.saved));
    expect(back.cash).toBe(12_345);
    expect(back.cityName).toBe("Vraie ville");
    expect(back.sandbox).toBeUndefined();
  });

  it("la caisse ne se vide jamais et les rangs restent ouverts d'un jour à l'autre", () => {
    let g = E.enterSandbox(E.newGame(T0), null);
    g = { ...g, cash: 5, capital: 0 };
    g = E.tickDay(g, {}, T0);
    expect(g.cash).toBe(SANDBOX.cash);
    expect(g.capital).toBe(SANDBOX.capital);
    expect(g.population).toBe(SANDBOX.population);
    // Une partie normale n'est jamais renflouée
    expect(E.tickDay({ ...E.newGame(T0), cash: 5 }, {}, T0).cash).toBeLessThan(100_000);
  });

  it("le mode test survit à la sauvegarde en ligne, vraie partie comprise", () => {
    const real = { ...E.newGame(T0), cityName: "Vraie ville" };
    const g = E.enterSandbox(real, pack(real));
    const back = E.normalize(unpack(JSON.parse(JSON.stringify(pack(g)))));
    expect(E.normalize(unpack(back.sandbox!.saved)).cityName).toBe("Vraie ville");
  });
});
