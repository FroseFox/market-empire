import { describe, expect, it } from "vitest";
import * as E from "./engine";
import {
  CASINO_TIERS, CRASH, SLOT_TRIPLE, SLOT_WEIGHTS, casinoLimits, crashPoint, playCasino, rouletteWins, slotPays, slotSymbol,
  type CasinoResult, type Symbol,
} from "./casino";

const T0 = 1_700_000_000_000;
const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
const played = (r: ReturnType<typeof playCasino>): CasinoResult => { if (!r.ok) throw new Error(r.error); return r; };
/** Ville riche avec un casino de niveau `level`. */
const withCasino = (level = 1): E.GameState => ({ ...E.newGame(T0), cash: 1_000, capital: 500_000, population: 50_000, buildings: { ...E.newGame(T0).buildings, [CASINO_TIERS[level - 1].id]: 1 } });
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe("casino : règles des jeux", () => {
  it("la machine à sous rend environ 95 % des mises en moyenne", () => {
    const syms = Object.keys(SLOT_WEIGHTS) as Symbol[], total = syms.reduce((s, k) => s + SLOT_WEIGHTS[k], 0);
    let rtp = 0;
    for (const a of syms) for (const b of syms) for (const c of syms) rtp += (SLOT_WEIGHTS[a] * SLOT_WEIGHTS[b] * SLOT_WEIGHTS[c]) / total ** 3 * slotPays([a, b, c]);
    expect(rtp).toBeGreaterThan(0.92);
    expect(rtp).toBeLessThan(0.97);
    expect(slotPays(["seven", "seven", "seven"])).toBe(SLOT_TRIPLE.seven);
    expect(slotPays(["cherry", "lemon", "cherry"])).toBe(2);
    expect(slotSymbol(0)).toBe("cherry");
    expect(slotSymbol(0.9999)).toBe("seven");
  });

  it("roulette européenne : le zéro fait perdre les paris simples", () => {
    expect(rouletteWins({ kind: "red" }, 1)).toBe(true);
    expect(rouletteWins({ kind: "black" }, 2)).toBe(true);
    expect(rouletteWins({ kind: "red" }, 0)).toBe(false);
    expect(rouletteWins({ kind: "even" }, 0)).toBe(false);
    expect(rouletteWins({ kind: "dozen", n: 3 }, 36)).toBe(true);
    expect(rouletteWins({ kind: "number", n: 0 }, 0)).toBe(true);
  });

  it("crash : P(point ≥ m) ≈ 0,97 / m, jamais sous ×1", () => {
    expect(crashPoint(0)).toBe(1);
    let over2 = 0; const n = 20_000;
    for (let i = 0; i < n; i++) if (crashPoint((i + 0.5) / n) >= 2) over2++;
    expect(over2 / n).toBeCloseTo(CRASH.edge / 2, 2);
  });
});

describe("casino : déblocage et limites", () => {
  it("il faut un casino dans la ville", () => {
    const r = playCasino({ ...E.newGame(T0), capital: 100_000 }, { game: "slots" }, 100, T0);
    expect(r.ok).toBe(false);
  });

  it("on mise du capital, jamais des liquidités", () => {
    let g = withCasino();
    const win = played(playCasino(g, { game: "roulette", bet: { kind: "number", n: 7 } }, 100, T0, seq(7 / 37 + 0.001)));
    expect(win.payout).toBe(3_600);
    expect(win.state.capital).toBe(g.capital! + 3_500);
    expect(win.state.cash).toBe(g.cash);
    g = win.state;
    const lose = played(playCasino(g, { game: "crash", target: 2 }, 100, T0, seq(0)));
    expect(lose.payout).toBe(0);
    expect(lose.state.capital).toBe(g.capital! - 100);
    expect(lose.state.casino).toMatchObject({ staked: 200, net: 3_400, plays: 2 });
    // Sans capital, pas de mise, même avec la caisse pleine
    expect(playCasino({ ...withCasino(), cash: 1e9, capital: 50 }, { game: "slots" }, 100, T0).ok).toBe(false);
  });

  it("mise max, total du jour, et gain plafonné", () => {
    const g = withCasino();
    expect(playCasino(g, { game: "slots" }, 201, T0).ok).toBe(false);
    // Plafond de gain : 6 000 au niveau 1 → un numéro plein à 200 (7 200) est ramené au plafond
    const r = played(playCasino(g, { game: "roulette", bet: { kind: "number", n: 7 } }, 200, T0, seq(7 / 37 + 0.001)));
    expect(r.capped).toBe(true);
    expect(r.payout - r.bet).toBe(6_000);
    expect(playCasino(r.state, { game: "slots" }, 10, T0).ok).toBe(false);
    // Le lendemain (heure de Paris), tout repart de zéro
    expect(playCasino(r.state, { game: "slots" }, 10, T0 + 86_400_000).ok).toBe(true);
  });

  it("le total misé du jour est limité", () => {
    let g = withCasino();
    for (let i = 0; i < 12; i++) g = played(playCasino(g, { game: "crash", target: 2 }, 200, T0, seq(0))).state;
    expect(playCasino(g, { game: "crash", target: 2 }, 200, T0, seq(0)).ok).toBe(false); // 2 400 + 200 > 2 500
    expect(playCasino(g, { game: "crash", target: 2 }, 100, T0, seq(0)).ok).toBe(true);
  });

  it("le casino s'améliore sans la recherche « Rénovation urbaine »", () => {
    let g: E.GameState = { ...E.newGame(T0), cash: 1e9, capital: 1e9, population: 50_000, territory: 2 };
    g = ok(E.build(g, "casino", T0, { x: 7, y: 7 }));
    g = ok(E.upgrade(g, { x: 7, y: 7 }, T0));
    expect(g.buildings.casino_m).toBe(1);
    expect(casinoLimits(g, T0)!.maxBet).toBe(CASINO_TIERS[1].maxBet);
  });
});
