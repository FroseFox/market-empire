"use client";
// Journal de retour : ce qui s'est passé dans la ville pendant l'absence du joueur (3 jours de ville ou plus).
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useGame } from "@/store/game";
import { CITY_RANKS } from "@/lib/game/config";
import Robot from "@/components/Robot";
import { num, pctPlain, signedEur, tone } from "@/lib/format";

const NOTE = { good: { icon: CircleCheck, cls: "text-success" }, bad: { icon: CircleAlert, cls: "text-danger" }, info: { icon: Info, cls: "text-primary" } } as const;

export default function AbsenceReport() {
  const rep = useGame((s) => s.absence);
  const close = useGame((s) => s.closeAbsence);
  if (!rep) return null;
  const dPop = rep.population.to - rep.population.from;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4 appear" role="dialog" aria-modal="true" aria-label="Pendant votre absence" onClick={close}>
      <div className="w-full max-w-[460px] rounded-[18px] bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <Robot size={52} mood={rep.notes.some((n) => n.tone === "bad") ? "think" : "cheer"} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold leading-tight">Pendant votre absence</h2>
            <p className="text-[13px] text-muted">{num(rep.days)} jours se sont écoulés dans votre ville.</p>
          </div>
          <button onClick={close} aria-label="Fermer" className="rounded-[8px] p-1.5 text-muted hover:bg-slate-100"><X size={17} /></button>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-[10px] bg-slate-50 p-2.5"><dt className="text-muted">Flux de la ville</dt><dd className={`text-[14px] font-bold tabular ${tone(rep.cityFlow)}`}>{signedEur(rep.cityFlow)}</dd></div>
          <div className="rounded-[10px] bg-slate-50 p-2.5"><dt className="text-muted">Habitants</dt><dd className="text-[14px] font-bold tabular">{num(rep.population.to)}</dd><dd className={`tabular ${tone(dPop)}`}>{dPop >= 0 ? "+" : "−"}{num(Math.abs(dPop))}</dd></div>
          <div className="rounded-[10px] bg-slate-50 p-2.5"><dt className="text-muted">Satisfaction</dt><dd className="text-[14px] font-bold tabular">{pctPlain(rep.satisfaction.to)}</dd><dd className="text-muted">avant : {pctPlain(rep.satisfaction.from)}</dd></div>
        </dl>
        <p className="mt-2 text-[12px] text-muted">Rang : <b className="text-ink">{CITY_RANKS[rep.rank.to].name}</b>. La bourse, elle, a suivi les vrais cours : voyez votre Portefeuille.</p>
        {rep.notes.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {rep.notes.map((n) => {
              const N = NOTE[n.tone];
              return <li key={n.text} className="flex items-start gap-2 text-[13px]"><N.icon size={16} className={`mt-0.5 shrink-0 ${N.cls}`} />{n.text}</li>;
            })}
          </ul>
        ) : <p className="mt-3 text-[13px] text-muted">Rien de particulier à signaler : la ville a tourné toute seule.</p>}
        <div className="mt-4 flex gap-2">
          <Link href="/ville" onClick={close} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-blue-700">Voir la ville<ArrowRight size={15} /></Link>
          <button onClick={close} className="rounded-[10px] border border-line px-4 py-2 text-[13px] font-semibold hover:bg-slate-50">Fermer</button>
        </div>
      </div>
    </div>
  );
}
