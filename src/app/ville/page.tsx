"use client";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Briefcase, Building2, Ellipsis, Factory, FastForward, Hammer, Home, Landmark, LayoutList, Lock, MousePointerClick, Move, Pencil, RotateCcw, Smile, Store, Trash2, TrendingUp, Users, Wheat, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { BUILDINGS, BUILDING_BY_ID, CATEGORY_LABELS, DEMOLISH_REFUND, EXPORT_RATIO, MAINTENANCE_RATE, RESOURCE_PRICES, type BuildingType, type Category } from "@/lib/game/config";
import { Button, Progress } from "@/components/ui";
import IsoCity, { type CityMarker, type CityMode, type MarkerKind } from "@/components/IsoCity";
import { useMedia } from "@/lib/useMedia";
import { isTileFree, type CityStats } from "@/lib/game/engine";
import type { Plot } from "@/lib/game/layout";
import { compactEur, eur, num, pctPlain, signedEur, tone } from "@/lib/format";

const CAT_ICON: Record<Category, LucideIcon> = {
  housing: Home, commerce: Store, services: Briefcase, industry: Factory, agriculture: Wheat, energy: Zap, civic: Landmark,
};
const CAT_TINT: Record<Category, string> = {
  housing: "bg-blue-50 text-blue-600", commerce: "bg-violet-50 text-violet-600", services: "bg-sky-50 text-sky-600",
  industry: "bg-slate-100 text-slate-600", agriculture: "bg-lime-50 text-lime-700", energy: "bg-amber-50 text-amber-600", civic: "bg-indigo-50 text-indigo-600",
};
type Tile = { x: number; y: number };
/** Outil actif de la barre du bas. */
type Tool = "build" | "move" | "demolish" | "list" | "stats" | "more" | null;
const BUILD_CATS: Category[] = ["housing", "commerce", "services", "industry", "agriculture", "energy"];
const MARKER_LABEL: Record<MarkerKind, string> = {
  energy: "Manque d'énergie : importée au prix fort",
  food: "Manque de nourriture : importée au prix fort",
  full: "Logements pleins : la population ne grandit plus",
  staff: "Postes vacants : il manque des habitants",
};
/** Pas plus de quelques pastilles par problème : la carte doit rester lisible. */
const MAX_MARKERS = 4;

