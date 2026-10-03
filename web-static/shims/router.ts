// Mini-routeur en mémoire pour la version autonome (remplace le routeur de Next.js).
import { useSyncExternalStore } from "react";

const ROUTES = ["/", "/marches", "/portefeuille", "/ville", "/monde", "/actualites", "/relations", "/recherche", "/wiki"];
function fromHash(): string {
  try {
    const h = window.location.hash.replace(/^#/, "");
    const p = h ? `/${h}` : "/";
    return ROUTES.includes(p) ? p : "/";
  } catch { return "/"; }
}
let current = typeof window === "undefined" ? "/" : fromHash();
const listeners = new Set<() => void>();

export function navigate(href: string) {
  current = ROUTES.includes(href) ? href : "/";
  try { history.replaceState(null, "", current === "/" ? "#" : `#${current.slice(1)}`); } catch { /* cadre verrouillé */ }
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}
export function usePath() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current, () => current);
}
