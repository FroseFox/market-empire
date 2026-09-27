"use client";
// État du joueur (mode local : sauvegardé dans le navigateur).
// Quand Supabase sera branché, ces actions appelleront les fonctions SQL
// `trade` / `build` côté serveur au lieu de modifier l'état localement.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as E from "@/lib/game/engine";
import { fetchQuotes } from "@/lib/market/client";

export interface QuoteView { price: number; change: number; source: string }

interface Store {
  game: E.GameState;
  /** Dernière modification de la partie (pour choisir la sauvegarde la plus récente). */
  savedAt: number;
  cloud: "local" | "syncing" | "saved" | "error";
  quotes: Record<string, QuoteView>;
  dataMode: string;
  /** Heure de mise à jour des cours publiés. */
  quotesAt: number;
  lastQuoteAt: number;
  toast: { text: string; kind: "ok" | "error" } | null;

  prices: () => E.Prices;
  setQuotes: (q: { symbol: string; price: number; change: number; source: string }[], mode: string) => void;
  sync: () => number;
  buy: (symbol: string, qty: number) => Promise<boolean>;
  sell: (symbol: string, qty: number) => Promise<boolean>;
  build: (id: string, tile?: { x: number; y: number }) => boolean;
  demolish: (id: string, tile?: { x: number; y: number }) => boolean;
  moveBuilding: (from: { x: number; y: number }, to: { x: number; y: number }) => boolean;
  research: (id: string) => boolean;
  createFolder: (name: string, symbols?: string[]) => string | null;
  updateFolder: (id: string, patch: Partial<Omit<E.Folder, "id">>) => void;
  deleteFolder: (id: string) => void;
  renameCity: (name: string) => boolean;
  closeTutorial: () => void;
  skipDay: () => void;
  reset: () => void;
  notify: (text: string, kind?: "ok" | "error") => void;
}

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const j = await fetchQuotes([symbol]);
    return j.quotes?.[0]?.price ?? null;
  } catch { return null; }
}

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      game: E.newGame(Date.now()),
      savedAt: 0,
      cloud: "local",
      quotes: {},
      dataMode: "simulé",
      quotesAt: 0,
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
      build: (id, tile) => {
        const r = E.build(get().game, id, Date.now(), tile);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Construction terminée");
        return true;
      },
      demolish: (id, tile) => {
        const r = E.demolish(get().game, id, Date.now(), tile);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        return true;
      },
      moveBuilding: (from, to) => {
        const r = E.moveBuilding(get().game, from, to);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Bâtiment déplacé");
        return true;
      },
      research: (id) => {
        const r = E.doResearch(get().game, id, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Recherche débloquée");
        return true;
      },
      createFolder: (name, symbols = []) => {
        const r = E.createFolder(get().game, name, Date.now(), symbols);
        if (!r.ok) { get().notify(r.error, "error"); return null; }
        set({ game: r.state });
        return r.state.folders[r.state.folders.length - 1].id;
      },
      updateFolder: (id, patch) => {
        const r = E.updateFolder(get().game, id, patch);
        if (r.ok) set({ game: r.state });
      },
      deleteFolder: (id) => {
        const r = E.deleteFolder(get().game, id);
        if (r.ok) set({ game: r.state });
      },
      renameCity: (name) => {
        const r = E.renameCity(get().game, name);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Ville renommée");
        return true;
      },
      closeTutorial: () => set({ game: { ...get().game, tutorialDone: true } }),
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
      // Stockage tolérant : si le navigateur refuse la sauvegarde, le jeu tourne quand même.
      storage: createJSONStorage(() => ({
        getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
        setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sauvegarde indisponible */ } },
        removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* idem */ } },
      })),
      version: 2,
      migrate: (persisted) => {
        const p = persisted as { game?: E.GameState; quotes?: Record<string, QuoteView> };
        return { ...p, game: p.game ? E.normalize(p.game) : E.newGame(Date.now()) } as Store;
      },
      partialize: (s) => ({ game: s.game, quotes: s.quotes, savedAt: s.savedAt }),
      // Toujours réparer la partie chargée (nouveaux champs ajoutés depuis la sauvegarde)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return { ...current, ...p, game: p.game ? E.normalize(p.game) : current.game };
      },
    },
  ),
);

// Horodate chaque changement de partie
useGame.subscribe((s, prev) => {
  if (s.game !== prev.game && s.savedAt === prev.savedAt) useGame.setState({ savedAt: Date.now() });
});

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
