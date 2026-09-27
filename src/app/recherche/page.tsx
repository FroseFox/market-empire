"use client";
import { useEffect, useRef, useState } from "react";
import {
  Check, DollarSign, Euro, FlaskConical, Folder, FolderPlus, Filter, History, Landmark, LayoutGrid, Lock, Network, Newspaper, PieChart, Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useGame } from "@/store/game";
import { BRANCH_COLOR, RESEARCH, RESEARCH_BY_ID, type ResearchNode } from "@/lib/game/research";
import { Button, Card, PageHeader } from "@/components/ui";
import { compactEur, eur } from "@/lib/format";

const ICONS: Record<string, LucideIcon> = {
  hq: Landmark, us_stocks: DollarSign, eu_stocks: Euro, etf: PieChart, history_1y: History, sector_view: LayoutGrid,
  relations_1: Network, supply_chain: Workflow, news_1: Newspaper, news_filters: Filter, folders_1: Folder, folders_plus: FolderPlus,
};

// Géométrie de l'arbre (en px, dans un cadre qui défile à l'horizontale sur mobile)
const COL_W = 185, ROW_H = 150, PAD_X = 90, PAD_Y = 56, NODE = 60, LABEL_H = 50;
const WIDTH = PAD_X * 2 + COL_W * 4;
const HEIGHT = PAD_Y + ROW_H * 3 + 110;
const pos = (n: ResearchNode) => ({ x: PAD_X + n.col * COL_W, y: PAD_Y + n.row * ROW_H });

type Status = "done" | "open" | "locked";

