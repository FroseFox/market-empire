"use client";
// Effet de levier : le joueur engage une mise, le jeu prête le reste. Les cours restent ceux du marché ;
// seule l'exposition est multipliée, donc les gains comme les pertes.
import { useState } from "react";
import Link from "next/link";
import { Lock, TriangleAlert, Zap } from "lucide-react";
import { useGame } from "@/store/game";
import { LEVERAGE, CITY_RANKS } from "@/lib/game/config";
import { cityRank, feeFactor, hasResearch, levLiquidationPrice, levValue, maxLeverage, tradeFee, type LevPosition } from "@/lib/game/engine";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { focusAsset } from "@/lib/market/focus";
import { Button } from "@/components/ui";
import CompanyLogo from "@/components/CompanyLogo";
import { eur, eur2, pctPlain, signedEur, tone } from "@/lib/format";

/** Positions à levier ouvertes (toutes, ou celles d'un seul actif), avec leur résultat et le bouton de clôture. */
export function LeveragePositions({ symbol, link = false }: { symbol?: string; link?: boolean }) {
  const positions = useGame((s) => s.game.positions);
  const quotes = useGame((s) => s.quotes);
  const close = useGame((s) => s.closeLeverage);
  const [busy, setBusy] = useState<string | null>(null);
  const list = (positions ?? []).filter((p) => !symbol || p.symbol === symbol);
  if (!list.length) return null;
  const row = (p: LevPosition) => {
    const price = quotes[p.symbol]?.price ?? p.entry;
    const value = levValue(p, price), pnl = value - p.stake, liq = levLiquidationPrice(p);
    // Distance au seuil de fermeture d'office : alerte quand elle devient faible
    const room = price > 0 ? (price - liq) / price : 0;
    return (
      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
        {!symbol && <CompanyLogo symbol={p.symbol} size={28} />}
        <div className="min-w-[150px] flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            {!symbol && (link
              ? <Link href="/marches" onClick={() => focusAsset(p.symbol)} className="hover:text-primary hover:underline">{ASSET_BY_SYMBOL[p.symbol]?.name ?? p.symbol}</Link>
              : <span>{ASSET_BY_SYMBOL[p.symbol]?.name ?? p.symbol}</span>)}
            <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">×{p.lev}</span>
            <span className="whitespace-nowrap font-normal text-muted">mise {eur(p.stake)}</span>
          </div>
          <div className="text-[11px] text-muted tabular">
            Entrée {eur2(p.entry)} · <span className={room < 0.03 ? "font-semibold text-danger" : ""}>fermée d&apos;office à {eur2(liq)}</span>
            {p.interest > 0 && <> · intérêts {eur(p.interest)}</>}
          </div>
        </div>
        <div className="ml-auto text-right tabular">
          <div className={`text-[13px] font-semibold ${tone(pnl)}`}>{signedEur(pnl)}</div>
          <div className="text-[11px] text-muted">{pctPlain(pnl / p.stake)} de la mise</div>
        </div>
        <Button variant="secondary" disabled={busy === p.id} className="!px-3 !py-1.5 !text-[12px]"
          onClick={async () => { setBusy(p.id); await close(p.id); setBusy(null); }}>Clôturer</Button>
      </li>
    );
  };
  return <ul className="divide-y divide-line">{list.map(row)}</ul>;
}

