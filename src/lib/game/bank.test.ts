import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { BANK, BUILDING_BY_ID, CAPITAL, CITY_RANKS, LEVERAGE } from "./config";
import { pack, unpack } from "./pack";

const T0 = 1_700_000_000_000;
const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
/** Partie avec une Banque du niveau voulu (0 = départ) et de quoi miser. */
const game = (bank = 0, cash = 100_000): E.GameState => ({ ...E.newGame(T0), population: CITY_RANKS[BANK[bank].minRank].pop, cash, bank });
/** Mise `stake` euros sur un actif au cours `price`, comme le fait le bouton Acheter. */
const invest = (g: E.GameState, symbol: string, stake: number, price: number) =>
  E.buy(g, symbol, E.sharesFor(stake * E.cityLeverage(g, symbol), price), price, T0);

describe("levier unique de la ville", () => {
  it("tout achat est multiplié par le levier de la Banque : gains et pertes aussi", () => {
    const g = ok(invest(game(5), "AAPL", 10_000, 200)); // niveau maximal : ×5
    const h = g.holdings.AAPL;
    expect(h.qty).toBeCloseTo(250, 6);                  // 50 000 € de titres pour 10 000 € de mise
    expect(h.debt).toBeCloseTo(40_000, 2);
    expect(g.cash).toBeCloseTo(100_000 - 10_000 - 50, 2); // mise + 0,1 % de frais sur les 50 000 €
    expect(E.holdingStake(h)).toBeCloseTo(10_000, 2);
    expect(E.holdingValue(h, 204)).toBeCloseTo(11_000, 2); // +2 % du cours = +10 % de la mise
    expect(E.holdingValue(h, 196)).toBeCloseTo(9_000, 2);
    expect(E.portfolioValue(g.holdings, { AAPL: 204 })).toBeCloseTo(11_000, 2);
    expect(E.snapshot(g, { AAPL: 204 }, T0).portfolio).toBeCloseTo(11_000, 2);
  });

  it("le levier vient du niveau de la Banque, limité pour les actifs très volatils", () => {
    expect(BANK.map((_, i) => E.cityLeverage(game(i), "AAPL"))).toEqual([1.5, 2, 2.5, 3, 4, 5]);
    expect(E.cityLeverage(game(5), "BTC")).toBe(LEVERAGE.maxByKind.crypto);
    expect(ok(invest(game(0), "AAPL", 10_000, 200)).holdings.AAPL.qty).toBeCloseTo(75, 6); // ×1,5 dès le départ
  });

  it("rend la mise et le gain à la vente, emprunt remboursé et frais déduits", () => {
    const g = ok(invest(game(5), "AAPL", 10_000, 200));
    const half = ok(E.sell(g, "AAPL", 125, 204, T0 + 1000));
    expect(half.holdings.AAPL.debt).toBeCloseTo(20_000, 2);
    expect(half.cash).toBeCloseTo(g.cash + 5_500 - 25.5, 2);
    const closed = ok(E.sell(half, "AAPL", 125, 204, T0 + 2000));
    expect(closed.holdings.AAPL).toBeUndefined();
    expect(closed.cash).toBeCloseTo(g.cash + 11_000 - 51, 2);
    expect(closed.realized).toBeCloseTo(1_000 - 51, 2);
  });

  it("ne fait jamais perdre plus que la mise", () => {
    const g = ok(invest(game(5), "AAPL", 10_000, 200));
    expect(E.holdingValue(g.holdings.AAPL, 100)).toBe(0);
    expect(ok(E.sell(g, "AAPL", 250, 100, T0 + 1000)).cash).toBeCloseTo(g.cash, 2);
  });

  it("vend d'office la ligne quand il ne reste que 10 % de la mise", () => {
    const g = ok(invest(game(5), "AAPL", 10_000, 200));
    const liq = E.liquidationPrice(g.holdings.AAPL);
    expect(liq).toBeCloseTo(200 * (1 - (1 - LEVERAGE.liquidation) / 5), 6); // −18 % avec un levier ×5
    expect(E.settleLeverage(g, { AAPL: liq + 1 }, T0).closed).toHaveLength(0);
    const r = E.settleLeverage(g, { AAPL: liq - 0.5 }, T0);
    expect(r.closed).toEqual(["AAPL"]);
    expect(r.state.holdings.AAPL).toBeUndefined();
    expect(r.state.cash).toBeGreaterThan(g.cash);        // il reste un petit quelque chose
    expect(r.state.cash).toBeLessThan(g.cash + 1_000);
    expect(r.state.transactions[0].label).toContain("Vente d'office");
    // Cours inconnu : on ne vend rien
    expect(E.settleLeverage(g, {}, T0).closed).toHaveLength(0);
  });

  it("fait payer des intérêts sur la somme prêtée à chaque jour de ville", () => {
    const g = ok(invest(game(5), "AAPL", 10_000, 200));
    expect(E.dailyInterest(g.holdings)).toBeCloseTo(40_000 * LEVERAGE.dayRate, 2);
    const next = E.tickDay(g, { AAPL: 200 }, T0 + E.DAY_MS);
    expect(next.cash).toBeCloseTo(g.cash + E.computeCity(g).net - 8, 2);
    expect(next.history.at(-1)!.fees).toBeCloseTo(50 + 8, 2); // courtage du jour + intérêts
  });
});

