// Saisons de la ville : la mairie se décore toute seule selon la date du joueur (citrouilles, sapin, œufs…).
// Purement décoratif : aucune règle du jeu ne change.

export type Season = "halloween" | "noel" | "paques" | "ete";
export const SEASON_LABEL: Record<Season, string> = { halloween: "Halloween", noel: "Noël", paques: "Pâques", ete: "Été" };

/** Dimanche de Pâques (calendrier grégorien, méthode de Meeus/Jones/Butcher). Mois de 1 à 12. */
export function easter(year: number): { month: number; day: number } {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const DAY = 86_400_000;
/** Jours entre deux dates du calendrier (sans effet des changements d'heure). */
const dayNum = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / DAY);

/** Décor du moment, selon la date locale du joueur :
 *  - Halloween : du 15 octobre au 2 novembre ;
 *  - Noël : du 1er décembre au 6 janvier (jour des Rois) ;
 *  - Pâques : de la semaine qui précède Pâques au lundi de Pâques ;
 *  - Été : du 21 juin au 31 août. */
export function seasonOf(date = new Date()): Season | null {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate(), n = dayNum(y, m, d);
  if (n >= dayNum(y, 10, 15) && n <= dayNum(y, 11, 2)) return "halloween";
  if (m === 12 || n <= dayNum(y, 1, 6)) return "noel";
  const e = easter(y), sunday = dayNum(y, e.month, e.day);
  if (n >= sunday - 7 && n <= sunday + 1) return "paques";
  if (n >= dayNum(y, 6, 21) && n <= dayNum(y, 8, 31)) return "ete";
  return null;
}
