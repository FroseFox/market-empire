"use client";
// Briques du wiki : rubrique, encadré, étapes, chiffres clés, tableau, questions repliables.
// Les rubriques apparaissent en douceur au défilement (coupé si le joueur préfère moins de mouvement).
import { useEffect, useRef } from "react";
import { ChevronDown, Info, Lightbulb, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Fait apparaître son contenu quand il entre à l'écran. Ce qui est déjà visible à l'ouverture ne bouge pas,
 *  et sans JavaScript tout reste affiché. */
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.classList.add("is-armed");
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { el.classList.add("is-in"); io.disconnect(); } }, { rootMargin: "0px 0px -6% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`wiki-reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>;
}

/** Couleurs d'une rubrique : pastille de l'icône et liseré. */
export const TINTS = {
  blue: "bg-primary-soft text-primary",
  green: "bg-success-soft text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
  sky: "bg-sky-50 text-sky-600",
} as const;
export type Tint = keyof typeof TINTS;

/** Une rubrique du wiki. `brief` = l'essentiel en une phrase, lu avant tout le reste. */
export function Section({ id, icon: Icon, tint = "blue", title, brief, hidden, children }: {
  id: string; icon: LucideIcon; tint?: Tint; title: string; brief?: React.ReactNode; hidden?: boolean; children: React.ReactNode;
}) {
  return (
    <section id={id} data-wiki-section={id} hidden={hidden} className="scroll-mt-32 xl:scroll-mt-24">
      <Reveal>
        <div className="card overflow-hidden">
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${TINTS[tint]}`}><Icon size={20} strokeWidth={1.9} /></span>
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold leading-tight">{title}</h2>
              {brief && <p className="mt-0.5 text-[13px] leading-snug text-muted">{brief}</p>}
            </div>
          </header>
          <div className="px-5 py-4 text-[13px] leading-relaxed text-ink/90">{children}</div>
        </div>
      </Reveal>
    </section>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-5 flex items-center gap-2 text-[14px] font-semibold first:mt-0"><span className="h-3.5 w-1 rounded-full bg-primary" />{children}</h3>;
}

const CALLOUT = {
  info: { icon: Info, cls: "border-blue-200 bg-primary-soft text-blue-900" },
  tip: { icon: Lightbulb, cls: "border-emerald-200 bg-success-soft text-emerald-900" },
  warn: { icon: TriangleAlert, cls: "border-amber-200 bg-amber-50 text-amber-900" },
} as const;
/** Encadré : une information à retenir, une astuce ou une mise en garde. */
export function Callout({ tone = "info", title, children }: { tone?: keyof typeof CALLOUT; title?: string; children: React.ReactNode }) {
  const { icon: Icon, cls } = CALLOUT[tone];
  return (
    <div className={`mt-3 flex gap-2.5 rounded-[12px] border px-3.5 py-3 text-[13px] leading-relaxed ${cls}`}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{title && <b className="font-semibold">{title} </b>}{children}</div>
    </div>
  );
}

/** Étapes numérotées, reliées par un trait. */
export function Steps({ items }: { items: { title: string; text: React.ReactNode; extra?: React.ReactNode }[] }) {
  return (
    <ol className="mt-3 space-y-0">
      {items.map((s, i) => (
        <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-line" />}
          <span className="z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-white">{i + 1}</span>
          <div className="min-w-0 pt-0.5"><div className="font-semibold">{s.title}</div><div className="text-muted">{s.text}</div>{s.extra}</div>
        </li>
      ))}
    </ol>
  );
}

/** Chiffres clés, en tuiles. */
export function Facts({ items, cols = 4 }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode; tint?: Tint }[]; cols?: 2 | 3 | 4 }) {
  const grid = cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <dl className={`mt-3 grid grid-cols-2 gap-2 ${grid}`}>
      {items.map((f) => (
        <div key={f.label} className="rounded-[12px] bg-slate-50 p-3">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{f.label}</dt>
          <dd className={`mt-0.5 text-[18px] font-bold leading-tight tabular ${f.tint ? TINTS[f.tint].split(" ")[1] : ""}`}>{f.value}</dd>
          {f.sub && <dd className="mt-0.5 text-[11px] leading-snug text-muted">{f.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Liste à puces sobres. */
export function Points({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((t, i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" /><span className="min-w-0">{t}</span></li>)}
    </ul>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full text-[12px]">
        <thead className="bg-slate-50 text-left text-muted"><tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top transition-colors hover:bg-slate-50/70">
              {r.map((c, j) => <td key={j} className={`px-3 py-2 ${j === 0 ? "font-semibold" : "tabular"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Questions repliables : on ouvre seulement celle qui nous concerne. */
export function Accordion({ items }: { items: { q: string; why: string; fix: React.ReactNode; tone?: "bad" | "warn" | "info" }[] }) {
  const dot = { bad: "bg-danger", warn: "bg-warning", info: "bg-primary" };
  return (
    <div className="mt-3 divide-y divide-line overflow-hidden rounded-[12px] border border-line">
      {items.map((it) => (
        <details key={it.q} className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 font-semibold hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot[it.tone ?? "warn"]}`} />
            <span className="min-w-0 flex-1">{it.q}</span>
            <ChevronDown size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-1.5 bg-slate-50/60 px-3.5 pb-3.5 pt-1 pl-8">
            <p><span className="text-muted">Pourquoi : </span>{it.why}</p>
            <p><span className="font-semibold text-emerald-700">Solution : </span>{it.fix}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

/** Petite étiquette colorée. */
export function Tag({ children, cls = "bg-slate-100 text-slate-700" }: { children: React.ReactNode; cls?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

/** Curseur étiqueté, pour les petites simulations. */
export function Slider({ label, value, min, max, step = 1, onChange, show }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; show: string }) {
  return (
    <label className="block text-[12px]">
      <span className="flex items-baseline justify-between gap-2"><span className="font-medium">{label}</span><span className="font-bold tabular text-primary">{show}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="wiki-range mt-1.5 w-full" />
    </label>
  );
}

/** Cadre d'une simulation interactive. */
export function Demo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-line bg-gradient-to-b from-slate-50 to-white">
      <div className="flex items-center gap-2 border-b border-line bg-white/70 px-4 py-2.5 text-[12px] font-semibold"><span className="relative flex h-2 w-2"><span className="wiki-pulse absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>Essayez : {title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}
