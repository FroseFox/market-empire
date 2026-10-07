"use client";
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BarChart3, Building2, CheckCircle2, Coins, Globe2, Info, Landmark, Scale, Target, TrendingUp, Zap, Wheat, Sparkles,
} from "lucide-react";
import { useDerived } from "@/store/game";
import { Card, Delta, PageHeader, Progress, Segmented, StatCard } from "@/components/ui";
import { IncomeBars, WealthChart } from "@/components/charts";
import IsoCity from "@/components/City3D";
import { computeAlerts, computeObjectives, nextActions, type AlertLevel } from "@/lib/game/insights";
import Robot from "@/components/Robot";
import { compactEur, eur, num, pctPlain, signedEur, tone } from "@/lib/format";
import { DAY_LENGTH_MINUTES } from "@/lib/game/config";
import { CITY_RANKS } from "@/lib/game/config";
import { periodReport, type Snapshot } from "@/lib/game/engine";

type Period = "7 jours" | "30 jours" | "Tout";
type Series = "Patrimoine" | "Liquidités" | "Bourse" | "Ville" | "Habitants";
const SERIES: Record<Series, { key: keyof Pick<Snapshot, "netWorth" | "cash" | "portfolio" | "city" | "population">; color: string; money: boolean }> = {
  Patrimoine: { key: "netWorth", color: "#2563EB", money: true },
  Liquidités: { key: "cash", color: "#64748B", money: true },
  Bourse: { key: "portfolio", color: "#2563EB", money: true },
  Ville: { key: "city", color: "#10B981", money: true },
  Habitants: { key: "population", color: "#8B5CF6", money: false },
};

const ALERT_STYLE: Record<AlertLevel, { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: "bg-primary-soft text-primary" },
  warning: { icon: AlertTriangle, cls: "bg-warning-soft text-warning" },
  danger: { icon: AlertTriangle, cls: "bg-danger-soft text-danger" },
  success: { icon: CheckCircle2, cls: "bg-success-soft text-success" },
};

