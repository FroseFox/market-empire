"use client";
// Compte du joueur (site publié) : bouton Discord, ou avatar + menu.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Pencil, Trash2, UserPlus } from "lucide-react";
import { MAX_ACCOUNTS, addAccount, deleteAccount, logout, switchAccount, useAuth, type Account } from "@/lib/auth";
import { saveNow, setPseudo, useOnline } from "@/lib/online";
import { PSEUDO_MAX, pseudoProblem } from "@/lib/pseudo";
import { refreshWorld } from "@/lib/world/players";
import { useGame } from "@/store/game";
import { loginWithDiscord } from "@/lib/auth";
import { DiscordIcon, ProviderTag } from "@/components/DiscordButton";

/** Avatar d'un compte, ou son initiale. */
export function Face({ a, size }: { a: Account; size: number }) {
  return a.avatar
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={a.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-full bg-[#5865F2] font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.42 }}>{a.name[0]}</span>;
}

export default function AccountMenu() {
  const { status, user, saved } = useAuth();
  const notify = useGame((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // Pseudo public : celui du serveur ; le nom du compte en attendant qu'il soit lu
  const pseudo = useOnline((s) => s.name);
  const shown = pseudo ?? user?.name ?? "";
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (renaming === null || busy) return;
    setBusy(true);
    const err = await setPseudo(renaming);
    setBusy(false);
    if (err) { setNameError(err); return; }
    setRenaming(null); setNameError(null); refreshWorld();
    notify("Pseudo enregistré.");
  };
  const others = saved.filter((a) => a.id !== user?.id);
  // Changer de compte : la partie en cours est d'abord enregistrée en ligne, pour ne rien perdre
  const leaveFor = async (go: () => Promise<string | null> | void) => {
    if (busy) return;
    setBusy(true);
    if (!(await saveNow())) { notify("Partie non enregistrée : réessayez dans quelques secondes.", "error"); setBusy(false); return; }
    const err = await go();
    setBusy(false); setOpen(false);
    if (err) notify(err, "error");
  };
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setConfirm(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setConfirm(false); setRenaming(null); } };
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
          : <span className="h-8 w-8 rounded-full bg-[#5865F2] text-white grid place-items-center text-[13px] font-semibold">{shown[0]}</span>}
        <span className="hidden sm:block leading-tight text-left">
          <span className="block text-[13px] font-semibold max-w-[140px] truncate">{shown}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted"><ProviderTag via={user.via} /></span>
        </span>
        <ChevronDown size={14} className="text-muted hidden sm:block" />
      </button>
      {open && (
        <div role="menu" className="fixed inset-x-3 top-[68px] card p-1.5 shadow-xl z-40 appear sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64">
          <div className="px-3 py-2 text-[11px] text-muted leading-relaxed">
            Votre partie est sauvegardée en ligne : retrouvez-la sur n&apos;importe quel appareil.
          </div>
          <div className="border-t border-line pt-1.5 mt-0.5">
            {renaming === null ? (
              <button role="menuitem" disabled={busy} onClick={() => { setRenaming(shown); setNameError(null); }}
                className="w-full flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] hover:bg-slate-50 disabled:opacity-50">
                <Pencil size={15} className="text-muted" /><span className="min-w-0 flex-1 text-left">Pseudo : <span className="font-semibold">{shown}</span></span><span className="text-[12px] text-primary">Changer</span>
              </button>
            ) : (
              <form onSubmit={rename} className="px-3 py-2">
                <label htmlFor="pseudo" className="mb-1 block text-[11px] font-medium text-muted">Pseudo vu par les autres joueurs</label>
                <div className="flex gap-1.5">
                  <input id="pseudo" value={renaming} maxLength={PSEUDO_MAX} autoFocus onChange={(e) => { setRenaming(e.target.value); setNameError(null); }}
                    className="min-w-0 flex-1 rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-primary" />
                  <button type="submit" disabled={busy || !!pseudoProblem(renaming)} className="rounded-[8px] bg-primary px-3 text-[12px] font-semibold text-white disabled:opacity-40">OK</button>
                </div>
                {(nameError ?? (renaming.trim() ? pseudoProblem(renaming) : null)) && <p role="alert" className="mt-1.5 text-[11px] text-danger">{nameError ?? pseudoProblem(renaming)}</p>}
              </form>
            )}
          </div>
          <div className="border-t border-line pt-1.5 mt-1.5">
            <div className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{busy ? "Enregistrement de la partie…" : "Changer de compte"}</div>
            {others.map((a) => (
              <button key={a.id} role="menuitem" disabled={busy} onClick={() => leaveFor(async () => { const err = await switchAccount(a.id); if (!err) notify(`Compte : ${a.name}`); return err; })}
                className="w-full flex items-center gap-2.5 rounded-[8px] px-3 py-1.5 text-[13px] hover:bg-slate-50 disabled:opacity-50">
                <Face a={a} size={24} /><span className="min-w-0 flex-1 truncate text-left font-medium">{a.name}</span>
              </button>
            ))}
            {saved.length < MAX_ACCOUNTS && (
              <button role="menuitem" disabled={busy} onClick={() => leaveFor(() => addAccount())}
                className="w-full flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] hover:bg-slate-50 disabled:opacity-50">
                <UserPlus size={15} className="text-muted" />Ajouter un compte
              </button>
            )}
          </div>
          <div className="border-t border-line mt-1.5 pt-1.5" />
          <button role="menuitem" disabled={busy} onClick={() => { setOpen(false); logout(); notify(others.length ? "Compte déconnecté et oublié sur cet appareil." : "Déconnecté. La partie reste aussi sur cet appareil."); }}
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
