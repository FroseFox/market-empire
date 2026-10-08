"use client";
// Cloche de la barre du haut : les dernières notifications du jeu.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useNotifs } from "@/lib/notifs";
import { disablePush, enablePush, usePush } from "@/lib/push";
import { useAuth } from "@/lib/auth";

const DOT = { good: "bg-success", bad: "bg-danger", info: "bg-primary" } as const;
const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};

export default function NotifBell() {
  const { list, system, readAll, clear, enableSystem } = useNotifs();
  const push = usePush();
  const signedIn = useAuth((s) => s.status === "in");
  const [pushError, setPushError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const unread = list.filter((n) => !n.read).length;
  const canSystem = typeof Notification !== "undefined" && Notification.permission !== "denied";

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  const toggle = () => { setNow(Date.now()); setOpen((o) => { if (o) readAll(); return !o; }); };
  return (
    <div ref={box} className="relative">
      <button onClick={toggle} aria-label={unread ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"} aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-slate-100 hover:text-ink">
        {unread ? <BellRing size={18} className="text-primary" /> : <Bell size={18} />}
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">{unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[68px] z-40 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[340px] rounded-[14px] border border-line bg-card shadow-2xl appear">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <h2 className="text-[14px] font-semibold">Notifications</h2>
            {list.length > 0 && <button onClick={clear} className="text-[11px] font-medium text-muted hover:text-ink">Tout effacer</button>}
          </div>
          {list.length === 0 ? <p className="px-4 pb-4 text-[12px] text-muted">Rien pour l&apos;instant. Vous serez prévenu d&apos;une subvention disponible, d&apos;un nouveau rang ou d&apos;une forte variation d&apos;un actif que vous détenez.</p> : (
            <ul className="max-h-[52vh] divide-y divide-line overflow-y-auto">
              {list.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => { readAll(); setOpen(false); }} className={`flex gap-2.5 px-4 py-2.5 hover:bg-slate-50 ${n.read ? "" : "bg-primary-soft/40"}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.tone]}`} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{n.title}</span>
                      <span className="block text-[12px] text-muted">{n.text}</span>
                      <span className="block text-[11px] text-muted">{ago(n.at, now)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {/* Jeu fermé : notifications envoyées par le serveur (joueur connecté, navigateur compatible) */}
          {signedIn && push.state !== "unsupported" ? (
            <div className="border-t border-line px-4 py-3 text-[12px] text-muted">
              {push.state === "on" ? (
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1"><b className="font-semibold text-ink">Notifications activées sur cet appareil</b>, même quand le jeu est fermé : ville pleine, contrat signé, parts achetées, blocus.</span>
                  <button disabled={push.busy} onClick={() => void disablePush()} className="shrink-0 font-semibold text-muted hover:text-ink hover:underline">Désactiver</button>
                </div>
              ) : push.state === "ios" ? (
                <>Sur iPhone ou iPad : installez d&apos;abord le jeu sur l&apos;écran d&apos;accueil (bouton Partager, puis « Sur l&apos;écran d&apos;accueil »), ouvrez-le de là et revenez ici pour activer les notifications.</>
              ) : push.state === "denied" ? (
                <>Notifications bloquées pour ce site : autorisez-les dans les réglages du navigateur pour être prévenu quand le jeu est fermé.</>
              ) : (
                <>
                  <button disabled={push.busy} onClick={async () => { const err = await enablePush(); setPushError(err); }}
                    className="w-full rounded-[10px] bg-primary px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {push.busy ? "Activation…" : "Me prévenir même quand le jeu est fermé"}
                  </button>
                  <p className="mt-1.5 text-[11px]">{pushError ? <span className="text-danger">{pushError}</span> : "Ville pleine, contrat signé, parts achetées, blocus. Jamais de conseil d'achat ou de vente."}</p>
                </>
              )}
            </div>
          ) : canSystem && (
            <div className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
              {system ? "Notifications du navigateur activées : vous êtes aussi prévenu quand l'onglet est en arrière-plan."
                : <button onClick={() => void enableSystem()} className="font-semibold text-primary hover:underline">Me prévenir aussi quand l&apos;onglet est en arrière-plan</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
