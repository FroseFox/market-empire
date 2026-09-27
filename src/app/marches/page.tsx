"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Search } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { ASSETS, ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { simulatedHistory, type Range } from "@/lib/market/simulate";
import { tradeFee } from "@/lib/game/engine";
import { fetchHistory } from "@/lib/market/client";
import { Button, Card, Delta, PageHeader, Segmented } from "@/components/ui";
import { Sparkline, WealthChart } from "@/components/charts";
import { eur, eur2, num, pctPlain, signedEur } from "@/lib/format";

const FLAG: Record<string, string> = { US: "🇺🇸", FR: "🇫🇷", NL: "🇳🇱", DE: "🇩🇪", TW: "🇹🇼" };

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

  // Mini-courbes 1J (même moteur que le serveur, recalées sur le dernier prix)
  const lastQuoteAt = useGame((s) => s.lastQuoteAt);
  const sparks = useMemo(() => {
    if (!lastQuoteAt) return {} as Record<string, number[]>;
    return Object.fromEntries(ASSETS.map((a) => {
      const pts = simulatedHistory(a.symbol, "1J", lastQuoteAt).filter((_, i) => i % 3 === 0).map((p) => p.p);
      const k = quotes[a.symbol] ? quotes[a.symbol].price / pts[pts.length - 1] : 1;
      return [a.symbol, pts.map((p) => p * k)];
    }));
  }, [lastQuoteAt, quotes]);

  const list = ASSETS.filter((a) => (a.symbol + a.name + a.sector).toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <PageHeader icon={LineChart} title="Marchés" subtitle="Actions réelles · prix exécutés côté serveur au moment de l'ordre" />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <Card className="xl:col-span-7 !p-0 overflow-hidden">
          <div className="p-4 border-b border-line flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 rounded-[10px] bg-slate-50 px-3 py-2">
              <Search size={16} className="text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une entreprise, un secteur…"
                className="bg-transparent outline-none text-[13px] flex-1" />
            </div>
            <span className="text-[12px] text-muted hidden sm:block">{list.length} actions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-muted text-[12px]">
                <tr className="border-b border-line">
                  <th className="text-left font-medium px-4 py-2.5">Nom</th>
                  <th className="text-left font-medium px-2 hidden md:table-cell">Secteur</th>
                  <th className="px-2 hidden sm:table-cell" />
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
                          <div className="h-8 w-8 rounded-[8px] bg-navy text-white grid place-items-center text-[10px] font-bold shrink-0">{a.symbol.slice(0, 4)}</div>
                          <div>
                            <div className="font-semibold flex items-center gap-1.5">{a.name}{held && <span className="text-[10px] rounded bg-primary-soft text-primary px-1.5 py-0.5 font-semibold">Détenu</span>}</div>
                            <div className="text-[11px] text-muted">{a.symbol} · {FLAG[a.country]}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 text-muted hidden md:table-cell">{a.sector}</td>
                      <td className="px-2 hidden sm:table-cell"><Sparkline points={sp} up={(q?.change ?? 0) >= 0} /></td>
                      <td className="px-2 text-right font-semibold tabular whitespace-nowrap">{q ? eur2(q.price) : "—"}</td>
                      <td className="px-4 text-right">{q ? <Delta value={q.change} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="xl:col-span-5"><div className="xl:sticky xl:top-20"><AssetPanel symbol={selected} /></div></div>
      </div>
    </>
  );
}

