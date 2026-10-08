"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Eye, Globe2, MapPin, Plane, Trophy, Users } from "lucide-react";
import { useDerived } from "@/store/game";
import { moveTo } from "@/lib/world/move";
import CityVisit from "@/components/CityVisit";
import TradePanel from "@/components/TradePanel";
import ShareMarket from "@/components/ShareMarket";
import AlliancePanel from "@/components/AlliancePanel";
import { useGame } from "@/store/game";
import { featureOpen, hasDesk } from "@/lib/game/engine";
import { CITIES_PER_COUNTRY, CITY_RANKS, FEATURES } from "@/lib/game/config";
import { HUB_DESK_COST, HUB_FEE_FACTOR } from "@/lib/game/config";
import { useWorld, type PublicPlayer } from "@/lib/world/players";
import { useAuth } from "@/lib/auth";
import { useOnline } from "@/lib/online";
import { STATIC_MODE } from "@/lib/market/client";
import { HUBS, PLAYABLE, countryFull, countryPrice, pickCountry, specialtyText } from "@/lib/world/countries";
import WorldMap, { countryName } from "@/components/WorldMap";
import { Card, ConfirmButton, Delta, Empty, PageHeader, Segmented } from "@/components/ui";
import DiscordButton from "@/components/DiscordButton";
import { compactEur, eur, num } from "@/lib/format";

type Tab = "Carte" | "Commerce" | "Bourse" | "Alliances" | "Classement";
type Sort = "Patrimoine" | "Population" | "Bourse" | "Pays";

