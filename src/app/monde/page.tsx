"use client";
import { useMemo, useState } from "react";
import { Crown, Globe2, MapPin, Trophy, Users } from "lucide-react";
import { useDerived } from "@/store/game";
import { useWorld, type PublicPlayer } from "@/lib/world/players";
import { HEIGHT, hexPoints, HEX, neighborsOf, pickRegion, WIDTH, WORLD } from "@/lib/world/map";
import { Card, Delta, Empty, PageHeader, Segmented } from "@/components/ui";
import { compactEur, eur, num } from "@/lib/format";

const COLORS = {
  water: "#DCEAF8", waterLine: "#C9DDF2",
  free: "#EEF2F6", freeEdge: "#D5DDE7",
  neutral: "#E4E8EE", neutralEdge: "#94A3B8",
  player: "#B9C6D6", playerEdge: "#64748B",
  me: "#2563EB", meEdge: "#1D4ED8",
  coast: "#9DB8D6",
};
type Tab = "Carte" | "Classement";
type Sort = "Patrimoine" | "Population" | "Bourse";

// Arêtes d'un hexagone « pointe en haut » : 0 = est, puis sens horaire
const EDGE_NEIGHBOR = [0, 5, 4, 1, 2, 3]; // index dans neighborsOf pour chaque arête
function corner(x: number, y: number, i: number) {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [x + HEX * Math.cos(a), y + HEX * Math.sin(a)];
}

