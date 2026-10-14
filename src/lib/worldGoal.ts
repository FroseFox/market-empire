"use client";
// Objectif commun de la semaine (serveur : world_goal_status / world_goal_claim, migration 20261014c).
// Le serveur suit la progression de tous et dit qui peut réclamer ; la récompense est versée par le jeu,
// à l'échelle de la ville du joueur (comme les missions du jour).
import { create } from "zustand";
import { rpc, useAuth } from "@/lib/auth";
import { STATIC_MODE } from "@/lib/market/client";
import { useGame } from "@/store/game";
import { computeCity, grant } from "@/lib/game/engine";
import { rewardUnit } from "@/lib/game/daily";
import { now } from "@/lib/clock";
import { compactEur, num } from "@/lib/format";
import { useNotifs } from "@/lib/notifs";

export type WorldKind = "population" | "buildings" | "net_worth";
export interface WorldGoal { id: number; kind: WorldKind; target: number; progress: number; mine: number }
export interface WorldStatus extends WorldGoal { players: number; contributors: number; ends: string; claimed: boolean; previous: WorldGoal | null }

/** Récompense : 10 fois la base des missions du jour. */
export const WORLD_UNITS = 10;
export const worldReward = () => WORLD_UNITS * rewardUnit(computeCity(useGame.getState().game));

export function worldText(kind: WorldKind, target: number): string {
  if (kind === "population") return `Gagner ensemble ${num(target)} habitants`;
  if (kind === "buildings") return `Construire ensemble ${num(target)} bâtiments`;
  return `Faire grandir ensemble le patrimoine de ${compactEur(target)}`;
}
export const worldAmount = (kind: WorldKind, v: number) => (kind === "net_worth" ? compactEur(v) : num(v));

export const useWorldGoal = create<{ status: WorldStatus | null; busy: boolean }>(() => ({ status: null, busy: false }));

let lastLoad = 0;
/** Relit l'objectif (au plus une fois par minute, sauf `force`). */
export async function loadWorldGoal(force = false) {
  if (STATIC_MODE || useAuth.getState().status !== "in") return;
  if (!force && Date.now() - lastLoad < 60_000) return;
  lastLoad = Date.now();
  try {
    const r = await rpc<WorldStatus>("world_goal_status", {});
    if (!r) return;
    const st: WorldStatus = { ...r, target: Number(r.target), progress: Number(r.progress), mine: Number(r.mine), previous: r.previous ? { ...r.previous, target: Number(r.previous.target), progress: Number(r.previous.progress), mine: Number(r.previous.mine) } : null };
    useWorldGoal.setState({ status: st });
    // Objectif atteint et récompense à prendre : on le dit (une fois par objectif)
    const ready = st.progress >= st.target && st.mine > 0 && !st.claimed ? st : st.previous;
    if (ready) useNotifs.getState().push({ id: `world-${ready.id}`, tone: "good", title: "Objectif commun atteint", text: `${worldText(ready.kind, ready.target)} : récompense à encaisser`, href: "/monde" });
  } catch { /* serveur muet : on réessaiera */ }
}

/** Réclame la récompense d'un objectif atteint. Renvoie le message à afficher. */
export async function claimWorldGoal(goal: WorldGoal): Promise<string> {
  useWorldGoal.setState({ busy: true });
  try {
    const ok = await rpc<boolean>("world_goal_claim", { p_id: goal.id });
    if (!ok) return "Récompense indisponible (déjà réclamée, ou objectif pas atteint).";
    const amount = worldReward();
    const g = useGame.getState().game;
    useGame.setState({ game: grant(g, amount, `Objectif commun : ${worldText(goal.kind, goal.target)}`, now()) });
    return `+${compactEur(amount)} encaissés : bravo à tous !`;
  } catch { return "Le serveur n'a pas répondu, réessayez."; }
  finally { useWorldGoal.setState({ busy: false }); await loadWorldGoal(true); }
}
