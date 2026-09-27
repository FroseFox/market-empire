"use client";
import { useEffect, useState } from "react";
import {
  Briefcase, Building2, Pencil, Factory, FastForward, Home, Info, Landmark, Lock, MousePointerClick, Move, RotateCcw, Smile, Store, Users, Wheat, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { BUILDINGS, BUILDING_BY_ID, CATEGORY_LABELS, DEMOLISH_REFUND, EXPORT_RATIO, MAINTENANCE_RATE, RESOURCE_PRICES, type BuildingType, type Category } from "@/lib/game/config";
import { Button, Card, PageHeader, Progress, Segmented } from "@/components/ui";
import IsoCity, { type CityMode } from "@/components/IsoCity";
import { isTileFree } from "@/lib/game/engine";
import type { Plot } from "@/lib/game/layout";
import { compactEur, eur, num, pctPlain, signedEur, tone } from "@/lib/format";

const CAT_ICON: Record<Category, LucideIcon> = {
  housing: Home, commerce: Store, services: Briefcase, industry: Factory, agriculture: Wheat, energy: Zap, civic: Landmark,
};
const CAT_TINT: Record<Category, string> = {
  housing: "bg-blue-50 text-blue-600", commerce: "bg-violet-50 text-violet-600", services: "bg-sky-50 text-sky-600",
  industry: "bg-slate-100 text-slate-600", agriculture: "bg-lime-50 text-lime-700", energy: "bg-amber-50 text-amber-600", civic: "bg-indigo-50 text-indigo-600",
};
type Tab = "Construire" | "Mes bâtiments";
type Tile = { x: number; y: number };
const BUILD_CATS: Category[] = ["housing", "commerce", "services", "industry", "agriculture", "energy"];

export default function CityPage() {
  const { game, city } = useDerived();
  const skipDay = useGame((s) => s.skipDay);
  const reset = useGame((s) => s.reset);
  const build = useGame((s) => s.build);
  const moveBuilding = useGame((s) => s.moveBuilding);
  const [tab, setTab] = useState<Tab>("Construire");
  const [mode, setMode] = useState<CityMode | null>(null);
  const [selected, setSelected] = useState<Tile | null>(null);

  const selectedPlot = selected ? game.plots.find((p) => p.x === selected.x && p.y === selected.y) ?? null : null;

  // Échap : annule le placement ou la sélection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMode(null); setSelected(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onTileClick = (x: number, y: number) => {
    if (mode?.kind === "place") {
      const b = BUILDING_BY_ID[mode.id];
      if (!isTileFree(game, x, y)) return;
      if (build(mode.id, { x, y }) && b.cost * 2 > useGame.getState().game.cash + b.cost) setMode(null); // plus assez pour un autre
      return;
    }
    if (mode?.kind === "move") {
      if (moveBuilding(mode.from, { x, y })) { setMode(null); setSelected({ x, y }); }
      return;
    }
    const hit = game.plots.find((p) => p.x === x && p.y === y);
    setSelected(hit ? { x, y } : null);
  };

  const modeBuilding = mode ? BUILDING_BY_ID[mode.id] : null;

  return (
    <>
      <PageHeader icon={Building2} title={game.cityName} subtitle={`Gestion de votre cité · jour ${game.day}`}>
        <RenameCity />
        <Button variant="secondary" onClick={skipDay} title="Outil de test du prototype" className="inline-flex items-center gap-1.5"><FastForward size={15} />Avancer d&apos;un jour</Button>
      </PageHeader>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-4">
        <Gauge icon={Users} label="Population" value={num(game.population)} sub={`/ ${num(city.housing)} logements`} ratio={game.population / Math.max(1, city.housing)} />
        <Gauge icon={Briefcase} label="Emplois" value={num(city.jobs)} sub={`chômage ${pctPlain(city.unemploymentRate)}`} ratio={city.employed / Math.max(1, city.jobs)} bad={city.unemploymentRate > 0.08} />
        <Gauge icon={Smile} label="Satisfaction" value={pctPlain(city.satisfaction)} sub={city.satisfaction >= 0.75 ? "bonne" : "à améliorer"} ratio={city.satisfaction} bad={city.satisfaction < 0.6} />
        <Gauge icon={Zap} label="Énergie" value={`${num(city.energy.prod)}`} sub={`cons. ${num(city.energy.use)}`} ratio={city.energy.use / Math.max(1, city.energy.prod)} bad={city.energy.balance < 0} />
        <Gauge icon={Wheat} label="Nourriture" value={`${num(city.food.prod)}`} sub={`cons. ${num(city.food.use)}`} ratio={city.food.use / Math.max(1, city.food.prod)} bad={city.food.balance < 0} />
        <div className="card p-4 appear">
          <div className="text-[12px] text-muted mb-1">Flux net</div>
          <div className={`text-[22px] font-bold tabular ${tone(city.net)}`}>{signedEur(city.net)}</div>
          <div className="text-[11px] text-muted">par jour · croissance {city.growth >= 0 ? "+" : ""}{num(city.growth)} hab.</div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 items-start">
        {/* Carte */}
        <section className="card p-3 xl:col-span-8 appear">
          <div className={`mb-3 flex flex-wrap items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] ${mode ? "bg-primary text-white" : "bg-slate-50 text-muted"}`}>
            {mode && modeBuilding ? (
              <>
                <MousePointerClick size={16} />
                <span className="flex-1">
                  {mode.kind === "place"
                    ? <><b>{modeBuilding.name}</b> · {compactEur(modeBuilding.cost)} — cliquez sur un carreau vert pour construire.</>
                    : <>Déplacement de <b>{modeBuilding.name}</b> — cliquez sur un carreau vert.</>}
                </span>
                <button onClick={() => setMode(null)} className="rounded-[8px] bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">Annuler (Échap)</button>
              </>
            ) : (
              <>
                <Info size={15} />
                <span>Choisissez un bâtiment à droite, puis cliquez sur la carte pour le placer. Cliquez sur un bâtiment pour le déplacer ou le démolir. Glissez pour vous déplacer.</span>
              </>
            )}
          </div>
          <IsoCity plots={game.plots} height={560} mode={mode} selected={selected} onTileClick={onTileClick} />
        </section>

        {/* Panneau latéral */}
        <div className="xl:col-span-4 space-y-4">
          {selectedPlot && !mode && (
            <SelectedPanel plot={selectedPlot} onMove={() => setMode({ kind: "move", id: selectedPlot.id, from: { x: selectedPlot.x, y: selectedPlot.y } })} onClose={() => setSelected(null)} />
          )}
          <section className="card p-4 appear">
            <div className="mb-3"><Segmented options={["Construire", "Mes bâtiments"] as Tab[]} value={tab} onChange={setTab} /></div>
            {tab === "Construire"
              ? <Palette active={mode?.kind === "place" ? mode.id : null} onPick={(id) => { setSelected(null); setMode(mode?.kind === "place" && mode.id === id ? null : { kind: "place", id }); }} />
              : <Owned onSelect={(t) => { setMode(null); setSelected(t); }} />}
          </section>
          <Card title="Comment ça marche" icon={Landmark}>
            <ul className="text-[12px] text-muted space-y-1.5 list-disc pl-4">
              <li>60 % des habitants cherchent un emploi.</li>
              <li>Les habitants arrivent s&apos;il y a des logements libres, surtout si des emplois les attendent.</li>
              <li>Les déficits d&apos;énergie et de nourriture sont importés automatiquement, au prix fort. Les surplus sont exportés à 70 % du prix.</li>
              <li>Entretien : {MAINTENANCE_RATE * 100} % du coût par jour. Déplacer est gratuit. Démolir rembourse {DEMOLISH_REFUND * 100} %.</li>
            </ul>
            <ConfirmButton onConfirm={reset} confirmLabel="Confirmer : tout effacer"
              className="mt-4 text-[12px] text-danger inline-flex items-center gap-1 hover:underline"><RotateCcw size={13} />Recommencer la partie</ConfirmButton>
          </Card>
        </div>
      </div>
    </>
  );
}

