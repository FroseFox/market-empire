"use client";
// Sauvegarde en ligne de la version publiée (page claude.ai).
// Chaque joueur connecté a sa propre sauvegarde privée : data/users/<id>/save.
// Hors de cette page (npm run dev), rien ne se passe : la sauvegarde reste locale.
import { useGame } from "@/store/game";
import { normalize, type GameState } from "@/lib/game/engine";

export type CloudStatus = "local" | "syncing" | "saved" | "error";

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface DbNs { doc(path: string): DocRef }
interface UserNs { id(): Promise<string | null> }
interface ClaudeRuntime { use(name: string): Promise<unknown> }

const SAVE_DELAY = 4000;
let started = false;

function runtime(): ClaudeRuntime | null {
  const w = window as unknown as { claude?: ClaudeRuntime };
  return w.claude && typeof w.claude.use === "function" ? w.claude : null;
}

/** Ce qu'on envoie : la partie, allégée pour rester sous la taille maximale d'un document. */
function payload(game: GameState, savedAt: number) {
  return { v: 2, savedAt, game: { ...game, history: game.history.slice(-300), transactions: game.transactions.slice(0, 100) } };
}

export async function startCloudSync() {
  if (started) return;
  started = true;
  const set = (s: CloudStatus) => useGame.setState({ cloud: s });

  let rt = runtime();
  if (!rt) { await new Promise((r) => setTimeout(r, 1500)); rt = runtime(); }
  if (!rt) { set("local"); return; }

  const [db, user] = (await Promise.all([rt.use("db"), rt.use("user")])) as [DbNs | null, UserNs | null];
  const uid = user ? await user.id() : null;
  if (!db || !uid) { set("local"); return; }

  set("syncing");
  let ref: DocRef;
  try { ref = db.doc(`data/users/${uid}/save`); } catch { set("local"); return; }

  // 1. Récupérer la sauvegarde en ligne ; la plus récente gagne
  try {
    const snap = await ref.get();
    const local = useGame.getState();
    const remote = snap.exists ? snap.data() : undefined;
    const remoteAt = typeof remote?.savedAt === "number" ? remote.savedAt : 0;
    if (remote?.game && remoteAt > local.savedAt) {
      useGame.setState({ game: normalize(remote.game as GameState), savedAt: remoteAt });
      useGame.getState().sync();
    } else {
      await ref.set(payload(local.game, local.savedAt || Date.now()));
    }
    set("saved");
  } catch {
    set("error");
  }

  // 2. Enregistrer après chaque changement (regroupé, une écriture à la fois)
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing = false, pending = false;
  const flush = async () => {
    if (writing) { pending = true; return; }
    writing = true;
    const s = useGame.getState();
    try {
      await ref.set(payload(s.game, s.savedAt));
      set("saved");
    } catch (e) {
      const code = (e as { code?: string })?.code;
      set(code === "invalid_argument" || code === "not_granted" || code === "revoked" ? "local" : "error");
    }
    writing = false;
    if (pending) { pending = false; flush(); }
  };
  useGame.subscribe((s, prev) => {
    if (s.game === prev.game) return;
    set("syncing");
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  });
}
