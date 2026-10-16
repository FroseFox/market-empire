"use client";
import { useId } from "react";
import { capitalNum } from "@/lib/format";

/**
 * Pièce de capital : pièce frappée violette, tranche visible et « M » en relief.
 * Même signature qu'une icône lucide (size, className) pour pouvoir la passer en `icon`.
 * Par défaut elle prend la taille du texte (1em) et s'aligne sur la ligne.
 */
export function CapitalCoin({ size = "1em", className = "", title }: { size?: number | string; className?: string; title?: string; strokeWidth?: number }) {
  const id = useId().replace(/:/g, "");
  const face = `cf${id}`, rim = `cr${id}`;
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} className={`inline-block shrink-0 ${className}`}
      style={{ verticalAlign: "-0.16em" }} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}
    >
      <defs>
        <linearGradient id={face} x1="0.2" y1="0.1" x2="0.8" y2="0.95">
          <stop offset="0" stopColor="#d8ccff" />
          <stop offset="0.45" stopColor="#9b7cf4" />
          <stop offset="1" stopColor="#6a3fd6" />
        </linearGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c55e6" />
          <stop offset="1" stopColor="#3f1d8f" />
        </linearGradient>
      </defs>
      {/* Tranche (épaisseur de la pièce) */}
      <circle cx="12" cy="13.3" r="10.2" fill="#35177a" />
      {/* Bord, puis face légèrement en creux */}
      <circle cx="12" cy="12" r="10.2" fill={`url(#${rim})`} />
      <circle cx="12" cy="12" r="8.3" fill={`url(#${face})`} />
      <circle cx="12" cy="12" r="8.3" fill="none" stroke="#2e1470" strokeOpacity=".35" strokeWidth=".7" />
      {/* Grènetis : petits crans le long du bord */}
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="#e9e2ff" strokeOpacity=".45" strokeWidth=".9" strokeDasharray=".9 1.15" />
      {/* « M » en relief : ombre portée puis lettre claire */}
      <path d="M8.1 15.9V8.6l3.9 4.6 3.9-4.6v7.3" fill="none" stroke="#3a1a8a" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" transform="translate(.45 .6)" />
      <path d="M8.1 15.9V8.6l3.9 4.6 3.9-4.6v7.3" fill="none" stroke="#f5f1ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      {/* Reflet */}
      <path d="M5.6 9.2a7.2 7.2 0 0 1 3.6-4" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Montant de capital : nombre abrégé suivi de la pièce. */
export function Capital({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`whitespace-nowrap ${className}`}>{capitalNum(value)}{" "}<CapitalCoin /></span>;
}
