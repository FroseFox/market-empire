import { describe, expect, it } from "vitest";
import { cityFullReminder } from "./pushPlan";
import { DAY_MS } from "./game/engine";

describe("rappel « ville pleine »", () => {
  const game = { lastTick: 1_000_000, cityName: "Nova City" };
  it("prévoit le jour où les logements seront tous occupés", () => {
    const r = cityFullReminder(game, { freeHousing: 250, growth: 100 });
    expect(r?.at).toBe(1_000_000 + 3 * DAY_MS);
    expect(r?.body).toContain("Nova City");
  });
  it("ne prévoit rien si la ville est déjà pleine, ne grandit pas, ou si c'est trop loin", () => {
    expect(cityFullReminder(game, { freeHousing: 0, growth: 50 })).toBeNull();
    expect(cityFullReminder(game, { freeHousing: 500, growth: 0 })).toBeNull();
    expect(cityFullReminder(game, { freeHousing: 500, growth: -10 })).toBeNull();
    expect(cityFullReminder(game, { freeHousing: 1_000_000, growth: 3 })).toBeNull();
  });
});
