"use client";
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BarChart3, Building2, CheckCircle2, Coins, Globe2, Info, Landmark, Target, TrendingUp, Zap, Wheat, Sparkles,
} from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { Card, Delta, PageHeader, Progress, Segmented, StatCard } from "@/components/ui";
import { IncomeBars, WealthChart } from "@/components/charts";
import IsoCity from "@/components/IsoCity";
import { computeAlerts, computeObjectives, type AlertLevel } from "@/lib/game/insights";
import { compactEur, eur, num, pctPlain, signedEur, tone } from "@/lib/format";
import { DAY_LENGTH_MINUTES } from "@/lib/game/config";

type Period = "7 jours" | "30 jours" | "Tout";

const ALERT_STYLE: Record<AlertLevel, { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: "bg-primary-soft text-primary" },
  warning: { icon: AlertTriangle, cls: "bg-warning-soft text-warning" },
  danger: { icon: AlertTriangle, cls: "bg-danger-soft text-danger" },
  success: { icon: CheckCircle2, cls: "bg-success-soft text-success" },
};

export default function EconomyPage() {
  const { game, prices, city, portfolio, portfolioCost, netWorth } = useDerived();
  const [period, setPeriod] = useState<Period>("7 jours");

  const hist = game.history;
  const n = period === "7 jours" ? 8 : period === "30 jours" ? 31 : hist.length;
  const slice = hist.slice(-n);
  const wealthData = [...slice.map((s) => ({ x: `J${s.day}`, y: s.netWorth })), { x: "Maint.", y: netWorth }];
  const ref = slice[0]?.netWorth ?? netWorth;
  const wealthChange = ref ? netWorth / ref - 1 : 0;

  const bars = hist.slice(-7).map((s) => ({ x: `J${s.day}`, income: Math.round(s.income), expenses: Math.round(s.expenses) }));
  const alerts = computeAlerts(game, city, prices);
  const objectives = computeObjectives(game, city, netWorth);
  const shownObjectives = [...objectives.filter((o) => !o.done).slice(0, 3), ...objectives.filter((o) => o.done).slice(-1)].slice(0, 3);
  const perf = portfolioCost > 0 ? portfolio / portfolioCost - 1 : 0;

  const wealthParts = [
    { label: "Liquidités", v: Math.max(0, game.cash), c: "bg-slate-400" },
    { label: "Investissements", v: portfolio, c: "bg-primary" },
    { label: "Ville (constructions)", v: city.assetValue, c: "bg-success" },
  ];
  const wealthTotal = wealthParts.reduce((a, p) => a + p.v, 0) || 1;

  return (
    <>
      <PageHeader icon={BarChart3} title="Économie" subtitle={`Vue d'ensemble de votre empire · ${game.cityName}`} />
      {!game.tutorialDone && <Welcome />}

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
          <WealthChart data={wealthData} />
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

/** Guide de démarrage : 3 étapes, chacune cochée quand le joueur l'a faite. */
function Welcome() {
  const game = useGame((s) => s.game);
  const close = useGame((s) => s.closeTutorial);
  const steps = [
    { done: Object.keys(game.holdings).length > 0 || game.transactions.some((t) => t.kind === "buy"), title: "Investissez en bourse", text: "Achetez une première action dans Marchés. Les cours suivent la vraie bourse.", href: "/marches", cta: "Ouvrir les Marchés" },
    { done: game.transactions.some((t) => t.kind === "build"), title: "Agrandissez votre ville", text: "Construisez des logements et des emplois : la ville rapporte chaque jour.", href: "/ville", cta: "Aller à la Ville" },
    { done: game.transactions.some((t) => t.kind === "research"), title: "Débloquez une recherche", text: "L'arbre de compétences ouvre de nouveaux marchés et outils d'analyse.", href: "/recherche", cta: "Voir la Recherche" },
  ];
  const count = steps.filter((s) => s.done).length;
  return (
    <section className="card p-5 mb-4 appear border-primary/30" aria-label="Guide de démarrage">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <h2 className="text-[18px] font-semibold">Bienvenue dans Market Empire</h2>
          <p className="text-[13px] text-muted">100 000 € et une petite ville. Trois gestes pour bien démarrer · {count} / 3</p>
        </div>
        <button onClick={close} className="text-[12px] text-muted hover:text-ink font-medium">{count === 3 ? "Terminer" : "Masquer"}</button>
      </div>
      <ol className="grid gap-3 grid-cols-1 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className={`rounded-[12px] border p-4 ${s.done ? "border-success/40 bg-success-soft/50" : "border-line"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`h-6 w-6 rounded-full grid place-items-center text-[12px] font-bold ${s.done ? "bg-success text-white" : "bg-primary-soft text-primary"}`}>
                {s.done ? <CheckCircle2 size={14} /> : i + 1}
              </span>
              <span className="font-semibold text-[14px]">{s.title}</span>
            </div>
            <p className="text-[12px] text-muted mb-3">{s.text}</p>
            {!s.done && <Link href={s.href} className="text-[12px] font-semibold text-primary hover:underline">{s.cta} →</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
