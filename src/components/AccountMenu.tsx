"use client";
// Compte du joueur (site publié) : bouton Discord, ou avatar + menu.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Trash2 } from "lucide-react";
import { deleteAccount, logout, useAuth } from "@/lib/auth";
import { useGame } from "@/store/game";
import { loginWithDiscord } from "@/lib/auth";
import { DiscordIcon } from "@/components/DiscordButton";

export default function AccountMenu() {
  const { status, user } = useAuth();
  const notify = useGame((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setConfirm(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setConfirm(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (status === "loading") return <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse" />;

  if (status !== "in" || !user) {
    return (
      <button type="button" onClick={loginWithDiscord} title="Se connecter avec Discord"
        className="inline-flex items-center gap-2 rounded-[10px] bg-[#5865F2] text-white font-semibold text-[12px] px-2.5 sm:px-3 py-1.5 hover:bg-[#4752C4]">
        <DiscordIcon size={16} /><span className="hidden sm:inline">Connexion</span>
      </button>
    );
  }

  return (
    <div ref={box} className="relative sm:pl-3 sm:border-l border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-slate-50">
        {user.avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={user.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
          : <span className="h-8 w-8 rounded-full bg-[#5865F2] text-white grid place-items-center text-[13px] font-semibold">{user.name[0]}</span>}
        <span className="hidden sm:block leading-tight text-left">
          <span className="block text-[13px] font-semibold max-w-[140px] truncate">{user.name}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted"><DiscordIcon size={11} />Discord</span>
        </span>
        <ChevronDown size={14} className="text-muted hidden sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 card p-1.5 shadow-xl z-40 appear">
          <div className="px-3 py-2 text-[11px] text-muted leading-relaxed">
            Votre partie est sauvegardée en ligne : retrouvez-la sur n&apos;importe quel appareil.
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); logout(); notify("Déconnecté. La partie reste aussi sur cet appareil."); }}
            className="w-full flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] hover:bg-slate-50">
            <LogOut size={15} className="text-muted" />Se déconnecter
          </button>
          <button role="menuitem"
            onClick={async () => {
              if (!confirm) { setConfirm(true); return; }
              try { await deleteAccount(); setOpen(false); notify("Compte et sauvegarde en ligne supprimés."); }
              catch { notify("Suppression impossible, réessayez.", "error"); }
              setConfirm(false);
            }}
            className={`w-full flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] ${confirm ? "bg-danger text-white" : "text-danger hover:bg-red-50"}`}>
            <Trash2 size={15} />{confirm ? "Confirmer la suppression" : "Supprimer mon compte"}
          </button>
        </div>
      )}
    </div>
  );
}
