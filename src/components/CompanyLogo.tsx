"use client";
// Logo d'une entreprise.
// - Site publié : le logo vient de Logo.dev, avec la clé publique (« publishable key »)
//   NEXT_PUBLIC_LOGO_DEV_KEY, faite pour être utilisée dans le navigateur.
// - Sans clé, ou si l'image ne charge pas : un badge aux couleurs du secteur.
import { useState } from "react";
import { ASSET_BY_SYMBOL, type Asset } from "@/lib/market/universe";
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
  "Pays": ["#1E3A8A", "#0EA5E9"],
  "Sectoriel": ["#312E81", "#6366F1"],
  "Obligations": ["#334155", "#64748B"],
  "Jeux vidéo": ["#581C87", "#A855F7"],
  "Transport": ["#0C4A6E", "#38BDF8"],
  "Tourisme": ["#9F1239", "#FB7185"],
  "Distribution": ["#1E40AF", "#3B82F6"],
  "Restauration": ["#991B1B", "#F87171"],
  "Habillement": ["#3F3F46", "#71717A"],
  "Boissons": ["#7C2D12", "#EA580C"],
  "Assurance": ["#1E3A8A", "#60A5FA"],
  "Défense": ["#3F6212", "#84CC16"],
  "Industrie": ["#374151", "#6B7280"],
  "Télécoms": ["#9A3412", "#FB923C"],
  "Chimie": ["#0E7490", "#22D3EE"],
  "Construction": ["#78350F", "#D97706"],
  "Mines": ["#57534E", "#A8A29E"],
  "Électronique": ["#111827", "#4B5563"],
  "Métaux précieux": ["#A16207", "#FACC15"],
  "Métaux industriels": ["#9A3412", "#F97316"],
  "Agriculture": ["#3F6212", "#A3E635"],
  "Cryptomonnaie": ["#C2410C", "#F59E0B"],
};

/** Adresse du logo : cryptos par symbole, sociétés étrangères par site web, les autres par symbole boursier. */
function logoUrl(a: Asset, size: number): string | null {
  const q = `token=${LOGO_KEY}&size=${size * 2}&format=png&retina=true`;
  if (a.kind === "crypto") return `https://img.logo.dev/crypto/${encodeURIComponent(a.symbol.toLowerCase())}?${q}`;
  if (a.kind !== "stock") return null;
  if (a.domain) return `https://img.logo.dev/${encodeURIComponent(a.domain)}?${q}`;
  return `https://img.logo.dev/ticker/${encodeURIComponent(a.providerSymbol)}?${q}`;
}

export default function CompanyLogo({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const asset = ASSET_BY_SYMBOL[symbol];
  const [failed, setFailed] = useState(false);
  const src = asset && LOGO_KEY && !STATIC_MODE && !failed ? logoUrl(asset, size) : null;
  const radius = Math.round(size * 0.26);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src}
        alt={`Logo ${asset?.name ?? symbol}`} width={size} height={size} loading="lazy" onError={() => setFailed(true)}
        className="shrink-0 bg-white object-contain border border-line" style={{ borderRadius: radius, width: size, height: size }} />
    );
  }

  const [from, to] = SECTOR_TINT[asset?.sector ?? ""] ?? ["#0F172A", "#334155"];
  const base = asset?.short ?? symbol;
  const label = base.length > 4 ? base.slice(0, 4) : base;
  return (
    <span aria-label={asset?.name ?? symbol} role="img"
      className="shrink-0 grid place-items-center text-white font-bold tracking-tight"
      style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${from}, ${to})`, fontSize: Math.max(9, size * (label.length > 3 ? 0.28 : 0.34)) }}>
      {label}
    </span>
  );
}
