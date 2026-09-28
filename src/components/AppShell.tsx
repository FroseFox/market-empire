"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, Building2, Cloud, CloudOff, FlaskConical, Folder, Globe2, LineChart, Network, Newspaper, Wallet, Plus, Clock,
} from "lucide-react";
import { useGame } from "@/store/game";
import { fetchQuotes, STATIC_MODE } from "@/lib/market/client";
import { startCloudSync } from "@/lib/cloud";
import { startWorldSync } from "@/lib/world/players";
import { initAuth, useAuth } from "@/lib/auth";
import { startOnline } from "@/lib/online";
import AccountMenu from "@/components/AccountMenu";
import { DAY_MS } from "@/lib/game/engine";
import { eur } from "@/lib/format";

const NAV: { href: string; label: string; icon: typeof BarChart3; soon?: boolean }[] = [
  { href: "/", label: "Économie", icon: BarChart3 },
  { href: "/marches", label: "Marchés", icon: LineChart },
  { href: "/portefeuille", label: "Portefeuille", icon: Wallet },
  { href: "/ville", label: "Ville", icon: Building2 },
  { href: "/monde", label: "Monde", icon: Globe2 },
  { href: "/actualites", label: "Actualités", icon: Newspaper },
  { href: "/relations", label: "Relations", icon: Network },
  { href: "/dossiers", label: "Dossiers", icon: Folder },
  { href: "/recherche", label: "Recherche", icon: FlaskConical },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect x="3" y="18" width="5" height="10" rx="1.2" fill="#2563EB" />
        <rect x="11" y="13" width="5" height="15" rx="1.2" fill="#2563EB" opacity=".85" />
        <rect x="19" y="8" width="5" height="20" rx="1.2" fill="#2563EB" opacity=".7" />
        <path d="M3 14 L12 8 L17 11 L28 3" stroke={light ? "#fff" : "#0F172A"} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23 3 H28 V8" stroke={light ? "#fff" : "#0F172A"} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className={`leading-[0.95] font-extrabold tracking-wide text-[15px] ${light ? "text-white" : "text-navy"}`}>
        MARKET<br />EMPIRE
      </div>
    </div>
  );
}

function useHydrated() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const done = () => setOk(true);
    if (useGame.persist.hasHydrated()) done();
    return useGame.persist.onFinishHydration(done);
  }, []);
  return ok;
}

/** Les cours ne changent qu'une fois par heure : on les relit toutes les 10 min
 *  (et au retour sur l'onglet). La ville, elle, avance en local sans réseau. */
