"use client";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, ArrowUpCircle, Briefcase, CircleAlert, CloudLightning, FlaskConical, TriangleAlert, Copy, Undo2, Building2, Ellipsis, Handshake, Sparkles, Wrench, Factory, FastForward, Hammer, Home, Landmark, LayoutList, Lock, MousePointerClick, Move, Pencil, RotateCcw, Smile, Store, Target, Trash2, Trees, TrendingUp, Trophy, Users, Wheat, X, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { BUILDINGS, BUILDING_BY_ID, CATEGORY_LABELS, CITY_RANKS, SERVICES, SERVICE_IDS, DEMOLISH_REFUND, EXPORT_RATIO, MAINTENANCE_RATE, RESOURCE_PRICES, type BuildingType, type Category } from "@/lib/game/config";
import { Button, ConfirmButton, Progress, LockTag } from "@/components/ui";
import IsoCity from "@/components/City3D";
import { MARKER_LEVEL, type CityMarker, type CityMode, type CitySign, type MarkerKind } from "@/components/IsoCity";
import CompanyLogo, { companyBadge } from "@/components/CompanyLogo";
import { cityMarkers } from "@/lib/game/markers";
import { useMedia } from "@/lib/useMedia";
import { capitalCost, computeCity, landUse, activeBranches, branchAt, branchCost, buildPreview, featureOpen, mapSize, nextTerritory, orientationCost, branchLimit, buildingAudit, forecast, goalStatuses, hasResearch, isTileFree, prestige, renovateCost, upgradeOffer, type CityStats } from "@/lib/game/engine";
import { BRANCH_EFFECTS, BRANCH_MIN_VALUE, FEATURES, FORECAST_DAYS, LAND_ALMOST_FULL, ORIENTATIONS, ORIENTATION_BY_ID, PROJECTS } from "@/lib/game/config";
import { specialtyText } from "@/lib/world/countries";
import { ASSET_BY_SYMBOL, familyOf } from "@/lib/market/universe";
import type { Plot } from "@/lib/game/layout";
import { capitalFmt, compactEur, eur, num, pctPlain, signedEur, tone } from "@/lib/format";

const CAT_ICON: Record<Category, LucideIcon> = {
  housing: Home, commerce: Store, services: Briefcase, industry: Factory, agriculture: Wheat, energy: Zap, public: Trees, civic: Landmark,
};
const CAT_TINT: Record<Category, string> = {
  housing: "bg-blue-50 text-blue-600", commerce: "bg-violet-50 text-violet-600", services: "bg-sky-50 text-sky-600",
  industry: "bg-slate-100 text-slate-600", agriculture: "bg-lime-50 text-lime-700", energy: "bg-amber-50 text-amber-600", public: "bg-emerald-50 text-emerald-600", civic: "bg-indigo-50 text-indigo-600",
};
type Tile = { x: number; y: number };
/** Le joueur a-t-il de quoi payer ce bâtiment : liquidités, et capital pour les gros. */
const canPay = (g: { cash: number; capital?: number }, b: BuildingType) => g.cash >= b.cost && (g.capital ?? 0) >= capitalCost(b);
const DEV = process.env.NODE_ENV !== "production";
/** Outil actif de la barre du bas. */
type Tool = "build" | "move" | "demolish" | "goals" | "firms" | "list" | "stats" | "more" | null;
const BUILD_CATS: Category[] = ["housing", "commerce", "services", "industry", "agriculture", "energy", "public"];
/** Ce qu'il faut faire pour faire disparaître la pastille, et l'onglet de construction qui s'ouvre. */
const MARKER_FIX: Record<MarkerKind, { text: string; cat: Category; cta: string }> = {
  energy: { text: "Construisez une centrale pour produire votre propre énergie.", cat: "energy", cta: "Construire une centrale" },
  food: { text: "Construisez une exploitation agricole pour nourrir vos habitants.", cat: "agriculture", cta: "Construire une exploitation" },
  full: { text: "Construisez des logements pour accueillir de nouveaux habitants.", cat: "housing", cta: "Construire des logements" },
  staff: { text: "Construisez des logements : de nouveaux habitants viendront occuper ces postes.", cat: "housing", cta: "Construire des logements" },
  service: { text: "Construisez l'équipement public manquant pour satisfaire vos habitants.", cat: "public", cta: "Construire un équipement" },
};
/** Rouge : coûte de l'argent chaque jour. Orange : ne coûte rien, mais freine la ville. */
const LEVEL_TEXT = { bad: { word: "Problème", sub: "coûte de l'argent chaque jour" }, warn: { word: "À surveiller", sub: "freine la croissance de la ville" } } as const;