/** Indicateurs posés sur la carte, à l'endroit où le problème se règle. */
function cityMarkers(plots: Plot[], flags: { energy: boolean; food: boolean; full: boolean; staff: boolean }): CityMarker[] {
  const pick = (kind: MarkerKind, weight: (b: BuildingType) => number) =>
    plots.map((p) => ({ p, w: weight(BUILDING_BY_ID[p.id] ?? ({} as BuildingType)) })).filter((r) => r.w > 0)
      .sort((a, b) => b.w - a.w).slice(0, MAX_MARKERS)
      .map(({ p }) => ({ x: p.x, y: p.y, kind, label: MARKER_LABEL[kind] }));
  const out: CityMarker[] = [];
  if (flags.energy) out.push(...pick("energy", (b) => b.energyUse ?? 0));
  if (flags.food) out.push(...pick("food", (b) => b.housing ?? 0));
  else if (flags.full) out.push(...pick("full", (b) => b.housing ?? 0));
  if (flags.staff) out.push(...pick("staff", (b) => b.jobs ?? 0));
  // Une seule pastille par bâtiment (la première, donc la plus grave)
  const seen = new Set<string>();
  return out.filter((m) => { const k = `${m.x},${m.y}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export default function CityPage() {
  const { game, city } = useDerived();
  const build = useGame((s) => s.build);
  const moveBuilding = useGame((s) => s.moveBuilding);
  const demolish = useGame((s) => s.demolish);
  const notify = useGame((s) => s.notify);
  const [tool, setTool] = useState<Tool>(null);
  const [mode, setMode] = useState<CityMode | null>(null);
  const [selected, setSelected] = useState<Tile | null>(null);
  const small = useMedia("(max-width: 1023px)");
  const phone = useMedia("(max-width: 639px)");

  const selectedPlot = selected ? game.plots.find((p) => p.x === selected.x && p.y === selected.y) ?? null : null;
  const modeBuilding = mode ? BUILDING_BY_ID[mode.id] : null;

  // Échap : annule d'abord le placement, puis l'outil, puis la sélection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode) setMode(null); else if (tool) setTool(null); else setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, tool]);

  const pickTool = (t: Tool) => {
    setMode(null);
    if (t === "build" || t === "move" || t === "demolish") setSelected(null);
    setTool((cur) => (cur === t ? null : t));
  };

  const onTileClick = (x: number, y: number) => {
    const hit = game.plots.find((p) => p.x === x && p.y === y);
    if (mode?.kind === "place") {
      const b = BUILDING_BY_ID[mode.id];
      if (!isTileFree(game, x, y)) return;
      if (build(mode.id, { x, y }) && useGame.getState().game.cash < b.cost) setMode(null); // plus assez pour un autre
      return;
    }
    if (mode?.kind === "move") {
      if (moveBuilding(mode.from, { x, y })) { setMode(null); setSelected(tool === "move" ? null : { x, y }); }
      return;
    }
    if (tool === "move") { if (hit) setMode({ kind: "move", id: hit.id, from: { x, y } }); return; }
    if (tool === "demolish") {
      if (hit && BUILDING_BY_ID[hit.id]?.buildable === false) { notify("Bâtiment d'origine : il peut être déplacé mais pas démoli.", "error"); return; }
      setSelected(hit ? { x, y } : null);
      return;
    }
    setSelected(hit ? { x, y } : null);
    if (hit && (tool === "list" || tool === "stats" || tool === "more")) setTool(null);
  };

  const flags = {
    energy: city.energy.balance < 0, food: city.food.balance < 0,
    full: city.freeHousing === 0 && city.housing > 0, staff: city.openJobs > 0 && city.freeHousing === 0,
  };
  const markers = useMemo(
    () => cityMarkers(game.plots, { energy: flags.energy, food: flags.food, full: flags.full, staff: flags.staff }),
    [game.plots, flags.energy, flags.food, flags.full, flags.staff],
  );

  // Panneau au-dessus de la barre d'outils : palette, liste, stats, menu, ou fiche du bâtiment sélectionné
  let dock: React.ReactNode = null;
  if (tool === "build") {
    dock = <Palette active={mode?.kind === "place" ? mode.id : null} onClose={() => { setTool(null); setMode(null); }}
      onPick={(id) => {
        setSelected(null);
        const off = mode?.kind === "place" && mode.id === id;
        setMode(off ? null : { kind: "place", id });
        if (!off && small) setTool(null); // petit écran : on replie la palette pour voir la carte
      }} />;
  } else if (tool === "list") {
    dock = <DockPanel title="Mes bâtiments" onClose={() => setTool(null)}><Owned onSelect={(t) => { setTool(null); setSelected(t); }} /></DockPanel>;
  } else if (tool === "stats") {
    dock = <DockPanel title="Statistiques" onClose={() => setTool(null)}><div className="space-y-4"><CityBars city={city} population={game.population} /><Budget city={city} /></div></DockPanel>;
  } else if (tool === "more") {
    dock = <DockPanel title="Options" onClose={() => setTool(null)}><MoreMenu /></DockPanel>;
  } else if (selectedPlot && !mode) {
    dock = <SelectedPanel plot={selectedPlot} confirmDemolish={tool === "demolish"}
      onMove={() => setMode({ kind: "move", id: selectedPlot.id, from: { x: selectedPlot.x, y: selectedPlot.y } })}
      onDemolish={() => { demolish(selectedPlot.id, { x: selectedPlot.x, y: selectedPlot.y }); setSelected(null); }}
      onClose={() => setSelected(null)} />;
  }

  // Bandeau d'aide : dit toujours quoi faire maintenant
  let hintText: React.ReactNode = null;
  if (mode?.kind === "place" && modeBuilding) hintText = <><b>{modeBuilding.name}</b> · {compactEur(modeBuilding.cost)} — choisissez un carreau vert</>;
  else if (mode?.kind === "move" && modeBuilding) hintText = <>Déplacement de <b>{modeBuilding.name}</b> — choisissez un carreau vert</>;
  else if (tool === "move") hintText = <>Déplacer : {small ? "touchez" : "cliquez sur"} un bâtiment</>;
  else if (tool === "demolish" && !selectedPlot) hintText = <>Démolir : {small ? "touchez" : "cliquez sur"} un bâtiment</>;
  const cancel = () => { if (mode) setMode(null); else setTool(null); };

  const TOOLS: { id: Exclude<Tool, null>; label: string; icon: LucideIcon; on: boolean; cls?: string }[] = [
    { id: "build", label: "Construire", icon: Hammer, on: tool === "build" || mode?.kind === "place" },
    { id: "move", label: "Déplacer", icon: Move, on: tool === "move" || mode?.kind === "move" },
    { id: "demolish", label: "Démolir", icon: Trash2, on: tool === "demolish" },
    { id: "list", label: "Bâtiments", icon: LayoutList, on: tool === "list" },
    { id: "stats", label: "Stats", icon: BarChart3, on: tool === "stats", cls: "lg:hidden" },
    { id: "more", label: "Options", icon: Ellipsis, on: tool === "more" },
  ];

  return (
    <div className="city-stage">
      <IsoCity plots={game.plots} height="fill" initialZoom={phone ? 1.3 : 1} mode={mode} selected={selected} onTileClick={onTileClick}
        markers={markers} selectedTone={tool === "demolish" ? "danger" : "primary"}
        padTop={small ? 64 : 72} padBottom={small ? 76 : 84} zoomClass="right-3 top-1/2 -translate-y-1/2" hint={false} />

      {/* Haut : ressources à gauche, budget à droite */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 p-3">
        <div className="pointer-events-auto -m-3 flex min-w-0 flex-1 gap-2 overflow-x-auto no-scrollbar p-3">
          <button onClick={() => pickTool("more")} title="Options de la ville"
            className="hud flex shrink-0 items-center gap-2 px-3 py-2 text-left hover:border-slate-300">
            <Building2 size={16} className="text-primary" />
            <span className="leading-tight">
              <span className="block max-w-[150px] truncate text-[13px] font-semibold">{game.cityName}</span>
              <span className="block text-[10px] text-muted">Jour {game.day}</span>
            </span>
          </button>
          <Pill icon={Users} label="Habitants" value={num(game.population)} sub={`/ ${num(city.housing)}`} bad={false} warn={flags.full}
            title={`${num(game.population)} habitants pour ${num(city.housing)} logements`} />
          <Pill icon={Zap} label="Énergie" value={signed(city.energy.balance)} bad={flags.energy}
            title={`Production ${num(city.energy.prod)} · consommation ${num(city.energy.use)}`} />
          <Pill icon={Wheat} label="Nourriture" value={signed(city.food.balance)} bad={flags.food}
            title={`Production ${num(city.food.prod)} · consommation ${num(city.food.use)}`} />
          <Pill icon={TrendingUp} label="Flux net / jour" value={signedEur(city.net)} bad={city.net < 0} good={city.net > 0}
            title="Revenus de la ville moins ses dépenses, par jour" />
        </div>
        <div className="pointer-events-auto hidden w-[250px] shrink-0 lg:block">
          <div className="hud p-3.5"><Budget city={city} /></div>
        </div>
      </div>

      {hintText && (
        <div className="pointer-events-none absolute inset-x-3 top-[68px] z-20 flex justify-center lg:top-[72px]">
          <div className="pointer-events-auto appear flex max-w-full items-center gap-2.5 rounded-full bg-primary py-1.5 pl-3.5 pr-1.5 text-[13px] text-white shadow-lg">
            <MousePointerClick size={15} className="shrink-0" />
            <span className="min-w-0 truncate">{hintText}</span>
            <button onClick={cancel} className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold hover:bg-white/25">{small ? "Annuler" : "Annuler (Échap)"}</button>
          </div>
        </div>
      )}

      {/* Bas : outils à gauche, état de la ville à droite */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          {dock && <div className="pointer-events-auto w-full max-w-[720px]">{dock}</div>}
          <div className="hud pointer-events-auto flex max-w-full gap-1 p-1.5" role="toolbar" aria-label="Outils de la ville">
            {TOOLS.map(({ id, label, icon: Icon, on, cls = "" }) => (
              <button key={id} onClick={() => pickTool(id)} aria-pressed={on} title={label}
                className={`flex min-w-[54px] flex-col items-center gap-0.5 rounded-[10px] px-2 py-1.5 text-[10px] font-semibold transition-colors sm:min-w-0 sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-[13px] ${cls} ${
                  on ? (id === "demolish" ? "bg-danger text-white" : "bg-primary text-white") : "text-ink hover:bg-slate-100"}`}>
                <Icon size={18} strokeWidth={1.9} />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto hidden w-[250px] shrink-0 lg:block">
          <div className="hud p-3.5"><CityBars city={city} population={game.population} /></div>
        </div>
      </div>
    </div>
  );
}

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v))}`;

function Pill({ icon: Icon, label, value, sub, bad, warn, good, title }: { icon: LucideIcon; label: string; value: string; sub?: string; bad: boolean; warn?: boolean; good?: boolean; title: string }) {
  const iconTone = bad ? "bg-danger-soft text-danger" : warn ? "bg-warning-soft text-amber-600" : "bg-primary-soft text-primary";
  return (
    <div title={title} className={`hud flex shrink-0 items-center gap-2 py-1.5 pl-1.5 pr-3 ${bad ? "border-red-200" : ""}`}>
      <span className={`grid h-8 w-8 place-items-center rounded-[10px] ${iconTone}`}><Icon size={16} /></span>
      <span className="leading-tight">
        <span className="block text-[10px] text-muted">{label}</span>
        <span className={`block text-[13px] font-bold tabular ${bad ? "text-danger" : good ? "text-success" : ""}`}>{value}{sub && <span className="ml-1 font-medium text-muted">{sub}</span>}</span>
      </span>
    </div>
  );
}

/** Stats n°2 : d'où vient et où part l'argent de la ville, chaque jour. */
function Budget({ city }: { city: CityStats }) {
  const rows: [string, number][] = [
    ["Impôts", city.income.taxes], ["Entreprises", city.income.buildings], ["Exportations", city.income.exports],
    ["Entretien", -city.expenses.maintenance], ["Importations", -city.expenses.imports],
  ];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">Budget du jour</div>
      <dl className="space-y-1 text-[12px]">
        {rows.filter(([, v]) => Math.round(v) !== 0).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className={`font-semibold tabular ${v < 0 ? "text-danger" : ""}`}>{signedEur(v)}</dd></div>
        ))}
      </dl>
      <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2">
        <span className="text-[12px] font-semibold">Flux net</span>
        <span className={`text-[16px] font-bold tabular ${tone(city.net)}`}>{signedEur(city.net)}</span>
      </div>
    </div>
  );
}

