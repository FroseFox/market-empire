"use client";
// Actualités réelles : titre, source, lien et entreprises concernées.
// Elles sont rassemblées par Claude (recherche web) et stockées dans la base
// de la page publiée (collection « news », lecture seule pour les joueurs).
// Le jeu ne publie jamais le contenu des articles, seulement un titre et le lien.
import { useSyncExternalStore } from "react";
import { STATIC_MODE } from "@/lib/market/client";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string; // AAAA-MM-JJ
  symbols: string[];
  topic: string;       // ex. « Banques centrales », « Semi-conducteurs »
  country: string;     // US, FR, …
}

type State = { status: "loading" | "ready" | "unavailable"; items: NewsItem[] };
let state: State = { status: STATIC_MODE ? "loading" : "unavailable", items: [] };
const listeners = new Set<() => void>();
let started = false;

function emit(next: State) { state = next; listeners.forEach((l) => l()); }

interface Snap { docs: { id: string; data(): Record<string, unknown> | undefined }[] }
interface Query { orderBy(f: string, d?: "asc" | "desc"): Query; limit(n: number): Query; onSnapshot(n: (s: Snap) => void, e?: (err: unknown) => void): () => void }
interface Db { collection(path: string): Query }

async function start() {
  if (started || !STATIC_MODE) return;
  started = true;
  const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } };
  let rt = w.claude;
  if (!rt) { await new Promise((r) => setTimeout(r, 1500)); rt = w.claude; }
  const db = rt ? ((await rt.use("db")) as Db | null) : null;
  if (!db) { emit({ status: "unavailable", items: [] }); return; }
  db.collection("news").orderBy("publishedAt", "desc").limit(200).onSnapshot(
    (snap) => emit({
      status: "ready",
      items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NewsItem, "id">) }))
        .filter((n) => typeof n.title === "string" && typeof n.url === "string" && /^https:\/\//.test(n.url)),
    }),
    () => emit({ status: "unavailable", items: state.items }),
  );
}

export function useNews(): State {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); start(); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

export function timeAgo(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 30) return `Il y a ${days} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
