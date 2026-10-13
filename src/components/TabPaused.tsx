"use client";
// Écran « Ouvert dans un autre onglet » : le jeu a été ouvert ailleurs sur cet appareil, cet onglet s'est mis en pause
// (voir lib/tabLock.ts). « Jouer ici » recharge la page : la partie la plus récente est reprise et cet onglet reprend la main.
import { Layers } from "lucide-react";

export default function TabPaused() {
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-6 text-center text-slate-300" role="alert">
      <div className="max-w-[340px]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10 text-white"><Layers size={30} strokeWidth={1.8} /></span>
        <h1 className="mt-5 text-[24px] font-bold text-white">Jeu ouvert ailleurs</h1>
        <p className="mt-2 text-[14px] leading-relaxed">
          Market Empire est ouvert dans un autre onglet ou une autre fenêtre. Pour ne pas mélanger deux parties, celle-ci est en pause.
        </p>
        <button type="button" onClick={() => location.reload()}
          className="mt-6 inline-flex w-full items-center justify-center rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-white">
          Jouer ici
        </button>
      </div>
    </div>
  );
}
