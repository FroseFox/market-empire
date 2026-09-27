"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LineChart, Lock, Search } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { ASSETS, ASSET_BY_SYMBOL, KIND_LABEL, flag, fractional, regionOf, type AssetKind, type Region } from "@/lib/market/universe";
import { simulatedHistory, type Range } from "@/lib/market/simulate";
import { hasResearch, tradeFee } from "@/lib/game/engine";
import { RESEARCH_BY_ID } from "@/lib/game/research";
import { neighbors } from "@/lib/market/relations";
import { useNews } from "@/lib/news";
import AddToFolder from "@/components/AddToFolder";
import CompanyLogo from "@/components/CompanyLogo";
import NewsList from "@/components/NewsList";
import { fetchHistory } from "@/lib/market/client";
import { Button, Card, Delta, PageHeader, Segmented } from "@/components/ui";
import { Sparkline, WealthChart } from "@/components/charts";
import { eur, eur2, pctPlain, qtyFmt, signedEur } from "@/lib/format";

const KINDS: AssetKind[] = ["stock", "etf", "commodity", "crypto"];
const REGIONS: ("Toutes" | Region)[] = ["Toutes", "États-Unis", "Europe", "Asie", "Autres"];
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function fmtTime(range: Range) {
  return (v: number | string) => {
    const d = new Date(Number(v));
    if (range === "1J") return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (range === "1A") return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  };
}

