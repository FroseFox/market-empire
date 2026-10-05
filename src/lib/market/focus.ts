// Actif à ouvrir en arrivant sur la page Marchés (depuis le Portefeuille, par exemple).
// Simple mémoire de passage entre deux pages : rien dans l'adresse, rien de sauvegardé.
let pending: string | null = null;

/** Demande à la page Marchés d'ouvrir la fiche de cet actif à sa prochaine ouverture. */
export function focusAsset(symbol: string) { pending = symbol; }
/** Actif demandé, sans l'oublier (la page l'oublie une fois affichée). */
export function peekFocus(): string | null { return pending; }
export function clearFocus() { pending = null; }
