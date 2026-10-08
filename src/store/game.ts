"use client";
// État du joueur (mode local : sauvegardé dans le navigateur).
// Quand Supabase sera branché, ces actions appelleront les fonctions SQL
// `trade` / `build` côté serveur au lieu de modifier l'état localement.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as E from "@/lib/game/engine";
import { fetchQuotes } from "@/lib/market/client";
import type { OrientationId } from "@/lib/game/config";
import { pack, unpack } from "@/lib/game/pack";

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
  /** Dernière action de construction annulable : la partie telle qu'elle était juste avant. */
  undo: { game: E.GameState; label: string } | null;
  /** Journal affiché au retour d'une absence de plusieurs jours. */
  absence: E.AbsenceReport | null;

  prices: () => E.Prices;
  setQuotes: (q: { symbol: string; price: number; change: number; source: string }[], mode: string) => void;
  sync: () => number;
  /** Mise `amount` euros sur un actif, au cours du moment : la Banque de la ville multiplie la mise par son levier. */
  buy: (symbol: string, amount: number) => Promise<boolean>;
  /** Vend d'office les lignes qui ont presque tout perdu. */
  settle: () => void;
  /** Retire `amount` euros d'une ligne (sa valeur, emprunt déduit) ; `all` vend toute la ligne. */
  sell: (symbol: string, amount: number, all?: boolean) => Promise<boolean>;
  upgradeBank: () => boolean;
  build: (id: string, tile?: { x: number; y: number }) => boolean;
  /** Construit jusqu'à `count` exemplaires, placés automatiquement. Renvoie le nombre construit. */
  buildAuto: (id: string, count: number) => number;
  undoLast: () => void;
  expandTerritory: () => boolean;
  chooseOrientation: (id: OrientationId) => boolean;
  closeAbsence: () => void;
  reopenTutorial: () => void;
  demolish: (id: string, tile?: { x: number; y: number }) => boolean;
  moveBuilding: (from: { x: number; y: number }, to: { x: number; y: number }) => boolean;
  research: (id: string) => boolean;
  renameCity: (name: string) => boolean;
  claimGoal: (id: string) => boolean;
  upgrade: (tile: { x: number; y: number }) => boolean;
  openBranch: (symbol: string) => boolean;
  closeBranch: (symbol: string) => void;
  openDesk: (hub: string) => boolean;
  renovate: () => boolean;
  buildProject: (id: string) => boolean;
  closeTutorial: () => void;
  /** Outil de test : avance de `days` jours de ville (développement, ou partie en mode test). */
  skipDay: (days?: number) => void;
  /** Mode test (comptes de test) : argent et capital sans limite, tout débloqué. La vraie partie est gardée de côté. */
  enterSandbox: () => void;
  /** Quitte le mode test et reprend la vraie partie là où elle était. */
  leaveSandbox: () => void;
  /** Mode test : déclenche tout de suite un événement de ville. Renvoie son nom. */
  forceEvent: () => string | null;
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
      undo: null,
      absence: null,

      prices: () => Object.fromEntries(Object.entries(get().quotes).map(([s, q]) => [s, q.price])),

      setQuotes: (list, mode) => {
        const quotes = { ...get().quotes };
        for (const q of list) quotes[q.symbol] = { price: q.price, change: q.change, source: q.source };
        set({ quotes, dataMode: mode, lastQuoteAt: Date.now() });
        get().settle();
      },

      // Levier : vente d'office des lignes qui ont presque tout perdu
      settle: () => {
        const r = E.settleLeverage(get().game, get().prices(), Date.now());
        if (!r.closed.length) return;
        set({ game: r.state });
        get().notify(r.closed.length === 1 ? `Ligne vendue d'office : ${r.closed[0]}` : `${r.closed.length} lignes vendues d'office`, "error");
      },
      upgradeBank: () => {
        const r = E.upgradeBank(get().game, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify(`Banque agrandie : levier ×${E.cityLeverage(r.state).toLocaleString("fr-FR")}`);
        return true;
      },

      sync: () => {
        const { state, days } = E.catchUp(get().game, Date.now(), get().prices());
        // Retour après plusieurs jours : on garde de quoi raconter ce qui s'est passé
        if (days > 0) { set({ game: state, ...(days >= 3 ? { absence: E.absenceReport(get().game, state) } : {}) }); get().settle(); }
        return days;
      },

      // Le prix d'exécution est toujours redemandé au serveur au moment de l'ordre.
      buy: async (symbol, amount) => {
        const price = await fetchPrice(symbol);
        if (!price) { get().notify("Prix indisponible, réessayez.", "error"); return false; }
        const qty = E.sharesFor(amount * E.cityLeverage(get().game, symbol), price);
        if (qty <= 0) { get().notify("Montant trop faible pour ce cours.", "error"); return false; }
        const r = E.buy(get().game, symbol, qty, price, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().setQuotes([{ symbol, price, change: get().quotes[symbol]?.change ?? 0, source: get().quotes[symbol]?.source ?? "" }], get().dataMode);
        get().notify(`Achat de ${qty.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} ${symbol} à ${price.toLocaleString("fr-FR")} €`);
        return true;
      },
      sell: async (symbol, amount, all = false) => {
        const price = await fetchPrice(symbol);
        if (!price) { get().notify("Prix indisponible, réessayez.", "error"); return false; }
        const h = get().game.holdings[symbol];
        const held = h?.qty ?? 0, value = h ? E.holdingValue(h, price) : 0;
        // Tout vendre, ou un montant qui couvre toute la ligne : on vend exactement ce qui est détenu (pas de reliquat)
        const qty = all || amount >= value - 0.005 ? held : E.sharesFor(amount * held, value);
        if (qty <= 0) { get().notify(held > 0 ? "Montant trop faible pour ce cours." : "Vous ne détenez pas cet actif.", "error"); return false; }
        const r = E.sell(get().game, symbol, qty, price, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify(`Vente de ${qty.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} ${symbol} à ${price.toLocaleString("fr-FR")} €`);
        return true;
      },
      build: (id, tile) => {
        const r = E.build(get().game, id, Date.now(), tile);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state, undo: { game: get().game, label: "Construction" } });
        get().notify("Construction terminée");
        return true;
      },
      demolish: (id, tile) => {
        const r = E.demolish(get().game, id, Date.now(), tile);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state, undo: { game: get().game, label: "Démolition" } });
        return true;
      },
      moveBuilding: (from, to) => {
        const r = E.moveBuilding(get().game, from, to);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state, undo: { game: get().game, label: "Déplacement" } });
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
      renameCity: (name) => {
        const r = E.renameCity(get().game, name);
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Ville renommée");
        return true;
      },
      claimGoal: (id) => {
        const r = E.claimGoal(get().game, id, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Subvention encaissée");
        return true;
      },
      upgrade: (tile) => {
        const r = E.upgrade(get().game, tile, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state, undo: { game: get().game, label: "Amélioration" } });
        get().notify("Bâtiment amélioré");
        return true;
      },
      openBranch: (symbol) => {
        const r = E.openBranch(get().game, symbol, get().quotes[symbol]?.price ?? 0, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Entreprise implantée dans votre ville");
        return true;
      },
      closeBranch: (symbol) => {
        const r = E.closeBranch(get().game, symbol);
        if (r.ok) set({ game: r.state });
      },
      openDesk: (hub) => {
        const r = E.openDesk(get().game, hub, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify(`Bureau ouvert à ${hub}`);
        return true;
      },
      renovate: () => {
        const r = E.renovate(get().game, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Ville rénovée");
        return true;
      },
      buildProject: (id) => {
        const r = E.buildProject(get().game, id, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Grand projet achevé");
        return true;
      },
      buildAuto: (id, count) => {
        const before = get().game;
        let g = before, done = 0, error = "";
        for (let i = 0; i < count; i++) {
          const r = E.build(g, id, Date.now());
          if (!r.ok) { error = r.error; break; }
          g = r.state; done++;
        }
        if (done > 0) { set({ game: g, undo: { game: before, label: done > 1 ? `${done} constructions` : "Construction" } }); get().notify(done > 1 ? `${done} bâtiments construits` : "Construction terminée"); }
        else get().notify(error || "Construction impossible.", "error");
        return done;
      },
      undoLast: () => {
        const u = get().undo;
        if (!u) return;
        set({ game: u.game, undo: null });
        get().notify(`Annulé : ${u.label.toLowerCase()}`);
      },
      expandTerritory: () => {
        const r = E.expandTerritory(get().game, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        get().notify("Territoire agrandi");
        return true;
      },
      chooseOrientation: (id) => {
        const r = E.chooseOrientation(get().game, id, Date.now());
        if (!r.ok) { get().notify(r.error, "error"); return false; }
        set({ game: r.state });
        return true;
      },
      closeAbsence: () => set({ absence: null }),
      reopenTutorial: () => set({ game: { ...get().game, tutorialDone: false } }),
      closeTutorial: () => set({ game: { ...get().game, tutorialDone: true } }),
      // Outil de test : avance de quelques jours de ville (développement, ou partie en mode test).
      skipDay: (days = 1) => {
        const g = get().game;
        if (process.env.NODE_ENV === "production" && !g.sandbox) return;
        let next = g;
        for (let i = 0; i < Math.min(days, 200); i++) next = E.tickDay(next, get().prices(), Date.now());
        set({ game: { ...next, lastTick: g.lastTick } });
        get().settle();
      },
      enterSandbox: () => {
        const g = get().game;
        if (g.sandbox) return;
        set({ game: E.enterSandbox(g, pack(g)) });
        get().notify("Mode test activé : votre vraie partie est gardée de côté");
      },
      leaveSandbox: () => {
        const saved = get().game.sandbox?.saved;
        if (!saved) return;
        set({ game: E.normalize(unpack(saved)) });
        get().sync();
        get().notify("Mode test quitté : votre vraie partie est de retour");
      },
      forceEvent: () => {
        const g = get().game;
        if (!g.sandbox) return null;
        const r = E.rollEvent(g, E.computeCity(g), Math.floor(Math.random() * 1e9), Date.now(), true);
        if (r.def) set({ game: r.state });
        return r.def?.name ?? null;
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

// L'annulation ne vaut que pour la toute dernière action : tout autre changement de la partie
// (ordre de bourse, passage d'un jour, recherche…) la fait disparaître.
useGame.subscribe((s, prev) => {
  if (s.game !== prev.game && s.undo && s.undo === prev.undo) useGame.setState({ undo: null });
});

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
  // Les parts de villes comptent dans le patrimoine, à part du portefeuille de bourse réelle
  const cityShares = E.sharesValue(game);
  const netWorth = game.cash + portfolio + cityShares + city.assetValue;
  return { game, quotes, prices, city, portfolio, portfolioCost: cost, cityShares, netWorth };
}
