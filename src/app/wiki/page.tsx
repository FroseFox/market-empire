"use client";
// Wiki du jeu. Tous les chiffres viennent de la configuration (lib/game/config) : la page reste juste quand l'équilibrage change.
import { BookOpen } from "lucide-react";
import { useGame } from "@/store/game";
import {
  ACTIVE_RATIO, BRANCH_COST, BRANCH_EFFECTS, BRANCH_MIN_VALUE, BUILDINGS, BUILDING_BY_ID, CATEGORY_LABELS, CITY_RANKS, CONTRACT_RATIO, COUNTRY_PRICES,
  DAY_LENGTH_MINUTES, DEMOLISH_REFUND, ENERGY_PER_RESIDENT, EXPORT_RATIO, FOOD_PER_RESIDENT, GOALS, HUB_DESK_COST, HUB_FEE_FACTOR, MAINTENANCE_RATE,
  MAX_CATCHUP_DAYS, MAX_CONTRACTS, NEED_PER_RANK, POLLUTION_MAX, PROJECTS, RENOVATE_RATE, RESOURCE_PRICES, SERVICES, SERVICE_IDS, SPECIALTY_BONUS,
  STARTING_CASH, STARTING_POPULATION, TAX_PER_RESIDENT, TERRITORY, TRADE_FEE_MIN, TRADE_FEE_RATE, UPGRADES, WEAR_PER_DAY, type BranchFamily, type Category,
} from "@/lib/game/config";
import { BRANCH_COLOR, RESEARCH, RESEARCH_BY_ID } from "@/lib/game/research";
import { HUBS, PLAYABLE, PLAYABLE_IDS, countryPrice, countryTier, specialtyText } from "@/lib/world/countries";
import { BIG_MOVE } from "@/lib/notifs";
import { Button, Card, PageHeader } from "@/components/ui";
import Robot from "@/components/Robot";
import { compactEur, eur, num } from "@/lib/format";

const SECTIONS = [
  ["demarrer", "Démarrer"], ["temps", "Le temps"], ["bourse", "Bourse"], ["ville", "Ville"], ["batiments", "Bâtiments"], ["equipements", "Équipements et tensions"],
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
      <PageHeader icon={BookOpen} title="Wiki" subtitle="Toutes les règles du jeu, avec les chiffres exacts" />
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
                <p className="mt-2">La boucle du jeu : <b>argent → investissement → ville → population → économie</b>. La bourse est risquée et peut rapporter gros ; la ville rapporte moins, mais tous les jours.</p>
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
                {tutorialDone && <Button variant="secondary" onClick={reopen} className="mt-3">Relancer le guide de Tic</Button>}
              </div>
            </div>
          </Section>

          <Section id="temps" title="Le temps">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Un <b>jour de ville</b> dure <b>{DAY_LENGTH_MINUTES} minutes réelles</b>. À chaque jour, la ville encaisse son flux net et sa population évolue.</li>
              <li>La bourse suit le <b>temps réel</b> : les cours sont relus toutes les heures.</li>
              <li>En votre absence la ville continue : à votre retour, jusqu&apos;à <b>{MAX_CATCHUP_DAYS} jours</b> sont rattrapés d&apos;un coup, et un journal résume ce qui s&apos;est passé.</li>
            </ul>
          </Section>

          <Section id="bourse" title="Bourse">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Les ordres se passent <b>en euros</b> : vous tapez un montant, le jeu calcule le nombre de titres (fractions permises).</li>
              <li>Frais de courtage : <b>{pct(TRADE_FEE_RATE, 2)}</b> du montant, {eur(TRADE_FEE_MIN)} au minimum, à l&apos;achat comme à la vente.</li>
              <li>Les marchés s&apos;ouvrent par la <a href="#recherche" className="text-primary font-medium">Recherche</a> : actions américaines au départ, puis Europe, Asie, cryptos, ETF, matières premières.</li>
              <li>Trois façons de réduire les frais : un pays à spécialité Finance, un bureau dans une place financière (frais × {HUB_FEE_FACTOR.toLocaleString("fr-FR")} sur les actifs qu&apos;elle couvre), le grand projet « Bourse de la ville ».</li>
            </ul>
            <Table head={["Place financière", "Actifs couverts", "Bureau"]} rows={HUBS.map((h) => [h.name, h.covers, `${compactEur(HUB_DESK_COST)} (offert si votre ville est dans ce pays)`])} />
          </Section>

          <Section id="ville" title="Ville : comment elle gagne de l'argent">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><b>Impôts</b> : {TAX_PER_RESIDENT.toLocaleString("fr-FR")} € par habitant et par jour, réduits quand la satisfaction baisse ou que le chômage monte.</li>
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
              <li>Chaque joueur occupe un pays. Vous pouvez <b>déménager</b> vers un pays libre : la ville garde tout, vous payez le prix du pays.</li>
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
