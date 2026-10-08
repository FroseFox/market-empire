"use client";
// Connexion avec Discord ou Google (Supabase Auth), sans bibliothèque : quelques appels HTTP.
// - « Se connecter » envoie vers Discord ou Google, qui renvoie sur le site avec la session dans l'URL (#access_token=…).
// - Google n'est proposé que s'il est activé dans Supabase (Authentication › Providers) : le site le demande au serveur.
// - La session est gardée dans le navigateur et renouvelée automatiquement.
// - Plusieurs comptes peuvent rester mémorisés sur l'appareil : on passe de l'un à l'autre sans se reconnecter.
// Seul le site publié l'utilise ; la page claude.ai a sa propre identité.
import { create } from "zustand";
import { BASE_PATH, STATIC_MODE, SUPABASE_ANON, SUPABASE_URL } from "@/lib/market/client";

/** `via` = le service qui a servi à se connecter (absent sur les sessions d'avant Google : c'était Discord). */
export type Provider = "discord" | "google" | "email";
export interface Account { id: string; name: string; avatar: string | null; via?: Provider }
interface Session { access: string; refresh: string; exp: number; user: Account }

interface AuthStore {
  status: "loading" | "out" | "in";
  user: Account | null;
  error: string | null;
  /** Comptes mémorisés sur cet appareil (celui en cours compris). */
  saved: Account[];
}
export const useAuth = create<AuthStore>(() => ({ status: STATIC_MODE ? "out" : "loading", user: null, error: null, saved: [] }));

const KEY = "market-empire-session";
// ─── Comptes mémorisés ───
// La session de chaque compte connecté sur cet appareil est gardée ici, pour y revenir d'un clic.
// « Se déconnecter » retire le compte de la liste ; « Ajouter un compte » le laisse en place.
const ACCOUNTS_KEY = "market-empire-accounts";
export const MAX_ACCOUNTS = 5;
function readSaved(): Session[] {
  try {
    const v = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => s && typeof s.access === "string" && s.user && typeof s.user.id === "string") : [];
  } catch { return []; }
}
function writeSaved(list: Session[]) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS))); } catch { /* stockage indisponible */ }
  useAuth.setState({ saved: list.slice(0, MAX_ACCOUNTS).map((s) => s.user) });
}
const remember = (s: Session) => writeSaved([s, ...readSaved().filter((o) => o.user.id !== s.user.id)]);
const forget = (id: string) => writeSaved(readSaved().filter((o) => o.user.id !== id));
let session: Session | null = null;
let refreshing: Promise<Session | null> | null = null;

function store(s: Session | null) {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
  if (s) remember(s);
  useAuth.setState({ status: s ? "in" : "out", user: s?.user ?? null });
}

const authFetch = (path: string, init: RequestInit = {}, token?: string) =>
  fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });

/** Images de profil acceptées : celles de Discord et de Google, rien d'autre. */
const AVATAR_HOSTS = ["https://cdn.discordapp.com/", "https://lh3.googleusercontent.com/"];
function accountFrom(u: { id: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }): Account {
  const m = u.user_metadata ?? {};
  const p = u.app_metadata?.provider, via: Provider = p === "google" ? "google" : p === "email" ? "email" : "discord";
  const claims = (m.custom_claims ?? {}) as Record<string, unknown>;
  const name = [claims.global_name, m.full_name, m.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const avatar = typeof m.avatar_url === "string" && AVATAR_HOSTS.some((h) => (m.avatar_url as string).startsWith(h)) ? m.avatar_url : null;
  return { id: u.id, name: (name ?? "Joueur").trim().slice(0, 40), avatar, via };
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
      if (!r.ok) { forget(session!.user.id); store(null); return null; } // session révoquée ou expirée
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
  if (!session?.access) { store(null); writeSaved(readSaved()); return; }
  remember(session); // sessions d'avant les comptes mémorisés : celle en cours entre dans la liste
  useAuth.setState({ status: "in", user: session.user });
  if (session.exp - Date.now() < 60_000) await refreshSession();
}

function loginWith(provider: "discord" | "google") {
  const back = `${location.origin}${BASE_PATH}/`;
  location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(back)}`;
}
export const loginWithDiscord = () => loginWith("discord");
export const loginWithGoogle = () => loginWith("google");

let googleAsked: Promise<boolean> | null = null;
/** Google est-il activé dans Supabase ? Demandé une fois au serveur ; `false` s'il ne répond pas (le bouton reste caché). */
export function googleEnabled(): Promise<boolean> {
  googleAsked ??= authFetch("settings").then((r) => (r.ok ? r.json() : null)).then((j) => j?.external?.google === true).catch(() => false);
  return googleAsked;
}

/** Domaine des comptes de test : l'identifiant « test » correspond au compte test@marketempire.test dans Supabase. */
const TEST_DOMAIN = "marketempire.test";
/** Connexion d'un compte de test (identifiant + mot de passe). Ces comptes sont créés à la main dans Supabase :
 *  aucun mot de passe n'est écrit dans le site. Renvoie un message d'erreur, ou `null` si la connexion a réussi. */
export async function loginWithPassword(username: string, password: string): Promise<string | null> {
  const name = username.trim().toLowerCase();
  if (!name || !password) return "Entrez l'identifiant et le mot de passe.";
  const email = name.includes("@") ? name : `${name}@${TEST_DOMAIN}`;
  const r = await authFetch("token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }).catch(() => null);
  if (!r) return "Serveur injoignable, réessayez.";
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token || !j.user) {
    if (j.error_code === "invalid_credentials" || j.error === "invalid_grant") return "Identifiant ou mot de passe incorrect.";
    if (j.error_code === "email_provider_disabled") return "La connexion par mot de passe est désactivée dans Supabase (Authentication › Providers › Email).";
    return String(j.msg ?? j.error_description ?? "Connexion refusée.");
  }
  useAuth.setState({ error: null });
  store({ access: j.access_token, refresh: j.refresh_token ?? "", exp: Date.now() + (j.expires_in ?? 3600) * 1000, user: accountFrom(j.user) });
  return null;
}

/** Déconnecte le compte en cours et l'oublie sur cet appareil. Les autres comptes mémorisés restent. */
export async function logout() {
  const token = session?.access, id = session?.user.id;
  if (id) forget(id);
  store(null);
  if (token) await authFetch("logout?scope=local", { method: "POST" }, token).catch(() => {});
}

/** Revient à l'écran de connexion pour ajouter un compte, sans oublier celui en cours. */
export function addAccount() {
  useAuth.setState({ error: null });
  store(null);
}

/** Passe sur un autre compte mémorisé. Renvoie un message d'erreur, ou `null` si le changement est fait. */
export async function switchAccount(id: string): Promise<string | null> {
  const target = readSaved().find((s) => s.user.id === id);
  if (!target) return "Ce compte n'est plus mémorisé sur cet appareil.";
  session = target;
  // Session ancienne : on la renouvelle avant de s'en servir (si elle a été révoquée, le compte sort de la liste)
  const fresh = target.exp - Date.now() < 60_000 ? await refreshSession() : target;
  if (!fresh) return "La session de ce compte a expiré : reconnectez-le.";
  useAuth.setState({ error: null });
  store(fresh);
  return null;
}

/** Oublie un compte mémorisé qui n'est pas celui en cours. */
export function forgetAccount(id: string) {
  if (session?.user.id !== id) forget(id);
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
  if (session) forget(session.user.id);
  store(null);
}
