import { describe, expect, it } from "vitest";
import { simulate } from "./sim";
import { CITY_RANKS, START_GRANT } from "./config";
import { computeCity } from "./engine";

// Garde-fou d'équilibrage : un joueur prudent, qui garde un quart de sa fortune placé en bourse sans spéculer
// (cours constants), doit avancer à un rythme compatible avec une partie de 2 semaines à 1 mois
// (1 jour de ville = 1 heure réelle, soit 24 jours de ville par jour réel au maximum).
describe("rythme de progression de la ville (robot)", () => {
  const { days, final } = simulate(900);
  const reached = (rank: number) => days.find((d) => d.rank >= rank)?.day ?? Infinity;

  it("les premiers rangs arrivent vite", () => {
    expect(reached(1)).toBeLessThan(24);    // Bourg : dès le premier jour réel
    expect(reached(2)).toBeLessThan(120);   // Petite ville : moins de 5 jours réels
  });
  it("le début de partie donne de quoi construire à chaque session", () => {
    // Après deux semaines réelles, la ville compte une quarantaine de bâtiments (29 avant la dotation de démarrage)
    expect(days[14 * 24 - 1].buildings).toBeGreaterThanOrEqual(40);
  });
  it("devenir capitale économique demande entre 3 semaines et un peu plus d'un mois", () => {
    const last = reached(CITY_RANKS.findIndex((r) => r.name === "Capitale économique"));
    expect(last).toBeGreaterThan(500);
    expect(last).toBeLessThan(900);
  });
  it("la dotation de démarrage disparaît une fois la ville grande", () => {
    expect(final.population).toBeGreaterThan(START_GRANT.untilPop);
    expect(computeCity(final).income.grant).toBe(0);
  });
  it("la bourse n'est pas optionnelle : sans placements, pas de capital, et la ville reste un bourg", () => {
    const alone = simulate(900, true, false);
    expect(alone.final.capital ?? 0).toBe(0);
    expect(computeCity(alone.final).rank).toBe(1);
    expect(alone.final.population).toBeLessThan(final.population / 100);
  });
  it("la ville ne s'effondre jamais : pas de faillite ni d'exode", () => {
    expect(Math.min(...days.map((d) => d.cash))).toBeGreaterThanOrEqual(0);
    for (let i = 30; i < days.length; i++) expect(days[i].population).toBeGreaterThanOrEqual(days[i - 30].population * 0.9);
    // Il reste de la place sur la carte quand la ville devient capitale économique
    expect(days.find((d) => d.rank >= CITY_RANKS.findIndex((r) => r.name === "Capitale économique"))?.buildings ?? Infinity).toBeLessThan(300);
    expect(final.plots.length).toBeLessThanOrEqual(529);
  });
});
