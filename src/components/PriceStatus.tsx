"use client";
// Statut du prix d'un actif : « Réel » (cours de marché, mis à jour chaque heure)
// ou « Fictif » (aucune source gratuite : cours simulé par le jeu).
import { useGame } from "@/store/game";

export default function PriceStatus({ symbol, large = false }: { symbol: string; large?: boolean }) {
  const source = useGame((s) => s.quotes[symbol]?.source);
  if (!source) return null;
  const real = source === "réel";
  return (
    <span
      title={real ? "Prix réel : cours de marché, mis à jour chaque heure" : "Prix fictif : aucune source de cours disponible, prix simulé par le jeu"}
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${large ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[10px]"} ${real ? "bg-success-soft text-emerald-700" : "bg-warning-soft text-amber-700"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${real ? "bg-success" : "bg-warning"}`} />
      {real ? "Réel" : "Fictif"}
    </span>
  );
}
