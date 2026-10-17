"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Cherry, Citrus, Dices, Lock, TrendingUp } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { now } from "@/lib/clock";
import { play } from "@/lib/sound";
import { Button, Card, PageHeader, Progress, Segmented } from "@/components/ui";
import { Capital, CapitalCoin } from "@/components/Capital";
import { BUILDING_BY_ID } from "@/lib/game/config";
import {
  CASINO_TIERS, CRASH, MIN_BET, RED, SLOT_TRIPLE, SLOT_WEIGHTS, casinoLimits, roulettePays,
  type CasinoChoice, type CasinoResult, type RouletteBet, type Symbol,
} from "@/lib/game/casino";

const GAMES = ["Roulette", "Machine à sous", "Crash"] as const;
type GameTab = (typeof GAMES)[number];
interface Played { id: number; game: GameTab; bet: number; payout: number; detail: string }

export default function CasinoPage() {
  const { game } = useDerived();
  const casino = useGame((s) => s.casino);
  const [tab, setTab] = useState<GameTab>("Roulette");
  const [bet, setBet] = useState(50);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Played[]>([]);
  const lim = casinoLimits(game, now());

  if (!lim) return <Locked />;

  const maxNow = Math.max(0, Math.min(lim.maxBet, lim.stakeLeft, Math.floor(game.capital ?? 0)));
  const closed = lim.winLeft <= 0 || lim.stakeLeft < MIN_BET;
  const stake = Math.max(MIN_BET, Math.min(bet, lim.maxBet));
  /** Joue la partie tout de suite (le résultat est fixé), puis laisse l'animation le révéler. */
  const run = (choice: CasinoChoice): CasinoResult | null => (busy ? null : casino(choice, stake));
  const record = (r: CasinoResult, detail: string) => {
    setLog((l) => [{ id: Date.now(), game: tab, bet: r.bet, payout: r.payout, detail }, ...l].slice(0, 8));
    play(r.payout >= r.bet * 10 ? "bigwin" : r.won ? "win" : r.payout > 0 ? "ok" : "lose");
    if (r.capped) useGame.getState().notify("Gain ramené au plafond du jour");
  };
  const next = CASINO_TIERS.find((t) => t.level === lim.tier.level + 1);

  return (
    <div>
      <PageHeader icon={Dices} title="Casino" subtitle={`${BUILDING_BY_ID[lim.tier.id].name} · on mise du capital, plafonds remis à zéro à minuit`} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="card min-w-0 p-3.5 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented options={[...GAMES]} value={tab} onChange={(t) => !busy && setTab(t)} />
          </div>
          {tab === "Roulette" && <Roulette run={run} busy={busy} setBusy={setBusy} record={record} />}
          {tab === "Machine à sous" && <Slots run={run} busy={busy} setBusy={setBusy} record={record} />}
          {tab === "Crash" && <Crash run={run} busy={busy} setBusy={setBusy} record={record} />}
          <BetBar bet={bet} setBet={setBet} max={maxNow} busy={busy} closed={closed} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Aujourd’hui">
            <div className="space-y-3 text-[12px]">
              <div className="flex items-center justify-between rounded-[10px] bg-amber-50 px-3 py-2"><span className="text-amber-900">Votre capital</span><b className="text-[15px] tabular text-amber-900"><Capital value={game.capital ?? 0} /></b></div>
              <div className="flex justify-between"><span className="text-muted">Mise maximale</span><b className="tabular"><Capital value={lim.maxBet} /></b></div>
              <div>
                <div className="mb-1 flex justify-between"><span className="text-muted">Misé</span><span className="tabular"><b><Capital value={lim.staked} /></b> / <Capital value={lim.tier.dayStake} /></span></div>
                <Progress value={lim.staked / lim.tier.dayStake} tone="bg-violet-500" />
              </div>
              <div>
                <div className="mb-1 flex justify-between"><span className="text-muted">Gain net</span><span className="tabular"><b className={lim.net > 0 ? "text-success" : lim.net < 0 ? "text-danger" : ""}>{lim.net > 0 ? "+" : lim.net < 0 ? "−" : ""}<Capital value={Math.abs(lim.net)} /></b> / <Capital value={lim.winCap} /> max</span></div>
                <Progress value={lim.net / lim.winCap} tone="bg-success" />
              </div>
              {closed && <p className="rounded-[10px] bg-amber-50 px-3 py-2 text-amber-800">{lim.winLeft <= 0 ? "Plafond de gains atteint : revenez demain." : "Limite de mises atteinte : revenez demain."}</p>}
              {next && (
                <p className="rounded-[10px] bg-violet-50 px-3 py-2 text-violet-900">
                  Améliorez en <b>{BUILDING_BY_ID[next.id].name}</b> (sur la carte de la Ville) : mise max <Capital value={next.maxBet} />, <Capital value={next.dayStake} /> misés par jour.
                </p>
              )}
            </div>
          </Card>
          <Card title="Dernières parties">
            {log.length ? (
              <ul className="divide-y divide-line text-[12px]">
                {log.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate"><b>{p.game}</b> <span className="text-muted">· {p.detail}</span></span>
                    <span className={`shrink-0 font-semibold tabular ${p.payout > p.bet ? "text-success" : p.payout < p.bet ? "text-danger" : "text-muted"}`}>{p.payout - p.bet > 0 ? "+" : p.payout < p.bet ? "−" : ""}<Capital value={Math.abs(p.payout - p.bet)} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[12px] text-muted">Aucune partie pour l’instant.</p>}
          </Card>
          <p className="px-1 text-[11px] leading-relaxed text-muted">Le casino se joue avec le capital que produisent vos placements, jamais avec vos liquidités. Chaque jeu rend en moyenne un peu moins que ce qu’on y mise : c’est un divertissement, pas un placement.</p>
        </div>
      </div>
    </div>
  );
}

function Locked() {
  const b = BUILDING_BY_ID.casino;
  return (
    <div>
      <PageHeader icon={Dices} title="Casino" subtitle="Roulette, machine à sous et crash" />
      <div className="card mx-auto max-w-md p-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-violet-100 text-violet-700"><Lock size={24} /></div>
        <h2 className="text-[17px] font-semibold">Construisez un casino</h2>
        <p className="mt-1 text-[13px] text-muted">Le bâtiment Casino (Ville › Commerce, dès {b.unlockPop?.toLocaleString("fr-FR")} habitants) ouvre cette salle. Améliorez-le pour miser plus chaque jour.</p>
        <Link href="/ville" className="mt-4 inline-block rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white">Aller à la Ville</Link>
      </div>
    </div>
  );
}

function BetBar({ bet, setBet, max, busy, closed }: { bet: number; setBet: (v: number) => void; max: number; busy: boolean; closed: boolean }) {
  const clamp = (v: number) => Math.max(MIN_BET, Math.min(Math.max(MIN_BET, max), Math.floor(v) || MIN_BET));
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <label className="flex items-center gap-2 text-[12px] text-muted">Mise en capital
        <input type="number" inputMode="numeric" min={MIN_BET} max={max} value={bet} disabled={busy || closed}
          onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value) || 0)))} onBlur={() => setBet(clamp(bet))}
          className="w-28 rounded-[10px] border border-line bg-card px-3 py-1.5 text-[14px] font-semibold tabular text-ink" />
        <CapitalCoin size={18} />
      </label>
      {[["½", bet / 2], ["×2", bet * 2], ["Max", max]].map(([l, v]) => (
        <button key={l as string} type="button" disabled={busy || closed} onClick={() => setBet(clamp(v as number))}
          className="rounded-[8px] bg-slate-100 px-2.5 py-1.5 text-[12px] font-semibold text-ink hover:bg-slate-200 disabled:opacity-40">{l}</button>
      ))}
    </div>
  );
}

