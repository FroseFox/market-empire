"use client";
// Bourse des villes : acheter des parts de la ville d'un autre joueur, ou vendre des parts de la sienne.
// Séparée de la vraie bourse : ici le prix d'une part suit le patrimoine que la ville publie (patrimoine / 1 000),
// et l'argent passe toujours d'un joueur à l'autre. Le jeu ne dit jamais dans quelle ville investir.
import { useEffect, useState } from "react";
import { Building2, HandCoins, Landmark, Lock, Swords } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { useAuth } from "@/lib/auth";
import { buyCityShares, buybackCityShares, hostileBid, setShareFloat, syncShares } from "@/lib/online";
import { STATIC_MODE } from "@/lib/market/client";
import { CITY_RANKS, FEATURES, SHARES } from "@/lib/game/config";
import { featureOpen, shareDividend, sharePrice } from "@/lib/game/engine";
import { refreshWorld, type PublicPlayer } from "@/lib/world/players";
import { PLAYABLE } from "@/lib/world/countries";
import { Card, ConfirmButton, Empty, Segmented } from "@/components/ui";
import { compactEur, eur, num, signedEur } from "@/lib/format";

/** Lots proposés à l'achat, en parts (10 parts = 1 % de la ville). */
const LOTS = [10, 50, 100] as const;
/** Parts mises en vente : 0, 10, 25 ou 49 % de la ville. */
const FLOATS = [0, 100, 250, SHARES.maxFloat] as const;
/** Marge sur le prix affiché : le patrimoine d'une ville bouge entre deux lectures du classement. */
const SLACK = 1.05;
const share = (qty: number) => `${(qty / (SHARES.total / 100)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export default function ShareMarket({ players }: { players: PublicPlayer[] }) {
  const { game, city, netWorth } = useDerived();
  const notify = useGame((s) => s.notify);
  const auth = useAuth();
  const online = !STATIC_MODE && auth.status === "in";
  // undefined = chargement, false = bourse des villes indisponible
  const [ready, setReady] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [lot, setLot] = useState<string>(`${LOTS[0]} parts`);
  const qty = Number.parseInt(lot, 10);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    syncShares().then((ok) => { if (alive) setReady(ok); });
    return () => { alive = false; };
  }, [online]);

  if (!online) return <Card><Empty>La bourse des villes est disponible sur le site publié, une fois connecté.</Empty></Card>;
  if (ready === undefined) return <Card><Empty>Chargement de la bourse des villes…</Empty></Card>;
  if (!ready) return <Card><Empty>Bourse des villes indisponible pour le moment.</Empty></Card>;

  const open = featureOpen(game, "shares") && game.population >= SHARES.minPop;
  const minRank = CITY_RANKS[FEATURES.find((f) => f.id === "shares")!.rank].name;
  const mine = game.shares ?? { credit: 0, float: 0, sold: 0, held: [], holders: [] };
  const held = new Map(mine.held.map((h) => [h.city, h]));
  const listed = players
    .filter((p) => !p.isMe && p.ranked !== false && ((p.shareFloat ?? 0) - (p.shareSold ?? 0) > 0 || held.has(p.id)))
    .sort((a, b) => b.netWorth - a.netWorth);
  const myPrice = sharePrice(netWorth);

  const act = async (run: () => Promise<number | boolean | null>, okText: (v: number) => string, koText: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await run();
      if (r) notify(okText(typeof r === "number" ? r : 0)); else notify(koText, "error");
    } catch { notify("Bourse des villes indisponible pour le moment, réessayez plus tard.", "error"); }
    refreshWorld();
    setBusy(false);
  };

  return (
    <div className="grid items-start gap-4 grid-cols-1 xl:grid-cols-12">
      <Card className="xl:col-span-7" title="Villes en bourse" icon={Building2}
        extra={<Segmented options={LOTS.map((n) => `${n} parts`)} value={lot} onChange={setLot} />}>
        <p className="mb-3 text-[12px] text-muted">
          Une ville compte {num(SHARES.total)} parts. Le prix d&apos;une part suit le patrimoine de la ville (patrimoine ÷ {num(SHARES.total)}) ; chaque part
          vous verse chaque jour sa fraction du flux net de la ville. Votre argent va au propriétaire, qui seul peut racheter ses parts, au prix du jour.
        </p>
        {!open && (
          <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-dashed border-line px-3 py-2.5 text-[12px] text-muted">
            <Lock size={14} className="shrink-0" />L&apos;achat de parts s&apos;ouvre au rang « {minRank} » ({num(SHARES.minPop)} habitants).
          </div>
        )}
        {listed.length === 0 ? <Empty>Aucune ville n&apos;a de parts en vente pour l&apos;instant.</Empty> : (
          <ul className="divide-y divide-line">
            {listed.map((p) => {
              const price = sharePrice(p.netWorth), left = Math.max(0, (p.shareFloat ?? 0) - (p.shareSold ?? 0));
              const n = Math.min(qty, left), cost = Math.ceil(price * n * SLACK), own = held.get(p.id);
              const full = !own && mine.held.length >= SHARES.maxLines;
              const why = !open ? `À partir du rang « ${minRank} »` : left <= 0 ? "Plus de parts en vente" : full ? `Pas plus de ${SHARES.maxLines} villes différentes` : game.cash < cost ? "Liquidités insuffisantes" : undefined;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <div className="min-w-[160px] flex-1">
                    <div className="truncate text-[13px] font-semibold">{p.cityName} <span className="font-normal text-muted">· {p.name || "Joueur"}{PLAYABLE[p.country] ? ` · ${PLAYABLE[p.country]}` : ""}</span></div>
                    <div className="text-[11px] text-muted tabular">
                      {eur(price)} la part · dividende {signedEur(shareDividend(p.income ?? 0))}/j par part · {num(left)} en vente
                      {own && <span className="font-semibold text-primary"> · vous en avez {num(own.qty)}</span>}
                    </div>
                  </div>
                  <ConfirmButton disabled={busy || !!why} confirmLabel={`Confirmer : ${compactEur(cost)} au plus`}
                    onConfirm={() => act(() => buyCityShares(p.id, p.cityName, n, cost), (v) => `${num(n)} parts de ${p.cityName} achetées pour ${eur(v)}`, "Achat refusé : les parts viennent d'être prises ou le prix a monté.")}
                    className="shrink-0 rounded-[10px] bg-primary px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                    <span title={why}>{why ?? `Acheter ${num(n)} · ${compactEur(price * n)}`}</span>
                  </ConfirmButton>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 xl:col-span-5">
        <Card title="Ma ville en bourse" icon={Landmark}>
          <dl className="grid grid-cols-3 gap-2 text-[12px]">
            <Info label="Prix d'une part" value={eur(myPrice)} />
            <Info label="Parts vendues" value={`${num(mine.sold)} · ${share(mine.sold)}`} />
            <Info label="Dividendes versés" value={`${eur(city.expenses.dividends)}/j`} />
          </dl>
          <p className="mt-3 text-[12px] text-muted">
            Mettez des parts en vente pour lever de l&apos;argent : chaque part achetée vous rapporte tout de suite son prix, puis vous coûte sa fraction de votre flux net chaque jour, jusqu&apos;à ce que vous la rachetiez.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium">Parts en vente</span>
            <div className="inline-flex rounded-[10px] bg-slate-100 p-0.5" role="radiogroup" aria-label="Parts en vente">
              {FLOATS.map((f) => {
                const on = mine.float === f, no = busy || f < mine.sold || (!open && f > mine.float);
                return (
                  <button key={f} type="button" role="radio" aria-checked={on} disabled={no}
                    title={f < mine.sold ? "Moins que ce qui est déjà vendu" : !open && f > mine.float ? `À partir du rang « ${minRank} »` : `${num(f)} parts`}
                    onClick={() => !on && act(() => setShareFloat(f), () => (f ? `${share(f)} de votre ville en vente` : "Votre ville n'est plus en vente"), "Changement refusé.")}
                    className={`rounded-[8px] px-3 py-1 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${on ? "bg-card text-primary shadow-sm" : "text-muted hover:text-ink"}`}>
                    {share(f)}
                  </button>
                );
              })}
            </div>
          </div>
          {mine.holders.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-[10px] border border-line">
              {mine.holders.map((h) => {
                const cost = Math.ceil(myPrice * h.qty * SLACK);
                return (
                  <li key={h.holder} className="flex items-center gap-2 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{h.name}</div>
                      <div className="text-[11px] text-muted tabular">{num(h.qty)} parts · {share(h.qty)} · {eur(h.qty * shareDividend(city.operating))}/j
                        {h.qty >= SHARES.control && <span className="font-semibold text-danger"> · contrôle votre ville : tribut de {eur(city.tribute.paid)}/j</span>}
                      </div>
                    </div>
                    <ConfirmButton disabled={busy || game.cash < cost} confirmLabel={`Confirmer : ${compactEur(cost)} au plus`}
                      onConfirm={() => act(() => buybackCityShares(h.holder, h.name, h.qty, cost), (v) => `Parts rachetées pour ${eur(v)}`, "Rachat refusé : le prix a changé, réessayez.")}
                      className="shrink-0 rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                      <span title={game.cash < cost ? "Liquidités insuffisantes" : "Au prix du jour, payé à l'actionnaire"}>Racheter · {compactEur(myPrice * h.qty)}</span>
                    </ConfirmButton>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={`Mes parts (${mine.held.length})`} icon={HandCoins}
          extra={mine.held.length > 0 && <span className="text-[12px] text-muted">Reçu : <b className="tabular text-success">{signedEur(city.income.dividends)}/j</b></span>}>
          {mine.held.length === 0 ? <Empty>Vous ne détenez aucune part de ville.</Empty> : (
            <ul className="divide-y divide-line">
              {mine.held.map((h) => {
                const value = h.qty * sharePrice(h.netWorth), pnl = value - h.cost;
                // Rachat hostile : avec assez de parts, on force la vente du reste (jusqu'à 49 %), payé plus cher au propriétaire
                const target = players.find((p) => p.id === h.city);
                const rest = SHARES.maxFloat - (target?.shareSold ?? SHARES.maxFloat), ally = !!game.alliance && target?.alliance === game.alliance.id;
                const bid = Math.ceil(sharePrice(h.netWorth) * rest * SHARES.raidPremium * SLACK);
                const canRaid = h.qty >= SHARES.raidFrom && rest > 0 && !ally;
                return (
                  <li key={h.city} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{h.name}</div>
                      <div className="text-[11px] text-muted tabular">{num(h.qty)} parts · {share(h.qty)} · dividende {signedEur(h.qty * shareDividend(h.income))}/j
                        {h.qty >= SHARES.control && <span className="font-semibold text-primary"> · vous contrôlez la ville : tribut {signedEur(SHARES.tribute * Math.max(0, h.income))}/j</span>}
                      </div>
                      {canRaid && (
                        <ConfirmButton disabled={busy || game.cash < bid} confirmLabel={`Confirmer : ${compactEur(bid)} au plus`}
                          onConfirm={() => act(() => hostileBid(h.city, h.name, bid), (v) => `Rachat hostile de ${h.name} : ${num(rest)} parts pour ${eur(v)}`, "Rachat hostile refusé : la situation a changé.")}
                          className="mt-1.5 inline-flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-1 text-[12px] font-semibold text-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                          <span title={game.cash < bid ? "Liquidités insuffisantes" : `Force la vente des ${num(rest)} parts restantes, payées ${SHARES.raidPremium.toLocaleString("fr-FR")} fois leur prix au propriétaire`} className="inline-flex items-center gap-1.5"><Swords size={13} />Rachat hostile · {compactEur(sharePrice(h.netWorth) * rest * SHARES.raidPremium)}</span>
                        </ConfirmButton>
                      )}
                    </div>
                    <div className="shrink-0 text-right tabular">
                      <div className="text-[13px] font-semibold">{eur(value)}</div>
                      <div className={`text-[11px] ${pnl >= 0 ? "text-success" : "text-danger"}`}>{signedEur(pnl)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted">Vos parts comptent dans votre patrimoine. Elles vous sont payées au prix du jour quand le propriétaire les rachète. Jusqu&apos;à {SHARES.maxLines} villes différentes.
            Avec {num(SHARES.raidFrom)} parts d&apos;une ville, vous pouvez lancer un rachat hostile ; avec {num(SHARES.control)}, vous la contrôlez et touchez un tribut de {Math.round(SHARES.tribute * 100)} % de son flux net.</p>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-[10px] bg-slate-50 p-2.5"><dt className="text-muted">{label}</dt><dd className="font-semibold tabular">{value}</dd></div>;
}
