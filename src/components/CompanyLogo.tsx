"use client";
// Logo d'une entreprise.
// - Site hébergé : le logo officiel est chargé depuis Logo.dev (clé NEXT_PUBLIC_LOGO_DEV_KEY).
// - Sans clé, ou si l'image ne charge pas : un badge aux couleurs du secteur.
import { useState } from "react";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { STATIC_MODE } from "@/lib/market/client";

const LOGO_KEY = process.env.NEXT_PUBLIC_LOGO_DEV_KEY ?? "";

const SECTOR_TINT: Record<string, [string, string]> = {
  "Technologie": ["#1E3A8A", "#2563EB"],
  "Semi-conducteurs": ["#0F766E", "#14B8A6"],
  "Commerce en ligne": ["#9A3412", "#F97316"],
  "Automobile": ["#7F1D1D", "#EF4444"],
  "Médias": ["#831843", "#EC4899"],
  "Banque": ["#1E293B", "#475569"],
  "Paiements": ["#312E81", "#6366F1"],
  "Consommation": ["#92400E", "#F59E0B"],
  "Énergie": ["#365314", "#65A30D"],
  "Luxe": ["#44403C", "#A8A29E"],
  "Aéronautique": ["#0C4A6E", "#0EA5E9"],
  "Santé": ["#064E3B", "#10B981"],
  "Logiciels": ["#4C1D95", "#8B5CF6"],
  "Indice": ["#0F172A", "#334155"],
};

export default function CompanyLogo({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const asset = ASSET_BY_SYMBOL[symbol];
  const [failed, setFailed] = useState(false);
  const useImage = !!LOGO_KEY && !STATIC_MODE && !failed && asset?.kind === "stock";
  const radius = Math.round(size * 0.26);

  if (useImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`https://img.logo.dev/ticker/${encodeURIComponent(asset.providerSymbol)}?token=${LOGO_KEY}&size=${size * 2}&format=png&retina=true`}
        alt={`Logo ${asset.name}`} width={size} height={size} loading="lazy" onError={() => setFailed(true)}
        className="shrink-0 bg-white object-contain border border-line" style={{ borderRadius: radius, width: size, height: size }} />
    );
  }

  const [from, to] = SECTOR_TINT[asset?.sector ?? ""] ?? ["#0F172A", "#334155"];
  const label = symbol.length > 4 ? symbol.slice(0, 4) : symbol;
  return (
    <span aria-label={asset?.name ?? symbol} role="img"
      className="shrink-0 grid place-items-center text-white font-bold tracking-tight"
      style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${from}, ${to})`, fontSize: Math.max(9, size * (label.length > 3 ? 0.28 : 0.34)) }}>
      {label}
    </span>
  );
}
