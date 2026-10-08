"use client";
// Alliances : quelques villes qui s'associent. La caisse commune ne se retire pas, elle fait monter le niveau
// de l'alliance, qui donne un bonus à tous ses membres ; les contrats de commerce entre alliés sont plus avantageux.
import { useEffect, useState } from "react";
import { Crown, Lock, Shield, Swords, Users } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { useAuth } from "@/lib/auth";
import { contributeAlliance, createAlliance, declareBlockade, joinAlliance, leaveAlliance, syncAlliance, type AllianceRow } from "@/lib/online";
import { rest, STATIC_MODE } from "@/lib/market/client";
import { ALLIANCE, BLOCKADE, CITY_RANKS, CONTRACT_RATIO, FEATURES } from "@/lib/game/config";
import { allianceLevel, featureOpen } from "@/lib/game/engine";
import { refreshWorld, type PublicPlayer } from "@/lib/world/players";
import { Button, Card, ConfirmButton, Empty, Progress } from "@/components/ui";
import { compactEur, eur, num, pctPlain } from "@/lib/format";

const QUERY = "alliances?select=id,name,tag,leader,treasury,blockade_target,blockade_until,shield_until&order=treasury.desc&limit=200";
const until = (ms: number) => new Date(ms).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const GIFTS = [10_000, 100_000, 1_000_000] as const;
const bonusOf = (treasury: number) => allianceLevel(treasury) * ALLIANCE.bonusPerLevel;
const MAX_LEVEL = ALLIANCE.levels.length - 1;

