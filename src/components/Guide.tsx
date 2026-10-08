"use client";
// Tic, le robot-guide : toujours présent, sur toutes les pages.
// - Au début, il fait suivre le guide de démarrage, étape par étape (chaque étape se coche toute seule).
// - Ensuite, il reste là comme conseiller : il indique les gestes les plus utiles du moment
//   (ville et progression uniquement : jamais un conseil d'achat ou de vente).
// Replié, il ne montre que sa tête (une pastille ronde) : il ne cache rien. Le joueur peut aussi le masquer
// complètement ; il se réaffiche depuis le menu (bouton « Afficher Tic »). Son choix est mémorisé sur l'appareil.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, ChevronDown, ChevronRight, EyeOff } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { GUIDE, guideIndex } from "@/lib/game/guide";
import { nextActions } from "@/lib/game/insights";
import Robot from "@/components/Robot";
import { play } from "@/lib/sound";
import { useMedia } from "@/lib/useMedia";

const KEY = "market-empire-tic";
type Mode = "open" | "folded" | "hidden";
const readMode = (): Mode | null => { try { const v = localStorage.getItem(KEY); return v === "open" || v === "folded" || v === "hidden" ? v : null; } catch { return null; } };
// Petit état partagé : le menu peut réafficher Tic quand il est masqué
let mode: Mode | null = typeof window === "undefined" ? null : readMode();
const subs = new Set<() => void>();
function setMode(m: Mode) {
  mode = m;
  try { localStorage.setItem(KEY, m); } catch { /* non mémorisé */ }
  subs.forEach((f) => f());
}
const useMode = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => mode, () => null);

/** Bouton du menu : n'apparaît que si Tic est masqué. */
export function ShowGuide({ dark = false }: { dark?: boolean }) {
  if (useMode() !== "hidden") return null;
  return (
    <button onClick={() => setMode("open")}
      className={`mb-2 flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-[13px] font-medium ${dark ? "text-slate-300 hover:bg-white/5" : "border border-line text-ink hover:bg-slate-50"}`}>
      <Robot size={26} still />Afficher Tic, le guide
    </button>
  );
}