interface GameProps { run: (c: CasinoChoice) => CasinoResult | null; busy: boolean; setBusy: (b: boolean) => void; record: (r: CasinoResult, detail: string) => void }

// ─── Roulette ───
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SEG = 360 / 37;
const colorOf = (n: number) => (n === 0 ? "#15803d" : RED.has(n) ? "#c2410c" : "#1f2937");
const SIMPLE: { label: string; bet: RouletteBet }[] = [
  { label: "Rouge", bet: { kind: "red" } }, { label: "Noir", bet: { kind: "black" } },
  { label: "Pair", bet: { kind: "even" } }, { label: "Impair", bet: { kind: "odd" } },
  { label: "1 à 18", bet: { kind: "low" } }, { label: "19 à 36", bet: { kind: "high" } },
  { label: "1re douzaine", bet: { kind: "dozen", n: 1 } }, { label: "2e douzaine", bet: { kind: "dozen", n: 2 } }, { label: "3e douzaine", bet: { kind: "dozen", n: 3 } },
];
const betLabel = (b: RouletteBet) => (b.kind === "number" ? `n° ${b.n}` : SIMPLE.find((s) => JSON.stringify(s.bet) === JSON.stringify(b))!.label);

function Roulette({ run, busy, setBusy, record }: GameProps) {
  const [choice, setChoice] = useState<RouletteBet>({ kind: "red" });
  const [rot, setRot] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const spin = () => {
    const r = run({ game: "roulette", bet: choice });
    if (!r || r.outcome.game !== "roulette") return;
    const n = r.outcome.n, idx = WHEEL.indexOf(n);
    setBusy(true); setShown(null); play("tick");
    // La case tirée s'arrête sous le repère, après cinq tours complets
    setRot((cur) => cur - (((cur % 360) + 360) % 360) + 360 * 5 + (360 - idx * SEG));
    timer.current = window.setTimeout(() => { setShown(n); setBusy(false); record(r, `${betLabel(choice)} → ${n}`); }, 3400);
  };

  return (
    <div className="grid items-center gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="relative mx-auto h-[220px] w-[220px] sm:h-[240px] sm:w-[240px]">
        <svg viewBox="-110 -110 220 220" className="h-full w-full drop-shadow-md" style={{ transform: `rotate(${rot}deg)`, transition: busy ? "transform 3.3s cubic-bezier(.12,.75,.16,1)" : "none" }}>
          <circle r="108" fill="#7a5230" /><circle r="100" fill="#3a2414" />
          {WHEEL.map((n, i) => {
            const a0 = ((i - 0.5) * SEG - 90) * Math.PI / 180, a1 = ((i + 0.5) * SEG - 90) * Math.PI / 180;
            const p = (a: number, r: number) => `${Math.cos(a) * r},${Math.sin(a) * r}`;
            const mid = (i * SEG - 90) * Math.PI / 180;
            return (
              <g key={n}>
                <path d={`M${p(a0, 96)}A96 96 0 0 1 ${p(a1, 96)}L${p(a1, 62)}A62 62 0 0 0 ${p(a0, 62)}Z`} fill={colorOf(n)} stroke="#e9d5a7" strokeWidth=".6" />
                <text x={Math.cos(mid) * 83} y={Math.sin(mid) * 83} fill="#fff" fontSize="8.5" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * SEG} ${Math.cos(mid) * 83} ${Math.sin(mid) * 83})`}>{n}</text>
              </g>
            );
          })}
          <circle r="62" fill="#5b3a1f" /><circle r="40" fill="#7c3aed" /><circle r="40" fill="none" stroke="#e6b92e" strokeWidth="3" />
          {[0, 90, 180, 270].map((a) => <rect key={a} x="-3" y="-38" width="6" height="30" rx="3" fill="#e6b92e" transform={`rotate(${a})`} />)}
          <circle r="9" fill="#e6b92e" />
        </svg>
        <div className="absolute left-1/2 top-[-4px] h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[16px] border-x-transparent border-t-amber-400 drop-shadow" />
        {shown !== null && <div className="absolute inset-0 grid place-items-center"><span className="appear grid h-14 w-14 place-items-center rounded-full text-[22px] font-bold text-white ring-4 ring-amber-300" style={{ background: colorOf(shown) }}>{shown}</span></div>}
      </div>
      <div className="min-w-0">
        <div className="grid grid-cols-3 gap-1.5">
          {SIMPLE.map((s) => {
            const on = JSON.stringify(s.bet) === JSON.stringify(choice);
            return <button key={s.label} type="button" disabled={busy} onClick={() => setChoice(s.bet)}
              className={`rounded-[9px] px-2 py-2 text-[12px] font-semibold transition-colors ${on ? "bg-violet-600 text-white" : s.label === "Rouge" ? "bg-orange-50 text-orange-800 hover:bg-orange-100" : s.label === "Noir" ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-slate-100 text-ink hover:bg-slate-200"}`}>
              {s.label} <span className="font-normal opacity-70">×{roulettePays(s.bet)}</span>
            </button>;
          })}
        </div>
        <div className="mt-2 text-[11px] text-muted">Ou un numéro plein (×36) :</div>
        <div className="mt-1 grid grid-cols-[repeat(13,minmax(0,1fr))] gap-[3px]">
          {Array.from({ length: 37 }, (_, n) => {
            const on = choice.kind === "number" && choice.n === n;
            return <button key={n} type="button" disabled={busy} onClick={() => setChoice({ kind: "number", n })}
              className={`aspect-square rounded-[5px] text-[10px] font-bold text-white sm:text-[11px] ${on ? "ring-2 ring-violet-500 ring-offset-1" : "opacity-85 hover:opacity-100"}`} style={{ background: colorOf(n) }}>{n}</button>;
          })}
        </div>
        <Button onClick={spin} disabled={busy} className="mt-3 w-full !bg-violet-600 hover:!bg-violet-700">{busy ? "La bille tourne…" : `Lancer la bille · ${betLabel(choice)}`}</Button>
      </div>
    </div>
  );
}