export default function CityPage() {
  const { game, city } = useDerived();
  const build = useGame((s) => s.build);
  const moveBuilding = useGame((s) => s.moveBuilding);
  const demolish = useGame((s) => s.demolish);
  const notify = useGame((s) => s.notify);
  const claimGoal = useGame((s) => s.claimGoal);
  const upgrade = useGame((s) => s.upgrade);
  const buildAuto = useGame((s) => s.buildAuto);
  const undo = useGame((s) => s.undo);
  const undoLast = useGame((s) => s.undoLast);
  const [tool, setTool] = useState<Tool>(null);
  // Onglet ouvert dans la palette de construction (choisi par le bouton d'une alerte)
  const [buildCat, setBuildCat] = useState<Category>("housing");
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
      if (build(mode.id, { x, y }) && !canPay(useGame.getState().game, b)) setMode(null); // plus assez pour un autre
      return;
    }
    if (mode?.kind === "move") {
      if (moveBuilding(mode.from, { x, y })) { setMode(null); setSelected(tool === "move" ? null : { x, y }); }
      return;
    }
    if (tool === "move") { if (hit) setMode({ kind: "move", id: hit.id, from: { x, y } }); return; }
    if (tool === "demolish") {
      if (hit?.id === "branch") { notify("Site d'entreprise : il se ferme depuis le bouton Entreprises.", "error"); return; }
      if (hit && BUILDING_BY_ID[hit.id]?.buildable === false) { notify("Bâtiment d'origine : il peut être déplacé mais pas démoli.", "error"); return; }
      setSelected(hit ? { x, y } : null);
      return;
    }
    setSelected(hit ? { x, y } : null);
    if (hit && (tool === "list" || tool === "stats" || tool === "more")) setTool(null);
  };

  const flags = { energy: city.energy.balance < 0, food: city.food.balance < 0, full: city.freeHousing === 0 && city.housing > 0 };
  // Pastilles au-dessus des bâtiments concernés (règles dans lib/game/markers.ts)
  const markerList = cityMarkers(game.plots, city), markerKey = JSON.stringify(markerList);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la liste ne change que si son contenu change
  const markers = useMemo(() => markerList, [markerKey]);
  // Enseignes des entreprises implantées : une par bâtiment « branch », dans l'ordre des implantations
  const branches = game.branches, holdings = game.holdings;
  const signs = useMemo(() => {
    const on = new Set(activeBranches({ branches, holdings }).map((b) => b.symbol));
    const out: Record<string, CitySign> = {};
    game.plots.filter((p) => p.id === "branch").forEach((p, i) => {
      const br = branches?.[i], asset = br && ASSET_BY_SYMBOL[br.symbol];
      if (!br || !asset) return;
      const e = BRANCH_EFFECTS[familyOf(asset)], active = on.has(br.symbol);
      out[`${p.x},${p.y}`] = { ...companyBadge(br.symbol), title: asset.name, text: active ? `${e.label} · ${num(e.jobs)} emplois` : "Site en sommeil", dim: !active };
    });
    return out;
  }, [game.plots, branches, holdings]);
  const outlook = hasResearch(game, "city_forecast") ? forecast(game) : null;
  const goals = goalStatuses(game, city);
  const toClaim = goals.filter((g) => g.done && !g.claimed).length;

  // Panneau au-dessus de la barre d'outils : palette, liste, stats, menu, ou fiche du bâtiment sélectionné
  let dock: React.ReactNode = null;
  if (tool === "build") {
    dock = <Palette key={buildCat} initialCat={buildCat} active={mode?.kind === "place" ? mode.id : null} onClose={() => { setTool(null); setMode(null); }}
      onPick={(id) => {
        setSelected(null);
        const off = mode?.kind === "place" && mode.id === id;
        setMode(off ? null : { kind: "place", id });
        if (!off && small) setTool(null); // petit écran : on replie la palette pour voir la carte
      }} />;
  } else if (tool === "goals") {
    dock = <DockPanel title="Progression de la ville" onClose={() => setTool(null)}><Progression city={city} population={game.population} goals={goals} onClaim={claimGoal} /></DockPanel>;
  } else if (tool === "firms") {
    dock = <DockPanel title="Entreprises implantées" onClose={() => setTool(null)}><Firms /></DockPanel>;
  } else if (tool === "list") {
    dock = <DockPanel title="Mes bâtiments" onClose={() => setTool(null)}><Owned onSelect={(t) => { setTool(null); setSelected(t); }} /></DockPanel>;
  } else if (tool === "stats") {
    dock = <DockPanel title="Statistiques" onClose={() => setTool(null)}><div className="space-y-4"><CityBars city={city} population={game.population} outlook={outlook} /><Budget city={city} /></div></DockPanel>;
  } else if (tool === "more") {
    dock = <DockPanel title="Options" onClose={() => setTool(null)}><MoreMenu /></DockPanel>;
  } else if (selectedPlot && !mode) {
    dock = <SelectedPanel plot={selectedPlot} city={city} confirmDemolish={tool === "demolish"}
      alert={markers.find((m) => m.x === selectedPlot.x && m.y === selectedPlot.y)}
      onFix={(cat) => { setSelected(null); setMode(null); setBuildCat(cat); setTool("build"); }}
      onUpgrade={() => upgrade({ x: selectedPlot.x, y: selectedPlot.y })}
      onCopy={() => { setSelected(null); setMode({ kind: "place", id: selectedPlot.id }); }}
      onMove={() => setMode({ kind: "move", id: selectedPlot.id, from: { x: selectedPlot.x, y: selectedPlot.y } })}
      onDemolish={() => { demolish(selectedPlot.id, { x: selectedPlot.x, y: selectedPlot.y }); setSelected(null); }}
      onClose={() => setSelected(null)} />;
  }

  // Bandeau d'aide : dit toujours quoi faire maintenant
  let hintText: React.ReactNode = null;
  if (mode?.kind === "place" && modeBuilding) hintText = <><b>{modeBuilding.name}</b> · {compactEur(modeBuilding.cost)}{capitalCost(modeBuilding) > 0 && <> + {capitalFmt(capitalCost(modeBuilding))}</>} — choisissez un carreau vert</>;
  else if (mode?.kind === "move" && modeBuilding) hintText = <>Déplacement de <b>{modeBuilding.name}</b> — choisissez un carreau vert</>;
  else if (tool === "move") hintText = <>Déplacer : {small ? "touchez" : "cliquez sur"} un bâtiment</>;
  else if (tool === "demolish" && !selectedPlot) hintText = <>Démolir : {small ? "touchez" : "cliquez sur"} un bâtiment</>;
  const cancel = () => { if (mode) setMode(null); else setTool(null); };

  const TOOLS: { id: Exclude<Tool, null>; label: string; icon: LucideIcon; on: boolean; cls?: string }[] = [
    { id: "build", label: "Construire", icon: Hammer, on: tool === "build" || mode?.kind === "place" },
    { id: "move", label: "Déplacer", icon: Move, on: tool === "move" || mode?.kind === "move" },
    { id: "demolish", label: "Démolir", icon: Trash2, on: tool === "demolish" },
    { id: "goals", label: "Objectifs", icon: Target, on: tool === "goals" },
    ...(featureOpen(game, "firms") ? [{ id: "firms" as const, label: "Entreprises", icon: Handshake, on: tool === "firms" }] : []),
    { id: "list", label: "Bâtiments", icon: LayoutList, on: tool === "list" },
    { id: "stats", label: "Stats", icon: BarChart3, on: tool === "stats", cls: "lg:hidden" },
    { id: "more", label: "Options", icon: Ellipsis, on: tool === "more" },
  ];

  return (
    <div className="city-stage">
      <IsoCity plots={game.plots} height="fill" initialZoom={phone ? 1.3 : 1} mode={mode} selected={selected} onTileClick={onTileClick}
        markers={markers} signs={signs} mapSize={mapSize(game)} selectedTone={tool === "demolish" ? "danger" : "primary"}
        padTop={small ? 64 : 72} padBottom={small ? 76 : 84} zoomClass="left-3 top-[76px]" hint={false} />

      {/* Haut : ressources à gauche, budget à droite */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 p-3">
        <div className="pointer-events-auto -m-3 flex min-w-0 flex-1 gap-2 overflow-x-auto no-scrollbar p-3">
          <button onClick={() => pickTool("more")} title="Options de la ville"
            className="hud flex shrink-0 items-center gap-2 px-3 py-2 text-left hover:border-slate-300">
            <Building2 size={16} className="text-primary" />
            <span className="leading-tight">
              <span className="block max-w-[150px] truncate text-[13px] font-semibold">{game.cityName}</span>
              <span className="block text-[10px] text-muted">{CITY_RANKS[city.rank].name} · Jour {game.day}</span>
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
            {mode?.kind === "place" && modeBuilding && [1, 5].map((k) => (
              <button key={k} onClick={() => { buildAuto(mode.id, k); if (!canPay(useGame.getState().game, modeBuilding)) setMode(null); }}
                disabled={!canPay(game, modeBuilding)} title={`Construire ${k > 1 ? `${k} bâtiments` : "un bâtiment"}, placé${k > 1 ? "s" : ""} automatiquement`}
                className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-primary hover:bg-blue-50 disabled:opacity-50">Auto ×{k}</button>
            ))}
            <button onClick={cancel} className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold hover:bg-white/25">{small ? "Annuler" : "Annuler (Échap)"}</button>
          </div>
        </div>
      )}

      {/* Bas : outils à gauche, état de la ville à droite */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end gap-3 p-3">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          {dock && <div className="pointer-events-auto w-full max-w-[900px]">{dock}</div>}
          {undo && !dock && (
            <button onClick={undoLast} className="hud pointer-events-auto appear inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold hover:border-slate-300">
              <Undo2 size={14} className="text-primary" />Annuler : {undo.label.toLowerCase()}
            </button>
          )}
          <div className="hud pointer-events-auto flex max-w-full gap-1 overflow-x-auto no-scrollbar p-1.5" role="toolbar" aria-label="Outils de la ville">
            {TOOLS.map(({ id, label, icon: Icon, on, cls = "" }) => (
              <button key={id} onClick={() => pickTool(id)} aria-pressed={on} title={label} aria-label={label}
                className={`relative flex h-11 min-w-[40px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-2 text-[12px] font-semibold transition-colors sm:h-auto sm:min-w-0 sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-[13px] ${cls} ${
                  on ? (id === "demolish" ? "bg-danger text-white" : "bg-primary text-white") : "text-ink hover:bg-slate-100"}`}>
                <Icon size={18} strokeWidth={1.9} /><span className={on ? "" : "hidden sm:inline"}>{label}</span>
                {id === "goals" && toClaim > 0 && (
                  <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-success px-1 text-[10px] font-bold leading-none text-white" aria-label={`${toClaim} subvention${toClaim > 1 ? "s" : ""} à encaisser`}>{toClaim}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto hidden w-[250px] shrink-0 lg:block">
          <div className="hud p-3.5"><CityBars city={city} population={game.population} outlook={outlook} /></div>
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
    ["Impôts", city.income.taxes], ["Entreprises", city.income.buildings - city.tourism.revenue], ["Tourisme", city.tourism.revenue], ["Exportations", city.income.exports], ["Dotation de l'État", city.income.grant],
    ["Dividendes reçus", city.income.dividends],
    ["Entretien", -city.expenses.maintenance], ["Importations", -city.expenses.imports], ["Dividendes versés", -city.expenses.dividends],
  ];
  const ev = city.event;
  return (
    <div>
      {/* Événement de la semaine : ce qui arrive à la ville, et pour combien de temps */}
      {ev && (
        <div className={`mb-3 rounded-[10px] px-2.5 py-2 text-[12px] ${ev.kind === "bonus" ? "bg-success-soft text-emerald-800" : "bg-danger-soft text-red-800"}`}>
          <div className="flex items-center gap-1.5 font-semibold">{ev.kind === "bonus" ? <Sparkles size={13} /> : <CloudLightning size={13} />}{ev.name}</div>
          <div className="mt-0.5">{ev.effect}. Encore {ev.daysLeft} jour{ev.daysLeft > 1 ? "s" : ""}.{ev.strength < 1 && " Vos équipements l'atténuent."}</div>
        </div>
      )}
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
function CityBars({ city, population, outlook }: { city: CityStats; population: number; outlook: ReturnType<typeof forecast> | null }) {
  const game = useGame((s) => s.game);
  const full = city.freeHousing === 0 && city.housing > 0;
  const jobless = city.unemploymentRate > 0.08;
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">État de la ville</div>
      <Bar icon={Users} label="Logements" value={`${num(population)} / ${num(city.housing)}`} ratio={population / Math.max(1, city.housing)} tone={full ? "bg-warning" : "bg-success"} />
      <Bar icon={Briefcase} label="Emplois" value={`chômage ${pctPlain(city.unemploymentRate)}`} ratio={city.employed / Math.max(1, city.jobs)} tone={jobless ? "bg-danger" : "bg-success"} />
      <Bar icon={Smile} label="Satisfaction" value={pctPlain(city.satisfaction)} ratio={city.satisfaction} tone={city.satisfaction < 0.6 ? "bg-danger" : city.satisfaction < 0.75 ? "bg-warning" : "bg-success"} />
      {city.factors.some((f) => f.value < 0) && (
        <ul className="space-y-0.5 text-[11px]">
          {city.factors.filter((f) => f.value < 0).map((f) => (
            <li key={f.label} className="flex justify-between gap-3"><span className="text-muted">{f.label}</span><span className="font-semibold tabular text-danger">−{Math.round(-f.value * 100)} pts</span></li>
          ))}
        </ul>
      )}
      <div className="flex justify-between border-t border-line pt-2 text-[12px]">
        <span className="text-muted">Croissance</span>
        <span className={`font-semibold tabular ${tone(city.growth)}`}>{city.growth >= 0 ? "+" : "−"}{num(Math.abs(city.growth))} hab. / jour</span>
      </div>
      {city.wear >= 0.05 && <Renovate />}
      {city.specialty && game.country && (
        <div className="text-[12px]" title="Spécialité du pays où votre ville est installée (page Monde)">
          <span className="text-muted">Pays · </span><span className="font-semibold">{specialtyText(game.country)}</span>
        </div>
      )}
      {outlook && (
        <div className="flex justify-between gap-3 text-[12px]" title="Si rien ne change : même ville, mêmes bâtiments">
          <span className="shrink-0 text-muted">Dans {FORECAST_DAYS} j</span>
          <span className="text-right font-semibold tabular">{num(outlook.population)} hab. · <span className={tone(outlook.net)}>{signedEur(outlook.net)}/j</span></span>
        </div>
      )}
    </div>
  );
}

/** Vétusté de la ville et bouton de rénovation. */
function Renovate() {
  const game = useGame((s) => s.game);
  const renovate = useGame((s) => s.renovate);
  const cost = renovateCost(game), wear = game.wear ?? 0;
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]" title="La vétusté augmente l'entretien et pèse sur la satisfaction. Une rénovation la remet à zéro.">
      <span className="flex items-center gap-1.5 whitespace-nowrap"><Wrench size={13} className={wear >= 0.5 ? "text-danger" : "text-primary"} /><span className="text-muted">Vétusté</span> <b className="tabular">{pctPlain(wear)}</b></span>
      <button onClick={renovate} disabled={cost > game.cash} className="whitespace-nowrap rounded-[8px] border border-line px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Rénover · {compactEur(cost)}</button>
    </div>
  );
}

/** Entreprises dont le joueur est actionnaire et qui ont (ou peuvent avoir) un site dans la ville. */
function Firms() {
  const game = useGame((s) => s.game);
  const quotes = useGame((s) => s.quotes);
  const openBranch = useGame((s) => s.openBranch);
  const closeBranch = useGame((s) => s.closeBranch);
  const active = new Set(activeBranches(game).map((b) => b.symbol));
  const mine = game.branches ?? [];
  const limit = branchLimit(game), cost = branchCost(game);
  const candidates = Object.entries(game.holdings)
    .map(([symbol, h]) => ({ asset: ASSET_BY_SYMBOL[symbol], value: h.qty * (quotes[symbol]?.price ?? h.avgCost) }))
    .filter((c) => c.asset?.kind === "stock" && !mine.some((b) => b.symbol === c.asset.symbol))
    .sort((a, b) => b.value - a.value);
  const effect = (symbol: string) => BRANCH_EFFECTS[familyOf(ASSET_BY_SYMBOL[symbol])];
  const line = (symbol: string) => {
    const e = effect(symbol);
    return [`${num(e.jobs)} emplois`, `+${num(e.revenue)} €/j`, e.energyProd ? `+${num(e.energyProd)} énergie` : "", e.serves ? `soigne ${num(e.serves)} hab.` : ""].filter(Boolean).join(" · ");
  };
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">
        Une entreprise dont vous détenez au moins {compactEur(BRANCH_MIN_VALUE)} d&apos;actions peut ouvrir un site dans votre ville : son bâtiment apparaît sur la carte avec son enseigne. Il tourne tant que vous gardez cette participation, quel que soit le cours.
      </p>
      <div className="flex justify-between text-[12px]"><span className="font-semibold">Sites ouverts</span><span className="tabular text-muted">{mine.length} / {limit} (un de plus à chaque rang)</span></div>
      {mine.length > 0 && (
        <ul className="space-y-2">
          {mine.map((b) => {
            const a = ASSET_BY_SYMBOL[b.symbol], on = active.has(b.symbol);
            return (
              <li key={b.symbol} className="flex items-center gap-3 rounded-[10px] border border-line p-2.5">
                <CompanyLogo symbol={b.symbol} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{a?.name ?? b.symbol} <span className="font-normal text-muted">· {effect(b.symbol).label}</span></div>
                  <div className={`text-[11px] ${on ? "text-muted" : "text-danger"}`}>{on ? line(b.symbol) : "En sommeil : vous ne détenez plus la participation de départ"}</div>
                </div>
                <ConfirmButton onConfirm={() => closeBranch(b.symbol)} confirmLabel="Confirmer" className="shrink-0 text-[11px] font-semibold text-danger hover:underline">Fermer</ConfirmButton>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line pt-3">
        <div className="mb-2 text-[12px] font-semibold">Vos participations</div>
        {candidates.length === 0 ? <p className="text-[12px] text-muted">Aucune autre entreprise en portefeuille. Les actions s&apos;achètent dans Marchés.</p> : (
          <ul className="space-y-2">
            {candidates.map(({ asset, value }) => {
              const enough = value >= BRANCH_MIN_VALUE, full = mine.length >= limit;
              return (
                <li key={asset.symbol} className="flex items-center gap-3">
                  <CompanyLogo symbol={asset.symbol} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{asset.name} <span className="text-muted">· {compactEur(value)} détenus</span></div>
                    <div className="text-[11px] text-muted">{effect(asset.symbol).label} : {line(asset.symbol)}</div>
                  </div>
                  <Button onClick={() => openBranch(asset.symbol)} disabled={!enough || full || cost > game.cash} className="shrink-0 !px-3"
                    title={!enough ? `Participation inférieure à ${compactEur(BRANCH_MIN_VALUE)}` : full ? "Limite atteinte pour ce rang de ville" : cost > game.cash ? "Liquidités insuffisantes" : undefined}>
                    {enough ? `Implanter · ${compactEur(cost)}` : "Participation trop faible"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
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

/** Rang de la ville, prochain palier et objectifs (subventions à encaisser). */
function Progression({ city, population, goals, onClaim }: { city: CityStats; population: number; goals: ReturnType<typeof goalStatuses>; onClaim: (id: string) => void }) {
  const game = useGame((s) => s.game);
  const buildProject = useGame((s) => s.buildProject);
  const expandTerritory = useGame((s) => s.expandTerritory);
  const chooseOrientation = useGame((s) => s.chooseOrientation);
  const land = nextTerritory(game), size = mapSize(game), ground = landUse(game);
  const late = featureOpen(game, "projects"), canOrient = featureOpen(game, "orientation");
  const switchCost = orientationCost(game);
  const toCome = FEATURES.filter((f) => !featureOpen(game, f.id));
  const rank = CITY_RANKS[city.rank], next = CITY_RANKS[city.rank + 1];
  const unlocks = next ? BUILDINGS.filter((b) => b.buildable !== false && (b.unlockPop ?? 0) > population && (b.unlockPop ?? 0) <= next.pop) : [];
  const needs = next ? SERVICE_IDS.filter((id) => SERVICES[id].needPop > population && SERVICES[id].needPop <= next.pop) : [];
  // À encaisser d'abord, puis en cours, puis déjà encaissés
  const order = (g: (typeof goals)[number]) => (g.claimed ? 2 : g.done ? 0 : 1);
  const sorted = [...goals].sort((a, b) => order(a) - order(b));
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold"><Trophy size={15} className="text-primary" />{rank.name}</span>
          <span className="flex items-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700" title="Prestige : rang, objectifs encaissés et grands projets"><Sparkles size={11} />{num(prestige(game))} prestige</span>
            Rang {city.rank + 1} / {CITY_RANKS.length}
          </span>
        </div>
        {next ? (
          <>
            <div className="mb-1 mt-2 flex justify-between text-[12px]"><span className="text-muted">Prochain rang : <b className="text-ink">{next.name}</b></span><span className="tabular text-muted">{num(population)} / {num(next.pop)} hab.</span></div>
            <Progress value={(population - rank.pop) / (next.pop - rank.pop)} tone="bg-primary" />
            {(unlocks.length > 0 || needs.length > 0) && (
              <p className="mt-2 text-[12px] text-muted">
                {unlocks.length > 0 && <>D&apos;ici là, vous débloquez : <span className="text-ink">{unlocks.map((b) => b.name).join(", ")}</span>. </>}
                {needs.length > 0 && <>Les habitants attendront : <span className="text-ink">{needs.map((id) => SERVICES[id].label.toLowerCase()).join(", ")}</span>.</>}
              </p>
            )}
          </>
        ) : <p className="mt-2 text-[12px] text-muted">Rang maximal atteint.</p>}
      </div>
      {canOrient && (
        <div className="border-t border-line pt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Orientation de la ville</div>
          <p className="mb-2 text-[11px] text-muted">
            {game.orientation ? `Aujourd'hui : ${ORIENTATION_BY_ID[game.orientation].name}. En changer coûte ${compactEur(switchCost)}.` : "Un choix qui engage : chaque orientation a un avantage et un revers. Le premier choix est gratuit."}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ORIENTATIONS.map((o) => {
              const mine = game.orientation === o.id;
              return (
                <li key={o.id} className={`rounded-[10px] border p-2.5 ${mine ? "border-primary bg-primary-soft" : "border-line"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{o.name}</span>
                    {mine ? <span className="text-[11px] font-semibold text-primary">Choisie</span>
                      : <ConfirmButton onConfirm={() => chooseOrientation(o.id)} disabled={switchCost > game.cash} confirmLabel="Confirmer"
                          className="rounded-[8px] border border-line bg-card px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">{switchCost ? compactEur(switchCost) : "Choisir"}</ConfirmButton>}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-700">{o.pro}</div>
                  <div className="text-[11px] text-red-700">{o.con}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {toCome.length > 0 && (
        <div className="border-t border-line pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">À venir avec les prochains rangs</div>
          <ul className="space-y-1 text-[12px]">
            {toCome.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 text-slate-600"><span className="inline-flex items-center gap-1.5"><Lock size={13} strokeWidth={2.2} className="text-amber-600" />{f.label}</span><LockTag className="shrink-0">{CITY_RANKS[f.rank].name}</LockTag></li>)}
          </ul>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[13px] font-medium"><span>Territoire : {size} × {size} carreaux</span><span className={`text-[11px] tabular ${ground.used >= ground.total * LAND_ALMOST_FULL ? "font-semibold text-amber-700" : "text-muted"}`}>{num(ground.used)} / {num(ground.total)} occupés</span></div>
          <div className="my-1.5"><Progress value={ground.used / ground.total} tone={ground.used >= ground.total * LAND_ALMOST_FULL ? "bg-warning" : "bg-primary"} /></div>
          <div className="text-[11px] text-muted">
            {!land ? "Taille maximale atteinte." : city.rank < land.minRank ? `Agrandissement à ${land.size} × ${land.size} au rang « ${CITY_RANKS[land.minRank].name} ».` : `Agrandir à ${land.size} × ${land.size} : 4 carreaux de plus de chaque côté.`}
          </div>
        </div>
        {land && (city.rank < land.minRank ? <LockTag className="shrink-0 tabular">{compactEur(land.cost)}</LockTag>
          : <ConfirmButton onConfirm={expandTerritory} disabled={land.cost > game.cash} confirmLabel="Confirmer"
              className="shrink-0 rounded-[10px] bg-primary px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{compactEur(land.cost)}</ConfirmButton>)}
      </div>
      {late && (
      <div className="border-t border-line pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Grands projets · {game.projects?.length ?? 0} / {PROJECTS.length}</div>
        <ul className="space-y-2.5">
          {PROJECTS.map((p) => {
            const done = !!game.projects?.includes(p.id), locked = city.rank < p.minRank;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-[13px] font-medium ${locked ? "text-muted" : ""}`}>{p.name}</div>
                  <div className="text-[11px] text-muted">{p.description} +{num(p.prestige)} prestige{locked ? ` · rang « ${CITY_RANKS[p.minRank].name} »` : ""}</div>
                </div>
                {done ? <span className="shrink-0 text-[11px] font-semibold text-success">Achevé</span>
                  : locked ? <LockTag className="shrink-0 tabular">{compactEur(p.cost)}</LockTag>
                  : <ConfirmButton onConfirm={() => buildProject(p.id)} disabled={p.cost > game.cash} confirmLabel="Confirmer"
                      className="shrink-0 rounded-[10px] bg-primary px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{compactEur(p.cost)}</ConfirmButton>}
              </li>
            );
          })}
        </ul>
      </div>
      )}
      <div className="border-t border-line pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Objectifs · {goals.filter((g) => g.claimed).length} / {goals.length}</div>
        <ul className="space-y-2.5">
          {sorted.map(({ goal, progress, done, claimed }) => (
            <li key={goal.id} className={claimed ? "opacity-55" : ""}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{goal.label}</div>
                  <div className="text-[11px] text-muted">
                    {goal.minPop ? `Avec au moins ${num(goal.minPop)} habitants · ` : ""}subvention {compactEur(goal.reward)}
                  </div>
                </div>
                {claimed ? <span className="shrink-0 text-[11px] font-semibold text-success">Encaissée</span>
                  : done ? <Button onClick={() => onClaim(goal.id)} className="shrink-0">Encaisser</Button>
                  : <span className="shrink-0 text-[12px] font-semibold tabular text-muted">{pctPlain(progress)}</span>}
              </div>
              {!claimed && !done && <div className="mt-1.5"><Progress value={progress} tone="bg-primary" /></div>}
            </li>
          ))}
        </ul>
      </div>
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

/** Mode test : la partie d'un compte de test (connexion par identifiant et mot de passe) y est toujours.
 *  `kept` = une vraie partie est gardée de côté et peut être reprise. */
function TestMode() {
  const sandbox = useGame((s) => !!s.game.sandbox);
  const kept = useGame((s) => !!s.game.sandbox?.saved);
  const { leaveSandbox, skipDay, forceEvent, notify } = useGame.getState();
  if (!sandbox) return null;
  const tool = "rounded-[8px] border border-amber-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-amber-900 hover:bg-amber-100";
  return (
    <div className="rounded-[12px] border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
      <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold"><FlaskConical size={15} />Compte de test</div>
          <p>Argent et capital sans limite, tous les rangs, recherches et niveaux de Banque débloqués.{kept && " Votre vraie partie est gardée de côté."}</p>
          <p className="mt-1">Attention : ce que vous faites avec les autres joueurs (parts achetées, alliance, blocus) est réel pour eux.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button className={tool} onClick={() => { skipDay(1); notify("Un jour de ville est passé"); }}>+1 jour</button>
            <button className={tool} onClick={() => { skipDay(24); notify("24 jours de ville sont passés"); }}>+24 jours</button>
            <button className={tool} onClick={() => { const name = forceEvent(); notify(name ? `Événement déclenché : ${name}` : "Aucun événement possible dans cette ville", name ? "ok" : "error"); }}>Déclencher un événement</button>
            {kept && <ConfirmButton onConfirm={leaveSandbox} confirmLabel="Confirmer : revenir à ma vraie partie" className={tool}>Quitter le mode test</ConfirmButton>}
          </div>
          <p className="mt-2">Pour revenir à votre partie, déconnectez-vous (menu du compte, en haut) puis reconnectez-vous avec Discord.</p>
    </div>
  );
}

function MoreMenu() {
  const skipDay = useGame((s) => s.skipDay);
  const reset = useGame((s) => s.reset);
  return (
    <div className="space-y-4">
      <TestMode />
      <RenameCity />
      <ul className="list-disc space-y-1.5 pl-4 text-[12px] text-muted">
        <li>60 % des habitants cherchent un emploi.</li>
        <li>Les habitants arrivent s&apos;il y a des logements libres, surtout si des emplois les attendent.</li>
        <li>Les déficits d&apos;énergie et de nourriture sont importés automatiquement, au prix fort. Les surplus sont exportés à {EXPORT_RATIO * 100} % du prix.</li>
        <li>Les usines et les centrales polluent ; parcs, écoquartiers et exploitations agricoles absorbent la pollution.</li>
        <li>La vétusté monte chaque jour à partir du rang « Bourg » : elle augmente l&apos;entretien jusqu&apos;à la prochaine rénovation.</li>
        <li>En grandissant, la ville attend des équipements publics (parcs, écoles, hôpitaux) : sans eux, la satisfaction baisse, donc les impôts et la croissance aussi.</li>
        <li>Entretien : {MAINTENANCE_RATE * 100} % du coût par jour. Déplacer est gratuit. Démolir rembourse {DEMOLISH_REFUND * 100} %.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        {/* Outil de test : absent du site publié */}
        {DEV && <Button variant="secondary" onClick={() => skipDay(1)} title="Outil de test (développement uniquement)" className="inline-flex items-center gap-1.5"><FastForward size={15} />Avancer d&apos;un jour</Button>}
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

/** Explication d'une pastille : ce qu'elle signale, si c'est grave, et quoi faire. */
function MarkerAlert({ marker, onFix }: { marker: CityMarker; onFix: (cat: Category) => void }) {
  const bad = MARKER_LEVEL[marker.kind] === "bad";
  const level = LEVEL_TEXT[bad ? "bad" : "warn"], fix = MARKER_FIX[marker.kind];
  const Icon = bad ? CircleAlert : TriangleAlert;
  return (
    <div role="status" className={`mb-2.5 rounded-[10px] border p-2.5 text-[12px] ${bad ? "border-red-200 bg-danger-soft" : "border-amber-200 bg-warning-soft"}`}>
      <div className={`flex items-center gap-1.5 font-semibold ${bad ? "text-red-700" : "text-amber-700"}`}>
        <Icon size={15} className="shrink-0" />
        <span>{level.word}</span><span className="font-normal opacity-80">· {level.sub}</span>
      </div>
      <p className="mt-1 font-medium text-ink">{marker.label}</p>
      <p className="mt-0.5 text-muted">{fix.text}</p>
      <button type="button" onClick={() => onFix(fix.cat)}
        className={`mt-2 inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-white ${bad ? "bg-danger hover:bg-red-600" : "bg-amber-600 hover:bg-amber-700"}`}>
        <Hammer size={13} />{fix.cta}
      </button>
    </div>
  );
}

function Palette({ active, onPick, onClose, initialCat = "housing" }: { active: string | null; onPick: (id: string) => void; onClose: () => void; initialCat?: Category }) {
  const game = useGame((s) => s.game);
  const city = useMemo(() => computeCity(game), [game]);
  const [cat, setCat] = useState<Category>(initialCat);
  return (
    <section className="hud appear p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible" role="tablist" aria-label="Catégories"
          onWheel={(e) => { if (e.deltaY && !e.deltaX) e.currentTarget.scrollLeft += e.deltaY; }}>
          {BUILD_CATS.map((c) => {
            const Icon = CAT_ICON[c];
            return (
              <button key={c} role="tab" aria-selected={c === cat} onClick={() => setCat(c)}
                className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${c === cat ? "bg-primary text-white" : "bg-slate-50 text-muted hover:bg-slate-100"}`}>
                <Icon size={14} />{CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
        <button onClick={onClose} aria-label="Fermer" className="shrink-0 rounded-[6px] p-1 text-muted hover:bg-slate-100"><X size={16} /></button>
      </div>
      {/* key : changer de catégorie repart du début de la liste (le défilement ne reste pas où il était) */}
      <ul key={cat} className="flex gap-2 overflow-x-auto pb-1 sm:max-h-[min(38vh,270px)] sm:flex-wrap sm:overflow-x-visible sm:overflow-y-auto" onWheel={(e) => { if (e.deltaY && !e.deltaX) e.currentTarget.scrollLeft += e.deltaY; }}>
        {BUILDINGS.filter((b) => b.category === cat && b.buildable !== false).map((b) => {
          const locked = !!b.unlockPop && game.population < b.unlockPop;
          const owned = game.buildings[b.id] ?? 0;
          const net = netPerDay(b);
          const fx = buildPreview(game, b.id, city);
          const isActive = active === b.id;
          const cc = capitalCost(b), noCapital = cc > (game.capital ?? 0);
          const Icon = CAT_ICON[b.category];
          return (
            <li key={b.id} className="w-[212px] shrink-0 sm:w-[calc(50%-4px)] md:w-[calc(33.333%-6px)] xl:w-[calc(25%-6px)]">
              <button disabled={locked || b.cost > game.cash || noCapital} onClick={() => onPick(b.id)}
                className={`flex h-full w-full flex-col gap-1.5 rounded-[12px] border p-2.5 text-left transition-colors disabled:cursor-not-allowed ${locked ? "border-dashed border-slate-300 bg-slate-50" : "disabled:opacity-55"} ${isActive ? "border-primary bg-primary-soft" : locked ? "" : "border-line hover:border-slate-300 hover:bg-slate-50"}`}>
                <span className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${locked ? "bg-slate-200 text-slate-500" : CAT_TINT[b.category]}`}>{locked ? <Lock size={15} strokeWidth={2.2} /> : <Icon size={16} />}</span>
                  <span className={`min-w-0 flex-1 ${locked ? "text-slate-500" : ""}`}>
                    <span className="block truncate text-[13px] font-semibold">{b.name}{owned > 0 && <span className="ml-1.5 text-[11px] text-primary">×{owned}</span>}</span>
                    <span className="block text-[12px] font-bold tabular">{compactEur(b.cost)}{cc > 0 && <span className={locked ? "" : noCapital ? "text-danger" : "text-violet-700"} title="Capital : produit par vos placements en bourse"> + {capitalFmt(cc)}</span>}</span>
                  </span>
                </span>
                <Effects b={b} />
                {!locked && (
                  <span className="block rounded-[8px] bg-slate-50 px-2 py-1 text-[11px] tabular" title="Ce que ce bâtiment changerait dans votre ville telle qu'elle est aujourd'hui">
                    <span className="text-muted">Dans votre ville : </span>
                    <span className={`font-semibold ${tone(fx.net)}`}>{signedEur(fx.net)}/j</span>
                    {Math.abs(fx.satisfaction) >= 0.005 && <span className={`font-semibold ${tone(fx.satisfaction)}`}> · {fx.satisfaction > 0 ? "+" : "−"}{Math.abs(Math.round(fx.satisfaction * 100))} pts</span>}
                    {fx.growth > 0 && <span className="font-semibold text-success"> · +{num(fx.growth)} hab./j</span>}
                  </span>
                )}
                <span className="mt-auto block text-[11px] text-muted">
                  {locked ? <LockTag>Dès {num(b.unlockPop!)} habitants</LockTag>
                    : b.cost > game.cash ? "Liquidités insuffisantes"
                    : noCapital ? `Capital insuffisant (${capitalFmt(game.capital ?? 0)}) : placez en bourse`
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

function SelectedPanel({ plot, city, confirmDemolish, alert, onFix, onUpgrade, onCopy, onMove, onDemolish, onClose }: { plot: Plot; city: CityStats; confirmDemolish: boolean; alert?: CityMarker; onFix: (cat: Category) => void; onUpgrade: () => void; onCopy: () => void; onMove: () => void; onDemolish: () => void; onClose: () => void }) {
  const game = useGame((s) => s.game);
  const b = BUILDING_BY_ID[plot.id];
  if (!b) return null;
  const offer = upgradeOffer(game, plot.id);
  const next = offer ? BUILDING_BY_ID[offer.to] : null;
  const canUpgrade = hasResearch(game, "city_upgrade");
  const popLocked = !!next?.unlockPop && game.population < next.unlockPop;
  const firm = plot.id === "branch" ? branchAt(game, plot.x, plot.y) : undefined;
  const firmAsset = firm ? ASSET_BY_SYMBOL[firm.symbol] : undefined;
  const audit = !firm && hasResearch(game, "city_audit") ? buildingAudit(plot.id, city) : null;
  const Icon = CAT_ICON[b.category];
  const refund = compactEur(b.cost * DEMOLISH_REFUND);
  return (
    <section className={`hud appear w-full max-w-[380px] p-3.5 ${confirmDemolish ? "border-red-200" : ""}`}>
      <div className="mb-2.5 flex items-start gap-3">
        {firm ? <CompanyLogo symbol={firm.symbol} size={40} /> : <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${CAT_TINT[b.category]}`}><Icon size={19} /></span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{firmAsset?.name ?? b.name}</div>
          <div className="text-[12px] text-muted">{firmAsset ? `${BRANCH_EFFECTS[familyOf(firmAsset)].label} · entreprise implantée` : `${CATEGORY_LABELS[b.category]} · entretien ${eur(b.cost * MAINTENANCE_RATE)}/j`}</div>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="rounded-[6px] p-1 text-muted hover:bg-slate-100"><X size={16} /></button>
      </div>
      {alert && !confirmDemolish && <MarkerAlert marker={alert} onFix={onFix} />}
      <Effects b={b} />
      {audit && (
        <dl className="mt-2.5 grid grid-cols-3 gap-1.5 text-[11px]">
          <div className="rounded-[8px] bg-slate-50 px-2 py-1.5"><dt className="text-muted">Revenus</dt><dd className="font-semibold tabular">{signedEur(audit.revenue)}</dd></div>
          <div className="rounded-[8px] bg-slate-50 px-2 py-1.5"><dt className="text-muted">Ressources</dt><dd className={`font-semibold tabular ${tone(audit.resources)}`}>{signedEur(audit.resources)}</dd></div>
          <div className="rounded-[8px] bg-slate-50 px-2 py-1.5"><dt className="text-muted">Net / jour</dt><dd className={`font-semibold tabular ${tone(audit.net)}`}>{signedEur(audit.net)}</dd></div>
          {b.jobs && audit.staffing < 0.999 ? <p className="col-span-3 text-muted">Personnel : {pctPlain(audit.staffing)} des postes pourvus dans la ville.</p> : null}
        </dl>
      )}
      {next && offer && !confirmDemolish && (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-line p-2.5">
          <ArrowUpCircle size={18} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-[12px]">
            <div className="font-semibold">Améliorer en {next.name}</div>
            <div className="text-muted">
              {!canUpgrade ? "Recherche « Rénovation urbaine » requise"
                : popLocked ? `Débloqué à ${num(next.unlockPop!)} habitants`
                : offer.cost > game.cash ? `${compactEur(offer.cost)} · liquidités insuffisantes`
                : offer.capital > (game.capital ?? 0) ? `${compactEur(offer.cost)} + ${capitalFmt(offer.capital)} · capital insuffisant`
                : `${offer.cost < next.cost ? `${compactEur(offer.cost)} au lieu de ${compactEur(next.cost)}` : compactEur(offer.cost)}${offer.capital > 0 ? ` + ${capitalFmt(offer.capital)}` : ""}`}
            </div>
          </div>
          <Button onClick={onUpgrade} disabled={!canUpgrade || popLocked || offer.cost > game.cash || offer.capital > (game.capital ?? 0)} className="shrink-0 !px-3">{canUpgrade ? "Améliorer" : <Lock size={14} />}</Button>
        </div>
      )}
      {firmAsset && (() => {
        const e = BRANCH_EFFECTS[familyOf(firmAsset)], on = activeBranches(game).some((x) => x.symbol === firmAsset.symbol);
        return <p className={`text-[12px] ${on ? "text-muted" : "text-danger"}`}>{on ? `${num(e.jobs)} emplois · +${num(e.revenue)} €/j. Le site tourne tant que vous gardez votre participation ; il se ferme depuis le bouton Entreprises.` : "En sommeil : vous ne détenez plus la participation de départ."}</p>;
      })()}
      {b.buildable === false && !firm && <p className="mt-2.5 text-[12px] text-muted">Bâtiment d&apos;origine : il peut être déplacé mais pas démoli.</p>}
      {confirmDemolish ? (
        <div className="mt-3 flex gap-2">
          <Button variant="danger" onClick={onDemolish} className="flex-1">Démolir (+{refund})</Button>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {b.buildable !== false && (
            <Button variant="secondary" onClick={onCopy} disabled={!canPay(game, b)} title={`Poser un autre ${b.name} (${compactEur(b.cost)})`} className="inline-flex flex-1 items-center justify-center gap-1.5 !px-2"><Copy size={15} />Copier</Button>
          )}
          <Button variant="secondary" onClick={onMove} className="inline-flex flex-1 items-center justify-center gap-1.5 !px-2"><Move size={15} />Déplacer</Button>
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

function Effects({ b }: { b: BuildingType }) {
  const chips: { text: string; cls: string; icon?: LucideIcon }[] = [];
  if (b.housing) chips.push({ text: `+${num(b.housing)} hab.`, cls: "bg-blue-50 text-blue-700" });
  if (b.jobs) chips.push({ text: `${num(b.jobs)} emplois`, cls: "bg-slate-100 text-slate-700" });
  if (b.revenue) chips.push({ text: `+${num(b.revenue)} €/j`, cls: "bg-success-soft text-emerald-700" });
  if (b.energyProd) chips.push({ text: `+${num(b.energyProd)}`, cls: "bg-amber-50 text-amber-700", icon: Zap });
  if (b.foodProd) chips.push({ text: `+${num(b.foodProd)}`, cls: "bg-lime-50 text-lime-700", icon: Wheat });
  if (b.serves) chips.push({ text: `dessert ${num(b.serves)} hab.`, cls: "bg-emerald-50 text-emerald-700" });
  if (b.pollution) chips.push({ text: b.pollution > 0 ? `pollution +${num(b.pollution)}` : `pollution −${num(-b.pollution)}`, cls: b.pollution > 0 ? "bg-slate-200 text-slate-700" : "bg-emerald-50 text-emerald-700" });
  if (b.energyUse) chips.push({ text: `−${num(b.energyUse)}`, cls: "bg-danger-soft text-red-700", icon: Zap });
  // Effets de ville : ce que le bâtiment change ailleurs dans le jeu
  const special = "bg-violet-50 text-violet-700", p100 = (v: number) => Math.round(v * 100);
  if (b.tourist) chips.push({ text: "tourisme", cls: special });
  if (b.visitors) chips.push({ text: `visiteurs +${p100(b.visitors)} %`, cls: special });
  if (b.growthBoost) chips.push({ text: `arrivées +${p100(b.growthBoost)} %`, cls: special });
  if (b.exportBonus) chips.push({ text: `exports +${p100(b.exportBonus)} pts`, cls: special });
  if (b.wearCut) chips.push({ text: `vétusté −${p100(b.wearCut)} %`, cls: special });
  if (b.capitalBoost) chips.push({ text: `capital +${p100(b.capitalBoost)} %`, cls: special });
  if (b.joy) chips.push({ text: `satisfaction +${p100(b.joy)} pt${p100(b.joy) > 1 ? "s" : ""}`, cls: special });
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
