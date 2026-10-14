"use client";
// Chat du jeu : un salon pour tous les joueurs et un salon privé par alliance. Chaque message s'efface 24 h après son envoi
// (côté serveur, voir supabase/migrations/20261013c_chat.sql).
// Économe : panneau ouvert, les nouveaux messages arrivent par le temps réel de Supabase (le serveur prévient, voir
// lib/realtime.ts), avec une relecture de contrôle toutes les 32 s ; tant que le temps réel n'est pas prêt (ou s'il
// ne passe pas), le salon est relu toutes les 4 s comme avant. Panneau fermé : une vérification par minute pour la
// pastille « non lus », et rien quand l'onglet est caché.
import { create } from "zustand";
import { getToken, restAsUser, rpc, useAuth } from "@/lib/auth";
import { watchInserts, type Watch } from "@/lib/realtime";
import { useGame } from "@/store/game";

import { mentions, mergeMessages, type ChatMessage } from "./chatList";
import { useOnline } from "@/lib/online";
import { useNotifs } from "@/lib/notifs";
import { usePanel } from "@/lib/panels";
export { fresh, mentionChoices, mentionQuery, mentions, mergeMessages, splitMentions, type ChatMessage } from "./chatList";
export type Room = "global" | "alliance";

const SEEN_KEY = "market-empire-chat-seen";

export const ERRORS: Record<string, string> = {
  vite: "Doucement : un message toutes les 3 secondes.",
  exclu: "Vous êtes exclu du chat pour le moment.",
  long: "300 caractères au plus.",
  vide: "Message vide.",
  salon: "Vous ne faites plus partie de cette alliance.",
  connexion: "Connexion perdue, reconnectez-vous.",
};

interface ChatStore {
  open: boolean;
  room: Room;
  rooms: Record<Room, ChatMessage[]>;
  unread: number;
  moderator: boolean;
  /** `false` tant que le serveur n'a pas répondu une fois (chat indisponible). */
  ready: boolean;
  /** Pseudos des joueurs (pour compléter « @… ») : tous, et ceux de mon alliance. */
  names: { all: string[]; alliance: string[] };
}
export const useChat = create<ChatStore>(() => ({ open: false, room: "global", rooms: { global: [], alliance: [] }, unread: 0, moderator: false, ready: false, names: { all: [], alliance: [] } }));

/** Pseudos des joueurs, relus au plus toutes les 10 min quand le chat s'ouvre (quelques octets par joueur). */
let namesAt = 0;
async function loadNames() {
  if (Date.now() - namesAt < 10 * 60_000) return;
  namesAt = Date.now();
  const rows = await restAsUser<{ name: string | null; alliance: string | null }[]>("players?select=name,alliance&limit=2000");
  if (!rows) { namesAt = 0; return; }
  const mine = useGame.getState().game.alliance?.id ?? null;
  const ok = (r: { name: string | null }) => !!r.name;
  useChat.setState({ names: {
    all: rows.filter(ok).map((r) => r.name!),
    alliance: mine ? rows.filter((r) => ok(r) && r.alliance === mine).map((r) => r.name!) : [],
  } });
}

/** Messages d'autres joueurs qui me mentionnent (« @mon pseudo »), arrivés depuis ma dernière lecture : notification. */
function notifyMentions(rows: { id: number; author: string; name: string; body: string; room?: string }[], after: number) {
  const me = useAuth.getState().user?.id, pseudo = useOnline.getState().name;
  if (!me || !pseudo) return;
  for (const r of rows) {
    if (Number(r.id) <= after || r.author === me || !mentions(r.body, pseudo)) continue;
    const room = r.room && r.room !== "global" ? "alliance" : "global";
    // Salon ouvert sous ses yeux, onglet visible : il le voit déjà (le message est surligné)
    const s = useChat.getState();
    if (s.open && s.room === room && typeof document !== "undefined" && !document.hidden) continue;
    useNotifs.getState().push({
      id: `mention-${r.id}`, tone: "info", href: `chat:${room}`,
      title: `${r.name} vous a mentionné`, text: r.body.length > 120 ? `${r.body.slice(0, 119)}…` : r.body,
    });
  }
}

/** Identifiant du salon côté serveur : « global », ou l'identifiant de l'alliance du joueur. */
export const roomId = (room: Room): string | null => (room === "global" ? "global" : useGame.getState().game.alliance?.id ?? null);

type Row = { id: number; author: string; name: string; body: string; created_at: string };
const toMsg = (r: Row): ChatMessage => ({ id: Number(r.id), author: r.author, name: r.name, body: r.body, at: Date.parse(r.created_at) || Date.now() });

