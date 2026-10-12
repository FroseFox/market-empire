// Informations légales du site (mentions légales, CGU, confidentialité).
// ⚠️ À COMPLÉTER avant publication : CONTACT_EMAIL (obligatoire pour les demandes RGPD).

/** Nom ou pseudonyme de l'éditeur. Un particulier non professionnel peut rester sous pseudonyme
 *  (loi LCEN, art. 6-III-2), à condition que l'hébergeur dispose de son identité. */
export const EDITOR = "FroseFox";
/** Adresse e-mail de contact pour les questions et les demandes sur les données personnelles. */
export const CONTACT_EMAIL = "";
/** Date de dernière mise à jour des textes. */
export const LEGAL_UPDATED = "13 octobre 2026";
/** Version des CGU : la changer redemande l'acceptation aux joueurs. */
export const TERMS_VERSION = "2026-10-13";

const KEY = "market-empire-terms";

export function termsAccepted(): boolean {
  try { return localStorage.getItem(KEY) === TERMS_VERSION; } catch { return false; }
}
export function acceptTerms() {
  try { localStorage.setItem(KEY, TERMS_VERSION); } catch { /* stockage indisponible */ }
}
