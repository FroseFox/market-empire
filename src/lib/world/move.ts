"use client";
// Déménagement : installer sa ville dans un autre pays, au prix de ce pays.
// La place est d'abord réservée côté serveur (un pays accueille un nombre limité de villes), puis le prix est débité.
import * as E from "@/lib/game/engine";
import { useGame } from "@/store/game";
import { useAuth } from "@/lib/auth";
import { reserveCountry } from "@/lib/online";
import { STATIC_MODE } from "@/lib/market/client";
import { PLAYABLE, countryFull } from "./countries";
import { refreshWorld } from "./players";

/** `current` = pays occupé aujourd'hui, `taken` = pays de chacun des autres joueurs. Renvoie true si le déménagement est fait. */
export async function moveTo(country: string, current: string | null, taken: string[]): Promise<boolean> {
  const { notify } = useGame.getState();
  if (countryFull(country, taken)) { notify("Ce pays est complet : toutes ses places sont prises.", "error"); return false; }
  // Vérification à blanc (prix, pays jouable) avant de réserver quoi que ce soit
  const check = E.relocate(useGame.getState().game, country, Date.now(), current);
  if (!check.ok) { notify(check.error, "error"); return false; }
  if (!STATIC_MODE && useAuth.getState().status === "in") {
    try {
      if (!(await reserveCountry(country))) { notify("Ce pays est complet pour le moment.", "error"); refreshWorld(); return false; }
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
