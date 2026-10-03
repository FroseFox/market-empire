"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Layers, LineChart, Lock, Search, Wallet, X } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { ASSETS, ASSET_BY_SYMBOL, FAMILIES, KIND_LABEL, familyOf, flag, regionOf, type Asset, type AssetKind, type Family, type Region } from "@/lib/market/universe";
import { simulatedHistory, type Range } from "@/lib/market/simulate";
import { feeFactor, hasResearch, maxBuyAmount, sharesFor, tradeFee } from "@/lib/game/engine";
import { RESEARCH_BY_ID } from "@/lib/game/research";
import { neighbors } from "@/lib/market/relations";
import { useNews } from "@/lib/news";
import AddToFolder from "@/components/AddToFolder";
import CompanyLogo from "@/components/CompanyLogo";
import NewsList from "@/components/NewsList";
import { fetchHistory } from "@/lib/market/client";
import { Button, Card, Delta, Empty, PageHeader, Segmented } from "@/components/ui";
import { Sparkline, WealthChart } from "@/components/charts";
import { eur, eur2, pctPlain, qtyFmt, signedEur } from "@/lib/format";
import PriceStatus from "@/components/PriceStatus";
import { useMedia } from "@/lib/useMedia";

const PAGE = 60;
const KINDS: AssetKind[] = ["stock", "etf", "commodity", "crypto"];
/** Onglet affiché : une catégorie d'actifs, ou les actifs que le joueur possède. */
type Tab = AssetKind | "held";
const REGIONS: ("Toutes" | Region)[] = ["Toutes", "États-Unis", "Europe", "Asie", "Autres"];
const FAMILY_TABS: ("Tous" | Family)[] = ["Tous", ...FAMILIES];
/** Tri de la liste : regroupée par secteur (défaut), ou à plat selon une colonne. */
type Sort = "sector" | "name" | "price-desc" | "price-asc" | "change-desc" | "change-asc";
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const byName = (a: Asset, b: Asset) => a.name.localeCompare(b.name, "fr");

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
  const [tab, setTab] = useState<Tab>("stock");
  const [region, setRegion] = useState<"Toutes" | Region>("Toutes");
  const [family, setFamily] = useState<"Tous" | Family>("Tous");
  const [sort, setSort] = useState<Sort>("sector");
  // Secteurs repliés (null = réglage par défaut : tout ouvert sur ordinateur, tout replié sur téléphone)
  const [closed, setClosed] = useState<Set<string> | null>(null);
  const small = useMedia("(max-width: 1279px)");
  const phone = useMedia("(max-width: 639px)");

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

  const heldCount = ASSETS.filter((a) => game.holdings[a.symbol]).length;
  const view: Tab = tab === "held" && heldCount === 0 ? "stock" : tab;
  // Recherche dans tout l'univers ; sans recherche, filtre par onglet, région et famille de secteurs
  const n = norm(query.trim());
  const list = ASSETS.filter((a) => n
    ? norm(`${a.symbol} ${a.name} ${a.sector} ${regionOf(a)}`).includes(n)
    : view === "held" ? !!game.holdings[a.symbol]
    : a.kind === view && (view !== "stock" || ((region === "Toutes" || regionOf(a) === region) && (family === "Tous" || familyOf(a) === family))));
  const count = (k: AssetKind) => ASSETS.filter((a) => a.kind === k).length;
  const change = (a: Asset) => quotes[a.symbol]?.change ?? 0;
  const price = (a: Asset) => quotes[a.symbol]?.price ?? 0;

  // Regroupement par secteur : seulement s'il y a plusieurs secteurs à l'écran
  const sectorNames = [...new Set(list.map((a) => a.sector))].sort((a, b) => a.localeCompare(b, "fr"));
  const grouped = !n && sort === "sector" && view !== "held" && sectorNames.length > 1;
  const showAvg = hasResearch(game, "sector_view"); // la variation moyenne par secteur se débloque par la recherche
  const groups = grouped ? sectorNames.map((sec) => {
    const items = list.filter((a) => a.sector === sec).sort(byName);
    const vals = items.map((a) => quotes[a.symbol]?.change).filter((v): v is number => typeof v === "number");
    return { sec, items, avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null };
  }) : [];
  const isClosed = (sec: string) => (closed ? closed.has(sec) : phone);
  const toggle = (sec: string) => {
    const next = new Set(closed ?? (phone ? sectorNames : []));
    if (next.has(sec)) next.delete(sec); else next.add(sec);
    setClosed(next);
  };
  const allClosed = grouped && groups.every((g) => isClosed(g.sec));

  // Liste à plat : triée, puis affichée par pages
  const flat = grouped ? [] : [...list].sort(
    sort === "price-desc" ? (a, b) => price(b) - price(a)
    : sort === "price-asc" ? (a, b) => price(a) - price(b)
    : sort === "change-desc" ? (a, b) => change(b) - change(a)
    : sort === "change-asc" ? (a, b) => change(a) - change(b)
    : n ? () => 0 : byName);
  const filterKey = `${view}|${region}|${family}|${sort}|${n}`;
  const [limit, setLimit] = useState({ key: filterKey, n: PAGE });
  const shown = flat.slice(0, limit.key === filterKey ? limit.n : PAGE);

  // Sur petit écran, la fiche s'ouvre par-dessus la liste
  const [sheet, setSheet] = useState(false);
  const open = (sym: string) => { setSelected(sym); if (small) setSheet(true); };
  /** Clic sur un en-tête de colonne : trie, puis inverse le sens. */
  const sortBy = (col: "name" | "price" | "change") => setSort((cur) =>
    col === "name" ? "name" : cur === `${col}-desc` ? `${col}-asc` : `${col}-desc`);
  const arrow = (col: "price" | "change") => (sort === `${col}-desc` ? " ↓" : sort === `${col}-asc` ? " ↑" : "");

  const row = (a: Asset) => {
    const q = quotes[a.symbol];
    const sp = sparks[a.symbol] ?? [];
    return (
      <tr key={a.symbol} onClick={() => open(a.symbol)}
        className={`border-b border-line/70 cursor-pointer transition-colors ${selected === a.symbol ? "bg-primary-soft/60" : "hover:bg-slate-50"}`}>
        <td className="pl-3 pr-1 sm:px-4 py-2">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <CompanyLogo symbol={a.symbol} size={30} />
            <div className="min-w-0">
              <div className="font-semibold flex flex-wrap items-center gap-x-1.5 gap-y-0.5">{a.name}
                {game.holdings[a.symbol] && <span className="text-[10px] rounded bg-primary-soft text-primary px-1.5 py-0.5 font-semibold">Détenu</span>}
                {!hasResearch(game, a.research) && <span title={`Achat après la recherche « ${RESEARCH_BY_ID[a.research]?.name} »`} className="text-slate-400"><Lock size={11} /></span>}
              </div>
              <div className="text-[11px] text-muted flex items-center gap-1.5">{a.symbol} · {flag(a.country)}{a.kind === "crypto" ? " · 24 h/24" : ""}<PriceStatus symbol={a.symbol} /></div>
            </div>
          </div>
        </td>
        {!grouped && <td className="px-2 text-muted hidden md:table-cell">{a.sector}</td>}
        {showSparks && <td className="px-2 hidden sm:table-cell"><Sparkline points={sp} up={(q?.change ?? 0) >= 0} /></td>}
        <td className="px-2 text-right font-semibold tabular whitespace-nowrap">{q ? eur2(q.price) : "—"}</td>
        <td className="pl-1 pr-3 sm:px-4 text-right whitespace-nowrap">{q ? <Delta value={q.change} /> : "—"}</td>
      </tr>
    );
  };
  const chip = (on: boolean) => `shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${on ? "bg-primary-soft text-primary" : "text-muted hover:bg-slate-100"}`;
  const th = "font-medium hover:text-ink";

  return (
    <>
      <PageHeader icon={LineChart} title="Marchés" subtitle={`${ASSETS.length} actifs : actions, ETF, matières premières et cryptos · cours en euros`} />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-7 !p-0">
          {/* Recherche et filtres : restent visibles quand on fait défiler la liste */}
          <div className="md:sticky md:top-16 z-10 rounded-t-[14px] border-b border-line bg-card">
            <div className="flex items-center gap-2 p-3 pb-2">
              <div className="flex items-center gap-2 flex-1 rounded-[10px] bg-slate-50 px-3 py-2">
                <Search size={16} className="text-muted" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : entreprise, secteur, pays, crypto…"
                  className="bg-transparent outline-none text-[13px] flex-1 min-w-0" />
                {query && <button onClick={() => setQuery("")} aria-label="Effacer la recherche" className="text-muted hover:text-ink"><X size={15} /></button>}
              </div>
            </div>
            {n ? (
              <div className="px-4 pb-2 text-[12px] text-muted">{list.length} résultat{list.length > 1 ? "s" : ""} dans tous les marchés</div>
            ) : (
              <div className="px-3 pb-2 space-y-1.5">
                <div role="tablist" aria-label="Catégorie" className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {heldCount > 0 && (
                    <button role="tab" aria-selected={view === "held"} onClick={() => setTab("held")}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${view === "held" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      <Wallet size={13} />Mes actifs <span className={view === "held" ? "text-white/70" : "text-muted"}>{heldCount}</span>
                    </button>
                  )}
                  {KINDS.map((k) => (
                    <button key={k} role="tab" aria-selected={view === k} onClick={() => setTab(k)}
                      className={`shrink-0 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${view === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {KIND_LABEL[k]} <span className={view === k ? "text-white/70" : "text-muted"}>{count(k)}</span>
                    </button>
                  ))}
                </div>
                {view === "stock" && (
                  <>
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Région">
                      <span className="w-[52px] shrink-0 text-[11px] text-muted">Région</span>
                      {REGIONS.map((r) => <button key={r} aria-pressed={region === r} onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
                    </div>
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Secteur">
                      <span className="w-[52px] shrink-0 text-[11px] text-muted">Secteur</span>
                      {FAMILY_TABS.map((f) => <button key={f} aria-pressed={family === f} onClick={() => setFamily(f)} className={chip(family === f)}>{f}</button>)}
                    </div>
                  </>
                )}
                {view !== "stock" && view !== "held" && <UnlockHint kind={view} />}
              </div>
            )}
            {/* Barre de tri */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap border-t border-line px-3 py-1.5 text-[12px] text-muted">
              <span className="hidden tabular sm:inline">{list.length} actif{list.length > 1 ? "s" : ""}</span>
              {!n && view !== "held" && sectorNames.length > 1 && (
                <button onClick={() => setSort("sector")} aria-pressed={sort === "sector"}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${sort === "sector" ? "bg-primary-soft text-primary" : "hover:bg-slate-100"}`}>
                  <Layers size={12} />Par secteur
                </button>
              )}
              {grouped && (
                <button onClick={() => setClosed(new Set(allClosed ? [] : sectorNames))} className="rounded-full px-2.5 py-1 text-[11px] font-medium hover:bg-slate-100">
                  {allClosed ? "Tout déplier" : "Tout replier"}
                </button>
              )}
              <span className="ml-auto flex items-center gap-3 pl-2 sm:gap-4">
                <button onClick={() => sortBy("name")} className={`${th} ${sort === "name" ? "text-primary" : ""}`}>A → Z</button>
                <button onClick={() => sortBy("price")} className={`${th} ${sort.startsWith("price") ? "text-primary" : ""}`}>Prix{arrow("price")}</button>
                <button onClick={() => sortBy("change")} className={`${th} whitespace-nowrap ${sort.startsWith("change") ? "text-primary" : ""}`}>Var. 1J{arrow("change")}</button>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {grouped ? groups.map((g) => {
                  const shut = isClosed(g.sec);
                  return (
                    <Fragment key={g.sec}>
                      <tr className="border-b border-line bg-slate-50/80">
                        <td colSpan={5} className="p-0">
                          <button onClick={() => toggle(g.sec)} aria-expanded={!shut} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 sm:px-4">
                            <ChevronRight size={15} className={`text-muted transition-transform ${shut ? "" : "rotate-90"}`} />
                            <span className="text-[12px] font-semibold">{g.sec}</span>
                            <span className="text-[11px] text-muted tabular">{g.items.length}</span>
                            {showAvg && g.avg !== null && <Delta value={g.avg} className="ml-auto" />}
                          </button>
                        </td>
                      </tr>
                      {!shut && g.items.map(row)}
                    </Fragment>
                  );
                }) : shown.map(row)}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <Empty>Aucun actif ne correspond. Essayez un autre filtre ou une autre recherche.</Empty>}
          {!grouped && shown.length < flat.length && (
            <div className="p-3 border-t border-line text-center">
              <Button variant="secondary" onClick={() => setLimit({ key: filterKey, n: shown.length + PAGE })}>
                Afficher plus ({flat.length - shown.length} restants)
              </Button>
            </div>
          )}
        </Card>

        {!small && <div className="xl:col-span-5"><div className="xl:sticky xl:top-20"><AssetPanel symbol={selected} onSelect={setSelected} /></div></div>}
      </div>

      {small && sheet && (
        <div className="fixed inset-0 z-50 bg-navy/40 appear" onClick={() => setSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 top-10 overflow-y-auto rounded-t-[20px] bg-bg shadow-2xl sm:inset-x-auto sm:right-0 sm:top-0 sm:w-[520px] sm:rounded-none"
            onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={ASSET_BY_SYMBOL[selected]?.name}>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/95 backdrop-blur px-4 py-2.5 border-b border-line">
              <div className="mx-auto h-1 w-10 rounded-full bg-slate-300 sm:hidden absolute left-1/2 -translate-x-1/2 top-1.5" />
              <span className="text-[13px] font-semibold text-muted">Fiche</span>
              <button type="button" onClick={() => setSheet(false)} aria-label="Fermer" className="p-2 -mr-2 rounded-full text-muted hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="p-3" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}>
              <AssetPanel symbol={selected} onSelect={setSelected} />
            </div>
          </div>
        </div>
      )}
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
  // L'ordre se passe en euros : le jeu calcule le nombre de titres (fractions permises)
  const [amount, setAmount] = useState("1000");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHistory(symbol, range).then((j) => { if (alive) setHist(j); }).catch(() => {});
    return () => { alive = false; };
  }, [symbol, range]);

  const held = game.holdings[symbol];
  const price = q?.price ?? 0;
  const positionValue = held ? held.qty * price : 0;
  const typed = Math.max(0, Number(amount.replace(/\s/g, "").replace(",", ".")) || 0);
  // Frais réduits par le pays, un bureau dans la place financière ou un grand projet
  const feeRate = feeFactor(game, symbol);
  const maxBuy = maxBuyAmount(game.cash, feeRate);
  const sellAll = !!held && (all || typed >= positionValue - 0.005);
  const n = sharesFor(typed, price);
  const gross = n * price;
  const fee = n > 0 ? tradeFee(gross, feeRate) : 0;
  const unit = asset.kind === "stock" ? "action" : asset.kind === "crypto" ? "unité" : "part";
  const first = hist?.points[0]?.p;
  const rangeChange = first && price ? price / first - 1 : q?.change ?? 0;

  const run = async (fn: () => Promise<boolean>) => { setBusy(true); await fn(); setBusy(false); setAll(false); };
  const pick = (v: number, everything = false) => { setAmount(String(Math.floor(v * 100) / 100)); setAll(everything); };
  const unlocked = hasResearch(game, asset.research);
  const longHistory = hasResearch(game, "history_1y");
  const ranges = (longHistory ? ["1J", "1S", "1M", "1A"] : ["1J", "1S", "1M"]) as Range[];
  const news = useNews();
  const related = news.items.filter((x) => x.symbols.includes(symbol)).slice(0, 3);
  const links = neighbors(symbol);

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3 mb-1">
        <CompanyLogo symbol={symbol} size={44} />
        <div className="flex-1 min-w-[160px]">
          <div className="text-[18px] font-semibold leading-tight">{asset.name}</div>
          <div className="text-[12px] text-muted flex flex-wrap items-center gap-1.5">{symbol} · {asset.sector} · {flag(asset.country)}<PriceStatus symbol={symbol} large /></div>
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
          <Info label="Détenu" value={`${qtyFmt(held.qty)} ${unit}${held.qty >= 2 ? "s" : ""} · ${eur(positionValue)}`} />
          <Info label="Prix de revient" value={eur2(held.avgCost)} />
          <Info label="Plus-value" value={signedEur(positionValue - held.qty * held.avgCost)} tone={positionValue >= held.qty * held.avgCost ? "text-success" : "text-danger"} />
        </div>
      )}
      {held && portfolio > 0 && <p className="text-[11px] text-muted mt-2">{pctPlain(positionValue / portfolio)} de votre portefeuille</p>}

      <div className="mt-4 rounded-[12px] border border-line p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label htmlFor="amount" className="text-[13px] font-medium">Montant</label>
          <div className="relative">
            <input id="amount" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setAll(false); }}
              className="w-32 rounded-[8px] border border-line py-1.5 pl-2.5 pr-7 text-[14px] tabular outline-none focus:border-primary" />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted">€</span>
          </div>
          <div className="flex flex-wrap gap-1 ml-auto">
            {[1_000, 10_000].map((k) => <button key={k} onClick={() => pick(k)} className="text-[11px] px-2 py-1 rounded-[6px] bg-slate-100 text-muted hover:text-ink">{eur(k)}</button>)}
            <button onClick={() => pick(maxBuy)} title="Tout ce que vos liquidités permettent d'acheter, frais compris" className="text-[11px] px-2 py-1 rounded-[6px] bg-slate-100 text-muted hover:text-ink">Max</button>
            {held && <button onClick={() => pick(positionValue, true)} title="Montant de toute votre position, pour la vendre" className="text-[11px] px-2 py-1 rounded-[6px] bg-slate-100 text-muted hover:text-ink">Tout</button>}
          </div>
        </div>
        <div className="text-[12px] text-muted space-y-0.5 mb-3 tabular">
          <div className="flex justify-between"><span>Soit environ</span><span className="text-ink font-medium">{qtyFmt(sellAll && all ? held!.qty : n)} {unit}{n >= 2 ? "s" : ""} à {eur2(price)}</span></div>
          <div className="flex justify-between"><span>Frais ({(0.1 * feeRate).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} %{feeRate < 1 ? ", réduits" : ""})</span><span>{eur2(fee)}</span></div>
          <div className="flex justify-between"><span>Liquidités disponibles</span><span>{eur(game.cash)}</span></div>
        </div>
        {!unlocked && (
          <p className="text-[12px] text-muted mb-2 flex items-center gap-1.5"><Lock size={12} />Achat disponible après la recherche « {RESEARCH_BY_ID[asset.research]?.name} ». <Link href="/recherche" className="text-primary font-medium">Voir →</Link></p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy || !unlocked || n <= 0 || gross + fee > game.cash} onClick={() => run(() => buy(symbol, typed))}>Acheter</Button>
          <Button variant="secondary" disabled={busy || !held || (!sellAll && (n <= 0 || n > held.qty))} onClick={() => run(() => sell(symbol, typed, sellAll))}>{sellAll ? "Tout vendre" : "Vendre"}</Button>
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