/** Stats n°1 : l'état de la ville en trois jauges. */
function CityBars({ city, population }: { city: CityStats; population: number }) {
  const full = city.freeHousing === 0 && city.housing > 0;
  const jobless = city.unemploymentRate > 0.08;
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">État de la ville</div>
      <Bar icon={Users} label="Logements" value={`${num(population)} / ${num(city.housing)}`} ratio={population / Math.max(1, city.housing)} tone={full ? "bg-warning" : "bg-success"} />
      <Bar icon={Briefcase} label="Emplois" value={`chômage ${pctPlain(city.unemploymentRate)}`} ratio={city.employed / Math.max(1, city.jobs)} tone={jobless ? "bg-danger" : "bg-success"} />
      <Bar icon={Smile} label="Satisfaction" value={pctPlain(city.satisfaction)} ratio={city.satisfaction} tone={city.satisfaction < 0.6 ? "bg-danger" : city.satisfaction < 0.75 ? "bg-warning" : "bg-success"} />
      <div className="flex justify-between border-t border-line pt-2 text-[12px]">
        <span className="text-muted">Croissance</span>
        <span className={`font-semibold tabular ${tone(city.growth)}`}>{city.growth >= 0 ? "+" : "−"}{num(Math.abs(city.growth))} hab. / jour</span>
      </div>
    </div>
  );
}

