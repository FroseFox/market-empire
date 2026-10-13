"use client";
// Écran « Pas de connexion » : affiché dès que l'appareil n'a plus de réseau, au lieu d'essayer de joindre le serveur
// et d'échouer. Il disparaît tout seul au retour du réseau, et la connexion à la partie est alors relancée.
import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

/** `true` tant que l'appareil a du réseau (le navigateur prévient à chaque changement). */
export function useNetwork(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const update = () => setOn(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return on;
}

export default function NoNetwork() {
  const [checking, setChecking] = useState(false);
  const retry = () => {
    setChecking(true);
    // Le réseau est peut-être revenu sans que le navigateur l'ait encore signalé : on recharge la page
    setTimeout(() => { if (navigator.onLine) location.reload(); else setChecking(false); }, 600);
  };
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-6 text-center text-slate-300" role="alert">
      <div className="max-w-[340px]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/10 text-white"><WifiOff size={30} strokeWidth={1.8} /></span>
        <h1 className="mt-5 text-[24px] font-bold text-white">Pas de connexion</h1>
        <p className="mt-2 text-[14px] leading-relaxed">
          Market Empire a besoin d&apos;internet : la Bourse, votre sauvegarde et les autres joueurs sont en ligne.
        </p>
        <p className="mt-2 text-[13px] text-slate-400">Votre partie est en sécurité. Le jeu reprend tout seul dès que le réseau revient.</p>
        <button type="button" onClick={retry} disabled={checking}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-60">
          <RefreshCw size={16} className={checking ? "animate-spin" : ""} />{checking ? "Vérification…" : "Réessayer"}
        </button>
        <p className="mt-3 text-[11px] text-slate-500">Vérifiez le wifi ou les données mobiles, et le mode avion.</p>
      </div>
    </div>
  );
}