export default function WorldPage() {
  const { game, netWorth, city, portfolio, portfolioCost } = useDerived();
  const world = useWorld();
  const [tab, setTab] = useState<Tab>("Carte");
  const [sort, setSort] = useState<Sort>("Patrimoine");

  // Hors ligne (version locale) : on se place soi-même sur la carte
  const players: PublicPlayer[] = useMemo(() => {
    if (world.status === "ready") return world.players;
    return [{
      id: "local", cityName: game.cityName, netWorth, population: game.population, perf: portfolioCost ? portfolio / portfolioCost - 1 : 0,
      day: game.day, region: pickRegion("local", []) ?? 0, updatedAt: game.lastTick, name: game.playerName, color: COLORS.me, isMe: true,
    }];
  }, [world, game, netWorth, portfolio, portfolioCost]);

  const byRegion = useMemo(() => new Map(players.filter((p) => p.region >= 0).map((p) => [p.region, p])), [players]);
  const mine = players.find((p) => p.isMe);
  const [selected, setSelected] = useState<number | null>(null);
  const sel = WORLD.regions[selected ?? mine?.region ?? 0];

  // Frontières : arêtes dont le voisin est d'une autre région (ou la mer)
  const borders = useMemo(() => {
    const inner: string[] = [], coast: string[] = [];
    for (const h of WORLD.hexes) {
      const nb = neighborsOf(h.q, h.r);
      for (let e = 0; e < 6; e++) {
        const [nq, nr] = nb[EDGE_NEIGHBOR[e]];
        const other = WORLD.byKey.get(`${nq},${nr}`);
        if (other && other.region === h.region) continue;
        if (other && other.region < h.region) continue; // une seule fois par arête
        const [x1, y1] = corner(h.x, h.y, e), [x2, y2] = corner(h.x, h.y, e + 1);
        (other ? inner : coast).push(`M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`);
      }
    }
    return { inner: inner.join(""), coast: coast.join("") };
  }, []);

  const selBorder = useMemo(() => {
    const d: string[] = [];
    for (const h of WORLD.hexes) {
      if (h.region !== sel.id) continue;
      const nb = neighborsOf(h.q, h.r);
      for (let e = 0; e < 6; e++) {
        const [nq, nr] = nb[EDGE_NEIGHBOR[e]];
        if (WORLD.byKey.get(`${nq},${nr}`)?.region === h.region) continue;
        const [x1, y1] = corner(h.x, h.y, e), [x2, y2] = corner(h.x, h.y, e + 1);
        d.push(`M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`);
      }
    }
    return d.join("");
  }, [sel.id]);

  const fillOf = (region: number) => {
    const p = byRegion.get(region);
    if (p?.isMe) return COLORS.me;
    if (p) return COLORS.player;
    if (WORLD.regions[region].neutral) return COLORS.neutral;
    return COLORS.free;
  };

  const ranked = [...players].sort((a, b) => sort === "Patrimoine" ? b.netWorth - a.netWorth : sort === "Population" ? b.population - a.population : b.perf - a.perf);
  const myRank = ranked.findIndex((p) => p.isMe) + 1;
  const owner = byRegion.get(sel.id);

  return (
    <>
      <PageHeader icon={Globe2} title="Monde" subtitle="Carte économique des territoires et classement des joueurs">
        <Segmented options={["Carte", "Classement"] as Tab[]} value={tab} onChange={setTab} />
      </PageHeader>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-4">
        <Stat icon={MapPin} label="Votre territoire" value={mine ? WORLD.regions[mine.region]?.name ?? "—" : "—"} sub={game.cityName} />
        <Stat icon={Trophy} label="Votre rang (patrimoine)" value={myRank ? `${myRank}ᵉ` : "—"} sub={`sur ${num(players.length)} joueur${players.length > 1 ? "s" : ""}`} />
        <Stat icon={Users} label="Monde" value={`${num(players.length)} joueur${players.length > 1 ? "s" : ""}`} sub={`${WORLD.regions.filter((r) => r.neutral).length} cités neutres · ${WORLD.regions.length} régions`} />
      </div>

      {tab === "Carte" ? (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
          <Card className="xl:col-span-9 !p-3">
            <div className="overflow-x-auto rounded-[10px]" style={{ background: COLORS.water }}>
              <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[640px] h-auto block" role="img" aria-label="Carte du monde">
                <defs>
                  <pattern id="waves" width="36" height="18" patternUnits="userSpaceOnUse">
                    <path d="M0 9 Q9 4 18 9 T36 9" fill="none" stroke={COLORS.waterLine} strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={WIDTH} height={HEIGHT} fill="url(#waves)" />
                {WORLD.hexes.map((h) => (
                  <polygon key={`${h.q},${h.r}`} points={hexPoints(h.x, h.y, HEX + 0.4)} fill={fillOf(h.region)}
                    onClick={() => setSelected(h.region)} className="cursor-pointer" />
                ))}
                <path d={borders.inner} stroke="#C4CFDC" strokeWidth={1.6} fill="none" pointerEvents="none" strokeLinecap="round" />
                <path d={borders.coast} stroke={COLORS.coast} strokeWidth={2.2} fill="none" pointerEvents="none" strokeLinecap="round" />
                {/* Région sélectionnée : contour */}
                <path d={selBorder} stroke={byRegion.get(sel.id)?.isMe ? COLORS.meEdge : "#0F172A"} strokeWidth={3} fill="none" pointerEvents="none" strokeLinecap="round" />
                {/* Villes */}
                {WORLD.regions.map((r) => {
                  const p = byRegion.get(r.id);
                  if (!p && !r.neutral) return null;
                  const pop = p ? p.population : r.neutral!.population;
                  const rad = 4 + Math.min(8, Math.log10(Math.max(10, pop)) * 1.6);
                  return (
                    <g key={r.id} pointerEvents="none">
                      {r.neutral
                        ? <rect x={r.cx - rad * 0.75} y={r.cy - rad * 0.75} width={rad * 1.5} height={rad * 1.5} transform={`rotate(45 ${r.cx} ${r.cy})`} fill="#FFFFFF" stroke={COLORS.neutralEdge} strokeWidth={2} />
                        : <circle cx={r.cx} cy={r.cy} r={rad} fill="#FFFFFF" stroke={p!.isMe ? COLORS.meEdge : COLORS.playerEdge} strokeWidth={p!.isMe ? 3 : 2} />}
                      <text x={r.cx} y={r.cy + rad + 13} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="Montserrat, sans-serif"
                        fill={p?.isMe ? "#FFFFFF" : "#0F172A"} stroke={p?.isMe ? COLORS.meEdge : "#FFFFFF"} strokeWidth={3} paintOrder="stroke">
                        {p ? p.cityName : r.neutral!.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 px-1 text-[12px] text-muted">
              <Legend color={COLORS.me} label="Votre territoire" />
              <Legend color={COLORS.player} label="Autres joueurs" />
              <Legend color={COLORS.neutral} label="Cités neutres" diamond />
              <Legend color={COLORS.free} label="Régions libres" border />
            </div>
          </Card>

          <Card className="xl:col-span-3" title={sel.name}>
            {owner ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: owner.isMe ? COLORS.me : COLORS.playerEdge }} />
                  <span className="font-semibold">{owner.cityName}</span>
                  {owner.isMe && <span className="text-[10px] font-semibold rounded bg-primary-soft text-primary px-1.5 py-0.5">Vous</span>}
                </div>
                {!owner.isMe && <p className="text-[12px] text-muted mb-3">Dirigée par {owner.name || "un joueur"}</p>}
                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  <Info label="Patrimoine" value={compactEur(owner.netWorth)} />
                  <Info label="Population" value={num(owner.population)} />
                  <Info label="Bourse" value={<Delta value={owner.perf} />} />
                  <Info label="Jour" value={num(owner.day)} />
                </dl>
                {owner.isMe && <p className="text-[11px] text-muted mt-3">Revenus de la ville : {eur(city.net)}/j</p>}
              </>
            ) : sel.neutral ? (
              <>
                <div className="flex items-center gap-2 mb-3"><Crown size={15} className="text-muted" /><span className="font-semibold">{sel.neutral.name}</span></div>
                <p className="text-[12px] text-muted mb-3">Cité neutre, gérée par le jeu.</p>
                <dl className="grid grid-cols-2 gap-2 text-[12px]">
                  <Info label="Spécialité" value={sel.neutral.specialty} />
                  <Info label="Population" value={num(sel.neutral.population)} />
                </dl>
                <p className="text-[11px] text-muted mt-3">Les échanges commerciaux avec les cités arrivent bientôt.</p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-muted">Région libre : {sel.hexes} zones.</p>
                <p className="text-[12px] text-muted mt-2">Chaque nouveau joueur s&apos;installe dans une région libre.</p>
              </>
            )}
            {world.status === "offline" && <p className="text-[11px] text-muted mt-4 pt-3 border-t border-line">Les autres joueurs apparaissent dans la version en ligne du jeu.</p>}
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
                  <th className="text-left font-medium py-2 w-12">#</th><th className="text-left font-medium">Ville</th><th className="text-left font-medium hidden sm:table-cell">Joueur</th>
                  <th className="text-right font-medium">Patrimoine</th><th className="text-right font-medium">Population</th><th className="text-right font-medium">Bourse</th>
                </tr></thead>
                <tbody>
                  {ranked.map((p, i) => (
                    <tr key={p.id} className={`border-b border-line/70 ${p.isMe ? "bg-primary-soft/60" : ""}`}>
                      <td className="py-2.5 font-bold tabular">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                      <td className="font-semibold">{p.cityName}{p.isMe && <span className="ml-2 text-[10px] rounded bg-primary text-white px-1.5 py-0.5">Vous</span>}</td>
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
function Legend({ color, label, diamond, border }: { color: string; label: string; diamond?: boolean; border?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 ${diamond ? "rotate-45 rounded-[2px]" : "rounded-[3px]"}`} style={{ background: color, border: border || diamond ? "1.5px solid #94A3B8" : undefined }} />{label}
    </span>
  );
}
