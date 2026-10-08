"use client";
// Bouton « Installer l'appli » (site publié). Chrome, Edge et Android préviennent quand l'installation est possible :
// on garde leur invitation et on l'ouvre au clic. Sur iPhone et iPad, Safari n'a pas d'invitation : on explique le geste.
// Rien ne s'affiche si le jeu tourne déjà comme une appli, ou si le navigateur ne sait pas installer.
import { useState, useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";
import { STATIC_MODE } from "@/lib/market/client";

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let prompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  // L'invitation peut arriver avant l'affichage du bouton : on l'attrape dès le chargement
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); prompt = e as InstallPrompt; tell(); });
  window.addEventListener("appinstalled", () => { prompt = null; tell(); });
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

type Way = "none" | "prompt" | "ios";
function way(): Way {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "none";
  if (prompt) return "prompt";
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua) ? "ios" : "none";
}

/** `dark` : dans le menu latéral sombre ; sinon dans un panneau clair (téléphone). */
export default function InstallApp({ dark = false }: { dark?: boolean }) {
  const mode = useSyncExternalStore<Way>(subscribe, way, () => "none");
  const [help, setHelp] = useState(false);
  if (STATIC_MODE || mode === "none") return null;
  const install = async () => {
    if (mode === "ios" || !prompt) { setHelp((h) => !h); return; }
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    prompt = null; tell(); // une invitation ne sert qu'une fois
  };
  return (
    <div className={dark ? "mb-3" : "mt-3"}>
      <button type="button" onClick={install} aria-expanded={mode === "ios" ? help : undefined}
        className={`flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-primary-soft text-primary active:bg-blue-100"}`}>
        <Download size={17} strokeWidth={2} className="shrink-0" />
        <span className="min-w-0 flex-1">Installer l&apos;appli<span className={`block text-[11px] font-normal ${dark ? "text-slate-400" : "text-muted"}`}>Une icône, et le jeu en plein écran</span></span>
      </button>
      {mode === "ios" && help && (
        <ol className={`mt-2 space-y-1 rounded-[12px] px-3 py-2.5 text-[12px] leading-snug ${dark ? "bg-white/5 text-slate-300" : "bg-slate-50 text-ink"}`}>
          <li className="flex items-start gap-1.5">1. Touchez le bouton Partager <Share size={13} className="mt-0.5 shrink-0" /> de Safari.</li>
          <li>2. Choisissez « Sur l&apos;écran d&apos;accueil ».</li>
          <li>3. Validez avec « Ajouter ».</li>
        </ol>
      )}
    </div>
  );
}
