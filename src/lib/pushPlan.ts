// Rappels programmés pour le joueur absent (purs, testables). Le jeu informe : jamais de conseil d'achat ou de vente.
import { DAY_MS, type CityStats, type GameState } from "./game/engine";

export interface Reminder { at: number; title: string; body: string }

/** Moment où la ville n'aura plus de logement libre, si elle continue de grandir au rythme actuel. `null` : rien à prévoir. */
export function cityFullReminder(game: Pick<GameState, "lastTick" | "cityName">, city: Pick<CityStats, "freeHousing" | "growth">): Reminder | null {
  if (city.freeHousing <= 0 || city.growth <= 0) return null;
  const days = Math.ceil(city.freeHousing / city.growth);
  if (days > 14 * 24) return null; // trop loin pour être utile
  return {
    at: game.lastTick + days * DAY_MS,
    title: "Votre ville est pleine",
    body: `Tous les logements de ${game.cityName} sont occupés : elle ne grandit plus tant que vous ne construisez pas.`,
  };
}