// Dernier message lu : gardé sur l'appareil ET sur le compte (player_prefs.chat_seen). Sans ça, un autre appareil
// affichait comme « nouveaux » des messages déjà lus ailleurs (et renvoyait les anciennes mentions).
const seen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
let sentSeen = 0, seenTimer: ReturnType<typeof setTimeout> | null = null;
const setSeen = (id: number) => {
  try { if (id > seen()) localStorage.setItem(SEEN_KEY, String(id)); } catch { /* stockage indisponible */ }
  // Vers le compte : regroupé (une écriture au plus toutes les 10 s), seulement s'il a avancé
  if (id > sentSeen && !seenTimer) seenTimer = setTimeout(() => {
    seenTimer = null;
    const v = seen();
    if (v > sentSeen && useAuth.getState().status === "in") { sentSeen = v; void rpc("set_chat_seen", { p_id: v }).catch(() => { sentSeen = 0; }); }
  }, 10_000);
};

/** Reprend le dernier message lu sur le compte. Compte qui n'a jamais rien lu, sur un appareil neuf : les messages de plus
 *  de 15 minutes comptent comme lus. Les plus récents restent « nouveaux » : une mention qui vient d'arriver n'est pas
 *  avalée parce que le joueur ouvre le jeu sur un appareil neuf (ou une appli réinstallée). Prêt une fois par compte. */
let seenReady: Promise<void> | null = null;
function loadSeen(): Promise<void> {
  const id = useAuth.getState().user?.id;
  if (!id) return Promise.resolve();
  if (!seenReady) seenReady = (async () => {
    const r = await restAsUser<{ chat_seen: number }[]>(`player_prefs?select=chat_seen&id=eq.${id}&limit=1`).catch(() => null);
    if (!r) { seenReady = null; return; } // serveur muet : on réessaiera
    let server = Number(r[0]?.chat_seen) || 0;
    if (!server && !seen()) {
      const before = new Date(Date.now() - 15 * 60_000).toISOString();
      const last = await restAsUser<{ id: number }[]>(`chat_messages?select=id&created_at=lt.${before}&order=id.desc&limit=1`).catch(() => null);
      server = Number(last?.[0]?.id) || 0;
    }
    sentSeen = Math.max(sentSeen, Number(r[0]?.chat_seen) || 0);
    if (server > seen()) { try { localStorage.setItem(SEEN_KEY, String(server)); } catch { /* stockage indisponible */ } }
    if (seen() > sentSeen) setSeen(seen()); // l'appareil était en avance : le compte le rattrape
  })();
  return seenReady;
}

/** Messages que j'ai signalés : ils ne réapparaissent pas chez moi au prochain chargement. */
const HIDE_KEY = "market-empire-chat-hidden";
const hiddenIds = (): Set<number> => { try { return new Set(JSON.parse(localStorage.getItem(HIDE_KEY) ?? "[]") as number[]); } catch { return new Set(); } };
const hideLocally = (id: number) => { try { localStorage.setItem(HIDE_KEY, JSON.stringify([...hiddenIds(), id].slice(-200))); } catch { /* stockage indisponible */ } };

/** Alliance dont les messages sont affichés : en changer vide le salon d'alliance. */
let allianceShown: string | null = null;

const lastId = (room: Room) => useChat.getState().rooms[room].at(-1)?.id ?? 0;

/** Lit les nouveaux messages du salon (ou les derniers à la première lecture). `false` si le serveur ne répond pas. */
async function load(room: Room): Promise<boolean> {
  await loadSeen();
  const id = roomId(room);
  if (!id) return true;
  if (room === "alliance" && id !== allianceShown) {
    allianceShown = id;
    useChat.setState((s) => ({ rooms: { ...s.rooms, alliance: [] } }));
  }
  const after = lastId(room);
  const q = after
    ? `chat_messages?select=id,author,name,body,created_at&room=eq.${id}&id=gt.${after}&order=id.asc&limit=120`
    : `chat_messages?select=id,author,name,body,created_at&room=eq.${id}&order=id.desc&limit=120`;
  const rows = await restAsUser<Row[]>(q);
  if (!rows) return false;
  const hide = hiddenIds();
  notifyMentions(rows.filter((r) => !hide.has(Number(r.id))).map((r) => ({ ...r, room: id })), seen());
  const add = rows.map(toMsg).filter((m) => !hide.has(m.id));
  useChat.setState((s) => ({ ready: true, rooms: { ...s.rooms, [room]: mergeMessages(s.rooms[room], add) } }));
  return true;
}

/** Pastille : y a-t-il des messages d'autres joueurs plus récents que le dernier lu ? */
async function checkUnread() {
  await loadSeen();
  const me = useAuth.getState().user?.id;
  const ids = ["global", roomId("alliance")].filter(Boolean).join(",");
  const after = seen();
  const rows = await restAsUser<{ id: number; author: string; name: string; body: string; room: string }[]>(`chat_messages?select=id,author,name,body,room&room=in.(${ids})&id=gt.${after}&author=neq.${me}&limit=30`);
  if (rows) { useChat.setState({ ready: true, unread: rows.length }); notifyMentions(rows, after); }
}

