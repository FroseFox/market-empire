"use client";
// Schémas et petites simulations du wiki. Tous les chiffres viennent de la configuration du jeu :
// ce que le joueur manipule ici se comporte exactement comme dans sa partie.
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, Building2, Factory, Gem, Home, Landmark, LineChart, Lock, Search, Sprout, Store, Trees, TriangleAlert, Zap, Briefcase } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  BANK, BUILDINGS, BUILDING_BY_ID, CAPITAL, CATEGORY_LABELS, CITY_EFFECT_CAPS, CITY_RANKS, FEATURES, LEVERAGE, PROJECTS, SHARES, TERRITORY, TOURISM, UPGRADES,
  type BuildingType, type Category,
} from "@/lib/game/config";
import { capitalCost, sharePrice, shareDividend } from "@/lib/game/engine";
import { requestThumb } from "@/lib/city3d/thumb";
import { compactEur, eur, num, capitalFmt, signedEur } from "@/lib/format";
import { Demo, Slider, Tag } from "./ui";

const fr = (v: number, d = 1) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });

// ─── La boucle du jeu ─────────────────────────────────────────

function Flow({ label }: { label: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 py-1 md:w-[92px] md:flex-col md:py-0">
      <span className="text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted md:order-first">{label}</span>
      <svg aria-hidden viewBox="0 0 60 14" className="hidden h-3.5 w-full md:block"><line x1="2" y1="7" x2="50" y2="7" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" className="wiki-flow" /><path d="M48 2 L57 7 L48 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <ArrowDown size={16} className="text-primary md:hidden" />
    </div>
  );
}
function Node({ icon: Icon, tint, title, text, delay }: { icon: LucideIcon; tint: string; title: string; text: string; delay: number }) {
  return (
    <div className="wiki-lift flex min-w-0 flex-1 items-center gap-3 rounded-[14px] border border-line bg-white p-3 md:flex-col md:items-center md:px-2.5 md:py-4 md:text-center">
      <span className={`wiki-bob grid h-11 w-11 shrink-0 place-items-center rounded-[13px] ${tint}`} style={{ animationDelay: `${delay}ms` }}><Icon size={22} strokeWidth={1.9} /></span>
      <div className="min-w-0"><div className="text-[14px] font-semibold leading-tight">{title}</div><div className="mt-0.5 text-[12px] leading-snug text-muted">{text}</div></div>
    </div>
  );
}
/** La boucle du jeu : bourse → capital → ville → banque → bourse. */
export function LoopDiagram() {
  return (
    <div className="mt-3 rounded-[16px] bg-gradient-to-br from-primary-soft via-white to-success-soft p-3 sm:p-4">
      <div className="flex flex-col md:flex-row md:items-stretch">
        <Node icon={LineChart} tint="bg-primary text-white" title="Bourse" text="Vous placez de l’argent sur de vrais actifs." delay={0} />
        <Flow label="produit" />
        <Node icon={Gem} tint="bg-violet-600 text-white" title="Capital ◆" text={`${fr(CAPITAL.dayRate * 100)} % de vos placements, chaque jour.`} delay={300} />
        <Flow label="construit" />
        <Node icon={Building2} tint="bg-emerald-600 text-white" title="Ville" text="Elle grandit et rapporte tous les jours." delay={600} />
        <Flow label="agrandit" />
        <Node icon={Landmark} tint="bg-amber-500 text-white" title="Banque" text="Son niveau fixe le levier de vos achats." delay={900} />
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-[12px] font-medium text-primary">
        <svg aria-hidden viewBox="0 0 120 14" className="h-3.5 w-24"><path d="M12 2 L3 7 L12 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><line x1="8" y1="7" x2="118" y2="7" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" className="wiki-flow" style={{ animationDirection: "reverse" }} /></svg>
        et un levier plus fort fait gagner (ou perdre) plus en bourse
      </div>
    </div>
  );
}

// ─── Levier ───────────────────────────────────────────────────

