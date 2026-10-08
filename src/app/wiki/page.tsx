"use client";
// Wiki du jeu. Tous les chiffres viennent de la configuration (lib/game/config) : la page reste juste quand l'équilibrage change.
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useGame } from "@/store/game";
import {
  ACTIVE_RATIO, BANK, BRANCH_COST, CITIES_PER_COUNTRY, CAPITAL, LEVERAGE, BRANCH_EFFECTS, BRANCH_MIN_VALUE, BUILDINGS, BUILDING_BY_ID, CATEGORY_LABELS, CITY_RANKS, CONTRACT_RATIO, COUNTRY_PRICES,
  DAY_LENGTH_MINUTES, DEMOLISH_REFUND, ENERGY_PER_RESIDENT, EXPORT_RATIO, FOOD_PER_RESIDENT, GOALS, HUB_DESK_COST, HUB_FEE_FACTOR, MAINTENANCE_RATE,
  FEATURES, ORIENTATIONS, ORIENTATION_CHANGE_COST, ORIENTATION_MIN_RANK,
  MAX_CATCHUP_DAYS, MAX_CONTRACTS, NEED_PER_RANK, POLLUTION_MAX, PROJECTS, RENOVATE_RATE, RESOURCE_PRICES, SERVICES, SERVICE_IDS, SPECIALTY_BONUS,
  STARTING_CASH, STARTING_POPULATION, START_GRANT, TAX_PER_RESIDENT, TERRITORY, TRADE_FEE_MIN, TRADE_FEE_RATE, UPGRADES, WEAR_PER_DAY, type BranchFamily, type Category,
} from "@/lib/game/config";
import { GUIDE } from "@/lib/game/guide";
import { BRANCH_COLOR, RESEARCH, RESEARCH_BY_ID } from "@/lib/game/research";
import { HUBS, PLAYABLE, PLAYABLE_IDS, countryPrice, countryTier, specialtyText } from "@/lib/world/countries";
import { BIG_MOVE } from "@/lib/notifs";
import { Button, Card, PageHeader } from "@/components/ui";
import Robot from "@/components/Robot";
import { compactEur, eur, num } from "@/lib/format";

const SECTIONS = [
  ["demarrer", "Démarrer"], ["jouer", "Comment jouer"], ["pages", "Les pages du jeu"], ["chiffres", "Lire les chiffres"], ["soucis", "Que faire si…"], ["temps", "Le temps"], ["bourse", "Bourse"], ["ville", "Ville"], ["batiments", "Bâtiments"], ["equipements", "Équipements et tensions"],
  ["progression", "Rangs, objectifs, projets"], ["entreprises", "Entreprises implantées"], ["monde", "Monde et pays"], ["commerce", "Commerce"], ["recherche", "Recherche"], ["notifications", "Notifications"],
] as const;
const CATS: Category[] = ["housing", "commerce", "services", "industry", "agriculture", "energy", "public"];
const pct = (v: number, d = 0) => `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`;

