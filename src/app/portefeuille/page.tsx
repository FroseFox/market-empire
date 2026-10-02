"use client";
import { useState } from "react";
import Link from "next/link";
import { History, Lock, PieChart, TrendingUp, Wallet } from "lucide-react";
import { useDerived } from "@/store/game";
import { hasResearch } from "@/lib/game/engine";
import { ASSET_BY_SYMBOL, KIND_LABEL, familyOf, regionOf } from "@/lib/market/universe";
import { Card, Delta, Empty, PageHeader, Segmented, StatCard } from "@/components/ui";
import CompanyLogo from "@/components/CompanyLogo";
import { Donut } from "@/components/charts";
import { eur, eur2, pctPlain, signedEur, tone, qtyFmt } from "@/lib/format";
import PriceStatus from "@/components/PriceStatus";

const PALETTE = ["#2563EB", "#10B981", "#F59E0B", "#6366F1", "#0EA5E9", "#EC4899", "#64748B"];

type Split = "Lignes" | "Secteurs" | "Régions" | "Types";
/** Groupe d'un actif selon la vue choisie ; hors actions, on garde le type d'actif. */
function groupOf(sym: string, split: Split): string {
  const a = ASSET_BY_SYMBOL[sym];
  if (!a) return "Autres";
  if (split === "Types" || a.kind !== "stock") return KIND_LABEL[a.kind];
  return split === "Secteurs" ? familyOf(a) : regionOf(a);
}

const LockLink = ({ label }: { label: string }) => (
  <Link href="/recherche" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-primary"><Lock size={11} />{label}</Link>
);