let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
/** Temps réel : ouvert seulement tant que le panneau du chat l'est. */
let watch: Watch | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;
function readOpenRoom() {
  const s = useChat.getState();
  if (!s.open) return;
  void load(s.room).then(() => {
    const last = useChat.getState().rooms[s.room].at(-1)?.id;
    if (last) setSeen(last);
    useChat.setState({ unread: 0 });
  });
}
function syncWatch() {
  const want = useChat.getState().open && useAuth.getState().status === "in" && !(typeof document !== "undefined" && document.hidden);
  if (want && !watch) {
    // Un message arrive : relecture des nouveaux messages (regroupée si plusieurs arrivent ensemble)
    watch = watchInserts("chat_messages", getToken, () => { if (!soon) soon = setTimeout(() => { soon = null; readOpenRoom(); }, 250); }, (live) => { if (live) readOpenRoom(); });
  } else if (!want && watch) { watch.close(); watch = null; }
}
function tick() {
  syncWatch();
  if (typeof document !== "undefined" && document.hidden) return;
  if (useAuth.getState().status !== "in") return;
  const s = useChat.getState();
  // Temps réel actif : simple contrôle toutes les 32 s ; sinon, relecture toutes les 4 s.
  // Chat fermé : nouveaux messages (et mentions) cherchés toutes les 20 s (une toute petite requête).
  if (s.open) { if (!watch?.live || ticks % 8 === 0) readOpenRoom(); }
  else if (ticks % 5 === 0) void checkUnread();
  ticks++;
}

/** Démarre la veille du chat (une fois, à l'ouverture du jeu en ligne). */
export function startChat() {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(tick, 4_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { ticks = 0; tick(); } else syncWatch(); });
  // Le droit de modérer n'existe que pour quelques comptes : lu une fois, sans rien bloquer s'il manque
  useAuth.subscribe((a, b) => {
    if (a.user?.id !== b.user?.id) {
      // Autre compte : le temps réel est rouvert avec ses droits à lui
      watch?.close(); watch = null; namesAt = 0; seenReady = null; sentSeen = 0;
      useChat.setState({ rooms: { global: [], alliance: [] }, moderator: false, unread: 0 }); void readModerator();
    }
    syncWatch();
  });
  void readModerator();
  tick();
}

async function readModerator() {
  const id = useAuth.getState().user?.id;
  if (!id) return;
  const r = await restAsUser<{ moderator?: boolean }[]>(`players?select=moderator&id=eq.${id}&limit=1`);
  useChat.setState({ moderator: !!r?.[0]?.moderator });
}

// Un autre panneau s'ouvre (notifications, compte…) : le chat se ferme
usePanel.subscribe((p) => { if (p.id !== "chat" && useChat.getState().open) openChat(false); });

export function openChat(open: boolean) {
  useChat.setState({ open });
  // Un seul panneau à la fois : ouvrir le chat ferme les notifications, le menu du compte…
  if (open) usePanel.setState({ id: "chat" });
  else if (usePanel.getState().id === "chat") usePanel.setState({ id: null });
  if (open) void loadNames();
  if (open) { ticks = 0; tick(); } else syncWatch();
}
export function switchRoom(room: Room) {
  useChat.setState({ room });
  ticks = 0; tick();
}

/** Envoie un message. Renvoie `null` si c'est fait, sinon le message d'erreur à afficher. */
export async function sendChat(body: string): Promise<string | null> {
  const room = useChat.getState().room, id = roomId(room);
  if (!id) return ERRORS.salon;
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Hors ligne : le chat attend le réseau.";
  try {
    const r = await rpc<{ id?: number; name?: string; body?: string; at?: string; error?: string }>("send_chat", { p_room: id, p_body: body });
    if (!r?.id) return ERRORS[r?.error ?? ""] ?? "Message refusé.";
    const me = useAuth.getState().user?.id ?? "";
    const msg: ChatMessage = { id: Number(r.id), author: me, name: r.name ?? "", body: r.body ?? body, at: Date.parse(r.at ?? "") || Date.now() };
    // Les messages arrivés juste avant le sien sont relus d'abord, pour garder l'ordre
    await load(room);
    useChat.setState((s) => ({ rooms: { ...s.rooms, [room]: mergeMessages(s.rooms[room], [msg]) } }));
    setSeen(msg.id);
    return null;
  } catch { return "Le serveur n'a pas répondu, réessayez."; }
}

function drop(id: number) { hideLocally(id); dropShown(id); }
const dropShown = (id: number) => useChat.setState((s) => ({ rooms: { global: s.rooms.global.filter((m) => m.id !== id), alliance: s.rooms.alliance.filter((m) => m.id !== id) } }));

/** Signale un message : il disparaît de mon écran tout de suite ; au 3e signalement, il est masqué pour tous. */
export async function reportChat(id: number): Promise<boolean> {
  const ok = await rpc<boolean>("report_chat", { p_id: id }).catch(() => false);
  if (ok) drop(id);
  return !!ok;
}

/** Modérateur : masque le message pour tous, et exclut son auteur du chat pendant `hours` heures (0 = pas d'exclusion). */
export async function moderateChat(id: number, hours: number): Promise<boolean> {
  const ok = await rpc<boolean>("moderate_chat", { p_id: id, p_hours: hours }).catch(() => false);
  if (ok) drop(id);
  return !!ok;
}
