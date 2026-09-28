"use client";
import { useSyncExternalStore } from "react";

/** Vrai quand la requête média correspond (ex. « (max-width: 1279px) »). Faux au premier rendu serveur. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Écran de téléphone ou de petite tablette (pas de barre latérale). */
export const useIsMobile = () => useMedia("(max-width: 1023px)");
