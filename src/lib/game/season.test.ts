import { describe, expect, it } from "vitest";
import { easter, seasonOf } from "./season";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("saisons de la mairie", () => {
  it("calcule la date de Pâques", () => {
    expect(easter(2026)).toEqual({ month: 4, day: 5 });
    expect(easter(2027)).toEqual({ month: 3, day: 28 });
    expect(easter(2025)).toEqual({ month: 4, day: 20 });
    expect(easter(2038)).toEqual({ month: 4, day: 25 });
  });
  it("suit le calendrier", () => {
    expect(seasonOf(at(2026, 9, 30))).toBe(null);
    expect(seasonOf(at(2026, 10, 1))).toBe("halloween");
    expect(seasonOf(at(2026, 10, 12))).toBe("halloween");
    expect(seasonOf(at(2026, 10, 31))).toBe("halloween");
    expect(seasonOf(at(2026, 11, 2))).toBe("halloween");
    expect(seasonOf(at(2026, 11, 3))).toBe(null);
    expect(seasonOf(at(2026, 12, 1))).toBe("noel");
    expect(seasonOf(at(2027, 1, 6))).toBe("noel");
    expect(seasonOf(at(2027, 1, 7))).toBe(null);
    expect(seasonOf(at(2027, 3, 21))).toBe("paques"); // une semaine avant Pâques 2027 (28 mars)
    expect(seasonOf(at(2027, 3, 29))).toBe("paques"); // lundi de Pâques
    expect(seasonOf(at(2027, 3, 30))).toBe(null);
    expect(seasonOf(at(2026, 6, 21))).toBe("ete");
    expect(seasonOf(at(2026, 8, 31))).toBe("ete");
    expect(seasonOf(at(2026, 9, 1))).toBe(null);
  });
});
