import { describe, expect, it } from "vitest";
import { nextHourly } from "./refresh";

describe("nextHourly", () => {
  it("prend la minute visée de l'heure en cours si elle n'est pas passée", () => {
    expect(nextHourly(Date.UTC(2026, 9, 13, 14, 3), 15)).toBe(Date.UTC(2026, 9, 13, 14, 15));
  });
  it("passe à l'heure suivante si la minute est passée (ou atteinte)", () => {
    expect(nextHourly(Date.UTC(2026, 9, 13, 14, 15), 15)).toBe(Date.UTC(2026, 9, 13, 15, 15));
    expect(nextHourly(Date.UTC(2026, 9, 13, 23, 50), 15)).toBe(Date.UTC(2026, 9, 14, 0, 15));
  });
});