export default function MarketsPage() {
  const { game, quotes } = useDerived();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("NVDA");
  const [kind, setKind] = useState<AssetKind>("stock");
  const [region, setRegion] = useState<"Toutes" | Region>("Toutes");

  // Mini-courbes 1J (même moteur que le serveur, recalées sur le dernier prix)
  const lastQuoteAt = useGame((s) => s.lastQuoteAt);
  const dataMode = useGame((s) => s.dataMode);
  const showSparks = dataMode === "simulé"; // en mode réel, pas de fausse mini-courbe
  const sparks = useMemo(() => {
    if (!lastQuoteAt || !showSparks) return {} as Record<string, number[]>;
    return Object.fromEntries(ASSETS.map((a) => {
      const pts = simulatedHistory(a.symbol, "1J", lastQuoteAt).filter((_, i) => i % 3 === 0).map((p) => p.p);
      const k = quotes[a.symbol] ? quotes[a.symbol].price / pts[pts.length - 1] : 1;
      return [a.symbol, pts.map((p) => p * k)];
    }));
  }, [lastQuoteAt, quotes, showSparks]);

  // Recherche dans tout l'univers ; sans recherche, filtre par catégorie et par région
  const n = norm(query.trim());
  const list = ASSETS.filter((a) => n
    ? norm(`${a.symbol} ${a.name} ${a.sector} ${regionOf(a)}`).includes(n)
    : a.kind === kind && (kind !== "stock" || region === "Toutes" || regionOf(a) === region));
  const count = (k: AssetKind) => ASSETS.filter((a) => a.kind === k).length;

  // Analyse sectorielle (recherche) : variation moyenne sur 24 h par secteur
  const sectors = hasResearch(game, "sector_view")
    ? [...new Set(ASSETS.filter((a) => a.kind === "stock").map((a) => a.sector))].map((sec) => {
        const vals = ASSETS.filter((a) => a.sector === sec).map((a) => quotes[a.symbol]?.change).filter((v): v is number => typeof v === "number");
        return { sec, avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0, n: vals.length };
      }).sort((a, b) => b.avg - a.avg)
    : null;

  return (
    <>
      <PageHeader icon={LineChart} title="Marchés" subtitle={`${ASSETS.length} actifs : actions, ETF, matières premières et cryptos · cours en euros`} />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-7 !p-0 overflow-hidden">
          <div className="p-4 border-b border-line flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 rounded-[10px] bg-slate-50 px-3 py-2">
              <Search size={16} className="text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : entreprise, secteur, pays, crypto…"
                className="bg-transparent outline-none text-[13px] flex-1" />
            </div>
          </div>
          {!n && (
            <div className="px-4 pt-3 pb-2 border-b border-line space-y-2">
              <div role="tablist" aria-label="Catégorie" className="flex gap-1.5 overflow-x-auto">
                {KINDS.map((k) => (
                  <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
                    className={`shrink-0 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${kind === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {KIND_LABEL[k]} <span className={kind === k ? "text-white/70" : "text-muted"}>{count(k)}</span>
                  </button>
                ))}
              </div>
              {kind === "stock" && (
                <div className="flex gap-1 overflow-x-auto">
                  {REGIONS.map((r) => (
                    <button key={r} onClick={() => setRegion(r)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${region === r ? "bg-primary-soft text-primary" : "text-muted hover:bg-slate-100"}`}>{r}</button>
                  ))}
                </div>
              )}
              {kind !== "stock" && <UnlockHint kind={kind} />}
            </div>
          )}
          {n && <div className="px-4 py-2 border-b border-line text-[12px] text-muted">{list.length} résultat{list.length > 1 ? "s" : ""} dans tous les marchés</div>}
          {sectors && kind === "stock" && !n && (
            <div className="px-4 py-3 border-b border-line flex gap-2 overflow-x-auto">
              {sectors.map((x) => (
                <button key={x.sec} onClick={() => setQuery(x.sec)} className="shrink-0 rounded-[10px] bg-slate-50 px-3 py-1.5 text-left hover:bg-slate-100">
                  <div className="text-[11px] text-muted whitespace-nowrap">{x.sec}</div>
                  <Delta value={x.avg} />
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-muted text-[12px]">
                <tr className="border-b border-line">
                  <th className="text-left font-medium px-4 py-2.5">Nom</th>
                  <th className="text-left font-medium px-2 hidden md:table-cell">Secteur</th>
                  {showSparks && <th className="px-2 hidden sm:table-cell" />}
                  <th className="text-right font-medium px-2">Prix</th>
                  <th className="text-right font-medium px-4 whitespace-nowrap">Var. 1J</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const q = quotes[a.symbol];
                  const held = game.holdings[a.symbol];
                  const sp = sparks[a.symbol] ?? [];
                  return (
                    <tr key={a.symbol} onClick={() => setSelected(a.symbol)}
                      className={`border-b border-line/70 cursor-pointer transition-colors ${selected === a.symbol ? "bg-primary-soft/60" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <CompanyLogo symbol={a.symbol} size={32} />
                          <div>
                            <div className="font-semibold flex items-center gap-1.5">{a.name}
                              {held && <span className="text-[10px] rounded bg-primary-soft text-primary px-1.5 py-0.5 font-semibold">Détenu</span>}
                              {!hasResearch(game, a.research) && <span className="inline-flex items-center gap-0.5 text-[10px] rounded bg-slate-100 text-muted px-1.5 py-0.5 font-semibold"><Lock size={9} />Recherche</span>}
                            </div>
                            <div className="text-[11px] text-muted">{a.symbol} · {flag(a.country)}{a.kind === "crypto" ? " · 24 h/24" : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 text-muted hidden md:table-cell">{a.sector}</td>
                      {showSparks && <td className="px-2 hidden sm:table-cell"><Sparkline points={sp} up={(q?.change ?? 0) >= 0} /></td>}
                      <td className="px-2 text-right font-semibold tabular whitespace-nowrap">{q ? eur2(q.price) : "—"}</td>
                      <td className="px-4 text-right">{q ? <Delta value={q.change} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="xl:col-span-5"><div className="xl:sticky xl:top-20"><AssetPanel symbol={selected} onSelect={setSelected} /></div></div>
      </div>
    </>
  );
}

function AssetPanel({ symbol, onSelect }: { symbol: string; onSelect: (s: string) => void }) {
  const { game, quotes, portfolio } = useDerived();
  const dataMode = useGame((s) => s.dataMode);
  const buy = useGame((s) => s.buy);
  const sell = useGame((s) => s.sell);
  const asset = ASSET_BY_SYMBOL[symbol];
  const q = quotes[symbol];
  const [range, setRange] = useState<Range>("1M");
  const [hist, setHist] = useState<{ points: { t: number; p: number }[]; source: "réel" | "simulé" } | null>(null);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHistory(symbol, range).then((j) => { if (alive) setHist(j); }).catch(() => {});
    return () => { alive = false; };
  }, [symbol, range]);

  const held = game.holdings[symbol];
  const frac = fractional(symbol);
  const typed = Number(qty.replace(",", ".")) || 0;
  const n = Math.max(0, frac ? Math.floor(typed * 10_000) / 10_000 : Math.floor(typed));
  const price = q?.price ?? 0;
  const gross = n * price;
  const fee = n > 0 ? tradeFee(gross) : 0;
  const maxRaw = price > 0 ? (game.cash - 1) / (price * 1.001) : 0;
  const maxBuy = frac ? Math.floor(maxRaw * 10_000) / 10_000 : Math.floor(maxRaw);
  const first = hist?.points[0]?.p;
  const rangeChange = first && price ? price / first - 1 : q?.change ?? 0;
  const positionValue = held ? held.qty * price : 0;

  const run = async (fn: typeof buy) => { setBusy(true); await fn(symbol, n); setBusy(false); };
  const unlocked = hasResearch(game, asset.research);
  const longHistory = hasResearch(game, "history_1y");
  const ranges = (longHistory ? ["1J", "1S", "1M", "1A"] : ["1J", "1S", "1M"]) as Range[];
  const news = useNews();
  const related = news.items.filter((x) => x.symbols.includes(symbol)).slice(0, 3);
  const links = neighbors(symbol);

  return (
    <Card>
      <div className="flex items-start gap-3 mb-1">
        <CompanyLogo symbol={symbol} size={44} />
        <div className="flex-1">
          <div className="text-[18px] font-semibold leading-tight">{asset.name}</div>
          <div className="text-[12px] text-muted">{symbol} · {asset.sector} · {flag(asset.country)}</div>
        </div>
        <AddToFolder symbols={[symbol]} label="Dossier" />
      </div>
      <div className="flex items-baseline gap-3 mt-3 mb-3">
        <div className="text-[32px] font-bold tabular">{q ? eur2(price) : "—"}</div>
        <Delta value={rangeChange} suffix={range} />
      </div>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <Segmented options={ranges} value={range} onChange={setRange} />
          {!longHistory && <Link href="/recherche" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-primary"><Lock size={11} />1A</Link>}
        </div>
        {hist?.source === "simulé" && dataMode !== "simulé" && <span className="text-[11px] text-muted" title="Historique réel indisponible pour cette action ou cette période">Courbe simulée</span>}
      </div>
      {hist?.points?.length ? (
        <WealthChart data={hist.points.map((p) => ({ x: p.t, y: p.p }))} color={rangeChange >= 0 ? "#10B981" : "#EF4444"} height={200} money2 xFormat={fmtTime(range)} />
      ) : <div className="h-[200px]" />}

      {held && (
        <div className="grid grid-cols-3 gap-2 mt-4 text-[12px]">
          <Info label="Détenu" value={frac ? qtyFmt(held.qty) : `${qtyFmt(held.qty)} ${asset.kind === "stock" ? "actions" : "parts"}`} />
          <Info label="Prix de revient" value={eur2(held.avgCost)} />
          <Info label="Plus-value" value={signedEur(positionValue - held.qty * held.avgCost)} tone={positionValue >= held.qty * held.avgCost ? "text-success" : "text-danger"} />
        </div>
      )}
      {held && portfolio > 0 && <p className="text-[11px] text-muted mt-2">{pctPlain(positionValue / portfolio)} de votre portefeuille</p>}

      <div className="mt-4 rounded-[12px] border border-line p-4">
        <div className="flex items-center gap-2 mb-3">
          <label htmlFor="qty" className="text-[13px] font-medium">Quantité</label>
          <input id="qty" inputMode={frac ? "decimal" : "numeric"} value={qty} onChange={(e) => setQty(e.target.value)}
            className="w-24 rounded-[8px] border border-line px-2.5 py-1.5 text-[14px] tabular outline-none focus:border-primary" />
          <div className="flex gap-1 ml-auto">
            {(frac ? [0.01, 0.1, 1] : [1, 10]).map((k) => <button key={k} onClick={() => setQty(String(k))} className="text-[11px] px-2 py-1 rounded-[6px] bg-slate-100 text-muted hover:text-ink">{qtyFmt(k)}</button>)}
            <button onClick={() => setQty(String(Math.max(0, maxBuy)))} className="text-[11px] px-2 py-1 rounded-[6px] bg-slate-100 text-muted hover:text-ink">Max</button>
          </div>
        </div>
        <div className="text-[12px] text-muted space-y-0.5 mb-3 tabular">
          <div className="flex justify-between"><span>Montant estimé</span><span className="text-ink font-medium">{eur2(gross)}</span></div>
          <div className="flex justify-between"><span>Frais (0,1 %)</span><span>{eur2(fee)}</span></div>
          <div className="flex justify-between"><span>Liquidités disponibles</span><span>{eur(game.cash)}</span></div>
        </div>
        {!unlocked && (
          <p className="text-[12px] text-muted mb-2 flex items-center gap-1.5"><Lock size={12} />Achat disponible après la recherche « {RESEARCH_BY_ID[asset.research]?.name} ». <Link href="/recherche" className="text-primary font-medium">Voir →</Link></p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy || !unlocked || n <= 0 || gross + fee > game.cash} onClick={() => run(buy)}>Acheter</Button>
          <Button variant="secondary" disabled={busy || n <= 0 || !held || n > held.qty} onClick={() => run(sell)}>Vendre</Button>
        </div>
      </div>

      {links.length > 0 && (
        <div className="mt-5">
          <div className="text-[13px] font-semibold mb-2 flex items-center justify-between">Entreprises liées <Link href="/relations" className="text-[12px] text-primary font-medium">Relations →</Link></div>
          <div className="flex flex-wrap gap-1.5">
            {links.slice(0, 8).map((l) => (
              <button key={l.role + l.symbol} onClick={() => onSelect(l.symbol)} title={l.note}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] hover:bg-slate-50">
                <span className="text-muted">{l.role} · </span><span className="font-semibold">{ASSET_BY_SYMBOL[l.symbol]?.name ?? l.symbol}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {related.length > 0 && (
        <div className="mt-5">
          <div className="text-[13px] font-semibold mb-1 flex items-center justify-between">Actualités <Link href="/actualites" className="text-[12px] text-primary font-medium">Tout voir →</Link></div>
          <NewsList items={related} compact />
        </div>
      )}
    </Card>
  );
}

function UnlockHint({ kind }: { kind: AssetKind }) {
  const game = useGame((s) => s.game);
  const need = kind === "etf" ? "etf" : kind === "commodity" ? "commodities" : "crypto";
  const text = kind === "crypto" ? "Cotées jour et nuit, achetables par fractions (0,01 BTC…)."
    : kind === "commodity" ? "Suivies via des ETF cotés à New York, convertis en euros."
    : "Un indice, un pays ou un secteur entier en un seul achat.";
  return (
    <p className="text-[11px] text-muted flex items-center gap-1.5 pb-1">
      {!hasResearch(game, need) && <><Lock size={11} /><span>Achat après « {RESEARCH_BY_ID[need]?.name} ».</span></>}
      <span>{text}</span>
    </p>
  );
}

function Info({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[10px] bg-slate-50 p-2.5"><div className="text-muted">{label}</div><div className={`font-semibold tabular ${tone}`}>{value}</div></div>;
}
