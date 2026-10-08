import { describe, expect, it } from "vitest";
import { pseudoProblem, suggestPseudo, tidyPseudo } from "./pseudo";

describe("pseudo du joueur", () => {
  it("accepte les pseudos ordinaires, accents compris", () => {
    for (const ok of ["Celyan", "Zéphyr le_Grand", "C3LY4N", "a.b-c", "Jo9"]) expect(pseudoProblem(ok)).toBeNull();
    expect(tidyPseudo("  Jean   Bon ")).toBe("Jean Bon");
  });
  it("refuse trop court, trop long, symboles et noms réservés", () => {
    for (const bad of ["ab", "x".repeat(21), "<b>x</b>", "-tiret", "Admin 1", "MarketEmpire", "nom@mail"]) expect(pseudoProblem(bad)).not.toBeNull();
  });
  it("propose un départ propre à partir du nom du compte", () => {
    expect(suggestPseudo("Celyan")).toBe("Celyan");
    expect(suggestPseudo("★ Dark_Lord ★")).toBe("Dark_Lord");
    expect(suggestPseudo("Un Très Très Long Nom De Compte")).toHaveLength(20);
    expect(suggestPseudo("!!")).toBe("");
  });
});
