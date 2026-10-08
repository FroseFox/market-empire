"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { pct } from "@/lib/format";

export function PageHeader({ icon: Icon, title, subtitle, children }: { icon: LucideIcon; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 sm:gap-4 mb-4 sm:mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <div className="hidden sm:grid h-11 w-11 shrink-0 rounded-[12px] bg-primary-soft text-primary place-items-center"><Icon size={22} strokeWidth={1.8} /></div>
        <div className="min-w-0">
          <h1 className="text-[24px] sm:text-[28px] md:text-[32px] font-semibold leading-tight">{title}</h1>
          <p className="text-muted text-[12px] sm:text-[13px]">{subtitle}</p>
        </div>
      </div>
      {children && <div className="sm:ml-auto flex max-w-full min-w-0 flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Pastille « verrouillé » : même apparence partout (cadenas + texte sur fond ambre), lisible d'un coup d'œil. */
export function LockTag({ children = "Verrouillé", className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ${className}`}>
      <Lock size={12} strokeWidth={2.4} />{children}
    </span>
  );
}

export function Card({ title, icon: Icon, action, extra, className = "", children }: { title?: string; icon?: LucideIcon; action?: { label: string; href: string }; extra?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`card p-5 appear ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {Icon && <Icon size={18} className="text-primary" strokeWidth={1.9} />}
          <h2 className="text-[16px] font-semibold">{title}</h2>
          {action && (
            <Link href={action.href} className="ml-auto text-[12px] text-primary font-medium inline-flex items-center gap-0.5 hover:underline">
              {action.label}<ChevronRight size={14} />
            </Link>
          )}
          {extra && <div className="ml-auto">{extra}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Delta({ value, suffix, className = "" }: { value: number; suffix?: string; className?: string }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold tabular ${up ? "text-success" : "text-danger"} ${className}`}>
      <Icon size={14} strokeWidth={2.4} />{pct(value)}{suffix && <span className="font-normal text-muted ml-1">{suffix}</span>}
    </span>
  );
}

export function StatCard({ icon: Icon, tint, label, value, children, href }: { icon: LucideIcon; tint: string; label: string; value: string; children?: React.ReactNode; href?: string }) {
  const body = (
    <div className="card p-5 flex items-center gap-4 appear h-full hover:border-slate-300 transition-colors">
      <div className={`h-12 w-12 shrink-0 rounded-full grid place-items-center ${tint}`}><Icon size={22} strokeWidth={1.9} /></div>
      <div className="min-w-0">
        <div className="text-[13px] text-muted font-medium">{label}</div>
        {/* Les très grands montants passent en plus petit plutôt que d'être coupés */}
        <div title={value} className={`${value.length > 13 ? "text-[19px]" : value.length > 11 ? "text-[22px]" : "text-[26px]"} font-bold leading-tight tabular truncate`}>{value}</div>
        <div className="text-[12px] text-muted">{children}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Progress({ value, tone = "bg-success" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-[10px] bg-slate-100 p-0.5 [&>button]:shrink-0">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`px-3 py-1 text-[12px] font-medium rounded-[8px] transition-colors ${o === value ? "bg-card text-primary shadow-sm" : "text-muted hover:text-ink"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function Button({ variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "success" }) {
  const styles = {
    primary: "bg-primary text-white hover:bg-blue-700",
    secondary: "bg-card border border-line text-ink hover:bg-slate-50",
    danger: "bg-danger text-white hover:bg-red-600",
    success: "bg-success text-white hover:bg-emerald-600",
  }[variant];
  return <button {...props} className={`rounded-[10px] px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${className}`} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-muted text-[13px] py-8">{children}</div>;
}

/** Bouton à deux clics (les boîtes de dialogue du navigateur ne sont pas toujours disponibles). */
export function ConfirmButton({ onConfirm, confirmLabel, className, disabled, children }: { onConfirm: () => void; confirmLabel: string; className: string; disabled?: boolean; children: React.ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button className={className} disabled={disabled} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : children}
    </button>
  );
}
