import { describe, expect, it } from "vitest";
import { CITIES_PER_COUNTRY } from "../game/config";
import { PLAYABLE_IDS, countryCounts, countryFull, countryPreference, pickCountry } from "./countries";

describe("plusieurs villes par pays", () => {
  it("compte les villes de chaque pays", () => {
    expect(countryCounts(["250", "250", "840", ""])).toEqual({ "250": 2, "840": 1 });
  });

  it("un pays est complet à partir de la limite, pas avant", () => {
    const almost = Array(CITIES_PER_COUNTRY - 1).fill("250");
    expect(countryFull("250", almost)).toBe(false);
    expect(countryFull("250", [...almost, "250"])).toBe(true);
    expect(countryFull("840", [...almost, "250"])).toBe(false);
  });

  it("tant qu'il reste des pays vides, un nouveau joueur reçoit le sien", () => {
    const taken = PLAYABLE_IDS.slice(0, 40);
    for (const uid of ["a", "celyan", "joueur-42"]) expect(taken).not.toContain(pickCountry(uid, taken));
    expect(pickCountry("celyan", taken)).toBe(pickCountry("celyan", taken)); // stable pour un même joueur
  });

  it("quand tous les pays sont habités, le monde se remplit de façon égale : bien plus de 56 joueurs", () => {
    const taken: string[] = [];
    for (let i = 0; i < PLAYABLE_IDS.length * 3 + 5; i++) taken.push(pickCountry(`joueur-${i}`, taken)!);
    const n = Object.values(countryCounts(taken));
    expect(taken).toHaveLength(173);
    expect(n).toHaveLength(PLAYABLE_IDS.length);
    expect(Math.min(...n)).toBe(3);
    expect(Math.max(...n)).toBe(4);
  });

  it("personne n'est refusé, même quand tous les pays sont complets", () => {
    const fullWorld = PLAYABLE_IDS.flatMap((id) => Array(CITIES_PER_COUNTRY).fill(id));
    expect(PLAYABLE_IDS).toContain(pickCountry("retardataire", fullWorld));
  });

  it("l'ordre de préférence envoyé au serveur contient tous les pays, une fois chacun", () => {
    expect([...countryPreference("celyan")].sort()).toEqual([...PLAYABLE_IDS].sort());
  });
});