/** Rentabilité : revenus + ressources produites (prix d'export) − énergie consommée − entretien. */
function netPerDay(b: BuildingType) {
  return (b.revenue ?? 0) + ((b.energyProd ?? 0) * RESOURCE_PRICES.energy + (b.foodProd ?? 0) * RESOURCE_PRICES.food) * EXPORT_RATIO
    - (b.energyUse ?? 0) * RESOURCE_PRICES.energy - b.cost * MAINTENANCE_RATE;
}

function Palette({ active, onPick }: { active: string | null; onPick: (id: string) => void }) {
  const game = useGame((s) => s.game);
  const [cat, setCat] = useState<Category>("housing");
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 mb-3" role="tablist" aria-label="Catégories">
        {BUILD_CATS.map((c) => {
          const Icon = CAT_ICON[c];
          return (
            <button key={c} role="tab" aria-selected={c === cat} title={CATEGORY_LABELS[c]} onClick={() => setCat(c)}
              className={`flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-[12px] font-medium transition-colors ${c === cat ? "bg-primary text-white" : "bg-slate-50 text-muted hover:bg-slate-100"}`}>
              <Icon size={15} />{CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>
      <ul className="space-y-2">
        {BUILDINGS.filter((b) => b.category === cat && b.buildable !== false).map((b) => {
          const locked = !!b.unlockPop && game.population < b.unlockPop;
          const owned = game.buildings[b.id] ?? 0;
          const net = netPerDay(b);
          const isActive = active === b.id;
          const Icon = CAT_ICON[b.category];
          return (
            <li key={b.id}>
              <button disabled={locked || b.cost > game.cash} onClick={() => onPick(b.id)}
                className={`w-full text-left rounded-[12px] border p-3 flex gap-3 transition-colors disabled:opacity-55 disabled:cursor-not-allowed ${isActive ? "border-primary bg-primary-soft" : "border-line hover:border-slate-300 hover:bg-slate-50"}`}>
                <span className={`h-10 w-10 shrink-0 rounded-[10px] grid place-items-center ${CAT_TINT[b.category]}`}><Icon size={19} /></span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[14px] truncate">{b.name}{owned > 0 && <span className="ml-1.5 text-[11px] text-primary">×{owned}</span>}</span>
                    <span className="font-bold tabular text-[13px] shrink-0">{compactEur(b.cost)}</span>
                  </span>
                  <span className="block mt-1"><Effects b={b} /></span>
                  <span className="block text-[11px] text-muted mt-1">
                    {locked ? <span className="inline-flex items-center gap-1"><Lock size={11} />Débloqué à {num(b.unlockPop!)} habitants</span>
                      : b.cost > game.cash ? "Liquidités insuffisantes"
                      : b.category !== "housing" && net > 0 ? `Rentabilisé en ~${Math.round(b.cost / net)} jours`
                      : isActive ? "Cliquez sur la carte pour placer" : "Cliquez pour choisir l'emplacement"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SelectedPanel({ plot, onMove, onClose }: { plot: Plot; onMove: () => void; onClose: () => void }) {
  const demolish = useGame((s) => s.demolish);
  const b = BUILDING_BY_ID[plot.id];
  if (!b) return null;
  const Icon = CAT_ICON[b.category];
  return (
    <section className="card p-4 appear border-primary/40">
      <div className="flex items-start gap-3 mb-3">
        <span className={`h-11 w-11 shrink-0 rounded-[10px] grid place-items-center ${CAT_TINT[b.category]}`}><Icon size={20} /></span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[16px]">{b.name}</div>
          <div className="text-[12px] text-muted">{CATEGORY_LABELS[b.category]} · entretien {eur(b.cost * MAINTENANCE_RATE)}/j</div>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="p-1 rounded-[6px] text-muted hover:bg-slate-100"><X size={16} /></button>
      </div>
      <Effects b={b} />
      {b.buildable === false ? (
        <p className="text-[12px] text-muted mt-3">Bâtiment d&apos;origine : il peut être déplacé mais pas démoli.</p>
      ) : null}
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" onClick={onMove} className="flex-1 inline-flex items-center justify-center gap-1.5"><Move size={15} />Déplacer</Button>
        {b.buildable !== false && (
          <ConfirmButton onConfirm={() => { demolish(b.id, { x: plot.x, y: plot.y }); onClose(); }} confirmLabel={`Confirmer (+${compactEur(b.cost * DEMOLISH_REFUND)})`}
            className="flex-1 rounded-[10px] px-3 py-2 text-[13px] font-semibold border border-line bg-card text-danger hover:bg-danger-soft">Démolir</ConfirmButton>
        )}
      </div>
    </section>
  );
}

/** Renommer sa ville (le nom apparaît sur la carte du monde et au classement). */
function RenameCity() {
  const cityName = useGame((s) => s.game.cityName);
  const renameCity = useGame((s) => s.renameCity);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cityName);
  if (!editing) {
    return <Button variant="secondary" onClick={() => { setValue(cityName); setEditing(true); }} className="inline-flex items-center gap-1.5"><Pencil size={14} />Renommer</Button>;
  }
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (renameCity(value)) setEditing(false); }}>
      <label htmlFor="city-name" className="sr-only">Nom de la ville</label>
      <input id="city-name" autoFocus value={value} maxLength={32} onChange={(e) => setValue(e.target.value)}
        className="w-48 rounded-[10px] border border-line px-3 py-2 text-[13px] outline-none focus:border-primary" />
      <Button type="submit">Valider</Button>
      <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Annuler</Button>
    </form>
  );
}

/** Bouton à deux clics (les boîtes de dialogue du navigateur ne sont pas toujours disponibles). */
function ConfirmButton({ onConfirm, confirmLabel, className, children }: { onConfirm: () => void; confirmLabel: string; className: string; children: React.ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button className={className} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : children}
    </button>
  );
}

function Gauge({ icon: Icon, label, value, sub, ratio, bad }: { icon: LucideIcon; label: string; value: string; sub: string; ratio: number; bad?: boolean }) {
  return (
    <div className="card p-4 appear">
      <div className="flex items-center gap-1.5 text-[12px] text-muted mb-1"><Icon size={14} className={bad ? "text-danger" : "text-primary"} />{label}</div>
      <div className="text-[22px] font-bold tabular leading-tight">{value}</div>
      <div className={`text-[11px] mb-2 ${bad ? "text-danger" : "text-muted"}`}>{sub}</div>
      <Progress value={ratio} tone={bad ? "bg-danger" : ratio > 0.95 ? "bg-warning" : "bg-success"} />
    </div>
  );
}

function Effects({ b }: { b: BuildingType }) {
  const chips: [string, string][] = [];
  if (b.housing) chips.push([`+${num(b.housing)} hab.`, "bg-blue-50 text-blue-700"]);
  if (b.jobs) chips.push([`${num(b.jobs)} emplois`, "bg-slate-100 text-slate-700"]);
  if (b.revenue) chips.push([`+${num(b.revenue)} €/j`, "bg-success-soft text-emerald-700"]);
  if (b.energyProd) chips.push([`+${num(b.energyProd)} ⚡`, "bg-amber-50 text-amber-700"]);
  if (b.foodProd) chips.push([`+${num(b.foodProd)} 🌾`, "bg-lime-50 text-lime-700"]);
  if (b.energyUse) chips.push([`−${num(b.energyUse)} ⚡`, "bg-danger-soft text-red-700"]);
  return <div className="flex flex-wrap gap-1">{chips.map(([t, c]) => <span key={t} className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${c}`}>{t}</span>)}</div>;
}

function Owned({ onSelect }: { onSelect: (t: Tile) => void }) {
  const game = useGame((s) => s.game);
  const rows = Object.entries(game.buildings).map(([id, n]) => ({ b: BUILDING_BY_ID[id], n })).filter((r) => r.b);
  return (
    <ul className="divide-y divide-line">
      {rows.map(({ b, n }) => {
        const Icon = CAT_ICON[b.category];
        const plots = game.plots.filter((p) => p.id === b.id);
        return (
          <li key={b.id} className="py-3">
            <div className="flex items-center gap-3">
              <span className={`h-9 w-9 rounded-[10px] grid place-items-center ${CAT_TINT[b.category]}`}><Icon size={17} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[14px]">{b.name} <span className="text-muted">×{n}</span></div>
                <div className="text-[11px] text-muted">Entretien {eur(b.cost * MAINTENANCE_RATE * n)}/j</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2 pl-12">
              {plots.map((p, i) => (
                <button key={`${p.x},${p.y}`} onClick={() => onSelect({ x: p.x, y: p.y })}
                  className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium hover:border-primary hover:text-primary">
                  Voir n°{i + 1}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