export default function ResearchPage() {
  const game = useGame((s) => s.game);
  const research = useGame((s) => s.research);
  const done = new Set(game.research);
  const status = (n: ResearchNode): Status => done.has(n.id) ? "done" : n.requires.every((r) => done.has(r)) ? "open" : "locked";
  const firstOpen = RESEARCH.find((n) => status(n) === "open")?.id ?? "hq";
  const [selected, setSelected] = useState(firstOpen);
  const sel = RESEARCH_BY_ID[selected] ?? RESEARCH[0];
  const selStatus = status(sel);
  const owned = RESEARCH.filter((n) => done.has(n.id)).length;

  // L'arbre se réduit pour tenir dans le cadre (jusqu'à 70 %, puis défile)
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.max(0.7, Math.min(1, (el.clientWidth - 16) / WIDTH))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <PageHeader icon={FlaskConical} title="Recherche" subtitle={`Arbre de compétences · ${owned} / ${RESEARCH.length} débloquées`} />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-9 !p-0 overflow-hidden">
          <div ref={frame} className="overflow-x-auto">
            <div className="mx-auto" style={{ width: WIDTH * scale, height: HEIGHT * scale }}>
            <div className="relative origin-top-left" style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})` }}>
              {/* Liens entre compétences */}
              <svg width={WIDTH} height={HEIGHT} className="absolute inset-0" aria-hidden>
                <defs>
                  <pattern id="tree-dots" width="22" height="22" patternUnits="userSpaceOnUse">
                    <circle cx="1.5" cy="1.5" r="1.1" fill="#E2E8F0" />
                  </pattern>
                </defs>
                <rect width={WIDTH} height={HEIGHT} fill="url(#tree-dots)" />
                {RESEARCH.flatMap((n) => n.requires.map((r) => {
                  const a = pos(RESEARCH_BY_ID[r]), b = pos(n);
                  const from = { x: a.x, y: a.y + NODE / 2 + LABEL_H }, to = { x: b.x, y: b.y - NODE / 2 - 4 };
                  const my = (from.y + to.y) / 2;
                  const lit = done.has(n.id);
                  const ready = !lit && done.has(r);
                  return (
                    <path key={`${r}-${n.id}`} d={`M${from.x},${from.y} C${from.x},${my} ${to.x},${my} ${to.x},${to.y}`}
                      fill="none" strokeLinecap="round"
                      stroke={lit ? BRANCH_COLOR[n.branch] : ready ? "#93C5FD" : "#CBD5E1"}
                      strokeWidth={lit ? 4 : 2.5} strokeDasharray={lit || ready ? undefined : "6 6"} />
                  );
                }))}
              </svg>

              {/* Compétences */}
              {RESEARCH.map((n) => {
                const { x, y } = pos(n);
                const st = status(n);
                const Icon = ICONS[n.id] ?? FlaskConical;
                const color = BRANCH_COLOR[n.branch];
                const isSel = n.id === sel.id;
                return (
                  <button key={n.id} onClick={() => setSelected(n.id)}
                    className="absolute flex flex-col items-center gap-1.5 group focus:outline-none"
                    style={{ left: x - 80, top: y - NODE / 2, width: 160 }}
                    aria-label={`${n.name} : ${st === "done" ? "débloquée" : st === "open" ? `disponible, ${eur(n.cost)}` : "verrouillée"}`}>
                    <span className="relative grid place-items-center rounded-full transition-transform group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-primary/30"
                      style={{
                        width: NODE, height: NODE,
                        background: st === "done" ? color : st === "open" ? "#FFFFFF" : "#F1F5F9",
                        border: `3px solid ${st === "locked" ? "#CBD5E1" : color}`,
                        boxShadow: isSel ? `0 0 0 5px ${color}33` : st === "done" ? `0 6px 16px ${color}40` : "0 1px 2px rgba(15,23,42,.06)",
                      }}>
                      {st === "open" && <span className="absolute inset-[-7px] rounded-full border-2 animate-ping motion-reduce:hidden" style={{ borderColor: `${color}55`, animationDuration: "2.4s" }} />}
                      <Icon size={24} strokeWidth={2} color={st === "done" ? "#FFFFFF" : st === "open" ? color : "#94A3B8"} />
                      {st === "done" && n.id !== "hq" && (
                        <span className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-white grid place-items-center" style={{ border: `2px solid ${color}` }}>
                          <Check size={11} strokeWidth={3.5} color={color} />
                        </span>
                      )}
                      {st === "locked" && (
                        <span className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-white border-2 border-slate-300 grid place-items-center"><Lock size={10} className="text-slate-400" /></span>
                      )}
                    </span>
                    <span className={`text-[12px] font-semibold leading-tight text-center ${st === "locked" ? "text-muted" : "text-ink"} ${isSel ? "underline decoration-2 underline-offset-4" : ""}`}
                      style={isSel ? { textDecorationColor: color } : undefined}>{n.name}</span>
                    <span className={`text-[11px] tabular font-semibold ${st === "done" ? "text-success" : st === "open" ? "text-primary" : "text-muted"}`}>
                      {st === "done" ? "Débloquée" : n.cost === 0 ? "Gratuite" : compactEur(n.cost)}
                    </span>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 py-3 border-t border-line text-[12px] text-muted">
            {(Object.keys(BRANCH_COLOR) as (keyof typeof BRANCH_COLOR)[]).filter((b) => b !== "Racine").map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BRANCH_COLOR[b] }} />{b}</span>
            ))}
            <span className="ml-auto">Pointillés : prérequis manquants</span>
          </div>
        </Card>

        {/* Détail de la compétence choisie */}
        <div className="xl:col-span-3">
          <Card className="xl:sticky xl:top-20">
            <div className="flex items-center gap-3 mb-3">
              {(() => { const Icon = ICONS[sel.id] ?? FlaskConical; return (
                <span className="h-11 w-11 rounded-full grid place-items-center shrink-0" style={{ background: `${BRANCH_COLOR[sel.branch]}1A`, color: BRANCH_COLOR[sel.branch] }}><Icon size={20} /></span>
              ); })()}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: BRANCH_COLOR[sel.branch] }}>{sel.branch}</div>
                <div className="text-[17px] font-semibold leading-tight">{sel.name}</div>
              </div>
            </div>
            <p className="text-[13px] text-muted mb-4">{sel.description}</p>

            {sel.requires.length > 0 && (
              <div className="mb-4">
                <div className="text-[12px] font-medium mb-1.5">Prérequis</div>
                <ul className="space-y-1">
                  {sel.requires.map((r) => (
                    <li key={r}>
                      <button onClick={() => setSelected(r)} className="flex items-center gap-2 text-[13px] hover:text-primary">
                        {done.has(r) ? <Check size={14} className="text-success" /> : <Lock size={13} className="text-muted" />}
                        {RESEARCH_BY_ID[r].name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selStatus === "done" ? (
              <div className="rounded-[10px] bg-success-soft text-emerald-700 text-[13px] font-semibold px-3 py-2.5 flex items-center gap-2"><Check size={16} />Compétence débloquée</div>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[12px] text-muted">Coût</span>
                  <span className="text-[22px] font-bold tabular">{eur(sel.cost)}</span>
                </div>
                <Button className="w-full" disabled={selStatus === "locked" || sel.cost > game.cash} onClick={() => research(sel.id)}>
                  {selStatus === "locked" ? "Prérequis manquants" : sel.cost > game.cash ? "Liquidités insuffisantes" : "Rechercher"}
                </Button>
                <p className="text-[11px] text-muted mt-2">Liquidités : {eur(game.cash)}</p>
              </>
            )}
            <p className="text-[11px] text-muted mt-4 pt-3 border-t border-line">La recherche ne donne jamais de bonus sur vos gains : elle ouvre des marchés et de meilleurs outils d&apos;analyse.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
