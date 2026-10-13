"use client";
// Actualités réelles : titre, source, lien et entreprises concernées.
// - Site hébergé : table Supabase « news », remplie chaque heure par la fonction refresh-news
//   (flux Google Actualités, vers h35) : lue à l'ouverture d'une page qui l'affiche, puis une fois par heure après la
//   mise à jour du serveur, seulement tant qu'une de ces pages est ouverte, et en ne demandant que les nouveaux articles.
//   Secours : fichier public/news.json.
// - Page Claude : base de la page (collection « news », lecture seule pour les joueurs).
// Le jeu ne publie jamais le contenu des articles, seulement un titre et le lien.
import { useSyncExternalStore } from "react";
import { BASE_PATH, rest, STATIC_MODE } from "@/lib/market/client";
import { nextHourly } from "@/lib/refresh";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string; // AAAA-MM-JJ ou date ISO complète
  symbols: string[];
  topic: string;       // ex. « Banques centrales », « Semi-conducteurs »
  country: string;     // US, FR, …
}

type State = { status: "loading" | "ready" | "unavailable"; items: NewsItem[] };
let state: State = { status: "loading", items: [] };
const listeners = new Set<() => void>();
let started = false;
/** Appelé quand une page d'actualités s'ouvre : relit si l'heure est passée. */
let onSubscribe: (() => void) | null = null;

function emit(next: State) { state = next; listeners.forEach((l) => l()); }

interface Snap { docs: { id: string; data(): Record<string, unknown> | undefined }[] }
interface Query { orderBy(f: string, d?: "asc" | "desc"): Query; limit(n: number): Query; onSnapshot(n: (s: Snap) => void, e?: (err: unknown) => void): () => void }
interface Db { collection(path: string): Query }

const valid = (n: Partial<NewsItem>): n is NewsItem =>
  typeof n.title === "string" && typeof n.url === "string" && /^https:\/\//.test(n.url) && Array.isArray(n.symbols) && typeof n.publishedAt === "string";

async function start() {
  if (started) return;
  started = true;
  if (!STATIC_MODE) {
    type Row = { id: string; title: string; url: string; source: string; published_at: string; symbols: string[]; topic: string; country: string; created_at: string };
    const COLS = "id,title,url,source,published_at,symbols,topic,country,created_at", KEEP = 150;
    /** Date d'ajout du plus récent article déjà lu (texte exact du serveur) : la relecture ne demande que les suivants. */
    let newest = "";
    // Vers h40-h44 : juste après la mise à jour du serveur, réparti entre les joueurs
    const minute = 40 + Math.floor(Math.random() * 5);
    let nextPull = 0;
    const load = async () => {
      const at = Date.now();
      nextPull = at + 2 * 60_000; // échec : nouvel essai dans 2 min
      const rows = newest
        ? await rest<Row[]>(`news?select=${COLS}&created_at=gt.${encodeURIComponent(newest)}&order=published_at.desc&limit=${KEEP}`, 0)
        : await rest<Row[]>(`news?select=${COLS}&order=published_at.desc&limit=${KEEP}`, 10 * 60_000);
      if (rows === null && state.items.length) return;
      if (rows !== null) nextPull = nextHourly(at, minute);
      for (const r of rows ?? []) if (r.created_at > newest) newest = r.created_at;
      const fetched: NewsItem[] = (rows ?? []).map((r) => ({ id: r.id, title: r.title, summary: "", source: r.source, url: r.url, publishedAt: r.published_at, symbols: r.symbols ?? [], topic: r.topic, country: r.country }));
      // Nouveaux articles ajoutés à ceux déjà lus (sans doublon), les plus récents d'abord
      const known = new Set(fetched.map((n) => n.id));
      let items: NewsItem[] = [...fetched, ...state.items.filter((n) => !known.has(n.id))];
      if (!items.length) {
        try {
          const j = (await (await fetch(`${BASE_PATH}/news.json`, { cache: "no-cache" })).json()) as { items?: Partial<NewsItem>[] };
          items = (j.items ?? []).filter(valid);
        } catch { /* rien */ }
      }
      items = items.filter(valid).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, KEEP);
      emit(items.length ? { status: "ready", items } : { status: state.items.length ? "ready" : "unavailable", items: state.items });
    };
    await load();
    // Relecture seulement tant qu'une page d'actualités est ouverte et visible
    const due = () => { if (listeners.size && !document.hidden && Date.now() >= nextPull) void load(); };
    setInterval(due, 60_000);
    document.addEventListener("visibilitychange", due);
    onSubscribe = due;
    return;
  }
  const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } };
  let rt = w.claude;
  if (!rt) { await new Promise((r) => setTimeout(r, 1500)); rt = w.claude; }
  const db = rt ? ((await rt.use("db")) as Db | null) : null;
  if (!db) { emit({ status: "unavailable", items: [] }); return; }
  db.collection("news").orderBy("publishedAt", "desc").limit(200).onSnapshot(
    (snap) => emit({
      status: "ready",
      items: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NewsItem, "id">) })).filter(valid),
    }),
    () => emit({ status: "unavailable", items: state.items }),
  );
}

export function useNews(): State {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); start(); onSubscribe?.(); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}

export function timeAgo(date: string): string {
  // Date complète (actualités automatiques) : précision à l'heure
  if (date.length > 10) {
    const mins = Math.round((Date.now() - Date.parse(date)) / 60_000);
    if (mins < 60) return mins <= 1 ? "À l'instant" : `Il y a ${mins} min`;
    if (mins < 24 * 60) return `Il y a ${Math.round(mins / 60)} h`;
  }
  const d = new Date(date.length > 10 ? date : `${date}T12:00:00`);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 30) return `Il y a ${days} jours`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
