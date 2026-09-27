"use client";
import { Check, FlaskConical, Lock } from "lucide-react";
import { useGame } from "@/store/game";
import { BRANCHES, RESEARCH, RESEARCH_BY_ID } from "@/lib/game/research";
import { Button, PageHeader } from "@/components/ui";
import { compactEur } from "@/lib/format";

export default function ResearchPage() {
  const game = useGame((s) => s.game);
  const research = useGame((s) => s.research);
  const done = new Set(game.research);
  const total = RESEARCH.length, owned = RESEARCH.filter((n) => done.has(n.id)).length;

  return (
    <>
      <PageHeader icon={FlaskConical} title="Recherche" subtitle={`Débloquez des marchés et des informations · ${owned} / ${total} acquises`} />
      <p className="text-[13px] text-muted mb-5 max-w-2xl">
        La recherche ne donne jamais de bonus sur vos gains : elle ouvre de nouveaux marchés et de meilleurs outils d&apos;analyse. À vous d&apos;en tirer parti.
      </p>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
        {BRANCHES.map((branch) => (
          <section key={branch} className="appear">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-3">{branch}</h2>
            <ol className="relative flex flex-col gap-3">
              {RESEARCH.filter((n) => n.branch === branch).map((n, i, arr) => {
                const acquired = done.has(n.id);
                const blocked = !!n.requires && !done.has(n.requires);
                const state = acquired ? "done" : blocked ? "locked" : "open";
                return (
                  <li key={n.id} className="relative">
                    {i < arr.length - 1 && <span aria-hidden className={`absolute left-6 top-full h-3 w-0.5 ${acquired ? "bg-success" : "bg-line"}`} />}
                    <div className={`card p-4 ${state === "done" ? "border-success/40" : state === "open" ? "border-primary/40" : ""} ${state === "locked" ? "opacity-70" : ""}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full grid place-items-center ${state === "done" ? "bg-success text-white" : state === "open" ? "bg-primary-soft text-primary" : "bg-slate-100 text-muted"}`}>
                          {state === "done" ? <Check size={12} strokeWidth={3} /> : state === "locked" ? <Lock size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-[14px] leading-snug">{n.name}</div>
                          <p className="text-[12px] text-muted mt-0.5">{n.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        {state === "done" ? <span className="text-[12px] font-semibold text-success">Acquis</span>
                          : state === "locked" ? <span className="text-[11px] text-muted">Après « {RESEARCH_BY_ID[n.requires!].name} »</span>
                          : <>
                              <span className="font-bold tabular text-[14px]">{compactEur(n.cost)}</span>
                              <Button className="!px-3 !py-1.5" disabled={n.cost > game.cash} onClick={() => research(n.id)}>Rechercher</Button>
                            </>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
