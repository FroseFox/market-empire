"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Network, Search } from "lucide-react";
import { useDerived } from "@/store/game";
import { ASSETS, ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { neighbors, type Neighbor } from "@/lib/market/relations";
import { hasResearch } from "@/lib/game/engine";
import { Card, Delta, PageHeader } from "@/components/ui";
import AddToFolder from "@/components/AddToFolder";

const ROLE_STYLE: Record<Neighbor["role"], { color: string; label: string; angle: [number, number] }> = {
  fournisseur: { color: "#2563EB", label: "Fournisseurs", angle: [150, 210] },
  client: { color: "#10B981", label: "Clients", angle: [-30, 30] },
  concurrent: { color: "#F59E0B", label: "Concurrents", angle: [55, 125] },
  partenaire: { color: "#8B5CF6", label: "Partenaires", angle: [235, 305] },
};
const W = 660, H = 460, CX = W / 2, CY = H / 2;

interface GNode { symbol: string; x: number; y: number; level: 0 | 1 | 2; role?: Neighbor["role"] }
interface GEdge { a: GNode; b: GNode; role: Neighbor["role"] }

function buildGraph(center: string, deep: boolean) {
  const nodes: GNode[] = [{ symbol: center, x: CX, y: CY, level: 0 }];
  const edges: GEdge[] = [];
  const list = neighbors(center);
  const seen = new Set([center]);
  (Object.keys(ROLE_STYLE) as Neighbor["role"][]).forEach((role) => {
    const group = list.filter((n) => n.role === role && !seen.has(n.symbol));
    const [a0, a1] = ROLE_STYLE[role].angle;
    group.forEach((n, i) => {
      seen.add(n.symbol);
      const ang = ((group.length === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (group.length - 1)) * Math.PI) / 180;
      const r = deep && (role === "fournisseur" || role === "client") ? 120 : 165;
      const node: GNode = { symbol: n.symbol, x: CX + Math.cos(ang) * r * 1.3, y: CY + Math.sin(ang) * r, level: 1, role };
      nodes.push(node);
      edges.push({ a: nodes[0], b: node, role });
    });
  });
  if (deep) {
    // Second niveau : fournisseurs des fournisseurs, clients des clients
    for (const n1 of nodes.filter((n) => n.level === 1 && (n.role === "fournisseur" || n.role === "client"))) {
      const next = neighbors(n1.symbol).filter((m) => m.role === n1.role && !seen.has(m.symbol));
      next.forEach((m, i) => {
        seen.add(m.symbol);
        const dir = n1.role === "fournisseur" ? -1 : 1;
        const node: GNode = { symbol: m.symbol, x: n1.x + dir * 125, y: n1.y + (i - (next.length - 1) / 2) * 50, level: 2, role: n1.role };
        nodes.push(node);
        edges.push({ a: n1, b: node, role: n1.role! });
      });
    }
  }
  for (const n of nodes) { n.x = Math.max(60, Math.min(W - 60, n.x)); n.y = Math.max(26, Math.min(H - 26, n.y)); }
  return { nodes, edges, list };
}

export default function RelationsPage() {
  const { game, quotes } = useDerived();
  const [center, setCenter] = useState("NVDA");
  const [query, setQuery] = useState("");
  const deep = hasResearch(game, "supply_chain");
  const { nodes, edges, list } = useMemo(() => buildGraph(center, deep), [center, deep]);
  const asset = ASSET_BY_SYMBOL[center];
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
          <ul className="max-h-[520px] overflow-y-auto py-1">
            {choices.map((a) => (
              <li key={a.symbol}>
                <button onClick={() => setCenter(a.symbol)} className={`w-full text-left px-4 py-2 text-[13px] flex items-center justify-between gap-2 ${a.symbol === center ? "bg-primary-soft text-primary font-semibold" : "hover:bg-slate-50"}`}>
                  <span>{a.name}</span>
                  <span className="text-[11px] text-muted">{neighbors(a.symbol).length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-6">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {(Object.keys(ROLE_STYLE) as Neighbor["role"][]).map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_STYLE[r].color }} />{ROLE_STYLE[r].label}</span>
            ))}
            {!deep && <Link href="/recherche" className="ml-auto text-[12px] text-primary font-medium hover:underline">Voir les chaînes complètes →</Link>}
          </div>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] h-auto" role="img" aria-label={`Relations de ${asset.name}`}>
              {edges.map((e, i) => (
                <line key={i} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={ROLE_STYLE[e.role].color} strokeWidth={e.b.level === 2 ? 1.2 : 2} strokeOpacity={e.b.level === 2 ? 0.45 : 0.7}
                  strokeDasharray={e.role === "concurrent" ? "5 4" : undefined} />
              ))}
              {nodes.map((n) => {
                const q = quotes[n.symbol];
                const w = n.level === 0 ? 132 : n.level === 1 ? 116 : 104, h = n.level === 0 ? 56 : n.level === 1 ? 44 : 40;
                const stroke = n.level === 0 ? "#0F172A" : ROLE_STYLE[n.role!].color;
                return (
                  <g key={n.symbol} transform={`translate(${n.x - w / 2},${n.y - h / 2})`} className="cursor-pointer" onClick={() => setCenter(n.symbol)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") setCenter(n.symbol); }}>
                    <rect width={w} height={h} rx={10} fill={n.level === 0 ? "#0F172A" : "#FFFFFF"} stroke={stroke} strokeWidth={n.level === 0 ? 0 : 1.5} opacity={n.level === 2 ? 0.9 : 1} />
                    <text x={w / 2} y={n.level === 0 ? 23 : 18} textAnchor="middle" fontSize={n.level === 0 ? 15 : 13} fontWeight={700} fill={n.level === 0 ? "#FFFFFF" : "#0F172A"} fontFamily="Montserrat, sans-serif">
                      {ASSET_BY_SYMBOL[n.symbol]?.name ?? n.symbol}
                    </text>
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
          <p className="text-[11px] text-muted mt-2">Cliquez sur une entreprise pour la placer au centre. Variation sur 24 h.</p>
        </Card>

        <Card title={asset.name} className="xl:col-span-3" extra={<AddToFolder symbols={[center]} label="Dossier" />}>
          <div className="flex items-center gap-2 text-[12px] text-muted mb-4">{asset.sector} · {center} {quotes[center] && <Delta value={quotes[center].change} />}</div>
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
                          <button onClick={() => setCenter(n.symbol)} className="text-left w-full rounded-[8px] px-2 py-1.5 hover:bg-slate-50">
                            <span className="block text-[13px] font-medium">{ASSET_BY_SYMBOL[n.symbol]?.name ?? n.symbol}</span>
                            <span className="block text-[11px] text-muted">{n.note}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <AddToFolder symbols={[center, ...new Set(list.map((n) => n.symbol))]} label="Tout ajouter à un dossier" />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
