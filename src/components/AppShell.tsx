"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3, BookOpen, Building2, Cloud, CloudOff, FlaskConical, Globe2, LineChart, Network, Newspaper, Wallet, Plus, Clock, LayoutGrid, X,
} from "lucide-react";
import { useGame } from "@/store/game";
import { fetchQuotes, STATIC_MODE } from "@/lib/market/client";
import { startCloudSync } from "@/lib/cloud";
import { startWorldSync } from "@/lib/world/players";
import { initAuth, useAuth } from "@/lib/auth";
import { retryOnline, startOnline, useOnline } from "@/lib/online";
import { usePopover } from "@/lib/panels";
import { claimTab, useTab } from "@/lib/tabLock";
import TabPaused from "@/components/TabPaused";
import UpdateBanner from "@/components/UpdateBanner";
import NoNetwork, { useNetwork } from "@/components/NoNetwork";
import AccountMenu from "@/components/AccountMenu";
import InstallApp from "@/components/InstallApp";
import Guide, { ShowGuide } from "@/components/Guide";
import AbsenceReport from "@/components/AbsenceReport";
import NotifBell from "@/components/NotifBell";
import { startNotifs } from "@/lib/notifs";
import { startSoundEvents } from "@/lib/soundEvents";
import SoundButton from "@/components/SoundButton";
import ChatButton from "@/components/ChatButton";
import { startChat } from "@/lib/chat";
import { useSound } from "@/lib/sound";
import AuthGate, { Splash } from "@/components/AuthGate";
import { DAY_MS } from "@/lib/game/engine";
import { nextHourly } from "@/lib/refresh";
import { now as gameNow } from "@/lib/clock";
import { capitalFmt, compactEur, eur } from "@/lib/format";

