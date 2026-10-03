"use client";
// Déménagement : installer sa ville dans un autre pays, au prix de ce pays.
// Le pays est d'abord réservé côté serveur (un seul joueur par pays), puis le prix est débité.
import * as E from "@/lib/game/engine";
import { useGame } from "@/store/game";
import { useAuth } from "@/lib/auth";
import { reserveCountry } from "@/lib/online";
import { STATIC_MODE } from "@/lib/market/client";
import { PLAYABLE } from "./countries";
import { refreshWorld } from "./players";

/** `current` = pays occupé aujourd'hui, `taken` = pays des autres joueurs. Renvoie true si le déménagement est fait. */
export async function moveTo(country: string, current: string | null, taken: string[]): Promise<boolean> {
  const { notify } = useGame.getState();
  if (taken.includes(country)) { notify("Ce pays est déjà occupé par un autre joueur.", "error"); return false; }
  // Vérification à blanc (prix, pays jouable) avant de réserver quoi que ce soit
  const check = E.relocate(useGame.getState().game, country, Date.now(), current);
  if (!check.ok) { notify(check.error, "error"); return false; }
  if (!STATIC_MODE && useAuth.getState().status === "in") {
    try {
      if (!(await reserveCountry(country))) { notify("Ce pays vient d'être pris par un autre joueur.", "error"); refreshWorld(); return false; }
    } catch {
      notify("Déménagement indisponible pour le moment, réessayez plus tard.", "error");
      return false;
    }
  }
  const r = E.relocate(useGame.getState().game, country, Date.now(), current);
  if (!r.ok) { notify(r.error, "error"); return false; }
  useGame.setState({ game: r.state });
  notify(`Votre ville est maintenant installée : ${PLAYABLE[country]}`);
  refreshWorld();
  return true;
}
