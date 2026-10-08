import { describe, expect, it } from "vitest";
import { BUILDING_BY_ID, CITY_RANKS } from "./config";
import { computeCity } from "./engine";
import { MAX_MAP_SIZE, newPlot, placeTile, type Plot } from "./layout";

/** Pose réellement les bâtiments sur la plus grande carte (les plus grands d'abord) : la ville doit tenir. */
function city(counts: Record<string, number>) {
  const plots: Plot[] = [];
  const ids = Object.keys(counts).sort((a, b) => (BUILDING_BY_ID[b].size ?? 1) - (BUILDING_BY_ID[a].size ?? 1));
  for (const id of ids) for (let i = 0; i < counts[id]; i++) {
    const at = placeTile(plots, id, MAX_MAP_SIZE);
    if (!at) throw new Error(`plus de place pour ${id}`);
    plots.push(newPlot(id, at.x, at.y));
  }
  return plots.length;
}

describe("équilibrage : le dernier rang est atteignable par une ville saine", () => {
  const top = CITY_RANKS[CITY_RANKS.length - 1];
  const healthy = (counts: Record<string, number>, population: number) => {
    city(counts);
    const c = computeCity({ buildings: counts, population });
    expect(c.rank).toBe(CITY_RANKS.length - 1);
    expect(c.unemploymentRate).toBeLessThan(0.05);
    expect(c.energy.balance).toBeGreaterThanOrEqual(0);
    expect(c.food.balance).toBeGreaterThanOrEqual(0);
    expect(c.satisfaction).toBeGreaterThan(0.75);
    for (const s of Object.values(c.services)) expect(s.coverage).toBe(1);
  };

  it("ville de finance et de technologie", () => {
    healthy({ townhall: 1, village: 1, house_tower: 8, hospital: 18, park_l: 21, university: 11, police: 24,
      farm_l: 13, power_l: 24, tech: 30, bizdistrict: 3, bank: 360 }, top.pop + 20_000);
  });

  it("ville industrielle", () => {
    healthy({ townhall: 1, village: 1, house_tower: 8, hospital: 18, park_l: 30, university: 11, police: 24, recycling: 40,
      farm_l: 13, power_l: 28, factory_l: 32, bank: 70 }, top.pop + 20_000);
  });

  it("ville de tourisme et de commerce", () => {
    healthy({ townhall: 1, village: 1, house_tower: 8, hospital: 18, park_l: 21, university: 11, police: 24, recycling: 20,
      farm_l: 13, power_l: 24, themepark: 40, stadium: 6, hotel: 150, museum: 60, market: 110 }, top.pop + 20_000);
  });
});
