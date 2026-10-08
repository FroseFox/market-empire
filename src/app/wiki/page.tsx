"use client";
// Wiki du jeu. Tous les chiffres viennent de la configuration (lib/game/config) : la page reste juste quand l'équilibrage change.
// Les briques visuelles sont dans components/wiki (rubriques, encadrés, schémas, petites simulations).
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  BarChart3, Bell, BookOpen, Briefcase, Building2, Clock, CloudLightning, Coins, Ellipsis, Factory, FlaskConical, Footprints, Gem, Globe, Hammer, Handshake, Hash,
  Landmark, LayoutDashboard, LayoutGrid, LayoutList, LifeBuoy, LineChart, Move, Newspaper, PieChart, Rocket, Search, Share2, ShieldCheck, Smile, Swords, Target, Trash2, Trophy, User, Users, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useGame } from "@/store/game";
import {
  ACTIVE_RATIO, ALLIANCE, BANK, BLOCKADE, BRANCH_COST, BRANCH_EFFECTS, BRANCH_MIN_VALUE, BUILDINGS, CAPITAL, CATEGORY_LABELS, CITIES_PER_COUNTRY, CITY_EFFECT_CAPS, CITY_RANKS,
  CONTRACT_RATIO, COUNTRY_PRICES, DAY_LENGTH_MINUTES, DEMOLISH_REFUND, ENERGY_PER_RESIDENT, EXPORT_RATIO, FEATURES, FOOD_PER_RESIDENT, GOALS, HUB_DESK_COST, HUB_FEE_FACTOR,
  LEVERAGE, MAINTENANCE_RATE, MAX_CATCHUP_DAYS, MAX_CONTRACTS, NEED_PER_RANK, ORIENTATIONS, ORIENTATION_CHANGE_COST, ORIENTATION_MIN_RANK, POLLUTION_MAX, PROJECTS,
  RENOVATE_RATE, RESOURCE_PRICES, SERVICES, SERVICE_IDS, SHARES, SPECIALTY_BONUS, STARTING_CASH, STARTING_POPULATION, START_GRANT, TAX_PER_RESIDENT, TERRITORY, TOURISM,
  TRADE_FEE_MIN, TRADE_FEE_RATE, WEAR_PER_DAY, type BranchFamily,
} from "@/lib/game/config";
import { cityRank } from "@/lib/game/engine";
import { GUIDE } from "@/lib/game/guide";
import { CITY_EVENTS, EVENTS, effectText } from "@/lib/game/events";
import { BRANCH_COLOR, RESEARCH, RESEARCH_BY_ID } from "@/lib/game/research";
import { HUBS, PLAYABLE, PLAYABLE_IDS, countryPrice, countryTier, specialtyText } from "@/lib/world/countries";
import { BIG_MOVE } from "@/lib/notifs";
import { MIN_GAP } from "@/lib/online";
import { Button } from "@/components/ui";
import Robot from "@/components/Robot";
import { Accordion, Callout, Facts, H3, Points, Reveal, Section, Steps, Table, Tag, TINTS, type Tint } from "@/components/wiki/ui";
import { BuildingGallery, CapitalDemo, LeverageDemo, LoopDiagram, RankTrack, ShareDemo, TourismDemo } from "@/components/wiki/Visuals";
import { compactEur, eur, num } from "@/lib/format";

// ─── Sommaire ─────────────────────────────────────────────────

interface Item { id: string; label: string; icon: LucideIcon; tint: Tint }
const NAV: { group: string; items: Item[] }[] = [
  { group: "Débuter", items: [
    { id: "demarrer", label: "L’essentiel", icon: Rocket, tint: "blue" },
    { id: "jouer", label: "Premiers pas", icon: Footprints, tint: "blue" },
    { id: "pages", label: "Les pages du jeu", icon: LayoutGrid, tint: "sky" },
    { id: "chiffres", label: "Lire les chiffres", icon: Hash, tint: "sky" },
    { id: "soucis", label: "Que faire si…", icon: LifeBuoy, tint: "rose" },
    { id: "temps", label: "Le temps", icon: Clock, tint: "slate" },
    { id: "compte", label: "Compte et sauvegarde", icon: User, tint: "slate" },
  ] },
  { group: "Bourse", items: [
    { id: "bourse", label: "Investir", icon: LineChart, tint: "blue" },
    { id: "levier", label: "Levier et Banque", icon: Landmark, tint: "amber" },
    { id: "capital", label: "Le capital ◆", icon: Gem, tint: "violet" },
    { id: "recherche", label: "Recherche", icon: FlaskConical, tint: "violet" },
  ] },
  { group: "Ville", items: [
    { id: "ville", label: "Revenus et dépenses", icon: Coins, tint: "green" },
    { id: "batiments", label: "Bâtiments", icon: Building2, tint: "green" },
    { id: "equipements", label: "Satisfaction et équipements", icon: Smile, tint: "amber" },
    { id: "progression", label: "Rangs et objectifs", icon: Trophy, tint: "amber" },
    { id: "entreprises", label: "Entreprises implantées", icon: Factory, tint: "sky" },
    { id: "evenements", label: "Événements", icon: CloudLightning, tint: "rose" },
  ] },
  { group: "Monde", items: [
    { id: "monde", label: "Pays et classement", icon: Globe, tint: "sky" },
    { id: "commerce", label: "Commerce", icon: Handshake, tint: "green" },
    { id: "bourse-villes", label: "Bourse des villes", icon: PieChart, tint: "violet" },
    { id: "alliances", label: "Alliances", icon: Users, tint: "blue" },
    { id: "guerre", label: "Guerre économique", icon: Swords, tint: "rose" },
  ] },
  { group: "Référence", items: [
    { id: "notifications", label: "Notifications", icon: Bell, tint: "slate" },
    { id: "lexique", label: "Lexique", icon: BookOpen, tint: "slate" },
  ] },
];
const ITEMS = NAV.flatMap((g) => g.items);
const META: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

const pct = (v: number, d = 0) => `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`;
const fr = (v: number) => v.toLocaleString("fr-FR");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Fait défiler jusqu'à une rubrique (sans toucher à l'adresse : la version autonome du jeu s'en sert pour ses pages). */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

/** Rubriques qui répondent à la recherche (null = pas de recherche), et de quoi aller à une rubrique. */
const Wiki = createContext<{ hits: Set<string> | null; go: (id: string) => void }>({ hits: null, go: scrollToSection });

function Sec({ id, title, brief, children }: { id: string; title?: string; brief: React.ReactNode; children: React.ReactNode }) {
  const { hits } = useContext(Wiki), m = META[id];
  return <Section id={id} icon={m.icon} tint={m.tint} title={title ?? m.label} brief={brief} hidden={!!hits && !hits.has(id)}>{children}</Section>;
}

/** Lien vers une autre rubrique du wiki. */
function Jump({ to, children }: { to: string; children: React.ReactNode }) {
  const { go } = useContext(Wiki);
  return <a href={`#${to}`} onClick={(e) => { e.preventDefault(); go(to); }} className="font-medium text-primary hover:underline">{children}</a>;
}

/** Deux ou trois prix comparés par des barres. */
function Bars({ items }: { items: { label: string; value: number; cls: string; note?: string }[] }) {
  return (
    <div className="mt-3 space-y-2 rounded-[12px] bg-slate-50 p-3">
      {items.map((b) => (
        <div key={b.label} className="grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-2 text-[12px] sm:grid-cols-[minmax(0,220px)_1fr_auto]">
          <span className="min-w-0 font-medium leading-tight">{b.label}{b.note && <span className="block text-[11px] font-normal text-muted">{b.note}</span>}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-200"><span className={`wiki-bar block h-full rounded-full ${b.cls}`} style={{ width: `${Math.min(100, b.value * 100)}%` }} /></span>
          <span className="w-12 text-right font-bold tabular">{pct(b.value)}</span>
        </div>
      ))}
    </div>
  );
}

