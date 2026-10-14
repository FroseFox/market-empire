"use client";
// Missions du jour et série de connexions (voir lib/game/daily.ts) : sur l'accueil et dans Ville › Objectifs.
import { CheckCircle2, Flame, Gift, ShieldCheck } from "lucide-react";
import { useGame } from "@/store/game";
import { computeCity } from "@/lib/game/engine";
import { DAILY, giftFor, missionStatuses, missionText } from "@/lib/game/daily";
import { Button, Progress } from "@/components/ui";
import { compactEur, num } from "@/lib/format";

export default function DailyMissions({ compact = false }: { compact?: boolean }) {
  const game = useGame((s) => s.game);
  const claimMission = useGame((s) => s.claimMission);
  const claimDailyBonus = useGame((s) => s.claimDailyBonus);
  const claimGift = useGame((s) => s.claimGift);
  const d = game.daily;
  if (!d) return null;
  const list = missionStatuses(game, computeCity(game));
  const claimed = d.missions.filter((m) => m.claimed).length;
  const gift = giftFor(d.unit, d.streak);
  return (
    <div className="space-y-3">
      {/* Série de connexions et cadeau du jour */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold">
          <Flame size={17} className={d.streak >= 3 ? "text-orange-500" : "text-muted"} />
          Série de {num(d.streak)} jour{d.streak > 1 ? "s" : ""}
        </span>
        <span className="text-[11px] text-muted">record {num(d.best)}</span>
        {d.jokers > 0 && (
          <span title={`Un jour manqué ne casse pas la série (gagné tous les ${DAILY.jokerEvery} jours)`} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
            <ShieldCheck size={12} />Joker
          </span>
        )}
        <span className="ml-auto">
          {d.gift ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success"><CheckCircle2 size={14} />Cadeau encaissé</span>
            : <Button onClick={() => claimGift()} className="inline-flex items-center gap-1.5"><Gift size={14} />Cadeau +{compactEur(gift)}</Button>}
        </span>
      </div>
      {d.saved && !d.gift && <p className="rounded-[10px] bg-primary-soft px-3 py-2 text-[12px] text-primary">Votre joker a sauvé la série : vous aviez manqué un jour.</p>}

      {/* Les trois missions */}
      <ul className="space-y-2.5">
        {list.map(({ mission, index, value, progress, done }) => (
          <li key={index} className={mission.claimed ? "opacity-55" : ""}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium">{missionText(mission)}</div>
                <div className="text-[11px] text-muted">
                  {!done && !mission.claimed && mission.kind !== "joy" && mission.target > 1 ? `${num(Math.max(0, value))} / ${num(mission.target)} · ` : ""}
                  {!done && !mission.claimed && mission.kind === "joy" ? `${value} % aujourd'hui · ` : ""}
                  récompense {compactEur(mission.reward)}
                </div>
              </div>
              {mission.claimed ? <span className="shrink-0 text-[11px] font-semibold text-success">Encaissée</span>
                : done ? <Button onClick={() => claimMission(index)} className="shrink-0">Encaisser</Button>
                : <span className="shrink-0 text-[12px] font-semibold tabular text-muted">{Math.round(progress * 100)} %</span>}
            </div>
            {!mission.claimed && !done && <div className="mt-1.5"><Progress value={progress} tone="bg-primary" /></div>}
          </li>
        ))}
      </ul>

      {/* Bonus des trois */}
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-slate-50 px-3 py-2">
        <span className="text-[12px]">
          <b>Les {DAILY.missions} missions</b> · bonus {compactEur(d.unit * DAILY.bonusUnits)}
          <span className="text-muted"> ({claimed}/{d.missions.length})</span>
        </span>
        {d.bonus ? <span className="text-[11px] font-semibold text-success">Encaissé</span>
          : claimed === d.missions.length ? <Button onClick={() => claimDailyBonus()} variant="success">Encaisser</Button>
          : null}
      </div>
      {!compact && <p className="text-[11px] text-muted">Nouvelles missions et nouveau cadeau chaque jour à minuit. Ouvrez le jeu chaque jour pour allonger la série : le cadeau grossit (jusqu&apos;à ×{DAILY.giftMax}), et un joker tous les {DAILY.jokerEvery} jours pardonne un jour manqué.</p>}
    </div>
  );
}