function AssetPanel({ symbol }: { symbol: string }) {
  const { game, quotes, portfolio } = useDerived();
  const buy = useGame((s) => s.buy);
  const sell = useGame((s) => s.sell);
  const asset = ASSET_BY_SYMBOL[symbol];
  const q = quotes[symbol];
  const [range, setRange] = useState<Range>("1M");
  const [hist, setHist] = useState<{ points: { t: number; p: number }[]; indicative: boolean } | null>(null);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHistory(symbol, range).then((j) => { if (alive) setHist(j); }).catch(() => {});
    return () => { alive = false; };
  }, [symbol, range]);

  const held = game.holdings[symbol];
  const n = Math.max(0, Math.floor(Number(qty.replace(",", ".")) || 0));
  const price = q?.price ?? 0;
  const gross = n * price;
  const fee = n > 0 ? tradeFee(gross) : 0;
  const maxBuy = price > 0 ? Math.floor((game.cash - 1) / (price * 1.001)) : 0;
  const first = hist?.points[0]?.p;
  const rangeChange = first && price ? price / first - 1 : q?.change ?? 0;
  const positionValue = held ? held.qty * price : 0;

  const run = async (fn: typeof buy) => { setBusy(true); await fn(symbol, n); setBusy(false); };

  return (
    <Card>
      <div className="flex items-start gap-3 mb-1">
        <div className="h-11 w-11 rounded-[10px] bg-navy text-white grid place-items-center text-[11px] font-bold">{symbol.slice(0, 4)}</div>
        <div className="flex-1">
          <div className="text-[18px] font-semibold leading-tight">{asset.name}</div>
          <div className="text-[12px] text-muted">{symbol} · {asset.sector} · {FLAG[asset.country]}</div>
        </div>
      </div>
      <div className="flex items-baseline gap-3 mt-3 mb-3">
        <div className="text-[32px] font-bold tabular">{q ? eur2(price) : "—"}</div>
        <Delta value={rangeChange} suffix={range} />
      </div>
      <div className="flex justify-between items-center mb-2">
        <Segmented options={["1J", "1S", "1M", "1A"] as Range[]} value={range} onChange={setRange} />
        {hist?.indicative && <span className="text-[11px] text-muted">Historique indicatif</span>}
      </div>
      {hist?.points?.length ? (
        <WealthChart data={hist.points.map((p) => ({ x: p.t, y: p.p }))} color={rangeChange >= 0 ? "#10B981" : "#EF4444"} height={200} money2 xFormat={fmtTime(range)} />
      ) : <div className="h-[200px]" />}

      {held && (
        <div className="grid grid-cols-3 gap-2 mt-4 text-[12px]">
          <Info label="Détenu" value={`${num(held.qty)} actions`} />
          <Info label="Prix de revient" value={eur2(held.avgCost)} />
          <Info label="Plus-value" value={signedEur(positionValue - held.qty * held.avgCost)} tone={positionValue >= held.qty * held.avgCost ? "text-success" : "text-danger"} />
        </div>
      )}
      {held && portfolio > 0 && <p className="text-[11px] text-muted mt-2">{pctPlain(positionValue / portfolio)} de votre portefeuille</p>}

      <div className="mt-4 rounded-[12px] border border-line p-4">
        <div className="flex items-center gap-2 mb-3">
          <label htmlFor="qty" className="text-[13px] font-medium">Quantité</label>
          <input id="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)}
            className="w-24 rounded-[8px] border border-line px-2.5 py-1.5 text-[14px] tabular outline-none focus:border-primary" />
          <div className="flex gap-1 ml-auto">
            {[1, 10].map((k) => <button key={k} onClick={() => setQty(String(k))} className="text-[11px] px-2 py-1 rounded-[6px] bg-slate-100 text-muted hover:text-ink">{k}</button>)}
            <button onClick={() => setQty(String(Math.max(0, maxBuy)))} className="text-[11px] px-2 py-1 rounded-[6px] bg-slate-100 text-muted hover:text-ink">Max</button>
          </div>
        </div>
        <div className="text-[12px] text-muted space-y-0.5 mb-3 tabular">
          <div className="flex justify-between"><span>Montant estimé</span><span className="text-ink font-medium">{eur2(gross)}</span></div>
          <div className="flex justify-between"><span>Frais (0,1 %)</span><span>{eur2(fee)}</span></div>
          <div className="flex justify-between"><span>Liquidités disponibles</span><span>{eur(game.cash)}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy || n <= 0 || gross + fee > game.cash} onClick={() => run(buy)}>Acheter</Button>
          <Button variant="secondary" disabled={busy || n <= 0 || !held || n > held.qty} onClick={() => run(sell)}>Vendre</Button>
        </div>
      </div>
    </Card>
  );
}

function Info({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[10px] bg-slate-50 p-2.5"><div className="text-muted">{label}</div><div className={`font-semibold tabular ${tone}`}>{value}</div></div>;
}