const PAGES: { href: string; name: string; icon: LucideIcon; what: string; todo: string }[] = [
  { href: "/", name: "Économie", icon: LayoutDashboard, what: "Le tableau de bord : tout votre empire en un coup d’œil.", todo: "Rien à régler ici : vous lisez où vous en êtes." },
  { href: "/marches", name: "Marchés", icon: LineChart, what: "La liste des actifs que vous pouvez acheter, avec leur cours réel et leur courbe.", todo: "Choisir un actif, taper un montant en euros, acheter ou vendre." },
  { href: "/portefeuille", name: "Portefeuille", icon: Briefcase, what: "Ce que vous possédez en bourse, et la Banque de la ville.", todo: "Voir si chaque ligne gagne ou perd, agrandir la Banque, relire vos opérations." },
  { href: "/ville", name: "Ville", icon: Building2, what: "Votre ville : bâtiments, habitants, satisfaction, revenu par jour.", todo: "Construire, déplacer, démolir ; ouvrir Objectifs et Entreprises." },
  { href: "/monde", name: "Monde", icon: Globe, what: "La carte des pays, les autres joueurs et le classement.", todo: "Déménager, visiter une ville, commercer, acheter des parts, s’allier." },
  { href: "/actualites", name: "Actualités", icon: Newspaper, what: "De vraies actualités économiques, reliées aux entreprises du jeu.", todo: "Vous informer avant de décider. Le jeu ne conseille jamais." },
  { href: "/relations", name: "Relations", icon: Share2, what: "Les liens entre entreprises : qui fournit qui, qui concurrence qui.", todo: "Comprendre quelles autres entreprises une nouvelle peut toucher." },
  { href: "/recherche", name: "Recherche", icon: FlaskConical, what: "L’arbre de compétences.", todo: "Payer pour ouvrir de nouveaux marchés et de nouveaux outils d’analyse." },
];

const QUICK: { to: string; icon: LucideIcon; tint: Tint; title: string; text: string }[] = [
  { to: "jouer", icon: Footprints, tint: "blue", title: "Je débute", text: "Les premiers gestes, dans l’ordre" },
  { to: "soucis", icon: LifeBuoy, tint: "rose", title: "J’ai un souci", text: "Chômage, pollution, revenu négatif…" },
  { to: "levier", icon: Landmark, tint: "amber", title: "Comprendre le levier", text: "Avec une simulation à essayer" },
  { to: "batiments", icon: Building2, tint: "green", title: "Tous les bâtiments", text: "En images, avec leurs effets" },
];

const LEXICON: [string, string][] = [
  ["Actif", "Ce qu’on achète en bourse : une action, un ETF, une cryptomonnaie, une matière première."],
  ["Capital ◆", "Deuxième monnaie du jeu. Seuls vos placements en produisent ; les gros bâtiments en demandent."],
  ["Contrat", "Achat régulier du surplus d’énergie ou de nourriture d’un autre joueur."],
  ["Dividende", "Part du flux net d’une ville versée chaque jour à ceux qui détiennent ses parts."],
  ["ETF", "Un panier d’actions acheté en une fois, qui suit un indice ou un secteur."],
  ["Flux net", "Ce que la ville gagne par jour, une fois tout payé. Il peut être négatif."],
  ["Jour de ville", "L’unité de temps de la ville. À chaque jour, elle encaisse son flux net."],
  ["Levier", "Multiplicateur de vos achats en bourse : la Banque de la ville prête le reste."],
  ["Liquidités", "Votre argent disponible tout de suite, en euros."],
  ["Mise", "La somme que vous sortez de votre poche pour un achat, avant le levier."],
  ["Part", "Un millième d’une ville, acheté à son propriétaire à la bourse des villes."],
  ["Patrimoine", "Liquidités + portefeuille + valeur de la ville. C’est lui qui vous classe."],
  ["Plus-value", "Ce que vous gagneriez (ou perdriez) en vendant maintenant."],
  ["PRU", "Prix de revient unitaire : le prix moyen auquel vous avez acheté."],
  ["Rang", "Le palier de la ville, d’après sa population. Chaque rang ouvre des fonctions."],
  ["Satisfaction", "Le moral des habitants. Elle règle les impôts et l’arrivée de nouveaux habitants."],
  ["Tribut", "Ce qu’une ville contrôlée verse en plus des dividendes à celui qui la contrôle."],
  ["Vente d’office", "Vente automatique d’une ligne quand il ne reste presque plus rien de la mise."],
  ["Vétusté", "L’usure des bâtiments. Elle augmente l’entretien jusqu’à la prochaine rénovation."],
];

// ─── Page ─────────────────────────────────────────────────────

