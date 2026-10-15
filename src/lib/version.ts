// Version du jeu : détecte une appli restée ouverte (ou installée) pendant qu'une nouvelle version était publiée.
// Une vieille version appelle des fonctions du serveur qui ont pu changer : on propose de recharger.
import { create } from "zustand";
import { BASE_PATH } from "@/lib/market/client";

/** Identifiant de cette version (commit publié) ; « dev » en local, où rien n'est vérifié. */
export const BUILD = process.env.NEXT_PUBLIC_BUILD || "dev";

/** Numéro de version affiché (ex. 0.9.116 : 116e publication). */
export const APP_VERSION = process.env.NEXT_PUBLIC_VERSION || "dev";

export const useVersion = create<{ outdated: boolean }>(() => ({ outdated: false }));

let last = 0;
/** Relit la version publiée (au plus toutes les 10 minutes, sauf `force`). */
export async function checkVersion(force = false) {
  if (BUILD === "dev" || useVersion.getState().outdated) return;
  if (!force && Date.now() - last < 10 * 60_000) return;
  last = Date.now();
  try {
    const r = await fetch(`${BASE_PATH}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const v = (await r.json()) as { build?: string };
    if (typeof v.build === "string" && v.build && v.build !== BUILD) useVersion.setState({ outdated: true });
  } catch { /* hors ligne : on réessaiera */ }
}

export function startVersionCheck(): () => void {
  const onShow = () => { if (!document.hidden) void checkVersion(); };
  document.addEventListener("visibilitychange", onShow);
  const id = setInterval(onShow, 15 * 60_000);
  const first = setTimeout(() => void checkVersion(true), 20_000);
  return () => { document.removeEventListener("visibilitychange", onShow); clearInterval(id); clearTimeout(first); };
}