/** Simulation du levier : la même hausse ou la même baisse, à chaque niveau de Banque. */
export function LeverageDemo() {
  const [level, setLevel] = useState(1);
  const [stake, setStake] = useState(10_000);
  const [move, setMove] = useState(5);
  const lev = BANK[level].lev, exposure = stake * lev;
  const raw = exposure * (move / 100);
  const lost = raw <= -stake * (1 - LEVERAGE.liquidation);
  const result = lost ? -stake * (1 - LEVERAGE.liquidation) : raw;
  const liq = (1 - LEVERAGE.liquidation) / lev;
  const width = Math.min(100, (Math.abs(result) / stake) * 100);
  return (
    <Demo title="le levier">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-medium">Niveau de la Banque</span>
        <div className="inline-flex rounded-[10px] bg-slate-100 p-0.5" role="radiogroup" aria-label="Niveau de la Banque">
          {BANK.map((b, i) => (
            <button key={i} type="button" role="radio" aria-checked={level === i} onClick={() => setLevel(i)}
              className={`rounded-[8px] px-2.5 py-1 text-[12px] font-semibold tabular transition-colors ${level === i ? "bg-white text-primary shadow-sm" : "text-muted hover:text-ink"}`}>×{fr(b.lev)}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Votre mise" value={stake} min={1_000} max={50_000} step={1_000} onChange={setStake} show={eur(stake)} />
        <Slider label="Le cours bouge de" value={move} min={-40} max={40} onChange={setMove} show={`${move > 0 ? "+" : ""}${move} %`} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[12px] bg-white p-3 ring-1 ring-line"><div className="text-[11px] text-muted">Investi pour vous</div><div className="text-[17px] font-bold tabular">{eur(exposure)}</div><div className="text-[11px] text-muted">dont {eur(exposure - stake)} prêtés par la Banque</div></div>
        <div className="rounded-[12px] bg-white p-3 ring-1 ring-line"><div className="text-[11px] text-muted">Sans levier</div><div className={`text-[17px] font-bold tabular ${move >= 0 ? "text-success" : "text-danger"}`}>{signedEur(stake * (move / 100))}</div><div className="text-[11px] text-muted">{move > 0 ? "+" : ""}{move} % de la mise</div></div>
        <div className={`rounded-[12px] p-3 ring-1 ${result >= 0 ? "bg-success-soft ring-emerald-200" : "bg-danger-soft ring-red-200"}`}><div className="text-[11px] text-muted">Avec le levier ×{fr(lev)}</div><div className={`text-[17px] font-bold tabular ${result >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signedEur(result)}</div><div className="text-[11px] text-muted">{result >= 0 ? "+" : "−"}{fr(Math.abs(result / stake) * 100, 0)} % de la mise</div></div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className={`wiki-bar h-full rounded-full ${result >= 0 ? "bg-success" : "bg-danger"}`} style={{ width: `${width}%` }} /></div>
      <p className={`mt-2 flex items-start gap-1.5 text-[12px] ${lost ? "font-semibold text-red-700" : "text-muted"}`}>
        {lost && <TriangleAlert size={14} className="mt-0.5 shrink-0" />}
        {lost ? `Ligne vendue d’office : il ne restait que ${fr(LEVERAGE.liquidation * 100)} % de la mise. Vous ne perdez jamais plus que votre mise.`
          : `À ce niveau, la ligne est vendue d’office si le cours perd ${fr(liq * 100)} %.`}
      </p>
    </Demo>
  );
}

// ─── Capital ──────────────────────────────────────────────────

/** Combien de capital produisent mes placements, et en combien de jours j'obtiens un bâtiment. */
export function CapitalDemo() {
  const options = useMemo(() => BUILDINGS.filter((b) => b.buildable !== false && capitalCost(b) > 0).sort((a, b) => a.cost - b.cost), []);
  const [value, setValue] = useState(100_000);
  const [id, setId] = useState("services");
  const b = BUILDING_BY_ID[id], perDay = value * CAPITAL.dayRate, need = capitalCost(b), days = Math.ceil(need / perDay);
  return (
    <Demo title="le capital">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Valeur de vos placements" value={value} min={10_000} max={2_000_000} step={10_000} onChange={setValue} show={compactEur(value)} />
        <label className="block text-[12px]"><span className="font-medium">Bâtiment visé</span>
          <select value={id} onChange={(e) => setId(e.target.value)} className="mt-1.5 w-full rounded-[10px] border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-primary">
            {options.map((o) => <option key={o.id} value={o.id}>{o.name} · {compactEur(o.cost)}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[12px] bg-violet-50 p-3 ring-1 ring-violet-200"><div className="text-[11px] text-muted">Capital produit</div><div className="text-[17px] font-bold tabular text-violet-700">+{capitalFmt(perDay)}</div><div className="text-[11px] text-muted">par jour de ville (1 heure réelle)</div></div>
        <div className="rounded-[12px] bg-white p-3 ring-1 ring-line"><div className="text-[11px] text-muted">{b.name} demande</div><div className="text-[17px] font-bold tabular">{compactEur(b.cost)} <span className="text-violet-700">+ {capitalFmt(need)}</span></div><div className="text-[11px] text-muted">liquidités + capital</div></div>
        <div className="rounded-[12px] bg-white p-3 ring-1 ring-line"><div className="text-[11px] text-muted">Capital réuni en</div><div className="text-[17px] font-bold tabular">{num(days)} jour{days > 1 ? "s" : ""} de ville</div><div className="text-[11px] text-muted">soit environ {days < 24 ? `${days} h` : `${fr(days / 24)} jours`} réels</div></div>
      </div>
    </Demo>
  );
}

// ─── Tourisme ─────────────────────────────────────────────────

/** L'attrait de la ville : ce que la satisfaction, la pollution et les transports font au revenu d'un musée. */
export function TourismDemo() {
  const [sat, setSat] = useState(85);
  const [poll, setPoll] = useState(0);
  const [visitors, setVisitors] = useState(10);
  const attract = Math.min(TOURISM.max, Math.max(TOURISM.min, TOURISM.base + TOURISM.perSatisfaction * (sat / 100) - TOURISM.perPollution * (poll / 100)));
  const factor = attract * (1 + visitors / 100), base = BUILDING_BY_ID.museum.revenue ?? 0;
  return (
    <Demo title="l’attrait touristique">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Satisfaction" value={sat} min={20} max={100} onChange={setSat} show={`${sat} %`} />
        <Slider label="Pollution (points perdus)" value={poll} min={0} max={15} onChange={setPoll} show={`−${poll} pts`} />
        <Slider label="Visiteurs (gare, aéroport)" value={visitors} min={0} max={CITY_EFFECT_CAPS.visitors * 100} step={10} onChange={setVisitors} show={`+${visitors} %`} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[180px] flex-1">
          <div className="flex justify-between text-[11px] text-muted"><span>Attrait de la ville</span><span className="font-bold tabular text-ink">×{fr(attract, 2)}</span></div>
          <div className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className={`wiki-bar h-full rounded-full ${attract >= 1 ? "bg-success" : attract >= 0.7 ? "bg-warning" : "bg-danger"}`} style={{ width: `${(attract / TOURISM.max) * 100}%` }} />
            <span aria-hidden className="absolute top-0 h-full w-0.5 bg-slate-500" style={{ left: `${(1 / TOURISM.max) * 100}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-muted">Le trait marque ×1 : le revenu affiché sur le bâtiment.</div>
        </div>
        <div className="rounded-[12px] bg-white p-3 ring-1 ring-line"><div className="text-[11px] text-muted">Un Musée ({num(base)} €/j affichés) rapporte</div><div className={`text-[19px] font-bold tabular ${factor >= 1 ? "text-success" : "text-danger"}`}>{eur(base * factor)}/j</div></div>
      </div>
    </Demo>
  );
}

// ─── Bourse des villes ────────────────────────────────────────

/** Ce que rapporte un paquet de parts d'une ville, et à partir de quand on peut la racheter ou la contrôler. */
export function ShareDemo() {
  const [worth, setWorth] = useState(2_000_000);
  const [flow, setFlow] = useState(25_000);
  const [qty, setQty] = useState(100);
  const cost = sharePrice(worth) * qty, control = qty >= SHARES.control;
  const perDay = shareDividend(flow) * qty + (control ? SHARES.tribute * flow : 0);
  const marks = [{ at: SHARES.raidFrom, label: "rachat hostile" }, { at: SHARES.control, label: "contrôle" }];
  return (
    <Demo title="les parts d’une ville">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Patrimoine de la ville" value={worth} min={200_000} max={20_000_000} step={100_000} onChange={setWorth} show={compactEur(worth)} />
        <Slider label="Son flux net par jour" value={flow} min={0} max={200_000} step={1_000} onChange={setFlow} show={eur(flow)} />
        <Slider label="Parts que vous achetez" value={qty} min={10} max={SHARES.maxFloat} step={10} onChange={setQty} show={`${num(qty)} · ${fr(qty / 10)} %`} />
      </div>
      <div className="relative mt-4 h-2.5 rounded-full bg-slate-200">
        <div className={`wiki-bar h-full rounded-full ${control ? "bg-danger" : qty >= SHARES.raidFrom ? "bg-warning" : "bg-primary"}`} style={{ width: `${(qty / SHARES.maxFloat) * 100}%` }} />
        {marks.map((m) => <span key={m.label} aria-hidden className="absolute -top-1 h-[18px] w-0.5 bg-slate-500" style={{ left: `${(m.at / SHARES.maxFloat) * 100}%` }} />)}
      </div>
      <div className="relative mt-1 h-4 text-[10px] font-semibold text-muted">{marks.map((m) => <span key={m.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(m.at / SHARES.maxFloat) * 100}%` }}>{m.at} : {m.label}</span>)}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[12px] bg-white p-3 ring-1 ring-line"><div className="text-[11px] text-muted">Prix payé au propriétaire</div><div className="text-[17px] font-bold tabular">{compactEur(cost)}</div><div className="text-[11px] text-muted">{eur(sharePrice(worth))} la part</div></div>
        <div className="rounded-[12px] bg-success-soft p-3 ring-1 ring-emerald-200"><div className="text-[11px] text-muted">Vous touchez</div><div className="text-[17px] font-bold tabular text-emerald-700">{signedEur(perDay)}/j</div><div className="text-[11px] text-muted">{control ? `dividendes + tribut de ${fr(SHARES.tribute * 100)} %` : "dividendes"}</div></div>
        <div className="rounded-[12px] bg-white p-3 ring-1 ring-line"><div className="text-[11px] text-muted">Mise remboursée en</div><div className="text-[17px] font-bold tabular">{perDay > 0 ? `${num(Math.ceil(cost / perDay))} jours de ville` : "jamais"}</div><div className="text-[11px] text-muted">{perDay > 0 ? `environ ${fr(cost / perDay / 24)} jours réels` : "la ville ne gagne rien"}</div></div>
      </div>
    </Demo>
  );
}

// ─── Rangs ────────────────────────────────────────────────────

/** Les rangs de ville, en frise : ce que chacun ouvre. */
export function RankTrack({ current }: { current: number }) {
  return (
    <div className="mt-3 overflow-x-auto pb-2">
      <ol className="flex min-w-max gap-2">
        {CITY_RANKS.map((r, i) => {
          const feats = FEATURES.filter((f) => f.rank === i).map((f) => f.label);
          const bank = BANK.map((b, lv) => ({ b, lv })).filter((x) => x.b.minRank === i && x.lv > 0).map((x) => `Banque niveau ${x.lv + 1} (×${fr(x.b.lev)})`);
          const land = TERRITORY.filter((t) => t.minRank === i && t.cost > 0).map((t) => `Territoire ${t.size} × ${t.size}`);
          const proj = PROJECTS.filter((p) => p.minRank === i).map((p) => p.name);
          const next = CITY_RANKS[i + 1]?.pop ?? Infinity;
          const built = BUILDINGS.filter((b) => b.buildable !== false && (b.unlockPop ?? 0) >= r.pop && (b.unlockPop ?? 0) < next).length;
          const unlocks = [...feats, ...bank, ...land, ...proj];
          const done = i < current, here = i === current;
          return (
            <li key={r.name} className={`wiki-lift w-[176px] shrink-0 rounded-[14px] border p-3 ${here ? "border-primary bg-primary-soft" : done ? "border-emerald-200 bg-success-soft/60" : "border-line bg-white"}`}>
              <div className="flex items-center gap-2">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${here ? "bg-primary text-white" : done ? "bg-success text-white" : "bg-slate-100 text-slate-600"}`}>{i + 1}</span>
                <div className="min-w-0"><div className="truncate text-[13px] font-semibold leading-tight">{r.name}</div><div className="text-[11px] tabular text-muted">{r.pop ? `${num(r.pop)} hab.` : "départ"}</div></div>
              </div>
              {here && <div className="mt-2 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Vous êtes ici</div>}
              <ul className="mt-2 space-y-1 text-[11px] leading-snug">
                {built > 0 && <li className="text-muted">{built} bâtiment{built > 1 ? "s" : ""} débloqué{built > 1 ? "s" : ""}</li>}
                {unlocks.map((u) => <li key={u} className="flex gap-1.5"><span aria-hidden className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary" />{u}</li>)}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Bâtiments ────────────────────────────────────────────────

const CAT_ICON: Record<Category, LucideIcon> = { housing: Home, commerce: Store, services: Briefcase, industry: Factory, agriculture: Sprout, energy: Zap, public: Trees, civic: Landmark };
const CATS: Category[] = ["housing", "commerce", "services", "industry", "agriculture", "energy", "public"];

/** Vignette d'un bâtiment : sa vraie maquette 3D, rendue en image. Une icône en attendant, ou sans WebGL. */
function Thumb({ b }: { b: BuildingType }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => requestThumb(b.id, setUrl), [b.id]);
  const Icon = CAT_ICON[b.category];
  return (
    <div className="relative grid h-[92px] place-items-center sm:h-[104px] overflow-hidden rounded-[10px] bg-gradient-to-b from-sky-50 to-emerald-50">
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" width={120} height={120} className="h-[100px] w-[100px] object-contain sm:h-[112px] sm:w-[112px] drop-shadow-[0_6px_6px_rgba(15,23,42,0.18)]" />
        : <Icon size={30} className="text-slate-400" />}
    </div>
  );
}

function chips(b: BuildingType): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [], p100 = (v: number) => Math.round(v * 100);
  const special = "bg-violet-50 text-violet-700";
  if (b.housing) out.push({ text: `+${num(b.housing)} hab.`, cls: "bg-blue-50 text-blue-700" });
  if (b.jobs) out.push({ text: `${num(b.jobs)} emplois`, cls: "bg-slate-100 text-slate-700" });
  if (b.revenue) out.push({ text: `+${num(b.revenue)} €/j`, cls: "bg-success-soft text-emerald-700" });
  if (b.energyProd) out.push({ text: `énergie +${num(b.energyProd)}`, cls: "bg-amber-50 text-amber-700" });
  if (b.energyUse) out.push({ text: `énergie −${num(b.energyUse)}`, cls: "bg-danger-soft text-red-700" });
  if (b.foodProd) out.push({ text: `nourriture +${num(b.foodProd)}`, cls: "bg-lime-50 text-lime-700" });
  if (b.serves) out.push({ text: `dessert ${num(b.serves)} hab.`, cls: "bg-emerald-50 text-emerald-700" });
  if (b.pollution) out.push({ text: b.pollution > 0 ? `pollution +${num(b.pollution)}` : `pollution −${num(-b.pollution)}`, cls: b.pollution > 0 ? "bg-slate-200 text-slate-700" : "bg-emerald-50 text-emerald-700" });
  if (b.tourist) out.push({ text: "tourisme", cls: special });
  if (b.visitors) out.push({ text: `visiteurs +${p100(b.visitors)} %`, cls: special });
  if (b.growthBoost) out.push({ text: `arrivées +${p100(b.growthBoost)} %`, cls: special });
  if (b.exportBonus) out.push({ text: `exports +${p100(b.exportBonus)} pts`, cls: special });
  if (b.wearCut) out.push({ text: `vétusté −${p100(b.wearCut)} %`, cls: special });
  if (b.capitalBoost) out.push({ text: `capital +${p100(b.capitalBoost)} %`, cls: special });
  if (b.joy) out.push({ text: `satisfaction +${p100(b.joy)} pt${p100(b.joy) > 1 ? "s" : ""}`, cls: special });
  return out;
}

/** Tous les bâtiments, en fiches illustrées : on filtre par catégorie ou par nom. */
export function BuildingGallery({ population }: { population: number }) {
  const [cat, setCat] = useState<Category | "all">("all");
  const [q, setQ] = useState("");
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = BUILDINGS.filter((b) => b.buildable !== false && (cat === "all" || b.category === cat) && (!q || norm(`${b.name} ${b.description}`).includes(norm(q))));
  const pill = (on: boolean) => `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${on ? "bg-primary text-white" : "bg-slate-100 text-muted hover:text-ink"}`;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          <button type="button" onClick={() => setCat("all")} className={pill(cat === "all")}>Tous</button>
          {CATS.map((c) => { const Icon = CAT_ICON[c]; return <button key={c} type="button" onClick={() => setCat(c)} className={pill(cat === c)}><Icon size={13} />{CATEGORY_LABELS[c]}</button>; })}
        </div>
        <label className="relative w-full sm:w-52">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un bâtiment" aria-label="Chercher un bâtiment" className="w-full rounded-[10px] border border-line bg-white py-1.5 pl-8 pr-2.5 text-[13px] outline-none focus:border-primary" />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">{list.length} bâtiment{list.length > 1 ? "s" : ""}. Les images sont les vraies maquettes de la ville.</p>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-3">
        {list.map((b) => {
          const locked = !!b.unlockPop && population < b.unlockPop, cap = capitalCost(b), up = UPGRADES[b.id];
          return (
            <li key={b.id} className="wiki-lift flex flex-col gap-2 rounded-[14px] border border-line bg-white p-2.5">
              <Thumb b={b} />
              <div className="flex flex-wrap items-start justify-between gap-x-2">
                <div className="min-w-0"><div className="text-[13px] font-semibold leading-tight">{b.name}</div><div className="text-[11px] text-muted">{CATEGORY_LABELS[b.category]}</div></div>
                <div className="shrink-0 text-right text-[12px] font-bold tabular">{compactEur(b.cost)}{cap > 0 && <div className="text-[11px] text-violet-700">+ {capitalFmt(cap)}</div>}</div>
              </div>
              <div className="flex flex-wrap gap-1">{chips(b).map((c) => <Tag key={c.text} cls={c.cls}>{c.text}</Tag>)}</div>
              <p className="hidden text-[12px] leading-snug text-muted sm:block">{b.description}</p>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[11px] text-muted">
                <span className={`inline-flex items-center gap-1 ${locked ? "font-semibold text-amber-700" : ""}`}>{locked && <Lock size={11} />}{b.unlockPop ? `Dès ${num(b.unlockPop)} habitants` : "Dès le départ"}</span>
                {up && <span className="inline-flex items-center gap-1"><ArrowRight size={11} />{BUILDING_BY_ID[up].name}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="mt-3 rounded-[12px] bg-slate-50 px-3 py-4 text-center text-[13px] text-muted">Aucun bâtiment ne correspond.</p>}
    </div>
  );
}