const QUOTES_EVERY = 10 * 60_000;
function useHeartbeat(enabled: boolean) {
  const setQuotes = useGame((s) => s.setQuotes);
  const sync = useGame((s) => s.sync);
  const notify = useGame((s) => s.notify);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, lastPull = 0;
    const pull = async () => {
      lastPull = Date.now();
      try {
        const j = await fetchQuotes();
        if (alive) { setQuotes(j.quotes, j.mode); useGame.setState({ quotesAt: j.updatedAt }); }
      } catch { /* hors ligne : on garde les derniers cours */ }
    };
    const tick = () => {
      const days = sync();
      if (days > 0 && alive) notify(days === 1 ? "Un nouveau jour s'est écoulé dans votre ville" : `${days} jours se sont écoulés dans votre ville`);
    };
    pull(); tick();
    // Pas de requête quand l'onglet est caché
    const id = setInterval(() => {
      if (document.hidden) return;
      tick();
      if (Date.now() - lastPull >= QUOTES_EVERY) pull();
    }, 30_000);
    const onVisible = () => { if (!document.hidden) { tick(); if (Date.now() - lastPull >= QUOTES_EVERY) pull(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled, setQuotes, sync, notify]);
}

function NextDay() {
  const lastTick = useGame((s) => s.game.lastTick);
  const day = useGame((s) => s.game.day);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const mins = Math.max(0, Math.ceil((lastTick + DAY_MS - now) / 60_000));
  return (
    <div className="hidden md:flex items-center gap-2 text-[12px] text-muted">
      <Clock size={14} />
      <span><b className="text-ink font-semibold">Jour {day}</b> · prochain jour dans {mins} min</span>
    </div>
  );
}

const CLOUD_LABEL = {
  saved: { text: "Sauvegardé en ligne", cls: "text-emerald-700", icon: Cloud },
  syncing: { text: "Enregistrement…", cls: "text-muted", icon: Cloud },
  local: { text: "Sauvegarde sur cet appareil", cls: "text-muted", icon: CloudOff },
  error: { text: "Sauvegarde en échec, nouvel essai au prochain changement", cls: "text-danger", icon: CloudOff },
} as const;

function CloudBadge({ status }: { status: keyof typeof CLOUD_LABEL }) {
  const c = CLOUD_LABEL[status];
  return (
    <span className={`hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium ${c.cls}`} title={c.text}>
      <c.icon size={14} />{status === "error" ? "Sauvegarde en échec" : c.text}
    </span>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hydrated = useHydrated();
  useHeartbeat(hydrated);
  useEffect(() => {
    if (!hydrated) return;
    if (STATIC_MODE) { startCloudSync(); startWorldSync(); return; }
    initAuth().then(startOnline);
  }, [hydrated]);
  const authError = useAuth((s) => s.error);
  const notify = useGame((s) => s.notify);
  useEffect(() => { if (authError) { notify(`Connexion Discord : ${authError}`, "error"); useAuth.setState({ error: null }); } }, [authError, notify]);
  const authStatus = useAuth((s) => s.status);
  const cloud = useGame((s) => s.cloud);
  const cash = useGame((s) => s.game.cash);
  const name = useGame((s) => s.game.playerName);
  const mode = useGame((s) => s.dataMode);
  const quotesAt = useGame((s) => s.quotesAt);
  const toast = useGame((s) => s.toast);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-[232px] shrink-0 flex-col bg-navy text-slate-300 px-4 py-5 sticky top-0 h-screen">
        <div className="px-2 mb-8"><Logo light /></div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon, soon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors ${isActive(href) ? "bg-primary text-white" : "hover:bg-white/5 hover:text-white"}`}>
              <Icon size={18} strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
              {soon && <span className="text-[10px] uppercase tracking-wide text-slate-500">Bientôt</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-2 text-[11px] text-slate-500 leading-relaxed">
          Construis · Investis · Domine<br />Prototype v0.1
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barre du haut */}
        <header className="h-16 bg-card border-b border-line flex items-center gap-4 px-4 md:px-8 sticky top-0 z-20">
          <div className="lg:hidden"><Logo /></div>
          {hydrated && <NextDay />}
          <div className="ml-auto flex items-center gap-3">
            <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${mode === "simulé" ? "bg-warning-soft text-amber-700" : "bg-success-soft text-emerald-700"}`}
              title={mode === "simulé" ? "Cours simulés : aucune source de cours configurée" : `Cours réels, rafraîchis une fois par heure. Dernière mise à jour : ${new Date(quotesAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${mode === "simulé" ? "bg-warning" : "bg-success"}`} />
              {mode === "simulé" ? "Cours simulés" : "Cours réels · 1 h"}
            </span>
            {hydrated && (STATIC_MODE || authStatus === "in") && <CloudBadge status={cloud} />}
            {STATIC_MODE ? (
              <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-line">
                <div className="h-8 w-8 rounded-full bg-primary text-white grid place-items-center text-[13px] font-semibold">{hydrated ? name[0] : ""}</div>
                <div className="leading-tight"><div className="text-[13px] font-semibold">{hydrated ? name : ""}</div><div className="text-[11px] text-muted">Investisseur</div></div>
              </div>
            ) : hydrated && <AccountMenu />}
            <Link href="/ville" className="flex items-center gap-2 rounded-[12px] bg-success-soft px-3 py-1.5">
              <div className="leading-tight text-right">
                <div className="text-[14px] font-bold text-emerald-700 tabular">{hydrated ? eur(cash) : "—"}</div>
                <div className="text-[10px] text-emerald-700/70">Liquidités</div>
              </div>
              <span className="h-6 w-6 rounded-full bg-success text-white grid place-items-center"><Plus size={14} /></span>
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {hydrated ? children : <div className="text-muted py-20 text-center">Chargement de votre empire…</div>}
        </main>
      </div>

      {/* Navigation mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-navy text-slate-400 flex justify-between gap-1 overflow-x-auto px-2 pt-2 border-t border-white/10" style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}>
        {NAV.filter((n) => !n.soon).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 text-[10px] px-1.5 min-w-[56px] shrink-0 ${isActive(href) ? "text-white" : ""}`}>
            <Icon size={20} strokeWidth={1.8} />{label}
          </Link>
        ))}
      </nav>

      {toast && (
        <div role="status" className={`fixed z-40 bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 appear rounded-[12px] px-4 py-2.5 text-[13px] font-medium shadow-lg ${toast.kind === "ok" ? "bg-navy text-white" : "bg-danger text-white"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