export default function AlliancePanel({ players }: { players: PublicPlayer[] }) {
  const { game } = useDerived();
  const notify = useGame((s) => s.notify);
  const auth = useAuth();
  const online = !STATIC_MODE && auth.status === "in";
  // undefined = chargement, null = alliances indisponibles
  const [list, setList] = useState<AllianceRow[] | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  // Heure d'ouverture du panneau : sert à savoir quelles protections contre un blocus courent encore
  const [now] = useState(() => Date.now());
  const [tag, setTag] = useState("");

  const load = (fresh: boolean) => Promise.all([rest<AllianceRow[]>(QUERY, fresh ? 0 : 30_000), syncAlliance()]).then(([rows, ok]) => (ok ? rows : null));
  useEffect(() => {
    if (!online) return;
    let alive = true;
    load(false).then((rows) => { if (alive) setList(rows); });
    return () => { alive = false; };
  }, [online]);

  if (!online) return <Card><Empty>Les alliances sont disponibles sur le site publié, une fois connecté.</Empty></Card>;
  if (list === undefined) return <Card><Empty>Chargement des alliances…</Empty></Card>;
  if (list === null) return <Card><Empty>Alliances indisponibles pour le moment.</Empty></Card>;

  const open = featureOpen(game, "alliances") && game.population >= ALLIANCE.minPop;
  const minRank = CITY_RANKS[FEATURES.find((f) => f.id === "alliances")!.rank].name;
  const mine = game.alliance;
  const membersOf = (id: string) => players.filter((p) => p.alliance === id || (p.isMe && mine?.id === id));
  const act = async (run: () => Promise<boolean>, okText: string, koText: string) => {
    if (busy) return;
    setBusy(true);
    try { const ok = await run(); notify(ok ? okText : koText, ok ? "ok" : "error"); } catch { notify("Alliances indisponibles pour le moment, réessayez plus tard.", "error"); }
    refreshWorld();
    setList(await load(true));
    setBusy(false);
  };

  const cleanTag = tag.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const nameOk = /^[\p{L}\p{N}][\p{L}\p{N} '-]{1,22}[\p{L}\p{N}]$/u.test(name.trim());
  const createWhy = !open ? `À partir du rang « ${minRank} »` : !nameOk ? "Nom : 3 à 24 lettres ou chiffres" : cleanTag.length < 2 ? "Sigle : 2 à 4 lettres ou chiffres" : game.cash < ALLIANCE.cost ? "Liquidités insuffisantes" : null;

  const level = mine ? allianceLevel(mine.treasury) : 0;
  const next = ALLIANCE.levels[level + 1];
  const roster = mine ? membersOf(mine.id).sort((a, b) => (b.allianceGift ?? 0) - (a.allianceGift ?? 0)) : [];

  return (
    <div className="grid items-start gap-4 grid-cols-1 xl:grid-cols-12">
      <div className="grid gap-4 xl:col-span-5">
        {mine ? (
          <Card title={`[${mine.tag}] ${mine.name}`} icon={Shield}
            extra={<span className="text-[12px] text-muted">Niveau <b className="tabular text-ink">{level}</b> sur {MAX_LEVEL}</span>}>
            <dl className="grid grid-cols-3 gap-2 text-[12px]">
              <Info label="Bonus de revenus" value={`+${pctPlain(bonusOf(mine.treasury))}`} />
              <Info label="Caisse commune" value={compactEur(mine.treasury)} />
              <Info label="Membres" value={`${mine.members.length} / ${ALLIANCE.maxMembers}`} />
            </dl>
            {next !== undefined ? (
              <div className="mt-3">
                <Progress value={(mine.treasury - ALLIANCE.levels[level]) / (next - ALLIANCE.levels[level])} tone="bg-primary" />
                <p className="mt-1 text-[11px] text-muted tabular">Niveau {level + 1} à {compactEur(next)} : bonus de +{pctPlain((level + 1) * ALLIANCE.bonusPerLevel)}. Il manque {compactEur(next - mine.treasury)}.</p>
              </div>
            ) : <p className="mt-3 text-[12px] font-semibold text-success">Niveau maximal atteint.</p>}
            <p className="mt-3 text-[12px] text-muted">
              Ce que vous versez ne se retire pas : la caisse fait monter le niveau, et le bonus s&apos;applique aux revenus des bâtiments de tous les membres.
              Vous avez versé <b className="tabular text-ink">{eur(mine.gift)}</b>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {GIFTS.map((g) => (
                <ConfirmButton key={g} disabled={busy || game.cash < g} confirmLabel={`Confirmer : ${compactEur(g)}`}
                  onConfirm={() => act(() => contributeAlliance(g), `${eur(g)} versés à la caisse commune`, "Versement refusé.")}
                  className="rounded-[10px] border border-line bg-card px-3 py-2 text-[13px] font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                  Verser {compactEur(g)}
                </ConfirmButton>
              ))}
            </div>
            <ul className="mt-3 divide-y divide-line rounded-[10px] border border-line">
              {roster.map((p) => (
                <li key={p.id} className={`flex items-center gap-2 px-2.5 py-2 ${p.isMe ? "bg-primary-soft/60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                      <span className="truncate">{p.cityName}</span>
                      {(mine.leader === p.id || (p.isMe && mine.leader === auth.user?.id)) && <Crown size={13} className="shrink-0 text-amber-500" aria-label="Chef de l'alliance" />}
                      {p.isMe && <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">Vous</span>}
                    </div>
                    <div className="truncate text-[11px] text-muted tabular">{p.isMe ? "" : `${p.name || "Joueur"} · `}{compactEur(p.netWorth)} · a versé {compactEur(p.isMe ? mine.gift : p.allianceGift ?? 0)}</div>
                  </div>
                </li>
              ))}
            </ul>
            {(mine.blockadedBy || mine.blockading || mine.shieldUntil) && (
              <ul className="mt-3 space-y-1.5 text-[12px]">
                {mine.blockadedBy && <li className="rounded-[10px] bg-danger-soft px-3 py-2 text-red-700"><b>Sous blocus</b> de [{mine.blockadedBy.tag}] jusqu&apos;à {until(mine.blockadedBy.until)} : vos surplus s&apos;exportent {Math.round(BLOCKADE.targetLoss * 100)} points moins cher.</li>}
                {mine.blockading && <li className="rounded-[10px] bg-primary-soft px-3 py-2 text-primary"><b>Blocus en cours</b> contre [{mine.blockading.tag}] jusqu&apos;à {until(mine.blockading.until)} : vos surplus s&apos;exportent {Math.round(BLOCKADE.attackerGain * 100)} points plus cher.</li>}
                {mine.shieldUntil && !mine.blockadedBy && <li className="rounded-[10px] bg-slate-50 px-3 py-2 text-muted">Protégée contre un nouveau blocus jusqu&apos;à {until(mine.shieldUntil)}.</li>}
              </ul>
            )}
            <ConfirmButton disabled={busy} confirmLabel="Confirmer : quitter l'alliance"
              onConfirm={() => act(leaveAlliance, "Vous avez quitté l'alliance", "Impossible de quitter l'alliance pour le moment.")}
              className="mt-3 text-[12px] font-semibold text-danger hover:underline disabled:opacity-40">Quitter l&apos;alliance</ConfirmButton>
          </Card>
        ) : (
          <Card title="Fonder une alliance" icon={Shield}>
            <p className="text-[12px] text-muted">
              Jusqu&apos;à {ALLIANCE.maxMembers} villes. Chaque niveau de la caisse commune ajoute +{pctPlain(ALLIANCE.bonusPerLevel)} aux revenus des bâtiments de tous les membres,
              et les contrats de commerce entre alliés se font à de meilleurs prix.
            </p>
            {!open && (
              <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-dashed border-line px-3 py-2.5 text-[12px] text-muted">
                <Lock size={14} className="shrink-0" />Les alliances s&apos;ouvrent au rang « {minRank} » ({num(ALLIANCE.minPop)} habitants).
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Nom de l'alliance" aria-label="Nom de l'alliance"
                className="min-w-[150px] flex-1 rounded-[8px] border border-line px-2.5 py-1.5 text-[14px] outline-none focus:border-primary" />
              <input value={cleanTag} onChange={(e) => setTag(e.target.value)} placeholder="SIGLE" aria-label="Sigle (2 à 4 caractères)"
                className="w-24 rounded-[8px] border border-line px-2.5 py-1.5 text-[14px] uppercase tabular outline-none focus:border-primary" />
            </div>
            <Button className="mt-3 w-full" disabled={busy || !!createWhy}
              onClick={() => act(() => createAlliance(name.trim(), cleanTag, ALLIANCE.cost), `Alliance fondée : [${cleanTag}] ${name.trim()}`, "Ce nom ou ce sigle est déjà pris, ou n'est pas accepté.")}>
              Fonder · {compactEur(ALLIANCE.cost)}
            </Button>
            {createWhy && <p className="mt-2 text-center text-[11px] text-muted">{createWhy}</p>}
          </Card>
        )}

        <Card title="Ce qu'une alliance apporte">
          <ul className="list-disc space-y-1.5 pl-5 text-[12px] text-muted">
            <li>Contrats entre alliés : le vendeur touche {pctPlain(ALLIANCE.contract.sell)} du prix plein et l&apos;acheteur paie {pctPlain(ALLIANCE.contract.buy)}, au lieu de {pctPlain(CONTRACT_RATIO)} des deux côtés.</li>
            <li>Niveaux de la caisse : {ALLIANCE.levels.slice(1).map((n, i) => `${compactEur(n)} → +${pctPlain((i + 1) * ALLIANCE.bonusPerLevel)}`).join(" · ")}.</li>
            <li>Quitter une alliance est libre ; ce que vous avez versé reste dans sa caisse.</li>
            <li><b>Blocus</b> : le chef peut bloquer le commerce d&apos;une autre alliance pendant {BLOCKADE.days} jours réels, pour {compactEur(BLOCKADE.cost)} pris dans la caisse (le niveau peut baisser). Les villes bloquées exportent {Math.round(BLOCKADE.targetLoss * 100)} points moins cher, puis sont protégées {BLOCKADE.shieldDays} jours.</li>
          </ul>
        </Card>
      </div>

      <Card className="xl:col-span-7" title={`Alliances (${list.length})`} icon={Users}>
        {list.length === 0 ? <Empty>Aucune alliance pour l&apos;instant. Fondez la première.</Empty> : (
          <ul className="divide-y divide-line">
            {list.map((a, i) => {
              const members = membersOf(a.id), n = members.length, isMine = mine?.id === a.id;
              const why = !open ? `À partir du rang « ${minRank} »` : n >= ALLIANCE.maxMembers ? "Alliance complète" : null;
              // Guerre économique : seul le chef déclare un blocus, payé par la caisse commune
              const shielded = !!a.shield_until && Date.parse(a.shield_until) > now;
              const cant = !mine || isMine ? null
                : mine.leader !== auth.user?.id ? "Seul le chef de votre alliance peut déclarer un blocus"
                : mine.blockading ? "Votre alliance mène déjà un blocus"
                : mine.treasury < BLOCKADE.cost ? `Il faut ${compactEur(BLOCKADE.cost)} dans la caisse commune`
                : shielded ? "Cette alliance est protégée pour l'instant" : "";
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <span className="w-5 shrink-0 text-center text-[12px] font-bold tabular text-muted">{i + 1}</span>
                  <div className="min-w-[160px] flex-1">
                    <div className="truncate text-[13px] font-semibold"><span className="text-primary">[{a.tag}]</span> {a.name}{isMine && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">La vôtre</span>}</div>
                    <div className="text-[11px] text-muted tabular">
                      Niveau {allianceLevel(Number(a.treasury))} · +{pctPlain(bonusOf(Number(a.treasury)))} · caisse {compactEur(Number(a.treasury))} · {n} / {ALLIANCE.maxMembers} villes
                      {n > 0 && <> · patrimoine {compactEur(members.reduce((s, p) => s + p.netWorth, 0))}</>}
                    </div>
                  </div>
                  {cant !== null && (
                    <ConfirmButton disabled={busy || cant !== ""} confirmLabel={`Confirmer : ${compactEur(BLOCKADE.cost)} de la caisse`}
                      onConfirm={() => act(() => declareBlockade(a.id), `Blocus déclaré contre [${a.tag}] ${a.name}`, "Blocus refusé : la situation a changé.")}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-line px-3 py-2 text-[12px] font-semibold text-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                      <span title={cant || `Leurs surplus s'exportent ${Math.round(BLOCKADE.targetLoss * 100)} points moins cher pendant ${BLOCKADE.days} jours réels`} className="inline-flex items-center gap-1.5"><Swords size={14} />Blocus</span>
                    </ConfirmButton>
                  )}
                  {!mine && (
                    <Button variant="secondary" disabled={busy || !!why} title={why ?? undefined} className="shrink-0 !px-3"
                      onClick={() => act(() => joinAlliance(a.id), `Vous avez rejoint [${a.tag}] ${a.name}`, "Impossible de rejoindre : l'alliance vient de se remplir.")}>
                      {why ?? "Rejoindre"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-[10px] bg-slate-50 p-2.5"><dt className="text-muted">{label}</dt><dd className="font-semibold tabular">{value}</dd></div>;
}
