"use client";
import { useId } from "react";
import { capitalNum } from "@/lib/format";

// Pièce de capital : pièce d'or vue de trois quarts (on voit son épaisseur et sa tranche striée),
// frappée d'une colonne, clin d'œil au « chapiteau » de l'architecture.
const RX = 10.5, RY = 8.2, CY = -1.2, T = 3;
/** Stries de la tranche (moitié avant de l'ellipse). */
const REEDS = Array.from({ length: 40 }, (_, i) => {
  const a = (Math.PI * i) / 39, x = RX * Math.cos(Math.PI - a), y = CY + RY * Math.sin(a);
  return `M${x.toFixed(2)} ${y.toFixed(2)}v${T}`;
}).join("");
/** Colonne : chapiteau à volutes, trois cannelures, socle à deux marches. */
const COLUMN = "M-6.2 -5.2h12.4M-5 -5.2c-1.6 0-2.4-1-2.4-1.9 0-1 .9-1.7 1.9-1.7M5 -5.2c1.6 0 2.4-1 2.4-1.9 0-1-.9-1.7-1.9-1.7M-5.6 -8.8h11.2M-3.6 -4.2v8.6M0 -4.2v8.6M3.6 -4.2v8.6M-6 5.2h12M-7 7.4h14";

/** Même signature qu'une icône lucide (size, className) pour pouvoir la passer en `icon`.
 *  Par défaut elle prend la taille du texte (1em) et s'aligne sur la ligne. */
export function CapitalCoin({ size = "1em", className = "", title }: { size?: number | string; className?: string; title?: string; strokeWidth?: number }) {
  const id = useId().replace(/:/g, "");
  const face = `cf${id}`, edge = `ce${id}`, shine = `cs${id}`;
  return (
    <svg
      viewBox="-11 -10.4 22 22" width={size} height={size} className={`inline-block shrink-0 ${className}`}
      style={{ verticalAlign: "-0.18em" }} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}
    >
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" /><stop offset=".35" stopColor="#f2c94c" /><stop offset=".7" stopColor="#d49a1f" /><stop offset="1" stopColor="#a86a0c" />
        </linearGradient>
        <linearGradient id={edge} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c98a14" /><stop offset="1" stopColor="#7a4a06" /></linearGradient>
        <radialGradient id={shine} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fff6d0" stopOpacity=".9" /><stop offset=".5" stopColor="#fff6d0" stopOpacity="0" /></radialGradient>
      </defs>
      {/* Tranche striée */}
      <path d={`M${-RX} ${CY}v${T}a${RX} ${RY} 0 0 0 ${2 * RX} 0v${-T}z`} fill={`url(#${edge})`} />
      <path d={REEDS} stroke="#6b4005" strokeOpacity=".45" strokeWidth=".35" />
      {/* Face, listel et colonne en relief */}
      <ellipse cy={CY} rx={RX} ry={RY} fill={`url(#${face})`} />
      <ellipse cy={CY} rx={RX - 1.9} ry={RY - 1.5} fill="none" stroke="#a86a0c" strokeWidth=".5" />
      <g transform={`translate(0 ${CY + 0.4}) scale(.62 .5)`} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3">
        <path d={COLUMN} stroke="#8a5508" transform="translate(.35 .5)" />
        <path d={COLUMN} stroke="#fff4cc" />
      </g>
      <ellipse cy={CY} rx={RX} ry={RY} fill={`url(#${shine})`} />
    </svg>
  );
}

/** Montant de capital : nombre abrégé suivi de la pièce. */
export function Capital({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`whitespace-nowrap ${className}`}>{capitalNum(value)}{" "}<CapitalCoin /></span>;
}
