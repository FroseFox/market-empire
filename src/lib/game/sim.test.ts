import { describe, expect, it } from "vitest";
import { simulate } from "./sim";
import { CITY_RANKS, START_GRANT } from "./config";
import { computeCity, landUse } from "./engine";

// Garde-fou d'équilibrage : un joueur prudent, qui garde un quart de sa fortune placé en bourse sans spéculer
// (cours constants), doit avancer à un rythme compatible avec une partie de 2 semaines à 1 mois
// (1 jour de ville = 1 heure réelle, soit 24 jours de ville par jour réel au maximum).
// Le robot joue chaque heure, jour et nuit, sans jamais se tromper : les vrais joueurs relevés en octobre 2026
// avançaient à peu près deux fois moins vite que lui. Ses 2 à 3 semaines font donc un bon mois pour eux.
describe("rythme de progression de la ville (robot)", () => {
  const { days, final, stuck } = simulate(900);
  const reached = (rank: number) => days.find((d) => d.rank >= rank)?.day ?? Infinity;

  it("les premiers rangs arrivent vite", () => {
    expect(reached(1)).toBeLessThan(24);    // Bourg : dès le premier jour réel
    expect(reached(2)).toBeLessThan(72);    // Petite ville : moins de 3 jours réels
    expect(reached(3)).toBeLessThan(168);   // Ville : dans la première semaine (10 jours réels avant le rééquilibrage)
  });
  it("aucun rang ne fait attendre plus de 5 jours réels", () => {
    for (let r = 1; r < CITY_RANKS.length; r++) expect(reached(r) - (r > 1 ? reached(r - 1) : 0)).toBeLessThan(5 * 24);
  });
  it("les pénuries restent rares et ne bloquent presque jamais", () => {
    // Avant : le robot passait plus d'un jour sur deux en pénurie les trois premiers jours réels,
    // et se retrouvait 150 fois à court d'énergie ou de nourriture sans pouvoir payer de quoi en produire.
    const short = (from: number, to: number) => days.slice(from, to).filter((d) => d.shortage).length / (to - from);
    expect(short(0, 72)).toBeLessThan(0.2);
    expect(short(72, 900)).toBeLessThan(0.2);
    expect(stuck).toBeLessThan(40);
  });
  it("un joueur qui passe quatre fois par jour construit à la plupart de ses passages la première semaine", () => {
    const casual = simulate(7 * 24, true, true, 6).days.filter((_, i) => i % 6 === 0);
    expect(casual.filter((d) => d.built > 0).length / casual.length).toBeGreaterThan(0.6);
  });
  it("le début de partie donne de quoi construire à chaque session", () => {
    // Après deux semaines réelles, la ville compte une quarantaine de bâtiments (29 avant la dotation de démarrage)
    expect(days[14 * 24 - 1].buildings).toBeGreaterThanOrEqual(40);
  });
  it("devenir capitale économique demande entre 2 semaines et un mois au robot", () => {
    const last = reached(CITY_RANKS.findIndex((r) => r.name === "Capitale économique"));
    expect(last).toBeGreaterThan(14 * 24);
    expect(last).toBeLessThan(30 * 24);
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
    expect(final.plots.length).toBeLessThanOrEqual(landUse(final).total);
  });
});
