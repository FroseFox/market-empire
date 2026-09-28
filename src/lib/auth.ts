"use client";
// Connexion avec Discord (Supabase Auth), sans bibliothèque : quelques appels HTTP.
// - « Se connecter » envoie vers Discord, qui renvoie sur le site avec la session dans l'URL (#access_token=…).
// - La session est gardée dans le navigateur et renouvelée automatiquement.
// Seul le site publié l'utilise ; la page claude.ai a sa propre identité.
import { create } from "zustand";
import { BASE_PATH, STATIC_MODE, SUPABASE_ANON, SUPABASE_URL } from "@/lib/market/client";

export interface Account { id: string; name: string; avatar: string | null }
interface Session { access: string; refresh: string; exp: number; user: Account }

interface AuthStore {
  status: "loading" | "out" | "in";
  user: Account | null;
  error: string | null;
}
export const useAuth = create<AuthStore>(() => ({ status: STATIC_MODE ? "out" : "loading", user: null, error: null }));

const KEY = "market-empire-session";
let session: Session | null = null;
let refreshing: Promise<Session | null> | null = null;

function store(s: Session | null) {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
  useAuth.setState({ status: s ? "in" : "out", user: s?.user ?? null });
}

const authFetch = (path: string, init: RequestInit = {}, token?: string) =>
  fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });

function accountFrom(u: { id: string; user_metadata?: Record<string, unknown> }): Account {
  const m = u.user_metadata ?? {};
  const claims = (m.custom_claims ?? {}) as Record<string, unknown>;
  const name = [claims.global_name, m.full_name, m.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const avatar = typeof m.avatar_url === "string" && m.avatar_url.startsWith("https://cdn.discordapp.com/") ? m.avatar_url : null;
  return { id: u.id, name: (name ?? "Joueur").trim().slice(0, 40), avatar };
}

async function fromTokens(access: string, refresh: string, expiresIn: number): Promise<Session | null> {
  const r = await authFetch("user", {}, access).catch(() => null);
  if (!r?.ok) return null;
  return { access, refresh, exp: Date.now() + expiresIn * 1000, user: accountFrom(await r.json()) };
}

async function refreshSession(): Promise<Session | null> {
  if (!session) return null;
  if (!refreshing) {
    refreshing = (async () => {
      const r = await authFetch("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session!.refresh }) }).catch(() => null);
      if (!r) return session; // hors ligne : on garde la session, on réessaiera
      if (!r.ok) { store(null); return null; } // session révoquée ou expirée
      const j = await r.json();
      const next = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000, user: j.user ? accountFrom(j.user) : session!.user };
      store(next);
      return next;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

/** Jeton valide (renouvelé s'il expire dans moins d'une minute), ou null si déconnecté. */
export async function getToken(): Promise<string | null> {
  if (!session) return null;
  if (session.exp - Date.now() < 60_000) return (await refreshSession())?.access ?? null;
  return session.access;
}

let started = false;
/** Au chargement : récupère la session renvoyée par Discord, ou celle déjà enregistrée. */
export async function initAuth() {
  if (started || STATIC_MODE) return;
  started = true;
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("access_token") || hash.get("error")) {
    // On retire les jetons de l'adresse tout de suite (historique, partage d'écran…)
    history.replaceState(null, "", location.pathname + location.search);
    if (hash.get("error")) {
      useAuth.setState({ status: "out", error: hash.get("error_description")?.replace(/\+/g, " ") ?? "Connexion refusée" });
      return;
    }
    const s = await fromTokens(hash.get("access_token")!, hash.get("refresh_token") ?? "", Number(hash.get("expires_in")) || 3600);
    store(s);
    if (!s) useAuth.setState({ error: "La connexion a échoué, réessayez." });
    return;
  }
  try { session = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { session = null; }
  if (!session?.access) { store(null); return; }
  useAuth.setState({ status: "in", user: session.user });
  if (session.exp - Date.now() < 60_000) await refreshSession();
}

export function loginWithDiscord() {
  const back = `${location.origin}${BASE_PATH}/`;
  location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=discord&redirect_to=${encodeURIComponent(back)}`;
}

export async function logout() {
  const token = session?.access;
  store(null);
  if (token) await authFetch("logout?scope=local", { method: "POST" }, token).catch(() => {});
}

/** Appel d'une fonction de la base (RPC) au nom du joueur connecté. */
export async function rpc<T>(name: string, args: Record<string, unknown>, opts: { keepalive?: boolean } = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("non connecté");
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    keepalive: opts.keepalive,
  });
  if (!r.ok) throw new Error(`${name} : ${r.status}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Lecture REST au nom du joueur connecté (données privées : sa sauvegarde). */
export async function restAsUser<T>(query: string): Promise<T | null> {
  const token = await getToken();
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return r?.ok ? ((await r.json()) as T) : null;
}

export async function deleteAccount() {
  await rpc("delete_me", {});
  try { localStorage.removeItem("market-empire-linked"); } catch { /* idem */ }
  store(null);
}