export default function Guide() {
  const { game, city, prices } = useDerived();
  const closeTutorial = useGame((s) => s.closeTutorial);
  const path = usePathname();
  const onCity = path.startsWith("/ville");
  // Replié, ouvert ou masqué : le choix du joueur, mémorisé ; sinon ouvert seulement sur l'accueil pendant le guide
  const stored = useMode();
  const choice = stored === null ? null : stored !== "open";
  // Téléphone : la carte ouverte prend la moitié de l'écran. Elle ne reste donc ouverte que sur la page où le joueur
  // l'a ouverte (elle se replie en changeant de page), et son état n'y est pas mémorisé.
  const phone = useMedia("(max-width: 639px)");
  const [phoneOpen, setPhoneOpen] = useState<boolean | null>(null);
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setPhoneOpen(null); }
  const fold = (v: boolean) => {
    if (phone) { setPhoneOpen(!v); return; }
    setMode(v ? "folded" : "open");
  };

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

  // Sur la page de l'étape en cours, il se replie tout seul : il ne doit jamais cacher le bouton qu'il demande d'utiliser
  const atStep = !!step && (step.href === "/" ? path === "/" : path.startsWith(step.href));
  const folded = phone
    ? (phoneOpen !== null ? !phoneOpen : !(tutorial && path === "/" && !atStep)) // ouverte d'elle-même seulement sur l'accueil, pendant le guide
    : choice ?? !(tutorial && path === "/" && !atStep);
  const worried = !tutorial && todo.some((a) => a.tone === "bad");
  const mood = tutorial ? (stepsDone ? "cheer" : "happy") : worried ? "think" : "happy";
  // Sur la ville : en haut au centre, sous les indicateurs et le bandeau d'aide (les coins sont pris par les panneaux) ; ailleurs : en bas à droite
  const place = onCity ? "left-1/2 top-[184px] -translate-x-1/2" : "bottom-[84px] right-3 lg:bottom-6 lg:right-6";
  const here = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  // Ouvert : un clic à côté ou la touche Échap le replie
  const box = useRef<HTMLElement>(null);
  const foldRef = useRef(fold);
  useEffect(() => { foldRef.current = fold; });
  useEffect(() => {
    if (folded || stored === "hidden") return;
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) foldRef.current(true); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") foldRef.current(true); };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", out); document.removeEventListener("keydown", key); };
  }, [folded, stored]);

  if (stored === "hidden") return null;

  if (folded) {
    const label = step ? `Étape ${index + 1} / ${GUIDE.length} · ${step.title}` : tutorial ? "Guide terminé" : todo[0]?.title ?? "Tout va bien";
    // Juste sa tête : une pastille ronde, avec un point quand quelque chose demande l'attention
    const badge = step ? String(index + 1) : worried ? "!" : todo.length ? String(todo.length) : "";
    return (
      <button onClick={() => fold(false)} aria-label={`Ouvrir Tic, le guide : ${label}`} title={label}
        className={`fixed z-[25] grid h-12 w-12 place-items-center rounded-full border bg-card shadow-lg transition-transform hover:scale-105 ${worried ? "border-red-300" : "border-line"} ${onCity ? "left-3 top-[332px] lg:left-[252px]" : "bottom-[84px] right-3 lg:bottom-6 lg:left-[256px] lg:right-auto"}`}>
        <span className="relative block h-10 w-10 overflow-hidden rounded-full"><span className="absolute left-1/2 top-[5px] -translate-x-1/2 [&>svg]:block"><Robot size={50} mood={mood} still /></span></span>
        {badge && <span className={`absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none text-white ${worried ? "bg-danger" : "bg-primary"}`}>{badge}</span>}
      </button>
    );
  }

  return (
    <section ref={box} aria-label="Tic, le guide" className={`fixed z-[25] w-[min(380px,calc(100vw-24px))] rounded-[16px] border border-line bg-card p-4 shadow-2xl appear ${place}`}>
      <div className="flex items-start gap-3">
        <Robot size={52} mood={mood} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {step ? `Étape ${index + 1} sur ${GUIDE.length}` : tutorial ? "Bravo !" : "Tic, votre guide"}
            </span>
            <button onClick={() => fold(true)} aria-label="Replier Tic" title="Replier (Tic reste disponible)" className="rounded-[6px] p-1 text-muted hover:bg-slate-100"><ChevronDown size={15} /></button>
          </div>
          <h2 className="text-[16px] font-semibold leading-snug">
            {step ? step.title : tutorial ? "Vous connaissez les bases" : todo.length ? "À faire maintenant" : "Tout va bien"}
          </h2>
        </div>
      </div>

      {tutorial ? (
        <>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-700">
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
          {todo.length === 0 ? <p className="mt-3 text-[14px] leading-relaxed text-slate-700">Rien de pressant : votre ville tourne bien. Je vous préviens dès que quelque chose mérite votre attention.</p> : (
            <ol className="mt-3 space-y-1.5">
              {todo.map((a, i) => (
                <li key={a.id}>
                  <Link href={a.href} className={`flex items-start gap-2.5 rounded-[10px] border p-2.5 hover:bg-slate-50 ${a.tone === "bad" ? "border-red-200" : a.tone === "good" ? "border-emerald-200" : "border-line"}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${a.tone === "bad" ? "bg-danger" : a.tone === "good" ? "bg-success" : "bg-primary"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold leading-snug">{a.title}</span><span className="mt-0.5 block text-[13px] leading-snug text-slate-600">{a.text}</span></span>
                    {!here(a.href) && <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted" />}
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-[11px] text-muted">Je ne conseille jamais d&apos;acheter ou de vendre.</p>
        </>
      )}
      <div className="mt-3 flex items-center border-t border-line pt-2.5">
        <button onClick={() => setMode("hidden")} title="Tic disparaît ; il se réaffiche depuis le menu" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink"><EyeOff size={14} />Masquer Tic</button>
        {!tutorial && <Link href="/wiki" className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"><BookOpen size={14} />Wiki</Link>}
      </div>
    </section>
  );
}