/** Ouverture d'une position à levier sur un actif (fiche d'un actif, page Marchés). */
export default function LeverageBox({ symbol }: { symbol: string }) {
  const game = useGame((s) => s.game);
  const price = useGame((s) => s.quotes[symbol]?.price ?? 0);
  const open = useGame((s) => s.openLeverage);
  const asset = ASSET_BY_SYMBOL[symbol];
  const rank = cityRank(game.population);
  const max = maxLeverage(game, symbol);
  const [levPick, setLevPick] = useState<number>(2);
  const [stakeText, setStakeText] = useState("1000");
  const [busy, setBusy] = useState(false);
  const mine = (game.positions ?? []).filter((p) => p.symbol === symbol);

  if (max <= 1 && !mine.length) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-dashed border-line px-4 py-3 text-[12px] text-muted">
        <Lock size={14} className="shrink-0" />
        <span><b className="font-semibold text-ink">Effet de levier</b> : s&apos;ouvre quand votre ville atteint le rang « {CITY_RANKS[LEVERAGE.minRank[0]].name} » ({CITY_RANKS[LEVERAGE.minRank[0]].pop} habitants).</span>
      </div>
    );
  }

  const lev = Math.min(levPick, Math.max(2, max));
  const stake = Math.max(0, Number(stakeText.replace(/\s/g, "").replace(",", ".")) || 0);
  const exposure = stake * lev;
  const fee = stake > 0 ? tradeFee(exposure, feeFactor(game, symbol)) : 0;
  const liq = price * (1 - (1 - LEVERAGE.liquidation) / lev);
  const perDay = stake * (lev - 1) * LEVERAGE.dayRate;
  const unlocked = hasResearch(game, asset.research);
  const full = (game.positions?.length ?? 0) >= LEVERAGE.maxPositions;
  const problem = !unlocked ? "Actif verrouillé : débloquez sa recherche."
    : full ? `Pas plus de ${LEVERAGE.maxPositions} positions à levier à la fois.`
    : stake < LEVERAGE.minStake ? `Mise minimale : ${eur(LEVERAGE.minStake)}.`
    : stake + fee > game.cash ? "Liquidités insuffisantes." : null;
  /** Pourquoi un levier est indisponible (rang de ville, ou type d'actif trop volatil). */
  const lockReason = (l: number, i: number) => rank < LEVERAGE.minRank[i]
    ? `À partir du rang « ${CITY_RANKS[LEVERAGE.minRank[i]].name} »`
    : `Levier limité à ×${LEVERAGE.maxByKind[asset.kind]} sur ce type d'actif`;

  return (
    <div className="mt-3 rounded-[12px] border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap size={16} className="text-primary" />
        <h3 className="text-[13px] font-semibold">Effet de levier</h3>
        <span className="ml-auto text-[11px] text-muted">gains et pertes multipliés</span>
      </div>
      {mine.length > 0 && <div className="mb-3 rounded-[10px] bg-slate-50 px-3"><LeveragePositions symbol={symbol} /></div>}
      {max > 1 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-[10px] bg-slate-100 p-0.5" role="radiogroup" aria-label="Levier">
              {LEVERAGE.levels.map((l, i) => {
                const ok = l <= max;
                return (
                  <button key={l} type="button" role="radio" aria-checked={lev === l} disabled={!ok} title={ok ? `Levier ×${l}` : lockReason(l, i)}
                    onClick={() => setLevPick(l)}
                    className={`inline-flex items-center gap-1 rounded-[8px] px-3 py-1 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${lev === l ? "bg-card text-primary shadow-sm" : "text-muted hover:text-ink"}`}>
                    {!ok && <Lock size={11} />}×{l}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="lev-stake" className="text-[13px] font-medium">Mise</label>
              <div className="relative">
                <input id="lev-stake" inputMode="decimal" value={stakeText} onChange={(e) => setStakeText(e.target.value)}
                  className="w-24 rounded-[8px] border border-line py-1.5 pl-2.5 pr-7 text-[14px] tabular outline-none focus:border-primary sm:w-28" />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted">€</span>
              </div>
            </div>
          </div>
          <div className="mb-3 space-y-0.5 text-[12px] text-muted tabular">
            <div className="flex justify-between"><span>Exposition (mise × {lev})</span><span className="font-medium text-ink">{eur(exposure)}</span></div>
            <div className="flex justify-between"><span>Si le cours prend +1 %</span><span className="font-medium text-success">{signedEur(exposure * 0.01)}</span></div>
            <div className="flex justify-between"><span>Si le cours perd 1 %</span><span className="font-medium text-danger">{signedEur(-exposure * 0.01)}</span></div>
            <div className="flex justify-between gap-3"><span>Fermée d&apos;office à</span><span className="whitespace-nowrap">{price ? `${eur2(liq)} (−${pctPlain((1 - LEVERAGE.liquidation) / lev).replace(" %", "")} %)` : "—"}</span></div>
            <div className="flex justify-between gap-3"><span>Frais d&apos;ouverture</span><span className="whitespace-nowrap">{eur2(fee)}</span></div>
            <div className="flex justify-between gap-3"><span>Intérêts par jour de ville</span><span className="whitespace-nowrap">{eur2(perDay)}</span></div>
          </div>
          <p className="mb-3 flex items-start gap-1.5 text-[11px] text-amber-700">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            Vous pouvez perdre toute votre mise, mais jamais plus. Les cours restent ceux du vrai marché.
          </p>
          <Button className="w-full" disabled={busy || !!problem || !price}
            onClick={async () => { setBusy(true); await open(symbol, stake, lev); setBusy(false); }}>
            Ouvrir une position ×{lev}
          </Button>
          {problem && <p className="mt-2 text-center text-[11px] text-muted">{problem}</p>}
        </>
      )}
    </div>
  );
}