function Bar({ icon: Icon, label, value, ratio, tone: barTone }: { icon: LucideIcon; label: string; value: string; ratio: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[12px]">
        <Icon size={13} className="text-primary" /><span className="font-medium">{label}</span>
        <span className="ml-auto tabular text-muted">{value}</span>
      </div>
      <Progress value={ratio} tone={barTone} />
    </div>
  );
}

function DockPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section className="hud appear flex max-h-[min(52vh,440px)] w-full max-w-[420px] flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Fermer" className="rounded-[6px] p-1 text-muted hover:bg-slate-100"><X size={16} /></button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
    </section>
  );
}

function MoreMenu() {
  const skipDay = useGame((s) => s.skipDay);
  const reset = useGame((s) => s.reset);
  return (
    <div className="space-y-4">
      <RenameCity />
      <ul className="list-disc space-y-1.5 pl-4 text-[12px] text-muted">
        <li>60 % des habitants cherchent un emploi.</li>
        <li>Les habitants arrivent s&apos;il y a des logements libres, surtout si des emplois les attendent.</li>
        <li>Les déficits d&apos;énergie et de nourriture sont importés automatiquement, au prix fort. Les surplus sont exportés à {EXPORT_RATIO * 100} % du prix.</li>
        <li>Entretien : {MAINTENANCE_RATE * 100} % du coût par jour. Déplacer est gratuit. Démolir rembourse {DEMOLISH_REFUND * 100} %.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <Button variant="secondary" onClick={skipDay} title="Outil de test du prototype" className="inline-flex items-center gap-1.5"><FastForward size={15} />Avancer d&apos;un jour</Button>
        <ConfirmButton onConfirm={reset} confirmLabel="Confirmer : tout effacer"
          className="inline-flex items-center gap-1 text-[12px] text-danger hover:underline"><RotateCcw size={13} />Recommencer la partie</ConfirmButton>
      </div>
    </div>
  );
}