const NAV: { href: string; label: string; icon: typeof BarChart3; soon?: boolean }[] = [
  { href: "/", label: "Économie", icon: BarChart3 },
  { href: "/marches", label: "Marchés", icon: LineChart },
  { href: "/portefeuille", label: "Portefeuille", icon: Wallet },
  { href: "/ville", label: "Ville", icon: Building2 },
  { href: "/monde", label: "Monde", icon: Globe2 },
  { href: "/actualites", label: "Actualités", icon: Newspaper },
  { href: "/relations", label: "Relations", icon: Network },
  { href: "/recherche", label: "Recherche", icon: FlaskConical },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
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
      <div className={`leading-[0.95] font-extrabold tracking-wide text-[15px] ${light ? "text-white" : "hidden min-[480px]:block text-navy"}`}>
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

/** Les cours ne changent qu'une fois par heure, entre h05 et h13 (supabase/functions/refresh-market) : on les relit
 *  à l'ouverture, puis une fois par heure juste après cette mise à jour (h15 à h19, réparti entre les joueurs).
 *  Échec (réseau) : nouvel essai 2 min plus tard. La ville, elle, avance en local sans réseau. */
const QUOTES_MINUTE = 15 + Math.floor(Math.random() * 5), QUOTES_RETRY = 2 * 60_000;
const nextQuotesPull = (at: number) => nextHourly(at, QUOTES_MINUTE);
function useHeartbeat(enabled: boolean) {
  const setQuotes = useGame((s) => s.setQuotes);
  const sync = useGame((s) => s.sync);
  const notify = useGame((s) => s.notify);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, nextPull = 0;
    const pull = async () => {
      const at = Date.now();
      nextPull = at + QUOTES_RETRY;
      try {
        const j = await fetchQuotes();
        nextPull = nextQuotesPull(at);
        if (alive) { setQuotes(j.quotes, j.mode); useGame.setState({ quotesAt: j.updatedAt }); }
      } catch { /* hors ligne : on garde les derniers cours */ }
    };
    const tick = () => {
      const days = sync();
      // À partir de 3 jours, le journal d'absence raconte ce qui s'est passé (voir AbsenceReport)
      if (days > 0 && days < 3 && alive) notify(days === 1 ? "Un nouveau jour s'est écoulé dans votre ville" : `${days} jours se sont écoulés dans votre ville`);
    };
    pull(); tick();
    // Pas de requête quand l'onglet est caché
    const id = setInterval(() => {
      if (document.hidden) return;
      tick();
      if (Date.now() >= nextPull) pull();
    }, 30_000);
    const onVisible = () => { if (!document.hidden) { tick(); if (Date.now() >= nextPull) pull(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled, setQuotes, sync, notify]);
}

function NextDay() {
  const lastTick = useGame((s) => s.game.lastTick);
  const day = useGame((s) => s.game.day);
  const [now, setNow] = useState(() => gameNow());
  useEffect(() => { const id = setInterval(() => setNow(gameNow()), 15_000); return () => clearInterval(id); }, []);
  const mins = Math.max(0, Math.ceil((lastTick + DAY_MS - now) / 60_000));
  return (
    <>
      <div className="hidden md:flex items-center gap-2 text-[12px] text-muted">
        <Clock size={14} />
        <span><b className="text-ink font-semibold">Jour {day}</b> · prochain jour dans {mins} min</span>
      </div>
      {/* Téléphone : juste le temps restant, à côté du logo (le jour est rappelé dans Ville). Court, pour que le profil
          garde sa place dans la barre : avec « J157 · », il était poussé hors de l'écran. */}
      <div className="flex md:hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2 max-[359px]:px-1.5 py-1 text-[11px] text-muted tabular" title={`Jour ${day} · prochain jour dans ${mins} min`}>
        <Clock size={12} />
        <span><b className="text-ink font-semibold">{mins} min</b></span>
      </div>
    </>
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
  // Un seul onglet joue à la fois sur l'appareil : les autres se mettent en pause (lib/tabLock.ts)
  useEffect(() => { claimTab(); }, []);
  const paused = useTab((s) => s.paused);
  useHeartbeat(hydrated && !paused);
  // Le jeu a démarré : le filet de sécurité de layout.tsx (rechargement si le jeu ne démarre pas) n'a plus à agir
  useEffect(() => { (window as { __meStarted?: boolean }).__meStarted = true; }, []);
  useEffect(() => {
    if (!hydrated) return;
    startNotifs();
    startSoundEvents();
    if (STATIC_MODE) { startCloudSync(); startWorldSync(); return; }
    initAuth().then(() => { startOnline(); startChat(); });
  }, [hydrated]);
  // Modèles 3D des bâtiments de la ville préparés pendant les moments libres, dès l'ouverture du jeu :
  // en arrivant sur la ville, tout est prêt (plus de gel d'une à deux secondes pour une grande ville).
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      const ids = Object.keys(useGame.getState().game.buildings);
      void Promise.all([import("@/lib/city3d/models"), import("@/lib/game/season")])
        .then(([m, s]) => { const season = s.seasonOf(); m.warmBuildings(ids.map((id) => (id === "townhall" && season ? `townhall@${season}` : id))); })
        .catch(() => { /* pas de 3D ici : rien à préparer */ });
    }, 1500);
    return () => clearTimeout(t);
  }, [hydrated]);
  const authStatus = useAuth((s) => s.status);
  // Pas de réseau : écran dédié. Au retour du réseau, la partie en ligne est rechargée si elle n'avait pas pu l'être.
  const network = useNetwork();
  // Seulement au retour du réseau (pas en boucle quand c'est le serveur qui ne répond pas)
  const wasOff = useRef(false);
  useEffect(() => {
    if (!network) { wasOff.current = true; return; }
    if (wasOff.current && useOnline.getState().phase === "error") retryOnline();
    wasOff.current = false;
  }, [network]);
  const cloud = useGame((s) => s.cloud);
  const cash = useGame((s) => s.game.cash);
  const capital = useGame((s) => s.game.capital ?? 0);
  const name = useGame((s) => s.game.playerName);
  const mode = useGame((s) => s.dataMode);
  const sandbox = useGame((s) => !!s.game.sandbox);
  const quotesAt = useGame((s) => s.quotesAt);
  const toast = useGame((s) => s.toast);

  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  // Informations légales : lisibles sans compte, hors du cadre du jeu
  if (path.startsWith("/legal")) return <>{children}</>;
  // Site publié : pas de jeu sans compte Discord (la page Claude, elle, a sa propre identité)
  if (paused) return <TabPaused />;
  if (!STATIC_MODE && !network) return <NoNetwork />;
  if (!STATIC_MODE && !hydrated) return <Splash text="Chargement de votre empire…" />;
  const shell = (
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
        <div className="mt-auto"><ShowGuide dark /><InstallApp dark /></div>
        <div className="px-2 text-[11px] text-slate-500 leading-relaxed">
          Construis · Investis · Domine<br />Prototype v0.1<br />
          <Link href="/legal" className="hover:text-slate-300 hover:underline">Informations légales</Link>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barre du haut */}
        {/* Au-dessus des panneaux flottants des pages (z-20) : ses menus (notifications, compte) passent devant eux */}
        <header className="h-16 bg-card border-b border-line flex items-center gap-2 sm:gap-4 px-3 sm:px-4 md:px-8 sticky top-0 z-30">
          {/* Téléphone : pas de logo dans la barre (la barre du bas suffit), la place va au profil et au compte à rebours */}
          <div className="hidden sm:block lg:hidden"><Logo /></div>
          {hydrated && <NextDay />}
          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-3">
            {hydrated && sandbox && <Link href="/ville" title="Mode test actif : argent et capital sans limite. Il se quitte dans Ville › Options." className="inline-flex shrink-0 items-center rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-amber-950">Mode test</Link>}
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
            {/* Téléphone : le son se règle dans « Plus » (la place va au chat) */}
            {hydrated && <div className="hidden sm:block"><SoundButton /></div>}
            {hydrated && !STATIC_MODE && authStatus === "in" && <ChatButton />}
            {hydrated && <NotifBell />}
            <Link href="/ville" className="flex shrink-0 items-center gap-2 rounded-[12px] bg-success-soft px-2.5 sm:px-3 py-1.5">
              <div className="leading-tight text-right">
                {/* Téléphone : montant abrégé à partir du million, pour que la barre ne déborde jamais */}
                <div className="whitespace-nowrap text-[14px] font-bold text-emerald-700 tabular">{!hydrated ? "—" : sandbox ? "∞ €" : <><span className="sm:hidden">{cash >= 1_000_000 ? compactEur(cash) : eur(cash)}</span><span className="hidden sm:inline">{eur(cash)}</span></>}</div>
                {/* Deuxième monnaie : le capital, produit par les placements en bourse */}
                <div className="whitespace-nowrap text-[10px] text-emerald-700/70">Liquidités{hydrated && <> · <b className="font-semibold text-violet-700" title="Capital : produit par vos placements, demandé par les gros bâtiments">{sandbox ? "∞ ◆" : capitalFmt(capital)}</b></>}</div>
              </div>
              <span className="hidden sm:grid h-6 w-6 rounded-full bg-success text-white place-items-center"><Plus size={14} /></span>
            </Link>
          </div>
        </header>
        {hydrated && <UpdateBanner />}

        {/* La ville occupe tout l'écran (pas de marges) ; les autres pages gardent leur colonne centrée */}
        <main className={path.startsWith("/ville") ? "flex-1 min-w-0" : "flex-1 px-4 md:px-8 py-6 pb-24 lg:pb-8 max-w-[1440px] w-full mx-auto"}>
          {hydrated ? children : <div className="text-muted py-20 text-center">Chargement de votre empire…</div>}
        </main>
      </div>

      {/* Navigation mobile : 4 onglets principaux + « Plus » */}
      <MobileNav isActive={isActive} mode={mode} quotesAt={quotesAt} />

      {hydrated && <Guide />}
      {hydrated && <AbsenceReport />}
      {toast && (
        <div role="status" className={`fixed z-40 bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 appear rounded-[12px] px-4 py-2.5 text-[13px] font-medium shadow-lg ${toast.kind === "ok" ? "bg-navy text-white" : "bg-danger text-white"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
  return STATIC_MODE ? shell : <AuthGate>{shell}</AuthGate>;
}

const MOBILE_MAIN = ["/", "/marches", "/portefeuille", "/ville"];

function MobileNav({ isActive, mode, quotesAt }: { isActive: (href: string) => boolean; mode: string; quotesAt: number }) {
  const [open, setOpen] = usePopover("more");
  const path = usePathname();
  const main = NAV.filter((n) => MOBILE_MAIN.includes(n.href));
  const more = NAV.filter((n) => !MOBILE_MAIN.includes(n.href));
  const moreActive = more.some((n) => isActive(n.href));
  // Fermer le panneau quand on change de page
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) { setLastPath(path); setOpen(false); }

  return (
    <>
      {open && (
        <div className="lg:hidden fixed inset-0 z-30 bg-navy/40 appear" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-card px-4 pt-3 shadow-2xl" onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <div className="grid grid-cols-3 gap-2">
              {more.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}
                  className={`flex flex-col items-center gap-1.5 rounded-[14px] py-3.5 text-[12px] font-medium ${isActive(href) ? "bg-primary text-white" : "bg-slate-50 text-ink active:bg-slate-100"}`}>
                  <Icon size={22} strokeWidth={1.8} />{label}
                </Link>
              ))}
            </div>
            <ShowGuide />
            <SoundRow />
            <InstallApp />
            <div className={`mt-3 flex items-center gap-2 rounded-[12px] px-3 py-2 text-[12px] ${mode === "simulé" ? "bg-warning-soft text-amber-700" : "bg-success-soft text-emerald-700"}`}>
              <span className={`h-2 w-2 rounded-full ${mode === "simulé" ? "bg-warning" : "bg-success"}`} />
              {mode === "simulé" ? "Cours simulés" : `Cours réels · mis à jour à ${new Date(quotesAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
            </div>
          </div>
        </div>
      )}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-navy text-slate-400 grid grid-cols-5 px-1 pt-2 border-t border-white/10"
        style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}>
        {main.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 text-[10px] py-0.5 ${isActive(href) && !open ? "text-white" : ""}`}>
            <Icon size={21} strokeWidth={1.8} />{label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={`flex flex-col items-center gap-0.5 text-[10px] py-0.5 ${open || moreActive ? "text-white" : ""}`}>
          {open ? <X size={21} strokeWidth={1.8} /> : <LayoutGrid size={21} strokeWidth={1.8} />}
          {open ? "Fermer" : moreActive ? more.find((n) => isActive(n.href))!.label : "Plus"}
        </button>
      </nav>
    </>
  );
}

/** Téléphone : couper ou remettre le son depuis « Plus » (le bouton de la barre du haut n'y a pas sa place). */
function SoundRow() {
  const { on, setOn } = useSound();
  return (
    <div className="mt-3 flex items-center justify-between rounded-[12px] bg-slate-50 px-3 py-2.5 text-[13px] font-semibold">
      Sons du jeu
      <button role="switch" aria-checked={on} aria-label="Activer les sons" data-sfx="none" onClick={() => setOn(!on)}
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
