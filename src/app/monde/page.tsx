"use client";
import { useMemo, useState } from "react";
import { Crown, Globe2, MapPin, Trophy, Users } from "lucide-react";
import { useDerived } from "@/store/game";
import { useWorld, type PublicPlayer } from "@/lib/world/players";
import { HUBS, PLAYABLE, pickCountry } from "@/lib/world/countries";
import WorldMap, { countryName } from "@/components/WorldMap";
import { Card, Delta, Empty, PageHeader, Segmented } from "@/components/ui";
import { compactEur, eur, num } from "@/lib/format";

type Tab = "Carte" | "Classement";
type Sort = "Patrimoine" | "Population" | "Bourse";

export default function WorldPage() {
  const { game, netWorth, city, portfolio, portfolioCost } = useDerived();
  const world = useWorld();
  const [tab, setTab] = useState<Tab>("Carte");
  const [sort, setSort] = useState<Sort>("Patrimoine");

  // Hors ligne (site sans base de joueurs) : on se place soi-même sur la carte
  const players: PublicPlayer[] = useMemo(() => {
    if (world.status === "ready") return world.players.filter((p) => p.country);
    return [{
      id: "local", cityName: game.cityName, netWorth, population: game.population, perf: portfolioCost ? portfolio / portfolioCost - 1 : 0,
      day: game.day, country: pickCountry(game.playerName || "local", []) ?? "250", updatedAt: game.lastTick, name: game.playerName, color: "#2563EB", isMe: true,
    }];
  }, [world, game, netWorth, portfolio, portfolioCost]);

  const byCountry = useMemo(() => new Map(players.map((p) => [p.country, p])), [players]);
  const mine = players.find((p) => p.isMe);
  const [selected, setSelected] = useState<string | null>(null);
  const selId = selected ?? mine?.country ?? "250";
  const owner = byCountry.get(selId);
  const hubs = HUBS.filter((h) => h.country === selId);

  const ranked = [...players].sort((a, b) => sort === "Patrimoine" ? b.netWorth - a.netWorth : sort === "Population" ? b.population - a.population : b.perf - a.perf);
  const myRank = [...players].sort((a, b) => b.netWorth - a.netWorth).findIndex((p) => p.isMe) + 1;

  return (
    <>
      <PageHeader icon={Globe2} title="Monde" subtitle="Carte économique des territoires et classement des joueurs">
        <Segmented options={["Carte", "Classement"] as Tab[]} value={tab} onChange={setTab} />
      </PageHeader>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-4">
        <Stat icon={MapPin} label="Votre territoire" value={mine ? countryName(mine.country) : "—"} sub={game.cityName} />
        <Stat icon={Trophy} label="Votre rang (patrimoine)" value={myRank ? `${myRank}ᵉ` : "—"} sub={`sur ${num(players.length)} joueur${players.length > 1 ? "s" : ""}`} />
        <Stat icon={Users} label="Monde" value={`${num(players.length)} joueur${players.length > 1 ? "s" : ""}`} sub={`${Object.keys(PLAYABLE).length} pays jouables · ${HUBS.length} places financières`} />
      </div>

      {tab === "Carte" ? (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 items-start">
          <Card className="xl:col-span-9 !p-3">
            <WorldMap owners={players.map((p) => ({ country: p.country, cityName: p.cityName, isMe: p.isMe, population: p.population }))} selected={selId} onSelect={setSelected} />
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 px-1 text-[12px] text-muted">
              <Legend color="#2563EB" label="Votre territoire" />
              <Legend color="#A9B8CB" label="Autres joueurs" />
              <Legend color="#E3E9F0" label="Pays libres" border />
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 border-[1.5px] border-slate-500 bg-white" />Places financières</span>
              <span className="ml-auto">Glissez pour vous déplacer, + / − pour zoomer</span>
            </div>
          </Card>

          <Card className="xl:col-span-3" title={countryName(selId)}>
            {owner ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: owner.isMe ? "#2563EB" : "#64748B" }} />
                  <span className="font-semibold">{owner.cityName}</span>
                  {owner.isMe && <span className="text-[10px] font-semibold rounded bg-primary-soft text-primary px-1.5 py-0.5">Vous</span>}
                </div>
                {!owner.isMe && <p className="text-[12px] text-muted mb-3">Dirigé par {owner.name || "un joueur"}</p>}
                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  <Info label="Patrimoine" value={compactEur(owner.netWorth)} />
                  <Info label="Population" value={num(owner.population)} />
                  <Info label="Bourse" value={<Delta value={owner.perf} />} />
                  <Info label="Jour" value={num(owner.day)} />
                </dl>
                {owner.isMe && <p className="text-[11px] text-muted mt-3">Revenus de la ville : {eur(city.net)}/j</p>}
              </>
            ) : (
              <p className="text-[13px] text-muted">{PLAYABLE[selId] ? "Pays libre : un nouveau joueur peut s'y installer." : "Pays non jouable pour l'instant."}</p>
            )}
            {hubs.map((h) => (
              <div key={h.name} className="mt-4 rounded-[10px] border border-line p-3">
                <div className="flex items-center gap-2 font-semibold text-[13px]"><Crown size={14} className="text-muted" />{h.name}</div>
                <p className="text-[12px] text-muted mt-1">Place financière neutre · {h.specialty}</p>
                <p className="text-[11px] text-muted mt-1">Les échanges avec les places financières arrivent bientôt.</p>
              </div>
            ))}
            {world.status === "offline" && <p className="text-[11px] text-muted mt-4 pt-3 border-t border-line">Les autres joueurs apparaîtront quand les comptes en ligne seront branchés.</p>}
          </Card>
        </div>
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-[16px] font-semibold flex items-center gap-2"><Trophy size={18} className="text-primary" />Classement</h2>
            <Segmented options={["Patrimoine", "Population", "Bourse"] as Sort[]} value={sort} onChange={setSort} />
          </div>
          {ranked.length === 0 ? <Empty>Aucun joueur pour l&apos;instant.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-muted text-[12px]"><tr className="border-b border-line">
                  <th className="text-left font-medium py-2 w-12">#</th><th className="text-left font-medium">Ville</th><th className="text-left font-medium hidden md:table-cell">Pays</th><th className="text-left font-medium hidden sm:table-cell">Joueur</th>
                  <th className="text-right font-medium">Patrimoine</th><th className="text-right font-medium">Population</th><th className="text-right font-medium">Bourse</th>
                </tr></thead>
                <tbody>
                  {ranked.map((p, i) => (
                    <tr key={p.id} className={`border-b border-line/70 ${p.isMe ? "bg-primary-soft/60" : ""}`}>
                      <td className="py-2.5 font-bold tabular">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                      <td className="font-semibold">{p.cityName}{p.isMe && <span className="ml-2 text-[10px] rounded bg-primary text-white px-1.5 py-0.5">Vous</span>}</td>
                      <td className="text-muted hidden md:table-cell">{countryName(p.country)}</td>
                      <td className="text-muted hidden sm:table-cell">{p.name || "—"}</td>
                      <td className="text-right tabular font-semibold">{eur(p.netWorth)}</td>
                      <td className="text-right tabular">{num(p.population)}</td>
                      <td className="text-right"><Delta value={p.perf} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted mt-3">Le classement ne montre que ce que chaque joueur publie : nom de ville, patrimoine, population et performance boursière.</p>
        </Card>
      )}
    </>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Globe2; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4 flex items-center gap-3 appear">
      <span className="h-10 w-10 rounded-full bg-primary-soft text-primary grid place-items-center shrink-0"><Icon size={18} /></span>
      <div className="min-w-0"><div className="text-[12px] text-muted">{label}</div><div className="text-[18px] font-bold truncate">{value}</div><div className="text-[11px] text-muted truncate">{sub}</div></div>
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
