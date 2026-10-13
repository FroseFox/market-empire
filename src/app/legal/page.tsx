"use client";
// Informations légales : mentions légales, CGU, confidentialité (RGPD) et cookies.
// Page lisible sans être connecté (affichée hors de l'écran de connexion par AppShell).
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/AppShell";
import { CONTACT_EMAIL, EDITOR, LEGAL_UPDATED } from "@/lib/legal";

const SECTIONS = [
  { id: "mentions", title: "Mentions légales" },
  { id: "cgu", title: "Conditions d'utilisation" },
  { id: "confidentialite", title: "Confidentialité" },
  { id: "cookies", title: "Cookies et stockage" },
];

function Contact() {
  return CONTACT_EMAIL
    ? <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>
    : <span className="rounded bg-amber-100 px-1 text-amber-900">[adresse e-mail de contact à renseigner]</span>;
}

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-6 border-t border-line pt-8 text-[22px] font-semibold">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 text-[15px] font-semibold">{children}</h3>;
}

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[760px] px-4 py-8 text-[14px] leading-relaxed text-ink [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-slate-100 hover:text-ink"><ArrowLeft size={15} />Retour au jeu</Link>
        </div>
        <h1 className="mt-8 text-[30px] font-bold leading-tight">Informations légales</h1>
        <p className="text-muted">Dernière mise à jour : {LEGAL_UPDATED}</p>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Sommaire">
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line bg-card px-3 py-1 text-[13px] font-medium hover:border-slate-300">{s.title}</a>)}
        </nav>

        <div className="mt-8 space-y-8">
          <section>
            <H id="mentions">Mentions légales</H>
            <H3>Éditeur</H3>
            <p>Market Empire est un projet personnel et non commercial, édité par {EDITOR} (particulier). Contact : <Contact />.</p>
            <H3>Hébergement</H3>
            <ul>
              <li>Site : GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (github.com).</li>
              <li>Comptes, sauvegardes et classement : Supabase, Inc. (supabase.com). Les données sont stockées dans l&apos;Union européenne (Francfort, Allemagne).</li>
            </ul>
            <H3>Propriété intellectuelle</H3>
            <p>Le code, les graphismes et les textes du jeu appartiennent à leur auteur. Les noms et logos des sociétés cotées appartiennent à leurs propriétaires respectifs et ne sont affichés qu&apos;à titre d&apos;information ; leur présence n&apos;implique aucun partenariat.</p>
          </section>

          <section>
            <H id="cgu">Conditions générales d&apos;utilisation</H>
            <H3>1. Objet</H3>
            <p>Les présentes conditions encadrent l&apos;utilisation du jeu Market Empire. Créer un compte vaut acceptation de ces conditions.</p>
            <H3>2. Un jeu, pas un service financier</H3>
            <ul>
              <li>Market Empire est un jeu gratuit. Aucun argent réel n&apos;est déposé, investi ou gagné. L&apos;argent, le capital et les actions du jeu sont virtuels, n&apos;ont aucune valeur et ne peuvent être ni achetés, ni vendus, ni échangés contre de l&apos;argent réel.</li>
              <li>Les cours proviennent des marchés réels, avec un décalage pouvant aller jusqu&apos;à une heure, et peuvent contenir des erreurs. Ils peuvent aussi être simulés si la source est indisponible.</li>
              <li>Rien dans le jeu ne constitue un conseil en investissement, une recommandation d&apos;acheter ou de vendre, ni une incitation à investir. Les résultats obtenus dans le jeu ne préjugent pas de ce qui se passerait avec de l&apos;argent réel.</li>
            </ul>
            <H3>3. Compte</H3>
            <ul>
              <li>Le jeu se joue avec un compte Discord ou Google. Vous devez avoir l&apos;âge minimum exigé par ce service (13 ans pour Discord). En France, avant 15 ans, l&apos;accord d&apos;un parent est nécessaire.</li>
              <li>Vous êtes responsable de votre compte. Un seul compte par personne pour le classement.</li>
              <li>Vous pouvez supprimer votre compte à tout moment depuis le menu du compte : votre partie et vos données en ligne sont alors effacées.</li>
            </ul>
            <H3>4. Règles de conduite</H3>
            <p>Il est interdit de :</p>
            <ul>
              <li>choisir un pseudo ou un nom de ville injurieux, haineux, à caractère sexuel ou usurpant l&apos;identité d&apos;autrui ;</li>
              <li>tricher : modifier sa sauvegarde, exploiter un bug, automatiser des actions ou attaquer le serveur ;</li>
              <li>harceler d&apos;autres joueurs, notamment via les alliances, la guerre économique ou le commerce ;</li>
              <li>publier dans le chat des propos injurieux, haineux, discriminatoires, à caractère sexuel, des données personnelles d&apos;autrui, de la publicité ou des liens frauduleux.</li>
            </ul>
            <p>Chaque message du chat peut être signalé ; un message signalé par plusieurs joueurs est masqué, et les modérateurs peuvent masquer un message et exclure son auteur du chat. En cas de manquement, le pseudo ou le nom de ville peut aussi être modifié, le joueur retiré du classement ou son compte supprimé.</p>
            <H3>5. Disponibilité et évolution</H3>
            <p>Le jeu est un prototype en accès anticipé, fourni tel quel. Il peut être interrompu, modifié ou remis à zéro (équilibrage, nouvelle saison, correction de bug) sans indemnité, puisqu&apos;il est gratuit et sans valeur marchande. Nous faisons de notre mieux pour éviter toute perte de partie, sans pouvoir la garantir.</p>
            <H3>6. Modification des conditions</H3>
            <p>En cas de changement important, les nouvelles conditions vous seront présentées et devront être acceptées pour continuer à jouer.</p>
            <H3>7. Droit applicable</H3>
            <p>Ces conditions sont soumises au droit français. En cas de litige, une solution amiable sera recherchée avant toute action. Vous conservez les droits que vous accorde la loi de votre pays de résidence dans l&apos;Union européenne.</p>
          </section>

          <section>
            <H id="confidentialite">Politique de confidentialité</H>
            <p>Responsable du traitement : l&apos;éditeur du jeu ({EDITOR}), joignable à l&apos;adresse <Contact />.</p>
            <H3>Données traitées</H3>
            <ul>
              <li><b>Compte</b> (transmis par Discord ou Google à la connexion) : identifiant du compte, nom, image de profil et adresse e-mail. L&apos;adresse e-mail est conservée par le service de connexion mais n&apos;est ni affichée, ni utilisée pour vous écrire. Le jeu ne reçoit jamais votre mot de passe.</li>
              <li><b>Profil public</b> : pseudo, image de profil, pays, nom et plan de votre ville, population, patrimoine, classement, alliance et échanges. Ces informations sont visibles par les autres joueurs.</li>
              <li><b>Chat</b> : vos messages, avec votre pseudo et l&apos;heure d&apos;envoi, visibles par tous les joueurs (salon commun) ou par votre alliance. Chaque message est effacé 24 h après son envoi ; les signalements disparaissent avec lui.</li>
              <li><b>Partie</b> : votre sauvegarde (ville, portefeuille, recherches, historique d&apos;opérations du jeu).</li>
              <li><b>Notifications</b> (seulement si vous les activez) : l&apos;adresse technique d&apos;abonnement fournie par votre navigateur.</li>
              <li><b>Données techniques</b> : comme tout site, les serveurs reçoivent votre adresse IP pour répondre à vos requêtes.</li>
            </ul>
            <p>Aucune publicité, aucun outil de mesure d&apos;audience, aucune revente de données.</p>
            <H3>Pourquoi, et sur quelle base</H3>
            <ul>
              <li>Faire fonctionner le jeu (compte, sauvegarde, classement, jeu entre joueurs) : exécution des conditions d&apos;utilisation que vous acceptez (RGPD, art. 6.1.b).</li>
              <li>Envoyer des notifications : votre consentement, donné dans le navigateur et retirable à tout moment (art. 6.1.a).</li>
              <li>Lutter contre la triche et assurer la sécurité : intérêt légitime (art. 6.1.f).</li>
            </ul>
            <H3>Durée de conservation</H3>
            <p>Vos données sont conservées tant que votre compte existe. La suppression du compte efface immédiatement le profil, la sauvegarde, les abonnements aux notifications, les contrats et participations liés. Un compte inactif depuis 3 ans peut être supprimé.</p>
            <H3>Destinataires et prestataires</H3>
            <ul>
              <li>Supabase (hébergement des comptes et des données, Union européenne).</li>
              <li>GitHub (hébergement du site).</li>
              <li>Discord ou Google, selon le service que vous utilisez pour vous connecter, chacun selon sa propre politique de confidentialité.</li>
              <li>Logo.dev (affichage des logos des sociétés) et Discord ou Google (affichage des images de profil) : votre navigateur charge directement ces images et leur transmet donc votre adresse IP.</li>
              <li>Le service de notifications de votre navigateur (Google, Mozilla, Apple…), si vous activez les notifications.</li>
            </ul>
            <p>Certains de ces prestataires sont établis aux États-Unis. Les transferts sont encadrés par le cadre de protection des données UE–États-Unis ou par des clauses contractuelles types de la Commission européenne.</p>
            <H3>Vos droits</H3>
            <p>Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité de vos données. Directement dans le jeu :</p>
            <ul>
              <li>changer votre pseudo et le nom de votre ville ;</li>
              <li>télécharger vos données (menu du compte › « Télécharger mes données ») ;</li>
              <li>supprimer votre compte (menu du compte › « Supprimer mon compte »).</li>
            </ul>
            <p>Pour toute autre demande : <Contact />. Réponse sous un mois au plus. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr) ou à l&apos;autorité de protection des données de votre pays.</p>
          </section>

          <section>
            <H id="cookies">Cookies et stockage local</H>
            <p>Market Empire n&apos;utilise <b>aucun cookie publicitaire ni de mesure d&apos;audience</b>, et aucun traceur tiers. C&apos;est pourquoi aucun bandeau ne vous demande votre accord.</p>
            <p>Le jeu enregistre uniquement dans le stockage local de votre navigateur ce qui est nécessaire à son fonctionnement ou à vos réglages, ce qui est dispensé de consentement (directive « vie privée et communications électroniques », art. 5.3 ; loi Informatique et Libertés, art. 82) :</p>
            <ul>
              <li>la session de connexion et la liste des comptes utilisés sur cet appareil ;</li>
              <li>la partie en cours et l&apos;état de sa synchronisation ;</li>
              <li>vos réglages : son et volume, qualité graphique, éclairage de la ville, guide déjà vu ;</li>
              <li>les notifications reçues dans le jeu et l&apos;acceptation de ces conditions.</li>
            </ul>
            <p>Ces données restent sur votre appareil. Vous pouvez les effacer à tout moment depuis les réglages de votre navigateur (« données de site ») ; vous serez alors déconnecté et la partie sera rechargée depuis votre sauvegarde en ligne.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
