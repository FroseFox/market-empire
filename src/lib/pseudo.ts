// Pseudo du joueur : mêmes règles que le serveur (fonction `set_name`), pour prévenir avant d'envoyer.
export const PSEUDO_MIN = 3, PSEUDO_MAX = 20;

/** Espaces en trop retirés. */
export const tidyPseudo = (v: string) => v.replace(/\s+/g, " ").trim();

/** `null` si le pseudo est acceptable, sinon la raison à afficher. */
export function pseudoProblem(v: string): string | null {
  const s = tidyPseudo(v);
  if (s.length < PSEUDO_MIN) return `Au moins ${PSEUDO_MIN} caractères.`;
  if (s.length > PSEUDO_MAX) return `${PSEUDO_MAX} caractères au plus.`;
  if (!/^[\p{L}\p{N}]([\p{L}\p{N} _.-]*[\p{L}\p{N}])?$/u.test(s)) return "Lettres, chiffres, espaces, tirets et points seulement.";
  if (/(admin|moderat|modérat|market ?empire|officiel|support)/i.test(s)) return "Ce pseudo est réservé.";
  return null;
}

/** Proposition de départ à partir du nom du compte : nettoyée pour respecter les règles (vide si rien d'utilisable). */
export function suggestPseudo(account: string): string {
  const s = tidyPseudo(account.replace(/[^\p{L}\p{N} _.-]/gu, "")).slice(0, PSEUDO_MAX).replace(/[^\p{L}\p{N}]+$/u, "").replace(/^[^\p{L}\p{N}]+/u, "");
  return pseudoProblem(s) ? "" : s;
}

export const PSEUDO_ERRORS: Record<string, string> = {
  invalid: "Pseudo refusé : 3 à 20 caractères, lettres, chiffres, espaces, tirets et points.",
  taken: "Ce pseudo est déjà pris.",
  wait: "Vous venez de changer de pseudo : réessayez dans une minute.",
  no_player: "Profil introuvable, reconnectez-vous.",
};
