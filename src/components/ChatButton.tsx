"use client";
// Bulle de la barre du haut : le chat du jeu (salon de tous les joueurs, salon de son alliance).
// Chaque message s'efface 24 h après son envoi. Signaler un message le retire de son écran ; au 3e signalement il disparaît pour tous.
import { useEffect, useRef, useState } from "react";
import { Flag, MessageCircle, Send, ShieldBan, X } from "lucide-react";
import { fresh, moderateChat, openChat, reportChat, sendChat, switchRoom, useChat, type ChatMessage } from "@/lib/chat";
import { useAuth } from "@/lib/auth";
import { useGame } from "@/store/game";

/** Pas de réseau en ce moment (le navigateur prévient quand il change). */
function useOffline() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const update = () => setOff(!navigator.onLine);
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return off;
}

const time = (at: number) => new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function ChatButton() {
  const { open, room, rooms, unread, moderator } = useChat();
  const me = useAuth((s) => s.user?.id);
  const alliance = useGame((s) => s.game.alliance);
  const offline = useOffline();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const shown = fresh(rooms[room === "alliance" && !alliance ? "global" : room], now);
  const current = room === "alliance" && !alliance ? "global" : room;

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") openChat(false); };
    document.addEventListener("keydown", key);
    return () => { clearInterval(id); document.removeEventListener("keydown", key); };
  }, [open]);

  // Nouveau message : on descend en bas, sauf si le joueur est remonté lire plus haut
  const last = shown.at(-1)?.id;
  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [last, open, current]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    const err = await sendChat(body);
    setBusy(false);
    if (err) setError(err); else setText("");
    const el = list.current; if (el) el.scrollTop = el.scrollHeight;
  };

  return (
    <div ref={box} className="relative">
      <button onClick={() => openChat(!open)} aria-label={unread ? `Chat : ${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : "Chat"} aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-slate-100 hover:text-ink">
        <MessageCircle size={18} className={unread ? "text-primary" : ""} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">{unread >= 30 ? "30+" : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[68px] bottom-[84px] z-40 flex flex-col sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-11 sm:h-[520px] sm:w-[380px] rounded-[14px] border border-line bg-card shadow-2xl appear">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <div className="flex flex-1 gap-1 rounded-[10px] bg-slate-100 p-0.5 text-[12px] font-semibold">
              <button onClick={() => switchRoom("global")} className={`flex-1 rounded-[8px] px-2 py-1.5 ${current === "global" ? "bg-card text-ink shadow-sm" : "text-muted"}`}>Tous les joueurs</button>
              <button onClick={() => alliance && switchRoom("alliance")} disabled={!alliance} title={alliance ? undefined : "Rejoignez une alliance pour avoir son salon"}
                className={`flex-1 truncate rounded-[8px] px-2 py-1.5 disabled:opacity-40 ${current === "alliance" ? "bg-card text-ink shadow-sm" : "text-muted"}`}>
                {alliance ? `Alliance [${alliance.tag}]` : "Alliance"}
              </button>
            </div>
            <button onClick={() => openChat(false)} aria-label="Fermer le chat" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-slate-100 hover:text-ink"><X size={16} /></button>
          </div>

          <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {shown.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-muted">Aucun message ces dernières 24 h.<br />Lancez la conversation !</p>
            ) : shown.map((m) => (
              <Bubble key={m.id} m={m} mine={m.author === me} moderator={moderator} menu={menu === m.id}
                onMenu={() => setMenu(menu === m.id ? null : m.id)}
                onReport={async () => { setMenu(null); if (!(await reportChat(m.id))) setError("Signalement impossible pour le moment."); }}
                onModerate={async (h) => { setMenu(null); if (!(await moderateChat(m.id, h))) setError("Modération refusée."); }} />
            ))}
          </div>

          <div className="border-t border-line p-2">
            {error && <p role="alert" className="px-1 pb-1 text-[11px] text-danger">{error}</p>}
            <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-end gap-2">
              <textarea value={text} onChange={(e) => { setText(e.target.value.slice(0, 300)); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={1} maxLength={300} disabled={offline} placeholder={offline ? "Hors ligne : le chat attend le réseau" : current === "alliance" ? "Message à votre alliance…" : "Message à tous les joueurs…"}
                className="max-h-24 min-h-[40px] flex-1 resize-none rounded-[10px] border border-line bg-white px-3 py-2 text-[16px] sm:text-[13px] outline-none focus:border-primary" />
              <button type="submit" disabled={!text.trim() || busy || offline} aria-label="Envoyer"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-primary text-white disabled:opacity-40"><Send size={16} /></button>
            </form>
            <p className="px-1 pt-1 text-[10px] text-muted">Messages effacés après 24 h · restez courtois · {text.length}/300</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ m, mine, moderator, menu, onMenu, onReport, onModerate }: {
  m: ChatMessage; mine: boolean; moderator: boolean; menu: boolean;
  onMenu: () => void; onReport: () => void; onModerate: (hours: number) => void;
}) {
  return (
    <div className={`group my-1.5 flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className="flex items-baseline gap-1.5 px-1 text-[11px] text-muted">
        {!mine && <b className="font-semibold text-ink">{m.name}</b>}<span>{time(m.at)}</span>
        {!mine && <button onClick={onMenu} aria-label="Signaler ou modérer" className="opacity-60 hover:opacity-100"><Flag size={11} /></button>}
      </div>
      <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[12px] px-3 py-1.5 text-[13px] leading-snug ${mine ? "bg-primary text-white" : "bg-slate-100 text-ink"}`}>{m.body}</p>
      {menu && (
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <button onClick={onReport} className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">Signaler ce message</button>
          {moderator && <>
            <button onClick={() => onModerate(0)} className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-slate-700"><ShieldBan size={11} />Masquer</button>
            <button onClick={() => onModerate(24)} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-white"><ShieldBan size={11} />Masquer + exclure 24 h</button>
          </>}
        </div>
      )}
    </div>
  );
}