// ─── Machine à sous ───
const SYMS = Object.keys(SLOT_WEIGHTS) as Symbol[];
function SlotIcon({ s, size = 40 }: { s: Symbol; size?: number }) {
  switch (s) {
    case "cherry": return <Cherry size={size} className="text-red-600" strokeWidth={2} />;
    case "lemon": return <Citrus size={size} className="text-amber-500" strokeWidth={2} />;
    case "bell": return <Bell size={size} className="text-yellow-600" strokeWidth={2} />;
    case "bar": return <span className="rounded-[6px] bg-slate-800 px-1.5 py-0.5 font-black tracking-wider text-amber-300" style={{ fontSize: size * 0.45 }}>BAR</span>;
    case "coin": return <CapitalCoin size={size} />;
    case "seven": return <span className="font-black leading-none text-violet-700" style={{ fontSize: size * 1.05, textShadow: "0 2px 0 #e6b92e" }}>7</span>;
  }
}

function Slots({ run, busy, setBusy, record }: GameProps) {
  const [reels, setReels] = useState<Symbol[]>(["seven", "coin", "bell"]);
  const [stopped, setStopped] = useState(3);
  const [win, setWin] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); }), []);

  const pull = () => {
    const r = run({ game: "slots" });
    if (!r || r.outcome.game !== "slots") return;
    const final = r.outcome.reels;
    setBusy(true); setStopped(0); setWin(false);
    let k = 0, done = 0;
    const roll = window.setInterval(() => {
      k++;
      setReels((cur) => cur.map((s, i) => (i < done ? final[i] : SYMS[(SYMS.indexOf(s) + 1 + i + k) % SYMS.length])));
      if (k % 2 === 0) play("tick");
    }, 70);
    timers.current = [roll];
    [700, 1050, 1400].forEach((ms, i) => timers.current.push(window.setTimeout(() => {
      done = i + 1; setStopped(done); play("reel");
      setReels((cur) => cur.map((s, j) => (j < done ? final[j] : s)));
      if (i === 2) { window.clearInterval(roll); setReels(final); setBusy(false); setWin(r.payout > 0); record(r, r.payout ? `×${Math.round(r.payout / r.bet * 10) / 10}` : "perdu"); }
    }, ms)));
  };

  return (
    <div className="mx-auto max-w-[460px]">
      <div className={`rounded-[20px] bg-gradient-to-b from-violet-700 to-violet-900 p-3 shadow-inner ring-4 ${win ? "ring-amber-300" : "ring-violet-300/40"} transition-shadow`}>
        <div className="grid grid-cols-3 gap-2">
          {reels.map((s, i) => (
            <div key={i} className={`grid h-24 place-items-center rounded-[12px] bg-gradient-to-b from-white to-slate-100 shadow sm:h-28 ${busy && i >= stopped ? "blur-[1px]" : ""}`}>
              <SlotIcon s={s} />
            </div>
          ))}
        </div>
      </div>
      <Button onClick={pull} disabled={busy} className="mt-3 w-full !bg-violet-600 hover:!bg-violet-700">{busy ? "Les rouleaux tournent…" : "Tirer le levier"}</Button>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">
        {[...SYMS].reverse().map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="flex items-center gap-0.5">{[0, 1, 2].map((i) => <SlotIcon key={i} s={s} size={14} />)}</span>
            <b className="tabular">×{SLOT_TRIPLE[s]}</b>
          </div>
        ))}
        <div className="flex items-center gap-1.5"><span className="flex items-center gap-0.5"><SlotIcon s="cherry" size={14} /><SlotIcon s="cherry" size={14} /></span><b>×2</b></div>
      </div>
    </div>
  );
}

