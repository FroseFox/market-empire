"use client";
// Tic, le robot-guide : toujours présent, sur toutes les pages.
// - Au début, il fait suivre le guide de démarrage, étape par étape (chaque étape se coche toute seule).
// - Ensuite, il reste là comme conseiller : il indique les gestes les plus utiles du moment
//   (ville et progression uniquement : jamais un conseil d'achat ou de vente).
// Le joueur peut le replier en pastille ; son choix est mémorisé sur l'appareil. Il ne disparaît jamais.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { GUIDE, guideIndex } from "@/lib/game/guide";
import { nextActions } from "@/lib/game/insights";
import Robot from "@/components/Robot";
import { play } from "@/lib/sound";

const KEY = "market-empire-tic";
const readFold = (): boolean | null => { try { const v = localStorage.getItem(KEY); return v === "folded" ? true : v === "open" ? false : null; } catch { return null; } };

export default function Guide() {
  const { game, city, prices } = useDerived();
  const closeTutorial = useGame((s) => s.closeTutorial);
  const path = usePathname();
  const onCity = path.startsWith("/ville");
  // Replié ou ouvert : le choix du joueur, mémorisé ; sinon ouvert pendant le guide, replié ensuite et sur la ville
  const [choice, setChoice] = useState<boolean | null>(readFold);
  const fold = (v: boolean) => { setChoice(v); try { localStorage.setItem(KEY, v ? "folded" : "open"); } catch { /* non mémorisé */ } };

  const index = guideIndex(game), stepsDone = index < 0;
  const tutorial = !game.tutorialDone;          // le guide de démarrage est en cours (ou vient de se terminer)
  const step = tutorial && !stepsDone ? GUIDE[index] : null;
  const todo = nextActions(game, city, prices);
  // Une étape du guide vient d'être validée : petit son de réussite
  const seen = useRef(index);
  useEffect(() => {
    if (index !== seen.current && tutorial) play(stepsDone ? "rank" : "ok");
    seen.current = index;
  }, [index, stepsDone, tutorial]);

  const folded = choice ?? (onCity || !tutorial);
  const worried = !tutorial && todo.some((a) => a.tone === "bad");
  const mood = tutorial ? (stepsDone ? "cheer" : "happy") : worried ? "think" : "happy";
  // Sur la ville : en haut au centre, sous les indicateurs et le bandeau d'aide (les coins sont pris par les panneaux) ; ailleurs : en bas à droite
  const place = onCity ? "left-1/2 top-[184px] -translate-x-1/2" : "bottom-[84px] right-3 lg:bottom-6 lg:right-6";
  const here = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  if (folded) {
    const label = step ? `Étape ${index + 1} / ${GUIDE.length} · ${step.title}` : tutorial ? "Guide terminé" : todo[0]?.title ?? "Tout va bien";
    return (
      <button onClick={() => fold(false)} aria-label={`Ouvrir Tic, le guide : ${label}`}
        className={`fixed z-30 flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3.5 shadow-lg ${worried ? "border-red-200" : "border-primary/30"} ${place}`}>
        <Robot size={34} mood={mood} />
        <span className="truncate text-[12px] font-semibold">{label}</span>
      </button>
    );
  }

  return (
    <section aria-label="Tic, le guide" className={`fixed z-30 w-[min(360px,calc(100vw-24px))] rounded-[16px] border border-primary/30 bg-card p-4 shadow-2xl appear ${place}`}>
      <div className="flex items-start gap-3">
        <Robot size={52} mood={mood} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {step ? `Étape ${index + 1} sur ${GUIDE.length}` : tutorial ? "Bravo !" : "Tic, votre guide"}
            </span>
            <button onClick={() => fold(true)} aria-label="Replier Tic" title="Replier (Tic reste disponible)" className="rounded-[6px] p-1 text-muted hover:bg-slate-100"><ChevronDown size={15} /></button>
          </div>
          <h2 className="text-[15px] font-semibold leading-tight">
            {step ? step.title : tutorial ? "Vous connaissez les bases" : todo.length ? "À faire maintenant" : "Tout va bien"}
          </h2>
        </div>
      </div>

      {tutorial ? (
        <>
          <p className="mt-2.5 text-[13px] text-muted">
            {step ? step.text : "Bourse, ville, objectifs, recherche : vous avez tout essayé. Je reste là pour vous dire ce qui mérite votre attention."}
          </p>
          <ol className="mt-3 flex gap-1.5" aria-label="Avancement">
            {GUIDE.map((s, i) => <li key={s.id} title={s.title} className={`h-1.5 flex-1 rounded-full ${stepsDone || i < index ? "bg-success" : i === index ? "bg-primary" : "bg-slate-200"}`} />)}
          </ol>
          <div className="mt-3 flex items-center gap-2">
            {!step ? <button onClick={closeTutorial} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700">Continuer</button>
              : here(step.href) ? <span className="text-[12px] font-medium text-success">Vous êtes au bon endroit</span>
              : <Link href={step.href} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700">{step.cta}</Link>}
            {step && <button onClick={closeTutorial} className="text-[12px] font-medium text-muted hover:text-ink">Passer les étapes</button>}
            <Link href="/wiki" className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"><BookOpen size={14} />Wiki</Link>
          </div>
        </>
      ) : (
        <>
          {todo.length === 0 ? <p className="mt-2.5 text-[13px] text-muted">Rien de pressant : votre ville tourne bien. Je vous préviens dès que quelque chose mérite votre attention.</p> : (
            <ol className="mt-3 space-y-1.5">
              {todo.map((a, i) => (
                <li key={a.id}>
                  <Link href={a.href} className={`flex items-start gap-2.5 rounded-[10px] border p-2.5 hover:bg-slate-50 ${a.tone === "bad" ? "border-red-200" : a.tone === "good" ? "border-emerald-200" : "border-line"}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${a.tone === "bad" ? "bg-danger" : a.tone === "good" ? "bg-success" : "bg-primary"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-tight">{a.title}</span><span className="block text-[12px] text-muted">{a.text}</span></span>
                    {!here(a.href) && <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted" />}
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex items-center">
            <span className="text-[11px] text-muted">Je ne conseille jamais d&apos;acheter ou de vendre.</span>
            <Link href="/wiki" className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"><BookOpen size={14} />Wiki</Link>
          </div>
        </>
      )}
    </section>
  );
}