export default function EconomyPage() {
  const { game, prices, city, portfolio, portfolioCost, leverage, netWorth } = useDerived();
  const [period, setPeriod] = useState<Period>("7 jours");
  const [series, setSeries] = useState<Series>("Patrimoine");

  const hist = game.history;
  const n = period === "7 jours" ? 8 : period === "30 jours" ? 31 : hist.length;
  const slice = hist.slice(-n);
  const now = { netWorth, cash: game.cash, portfolio: portfolio + leverage, city: city.assetValue, population: game.population };
  const todo = nextActions(game, city, prices);
  const wealthData = [...slice.map((s) => ({ x: `J${s.day}`, y: s[SERIES[series].key] })), { x: "Maint.", y: now[SERIES[series].key] }];
  const report = periodReport(game, netWorth, n);
  const ref = slice[0]?.netWorth ?? netWorth;
  const wealthChange = ref ? netWorth / ref - 1 : 0;

  const bars = hist.slice(-7).map((s) => ({ x: `J${s.day}`, income: Math.round(s.income), expenses: Math.round(s.expenses) }));
  const alerts = computeAlerts(game, city, prices);
  const objectives = computeObjectives(game, city, netWorth);
  const shownObjectives = [...objectives.filter((o) => !o.done).slice(0, 3), ...objectives.filter((o) => o.done).slice(-1)].slice(0, 3);
  const perf = portfolioCost > 0 ? portfolio / portfolioCost - 1 : 0;

  const wealthParts = [
    { label: "Liquidités", v: Math.max(0, game.cash), c: "bg-slate-400" },
    { label: "Investissements", v: portfolio + leverage, c: "bg-primary" },
    { label: "Ville (constructions)", v: city.assetValue, c: "bg-success" },
  ];
  const wealthTotal = wealthParts.reduce((a, p) => a + p.v, 0) || 1;

  return (
    <>
      <PageHeader icon={BarChart3} title="Économie" subtitle={`Vue d'ensemble de votre empire · ${game.cityName}`} />

      {/* À faire maintenant : les gestes les plus utiles, du plus pressant au moins pressant */}
      {todo.length > 0 && (
        <section aria-label="À faire maintenant" className="card mb-4 flex flex-col gap-3 p-4 appear md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-3 md:w-[190px]">
            <Robot size={48} mood={todo.some((a) => a.tone === "bad") ? "think" : "happy"} />
            <div><div className="text-[15px] font-semibold leading-tight">À faire maintenant</div><div className="text-[11px] text-muted">Le plus utile d&apos;abord</div></div>
          </div>
          <ol className="grid flex-1 gap-2 md:grid-cols-3">
            {todo.map((a, i) => (
              <li key={a.id}>
                <Link href={a.href} className={`flex h-full gap-2.5 rounded-[12px] border p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 ${a.tone === "bad" ? "border-red-200" : a.tone === "good" ? "border-emerald-200" : "border-line"}`}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white ${a.tone === "bad" ? "bg-danger" : a.tone === "good" ? "bg-success" : "bg-primary"}`}>{i + 1}</span>
                  <span className="min-w-0"><span className="block text-[13px] font-semibold">{a.title}</span><span className="block text-[12px] text-muted">{a.text}</span></span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Chiffres clés */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <StatCard icon={Coins} tint="bg-amber-50 text-amber-500" label="Patrimoine total" value={eur(netWorth)}>
          <Delta value={wealthChange} suffix={`(${period === "Tout" ? "depuis le début" : period})`} />
        </StatCard>
        <StatCard icon={Landmark} tint="bg-primary-soft text-primary" label="Liquidités" value={eur(game.cash)} href="/marches">
          Disponible
        </StatCard>
        <StatCard icon={TrendingUp} tint="bg-success-soft text-success" label="Portefeuille" value={eur(portfolio)} href="/portefeuille">
          {portfolioCost > 0 ? <Delta value={perf} suffix={signedEur(portfolio - portfolioCost)} /> : "Aucun investissement"}
        </StatCard>
        <StatCard icon={Building2} tint="bg-indigo-50 text-indigo-500" label="Ville" value={`${num(game.population)} hab.`} href="/ville">
          Constructions {compactEur(city.assetValue)} · {signedEur(city.net)}/j
        </StatCard>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12 mb-4">
        {/* Patrimoine */}
        <Card title="Évolution du patrimoine" className="xl:col-span-5" extra={<Segmented options={["7 jours", "30 jours", "Tout"] as Period[]} value={period} onChange={setPeriod} />}>
          <div className="mb-3"><Segmented options={Object.keys(SERIES) as Series[]} value={series} onChange={setSeries} /></div>
          <WealthChart data={wealthData} color={SERIES[series].color} unit={SERIES[series].money ? undefined : "hab."} />
          <p className="text-[11px] text-muted mt-2">1 jour de ville = {DAY_LENGTH_MINUTES} min réelles. La bourse suit le temps réel.</p>
        </Card>

        {/* Revenus / dépenses */}
        <Card title="Revenus / Dépenses" className="xl:col-span-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] mb-3">
            <div className="text-muted col-span-1 font-medium">Revenus / jour</div>
            <div className="text-muted col-span-1 font-medium">Dépenses / jour</div>
            <Row label="Impôts" v={city.income.taxes} />
            <Row label="Entretien" v={-city.expenses.maintenance} />
            <Row label="Entreprises" v={city.income.buildings} />
            <Row label="Importations" v={-city.expenses.imports} />
            <Row label="Exportations" v={city.income.exports} />
            <div className="flex justify-between text-muted"><span>Bourse</span><span>variable</span></div>
            {city.income.grant >= 1 && <Row label="Dotation de l'État" v={city.income.grant} />}
          </div>
          <div className="flex items-center justify-between rounded-[12px] bg-slate-50 px-4 py-3 mb-3">
            <span className="text-[13px] font-medium text-muted">Flux net</span>
            <span className={`text-[22px] font-bold tabular ${tone(city.net)}`}>{signedEur(city.net)}/j</span>
          </div>
          {bars.length > 1 ? <IncomeBars data={bars} height={110} /> : <p className="text-[12px] text-muted">L&apos;historique apparaît après quelques jours de ville.</p>}
        </Card>

        {/* Ville */}
        <Card title="Ville" icon={Building2} action={{ label: "Voir la ville", href: "/ville" }} className="xl:col-span-3">
          <div className="mb-4"><IsoCity plots={game.plots} height={130} compact /></div>
          <ul className="space-y-3 text-[13px]">
            <CityLine label="Rang" value={CITY_RANKS[city.rank].name} sub={CITY_RANKS[city.rank + 1] ? `${CITY_RANKS[city.rank + 1].name} à ${num(CITY_RANKS[city.rank + 1].pop)} habitants` : "Rang maximal"} />
            <CityLine label="Population" value={num(game.population)} sub={`${num(city.housing)} logements`} />
            <CityLine label="Emplois" value={num(city.jobs)} sub={`${num(city.employed)} occupés`} />
            <CityLine label="Chômage" value={pctPlain(city.unemploymentRate)} sub={`${num(city.unemployed)} actifs sans emploi`} bad={city.unemploymentRate > 0.08} />
            <CityLine label="Satisfaction" value={pctPlain(city.satisfaction)} sub={city.satisfaction >= 0.75 ? "Les habitants sont contents" : "À surveiller"} bad={city.satisfaction < 0.6} />
            <CityLine label="Croissance" value={`${city.growth >= 0 ? "+" : ""}${num(city.growth)} hab./j`} sub={city.freeHousing === 0 ? "Plus de logements libres" : `${num(city.freeHousing)} logements libres`} />
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Ressources" icon={Zap}>
          <div className="grid grid-cols-2 gap-3">
            <Resource icon={Zap} label="Énergie" prod={city.energy.prod} use={city.energy.use} />
            <Resource icon={Wheat} label="Nourriture" prod={city.food.prod} use={city.food.use} />
          </div>
        </Card>

        <Card title="Balance commerciale" icon={Globe2}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-[12px] bg-slate-50 p-3"><div className="text-[12px] text-muted">Exportations</div><div className="font-bold text-success tabular">{eur(city.exportsValue)}/j</div></div>
            <div className="rounded-[12px] bg-slate-50 p-3"><div className="text-[12px] text-muted">Importations</div><div className="font-bold text-danger tabular">{eur(city.importsValue)}/j</div></div>
          </div>
          <div className="rounded-[12px] bg-slate-50 p-3">
            <div className="text-[12px] text-muted">Balance</div>
            <div className={`text-[22px] font-bold tabular ${tone(city.tradeBalance)}`}>{signedEur(city.tradeBalance)}/j</div>
          </div>
        </Card>

        <Card title={`Alertes${alerts.length ? ` (${alerts.length})` : ""}`} icon={AlertTriangle}>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-muted py-4"><CheckCircle2 size={18} className="text-success" />Rien à signaler, tout tourne.</div>
          ) : (
            <ul className="space-y-3">
              {alerts.slice(0, 4).map((a) => {
                const S = ALERT_STYLE[a.level];
                return (
                  <li key={a.id}>
                    <Link href={a.href} className="flex gap-3 group">
                      <span className={`h-8 w-8 shrink-0 rounded-full grid place-items-center ${S.cls}`}><S.icon size={16} /></span>
                      <span><span className="block text-[13px] font-medium group-hover:text-primary">{a.title}</span><span className="block text-[12px] text-muted">{a.detail}</span></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Objectifs" icon={Target}>
          <ul className="space-y-4">
            {shownObjectives.map((o) => (
              <li key={o.id}>
                <div className="flex items-center justify-between text-[13px] font-medium mb-1">
                  <span>{o.title}</span>
                  {o.done && <CheckCircle2 size={16} className="text-success shrink-0" />}
                </div>
                {o.target > 1 && <div className="text-[11px] text-muted mb-1 tabular">{o.unit === "€" ? `${compactEur(o.current)} / ${compactEur(o.target)}` : `${num(o.current)} / ${num(o.target)}`}</div>}
                <Progress value={o.current / o.target} tone={o.done ? "bg-success" : "bg-primary"} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Bilan : pourquoi le patrimoine a bougé */}
      <Card title={`Bilan · ${period === "Tout" ? "depuis le début" : period}`} icon={Scale} className="mt-4"
        extra={<Segmented options={["7 jours", "30 jours", "Tout"] as Period[]} value={period} onChange={setPeriod} />}>
        {report.days === 0 && report.end === report.start ? (
          <p className="text-[13px] text-muted">Le bilan se remplit dès le premier jour de ville ou la première opération.</p>
        ) : (
          <div className="grid gap-x-10 gap-y-2 grid-cols-1 md:grid-cols-2 text-[13px]">
            <div className="space-y-2">
              <BilanRow label="Patrimoine au départ" value={eur(report.start)} strong />
              <BilanRow label="Bourse" hint="variation des cours, gains latents et réalisés" v={report.market} />
              <BilanRow label="Ville" hint={`flux net encaissé sur ${report.days} jour${report.days > 1 ? "s" : ""}`} v={report.city} />
            </div>
            <div className="space-y-2">
              <BilanRow label="Frais de courtage" v={-report.fees} />
              <BilanRow label="Recherche" hint="investie en savoir, pas en actifs" v={-report.research} />
              {report.demolish !== 0 && <BilanRow label="Démolitions" hint="valeur perdue" v={-report.demolish} />}
              <BilanRow label="Patrimoine actuel" value={eur(report.end)} strong />
            </div>
            <p className="md:col-span-2 text-[11px] text-muted">
              Construire ne change pas le patrimoine : l&apos;argent devient un bâtiment. Variation totale : <b className={tone(report.end - report.start)}>{signedEur(report.end - report.start)}</b>.
            </p>
          </div>
        )}
      </Card>

      {/* D'où vient ma richesse ? */}
      <Card title="D'où vient ma richesse ?" icon={Sparkles} className="mt-4">
        <div className="flex h-3 rounded-full overflow-hidden mb-3">
          {wealthParts.map((p) => <div key={p.label} className={p.c} style={{ width: `${(p.v / wealthTotal) * 100}%` }} />)}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          {wealthParts.map((p) => (
            <div key={p.label} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${p.c}`} />
              <span className="text-muted">{p.label}</span>
              <b className="tabular">{eur(p.v)}</b>
              <span className="text-muted tabular">{Math.round((p.v / wealthTotal) * 100)} %</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return <div className="flex justify-between"><span className="text-muted">{label}</span><span className={`tabular font-medium ${tone(v)}`}>{signedEur(v)}</span></div>;
}

function BilanRow({ label, hint, v, value, strong }: { label: string; hint?: string; v?: number; value?: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "rounded-[10px] bg-slate-50 px-3 py-2 font-semibold" : "px-3"}`}>
      <span>{label}{hint && <span className="block text-[11px] text-muted font-normal">{hint}</span>}</span>
      <span className={`tabular font-semibold ${v !== undefined ? tone(v) : ""}`}>{value ?? signedEur(v ?? 0)}</span>
    </div>
  );
}

function CityLine({ label, value, sub, bad }: { label: string; value: string; sub: string; bad?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <div><div className="text-muted text-[12px]">{label}</div><div className="font-semibold tabular">{value}</div></div>
      <div className={`text-[11px] text-right ${bad ? "text-danger" : "text-muted"}`}>{sub}</div>
    </li>
  );
}

function Resource({ icon: Icon, label, prod, use }: { icon: typeof Zap; label: string; prod: number; use: number }) {
  const bal = prod - use;
  return (
    <div className="rounded-[12px] border border-line p-3">
      <div className="flex items-center gap-1.5 text-[13px] font-medium mb-2"><Icon size={16} className="text-primary" />{label}</div>
      <div className="text-[12px] flex justify-between"><span className="text-muted">Prod.</span><span className="tabular">{num(prod)}</span></div>
      <div className="text-[12px] flex justify-between mb-2"><span className="text-muted">Cons.</span><span className="tabular">{num(use)}</span></div>
      <div className={`font-bold tabular ${tone(bal)}`}>{bal >= 0 ? "+" : "−"}{num(Math.abs(bal))}</div>
    </div>
  );
}
