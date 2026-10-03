"use client";
// Visite de la ville d'un autre joueur : même vue isométrique que la sienne, en lecture seule.
// Les chiffres sont recalculés à partir du plan publié et de la population affichée au classement.
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Building2, Smile, Users, Wallet, Wheat, X, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import IsoCity from "@/components/IsoCity";
import { CITY_RANKS } from "@/lib/game/config";
import { computeCity } from "@/lib/game/engine";
import type { Plot } from "@/lib/game/layout";
import { fetchCity, type PublicPlayer } from "@/lib/world/players";
import { PLAYABLE } from "@/lib/world/countries";
import { compactEur, num, pctPlain } from "@/lib/format";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${num(Math.abs(Math.round(v)))}`;

export default function CityVisit({ player, onClose }: { player: PublicPlayer; onClose: () => void }) {
  // undefined = chargement, null = plan indisponible
  const [loaded, setLoaded] = useState<{ id: string; plots: Plot[] | null } | null>(null);
  const plots = loaded?.id === player.id ? loaded.plots : undefined;

  useEffect(() => {
    let alive = true;
    fetchCity(player).then((p) => { if (alive) setLoaded({ id: player.id, plots: p }); });
    return () => { alive = false; };
  }, [player]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const city = useMemo(() => {
    if (!plots) return null;
    const buildings: Record<string, number> = {};
    for (const p of plots) buildings[p.id] = (buildings[p.id] ?? 0) + 1;
    return computeCity({ buildings, population: player.population });
  }, [plots, player.population]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy/50 p-0 sm:p-6 appear" role="dialog" aria-modal="true" aria-label={`Visite de ${player.cityName}`} onClick={onClose}>
      <div className="relative mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col overflow-hidden bg-card shadow-2xl sm:rounded-[18px]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-primary-soft text-primary"><Building2 size={19} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold">{player.cityName}</h2>
            <p className="truncate text-[12px] text-muted">
              {player.name ? `Dirigée par ${player.name} · ` : ""}{PLAYABLE[player.country] ?? "—"} · {CITY_RANKS[city?.rank ?? 0].name} · Jour {num(player.day)}
            </p>
          </div>
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-muted sm:inline">Visite · lecture seule</span>
          <button onClick={onClose} aria-label="Fermer la visite" className="rounded-[8px] p-2 text-muted hover:bg-slate-100"><X size={18} /></button>
        </header>

        <div className="flex gap-2 overflow-x-auto no-scrollbar border-b border-line px-4 py-2.5">
          <Fact icon={Users} label="Habitants" value={num(player.population)} />
          <Fact icon={Wallet} label="Patrimoine" value={compactEur(player.netWorth)} />
          {city && plots && (
            <>
              <Fact icon={Building2} label="Bâtiments" value={num(plots.length)} />
              <Fact icon={Briefcase} label="Emplois" value={num(city.jobs)} />
              <Fact icon={Smile} label="Satisfaction" value={pctPlain(city.satisfaction)} />
              <Fact icon={Zap} label="Énergie" value={signed(city.energy.balance)} bad={city.energy.balance < 0} />
              <Fact icon={Wheat} label="Nourriture" value={signed(city.food.balance)} bad={city.food.balance < 0} />
            </>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          {plots ? <IsoCity plots={plots} height="fill" zoomClass="right-3 top-3" />
            : (
              <div className="grid h-full place-items-center p-8 text-center text-[13px] text-muted" role="status">
                {plots === undefined ? "Chargement de la ville…" : "Cette ville n'a pas encore publié son plan. Revenez plus tard : il apparaît dès que son joueur rouvre le jeu."}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value, bad }: { icon: LucideIcon; label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-[10px] bg-slate-50 py-1.5 pl-2 pr-3">
      <Icon size={15} className={bad ? "text-danger" : "text-primary"} />
      <span className="leading-tight">
        <span className="block text-[10px] text-muted">{label}</span>
        <span className={`block text-[13px] font-bold tabular ${bad ? "text-danger" : ""}`}>{value}</span>
      </span>
    </div>
  );
}
