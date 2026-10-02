// Format allégé de la sauvegarde en ligne (pur, testable).
// La partie complète reste sur l'appareil ; en ligne on n'envoie que le nécessaire, sous forme compacte :
// - historique : 30 derniers jours complets, puis 1 jour sur 3 jusqu'à 90 jours, en colonnes et en euros entiers ;
// - opérations : les 25 dernières (ce que la page Portefeuille affiche), sans texte quand il se recalcule ;
// - carte : les emplacements regroupés par type de bâtiment.
// Les anciennes sauvegardes (format complet) se relisent telles quelles.
import { dayFlow, type GameState, type Snapshot, type Transaction } from "./engine";
import type { Plot } from "./layout";

const KINDS: Transaction["kind"][] = ["buy", "sell", "build", "demolish", "research"];
const RECENT_DAYS = 30, OLD_DAYS = 60, OLD_STEP = 3, MAX_TX = 25;
const cents = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** [minutes depuis `t0`, jour, liquidités, portefeuille, ville, population, revenus, dépenses,
 *   flux de ville encaissé, frais de courtage?, recherche?, démolitions?] — les jours non gardés sont additionnés dans le suivant. */
type HistRow = [number, number, number, number, number, number, number, number, number?, number?, number?, number?];
/** [date, type, montant, texte (0 = se recalcule), symbole?, quantité?, prix?, plus-value réalisée?] */
type TxRow = [number, number, number, string | 0, string?, number?, number?, number?];

export interface PackedSave extends Omit<GameState, "history" | "transactions" | "plots"> {
  fmt: 2;
  t0: number;
  h: HistRow[];
  tx: TxRow[];
  pl: Record<string, number[]>;
}

const tradeLabel = (kind: Transaction["kind"], qty?: number, symbol?: string) => `${kind === "buy" ? "Achat" : "Vente"} ${qty} × ${symbol}`;

export function pack(g: GameState): PackedSave {
  const H = g.history;
  const first = Math.max(0, H.length - RECENT_DAYS - OLD_DAYS), recentFrom = Math.max(0, H.length - RECENT_DAYS);
  const keep: number[] = [];
  for (let i = first; i < H.length; i++) if (i >= recentFrom || (i - first) % OLD_STEP === 0) keep.push(i);
  const hist = keep.map((i) => H[i]);
  // Flux et coûts : on additionne ceux des jours écartés pour que le bilan de période reste juste.
  const sums = keep.map((i, k) => {
    const row = [0, 0, 0, 0];
    for (let j = k === 0 ? i : keep[k - 1] + 1; j <= i; j++) {
      row[0] += dayFlow(H, j); row[1] += H[j].fees ?? 0; row[2] += H[j].research ?? 0; row[3] += H[j].demolish ?? 0;
    }
    const out = row.map(Math.round);
    while (out.length > 1 && out[out.length - 1] === 0) out.pop();
    return out;
  });
  const t0 = hist[0]?.at ?? g.createdAt;
  const pl: Record<string, number[]> = {};
  for (const p of g.plots) (pl[p.id] ??= []).push(p.x, p.y);
  const { history: _h, transactions: _t, plots: _p, ...rest } = g;
  void _h; void _t; void _p;
  return {
    ...rest,
    cash: cents(g.cash),
    holdings: Object.fromEntries(Object.entries(g.holdings).map(([k, v]) => [k, { qty: v.qty, avgCost: round4(v.avgCost) }])),
    fmt: 2,
    t0,
    h: hist.map((s, k) => [Math.round((s.at - t0) / 60_000), s.day, Math.round(s.cash), Math.round(s.portfolio), Math.round(s.city), Math.round(s.population), Math.round(s.income), Math.round(s.expenses), ...sums[k]] as HistRow),
    tx: g.transactions.slice(0, MAX_TX).map((t) => {
      const trade = t.kind === "buy" || t.kind === "sell";
      const row: TxRow = [t.at, KINDS.indexOf(t.kind), cents(t.amount), trade && t.label === tradeLabel(t.kind, t.qty, t.symbol) ? 0 : t.label];
      if (t.symbol !== undefined) row.push(t.symbol, t.qty, t.price);
      if (t.symbol !== undefined && t.gain !== undefined) row.push(cents(t.gain));
      return row;
    }),
    pl,
  };
}

/** Relit une sauvegarde en ligne, quel que soit son format. */
export function unpack(data: unknown): GameState {
  const d = data as Partial<PackedSave> & Partial<GameState>;
  if (d.fmt !== 2 || !Array.isArray(d.h) || !Array.isArray(d.tx) || !d.pl) return data as GameState;
  const { fmt: _f, t0 = 0, h, tx, pl, ...rest } = d as PackedSave;
  void _f;
  const history: Snapshot[] = h.map(([m, day, cash, portfolio, city, population, income, expenses, flow, fees = 0, research = 0, demolish = 0]) =>
    ({ at: t0 + m * 60_000, day, cash, portfolio, city, netWorth: cash + portfolio + city, population, income, expenses,
      ...(flow !== undefined ? { flow, fees, research, demolish } : {}) }));
  const transactions: Transaction[] = tx.map(([at, k, amount, label, symbol, qty, price, gain], i) => {
    const kind = KINDS[k] ?? "buy";
    return {
      id: `${at.toString(36)}-${tx.length - i}`, at, kind, amount,
      label: label === 0 ? tradeLabel(kind, qty, symbol) : label,
      ...(symbol !== undefined ? { symbol, qty, price } : {}),
      ...(gain !== undefined ? { gain } : {}),
    };
  });
  const plots: Plot[] = Object.entries(pl).flatMap(([id, xy]) =>
    Array.from({ length: Math.floor(xy.length / 2) }, (_, i) => ({ id, x: xy[i * 2], y: xy[i * 2 + 1] })));
  return { ...rest, history, transactions, plots } as GameState;
}