describe("Banque de la ville", () => {
  it("plafonne la mise totale en bourse", () => {
    const g = game(0);
    expect(E.investCap(g)).toBe(50_000);
    const full = ok(invest(g, "AAPL", 50_000, 200));
    expect(E.investRoom(full)).toBeLessThan(1);
    expect(invest(full, "MSFT", 1_000, 300).ok).toBe(false);
    expect(invest(g, "AAPL", 50_001, 200).ok).toBe(false);
    // Vendre libère de la place
    expect(E.investRoom(ok(E.sell(full, "AAPL", full.holdings.AAPL.qty / 2, 200, T0)))).toBeCloseTo(25_000, 0);
  });

  it("s'agrandit avec le rang de la ville et les liquidités", () => {
    expect(E.upgradeBank(game(0), T0).ok).toBe(false);                                      // un village n'y a pas droit
    expect(E.upgradeBank({ ...game(0), population: CITY_RANKS[1].pop, cash: 100 }, T0).ok).toBe(false);
    const g = ok(E.upgradeBank({ ...game(0), population: CITY_RANKS[1].pop }, T0));
    expect(g.bank).toBe(1);
    expect(g.cash).toBe(100_000 - BANK[1].cost);
    expect(E.cityLeverage(g)).toBe(2);
    expect(E.investCap(g)).toBe(150_000);
    expect(E.upgradeBank(game(5), T0).ok).toBe(false);                                      // déjà au maximum
  });
});

describe("capital : la bourse fait grandir la ville", () => {
  it("les placements en produisent chaque jour, selon ce qu'ils valent", () => {
    const g = ok(invest(game(5), "AAPL", 10_000, 200));
    expect(E.capitalPerDay(g.holdings, { AAPL: 200 })).toBeCloseTo(10_000 * CAPITAL.dayRate, 2);
    expect(E.capitalPerDay(g.holdings, { AAPL: 204 })).toBeCloseTo(11_000 * CAPITAL.dayRate, 2); // la hausse compte, levier compris
    expect(E.tickDay(g, { AAPL: 204 }, T0).capital).toBeCloseTo(220, 2);
    expect(E.tickDay(game(5), {}, T0).capital).toBe(0);                                          // rien de placé : rien de produit
  });

  it("les gros bâtiments en demandent, pas ceux du début", () => {
    expect(E.capitalCost(BUILDING_BY_ID.house_s)).toBe(0);
    expect(E.capitalCost(BUILDING_BY_ID.house_m)).toBe(0);
    expect(E.capitalCost(BUILDING_BY_ID.services)).toBe(10_000);
    const rich = { ...game(0, 1_000_000), population: 5_000 };
    expect(E.build(rich, "house_s", T0).ok).toBe(true);
    const refused = E.build(rich, "services", T0);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("Capital insuffisant");
    const built = ok(E.build({ ...rich, capital: 12_000 }, "services", T0));
    expect(built.capital).toBe(2_000);
    expect(built.cash).toBe(900_000);
  });

  it("une amélioration ne demande que la différence", () => {
    const g = { ...game(0, 1_000_000), population: 5_000, research: [...E.newGame(T0).research, "city_upgrade"], capital: 12_000 };
    const withOffice = ok(E.build(g, "services", T0));
    const plot = withOffice.plots.find((p) => p.id === "services")!;
    expect(E.upgradeOffer(withOffice, "services")).toEqual({ to: "bank", cost: 300_000, capital: 30_000 });
    expect(E.upgrade(withOffice, plot, T0).ok).toBe(false);
    expect(ok(E.upgrade({ ...withOffice, capital: 31_000 }, plot, T0)).capital).toBe(1_000);
  });
});

describe("sauvegardes", () => {
  it("les lignes à levier survivent à la sauvegarde en ligne", () => {
    const g = ok(invest(game(5), "AAPL", 10_000, 200));
    const back = E.normalize(unpack(JSON.parse(JSON.stringify(pack(g)))));
    expect(back.holdings).toEqual(g.holdings);
    expect(back.bank).toBe(5);
    expect(back.transactions[0].label).toBe(g.transactions[0].label);
  });

  it("une partie d'avant la Banque garde ses positions à levier, converties en lignes", () => {
    const old = { ...E.newGame(T0), population: CITY_RANKS[3].pop } as E.GameState;
    delete old.bank; delete old.capital;
    old.holdings = { AAPL: { qty: 10, avgCost: 150 } };
    old.positions = [{ id: "a", symbol: "AAPL", lev: 5, stake: 10_000, qty: 250, entry: 200, interest: 40, at: T0 }, { id: "b", symbol: "MSFT", lev: 2, stake: 3_000, qty: 20, entry: 300, interest: 0, at: T0 }];
    const before = E.portfolioValue(old.holdings, { AAPL: 210 }) + (10_000 + 250 * 10 - 40) + (3_000 + 20 * 10);
    const g = E.normalize(old);
    expect(g.positions).toBeUndefined();
    expect(g.holdings.AAPL.qty).toBe(260);
    expect(g.holdings.AAPL.debt).toBeCloseTo(40_040, 2);
    expect(E.portfolioValue(g.holdings, { AAPL: 210, MSFT: 310 })).toBeCloseTo(before, 2); // même valeur qu'avant
    expect(g.bank).toBe(3);                                                                   // niveau offert selon le rang atteint
    expect(g.capital).toBeCloseTo(E.portfolioCost(g.holdings) * CAPITAL.dayRate * CAPITAL.legacyDays, 2);
    expect(E.normalize(g)).toBe(g);
  });
});
