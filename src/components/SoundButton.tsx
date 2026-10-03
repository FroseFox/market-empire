"use client";
// Bouton haut-parleur de la barre du haut : couper le son ou régler le volume.
import { useEffect, useRef, useState } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useSound } from "@/lib/sound";

export default function SoundButton() {
  const { on, volume, setOn, setVolume } = useSound();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const Icon = !on || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={on ? "Son activé : régler" : "Son coupé : régler"} aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-slate-100 hover:text-ink"><Icon size={18} /></button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[230px] rounded-[14px] border border-line bg-card p-4 shadow-2xl appear">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold">Sons du jeu</span>
            <button role="switch" aria-checked={on} aria-label="Activer les sons" data-sfx="none" onClick={() => setOn(!on)}
              className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <label className="mt-3 block text-[12px] text-muted">
            Volume
            <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} disabled={!on} onChange={(e) => setVolume(Number(e.target.value) / 100)}
              className="mt-1.5 block w-full accent-[#2563EB] disabled:opacity-40" />
          </label>
          <p className="mt-2 text-[11px] text-muted">Sons discrets, créés par le jeu lui-même : aucun fichier à télécharger.</p>
        </div>
      )}
    </div>
  );
}
