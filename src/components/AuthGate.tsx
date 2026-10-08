"use client";
// Entrée du jeu sur le site publié : il faut un compte (Discord, ou Google s'il est activé dans Supabase).
//   déconnecté          → écran de connexion
//   première connexion  → création du compte (nom de la ville)
//   serveur injoignable → nouvel essai, ou partie hors ligne
import { useEffect, useState } from "react";
import { Building2, FlaskConical, Globe2, LineChart, LogOut, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { forgetAccount, googleEnabled, loginWithDiscord, loginWithGoogle, loginWithPassword, logout, switchAccount, useAuth } from "@/lib/auth";
import { Face } from "@/components/AccountMenu";
import { createAccount, playOffline, retryOnline, useOnline } from "@/lib/online";
import { useGame } from "@/store/game";
import { DiscordIcon, GoogleIcon, ProviderTag } from "@/components/DiscordButton";
import { Logo } from "@/components/AppShell";
import { Button } from "@/components/ui";
import { eur } from "@/lib/format";

const PITCH: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: LineChart, title: "Investissez sur les vrais marchés", text: "Actions, ETF, matières premières et cryptos, aux cours réels. Aucun argent réel en jeu." },
  { icon: Building2, title: "Développez votre ville", text: "Vos gains financent logements, entreprises et énergie." },
  { icon: Globe2, title: "Prenez votre place dans le monde", text: "Un territoire, un classement, et bientôt le commerce entre joueurs." },
];

/** Cadre commun : présentation du jeu à gauche, action à droite. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden lg:flex flex-col justify-between bg-navy text-slate-300 p-12">
        <Logo light />
        <div>
          <h1 className="text-[40px] font-bold leading-[1.1] text-white">Construis.<br />Investis.<br />Domine.</h1>
          <ul className="mt-10 space-y-6">
            {PITCH.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white/10 text-white"><Icon size={19} strokeWidth={1.8} /></span>
                <span>
                  <span className="block text-[15px] font-semibold text-white">{title}</span>
                  <span className="block text-[13px] leading-relaxed text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[11px] text-slate-500">Prototype v0.1</div>
      </aside>
      <main className="flex flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}

export function Splash({ text }: { text: string }) {
  return (
    <div className="min-h-screen grid place-items-center" role="status">
      <div className="flex flex-col items-center gap-4"><Logo /><p className="text-[13px] text-muted">{text}</p></div>
    </div>
  );
}

const DISCORD_BTN = "inline-flex w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#5865F2] px-4 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#4752C4]";

/** Comptes déjà connectés sur cet appareil : on y revient d'un clic, sans repasser par Discord. */
function SavedAccounts() {
  const saved = useAuth((s) => s.saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!saved.length) return null;
  const pick = async (id: string) => { if (busy) return; setBusy(id); setError(await switchAccount(id)); setBusy(null); };
  return (
    <div className="mb-6">
      <h2 className="text-[26px] font-semibold leading-tight">Reprendre un compte</h2>
      <ul className="mt-4 space-y-2">
        {saved.map((a) => (
          <li key={a.id} className="flex items-center gap-1 rounded-[12px] border border-line bg-card pr-1.5 transition-colors hover:border-slate-300">
            <button type="button" onClick={() => pick(a.id)} disabled={!!busy} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left disabled:opacity-60">
              <Face a={a} size={40} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{a.name}</span><span className="block text-[12px] text-muted">{busy === a.id ? "Ouverture…" : "Continuer avec ce compte"}</span></span>
            </button>
            <button type="button" onClick={() => forgetAccount(a.id)} title="Oublier ce compte sur cet appareil" aria-label={`Oublier le compte ${a.name}`} className="rounded-[8px] p-2 text-muted hover:bg-slate-100 hover:text-danger"><X size={15} /></button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-red-700">{error}</p>}
      <div className="mt-6 flex items-center gap-3 text-[12px] font-medium text-muted"><span className="h-px flex-1 bg-line" />ou un autre compte<span className="h-px flex-1 bg-line" /></div>
    </div>
  );
}

function LoginScreen() {
  const error = useAuth((s) => s.error);
  const known = useAuth((s) => s.saved.length > 0);
  // Le bouton Google n'apparaît que si Google est activé côté serveur
  const [google, setGoogle] = useState(false);
  useEffect(() => { let on = true; googleEnabled().then((ok) => { if (on) setGoogle(ok); }); return () => { on = false; }; }, []);
  return (
    <Frame>
      <SavedAccounts />
      {!known && <h2 className="text-[26px] font-semibold leading-tight">Connexion</h2>}
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Market Empire se joue avec un compte {google ? "Discord ou Google" : "Discord"}. À la première connexion, votre compte de jeu est créé automatiquement.
      </p>
      {error && <p role="alert" className="mt-4 rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-red-700">Connexion : {error}</p>}
      <button type="button" onClick={loginWithDiscord} className={`${DISCORD_BTN} mt-6`}>
        <DiscordIcon size={20} />Se connecter avec Discord
      </button>
      {google && (
        <button type="button" onClick={loginWithGoogle} className="mt-2.5 inline-flex w-full items-center justify-center gap-2.5 rounded-[12px] border border-line bg-card px-4 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-slate-50">
          <GoogleIcon size={19} />Se connecter avec Google
        </button>
      )}
      <ul className="mt-6 space-y-2 text-[12px] leading-relaxed text-muted">
        <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />Le jeu ne reçoit que votre nom et votre image de profil. Jamais votre mot de passe.</li>
        {google && <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />Avec Google, le nom de votre compte Google est celui que les autres joueurs voient dans le classement.</li>}
        <li className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />Votre partie est sauvegardée en ligne : vous la retrouvez sur tous vos appareils.</li>
      </ul>
      <TestLogin />
    </Frame>
  );
}

/** Compte de test : une partie à part, avec argent et capital sans limite, pour essayer le jeu sans toucher à la sienne.
 *  Discret, replié par défaut : les joueurs n'en ont pas besoin. */
function TestLogin() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-ink hover:underline">
        <FlaskConical size={13} />Passer sur un compte de test
      </button>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const err = await loginWithPassword(name, password);
    if (err) { setError(err); setBusy(false); }
  };
  const field = "w-full rounded-[10px] border border-line px-3 py-2 text-[14px] outline-none focus:border-primary";
  return (
    <form onSubmit={submit} className="mt-6 rounded-[12px] border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-900"><FlaskConical size={15} />Compte de test</div>
      <p className="mt-1 text-[12px] text-amber-900">Une partie à part, avec argent et capital sans limite et tout débloqué. Elle ne touche pas à votre vrai compte.</p>
      <label htmlFor="test-name" className="mt-3 block text-[12px] font-medium">Identifiant</label>
      <input id="test-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} className={`mt-1 ${field}`} />
      <label htmlFor="test-password" className="mt-3 block text-[12px] font-medium">Mot de passe</label>
      <input id="test-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={`mt-1 ${field}`} />
      {error && <p role="alert" className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-red-700">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={busy || !name.trim() || !password}>{busy ? "Connexion…" : "Se connecter"}</Button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className="text-[12px] font-medium text-muted hover:underline">Annuler</button>
      </div>
    </form>
  );
}

function Who() {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-line bg-card p-3">
      {user.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatar} alt="" width={40} height={40} className="h-10 w-10 rounded-full" />
        : <span className="grid h-10 w-10 place-items-center rounded-full bg-[#5865F2] text-[15px] font-semibold text-white">{user.name[0]}</span>}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[14px] font-semibold">{user.name}</div>
        <div className="flex items-center gap-1 text-[11px] text-muted"><ProviderTag via={user.via} long /></div>
      </div>
      <button type="button" onClick={() => logout()} title="Changer de compte" className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] text-muted hover:bg-slate-100">
        <LogOut size={13} />Changer
      </button>
    </div>
  );
}

