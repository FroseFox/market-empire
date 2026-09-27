"use client";
// Accès aux capacités de la page publiée (base de données, identité du joueur).
// Résout `null` hors de la page publiée : le jeu fonctionne alors en local.

export interface Snap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
export interface QuerySnap { docs: Snap[] }
export interface DocRef {
  get(): Promise<Snap>;
  set(data: Record<string, unknown>): Promise<void>;
  onSnapshot(next: (s: Snap) => void, err?: (e: unknown) => void): () => void;
}
export interface Query {
  orderBy(f: string, d?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
  onSnapshot(next: (s: QuerySnap) => void, err?: (e: unknown) => void): () => void;
}
export interface Db { doc(path: string): DocRef; collection(path: string): Query }
export interface Profile { id: string; name: string; avatarUrl: string; color: string; isMe: boolean }
export interface UserNs { id(): Promise<string | null>; profiles(ids: string[]): Promise<Record<string, Profile>> }

export interface Runtime { db: Db; user: UserNs; uid: string }

let pending: Promise<Runtime | null> | null = null;

export function getRuntime(): Promise<Runtime | null> {
  if (pending) return pending;
  pending = (async () => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } };
    let rt = w.claude;
    if (!rt) { await new Promise((r) => setTimeout(r, 1500)); rt = w.claude; }
    if (!rt || typeof rt.use !== "function") return null;
    const [db, user] = (await Promise.all([rt.use("db"), rt.use("user")])) as [Db | null, UserNs | null];
    const uid = user ? await user.id() : null;
    return db && user && uid ? { db, user, uid } : null;
  })();
  return pending;
}