export default function WorldPage() {
  const { game, netWorth, city, portfolio, portfolioCost } = useDerived();
  const world = useWorld();
  const [tab, setTab] = useState<Tab>("Carte");
  const [sort, setSort] = useState<Sort>("Patrimoine");

  const auth = useAuth();
  const onlineCountry = useOnline((s) => s.country);

  // Joueurs publiés + moi (chiffres en direct). Sans compte, on se place quand même sur la carte.
  const players: PublicPlayer[] = useMemo(() => {
    const myId = auth.user?.id;
    const others = world.status === "ready" ? world.players.filter((p) => p.country && p.id !== myId && !p.isMe) : [];
    const listed = world.status === "ready" && myId ? world.players.find((p) => p.id === myId) : undefined;
    const taken = others.map((p) => p.country);
    // Mon pays : celui réservé en ligne, sinon celui choisi dans la partie (s'il a encore de la place), sinon un des moins peuplés
    const country = onlineCountry ?? (game.country && PLAYABLE[game.country] && !countryFull(game.country, taken) ? game.country : null) ?? listed?.country ?? pickCountry(auth.user?.id ?? game.playerName ?? "local", taken) ?? "250";
    const me: PublicPlayer = {
      id: listed?.id ?? "local", cityName: game.cityName, netWorth, population: game.population, perf: portfolioCost ? portfolio / portfolioCost - 1 : 0,
      day: game.day, country, updatedAt: game.lastTick, name: auth.user?.name ?? game.playerName, avatar: auth.user?.avatar, color: "#2563EB", isMe: true,
    };
    return [...others, me];
  }, [world, game, netWorth, portfolio, portfolioCost, auth.user, onlineCountry]);

  // Un pays accueille plusieurs villes : on les regroupe, la plus riche d'abord
  const byCountry = useMemo(() => {
    const m = new Map<string, PublicPlayer[]>();
    for (const p of players) m.set(p.country, [...(m.get(p.country) ?? []), p]);
    for (const list of m.values()) list.sort((a, b) => b.netWorth - a.netWorth);
    return m;
  }, [players]);
  // Sur la carte, un repère par pays : ma ville si j'y suis, sinon la plus riche, avec le nombre de villes
  const owners = useMemo(() => [...byCountry].map(([country, list]) => {
    const lead = list.find((p) => p.isMe) ?? list[0];
    return { country, cityName: lead.cityName, isMe: lead.isMe, population: lead.population, name: lead.name, count: list.length };
  }), [byCountry]);
  const nations = useMemo(() => [...byCountry].map(([country, list]) => ({
    country, cities: list.length, netWorth: list.reduce((a, p) => a + p.netWorth, 0), population: list.reduce((a, p) => a + p.population, 0), mine: list.some((p) => p.isMe),
  })).sort((a, b) => b.netWorth - a.netWorth), [byCountry]);
  const mine = players.find((p) => p.isMe);
  const [selected, setSelected] = useState<string | null>(null);
  const selId = selected ?? mine?.country ?? "250";
  const cities = byCountry.get(selId) ?? [];
  const here = mine?.country === selId;
  const full = cities.length >= CITIES_PER_COUNTRY;
  const nation = nations.find((n) => n.country === selId);
  const hubs = HUBS.filter((h) => h.country === selId);
  const [visiting, setVisiting] = useState<PublicPlayer | null>(null);
  const [moving, setMoving] = useState(false);
  const openDesk = useGame((s) => s.openDesk);
  // Pour les frais de courtage et la spécialité, c'est le pays affiché ici qui compte
  const me = { ...game, country: mine?.country ?? game.country };
  const specialty = PLAYABLE[selId] ? specialtyText(selId) : null;
  const price = PLAYABLE[selId] ? countryPrice(selId) : 0;
  const move = async () => {
    if (!mine || moving) return;
    setMoving(true);
    await moveTo(selId, mine.country, players.filter((p) => !p.isMe).map((p) => p.country));
    setMoving(false);
  };

  // La carte montre tous les joueurs ; le classement écarte les sauvegardes signalées comme impossibles
  const inRanking = players.filter((p) => p.isMe || p.ranked !== false);
  const ranked = [...inRanking].sort((a, b) => sort === "Patrimoine" ? b.netWorth - a.netWorth : sort === "Population" ? b.population - a.population : b.perf - a.perf);
  const myRank = [...inRanking].sort((a, b) => b.netWorth - a.netWorth).findIndex((p) => p.isMe) + 1;

  return (
    <>
      <PageHeader icon={Globe2} title="Monde" subtitle="Carte économique des territoires et classement des joueurs">
        <Segmented options={(featureOpen(game, "trade") ? ["Carte", "Commerce", "Bourse", "Alliances", "Classement"] : ["Carte", "Bourse", "Alliances", "Classement"]) as Tab[]} value={tab} onChange={setTab} />
      </PageHeader>

      <div className="grid gap-2 sm:gap-4 grid-cols-3 mb-4">
        <Stat icon={MapPin} label="Votre territoire" value={mine ? countryName(mine.country) : "—"}
          sub={mine && PLAYABLE[mine.country] ? specialtyText(mine.country) : game.cityName} />
        <Stat icon={Trophy} label="Votre rang" value={myRank ? `${myRank}ᵉ` : "—"} sub={`sur ${num(inRanking.length)} joueur${inRanking.length > 1 ? "s" : ""} classé${inRanking.length > 1 ? "s" : ""}`} />
        <Stat icon={Users} label="Monde" value={`${num(players.length)} joueur${players.length > 1 ? "s" : ""}`} sub={`${Object.keys(PLAYABLE).length} pays · ${CITIES_PER_COUNTRY} villes par pays`} />
      </div>

      {tab === "Carte" ? (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 items-start">
          <Card className="xl:col-span-9 !p-3">
            <WorldMap owners={owners} selected={selId} onSelect={setSelected} focus={mine?.country} />
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 px-1 text-[12px] text-muted">
              <Legend color="#2563EB" label="Votre territoire" />
              <Legend color="#C7D7E8" label="Pays habités" />
              <Legend color="#FBFCFE" label="Pays sans ville" border />
              <Legend color="#E7ECF2" label="Non jouables" />
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-500" />Places financières</span>
              <span className="ml-auto hidden sm:inline">Molette ou pincement : zoom · Glisser : se déplacer · Double-clic : zoomer</span>
            </div>
          </Card>

          <Card className="xl:col-span-3" title={countryName(selId)}>
            {PLAYABLE[selId] ? (
              <>
                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  {specialty && <div className="col-span-2"><Info label="Spécialité du pays" value={specialty} /></div>}
                  <Info label="Villes" value={<span className={full ? "text-warning" : ""}>{cities.length} / {CITIES_PER_COUNTRY}</span>} />
                  <Info label="Prix d'installation" value={compactEur(price)} />
                  {nation && <Info label="Patrimoine du pays" value={compactEur(nation.netWorth)} />}
                  {nation && <Info label="Population" value={num(nation.population)} />}
                </dl>
                <p className="mt-2 text-[11px] text-muted">Toutes les villes du pays profitent de sa spécialité.</p>

                {cities.length > 0 && (
                  <ul className="mt-3 max-h-[260px] divide-y divide-line overflow-y-auto rounded-[10px] border border-line">
                    {cities.map((p, i) => (
                      <li key={p.id} className={`flex items-center gap-2 px-2.5 py-2 ${p.isMe ? "bg-primary-soft/60" : ""}`}>
                        <span className="w-4 shrink-0 text-center text-[11px] font-bold tabular text-muted">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                            <span className="truncate">{p.cityName}</span>
                            {p.isMe && <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">Vous</span>}
                          </div>
                          <div className="truncate text-[11px] text-muted tabular">{p.isMe ? "" : `${p.name || "Joueur"} · `}{compactEur(p.netWorth)} · {num(p.population)} hab.</div>
                        </div>
                        {p.isMe
                          ? <Link href="/ville" aria-label="Ouvrir ma ville" title="Ouvrir ma ville" className="shrink-0 rounded-[8px] p-1.5 text-primary hover:bg-white"><Eye size={16} /></Link>
                          : <button onClick={() => setVisiting(p)} aria-label={`Visiter ${p.cityName}`} title="Visiter la ville" className="shrink-0 rounded-[8px] p-1.5 text-muted hover:bg-slate-100 hover:text-primary"><Eye size={16} /></button>}
                      </li>
                    ))}
                  </ul>
                )}

                {here ? (
                  <p className="mt-3 text-[11px] text-muted">Votre ville est ici · revenus {eur(city.net)}/j. Pour déménager, choisissez un autre pays sur la carte.</p>
                ) : full ? (
                  <p className="mt-3 text-[12px] text-muted">Pays complet : ses {CITIES_PER_COUNTRY} places sont prises.</p>
                ) : (
                  <>
                    <ConfirmButton onConfirm={move} disabled={moving || game.cash < price} confirmLabel={`Confirmer : payer ${compactEur(price)}`}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                      <Plane size={15} />{moving ? "Déménagement…" : "Déménager ici"}
                    </ConfirmButton>
                    <p className="mt-2 text-[11px] text-muted">
                      {game.cash < price ? `Liquidités insuffisantes : il vous manque ${compactEur(price - game.cash)}.` : "Votre ville garde tous ses bâtiments et ses habitants. Le prix est débité de vos liquidités."}
                    </p>
                  </>
                )}
              </>
            ) : (
              <p className="text-[13px] text-muted">Pays non jouable pour l&apos;instant.</p>
            )}
            {hubs.map((h) => {
              const desk = hasDesk(me, h), local = h.country === me.country;
              return (
                <div key={h.name} className="mt-4 rounded-[10px] border border-line p-3">
                  <div className="flex items-center gap-2 font-semibold text-[13px]"><Crown size={14} className="text-muted" />{h.name}</div>
                  <p className="text-[12px] text-muted mt-1">Place financière · {h.covers}</p>
                  <p className="text-[12px] mt-1">Un bureau ici réduit les frais de courtage de {Math.round((1 - HUB_FEE_FACTOR) * 100)} % sur ces actifs.</p>
                  {desk ? <p className="mt-2 text-[12px] font-semibold text-success">{local ? "Bureau offert : votre ville est dans ce pays" : "Bureau ouvert"}</p>
                    : !featureOpen(game, "hubs") ? <p className="mt-2 text-[12px] text-muted">Ouverture d&apos;un bureau à partir du rang « {CITY_RANKS[FEATURES.find((f) => f.id === "hubs")!.rank].name} ».</p> : (
                    <ConfirmButton onConfirm={() => openDesk(h.name)} disabled={game.cash < HUB_DESK_COST} confirmLabel={`Confirmer : payer ${compactEur(HUB_DESK_COST)}`}
                      className="mt-2 w-full rounded-[10px] border border-line bg-card px-3 py-2 text-[13px] font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                      Ouvrir un bureau · {compactEur(HUB_DESK_COST)}
                    </ConfirmButton>
                  )}
                </div>
              );
            })}
            {!STATIC_MODE && auth.status !== "in" && (
              <div className="mt-4 pt-3 border-t border-line">
                <p className="text-[12px] text-muted mb-2">Connectez-vous pour réserver votre pays et apparaître au classement.</p>
                <DiscordButton small />
              </div>
            )}
          </Card>
        </div>
      ) : tab === "Commerce" ? <TradePanel /> : tab === "Bourse" ? <ShareMarket players={players} /> : tab === "Alliances" ? <AlliancePanel players={players} /> : (
        <Card>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-[16px] font-semibold flex items-center gap-2"><Trophy size={18} className="text-primary" />Classement</h2>
            <Segmented options={["Patrimoine", "Population", "Bourse", "Pays"] as Sort[]} value={sort} onChange={setSort} />
          </div>
          {sort === "Pays" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-muted text-[12px]"><tr className="border-b border-line">
                  <th className="text-left font-medium py-2 w-12">#</th><th className="text-left font-medium">Pays</th><th className="text-left font-medium hidden md:table-cell">Spécialité</th>
                  <th className="text-right font-medium">Villes</th><th className="text-right font-medium">Patrimoine</th><th className="text-right font-medium hidden sm:table-cell">Population</th>
                </tr></thead>
                <tbody>
                  {nations.map((n, i) => (
                    <tr key={n.country} className={`cursor-pointer border-b border-line/70 hover:bg-slate-50 ${n.mine ? "bg-primary-soft/60" : ""}`} onClick={() => { setSelected(n.country); setTab("Carte"); }} title="Voir ce pays sur la carte">
                      <td className="py-2.5 font-bold tabular">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                      <td className="font-semibold">{countryName(n.country)}{n.mine && <span className="ml-2 text-[10px] rounded bg-primary text-white px-1.5 py-0.5">Le vôtre</span>}</td>
                      <td className="text-muted hidden md:table-cell">{specialtyText(n.country)}</td>
                      <td className="text-right tabular">{n.cities} / {CITIES_PER_COUNTRY}</td>
                      <td className="text-right tabular font-semibold">{eur(n.netWorth)}</td>
                      <td className="text-right tabular hidden sm:table-cell">{num(n.population)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : ranked.length === 0 ? <Empty>Aucun joueur pour l&apos;instant.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-muted text-[12px]"><tr className="border-b border-line">
                  <th className="text-left font-medium py-2 w-12">#</th><th className="text-left font-medium">Ville</th><th className="text-left font-medium hidden md:table-cell">Pays</th><th className="text-left font-medium hidden sm:table-cell">Joueur</th>
                  <th className="text-right font-medium">Patrimoine</th><th className="text-right font-medium">Population</th><th className="text-right font-medium">Bourse</th><th className="w-10"><span className="sr-only">Visiter</span></th>
                </tr></thead>
                <tbody>
                  {ranked.map((p, i) => (
                    <tr key={p.id} className={`border-b border-line/70 ${p.isMe ? "bg-primary-soft/60" : ""}`}>
                      <td className="py-2.5 font-bold tabular">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                      <td className="font-semibold">{p.cityName}{p.isMe && <span className="ml-2 text-[10px] rounded bg-primary text-white px-1.5 py-0.5">Vous</span>}</td>
                      <td className="text-muted hidden md:table-cell">{countryName(p.country)}</td>
                      <td className="text-muted hidden sm:table-cell">
                        <span className="inline-flex items-center gap-2">
                          {p.avatar
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={p.avatar} alt="" width={22} height={22} loading="lazy" className="h-[22px] w-[22px] rounded-full" />
                            : <span className="h-[22px] w-[22px] rounded-full bg-slate-200 grid place-items-center text-[10px] font-semibold text-slate-600">{(p.name || "?")[0]}</span>}
                          {p.name || "—"}
                        </span>
                      </td>
                      <td className="text-right tabular font-semibold">{eur(p.netWorth)}</td>
                      <td className="text-right tabular">{num(p.population)}</td>
                      <td className="text-right"><Delta value={p.perf} /></td>
                      <td className="text-right">
                        {!p.isMe && <button onClick={() => setVisiting(p)} aria-label={`Visiter ${p.cityName}`} title="Visiter la ville" className="rounded-[8px] p-1.5 text-muted hover:bg-slate-100 hover:text-primary"><Eye size={16} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted mt-3">Le classement ne montre que le nom du compte et ce que chaque joueur publie : nom de ville, patrimoine, population et performance boursière. Mis à jour toutes les 5 minutes.</p>
          {!STATIC_MODE && auth.status !== "in" && <div className="mt-3"><DiscordButton small /></div>}
        </Card>
      )}
      {visiting && <CityVisit player={visiting} onClose={() => setVisiting(null)} />}
    </>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Globe2; label: string; value: string; sub: string }) {
  return (
    <div className="card p-3 sm:p-4 flex items-center gap-3 appear min-w-0">
      <span className="hidden sm:grid h-10 w-10 rounded-full bg-primary-soft text-primary place-items-center shrink-0"><Icon size={18} /></span>
      <div className="min-w-0"><div className="text-[11px] sm:text-[12px] text-muted truncate">{label}</div><div className="text-[15px] sm:text-[18px] font-bold truncate">{value}</div><div className="text-[10px] sm:text-[11px] text-muted truncate">{sub}</div></div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-[10px] bg-slate-50 p-2.5"><dt className="text-muted">{label}</dt><dd className="font-semibold tabular">{value}</dd></div>;
}
function Legend({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-[3px]" style={{ background: color, border: border ? "1.5px solid #94A3B8" : undefined }} />{label}
    </span>
  );
}
