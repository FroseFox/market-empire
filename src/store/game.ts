"use client";
// État du joueur (mode local : sauvegardé dans le navigateur).
// Quand Supabase sera branché, ces actions appelleront les fonctions SQL
// `trade` / `build` côté serveur au lieu de modifier l'état localement.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as E from "@/lib/game/engine";

export interface QuoteView { price: number; change: number; source: string }

interface Store {
  game: E.GameState;
  quotes: Record<string, QuoteView>;
  dataMode: string;
  lastQuoteAt: number;
  toast: { text: string; kind: "ok" | "error" } | null;

  prices: () => E.Prices;
  setQuotes: (q: { symbol: string; price: number; change: number; source: string }[], mode: string) => void;
  sync: () => number;
  buy: (symbol: string, qty: number) => Promise<boolean>;
  sell: (symbol: string, qty: number) => Promise<boolean>;
  build: (id: string) => boolean;
  demolish: (id: string) => boolean;
  skipDay: () => void;
  reset: () => void;
  notify: (text: string, kind?: "ok" | "error") => void;
}

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`/api/quotes?symbols=${symbol}`, { cache: "no-store" });
    const j = await r.json();
    return j.quotes?.[0]?.price ?? null;
  } catch { return null; }
}

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      game: E.newGame(Date.now()),
      quotes: {},
      dataMode: "simulé",
      lastQuoteAt: 0,
      toast: null,

      prices: () => Object.fromEntries(Object.entries(get().quotes).map(([s, q]) => [s, q.price])),

      setQuotes: (list, mode) => {
        const quotes = { ...get().quotes };
        for (const q of list) quotes[q.symbol] = { price: q.price, change: q.change, source: q.source };
        set({ quotes, dataMode: mode, lastQuoteAt: Date.now() });
      },

      sync: () => {
        const { state, days } = E.catchUp(get().game, Date.now(), get().prices());
        if (days > 0) set({ game: state });
        return days;
      },

      // Le prix d'exécution est toujours redemandé au serveur au moment de l'ordre.
      buy: async (symbol, qty) => {
        const price = await fetchPrice(symbol);
        if (!price) { get().notify("Prix indisponible, réessayez.", "error"); return false; }
        const r = E.buy(get().game, symbol, qty, price, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().setQuotes([{ symbol, price, change: get().quotes[symbol]?.change ?? 0, source: get().quotes[symbol]?.source ?? "" }], get().dataMode);
        get().notify(`Achat de ${qty} ${symbol} à ${price.toLocaleString("fr-FR")} €`);
        return true;
      },
      sell: async (symbol, qty) => {
        const price = await fetchPrice(symbol);
        if (!price) { get().notify("Prix indisponible, réessayez.", "error"); return false; }
        const r = E.sell(get().game, symbol, qty, price, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify(`Vente de ${qty} ${symbol} à ${price.toLocaleString("fr-FR")} €`);
        return true;
      },
      build: (id) => {
        const r = E.build(get().game, id, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Construction terminée");
        return true;
      },
      demolish: (id) => {
        const r = E.demolish(get().game, id, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        return true;
      },
      // Outil de test : avance d'un jour de ville.
      skipDay: () => {
        const g = get().game;
        set({ game: { ...E.tickDay(g, get().prices(), Date.now()), lastTick: g.lastTick } });
      },
      reset: () => set({ game: E.newGame(Date.now()) }),
      notify: (text, kind = "ok") => {
        set({ toast: { text, kind } });
        setTimeout(() => { if (get().toast?.text === text) set({ toast: null }); }, 3200);
      },
    }),
    {
      name: "market-empire-save",
      version: 1,
      partialize: (s) => ({ game: s.game, quotes: s.quotes }),
    },
  ),
);

/** Valeurs dérivées utilisées par toutes les pages. */
export function useDerived() {
  const game = useGame((s) => s.game);
  const quotes = useGame((s) => s.quotes);
  const prices = Object.fromEntries(Object.entries(quotes).map(([k, q]) => [k, q.price]));
  const city = E.computeCity(game);
  const portfolio = E.portfolioValue(game.holdings, prices);
  const cost = E.portfolioCost(game.holdings);
  const netWorth = game.cash + portfolio + city.assetValue;
  return { game, quotes, prices, city, portfolio, portfolioCost: cost, netWorth };
}
