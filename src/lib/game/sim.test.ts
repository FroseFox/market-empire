import { describe, expect, it } from "vitest";
import { simulate } from "./sim";
import { CITY_RANKS } from "./config";

// Garde-fou d'équilibrage : un joueur prudent qui ne fait QUE la ville (sans la bourse) doit avancer
// à un rythme compatible avec une partie de 2 semaines à 1 mois (1 jour de ville = 1 heure réelle,
// soit 24 jours de ville par jour réel au maximum).
describe("rythme de progression de la ville (robot)", () => {
  const { days, final } = simulate(900);
  const reached = (rank: number) => days.find((d) => d.rank >= rank)?.day ?? Infinity;

  it("les premiers rangs arrivent vite", () => {
    expect(reached(1)).toBeLessThan(100);   // Bourg : quelques jours réels
    expect(reached(2)).toBeLessThan(330);   // Petite ville : moins de 2 semaines
  });
  it("le dernier rang demande entre 3 semaines et un peu plus d'un mois", () => {
    const last = reached(CITY_RANKS.length - 1);
    expect(last).toBeGreaterThan(500);
    expect(last).toBeLessThan(900);
  });
  it("la ville ne s'effondre jamais : pas de faillite ni d'exode", () => {
    expect(Math.min(...days.map((d) => d.cash))).toBeGreaterThanOrEqual(0);
    for (let i = 30; i < days.length; i++) expect(days[i].population).toBeGreaterThanOrEqual(days[i - 30].population * 0.9);
    expect(final.plots.length).toBeLessThan(529); // il reste de la place sur la carte
  });
});
