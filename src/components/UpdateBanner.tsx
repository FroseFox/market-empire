"use client";
// Bandeau « Nouvelle version » : l'appli est restée ouverte pendant qu'une nouvelle version était publiée (lib/version.ts).
// « Mettre à jour » enregistre la partie puis recharge la page.
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { startVersionCheck, useVersion } from "@/lib/version";
import { saveNow } from "@/lib/online";

export default function UpdateBanner() {
  const outdated = useVersion((s) => s.outdated);
  const [busy, setBusy] = useState(false);
  useEffect(() => startVersionCheck(), []);
  if (!outdated) return null;
  const update = async () => {
    setBusy(true);
    await saveNow().catch(() => false);
    location.reload();
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-primary-soft px-3 py-2 sm:px-4 md:px-8" role="status">
      <span className="text-[13px]">Une nouvelle version du jeu est disponible.</span>
      <button type="button" onClick={update} disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
        <RefreshCw size={13} className={busy ? "animate-spin" : ""} />Mettre à jour
      </button>
    </div>
  );
}
