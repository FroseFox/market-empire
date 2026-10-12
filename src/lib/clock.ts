// Heure du jeu : celle du serveur, pas celle de l'appareil.
// Les jours de ville passent avec le temps réel ; si l'on se fiait à l'horloge du téléphone, l'avancer de dix heures
// offrirait dix jours de ville. Le serveur donne son heure à la connexion : on retient l'écart avec l'appareil
// (gardé sur l'appareil pour s'en servir dès l'ouverture suivante, avant même la connexion).
// Une fois le serveur entendu, le temps est compté avec le chronomètre du navigateur (`performance.now`), que le
// réglage de l'heure du téléphone ne touche pas ; il est recalé à chaque retour sur le jeu (il peut s'arrêter en veille).

const KEY = "market-empire-clock";
/** Au-delà, la valeur lue est absurde (stockage abîmé) : on l'ignore. Un téléphone réglé des mois trop tard reste corrigé. */
const MAX_SKEW = 5 * 365 * 86_400_000;

let offset = read();
/** Heure du serveur et chronomètre au moment où on l'a reçue. */
let anchor: { server: number; perf: number } | null = null;
const perf = () => (typeof performance !== "undefined" ? performance.now() : NaN);

function read(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && Math.abs(v) < MAX_SKEW ? v : 0;
  } catch { return 0; }
}

/** Heure du jeu, en millisecondes (comme `Date.now()`, mais calée sur le serveur dès qu'il a répondu une fois). */
export function now(): number {
  if (anchor) {
    const t = anchor.server + perf() - anchor.perf;
    if (Number.isFinite(t)) return Math.round(t);
  }
  return Date.now() + offset;
}

/** Écart à appliquer à l'horloge de l'appareil, d'après l'heure du serveur et le moment de la demande.
 *  La réponse a été produite entre l'envoi et la réception : on prend le milieu. */
export function skew(server: number, sentAt: number, receivedAt: number): number | null {
  if (!Number.isFinite(server) || receivedAt < sentAt) return null;
  const s = server - (sentAt + receivedAt) / 2;
  return Math.abs(s) < MAX_SKEW ? Math.round(s) : null;
}

/** Retient l'heure du serveur. Un écart de moins de 2 s ne change rien (bruit du réseau). */
export function setServerTime(server: number, sentAt: number, receivedAt: number) {
  const s = skew(server, sentAt, receivedAt);
  if (s === null) return;
  offset = Math.abs(s) < 2_000 ? 0 : s;
  anchor = { server: Date.now() + offset, perf: perf() };
  try { localStorage.setItem(KEY, String(offset)); } catch { /* stockage indisponible */ }
}