export default function WikiPage() {
  const reopen = useGame((s) => s.reopenTutorial);
  const tutorialDone = useGame((s) => s.game.tutorialDone);
  const upgradeTo = (id: string) => (UPGRADES[id] ? BUILDING_BY_ID[UPGRADES[id]].name : "");
  return (
    <>
      <PageHeader icon={BookOpen} title="Wiki" subtitle="Comment jouer, à quoi sert chaque page, et toutes les règles avec les chiffres exacts" />
      <div className="grid items-start gap-4 grid-cols-1 xl:grid-cols-12">
        <nav aria-label="Sommaire" className="xl:col-span-3 xl:sticky xl:top-20">
          <Card className="!p-3">
            <ul className="flex flex-wrap gap-1 xl:flex-col">
              {SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`} className="block rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:bg-slate-50 hover:text-ink">{label}</a></li>)}
            </ul>
          </Card>
        </nav>

        <div className="space-y-4 xl:col-span-9">
          <Section id="demarrer" title="Démarrer">
            <div className="flex items-start gap-3">
              <div>
                <p>Vous commencez avec <b>{eur(STARTING_CASH)}</b> et une petite ville de <b>{num(STARTING_POPULATION)} habitants</b>. Le but : bâtir un empire économique en investissant sur les vrais marchés et en développant votre ville.</p>
                <p className="mt-2">La boucle du jeu : <b>argent → investissement → ville → population → économie</b>. La bourse est risquée et peut rapporter gros ; la ville rapporte moins, mais tous les jours. Les deux sont liées : la ville fixe le levier de vos achats, et vos placements produisent le capital qui fait grandir la ville.</p>
                <p className="mt-2">Le jeu ne vous dira jamais d&apos;acheter ou de vendre, et il n&apos;invente aucun événement boursier : les cours et les actualités sont réels, c&apos;est vous qui décidez.</p>
                <p className="mt-2">Votre guide s&apos;appelle <b>Tic</b>. Il vous accompagne au début, vous accueille au retour d&apos;une absence et fête vos réussites.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {([["happy", "Il vous guide"], ["think", "Il signale un souci"], ["cheer", "Il fête une réussite"]] as const).map(([mood, label]) => (
                    <figure key={mood} className="flex w-[132px] flex-col items-center rounded-[14px] bg-slate-50 px-3 pb-2.5 pt-3">
                      <Robot size={96} mood={mood} />
                      <figcaption className="mt-1 text-center text-[11px] font-medium text-muted">{label}</figcaption>
                    </figure>
                  ))}
                </div>
                <p className="mt-3">Tic reste toujours disponible, en bas de l&apos;écran : une fois les premières étapes passées, il indique les gestes les plus utiles du moment. Vous pouvez le replier, il ne disparaît pas.</p>
                {tutorialDone && <Button variant="secondary" onClick={reopen} className="mt-3">Revoir les étapes de démarrage</Button>}
              </div>
            </div>
          </Section>

          <Section id="jouer" title="Comment jouer">
            <p>Vous avez deux sources d&apos;argent, et elles se nourrissent l&apos;une l&apos;autre : la <b>bourse</b> (vous achetez des actifs réels et les revendez plus cher… ou moins cher) et la <b>ville</b> (elle verse un revenu à chaque jour de jeu). L&apos;argent gagné d&apos;un côté sert à grossir de l&apos;autre.</p>
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Vos premières minutes</h3>
            <ol className="list-decimal space-y-2 pl-5">
              {GUIDE.map((g) => (
                <li key={g.id}><b>{g.title}.</b> {g.text} <Link href={g.href} className="whitespace-nowrap font-medium text-primary">{g.cta} →</Link></li>
              ))}
            </ol>
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Ensuite, à chaque visite</h3>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li><b>Regardez la page Économie</b> : votre argent, ce que la ville rapporte par jour, la valeur de votre portefeuille.</li>
              <li><b>Réglez les soucis de la ville</b> : sous la barre « Satisfaction », chaque ligne rouge est un problème à corriger (voir <a href="#soucis" className="font-medium text-primary">Que faire si…</a>).</li>
              <li><b>Faites grandir la ville</b> : des logements pour accueillir des habitants, puis des emplois pour qu&apos;ils travaillent, puis l&apos;énergie et la nourriture qu&apos;ils consomment.</li>
              <li><b>Gardez une part en bourse</b> : vos placements produisent le capital ◆ que les gros bâtiments demandent (voir <a href="#bourse" className="font-medium text-primary">Bourse</a>). Gardez aussi un peu d&apos;argent : la ville peut coûter certains jours.</li>
              <li><b>Visez le prochain palier</b> : les Objectifs versent des subventions, et chaque rang de ville ouvre de nouvelles fonctions.</li>
            </ol>
            <p className="mt-3">Il n&apos;y a pas de fin ni de défaite : votre <b>patrimoine</b> (argent + portefeuille + valeur de la ville) vous classe face aux autres joueurs dans Monde.</p>
          </Section>

          <Section id="pages" title="Les pages du jeu : à quoi sert chacune">
            <Table head={["Page", "À quoi elle sert", "Ce que vous y faites"]} rows={[
              [<Link key="l" href="/" className="text-primary">Économie</Link>, "Le tableau de bord : tout votre empire en un coup d'œil.", "Rien à régler ici : vous lisez où vous en êtes."],
              [<Link key="l" href="/marches" className="text-primary">Marchés</Link>, "La liste des actifs que vous pouvez acheter, avec leur cours réel et leur courbe.", "Choisir un actif, taper un montant en euros, acheter ou vendre."],
              [<Link key="l" href="/portefeuille" className="text-primary">Portefeuille</Link>, "Ce que vous possédez déjà en bourse.", "Voir si chaque ligne gagne ou perd depuis l'achat, et relire vos opérations."],
              [<Link key="l" href="/ville" className="text-primary">Ville</Link>, "Votre ville : bâtiments, habitants, satisfaction, revenu par jour.", "Construire, déplacer, démolir ; ouvrir Objectifs et Entreprises."],
              [<Link key="l" href="/monde" className="text-primary">Monde</Link>, "La carte des pays, le classement et les autres joueurs.", "Déménager, visiter une ville, commercer, ouvrir un bureau dans une place financière."],
              [<Link key="l" href="/actualites" className="text-primary">Actualités</Link>, "De vraies actualités économiques, reliées aux entreprises du jeu.", "Vous informer avant de décider. Le jeu ne conseille jamais."],
              [<Link key="l" href="/relations" className="text-primary">Relations</Link>, "Les liens entre entreprises : qui fournit qui, qui concurrence qui.", "Comprendre quelles autres entreprises une nouvelle peut toucher."],
              [<Link key="l" href="/recherche" className="text-primary">Recherche</Link>, "L'arbre de compétences.", "Payer pour ouvrir de nouveaux marchés et de nouveaux outils d'analyse."],
              ["Wiki", "Cette page : les règles et les chiffres.", "Chercher une réponse."],
            ]} />
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Dans la Ville, trois boutons</h3>
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b>Construire</b> : la liste des bâtiments. Chaque étiquette dit ce que le bâtiment apporte (habitants, emplois, revenu, énergie, nourriture, pollution).</li>
              <li><b>Objectifs</b> : les paliers à atteindre et leurs subventions, puis l&apos;orientation de la ville, le territoire et les grands projets quand le rang le permet.</li>
              <li><b>Entreprises</b> : faire ouvrir dans votre ville le site d&apos;une entreprise dont vous êtes actionnaire.</li>
            </ul>
          </Section>

          <Section id="chiffres" title="Lire les chiffres">
            <Table head={["Ce que vous voyez", "Où", "Ce que ça veut dire"]} rows={[
              ["Satisfaction 82 %", "Ville", "Le moral des habitants. Elle part de 95 %. Plus elle est haute, plus les impôts rentrent et plus vite la population grandit."],
              ["Pollution −12 pts (en rouge)", "Ville, sous la barre Satisfaction", "Ce problème retire 12 points de satisfaction. Chômage, Vétusté, Manque d'énergie… se lisent de la même façon."],
              ["pollution +40 / pollution −25", "Étiquette d'un bâtiment", "Ce que le bâtiment émet (+) ou absorbe (−) par jour. Si le total de la ville est positif, la satisfaction baisse."],
              ["+100 ou −30 avec un éclair", "Étiquette d'un bâtiment", "L'énergie produite (+) ou consommée (−) par jour. Même chose avec l'épi pour la nourriture."],
              ["+240 €/j", "Étiquette d'un bâtiment", "Le revenu par jour quand tous ses emplois sont pourvus. Avec la moitié des postes occupés, il rapporte la moitié."],
              ["Croissance +12", "Ville", "Le nombre d'habitants qui arriveront au prochain jour."],
              ["Jour 14 · prochain jour dans 23 min", "En haut de l'écran", "Le temps de la ville. À chaque nouveau jour, elle encaisse son revenu."],
              ["Réel / Fictif", "À côté d'un prix", "Réel : le vrai cours de marché. Fictif : aucune source gratuite pour cet actif, le prix est simulé par le jeu."],
              ["PRU", "Portefeuille", "Prix de revient unitaire : le prix moyen auquel vous avez acheté."],
              ["Plus-value", "Portefeuille", "Ce que vous gagneriez (vert) ou perdriez (rouge) en vendant maintenant, par rapport au prix d'achat."],
            ]} />
            <p className="mt-3"><b>Si vos actions ne bougent pas</b> : la bourse est fermée. Les actions ne cotent ni la nuit ni le week-end, leur cours reste donc figé jusqu&apos;à la réouverture, même si les jours de la ville continuent de passer. Seules les cryptomonnaies bougent jour et nuit.</p>
          </Section>

          <Section id="soucis" title="Que faire si…">
            <Table head={["Le souci", "Pourquoi", "La solution"]} rows={[
              ["Chômage", "Plus d'habitants qui cherchent un emploi que de postes.", "Construire des commerces, des services ou des usines."],
              ["Logements saturés", "Presque plus un logement libre : personne ne peut s'installer.", "Construire des logements."],
              ["Manque d'énergie", "La ville consomme plus qu'elle ne produit ; le manque est importé au prix fort.", "Construire une centrale, un parc solaire ou éolien."],
              ["Manque de nourriture", "Même chose pour la nourriture.", "Construire une exploitation, des serres ou un élevage."],
              ["Pollution", "Usines et centrales émettent plus que la ville n'absorbe.", "Construire des parcs, un écoquartier ou des exploitations agricoles."],
              ["Vétusté", "Les bâtiments vieillissent à partir du rang « Bourg ».", "Lancer une rénovation dans la Ville."],
              [SERVICE_IDS.map((id) => SERVICES[id].label).join(", "), "La ville est assez grande pour attendre cet équipement public.", `Construire l'équipement correspondant (catégorie ${CATEGORY_LABELS.public}).`],
              ["La population ne grandit plus", "Il n'y a plus de logement libre, ou trop peu d'emplois et de satisfaction.", "D'abord des logements, puis des emplois."],
              ["Le revenu de la ville est négatif", "L'entretien et les importations dépassent les impôts et les revenus.", "Pourvoir les emplois vides (il faut des habitants), produire votre énergie et votre nourriture."],
              ["Le portefeuille ne bouge pas", "Bourse fermée (nuit, week-end).", "Attendre la réouverture ; les cours sont relus chaque heure."],
            ]} />
          </Section>

          <Section id="temps" title="Le temps">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Un <b>jour de ville</b> dure <b>{DAY_LENGTH_MINUTES} minutes réelles</b>. À chaque jour, la ville encaisse son flux net et sa population évolue.</li>
              <li>La bourse suit le <b>temps réel</b> : les cours sont relus toutes les heures. Quand les marchés sont fermés (nuit, week-end), les actions ne bougent pas ; les cryptomonnaies, si.</li>
              <li>En votre absence la ville continue : à votre retour, jusqu&apos;à <b>{MAX_CATCHUP_DAYS} jours</b> sont rattrapés d&apos;un coup, et un journal résume ce qui s&apos;est passé.</li>
            </ul>
          </Section>

          <Section id="bourse" title="Bourse">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Les ordres se passent <b>en euros</b> : vous tapez votre mise, le jeu calcule le nombre de titres (fractions permises).</li>
              <li><b>Une seule façon d&apos;investir</b> : chaque achat est multiplié par le <b>levier de votre ville</b>. Vous mettez la mise, la Banque de la ville prête le reste. Les cours restent ceux du vrai marché ; vos gains sont multipliés, vos pertes aussi.</li>
              <li>Vous ne pouvez jamais perdre plus que votre mise : une ligne est <b>vendue d&apos;office</b> quand il n&apos;en reste que {pct(LEVERAGE.liquidation, 0).replace("+", "")}. Les cryptomonnaies sont limitées à un levier ×{LEVERAGE.maxByKind.crypto}.</li>
              <li>La somme prêtée coûte des <b>intérêts</b> : {pct(LEVERAGE.dayRate, 2).replace("+", "")} par jour de ville, pris sur vos liquidités.</li>
              <li><b>Capital ◆</b> : vos placements en produisent chaque jour de ville, {pct(CAPITAL.dayRate, 0).replace("+", "")} de ce qu&apos;ils valent. Tout bâtiment à partir de {compactEur(CAPITAL.fromCost)} en demande {pct(CAPITAL.share, 0).replace("+", "")} de son prix, en plus des liquidités. Sans bourse, la ville ne grandit donc plus ; n&apos;importe quel actif en produit, le jeu ne vous dit jamais lequel acheter.</li>
              <li>Frais de courtage : <b>{pct(TRADE_FEE_RATE, 2)}</b> du montant investi (mise × levier), {eur(TRADE_FEE_MIN)} au minimum, à l&apos;achat comme à la vente.</li>
              <li>Les marchés s&apos;ouvrent par la <a href="#recherche" className="text-primary font-medium">Recherche</a> : actions américaines au départ, puis Europe, Asie, cryptos, ETF, matières premières.</li>
              <li>Trois façons de réduire les frais : un pays à spécialité Finance, un bureau dans une place financière (frais × {HUB_FEE_FACTOR.toLocaleString("fr-FR")} sur les actifs qu&apos;elle couvre), le grand projet « Bourse de la ville ».</li>
            </ul>
            <p className="mt-3">La <b>Banque de la ville</b> (page Portefeuille) s&apos;agrandit avec les liquidités de la ville. Son niveau fixe le levier et la mise totale que vous pouvez placer :</p>
            <Table head={["Niveau", "Levier", "Mise maximale", "Prix", "À partir du rang"]} rows={BANK.map((b, i) => [String(i + 1), `×${b.lev.toLocaleString("fr-FR")}`, Number.isFinite(b.cap) ? compactEur(b.cap) : "Illimitée", b.cost ? compactEur(b.cost) : "Offert", CITY_RANKS[b.minRank].name])} />
            <Table head={["Place financière", "Actifs couverts", "Bureau"]} rows={HUBS.map((h) => [h.name, h.covers, `${compactEur(HUB_DESK_COST)} (offert si votre ville est dans ce pays)`])} />
          </Section>

          <Section id="ville" title="Ville : comment elle gagne de l'argent">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b>Impôts</b> : {TAX_PER_RESIDENT.toLocaleString("fr-FR")} € par habitant et par jour, réduits quand la satisfaction baisse ou que le chômage monte.</li>
              <li><b>Dotation de l&apos;État</b> : une aide aux petites communes, de {eur(START_GRANT.perDay)} par jour au départ. Elle diminue à mesure que la ville grandit et disparaît à {num(START_GRANT.untilPop)} habitants.</li>
              <li><b>Entreprises</b> : chaque bâtiment qui a des emplois rapporte son revenu, au prorata des postes pourvus. {pct(ACTIVE_RATIO)} des habitants cherchent un emploi.</li>
              <li><b>Ressources</b> : chaque habitant consomme {ENERGY_PER_RESIDENT.toLocaleString("fr-FR")} énergie et {FOOD_PER_RESIDENT.toLocaleString("fr-FR")} nourriture par jour. Le manque est importé au prix plein ({RESOURCE_PRICES.energy.toLocaleString("fr-FR")} € l&apos;énergie, {RESOURCE_PRICES.food.toLocaleString("fr-FR")} € la nourriture) ; le surplus est exporté à {pct(EXPORT_RATIO)} de ce prix.</li>
              <li><b>Entretien</b> : {pct(MAINTENANCE_RATE, 2)} du prix de chaque bâtiment par jour. Démolir rembourse {pct(DEMOLISH_REFUND)}. Déplacer est gratuit.</li>
              <li><b>Population</b> : de nouveaux habitants arrivent tant qu&apos;il y a des logements libres, plus vite s&apos;il y a des postes vacants et une bonne satisfaction.</li>
              <li><b>Construire vite</b> : en mode placement, « Auto ×1 » et « Auto ×5 » posent les bâtiments tout seuls ; « Copier » sur un bâtiment existant en pose un autre identique ; « Annuler » défait la dernière action.</li>
            </ul>
          </Section>

          <Section id="batiments" title="Bâtiments">
            {CATS.map((c) => (
              <div key={c} className="mt-3 first:mt-0">
                <h3 className="mb-1.5 text-[13px] font-semibold">{CATEGORY_LABELS[c]}</h3>
                <Table head={["Bâtiment", "Prix", "Habitants", "Emplois", "Revenu / j", "Énergie", "Nourriture", "Pollution", "Débloqué à", "S'améliore en"]}
                  rows={BUILDINGS.filter((b) => b.category === c && b.buildable !== false).map((b) => [
                    b.name, compactEur(b.cost), b.housing ? num(b.housing) : "", b.jobs ? num(b.jobs) : "", b.revenue ? `${num(b.revenue)} €` : "",
                    b.energyProd ? `+${num(b.energyProd)}` : b.energyUse ? `−${num(b.energyUse)}` : "", b.foodProd ? `+${num(b.foodProd)}` : "",
                    b.pollution ? (b.pollution > 0 ? `+${b.pollution}` : `−${-b.pollution}`) : "", b.unlockPop ? `${num(b.unlockPop)} hab.` : "départ", upgradeTo(b.id),
                  ])} />
              </div>
            ))}
            <p className="mt-3">L&apos;amélioration sur place (recherche « Rénovation urbaine ») coûte seulement la différence de prix entre les deux bâtiments.</p>
          </Section>

          <Section id="equipements" title="Équipements publics et tensions">
            <p>La satisfaction part de 95 %. Chaque point perdu réduit les impôts et ralentit l&apos;arrivée de nouveaux habitants.</p>
            <Table head={["Besoin", "Attendu à partir de", "Satisfaction perdue sans équipement", "Bâtiments"]}
              rows={SERVICE_IDS.map((id) => [SERVICES[id].label, `${num(SERVICES[id].needPop)} habitants`, `${pct(SERVICES[id].weight)} (+${pct(NEED_PER_RANK)} par rang de ville)`,
                BUILDINGS.filter((b) => b.service === id).map((b) => `${b.name} (${num(b.serves ?? 0)} hab.)`).join(", ")])} />
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li><b>Pollution</b> : usines et centrales en émettent ; parcs, écoquartiers et exploitations en absorbent. Elle peut coûter jusqu&apos;à {pct(POLLUTION_MAX)} de satisfaction.</li>
              <li><b>Vétusté</b> : +{pct(WEAR_PER_DAY, 1)} par jour à partir du rang « Bourg ». À 100 %, l&apos;entretien est doublé. Une rénovation la remet à zéro pour {pct(RENOVATE_RATE)} de la valeur des bâtiments × la vétusté.</li>
              <li><b>Autres pénalités</b> : chômage, logements saturés (−5 %), manque d&apos;énergie ou de nourriture (−8 % chacun).</li>
            </ul>
          </Section>

          <Section id="progression" title="Rangs, territoire, objectifs et grands projets">
            <Table head={["Rang", "Population"]} rows={CITY_RANKS.map((r, i) => [`${i + 1}. ${r.name}`, r.pop ? `${num(r.pop)} habitants` : "départ"])} />
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Ce qui s&apos;ouvre avec les rangs</h3>
            <Table head={["Fonction", "À partir du rang", "À quoi ça sert"]} rows={FEATURES.map((f) => [f.label, CITY_RANKS[f.rank].name, f.text])} />
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Orientation de la ville</h3>
            <p>À partir du rang « {CITY_RANKS[ORIENTATION_MIN_RANK].name} », la ville choisit une orientation, une seule à la fois. Le premier choix est gratuit ; en changer coûte {compactEur(ORIENTATION_CHANGE_COST)} × le rang de la ville.</p>
            <Table head={["Orientation", "Avantage", "Revers"]} rows={ORIENTATIONS.map((o) => [o.name, o.pro, o.con])} />
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Territoire</h3>
            <Table head={["Carte", "Prix", "Rang requis"]} rows={TERRITORY.map((t) => [`${t.size} × ${t.size} carreaux`, t.cost ? compactEur(t.cost) : "départ", CITY_RANKS[t.minRank].name])} />
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Objectifs (subvention versée une fois)</h3>
            <Table head={["Objectif", "Condition", "Subvention"]} rows={GOALS.map((g) => [g.label, g.minPop ? `avec au moins ${num(g.minPop)} habitants` : "", compactEur(g.reward)])} />
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Grands projets (comptés dans le patrimoine)</h3>
            <Table head={["Projet", "Prix", "Rang requis", "Avantage", "Prestige"]} rows={PROJECTS.map((p) => [p.name, compactEur(p.cost), CITY_RANKS[p.minRank].name, p.description, `+${num(p.prestige)}`])} />
          </Section>

          <Section id="entreprises" title="Entreprises implantées">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Une entreprise dont vous détenez au moins <b>{compactEur(BRANCH_MIN_VALUE)}</b> d&apos;actions peut ouvrir un site dans votre ville : son bâtiment apparaît sur la carte avec son logo.</li>
              <li>Le site tourne tant que vous gardez la participation de départ, <b>quel que soit le cours</b>. Si vous vendez en dessous, il passe en sommeil.</li>
              <li>Un site de plus à chaque rang de ville. Prix : {compactEur(BRANCH_COST)} pour le premier, puis {compactEur(BRANCH_COST * 2)}, {compactEur(BRANCH_COST * 3)}…</li>
            </ul>
            <Table head={["Secteur de l'entreprise", "Site", "Emplois", "Revenu / j", "Autre effet"]}
              rows={(Object.keys(BRANCH_EFFECTS) as BranchFamily[]).map((f) => { const e = BRANCH_EFFECTS[f]; return [f, e.label, num(e.jobs), `${num(e.revenue)} €`, e.energyProd ? `+${num(e.energyProd)} énergie` : e.serves ? `soigne ${num(e.serves)} habitants` : ""]; })} />
          </Section>

          <Section id="monde" title="Monde et pays">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Un pays est une <b>région</b> : il accueille jusqu&apos;à {CITIES_PER_COUNTRY} villes, et toutes profitent de sa spécialité. À l&apos;arrivée, le jeu vous place dans un des pays les moins peuplés.</li>
              <li>Vous pouvez <b>déménager</b> vers tout pays qui a encore de la place : la ville garde tout, vous payez le prix du pays.</li>
              <li>Le classement <b>Pays</b> additionne le patrimoine de toutes les villes d&apos;un pays : vos voisins sont votre équipe.</li>
              <li>Quatre catégories de prix : {COUNTRY_PRICES.map((p) => compactEur(p)).join(", ")}. Plus le pays est cher, plus sa spécialité est forte ({SPECIALTY_BONUS.map((b) => pct(b)).join(", ")}).</li>
              <li>Depuis la carte ou le classement, vous pouvez <b>visiter</b> la ville d&apos;un autre joueur.</li>
            </ul>
            <Table head={["Pays", "Prix", "Spécialité"]} rows={[...PLAYABLE_IDS].sort((a, b) => countryTier(b) - countryTier(a) || PLAYABLE[a].localeCompare(PLAYABLE[b], "fr")).map((id) => [PLAYABLE[id], compactEur(countryPrice(id)), specialtyText(id)])} />
          </Section>

          <Section id="commerce" title="Commerce entre joueurs">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Dans Monde › Commerce, vous achetez par contrat le surplus d&apos;énergie ou de nourriture d&apos;un autre joueur.</li>
              <li>Prix du contrat : <b>{pct(CONTRACT_RATIO)}</b> du prix plein. L&apos;acheteur paie moins qu&apos;à l&apos;import (100 %), le vendeur gagne plus qu&apos;à l&apos;export ({pct(EXPORT_RATIO)}).</li>
              <li>Jusqu&apos;à {MAX_CONTRACTS} contrats d&apos;achat. Chacun peut résilier à tout moment.</li>
            </ul>
          </Section>

          <Section id="recherche" title="Recherche">
            <p>La recherche ouvre des marchés et des outils. Elle ne donne jamais de bonus sur vos gains.</p>
            <Table head={["Branche", "Recherche", "Prix", "Après", "Ce qu'elle apporte"]}
              rows={RESEARCH.filter((n) => n.id !== "hq").map((n) => [
                <span key="b" className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BRANCH_COLOR[n.branch] }} />{n.branch}</span>,
                n.name, n.cost ? compactEur(n.cost) : "départ", n.requires.filter((r) => r !== "hq").map((r) => RESEARCH_BY_ID[r].name).join(", "), n.description,
              ])} />
          </Section>

          <Section id="notifications" title="Notifications">
            <p>La cloche en haut de l&apos;écran vous prévient quand :</p>
            <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
              <li>une subvention d&apos;objectif est disponible ;</li>
              <li>votre ville passe un rang ;</li>
              <li>un actif que vous détenez varie de plus de {pct(BIG_MOVE)} sur un jour (une information, pas un conseil) ;</li>
              <li>la vétusté dépasse 50 %, ou un site d&apos;entreprise passe en sommeil.</li>
            </ul>
            <p className="mt-2">Vous pouvez aussi autoriser les notifications du navigateur : elles s&apos;affichent quand l&apos;onglet du jeu est ouvert mais en arrière-plan. Jeu fermé, rien n&apos;est envoyé.</p>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card><h2 className="mb-3 text-[17px] font-semibold">{title}</h2><div className="text-[13px] leading-relaxed text-ink/90">{children}</div></Card>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full text-[12px]">
        <thead className="bg-slate-50 text-left text-muted"><tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => <td key={j} className={`px-3 py-2 ${j === 0 ? "font-semibold" : "tabular"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