export default function WikiPage() {
  const reopen = useGame((s) => s.reopenTutorial);
  const tutorialDone = useGame((s) => s.game.tutorialDone);
  const population = useGame((s) => s.game.population);
  const rank = cityRank(population);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Set<string> | null>(null);
  const [active, setActive] = useState("demarrer");
  const chips = useRef<HTMLDivElement>(null);
  const daysPerRealDay = (24 * 60) / DAY_LENGTH_MINUTES;

  // Recherche : on garde les rubriques dont le texte contient tous les mots tapés
  const search = (text: string) => {
    setQ(text);
    const words = norm(text).split(/\s+/).filter(Boolean);
    if (!words.length) { setHits(null); return; }
    const found = new Set<string>();
    document.querySelectorAll<HTMLElement>("[data-wiki-section]").forEach((el) => {
      const hay = norm(el.textContent ?? "");
      if (words.every((w) => hay.includes(w))) found.add(el.dataset.wikiSection!);
    });
    setHits(found);
  };
  const go = (id: string) => {
    if (hits && !hits.has(id)) { setQ(""); setHits(null); requestAnimationFrame(() => scrollToSection(id)); }
    else scrollToSection(id);
  };

  // Rubrique en cours de lecture, pour le sommaire
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (seen) setActive((seen.target as HTMLElement).dataset.wikiSection!);
    }, { rootMargin: "-22% 0px -68% 0px" });
    document.querySelectorAll("[data-wiki-section]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  // Sur téléphone, la pastille de la rubrique en cours reste visible dans la barre
  useEffect(() => {
    const bar = chips.current, chip = bar?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.clientWidth) / 2, behavior: "smooth" });
  }, [active]);

  const shown = (id: string) => !hits || hits.has(id);

  return (
    <Wiki.Provider value={{ hits, go }}>
      {/* ── En-tête ── */}
      <div className="relative overflow-hidden rounded-[20px] border border-line bg-gradient-to-br from-primary-soft via-white to-success-soft p-5 sm:p-7">
        <div className="flex items-center gap-6">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-primary ring-1 ring-blue-100"><BookOpen size={13} />Wiki</span>
            <h1 className="mt-2.5 text-[25px] font-bold leading-tight tracking-tight sm:text-[32px]">Tout comprendre à Market Empire</h1>
            <p className="mt-1.5 max-w-[560px] text-[14px] leading-relaxed text-muted">Comment jouer, à quoi sert chaque page, et toutes les règles avec leurs chiffres exacts. Des schémas et des simulations vous montrent comment ça marche.</p>
            <label className="relative mt-4 block max-w-[520px]">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => search(e.target.value)} placeholder="Chercher : levier, pollution, parts…" aria-label="Chercher dans le wiki"
                className="w-full rounded-[14px] border border-line bg-white py-3 pl-10 pr-10 text-[14px] shadow-sm outline-none transition-shadow focus:border-primary focus:shadow-[0_0_0_4px_rgb(37_99_235_/_0.12)]" />
              {q && <button type="button" onClick={() => search("")} aria-label="Effacer la recherche" className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-slate-100"><X size={15} /></button>}
            </label>
            {hits && <p role="status" className="mt-2 text-[12px] text-muted">{hits.size ? `${hits.size} rubrique${hits.size > 1 ? "s" : ""} en parle${hits.size > 1 ? "nt" : ""}.` : "Aucune rubrique ne contient ces mots."}</p>}
          </div>
          <div className="wiki-bob hidden shrink-0 md:block"><Robot size={164} mood="happy" /></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {QUICK.map((t) => (
            <button key={t.to} type="button" onClick={() => go(t.to)} className="wiki-lift flex items-center gap-3 rounded-[14px] border border-line bg-white p-3 text-left">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${TINTS[t.tint]}`}><t.icon size={20} strokeWidth={1.9} /></span>
              <span className="min-w-0"><span className="block text-[13px] font-semibold leading-tight">{t.title}</span><span className="mt-0.5 hidden text-[11px] leading-snug text-muted sm:block">{t.text}</span></span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Sommaire sur téléphone et tablette : une barre qui reste en haut ── */}
      <div className="sticky top-16 z-20 -mx-4 mt-3 border-b border-line bg-bg px-4 py-2 md:-mx-8 md:px-8 xl:hidden">
        <div ref={chips} className="no-scrollbar relative flex gap-1.5 overflow-x-auto">
          {ITEMS.filter((i) => shown(i.id)).map((i) => (
            <a key={i.id} data-chip={i.id} href={`#${i.id}`} onClick={(e) => { e.preventDefault(); go(i.id); }} aria-current={active === i.id ? "true" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${active === i.id ? "bg-primary text-white" : "bg-white text-muted ring-1 ring-line"}`}>
              <i.icon size={13} />{i.label}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        {/* ── Sommaire sur grand écran ── */}
        <nav aria-label="Sommaire" className="hidden xl:sticky xl:top-20 xl:col-span-3 xl:block xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <div className="card !p-3">
            {NAV.map((g) => (
              <div key={g.group} className="mb-2 last:mb-0">
                <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{g.group}</div>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.id}>
                      <a href={`#${i.id}`} onClick={(e) => { e.preventDefault(); go(i.id); }} aria-current={active === i.id ? "true" : undefined}
                        className={`flex items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-[13px] font-medium transition-colors ${active === i.id ? "bg-primary-soft text-primary" : "text-muted hover:bg-slate-50 hover:text-ink"} ${shown(i.id) ? "" : "opacity-40"}`}>
                        <i.icon size={15} className="shrink-0" /><span className="truncate">{i.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-4 xl:col-span-9">
          {hits && hits.size === 0 && (
            <div className="card flex flex-col items-center gap-2 px-5 py-10 text-center">
              <Robot size={88} mood="think" />
              <p className="text-[14px] font-semibold">Rien trouvé pour « {q} »</p>
              <p className="max-w-[360px] text-[13px] text-muted">Essayez un mot plus court, ou parcourez le sommaire.</p>
              <Button variant="secondary" onClick={() => search("")}>Tout afficher</Button>
            </div>
          )}

          {/* ════════ Débuter ════════ */}
          <Sec id="demarrer" title="L’essentiel en une minute" brief="Deux moteurs qui se nourrissent : la bourse et votre ville.">
            <p>Vous commencez avec <b>{eur(STARTING_CASH)}</b> et une petite ville de <b>{num(STARTING_POPULATION)} habitants</b>. Le but : bâtir un empire économique en investissant sur les vrais marchés et en développant votre ville.</p>
            <LoopDiagram />
            <p className="mt-3">La <b>bourse</b> est risquée et peut rapporter gros ; la <b>ville</b> rapporte moins, mais tous les jours. Les deux sont liées : la ville fixe le levier de vos achats, et vos placements produisent le capital qui fait grandir la ville. Sans l’une, l’autre finit par caler.</p>
            <Facts items={[
              { label: "Argent de départ", value: eur(STARTING_CASH) },
              { label: "Ville de départ", value: `${num(STARTING_POPULATION)} hab.` },
              { label: "Un jour de ville", value: `${DAY_LENGTH_MINUTES} min`, sub: "de temps réel" },
              { label: "Capital produit", value: `${pct(CAPITAL.dayRate)} / jour`, sub: "de vos placements", tint: "violet" },
            ]} />
            <Callout tone="info" title="Le jeu ne conseille jamais.">Il ne vous dira pas d’acheter ou de vendre, et il n’invente aucun événement boursier : les cours et les actualités sont réels, c’est vous qui décidez.</Callout>
            <H3>Tic, votre guide</H3>
            <p>Tic vous accompagne au début, vous accueille au retour d’une absence et fête vos réussites. Il reste toujours disponible en bas de l’écran : une fois les premières étapes passées, il indique les gestes les plus utiles du moment. Vous pouvez le replier, il ne disparaît pas.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {([["happy", "Il vous guide"], ["think", "Il signale un souci"], ["cheer", "Il fête une réussite"]] as const).map(([mood, label]) => (
                <figure key={mood} className="wiki-lift flex w-[132px] flex-col items-center rounded-[14px] border border-line bg-slate-50 px-3 pb-2.5 pt-3">
                  <Robot size={92} mood={mood} />
                  <figcaption className="mt-1 text-center text-[11px] font-medium text-muted">{label}</figcaption>
                </figure>
              ))}
            </div>
            {tutorialDone && <Button variant="secondary" onClick={reopen} className="mt-3">Revoir les étapes de démarrage</Button>}
          </Sec>

          <Sec id="jouer" brief="Les premiers gestes dans l’ordre, puis ce qu’il faut regarder à chaque visite.">
            <p>Vous avez deux sources d’argent : la <b>bourse</b> (vous achetez des actifs réels et les revendez plus cher… ou moins cher) et la <b>ville</b> (elle verse un revenu à chaque jour de jeu). L’argent gagné d’un côté sert à grossir de l’autre.</p>
            <H3>Vos premières minutes</H3>
            <Steps items={GUIDE.map((g) => ({ title: g.title, text: g.text, extra: <Link href={g.href} className="mt-1 inline-block whitespace-nowrap text-[12px] font-semibold text-primary hover:underline">{g.cta} →</Link> }))} />
            <H3>Ensuite, à chaque visite</H3>
            <Steps items={[
              { title: "Regardez la page Économie", text: "Votre argent, ce que la ville rapporte par jour, la valeur de votre portefeuille." },
              { title: "Réglez les soucis de la ville", text: <>Sous la barre « Satisfaction », chaque ligne rouge est un problème à corriger (voir <Jump to="soucis">Que faire si…</Jump>).</> },
              { title: "Faites grandir la ville", text: "Des logements pour accueillir des habitants, puis des emplois pour qu’ils travaillent, puis l’énergie et la nourriture qu’ils consomment." },
              { title: "Gardez une part en bourse", text: <>Vos placements produisent le <Jump to="capital">capital ◆</Jump> que les gros bâtiments demandent. Gardez aussi un peu d’argent : la ville peut coûter certains jours.</> },
              { title: "Visez le prochain palier", text: <>Les Objectifs versent des subventions, et chaque <Jump to="progression">rang de ville</Jump> ouvre de nouvelles fonctions.</> },
            ]} />
            <Callout tone="tip" title="Pas de fin, pas de défaite.">Votre <b>patrimoine</b> (argent + portefeuille + valeur de la ville) vous classe face aux autres joueurs dans Monde.</Callout>
          </Sec>

          <Sec id="pages" brief="À quoi sert chaque page, et ce que vous y faites.">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {PAGES.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className="wiki-lift flex h-full gap-3 rounded-[14px] border border-line bg-white p-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-primary-soft text-primary"><p.icon size={19} strokeWidth={1.9} /></span>
                    <span className="min-w-0"><span className="block text-[14px] font-semibold text-ink">{p.name}</span><span className="block text-[12px] leading-snug text-muted">{p.what}</span><span className="mt-1 block text-[12px] leading-snug"><b className="font-semibold">Vous y faites : </b>{p.todo}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <H3>Dans la Ville, la barre d’outils</H3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {([
                [Hammer, "Construire", "La liste des bâtiments. Chaque étiquette dit ce que le bâtiment apporte."],
                [Move, "Déplacer", "Changer un bâtiment de place. C’est gratuit."],
                [Trash2, "Démolir", `Retirer un bâtiment : ${pct(DEMOLISH_REFUND)} de son prix vous est rendu.`],
                [Target, "Objectifs", "Les paliers et leurs subventions, le territoire à agrandir, puis l’orientation et les grands projets."],
                [Handshake, "Entreprises", "Faire ouvrir dans votre ville le site d’une entreprise dont vous êtes actionnaire."],
                [LayoutList, "Bâtiments", "La liste de tout ce que vous avez construit."],
                [BarChart3, "Stats", "Les chiffres de la ville (sur téléphone ; sur grand écran ils sont toujours affichés)."],
                [Ellipsis, "Options", "Renommer la ville, relire les règles, recommencer la partie."],
              ] as [LucideIcon, string, string][]).map(([Icon, name, text]) => (
                <li key={name} className="flex gap-2.5 rounded-[12px] bg-slate-50 p-2.5"><Icon size={16} className="mt-0.5 shrink-0 text-primary" /><span className="min-w-0"><b className="font-semibold">{name}.</b> <span className="text-muted">{text}</span></span></li>
              ))}
            </ul>
            <H3>Dans Monde, les onglets</H3>
            <Points items={[
              <><b>Carte</b> : les pays, leurs villes, et le bouton pour déménager ou visiter une ville.</>,
              <><b>Commerce</b> : les contrats d’énergie et de nourriture entre joueurs (voir <Jump to="commerce">Commerce</Jump>).</>,
              <><b>Bourse</b> : acheter des parts de la ville d’un autre joueur, ou vendre les vôtres (voir <Jump to="bourse-villes">Bourse des villes</Jump>).</>,
              <><b>Alliances</b> : fonder ou rejoindre une alliance, verser à la caisse, lancer un blocus (voir <Jump to="alliances">Alliances</Jump>).</>,
              <><b>Classement</b> : par patrimoine, population, performance en bourse, ou par pays.</>,
            ]} />
          </Sec>

          <Sec id="chiffres" brief="Ce que veut dire chaque nombre affiché à l’écran.">
            <Table head={["Ce que vous voyez", "Où", "Ce que ça veut dire"]} rows={[
              ["Satisfaction 82 %", "Ville", "Le moral des habitants. Elle part de 95 %. Plus elle est haute, plus les impôts rentrent et plus vite la population grandit."],
              ["Pollution −12 pts (en rouge)", "Ville, sous la barre Satisfaction", "Ce problème retire 12 points de satisfaction. Chômage, Vétusté, Manque d’énergie… se lisent de la même façon."],
              ["pollution +40 / pollution −25", "Étiquette d’un bâtiment", "Ce que le bâtiment émet (+) ou absorbe (−) par jour. Si le total de la ville est positif, la satisfaction baisse."],
              ["+100 ou −30 avec un éclair", "Étiquette d’un bâtiment", "L’énergie produite (+) ou consommée (−) par jour. Même chose avec l’épi pour la nourriture."],
              ["+240 €/j", "Étiquette d’un bâtiment", "Le revenu par jour quand tous ses emplois sont pourvus. Avec la moitié des postes occupés, il rapporte la moitié."],
              ["12 ◆", "Prix d’un bâtiment, Portefeuille", "Du capital : la monnaie que vos placements produisent, demandée par les gros bâtiments."],
              ["×2", "Banque de la ville, achat en bourse", "Le levier : votre mise est multipliée par ce nombre."],
              ["Croissance +12", "Ville", "Le nombre d’habitants qui arriveront au prochain jour."],
              ["Jour 14 · prochain jour dans 23 min", "En haut de l’écran", "Le temps de la ville. À chaque nouveau jour, elle encaisse son revenu."],
              ["Réel / Fictif", "À côté d’un prix", "Réel : le vrai cours de marché. Fictif : aucune source gratuite pour cet actif, le prix est simulé par le jeu."],
              ["PRU", "Portefeuille", "Prix de revient unitaire : le prix moyen auquel vous avez acheté."],
              ["Plus-value", "Portefeuille", "Ce que vous gagneriez (vert) ou perdriez (rouge) en vendant maintenant, par rapport au prix d’achat."],
            ]} />
            <Callout tone="info" title="Vos actions ne bougent pas ?">La bourse est fermée. Les actions ne cotent ni la nuit ni le week-end : leur cours reste figé jusqu’à la réouverture, même si les jours de la ville continuent de passer. Seules les cryptomonnaies bougent jour et nuit.</Callout>
          </Sec>

          <Sec id="soucis" brief="Ouvrez la ligne qui vous concerne : la cause, puis la solution.">
            <H3>Dans la ville</H3>
            <Accordion items={[
              { q: "Chômage", tone: "bad", why: "Plus d’habitants qui cherchent un emploi que de postes.", fix: "Construire des commerces, des services ou des usines." },
              { q: "Logements saturés", why: "Presque plus un logement libre : personne ne peut s’installer.", fix: "Construire des logements." },
              { q: "Manque d’énergie", tone: "bad", why: "La ville consomme plus qu’elle ne produit ; le manque est importé au prix fort.", fix: "Construire une centrale, un parc solaire ou éolien." },
              { q: "Manque de nourriture", tone: "bad", why: "La ville mange plus qu’elle ne produit ; le manque est importé au prix fort.", fix: "Construire une exploitation, des serres ou un élevage." },
              { q: "Pollution", why: "Usines et centrales émettent plus que la ville n’absorbe.", fix: "Construire des parcs, un écoquartier, un centre de recyclage ou des exploitations agricoles." },
              { q: "Vétusté", why: "Les bâtiments vieillissent à partir du rang « Bourg ».", fix: "Lancer une rénovation dans la Ville. Les Ateliers municipaux ralentissent l’usure." },
              { q: `${SERVICE_IDS.map((id) => SERVICES[id].label).join(", ")}`, why: "La ville est assez grande pour attendre cet équipement public.", fix: `Construire l’équipement correspondant (catégorie ${CATEGORY_LABELS.public}).` },
              { q: "La population ne grandit plus", why: "Il n’y a plus de logement libre, ou trop peu d’emplois et de satisfaction.", fix: "D’abord des logements, puis des emplois." },
              { q: "Le revenu de la ville est négatif", tone: "bad", why: "L’entretien et les importations dépassent les impôts et les revenus.", fix: "Pourvoir les emplois vides (il faut des habitants), produire votre énergie et votre nourriture." },
              { q: "Je ne peux pas construire un gros bâtiment", why: `À partir de ${compactEur(CAPITAL.fromCost)}, un bâtiment demande du capital ◆ en plus de l’argent.`, fix: <>Garder des placements en bourse : ce sont eux qui produisent le capital (voir <Jump to="capital">Le capital ◆</Jump>).</> },
              { q: "Plus de place sur la carte", why: "Tous les carreaux constructibles de votre territoire sont occupés.", fix: <>Acheter l’agrandissement suivant dans la Ville, bouton Objectifs (voir <Jump to="progression">Rangs et objectifs</Jump>). S’il demande un rang plus haut, améliorer ou remplacer des bâtiments en attendant.</> },
              { q: "Un site d’entreprise est en sommeil", why: "Vous avez vendu une partie des actions de cette entreprise : vous êtes passé sous la participation de départ.", fix: "Racheter des actions jusqu’à retrouver la participation de départ." },
            ]} />
            <H3>En bourse</H3>
            <Accordion items={[
              { q: "Le portefeuille ne bouge pas", tone: "info", why: "Bourse fermée (nuit, week-end).", fix: "Attendre la réouverture ; les cours sont relus chaque heure." },
              { q: "Une ligne a disparu : « vendue d’office »", tone: "bad", why: `Avec le levier, la baisse a mangé presque toute la mise : il n’en restait que ${pct(LEVERAGE.liquidation)}.`, fix: <>Rien à rattraper, mais vous n’avez pas perdu plus que la mise. Pour comprendre à quelle baisse cela arrive, essayez la <Jump to="levier">simulation du levier</Jump>.</> },
              { q: "Je ne peux plus acheter", why: "La mise totale permise par votre Banque est atteinte.", fix: "Agrandir la Banque (page Portefeuille) ou vendre une ligne." },
              { q: "Un marché est verrouillé", tone: "info", why: "Seules les actions américaines sont ouvertes au départ.", fix: <>Ouvrir le marché dans la <Jump to="recherche">Recherche</Jump>.</> },
            ]} />
          </Sec>

          <Sec id="temps" brief="La ville va vite, la bourse suit le temps réel.">
            <Facts cols={3} items={[
              { label: "1 jour de ville", value: `${DAY_LENGTH_MINUTES} min réelles`, sub: "la ville encaisse son flux net" },
              { label: "1 journée réelle", value: `${fr(daysPerRealDay)} jours de ville` },
              { label: "Absence rattrapée", value: `${num(MAX_CATCHUP_DAYS)} jours de ville`, sub: `soit ${fr(Math.round(MAX_CATCHUP_DAYS / daysPerRealDay))} jours réels au plus` },
            ]} />
            <Points items={[
              <>À chaque <b>jour de ville</b>, la ville encaisse son flux net, sa population évolue et vos placements produisent du capital.</>,
              <>La bourse suit le <b>temps réel</b> : les cours sont relus toutes les heures. Quand les marchés sont fermés (nuit, week-end), les actions ne bougent pas ; les cryptomonnaies, si.</>,
              <>En votre absence la ville continue : à votre retour, les jours passés sont rattrapés d’un coup et un journal résume ce qui s’est passé.</>,
              <>Une fois par semaine réelle, un <Jump to="evenements">événement</Jump> peut toucher la ville.</>,
            ]} />
          </Sec>

          <Sec id="compte" brief="Comment la partie est enregistrée, et comment la retrouver sur un autre appareil.">
            <Points items={[
              <><b>Connexion</b> : sur le site, le jeu se joue avec un compte Discord. Le jeu ne reçoit que votre pseudo et votre avatar, jamais votre mot de passe. À la première connexion, vous donnez un nom à votre ville et le compte de jeu est créé.</>,
              <><b>Sauvegarde automatique</b> : la partie est enregistrée en ligne toute seule, au plus une fois toutes les {MIN_GAP / 60_000} minutes, et une dernière fois quand vous quittez la page. Rien à faire.</>,
              <><b>Plusieurs appareils</b> : connectez-vous avec le même compte Discord, votre partie suit. Si vous avez joué ailleurs entre-temps, c’est la partie enregistrée le plus récemment qui est reprise.</>,
              <><b>Installer l’appli</b> : sur téléphone comme sur ordinateur, le jeu peut s’installer comme une appli, avec son icône et en plein écran. Utilisez le bouton « Installer l’appli » (menu de gauche sur ordinateur, bouton « Plus » sur téléphone). Sur iPhone : bouton Partager de Safari, puis « Sur l’écran d’accueil ». L’appli se met à jour toute seule et demande une connexion internet.</>,
              <><b>Se déconnecter</b> : dans le menu du compte, en haut à droite. La partie reste aussi sur l’appareil.</>,
              <><b>Recommencer la partie</b> : dans la Ville, bouton « Options », tout en bas. Tout est effacé, il faut confirmer.</>,
              <><b>Supprimer mon compte</b> : dans le menu du compte. Le compte et la sauvegarde en ligne sont effacés pour de bon.</>,
            ]} />
            <Callout tone="tip" title="Conseil.">Évitez de laisser le jeu ouvert sur deux appareils en même temps : fermez l’un avant de jouer sur l’autre, pour ne pas reprendre une partie plus ancienne.</Callout>
            <Callout tone="info" title="Ce que les autres voient de vous.">Votre pseudo Discord, le nom de votre ville, votre patrimoine, votre population et votre performance en bourse. Rien d’autre.</Callout>
          </Sec>

          {/* ════════ Bourse ════════ */}
          <Sec id="bourse" title="Investir en bourse" brief="De vrais cours, des ordres en euros, une seule façon d’acheter.">
            <Steps items={[
              { title: "Choisissez un actif dans Marchés", text: "Chaque ligne montre le cours et sa courbe. « Réel » : le vrai cours de marché. « Fictif » : pas de source gratuite, le prix est simulé." },
              { title: "Tapez votre mise en euros", text: "Le jeu calcule le nombre de titres, fractions comprises. Pas besoin de pouvoir payer une action entière." },
              { title: "La Banque de la ville multiplie la mise", text: <>Chaque achat passe par le <Jump to="levier">levier</Jump> de votre ville : vous mettez la mise, la Banque prête le reste.</> },
              { title: "Suivez la ligne dans Portefeuille", text: "Vous voyez ce qu’elle gagne ou perd depuis l’achat, et vous vendez quand vous le décidez, en tout ou en partie." },
            ]} />
            <Facts cols={3} items={[
              { label: "Frais de courtage", value: pct(TRADE_FEE_RATE, 2), sub: `du montant investi, ${eur(TRADE_FEE_MIN)} au minimum, à l’achat comme à la vente` },
              { label: "Capital produit", value: `${pct(CAPITAL.dayRate)} / jour`, sub: "de la valeur de vos placements", tint: "violet" },
              { label: "Intérêts du prêt", value: `${pct(LEVERAGE.dayRate, 2)} / jour`, sub: "sur ce que la Banque a prêté" },
            ]} />
            <H3>Quels marchés ?</H3>
            <p>Les marchés s’ouvrent par la <Jump to="recherche">Recherche</Jump> : actions américaines au départ, puis Europe, Asie, cryptomonnaies, ETF, matières premières.</p>
            <H3>Trois façons de payer moins de frais</H3>
            <Points items={[
              "Installer votre ville dans un pays à spécialité Finance.",
              <>Ouvrir un bureau dans une place financière : frais × {fr(HUB_FEE_FACTOR)} sur les actifs qu’elle couvre.</>,
              "Bâtir le grand projet « Bourse de la ville ».",
            ]} />
            <Table head={["Place financière", "Actifs couverts", "Bureau"]} rows={HUBS.map((h) => [h.name, h.covers, `${compactEur(HUB_DESK_COST)} (offert si votre ville est dans ce pays)`])} />
          </Sec>

          <Sec id="levier" brief="La Banque de votre ville multiplie chaque achat : les gains comme les pertes.">
            <p>Il n’y a <b>qu’une seule façon d’investir</b> : chaque achat est multiplié par le levier de votre ville. Vous mettez la mise, la Banque prête le reste. Les cours restent ceux du vrai marché ; c’est votre exposition qui est multipliée.</p>
            <LeverageDemo />
            <Points items={[
              <>Vous ne pouvez <b>jamais perdre plus que votre mise</b> : une ligne est vendue d’office quand il n’en reste que {pct(LEVERAGE.liquidation)}.</>,
              <>La somme prêtée coûte des <b>intérêts</b> : {pct(LEVERAGE.dayRate, 2)} par jour de ville, pris sur vos liquidités.</>,
              <>Les cryptomonnaies, plus instables, sont limitées à un levier ×{LEVERAGE.maxByKind.crypto}.</>,
            ]} />
            <H3>Les niveaux de la Banque</H3>
            <p>La Banque s’agrandit depuis la page Portefeuille, avec les liquidités de la ville. Son niveau fixe le levier et la mise totale que vous pouvez placer.</p>
            <Table head={["Niveau", "Levier", "Mise maximale", "Prix", "À partir du rang"]} rows={BANK.map((b, i) => [String(i + 1), `×${fr(b.lev)}`, Number.isFinite(b.cap) ? compactEur(b.cap) : "Illimitée", b.cost ? compactEur(b.cost) : "Offert", CITY_RANKS[b.minRank].name])} />
            <Callout tone="warn" title="Plus de levier, plus de risque.">Au niveau le plus haut, une baisse de {pct((1 - LEVERAGE.liquidation) / BANK[BANK.length - 1].lev)} suffit à faire vendre la ligne d’office.</Callout>
          </Sec>

          <Sec id="capital" brief="La monnaie que seuls vos placements produisent, et que les gros bâtiments demandent.">
            <p>Le capital ◆ est le lien entre la bourse et la ville. Chaque jour de ville, vos placements en produisent <b>{pct(CAPITAL.dayRate)} de ce qu’ils valent</b>. Tout bâtiment à partir de <b>{compactEur(CAPITAL.fromCost)}</b> en demande <b>{pct(CAPITAL.share)} de son prix</b>, en plus des liquidités.</p>
            <CapitalDemo />
            <Points items={[
              "Sans bourse, la ville ne grandit donc plus au-delà des petits bâtiments.",
              "N’importe quel actif en produit, au prorata de ce que vaut la ligne : le jeu ne vous dit jamais lequel acheter.",
              <>Le <b>Quartier d’affaires</b> augmente la production de capital (jusqu’à +{Math.round(CITY_EFFECT_CAPS.capitalBoost * 100)} %).</>,
              "Le capital ne se vend pas et ne s’achète pas : il s’accumule, puis se dépense en construisant.",
            ]} />
          </Sec>

          <Sec id="recherche" brief="Elle ouvre des marchés et des outils, et améliore la ville, la Banque et le commerce.">
            <p>Chaque recherche se paie une fois, avec vos liquidités, et reste acquise. Certaines en demandent d’autres avant. Aucune ne touche aux cours de bourse : ils restent ceux du vrai marché.</p>
            <Table head={["Branche", "Recherche", "Prix", "Après", "Ce qu’elle apporte"]}
              rows={RESEARCH.filter((n) => n.id !== "hq").map((n) => [
                <span key="b" className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BRANCH_COLOR[n.branch] }} />{n.branch}</span>,
                n.name, n.cost ? compactEur(n.cost) : "départ", n.requires.filter((r) => r !== "hq").map((r) => RESEARCH_BY_ID[r].name).join(", "), n.description,
              ])} />
          </Sec>

          {/* ════════ Ville ════════ */}
          <Sec id="ville" title="Ville : ce qu’elle gagne, ce qu’elle coûte" brief="Le flux net de la journée, c’est ce qui rentre moins ce qui sort.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[14px] border border-emerald-200 bg-success-soft/60 p-3.5">
                <div className="text-[13px] font-bold text-emerald-700">Ce qui rentre</div>
                <Points items={[
                  <><b>Impôts</b> : {fr(TAX_PER_RESIDENT)} € par habitant et par jour, réduits quand la satisfaction baisse ou que le chômage monte.</>,
                  <><b>Bâtiments</b> : chacun rapporte son revenu au prorata des postes pourvus. {pct(ACTIVE_RATIO)} des habitants cherchent un emploi.</>,
                  <><b>Dotation de l’État</b> : {eur(START_GRANT.perDay)} par jour au départ. Elle diminue quand la ville grandit et disparaît à {num(START_GRANT.untilPop)} habitants.</>,
                  <><b>Exportations</b> : le surplus d’énergie et de nourriture se vend à {pct(EXPORT_RATIO)} du prix plein.</>,
                  <><b>Tourisme, dividendes, contrats</b> : selon vos bâtiments et ce que vous faites dans Monde.</>,
                ]} />
              </div>
              <div className="rounded-[14px] border border-red-200 bg-danger-soft/60 p-3.5">
                <div className="text-[13px] font-bold text-red-700">Ce qui sort</div>
                <Points items={[
                  <><b>Entretien</b> : {pct(MAINTENANCE_RATE, 2)} du prix de chaque bâtiment par jour. La vétusté l’alourdit.</>,
                  <><b>Importations</b> : ce qui manque est acheté au prix plein ({fr(RESOURCE_PRICES.energy)} € l’énergie, {fr(RESOURCE_PRICES.food)} € la nourriture).</>,
                  <><b>Intérêts</b> : sur ce que la Banque vous a prêté pour vos achats en bourse.</>,
                  <><b>Dividendes et tribut</b> : si vous avez vendu des parts de votre ville.</>,
                ]} />
              </div>
            </div>
            <H3>Les habitants</H3>
            <Points items={[
              <>Chaque habitant consomme <b>{fr(ENERGY_PER_RESIDENT)} énergie</b> et <b>{fr(FOOD_PER_RESIDENT)} nourriture</b> par jour.</>,
              "De nouveaux habitants arrivent tant qu’il y a des logements libres, plus vite s’il y a des postes vacants et une bonne satisfaction.",
            ]} />
            <H3>Construire vite</H3>
            <Points items={[
              "« Auto ×1 » et « Auto ×5 », en mode placement, posent les bâtiments tout seuls.",
              "« Copier », sur un bâtiment existant, en pose un autre identique.",
              "« Annuler » défait la dernière action.",
              <>Démolir rembourse {pct(DEMOLISH_REFUND)} du prix. Déplacer est gratuit.</>,
            ]} />
          </Sec>

          <Sec id="batiments" brief="Tous les bâtiments en images, avec ce qu’ils apportent. Filtrez par catégorie ou cherchez un nom.">
            <BuildingGallery population={population} />
            <H3>La taille des bâtiments</H3>
            <p>Un petit bâtiment tient sur un carreau. Les plus gros en occupent davantage : l’étiquette sombre de chaque fiche le dit.</p>
            <Facts cols={3} items={[
              { label: "1 carreau", value: `${BUILDINGS.filter((b) => b.buildable !== false && !b.size).length} bâtiments`, sub: "petit quartier, commerce, parc…" },
              { label: "2 × 2 carreaux", value: `${BUILDINGS.filter((b) => b.size === 2).length} bâtiments`, sub: "grand quartier, usine moyenne, hôpital…" },
              { label: "3 × 3 carreaux", value: `${BUILDINGS.filter((b) => b.size === 3).length} bâtiments`, sub: "un pâté de maisons entier : stade, aéroport…" },
            ]} />
            <Points items={[
              "Un bâtiment ne peut pas être à cheval sur une route : il lui faut un carré libre entre les routes.",
              "En construction, le carré vert montre la place qu’il prendra : le carreau visé en est un angle.",
              "Les gros bâtiments remplissent la carte plus vite : pensez à agrandir le territoire.",
              "Les bâtiments posés avant cette règle gardent leur carreau unique.",
            ]} />
            <Callout tone="tip" title="Améliorer sur place.">Avec la recherche « Rénovation urbaine », un bâtiment se transforme en sa version supérieure : vous ne payez que la différence de prix. Si la nouvelle version est plus grande, il lui faut de la place libre autour.</Callout>
            <H3>Les effets spéciaux (étiquettes violettes)</H3>
            <Points items={[
              <><b>Tourisme</b> (Musée, Hôtel, Stade, Parc d’attractions) : leur revenu est multiplié par l’<b>attrait</b> de la ville, de {fr(TOURISM.min)} à {fr(TOURISM.max)}. Ce sont des commerces : la spécialité « Commerce et tourisme » d’un pays s’y applique.</>,
              <><b>Visiteurs</b> (Gare, Aéroport régional) : ils augmentent encore les revenus du tourisme, jusqu’à +{Math.round(CITY_EFFECT_CAPS.visitors * 100)} %. La Gare fait aussi venir plus de nouveaux habitants (jusqu’à +{Math.round(CITY_EFFECT_CAPS.growthBoost * 100)} %).</>,
              <><b>Port de commerce</b> : vos surplus s’exportent plus cher, jusqu’à +{Math.round(CITY_EFFECT_CAPS.exportBonus * 100)} points, soit {Math.round((EXPORT_RATIO + CITY_EFFECT_CAPS.exportBonus) * 100)} % du prix plein.</>,
              <><b>Ateliers municipaux</b> : la vétusté avance moins vite (jusqu’à −{Math.round(CITY_EFFECT_CAPS.wearCut * 100)} %).</>,
              <><b>Quartier d’affaires</b> : vos placements produisent plus de capital (jusqu’à +{Math.round(CITY_EFFECT_CAPS.capitalBoost * 100)} %).</>,
              <><b>Culture et loisirs</b> (Musée, Stade, Parc d’attractions) : des points de satisfaction en plus (jusqu’à +{Math.round(CITY_EFFECT_CAPS.joy * 100)}).</>,
              <><b>Centre de recyclage</b> et <b>Commissariat</b> : une autre façon d’absorber la pollution et de couvrir la sécurité.</>,
            ]} />
            <Callout tone="warn" title="Chaque effet a un plafond.">Empiler dix fois le même bâtiment ne sert à rien une fois le plafond atteint.</Callout>
            <H3>L’attrait touristique</H3>
            <p>L’attrait vaut 1 pour une satisfaction de 75 % sans pollution. Une ville agréable et propre gagne plus ; une ville polluée fait fuir les touristes.</p>
            <TourismDemo />
          </Sec>

          <Sec id="equipements" brief="La satisfaction part de 95 %. Chaque point perdu réduit les impôts et ralentit les arrivées.">
            <H3>Les équipements publics</H3>
            <p>En grandissant, la ville attend des équipements. Tant qu’ils manquent, la satisfaction baisse.</p>
            <Table head={["Besoin", "Attendu à partir de", "Satisfaction perdue sans équipement", "Bâtiments"]}
              rows={SERVICE_IDS.map((id) => [SERVICES[id].label, `${num(SERVICES[id].needPop)} habitants`, `${pct(SERVICES[id].weight)} (+${pct(NEED_PER_RANK)} par rang de ville)`,
                BUILDINGS.filter((b) => b.service === id).map((b) => `${b.name} (${num(b.serves ?? 0)} hab.)`).join(", ")])} />
            <H3>Les autres tensions</H3>
            <Facts items={[
              { label: "Pollution", value: `jusqu’à −${pct(POLLUTION_MAX)}`, sub: "usines et centrales émettent ; parcs, écoquartiers, exploitations absorbent", tint: "rose" },
              { label: "Logements saturés", value: "−5 %", sub: "presque plus un logement libre", tint: "amber" },
              { label: "Manque d’énergie", value: "−8 %", sub: "même pénalité pour la nourriture", tint: "amber" },
              { label: "Chômage", value: "variable", sub: "plus il y a de chômeurs, plus la pénalité est forte", tint: "amber" },
            ]} />
            <H3>La vétusté</H3>
            <Points items={[
              <>Elle monte de {pct(WEAR_PER_DAY, 1)} par jour à partir du rang « Bourg ». À 100 %, l’entretien est doublé.</>,
              <>Une <b>rénovation</b> la remet à zéro. Prix : {pct(RENOVATE_RATE)} de la valeur des bâtiments × la vétusté. Rénover tôt coûte donc moins cher.</>,
            ]} />
          </Sec>

          <Sec id="progression" title="Rangs, territoire, objectifs et grands projets" brief="La population fait monter le rang, et chaque rang ouvre quelque chose.">
            <RankTrack current={rank} />
            <H3>Ce qui s’ouvre avec les rangs</H3>
            <Table head={["Fonction", "À partir du rang", "À quoi ça sert"]} rows={FEATURES.map((f) => [f.label, CITY_RANKS[f.rank].name, f.text])} />
            <H3>Orientation de la ville</H3>
            <p>À partir du rang « {CITY_RANKS[ORIENTATION_MIN_RANK].name} », la ville choisit une orientation, une seule à la fois. Le premier choix est gratuit ; en changer coûte {compactEur(ORIENTATION_CHANGE_COST)} × le rang de la ville.</p>
            <Table head={["Orientation", "Avantage", "Revers"]} rows={ORIENTATIONS.map((o) => [o.name, o.pro, o.con])} />
            <H3>Territoire</H3>
            <p>La ville démarre sur une petite carte. Quand le terrain est plein, on ne peut plus construire : il faut acheter l’agrandissement suivant (Ville, bouton Objectifs), qui ajoute 4 carreaux de chaque côté. Le territoire acheté compte dans le patrimoine.</p>
            <Table head={["Carte", "Prix", "Rang requis"]} rows={TERRITORY.map((t) => [`${t.size} × ${t.size} carreaux`, t.cost ? compactEur(t.cost) : "départ", CITY_RANKS[t.minRank].name])} />
            <H3>Objectifs (subvention versée une fois)</H3>
            <Table head={["Objectif", "Condition", "Subvention"]} rows={GOALS.map((g) => [g.label, g.minPop ? `avec au moins ${num(g.minPop)} habitants` : "", compactEur(g.reward)])} />
            <H3>Grands projets (comptés dans le patrimoine)</H3>
            <Table head={["Projet", "Prix", "Rang requis", "Avantage", "Prestige"]} rows={PROJECTS.map((p) => [p.name, compactEur(p.cost), CITY_RANKS[p.minRank].name, p.description, `+${num(p.prestige)}`])} />
          </Sec>

          <Sec id="entreprises" brief="Une entreprise dont vous êtes actionnaire peut ouvrir un site dans votre ville.">
            <Facts cols={3} items={[
              { label: "Participation demandée", value: compactEur(BRANCH_MIN_VALUE), sub: "d’actions de l’entreprise" },
              { label: "Premier site", value: compactEur(BRANCH_COST), sub: `puis ${compactEur(BRANCH_COST * 2)}, ${compactEur(BRANCH_COST * 3)}…` },
              { label: "Nombre de sites", value: "1 par rang", sub: "un de plus à chaque rang de ville" },
            ]} />
            <Points items={[
              "Le bâtiment de l’entreprise apparaît sur la carte de la ville, avec son logo.",
              <>Le site tourne tant que vous gardez la participation de départ, <b>quel que soit le cours</b>. Si vous vendez en dessous, il passe en sommeil.</>,
            ]} />
            <Table head={["Secteur de l’entreprise", "Site", "Emplois", "Revenu / j", "Autre effet"]}
              rows={(Object.keys(BRANCH_EFFECTS) as BranchFamily[]).map((f) => { const e = BRANCH_EFFECTS[f]; return [f, e.label, num(e.jobs), `${num(e.revenue)} €`, e.energyProd ? `+${num(e.energyProd)} énergie` : e.serves ? `soigne ${num(e.serves)} habitants` : ""]; })} />
          </Sec>

          <Sec id="evenements" title="Événements de ville" brief="Une fois par semaine, un coup de pouce, une catastrophe… ou rien.">
            <p>Le jeu regarde l’état de votre ville et décide s’il lui arrive quelque chose. Les événements ne touchent <b>que la ville</b>, jamais les cours de bourse.</p>
            <Facts items={[
              { label: "Fréquence", value: `${EVENTS.every} jours de ville`, sub: `soit ${fr(EVENTS.every / daysPerRealDay)} jours réels` },
              { label: "Durée des effets", value: `${EVENTS.duration} jours de ville`, sub: `soit ${fr(EVENTS.duration / daysPerRealDay)} jour réel` },
              { label: "Semaine calme", value: pct(EVENTS.quiet), sub: "de chances qu’il ne se passe rien" },
              { label: "Part de coups de pouce", value: `${pct(EVENTS.bonusBase)} à ${pct(EVENTS.bonusBase + EVENTS.bonusPerSatisfaction)}`, sub: "elle monte avec la satisfaction", tint: "green" },
            ]} />
            <Points items={[
              "Les chances dépendent de la ville : une ville polluée risque un pic de pollution, une ville mécontente une grève, une ville touristique a plus de chances d’avoir un festival.",
              <>Les équipements protègent : pompiers et commissariat atténuent tempêtes et inondations, l’hôpital les épidémies. Une couverture complète divise l’effet par {fr(1 / (1 - EVENTS.guardCut))}.</>,
            ]} />
            {(["bonus", "disaster"] as const).map((kind) => (
              <div key={kind} className="mt-5">
                <H3>{kind === "bonus" ? "Les coups de pouce" : "Les catastrophes"}</H3>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {CITY_EVENTS.filter((e) => e.kind === kind).map((e) => (
                    <li key={e.id} className={`wiki-lift rounded-[14px] border p-3 ${kind === "bonus" ? "border-emerald-200 bg-success-soft/50" : "border-amber-200 bg-amber-50/60"}`}>
                      <div className="text-[13px] font-semibold">{e.name}</div>
                      <p className="mt-0.5 text-[12px] leading-snug text-muted">{e.text}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Tag cls={kind === "bonus" ? "bg-white text-emerald-700 ring-1 ring-emerald-200" : "bg-white text-amber-800 ring-1 ring-amber-200"}><span className="whitespace-normal">{effectText(e)}</span></Tag>
                        {e.guard && <Tag cls="bg-white text-slate-700 ring-1 ring-line"><ShieldCheck size={11} />atténué par : {SERVICES[e.guard].label}</Tag>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Sec>

          {/* ════════ Monde ════════ */}
          <Sec id="monde" title="Monde, pays et classement" brief="Un pays est une région : vos voisins sont votre équipe.">
            <Points items={[
              <>Un pays accueille jusqu’à <b>{CITIES_PER_COUNTRY} villes</b>, et toutes profitent de sa spécialité. À l’arrivée, le jeu vous place dans un des pays les moins peuplés.</>,
              <>Vous pouvez <b>déménager</b> vers tout pays qui a encore de la place : la ville garde tous ses bâtiments et ses habitants, vous payez le prix du pays.</>,
              <>Depuis la carte ou le classement, vous pouvez <b>visiter</b> la ville d’un autre joueur.</>,
            ]} />
            <H3>Prix et spécialités</H3>
            <p>Quatre catégories de prix. Plus le pays est cher, plus sa spécialité est forte.</p>
            <Facts items={COUNTRY_PRICES.map((p, i) => ({ label: `Catégorie ${i + 1}`, value: compactEur(p), sub: `spécialité : ${pct(SPECIALTY_BONUS[i])}` }))} />
            <details className="group mt-3 rounded-[12px] border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-[13px] font-semibold hover:bg-slate-50 [&::-webkit-details-marker]:hidden">Voir les {PLAYABLE_IDS.length} pays et leur spécialité<span className="text-[12px] font-medium text-primary group-open:hidden">Afficher</span><span className="hidden text-[12px] font-medium text-primary group-open:inline">Masquer</span></summary>
              <div className="px-3 pb-3"><Table head={["Pays", "Prix", "Spécialité"]} rows={[...PLAYABLE_IDS].sort((a, b) => countryTier(b) - countryTier(a) || PLAYABLE[a].localeCompare(PLAYABLE[b], "fr")).map((id) => [PLAYABLE[id], compactEur(countryPrice(id)), specialtyText(id)])} /></div>
            </details>
            <H3>Le classement</H3>
            <Points items={[
              <>Quatre tris : <b>Patrimoine</b>, <b>Population</b>, <b>Bourse</b> (performance de vos placements) et <b>Pays</b> (le patrimoine de toutes les villes d’un pays, additionné).</>,
              `Il est mis à jour toutes les ${MIN_GAP / 60_000} minutes.`,
              "Une sauvegarde aux chiffres impossibles sort du classement : la ville reste sur la carte, mais n’est plus classée.",
            ]} />
          </Sec>

          <Sec id="commerce" title="Commerce entre joueurs" brief="Acheter par contrat le surplus d’énergie ou de nourriture d’une autre ville.">
            <p>Dans Monde › Commerce, un contrat arrange les deux côtés : l’acheteur paie moins qu’à l’import, le vendeur gagne plus qu’à l’export.</p>
            <Bars items={[
              { label: "Importer", note: "ce que paie une ville seule", value: 1, cls: "bg-danger" },
              { label: "Contrat", note: "payé par l’acheteur, touché par le vendeur", value: CONTRACT_RATIO, cls: "bg-primary" },
              { label: "Exporter", note: "ce que touche une ville seule", value: EXPORT_RATIO, cls: "bg-slate-400" },
            ]} />
            <Points items={[
              <>Jusqu’à <b>{MAX_CONTRACTS} contrats</b> d’achat. Chacun peut résilier à tout moment.</>,
              <>Le commerce s’ouvre avec le rang de la ville (voir <Jump to="progression">Rangs et objectifs</Jump>).</>,
              <>Entre alliés, les prix sont encore meilleurs (voir <Jump to="alliances">Alliances</Jump>). Un <Jump to="guerre">blocus</Jump> les dégrade.</>,
            ]} />
          </Sec>

          <Sec id="bourse-villes" brief="Investir dans la ville d’un autre joueur, ou vendre des parts de la vôtre.">
            <p>C’est séparé de la vraie bourse : rien n’y est inventé, tout vient des chiffres que les villes publient. L’argent ne sort jamais de nulle part : il passe toujours d’un joueur à l’autre.</p>
            <H3>Comment investir dans une ville</H3>
            <Steps items={[
              { title: "Atteignez le rang demandé", text: `La bourse des villes s’ouvre à ${num(SHARES.minPop)} habitants, pour acheter comme pour vendre.` },
              { title: "Ouvrez Monde › Bourse", text: "Vous y voyez les villes qui ont mis des parts en vente, leur prix et ce qu’elles versent par jour." },
              { title: "Choisissez une ville et un nombre de parts", text: "Le prix est payé directement à son propriétaire." },
              { title: "Touchez les dividendes", text: "Chaque jour de ville, tant que le propriétaire n’a pas racheté ses parts." },
            ]} />
            <ShareDemo />
            <H3>Les règles</H3>
            <Points items={[
              <>Une ville compte <b>{num(SHARES.total)} parts</b>. Le prix d’une part est le patrimoine de la ville divisé par {num(SHARES.total)} : il monte quand la ville s’enrichit.</>,
              "Chaque part verse un dividende quotidien : sa fraction du flux net de la ville (rien quand la ville perd de l’argent).",
              <>Vous pouvez détenir des parts de <b>{SHARES.maxLines} villes</b> différentes au plus.</>,
              "Vous ne revendez pas vos parts à un autre joueur : seul le propriétaire peut les racheter, au prix du jour.",
            ]} />
            <H3>Vendre des parts de votre ville</H3>
            <Points items={[
              "Vous levez de l’argent tout de suite : l’acheteur vous paie directement.",
              "En échange, vous versez les dividendes jusqu’à racheter vos parts au prix du jour.",
              <>Vous pouvez mettre en vente jusqu’à <b>{pct(SHARES.maxFloat / SHARES.total)}</b> de la ville : vous gardez toujours la majorité.</>,
            ]} />
            <Callout tone="warn" title="Attention au rachat hostile.">Un joueur qui détient {SHARES.raidFrom} de vos parts peut forcer la vente du reste (voir <Jump to="guerre">Guerre économique</Jump>).</Callout>
          </Sec>

          <Sec id="alliances" brief="Quelques villes qui mettent de l’argent en commun pour un bonus partagé.">
            <Facts items={[
              { label: "Fonder", value: compactEur(ALLIANCE.cost) },
              { label: "Membres", value: `${ALLIANCE.maxMembers} villes`, sub: "au plus" },
              { label: "Ouvert à partir de", value: `${num(ALLIANCE.minPop)} hab.` },
              { label: "Bonus par niveau", value: `+${pct(ALLIANCE.bonusPerLevel)}`, sub: "sur les revenus des bâtiments", tint: "green" },
            ]} />
            <Steps items={[
              { title: "Fondez ou rejoignez", text: "Dans Monde › Alliances. Une ville n’appartient qu’à une alliance à la fois." },
              { title: "Versez à la caisse commune", text: "Chaque membre peut y mettre de l’argent. Il ne se retire pas : il fait monter le niveau de l’alliance." },
              { title: "Profitez du bonus", text: "Chaque niveau augmente les revenus des bâtiments de tous les membres." },
            ]} />
            <Table head={["Niveau", "Caisse commune", "Bonus de revenus"]} rows={ALLIANCE.levels.map((n, i) => [String(i), i ? compactEur(n) : "Départ", `+${Math.round(i * ALLIANCE.bonusPerLevel * 100)} %`])} />
            <H3>Commerce entre alliés</H3>
            <Bars items={[
              { label: "Le vendeur touche", note: `au lieu de ${pct(CONTRACT_RATIO)}`, value: ALLIANCE.contract.sell, cls: "bg-success" },
              { label: "L’acheteur paie", note: `au lieu de ${pct(CONTRACT_RATIO)}`, value: ALLIANCE.contract.buy, cls: "bg-primary" },
            ]} />
            <Points items={[
              "Quitter une alliance est libre ; ce que vous avez versé reste dans sa caisse.",
              "Si le chef part, le membre qui a le plus versé le remplace.",
              "Deux villes d’une même alliance ne peuvent pas se racheter l’une l’autre.",
            ]} />
          </Sec>

          <Sec id="guerre" brief="Elle ne détruit rien : elle se joue sur l’argent, entre alliances et à la bourse des villes.">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[14px] border border-line p-3.5">
                <div className="flex items-center gap-2 text-[14px] font-semibold"><span className={`grid h-8 w-8 place-items-center rounded-[10px] ${TINTS.rose}`}><Swords size={16} /></span>Le blocus</div>
                <p className="mt-1 text-[12px] text-muted">Monde › Alliances, réservé au chef.</p>
                <Points items={[
                  <>Bloque le commerce d’une autre alliance pendant <b>{BLOCKADE.days} jours réels</b>.</>,
                  <>Coûte <b>{compactEur(BLOCKADE.cost)}</b> à la caisse commune, qui peut y perdre un niveau.</>,
                  <>Les villes bloquées vendent leurs surplus {Math.round(BLOCKADE.targetLoss * 100)} points moins cher ; celles qui bloquent, {Math.round(BLOCKADE.attackerGain * 100)} points plus cher.</>,
                  <>Une alliance bloquée est ensuite protégée {BLOCKADE.shieldDays} jours.</>,
                ]} />
              </div>
              <div className="rounded-[14px] border border-line p-3.5">
                <div className="flex items-center gap-2 text-[14px] font-semibold"><span className={`grid h-8 w-8 place-items-center rounded-[10px] ${TINTS.violet}`}><PieChart size={16} /></span>Le rachat hostile</div>
                <p className="mt-1 text-[12px] text-muted">Monde › Bourse.</p>
                <Points items={[
                  <>Avec <b>{SHARES.raidFrom} parts</b> d’une ville, vous pouvez forcer la vente du reste, jusqu’à {SHARES.maxFloat} parts.</>,
                  <>Elles sont payées <b>{fr(SHARES.raidPremium)} fois leur prix</b> au propriétaire.</>,
                  <>Avec <b>{SHARES.control} parts</b>, vous contrôlez la ville : elle vous verse un tribut de {pct(SHARES.tribute)} de son flux net, en plus des dividendes.</>,
                  "Cela dure jusqu’à ce que le propriétaire rachète ses parts.",
                ]} />
              </div>
            </div>
            <Callout tone="tip" title="Pour se protéger.">Ne jamais vendre {SHARES.raidFrom} parts au même joueur, ou racheter ses parts à temps. Une ville qui n’a rien vendu ne peut pas être visée, et deux villes d’une même alliance ne peuvent pas se racheter.</Callout>
          </Sec>

          {/* ════════ Référence ════════ */}
          <Sec id="notifications" brief="La cloche, en haut de l’écran, vous prévient de ce qui compte.">
            <Points items={[
              "Une subvention d’objectif est disponible.",
              "Votre ville passe un rang.",
              <>Un actif que vous détenez varie de plus de {pct(BIG_MOVE)} sur un jour (une information, pas un conseil).</>,
              "La vétusté dépasse 50 %, ou un site d’entreprise passe en sommeil.",
            ]} />
            <Callout tone="info">Vous pouvez aussi autoriser les notifications du navigateur : elles s’affichent quand l’onglet du jeu est ouvert mais en arrière-plan. Jeu fermé, rien n’est envoyé.</Callout>
          </Sec>

          <Sec id="lexique" brief="Les mots du jeu, en une phrase chacun.">
            <dl className="grid gap-2 sm:grid-cols-2">
              {LEXICON.map(([term, def]) => (
                <div key={term} className="rounded-[12px] bg-slate-50 p-3"><dt className="text-[13px] font-semibold">{term}</dt><dd className="mt-0.5 text-[12px] leading-snug text-muted">{def}</dd></div>
              ))}
            </dl>
          </Sec>

          <Reveal>
            <div className="flex flex-col items-center gap-2 rounded-[16px] border border-dashed border-line px-5 py-6 text-center">
              <Robot size={72} mood="cheer" />
              <p className="text-[14px] font-semibold">Vous savez tout. À vous de jouer !</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/ville" className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90">Aller à la Ville</Link>
                <Link href="/marches" className="rounded-[10px] border border-line bg-white px-4 py-2 text-[13px] font-semibold hover:bg-slate-50">Ouvrir les Marchés</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </Wiki.Provider>
  );
}
