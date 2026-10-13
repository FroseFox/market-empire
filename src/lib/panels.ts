"use client";
// Un seul panneau ouvert à la fois (chat, notifications, compte, son, menu « Plus ») : en ouvrir un ferme les autres.
// Avant, chacun gardait son propre état : ouvrir les notifications laissait le chat ouvert par-dessus.
import { useCallback } from "react";
import { create } from "zustand";

export const usePanel = create<{ id: string | null }>(() => ({ id: null }));

/** Comme `useState(false)`, mais partagé : ouvrir ce panneau ferme celui qui était ouvert. */
export function usePopover(id: string) {
  const open = usePanel((s) => s.id === id);
  const setOpen = useCallback((v: boolean | ((open: boolean) => boolean)) => {
    const cur = usePanel.getState().id === id;
    const next = typeof v === "function" ? v(cur) : v;
    if (next) usePanel.setState({ id });
    else if (cur) usePanel.setState({ id: null });
  }, [id]);
  return [open, setOpen] as const;
}
