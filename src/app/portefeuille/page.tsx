"use client";
import { useState } from "react";
import Link from "next/link";
import { History, Landmark, Lock, PieChart, TrendingUp, Wallet } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { bankLevel, capitalPerDay, cityLeverage, dailyInterest, hasResearch, holdingStake, holdingValue, investCap, liquidationPrice, nextBank } from "@/lib/game/engine";
import { BANK, CAPITAL, CITY_RANKS } from "@/lib/game/config";
import { ASSET_BY_SYMBOL, KIND_LABEL, familyOf, regionOf } from "@/lib/market/universe";
import { Button, Card, Delta, Empty, PageHeader, Progress, Segmented, StatCard, LockTag } from "@/components/ui";
import CompanyLogo from "@/components/CompanyLogo";
import { Donut } from "@/components/charts";
import { capitalFmt, compactEur, eur, eur2, pctPlain, signedEur, tone, qtyFmt } from "@/lib/format";
import PriceStatus from "@/components/PriceStatus";
import { focusAsset } from "@/lib/market/focus";

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
  <Link href="/recherche" title="À débloquer dans Recherche"><LockTag>{label}</LockTag></Link>
);

/** Banque de la ville : c'est elle qui relie la ville et la bourse. Son niveau fixe le levier de tous les achats
 *  et le plafond de mise ; en retour, les placements produisent le capital que les gros bâtiments demandent. */
function BankCard({ staked, perDay }: { staked: number; perDay: number }) {
  const game = useGame((s) => s.game);
  const upgradeBank = useGame((s) => s.upgradeBank);
  const level = bankLevel(game), cap = investCap(game), next = nextBank(game);
  const rank = CITY_RANKS.findLastIndex((r) => game.population >= r.pop);
  const locked = !!next && rank < next.minRank;
  const interest = dailyInterest(game.holdings, game);
  const cell = "rounded-[10px] bg-slate-50 p-2.5";
  return (
    <Card title="Banque de la ville" icon={Landmark} className="mb-4"
      extra={<span className="text-[12px] text-muted">Niveau <b className="tabular text-ink">{level + 1}</b> sur {BANK.length}</span>}>
      <div className="grid grid-cols-2 gap-2 text-[12px] lg:grid-cols-4">
        <div className={cell}>
          <div className="text-muted">Levier de vos achats</div>
          <div className="text-[18px] font-bold tabular text-primary">×{cityLeverage(game).toLocaleString("fr-FR")}</div>
          <div className="text-[11px] text-muted">Gains et pertes multipliés</div>
        </div>
        <div className={cell}>
          <div className="text-muted">Mise en bourse</div>
          <div className="text-[18px] font-bold tabular">{compactEur(staked)}</div>
          {Number.isFinite(cap)
            ? <><Progress value={staked / cap} tone={staked >= cap * 0.98 ? "bg-warning" : "bg-primary"} /><div className="mt-1 text-[11px] text-muted">Plafond : {compactEur(cap)}</div></>
            : <div className="text-[11px] text-muted">Sans plafond</div>}
        </div>
        <div className={cell}>
          <div className="text-muted">Capital</div>
          <div className="text-[18px] font-bold tabular text-violet-700">{capitalFmt(game.capital ?? 0)}</div>
          <div className="text-[11px] text-muted">+{capitalFmt(perDay)} par jour de ville</div>
        </div>
        <div className={cell}>
          <div className="text-muted">Intérêts</div>
          <div className="text-[18px] font-bold tabular">{eur(interest)}</div>
          <div className="text-[11px] text-muted">par jour de ville, sur ce que la Banque prête</div>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-muted">
        Vos placements produisent du <b className="font-semibold text-violet-700">capital ◆</b> : {pctPlain(CAPITAL.dayRate)} de leur valeur par jour de ville.
        Les bâtiments à partir de {compactEur(CAPITAL.fromCost)} en demandent {pctPlain(CAPITAL.share)} de leur prix, en plus des liquidités : sans bourse, la ville ne grandit plus.
      </p>
      {next && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-line p-3">
          <div className="min-w-[180px] flex-1 text-[12px]">
            <div className="text-[13px] font-semibold">Niveau {level + 2} : levier ×{next.lev.toLocaleString("fr-FR")}, plafond {Number.isFinite(next.cap) ? compactEur(next.cap) : "illimité"}</div>
            <div className="text-muted">{locked ? `À partir du rang « ${CITY_RANKS[next.minRank].name} » (${CITY_RANKS[next.minRank].pop.toLocaleString("fr-FR")} habitants)` : "Payé avec les liquidités de la ville."}</div>
          </div>
          {locked ? <LockTag className="shrink-0 tabular">{compactEur(next.cost)}</LockTag>
            : <Button onClick={upgradeBank} disabled={next.cost > game.cash} title={next.cost > game.cash ? "Liquidités insuffisantes" : undefined} className="shrink-0 !px-3">
                {next.cost > game.cash && <Lock size={13} className="mr-1 inline" />}Agrandir · {compactEur(next.cost)}
              </Button>}
        </div>
      )}
    </Card>
  );
}