// ─── Crash ───
function Crash({ run, busy, setBusy, record }: GameProps) {
  const [target, setTarget] = useState(2);
  const [m, setM] = useState(1);
  const [pts, setPts] = useState<number[]>([1]);
  const [end, setEnd] = useState<{ point: number; won: boolean } | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const go = () => {
    const r = run({ game: "crash", target });
    if (!r || r.outcome.game !== "crash") return;
    const point = r.outcome.point, tgt = r.outcome.target, won = point >= tgt;
    // La courbe monte de façon exponentielle ; les très hauts multiplicateurs accélèrent pour ne pas durer plus de 6 s
    const k = Math.max(0.32, Math.log(point) / 6), t0 = performance.now();
    setBusy(true); setEnd(null); setPts([1]); setM(1);
    let lastTick = 0;
    const step = (ts: number) => {
      const t = (ts - t0) / 1000, v = Math.min(point, Math.exp(k * t));
      setM(v); setPts((p) => (p.length > 240 ? p.filter((_, i) => i % 2 === 0) : p).concat(v));
      if (t - lastTick > 0.25) { lastTick = t; play("tick"); }
      if (v >= point) { setEnd({ point, won }); setBusy(false); record(r, won ? `encaissé à ×${fmtX(tgt)}` : `effondré à ×${fmtX(point)}`); return; }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const top = Math.max(target * 1.2, ...pts, 2);
  const W = 300, H = 150;
  const path = pts.map((v, i) => `${i ? "L" : "M"}${(i / Math.max(1, pts.length - 1)) * W},${H - ((v - 1) / (top - 1)) * H}`).join("");
  const cashed = busy ? m >= target : end?.won;
  const ty = H - ((target - 1) / (top - 1)) * H;
  return (
    <div>
      <div className="relative overflow-hidden rounded-[14px] bg-slate-900 p-3">
        <svg viewBox={`-6 -10 ${W + 12} ${H + 20}`} className="h-[170px] w-full sm:h-[210px]" preserveAspectRatio="none">
          <line x1="0" x2={W} y1={ty} y2={ty} stroke="#e6b92e" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={path} fill="none" stroke={end && !end.won ? "#f87171" : "#a78bfa"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className={`text-[40px] font-black tabular leading-none sm:text-[52px] ${end ? (end.won ? "text-emerald-300" : "text-red-400") : cashed ? "text-emerald-300" : "text-white"}`}>×{fmtX(end ? end.point : m)}</div>
            <div className="mt-1 text-[12px] font-semibold text-slate-300">
              {end ? (end.won ? `Encaissé à ×${fmtX(target)}` : "Effondrement") : busy ? (cashed ? `Encaissé à ×${fmtX(target)} ✓` : `Cible ×${fmtX(target)}`) : "Choisissez une cible puis lancez"}
            </div>
          </div>
        </div>
        <span className="absolute right-3 top-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300"><TrendingUp size={13} /> cible ×{fmtX(target)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex min-w-[200px] flex-1 items-center gap-3 text-[12px] text-muted">
          Encaisser à
          <input type="range" min={CRASH.minTarget} max={10} step={0.1} value={Math.min(target, 10)} disabled={busy} onChange={(e) => setTarget(Number(e.target.value))} className="flex-1 accent-violet-600" />
          <input type="number" min={CRASH.minTarget} max={CRASH.maxTarget} step={0.1} value={target} disabled={busy}
            onChange={(e) => setTarget(Math.min(CRASH.maxTarget, Math.max(CRASH.minTarget, Number(e.target.value) || CRASH.minTarget)))}
            className="w-20 rounded-[10px] border border-line bg-card px-2 py-1.5 text-[14px] font-semibold tabular text-ink" />
        </label>
        <span className="text-[12px] text-muted">Chance : <b className="text-ink">{Math.round((CRASH.edge / target) * 100)} %</b></span>
      </div>
      <Button onClick={go} disabled={busy} className="mt-3 w-full !bg-violet-600 hover:!bg-violet-700">{busy ? "La courbe monte…" : `Lancer · encaisser à ×${fmtX(target)}`}</Button>
    </div>
  );
}
const fmtX = (v: number) => v.toFixed(2).replace(".", ",");