function CreateAccount() {
  const game = useGame((s) => s.game);
  const [city, setCity] = useState(game.cityName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = game.day > 1 || game.transactions.length > 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await createAccount(city));
    setBusy(false);
  };
  return (
    <Frame>
      <h2 className="text-[26px] font-semibold leading-tight">Créer votre compte</h2>
      <p className="mt-2 mb-5 text-[14px] leading-relaxed text-muted">Dernière étape : donnez un nom à votre ville. Vous pourrez le changer plus tard.</p>
      <Who />
      <form onSubmit={submit} className="mt-5">
        <label htmlFor="new-city" className="mb-1.5 block text-[13px] font-medium">Nom de votre ville</label>
        <input id="new-city" value={city} maxLength={32} autoFocus onChange={(e) => { setCity(e.target.value); setError(null); }}
          className="w-full rounded-[12px] border border-line bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-primary" />
        <p className="mt-2 text-[12px] text-muted">
          {started
            ? `La partie déjà commencée sur cet appareil (jour ${game.day}) sera rattachée à votre compte.`
            : `Vous commencez avec ${eur(game.cash)} et un village de ${game.population} habitants.`}
        </p>
        {error && <p role="alert" className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-red-700">{error}</p>}
        <Button type="submit" disabled={busy || city.trim().length < 2} className="mt-5 w-full !rounded-[12px] !py-3 !text-[15px]">
          {busy ? "Création…" : "Créer mon compte et jouer"}
        </Button>
      </form>
    </Frame>
  );
}

function ServerError() {
  return (
    <Frame>
      <h2 className="text-[26px] font-semibold leading-tight">Serveur injoignable</h2>
      <p className="mt-2 mb-5 text-[14px] leading-relaxed text-muted">
        Votre partie en ligne n&apos;a pas pu être chargée. Vérifiez votre connexion internet, puis réessayez.
      </p>
      <Who />
      <Button onClick={retryOnline} className="mt-5 inline-flex w-full items-center justify-center gap-2 !rounded-[12px] !py-3 !text-[15px]"><RefreshCw size={16} />Réessayer</Button>
      <button type="button" onClick={playOffline} className="mt-3 w-full text-center text-[13px] text-muted hover:text-ink hover:underline">
        Jouer hors ligne avec la partie de cet appareil
      </button>
      <p className="mt-2 text-center text-[11px] text-muted">Hors ligne, rien n&apos;est sauvegardé sur le serveur.</p>
    </Frame>
  );
}

/** Affiche le jeu seulement quand le joueur est connecté et que son compte est ouvert. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const phase = useOnline((s) => s.phase);
  if (status === "loading") return <Splash text="Chargement…" />;
  if (status === "out") return <LoginScreen />;
  if (phase === "new") return <CreateAccount />;
  if (phase === "error") return <ServerError />;
  if (phase !== "ready") return <Splash text="Chargement de votre partie…" />;
  return <>{children}</>;
}
