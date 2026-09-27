"use client";
import { useState } from "react";
import {
  Briefcase, Building2, Factory, FastForward, Home, Landmark, Lock, RotateCcw, Smile, Store, Users, Wheat, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { BUILDINGS, BUILDING_BY_ID, CATEGORY_LABELS, DEMOLISH_REFUND, EXPORT_RATIO, MAINTENANCE_RATE, RESOURCE_PRICES, type BuildingType, type Category } from "@/lib/game/config";
import { Button, Card, PageHeader, Progress, Segmented } from "@/components/ui";
import { compactEur, eur, num, pctPlain, signedEur, tone } from "@/lib/format";

const CAT_ICON: Record<Category, LucideIcon> = {
  housing: Home, commerce: Store, services: Briefcase, industry: Factory, agriculture: Wheat, energy: Zap, civic: Landmark,
};
const CAT_TINT: Record<Category, string> = {
  housing: "bg-blue-50 text-blue-600", commerce: "bg-violet-50 text-violet-600", services: "bg-sky-50 text-sky-600",
  industry: "bg-slate-100 text-slate-600", agriculture: "bg-lime-50 text-lime-700", energy: "bg-amber-50 text-amber-600", civic: "bg-indigo-50 text-indigo-600",
};
type Tab = "Construire" | "Mes bâtiments";

export default function CityPage() {
  const { game, city } = useDerived();
  const [tab, setTab] = useState<Tab>("Construire");
  const skipDay = useGame((s) => s.skipDay);
  const reset = useGame((s) => s.reset);

  const tiles = Object.entries(game.buildings).flatMap(([id, n]) => Array.from({ length: n }, (_, i) => ({ id, key: `${id}-${i}` })));

  return (
    <>
      <PageHeader icon={Building2} title={game.cityName} subtitle={`Gestion de votre cité · jour ${game.day}`}>
        <Button variant="secondary" onClick={skipDay} title="Outil de test du prototype" className="inline-flex items-center gap-1.5"><FastForward size={15} />Avancer d&apos;un jour</Button>
      </PageHeader>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 mb-4">
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

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="mb-3"><Segmented options={["Construire", "Mes bâtiments"] as Tab[]} value={tab} onChange={setTab} /></div>
          {tab === "Construire" ? <Catalog /> : <Owned />}
        </div>

        <div className="xl:col-span-4 space-y-4">
          <Card title="Plan de la ville" icon={Building2}>
            <div className="grid grid-cols-8 gap-1.5">
              {tiles.map((t) => {
                const b = BUILDING_BY_ID[t.id];
                const Icon = CAT_ICON[b.category];
                return <div key={t.key} title={b.name} className={`aspect-square rounded-[6px] grid place-items-center ${CAT_TINT[b.category]}`}><Icon size={14} /></div>;
              })}
              {Array.from({ length: Math.max(0, 32 - tiles.length) }, (_, i) => <div key={i} className="aspect-square rounded-[6px] border border-dashed border-slate-200" />)}
            </div>
            <p className="text-[11px] text-muted mt-3">Aperçu simplifié. La vue isométrique arrive en phase 3.</p>
          </Card>
          <Card title="Comment ça marche" icon={Landmark}>
            <ul className="text-[12px] text-muted space-y-1.5 list-disc pl-4">
              <li>60 % des habitants cherchent un emploi.</li>
              <li>Les habitants arrivent s&apos;il y a des logements libres, surtout si des emplois les attendent.</li>
              <li>Les déficits d&apos;énergie et de nourriture sont importés automatiquement, au prix fort.</li>
              <li>Les surplus sont exportés à 70 % du prix.</li>
              <li>Entretien : {MAINTENANCE_RATE * 100} % du coût par jour. Démolition : {DEMOLISH_REFUND * 100} % remboursés.</li>
            </ul>
            <button onClick={() => { if (confirm("Recommencer une nouvelle partie ? Toute la progression sera perdue.")) reset(); }}
              className="mt-4 text-[12px] text-danger inline-flex items-center gap-1 hover:underline"><RotateCcw size={13} />Recommencer la partie</button>
          </Card>
        </div>
      </div>
    </>
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

function Catalog() {
  const game = useGame((s) => s.game);
  const build = useGame((s) => s.build);
  const cats: Category[] = ["housing", "commerce", "services", "industry", "agriculture", "energy"];
  return (
    <div className="space-y-5">
      {cats.map((cat) => {
        const Icon = CAT_ICON[cat];
        return (
          <section key={cat}>
            <h3 className="text-[14px] font-semibold mb-2 flex items-center gap-2"><Icon size={16} className="text-primary" />{CATEGORY_LABELS[cat]}</h3>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {BUILDINGS.filter((b) => b.category === cat && b.buildable !== false).map((b) => {
                const locked = !!b.unlockPop && game.population < b.unlockPop;
                const owned = game.buildings[b.id] ?? 0;
                // Rentabilité : revenus + valeur des ressources produites (au prix d'export) − énergie consommée − entretien
                const net = (b.revenue ?? 0) + ((b.energyProd ?? 0) * RESOURCE_PRICES.energy + (b.foodProd ?? 0) * RESOURCE_PRICES.food) * EXPORT_RATIO
                  - (b.energyUse ?? 0) * RESOURCE_PRICES.energy - b.cost * MAINTENANCE_RATE;
                return (
                  <div key={b.id} className={`card p-4 flex flex-col gap-2 ${locked ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div><div className="font-semibold text-[14px]">{b.name}</div><div className="text-[11px] text-muted">{b.description}</div></div>
                      {owned > 0 && <span className="text-[11px] rounded-full bg-primary-soft text-primary px-2 py-0.5 font-semibold">×{owned}</span>}
                    </div>
                    <Effects b={b} />
                    {b.category !== "housing" && net > 0 ? <div className="text-[11px] text-muted">Rentabilisé en ~{Math.round(b.cost / net)} jours</div> : null}
                    <div className="mt-auto flex items-center justify-between pt-1">
                      <span className="font-bold tabular">{compactEur(b.cost)}</span>
                      {locked
                        ? <span className="text-[11px] text-muted inline-flex items-center gap-1"><Lock size={12} />{num(b.unlockPop!)} hab.</span>
                        : <Button className="!px-3 !py-1.5" disabled={b.cost > game.cash} onClick={() => build(b.id)}>Construire</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Owned() {
  const game = useGame((s) => s.game);
  const demolish = useGame((s) => s.demolish);
  const rows = Object.entries(game.buildings).map(([id, n]) => ({ b: BUILDING_BY_ID[id], n })).filter((r) => r.b);
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map(({ b, n }) => {
          const Icon = CAT_ICON[b.category];
          return (
            <li key={b.id} className="flex items-center gap-3 py-3">
              <span className={`h-9 w-9 rounded-[10px] grid place-items-center ${CAT_TINT[b.category]}`}><Icon size={17} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[14px]">{b.name} <span className="text-muted">×{n}</span></div>
                <Effects b={b} />
              </div>
              <div className="text-right text-[12px] text-muted hidden sm:block">Entretien<br /><span className="text-ink tabular">{eur(b.cost * MAINTENANCE_RATE * n)}/j</span></div>
              {b.buildable !== false && (
                <Button variant="secondary" className="!px-3 !py-1.5 !text-danger"
                  onClick={() => { if (confirm(`Démolir 1 × ${b.name} ? Remboursement : ${eur(b.cost * DEMOLISH_REFUND)}`)) demolish(b.id); }}>Démolir</Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
