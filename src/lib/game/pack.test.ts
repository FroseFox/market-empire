import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { pack, unpack } from "./pack";

/** Partie bien avancée : 200 jours, achats, ventes, constructions. */
function longGame(): E.GameState {
  let g = E.newGame(1_700_000_000_000);
  const prices = { NVDA: 160.1234, AAPL: 205.5 };
  const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
  for (let d = 0; d < 200; d++) {
    const at = g.lastTick + E.DAY_MS;
    g = E.tickDay(g, prices, at);
    if (d % 5 === 0) g = ok(E.buy(g, d % 2 ? "AAPL" : "NVDA", 1, prices[d % 2 ? "AAPL" : "NVDA"], at));
    if (d % 40 === 7) g = ok(E.build(g, "house_s", at));
  }
  return ok(E.sell(g, "NVDA", 2, 170.5, g.lastTick));
}
const size = (v: unknown) => JSON.stringify(v).length;

describe("sauvegarde en ligne allégée", () => {
  const g = longGame();
  const back = E.normalize(unpack(JSON.parse(JSON.stringify(pack(g)))));

  it("restitue l'état de jeu à l'identique", () => {
    for (const k of ["playerName", "cityName", "createdAt", "lastTick", "day", "population", "buildings", "research", "folders"] as const) expect(back[k]).toEqual(g[k]);
    expect(back.cash).toBeCloseTo(g.cash, 2);
    expect(Object.keys(back.holdings)).toEqual(Object.keys(g.holdings));
    for (const [s, h] of Object.entries(g.holdings)) { expect(back.holdings[s].qty).toBe(h.qty); expect(back.holdings[s].avgCost).toBeCloseTo(h.avgCost, 4); }
    const key = (p: { id: string; x: number; y: number }) => `${p.id}@${p.x},${p.y}`;
    expect(back.plots.map(key).sort()).toEqual(g.plots.map(key).sort());
  });

  it("garde les 25 dernières opérations avec leur texte", () => {
    expect(back.transactions).toHaveLength(25);
    back.transactions.forEach((t, i) => {
      const o = g.transactions[i];
      expect([t.at, t.kind, t.label, t.symbol, t.qty, t.price, t.gain]).toEqual([o.at, o.kind, o.label, o.symbol, o.qty, o.price, o.gain]);
      expect(t.amount).toBeCloseTo(o.amount, 2);
    });
    expect(new Set(back.transactions.map((t) => t.id)).size).toBe(25);
  });

  it("garde 30 jours complets d'historique, puis un jour sur trois", () => {
    expect(back.history).toHaveLength(50);
    const last = g.history[g.history.length - 1], b = back.history[back.history.length - 1];
    expect(b.day).toBe(last.day);
    expect(Math.abs(b.netWorth - last.netWorth)).toBeLessThan(2);
    expect(Math.abs(b.at - last.at)).toBeLessThan(60_000);
  });

  it("pèse au moins quatre fois moins que la sauvegarde complète", () => {
    const before = size({ ...g, history: g.history.slice(-120), transactions: g.transactions.slice(0, 50) });
    expect(size(pack(g)) * 4).toBeLessThan(before);
    console.info(`sauvegarde : ${before} → ${size(pack(g))} octets`);
  });

  it("conserve le bilan de période malgré les jours écartés", () => {
    const a = E.periodReport(g, 0, Infinity), b = E.periodReport(back, 0, Infinity);
    const sum = (h: E.Snapshot[], k: "flow" | "fees") => h.reduce((t, x) => t + (x[k] ?? 0), 0);
    expect(Math.abs(sum(back.history.slice(1), "flow") - sum(g.history.slice(-90).slice(1), "flow"))).toBeLessThan(50);
    expect(Math.abs(sum(back.history.slice(1), "fees") - sum(g.history.slice(-90).slice(1), "fees"))).toBeLessThan(50);
    expect(b.fees).toBeLessThanOrEqual(a.fees + 1);
  });

  it("relit une ancienne sauvegarde complète sans la modifier", () => {
    expect(unpack(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });
});