/** Rentabilité : revenus + ressources produites (prix d'export) − énergie consommée − entretien. */
function netPerDay(b: BuildingType) {
  return (b.revenue ?? 0) + ((b.energyProd ?? 0) * RESOURCE_PRICES.energy + (b.foodProd ?? 0) * RESOURCE_PRICES.food) * EXPORT_RATIO
    - (b.energyUse ?? 0) * RESOURCE_PRICES.energy - b.cost * MAINTENANCE_RATE;
}

function Palette({ active, onPick, onClose }: { active: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const game = useGame((s) => s.game);
  const [cat, setCat] = useState<Category>("housing");
  return (
    <section className="hud appear p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Catégories">
          {BUILD_CATS.map((c) => {
            const Icon = CAT_ICON[c];
            return (
              <button key={c} role="tab" aria-selected={c === cat} onClick={() => setCat(c)}
                className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-medium transition-colors ${c === cat ? "bg-primary text-white" : "bg-slate-50 text-muted hover:bg-slate-100"}`}>
                <Icon size={14} />{CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
        <button onClick={onClose} aria-label="Fermer" className="shrink-0 rounded-[6px] p-1 text-muted hover:bg-slate-100"><X size={16} /></button>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {BUILDINGS.filter((b) => b.category === cat && b.buildable !== false).map((b) => {
          const locked = !!b.unlockPop && game.population < b.unlockPop;
          const owned = game.buildings[b.id] ?? 0;
          const net = netPerDay(b);
          const isActive = active === b.id;
          const Icon = CAT_ICON[b.category];
          return (
            <li key={b.id} className="w-[212px] shrink-0">
              <button disabled={locked || b.cost > game.cash} onClick={() => onPick(b.id)}
                className={`flex h-full w-full flex-col gap-1.5 rounded-[12px] border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${isActive ? "border-primary bg-primary-soft" : "border-line hover:border-slate-300 hover:bg-slate-50"}`}>
                <span className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${CAT_TINT[b.category]}`}><Icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{b.name}{owned > 0 && <span className="ml-1.5 text-[11px] text-primary">×{owned}</span>}</span>
                    <span className="block text-[12px] font-bold tabular">{compactEur(b.cost)}</span>
                  </span>
                </span>
                <Effects b={b} />
                <span className="mt-auto block text-[11px] text-muted">
                  {locked ? <span className="inline-flex items-center gap-1"><Lock size={11} />Débloqué à {num(b.unlockPop!)} habitants</span>
                    : b.cost > game.cash ? "Liquidités insuffisantes"
                    : isActive ? "Choisissez un carreau sur la carte"
                    : b.category !== "housing" && net > 0 ? `Rentabilisé en ~${Math.round(b.cost / net)} jours`
                    : "Cliquez pour placer"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SelectedPanel({ plot, confirmDemolish, onMove, onDemolish, onClose }: { plot: Plot; confirmDemolish: boolean; onMove: () => void; onDemolish: () => void; onClose: () => void }) {
  const b = BUILDING_BY_ID[plot.id];
  if (!b) return null;
  const Icon = CAT_ICON[b.category];
  const refund = compactEur(b.cost * DEMOLISH_REFUND);
  return (
    <section className={`hud appear w-full max-w-[380px] p-3.5 ${confirmDemolish ? "border-red-200" : ""}`}>
      <div className="mb-2.5 flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${CAT_TINT[b.category]}`}><Icon size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{b.name}</div>
          <div className="text-[12px] text-muted">{CATEGORY_LABELS[b.category]} · entretien {eur(b.cost * MAINTENANCE_RATE)}/j</div>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="rounded-[6px] p-1 text-muted hover:bg-slate-100"><X size={16} /></button>
      </div>
      <Effects b={b} />
      {b.buildable === false && <p className="mt-2.5 text-[12px] text-muted">Bâtiment d&apos;origine : il peut être déplacé mais pas démoli.</p>}
      {confirmDemolish ? (
        <div className="mt-3 flex gap-2">
          <Button variant="danger" onClick={onDemolish} className="flex-1">Démolir (+{refund})</Button>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={onMove} className="inline-flex flex-1 items-center justify-center gap-1.5"><Move size={15} />Déplacer</Button>
          {b.buildable !== false && (
            <ConfirmButton onConfirm={onDemolish} confirmLabel={`Confirmer (+${refund})`}
              className="flex-1 rounded-[10px] border border-line bg-card px-3 py-2 text-[13px] font-semibold text-danger hover:bg-danger-soft">Démolir</ConfirmButton>
          )}
        </div>
      )}
    </section>
  );
}

/** Renommer sa ville (le nom apparaît sur la carte du monde et au classement). */
function RenameCity() {
  const cityName = useGame((s) => s.game.cityName);
  const renameCity = useGame((s) => s.renameCity);
  const [value, setValue] = useState(cityName);
  return (
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); renameCity(value); }}>
      <label className="min-w-0 flex-1 text-[12px] font-medium text-muted">
        <span className="mb-1 flex items-center gap-1"><Pencil size={12} />Nom de la ville</span>
        <input value={value} maxLength={32} onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-[10px] border border-line px-3 py-2 text-[13px] text-ink outline-none focus:border-primary" />
      </label>
      <Button type="submit" disabled={!value.trim() || value.trim() === cityName}>Renommer</Button>
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

function Effects({ b }: { b: BuildingType }) {
  const chips: { text: string; cls: string; icon?: LucideIcon }[] = [];
  if (b.housing) chips.push({ text: `+${num(b.housing)} hab.`, cls: "bg-blue-50 text-blue-700" });
  if (b.jobs) chips.push({ text: `${num(b.jobs)} emplois`, cls: "bg-slate-100 text-slate-700" });
  if (b.revenue) chips.push({ text: `+${num(b.revenue)} €/j`, cls: "bg-success-soft text-emerald-700" });
  if (b.energyProd) chips.push({ text: `+${num(b.energyProd)}`, cls: "bg-amber-50 text-amber-700", icon: Zap });
  if (b.foodProd) chips.push({ text: `+${num(b.foodProd)}`, cls: "bg-lime-50 text-lime-700", icon: Wheat });
  if (b.energyUse) chips.push({ text: `−${num(b.energyUse)}`, cls: "bg-danger-soft text-red-700", icon: Zap });
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(({ text, cls, icon: Icon }) => (
        <span key={text + cls} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{text}{Icon && <Icon size={11} />}</span>
      ))}
    </div>
  );
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
