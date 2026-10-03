"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Network, Search } from "lucide-react";
import { useDerived } from "@/store/game";
import { ASSETS, ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { neighbors, type Neighbor } from "@/lib/market/relations";
import { hasResearch } from "@/lib/game/engine";
import { Card, Delta, PageHeader } from "@/components/ui";
import { eur, pctPlain } from "@/lib/format";

const ROLE_STYLE: Record<Neighbor["role"], { color: string; label: string }> = {
  fournisseur: { color: "#2563EB", label: "Fournisseurs" },
  client: { color: "#10B981", label: "Clients" },
  concurrent: { color: "#F59E0B", label: "Concurrents" },
  partenaire: { color: "#8B5CF6", label: "Partenaires" },
};

// Disposition sans chevauchement : fournisseurs en colonne à gauche, clients à droite,
// partenaires en rangée au-dessus, concurrents en rangée en dessous.
const NODE_W = 128, NODE_H = 44, GAP_Y = 56, GAP_X = 142, SIDE = 260, DEEP = 175;

interface GNode { symbol: string; x: number; y: number; level: 0 | 1 | 2; role?: Neighbor["role"] }
interface GEdge { a: GNode; b: GNode; role: Neighbor["role"] }

function column(n: number, cy: number) { return Array.from({ length: n }, (_, i) => cy + (i - (n - 1) / 2) * GAP_Y); }
function rows(n: number) {
  const perRow = 4, out: { dx: number; row: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
    out.push({ dx: ((i % perRow) - (inRow - 1) / 2) * GAP_X, row });
  }
  return out;
}

function buildGraph(center: string, deep: boolean) {
  const c: GNode = { symbol: center, x: 0, y: 0, level: 0 };
  const nodes: GNode[] = [c];
  const edges: GEdge[] = [];
  const list = neighbors(center);
  const seen = new Set([center]);
  const group = (role: Neighbor["role"]) => list.filter((n) => n.role === role && !seen.has(n.symbol) && (seen.add(n.symbol), true));
  const sup = group("fournisseur"), cli = group("client"), par = group("partenaire"), com = group("concurrent");

  const add = (symbol: string, x: number, y: number, level: 1 | 2, role: Neighbor["role"], from: GNode) => {
    const node: GNode = { symbol, x, y, level, role };
    nodes.push(node); edges.push({ a: from, b: node, role }); return node;
  };
  const colHalf = (Math.max(sup.length, cli.length, 1) - 1) / 2 * GAP_Y;
  const supNodes = column(sup.length, 0).map((y, i) => add(sup[i].symbol, -SIDE, y, 1, "fournisseur", c));
  const cliNodes = column(cli.length, 0).map((y, i) => add(cli[i].symbol, SIDE, y, 1, "client", c));
  rows(par.length).forEach((r, i) => add(par[i].symbol, r.dx, -(colHalf + 90 + r.row * GAP_Y), 1, "partenaire", c));
  rows(com.length).forEach((r, i) => add(com[i].symbol, r.dx, colHalf + 90 + r.row * GAP_Y, 1, "concurrent", c));

  if (deep) {
    // Second niveau : fournisseurs des fournisseurs (à gauche), clients des clients (à droite)
    for (const [list1, role, dir] of [[supNodes, "fournisseur", -1], [cliNodes, "client", 1]] as const) {
      let cursorY = -Infinity;
      for (const n1 of list1) {
        const next = neighbors(n1.symbol).filter((m) => m.role === role && !seen.has(m.symbol));
        column(next.length, n1.y).forEach((y, i) => {
          seen.add(next[i].symbol);
          const yy = Math.max(y, cursorY + GAP_Y); cursorY = yy;
          add(next[i].symbol, dir * (SIDE + DEEP), yy, 2, role, n1);
        });
      }
    }
  }
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const pad = 16;
  const box = { x: Math.min(...xs, -SIDE) - NODE_W / 2 - pad, y: Math.min(...ys) - NODE_H / 2 - pad, w: 0, h: 0 };
  box.w = Math.max(...xs, SIDE) + NODE_W / 2 + pad - box.x;
  box.h = Math.max(...ys) + NODE_H / 2 + pad - box.y;
  return { nodes, edges, list, box };
}

export default function RelationsPage() {
  const { game, quotes, portfolio } = useDerived();
  const [center, setCenter] = useState("NVDA");
  const [query, setQuery] = useState("");
  const deep = hasResearch(game, "supply_chain");
  const { nodes, edges, list, box } = useMemo(() => buildGraph(center, deep), [center, deep]);
  const asset = ASSET_BY_SYMBOL[center];
  // Exposition : ce que le joueur détient dans la chaîne affichée (recherche « Exposition aux chaînes »)
  const exposure = hasResearch(game, "chain_exposure");
  const heldValue = (sym: string) => { const h = game.holdings[sym]; return h ? h.qty * (quotes[sym]?.price ?? h.avgCost) : 0; };
  const chainHeld = exposure ? [...new Set(nodes.map((n) => n.symbol))].filter((s) => game.holdings[s]) : [];
  const chainValue = chainHeld.reduce((a, s) => a + heldValue(s), 0);
  // Sur téléphone, le graphe défile à l'horizontale : on le centre sur l'entreprise choisie
  const scroller = useRef<HTMLDivElement>(null);
  const graphCard = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth * -box.x) / box.w - el.clientWidth / 2;
  }, [center, box]);
  const pick = (sym: string) => {
    setCenter(sym);
    if (window.matchMedia("(max-width: 1279px)").matches) graphCard.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const choices = ASSETS.filter((a) => a.kind === "stock" && (a.symbol + a.name).toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <PageHeader icon={Network} title="Relations" subtitle="Qui fournit qui, qui affronte qui : suivez une actualité d'une entreprise à l'autre" />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-3 !p-0 overflow-hidden">
          <div className="p-3 border-b border-line">
            <div className="flex items-center gap-2 rounded-[10px] bg-slate-50 px-3 py-2">
              <Search size={15} className="text-muted" />
              <input id="rel-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher une entreprise" className="bg-transparent outline-none text-[13px] flex-1 min-w-0" />
            </div>
          </div>
          <ul className="max-h-[220px] xl:max-h-[520px] overflow-y-auto py-1">
            {choices.map((a) => (
              <li key={a.symbol}>
                <button onClick={() => pick(a.symbol)} className={`w-full text-left px-4 py-2 text-[13px] flex items-center justify-between gap-2 ${a.symbol === center ? "bg-primary-soft text-primary font-semibold" : "hover:bg-slate-50"}`}>
                  <span>{a.name}</span>
                  <span className="text-[11px] text-muted">{neighbors(a.symbol).length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div ref={graphCard} className="xl:col-span-6 scroll-mt-20">
        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {(Object.keys(ROLE_STYLE) as Neighbor["role"][]).map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_STYLE[r].color }} />{ROLE_STYLE[r].label}</span>
            ))}
            {exposure && <span className="inline-flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2.5 w-2.5 rounded-full bg-ink ring-2 ring-white outline outline-1 outline-slate-300" />Détenu</span>}
            {!deep && <Link href="/recherche" className="ml-auto text-[12px] text-primary font-medium hover:underline">Voir les chaînes complètes →</Link>}
          </div>
          <div ref={scroller} className="overflow-x-auto">
            <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="w-full min-w-[560px] h-auto max-h-[640px]" role="img" aria-label={`Relations de ${asset.name}`}>
              {edges.map((e, i) => (
                <path key={i} d={`M${e.a.x},${e.a.y} C${(e.a.x + e.b.x) / 2},${e.a.y} ${(e.a.x + e.b.x) / 2},${e.b.y} ${e.b.x},${e.b.y}`} fill="none" stroke={ROLE_STYLE[e.role].color} strokeWidth={e.b.level === 2 ? 1.2 : 2} strokeOpacity={e.b.level === 2 ? 0.45 : 0.7}
                  strokeDasharray={e.role === "concurrent" ? "5 4" : undefined} />
              ))}
              {nodes.map((n) => {
                const q = quotes[n.symbol];
                const w = n.level === 0 ? 150 : NODE_W, h = n.level === 0 ? 56 : NODE_H;
                const stroke = n.level === 0 ? "#0F172A" : ROLE_STYLE[n.role!].color;
                return (
                  <g key={n.symbol} transform={`translate(${n.x - w / 2},${n.y - h / 2})`} className="cursor-pointer" onClick={() => setCenter(n.symbol)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") setCenter(n.symbol); }}>
                    <rect width={w} height={h} rx={10} fill={n.level === 0 ? "#0F172A" : "#FFFFFF"} stroke={stroke} strokeWidth={n.level === 0 ? 0 : 1.5} opacity={n.level === 2 ? 0.9 : 1} />
                    <text x={w / 2} y={n.level === 0 ? 23 : 18} textAnchor="middle" fontSize={n.level === 0 ? 15 : 13} fontWeight={700} fill={n.level === 0 ? "#FFFFFF" : "#0F172A"} fontFamily="Montserrat, sans-serif">
                      {shortName(ASSET_BY_SYMBOL[n.symbol]?.name ?? n.symbol, n.level === 0 ? 17 : 15)}
                    </text>
                    {exposure && game.holdings[n.symbol] && <circle cx={w - 9} cy={9} r={4} fill={n.level === 0 ? "#FFFFFF" : "#0F172A"} />}
                    {q && (
                      <text x={w / 2} y={n.level === 0 ? 42 : 34} textAnchor="middle" fontSize={11} fontWeight={600} fontFamily="Montserrat, sans-serif"
                        fill={q.change >= 0 ? (n.level === 0 ? "#6EE7B7" : "#059669") : (n.level === 0 ? "#FCA5A5" : "#DC2626")}>
                        {q.change >= 0 ? "+" : "−"}{Math.abs(q.change * 100).toFixed(1).replace(".", ",")} %
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-[11px] text-muted mt-2">Touchez une entreprise pour la placer au centre. Variation sur 24 h.<span className="sm:hidden"> Faites glisser le schéma sur les côtés.</span></p>
        </Card>
        </div>

        <Card title={asset.name} className="xl:col-span-3">
          <div className="flex items-center gap-2 text-[12px] text-muted mb-4">{asset.sector} · {center} {quotes[center] && <Delta value={quotes[center].change} />}</div>
          {exposure ? (
            <div className="rounded-[12px] bg-slate-50 p-3 mb-4">
              <div className="text-[12px] text-muted">Votre exposition à cette chaîne</div>
              <div className="text-[18px] font-bold tabular">{eur(chainValue)}</div>
              <div className="text-[11px] text-muted">
                {chainHeld.length === 0 ? "Vous ne détenez aucune entreprise affichée ici."
                  : `${chainHeld.length} entreprise${chainHeld.length > 1 ? "s" : ""} détenue${chainHeld.length > 1 ? "s" : ""}${portfolio > 0 ? ` · ${pctPlain(chainValue / portfolio)} du portefeuille` : ""}`}
              </div>
            </div>
          ) : (
            <Link href="/recherche" className="mb-4 flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[12px] font-medium text-amber-900 hover:bg-amber-100"><Lock size={14} strokeWidth={2.2} className="shrink-0" />Exposition à cette chaîne : à débloquer dans Recherche</Link>
          )}
          {list.length === 0 ? <p className="text-[13px] text-muted">Aucune relation saisie pour cette entreprise pour l&apos;instant.</p> : (
            <div className="space-y-4">
              {(Object.keys(ROLE_STYLE) as Neighbor["role"][]).map((role) => {
                const items = list.filter((n) => n.role === role);
                if (!items.length) return null;
                return (
                  <div key={role}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: ROLE_STYLE[role].color }}>{ROLE_STYLE[role].label}</div>
                    <ul className="space-y-1.5">
                      {items.map((n) => (
                        <li key={role + n.symbol}>
                          <button onClick={() => pick(n.symbol)} className="text-left w-full rounded-[8px] px-2 py-1.5 hover:bg-slate-50">
                            <span className="flex items-baseline justify-between gap-2 text-[13px] font-medium">
                              <span>{ASSET_BY_SYMBOL[n.symbol]?.name ?? n.symbol}</span>
                              {exposure && game.holdings[n.symbol] && <span className="text-[11px] text-primary tabular shrink-0">Détenu · {eur(heldValue(n.symbol))}</span>}
                            </span>
                            <span className="block text-[11px] text-muted">{n.note}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function shortName(name: string, max: number) { return name.length > max ? `${name.slice(0, max - 1)}…` : name; }
