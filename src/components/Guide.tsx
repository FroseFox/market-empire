"use client";
// Guide de démarrage : le robot accompagne le joueur étape par étape, sur toutes les pages.
// Chaque étape se coche toute seule quand elle est faite ; le joueur peut replier ou quitter le guide.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, X } from "lucide-react";
import { useGame } from "@/store/game";
import { GUIDE, guideIndex } from "@/lib/game/guide";
import Robot from "@/components/Robot";
import { play } from "@/lib/sound";

export default function Guide() {
  const game = useGame((s) => s.game);
  const close = useGame((s) => s.closeTutorial);
  const path = usePathname();
  const onCity = path.startsWith("/ville");
  // Sur la ville (plein écran), le guide démarre replié pour laisser voir la carte
  const [folded, setFolded] = useState<boolean | null>(null);
  const index = guideIndex(game), finished = index < 0;
  // Une étape vient d'être validée : petit son de réussite
  const seen = useRef(index);
  useEffect(() => {
    if (index !== seen.current && !game.tutorialDone) play(finished ? "rank" : "ok");
    seen.current = index;
  }, [index, finished, game.tutorialDone]);
  if (game.tutorialDone) return null;

  const step = finished ? null : GUIDE[index];
  const isFolded = folded ?? onCity;
  const here = step && (step.href === "/" ? path === "/" : path.startsWith(step.href));
  // Sur la ville : en haut au centre, sous les indicateurs et le bandeau d'aide (les coins sont pris par les panneaux) ; ailleurs : en bas à droite
  const place = onCity ? "left-1/2 top-[184px] -translate-x-1/2" : "bottom-[84px] right-3 lg:bottom-6 lg:right-6";

  if (isFolded) {
    return (
      <button onClick={() => setFolded(false)} aria-label="Ouvrir le guide"
        className={`fixed z-30 flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border border-primary/30 bg-card py-1 pl-1 pr-3.5 shadow-lg ${place}`}>
        <Robot size={34} mood={finished ? "cheer" : "happy"} />
        <span className="truncate text-[12px] font-semibold">{finished ? "Guide terminé" : `Étape ${index + 1} / ${GUIDE.length} · ${step!.title}`}</span>
      </button>
    );
  }
  return (
    <section aria-label="Guide de démarrage" className={`fixed z-30 w-[min(360px,calc(100vw-24px))] rounded-[16px] border border-primary/30 bg-card p-4 shadow-2xl appear ${place}`}>
      <div className="flex items-start gap-3">
        <Robot size={52} mood={finished ? "cheer" : "happy"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{finished ? "Bravo !" : `Étape ${index + 1} sur ${GUIDE.length}`}</span>
            <span className="flex gap-1">
              <button onClick={() => setFolded(true)} aria-label="Replier le guide" className="rounded-[6px] p-1 text-muted hover:bg-slate-100"><ChevronDown size={15} /></button>
              <button onClick={close} aria-label="Quitter le guide" title="Quitter le guide (il se relance depuis le Wiki)" className="rounded-[6px] p-1 text-muted hover:bg-slate-100"><X size={15} /></button>
            </span>
          </div>
          <h2 className="text-[15px] font-semibold leading-tight">{finished ? "Vous connaissez les bases" : step!.title}</h2>
        </div>
      </div>
      <p className="mt-2.5 text-[13px] text-muted">
        {finished ? "Bourse, ville, objectifs, recherche : vous avez tout essayé. La suite se joue sur la durée : entreprises implantées, pays, commerce, grands projets. Tout est expliqué dans le Wiki."
          : step!.text}
      </p>
      <ol className="mt-3 flex gap-1.5" aria-label="Avancement">
        {GUIDE.map((s, i) => <li key={s.id} title={s.title} className={`h-1.5 flex-1 rounded-full ${finished || i < index ? "bg-success" : i === index ? "bg-primary" : "bg-slate-200"}`} />)}
      </ol>
      <div className="mt-3 flex items-center gap-2">
        {finished ? <button onClick={close} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700">Terminer le guide</button>
          : here ? <span className="text-[12px] font-medium text-success">Vous êtes au bon endroit</span>
          : <Link href={step!.href} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700">{step!.cta}</Link>}
        <Link href="/wiki" className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"><BookOpen size={14} />Wiki</Link>
      </div>
    </section>
  );
}