export default function PortfolioPage() {
  const { game, quotes, portfolio, portfolioCost } = useDerived();
  const rows = Object.entries(game.holdings).map(([sym, h]) => {
    const price = quotes[sym]?.price ?? h.avgCost;
    const value = h.qty * price;
    return { sym, h, price, value, pnl: value - h.qty * h.avgCost, day: quotes[sym]?.change ?? 0 };
  }).sort((a, b) => b.value - a.value);
  const pnl = portfolio - portfolioCost;
  const [split, setSplit] = useState<Split>("Lignes");
  const canSplit = hasResearch(game, "portfolio_breakdown");
  const showGains = hasResearch(game, "realized_pnl");
  const view: Split = canSplit ? split : "Lignes";
  const groups = new Map<string, number>();
  for (const r of rows) groups.set(groupOf(r.sym, view), (groups.get(groupOf(r.sym, view)) ?? 0) + r.value);
  // Camembert : les 6 plus grosses lignes, le reste regroupé
  const top = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((a, r) => a + r.value, 0);
  const slices = view !== "Lignes" ? [...groups].sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, label: name, value, color: PALETTE[i % PALETTE.length] })) : [
    ...top.map((r, i) => ({ name: r.sym, label: ASSET_BY_SYMBOL[r.sym]?.name ?? r.sym, value: r.value, color: PALETTE[i % PALETTE.length] })),
    ...(rest > 0 ? [{ name: "Autres", label: "Autres", value: rest, color: "#CBD5E1" }] : []),
  ];
  const dayPnl = rows.reduce((a, r) => a + r.value - r.value / (1 + r.day), 0);

  return (
    <>
      <PageHeader icon={Wallet} title="Portefeuille" subtitle="Vos investissements et leur performance" />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-4">
        <StatCard icon={Wallet} tint="bg-primary-soft text-primary" label="Valeur du portefeuille" value={eur(portfolio)}>{rows.length} ligne{rows.length > 1 ? "s" : ""}</StatCard>
        <StatCard icon={TrendingUp} tint="bg-success-soft text-success" label="Performance totale" value={signedEur(pnl)}>
          {portfolioCost > 0 ? <Delta value={pnl / portfolioCost} suffix="depuis l'achat" /> : "—"}
        </StatCard>
        <StatCard icon={TrendingUp} tint="bg-amber-50 text-amber-500" label="Aujourd'hui" value={signedEur(dayPnl)}>
          {portfolio > 0 ? <Delta value={dayPnl / (portfolio - dayPnl || 1)} suffix="sur 24 h" /> : "—"}
        </StatCard>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card title="Positions" icon={Wallet} className="xl:col-span-8 overflow-x-auto">
          {rows.length === 0 ? (
            <Empty>Aucune position pour l&apos;instant. <Link href="/marches" className="text-primary font-medium">Parcourir les marchés →</Link></Empty>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="text-muted text-[12px]"><tr className="border-b border-line">
                <th className="text-left font-medium py-2">Action</th><th className="text-right font-medium">Qté</th>
                <th className="text-right font-medium hidden sm:table-cell">PRU</th><th className="text-right font-medium">Prix</th>
                <th className="text-right font-medium">Valeur</th><th className="text-right font-medium">Plus-value</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sym} className="border-b border-line/70">
                    <td className="py-2.5"><div className="flex items-center gap-2.5"><CompanyLogo symbol={r.sym} size={30} /><div><div className="font-semibold">{ASSET_BY_SYMBOL[r.sym]?.name ?? r.sym}</div><div className="text-[11px] text-muted flex items-center gap-1.5">{r.sym}<PriceStatus symbol={r.sym} /></div></div></div></td>
                    <td className="text-right tabular">{qtyFmt(r.h.qty)}</td>
                    <td className="text-right tabular hidden sm:table-cell">{eur2(r.h.avgCost)}</td>
                    <td className="text-right tabular">{eur2(r.price)}<div><Delta value={r.day} /></div></td>
                    <td className="text-right tabular font-semibold">{eur(r.value)}</td>
                    <td className={`text-right tabular font-semibold ${tone(r.pnl)}`}>{signedEur(r.pnl)}<div className="text-[11px] font-normal">{pctPlain(r.pnl / (r.h.qty * r.h.avgCost))}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Répartition" icon={PieChart} className="xl:col-span-4" extra={!canSplit && <LockLink label="Par secteur, région, type" />}>
          {rows.length === 0 ? <Empty>—</Empty> : (
            <>
              {canSplit && <div className="mb-3"><Segmented options={["Lignes", "Secteurs", "Régions", "Types"] as Split[]} value={split} onChange={setSplit} /></div>}
              <Donut total={eur(portfolio)} data={slices} />
              <ul className="space-y-2 text-[13px] mt-4">
                {slices.map((sl) => (
                  <li key={sl.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: sl.color }} />
                    <span className="flex-1 truncate">{sl.label}</span>
                    <span className={`tabular ${view === "Lignes" && sl.value / portfolio >= 0.3 && rows.length > 1 && sl.name !== "Autres" ? "text-warning font-semibold" : "text-muted"}`}>{pctPlain(sl.value / portfolio)}</span>
                  </li>
                ))}
              </ul>
              {view === "Lignes" && rows.some((r) => r.value / portfolio >= 0.3) && rows.length > 1 && <p className="text-[11px] text-warning mt-2">Une ligne dépasse 30 % : attention à la concentration.</p>}
            </>
          )}
        </Card>

        <Card title="Historique des opérations" icon={History} className="xl:col-span-12"
          extra={showGains
            ? <span className="text-[12px] text-muted">Plus-values réalisées : <b className={`tabular ${tone(game.realized ?? 0)}`}>{signedEur(game.realized ?? 0)}</b></span>
            : <LockLink label="Plus-values réalisées" />}>
          {game.transactions.length === 0 ? <Empty>Aucune opération.</Empty> : (
            <ul className="divide-y divide-line text-[13px]">
              {game.transactions.slice(0, 25).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span>{t.label}{t.price ? <span className="text-muted"> · {eur2(t.price)}</span> : null}
                    {showGains && t.gain !== undefined && <span className={`ml-2 text-[11px] font-medium ${tone(t.gain)}`}>{t.gain >= 0 ? "plus-value" : "moins-value"} {signedEur(t.gain)}</span>}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className={`tabular font-medium ${tone(t.amount)}`}>{signedEur(t.amount)}</span>
                    <span className="text-muted text-[11px] w-28 text-right">{new Date(t.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