export default function PortfolioPage() {
  const { game, quotes, prices, city, portfolio, portfolioCost } = useDerived();
  const rows = Object.entries(game.holdings).map(([sym, h]) => {
    const price = quotes[sym]?.price ?? h.avgCost;
    // Valeur pour le joueur : ses titres moins ce que la Banque a prêté. `exposure` = ce qui bouge avec le cours.
    const value = holdingValue(h, price), stake = holdingStake(h);
    return { sym, h, price, value, stake, exposure: h.qty * price, liq: liquidationPrice(h), pnl: value - stake, day: quotes[sym]?.change ?? 0 };
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
  const dayPnl = rows.reduce((a, r) => a + r.exposure - r.exposure / (1 + r.day), 0);

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

      <BankCard staked={portfolioCost} perDay={capitalPerDay(game.holdings, prices) * (1 + city.effects.capitalBoost)} />

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
                <th className="text-right font-medium pl-3 hidden sm:table-cell"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sym} className="border-b border-line/70">
                    <td className="py-2.5">
                      <Link href="/marches" onClick={() => focusAsset(r.sym)} title="Ouvrir la fiche : cours, achat et vente" className="group flex items-center gap-2.5">
                        <CompanyLogo symbol={r.sym} size={30} />
                        <div><div className="font-semibold group-hover:text-primary group-hover:underline">{ASSET_BY_SYMBOL[r.sym]?.name ?? r.sym}</div><div className="text-[11px] text-muted flex items-center gap-1.5">{r.sym}<PriceStatus symbol={r.sym} /></div></div>
                      </Link>
                    </td>
                    <td className="text-right tabular">{qtyFmt(r.h.qty)}</td>
                    <td className="text-right tabular hidden sm:table-cell">{eur2(r.h.avgCost)}</td>
                    <td className="text-right tabular">{eur2(r.price)}<div><Delta value={r.day} /></div></td>
                    <td className="text-right tabular font-semibold"><span className="whitespace-nowrap">{eur(r.value)}</span>
                      {r.liq > 0 && <div className={`hidden whitespace-nowrap text-[11px] font-normal sm:block ${(r.price - r.liq) / r.price < 0.03 ? "font-semibold text-danger" : "text-muted"}`} title="Cours sous lequel la ligne est vendue d'office">vente d&apos;office &lt; {eur2(r.liq)}</div>}
                    </td>
                    <td className={`text-right tabular font-semibold ${tone(r.pnl)}`}>{signedEur(r.pnl)}<div className="text-[11px] font-normal">{r.stake > 0 ? pctPlain(r.pnl / r.stake) : "—"}</div></td>
                    <td className="text-right pl-3 hidden sm:table-cell">
                      <Link href="/marches" onClick={() => focusAsset(r.sym)} className="inline-flex items-center whitespace-nowrap rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary-soft">Acheter / Vendre</Link>
                    </td>
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
