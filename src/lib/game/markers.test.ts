import { describe, expect, it } from "vitest";
import { computeCity } from "./engine";
import { cityMarkers } from "./markers";
import { BUILDING_BY_ID } from "./config";
import type { Plot } from "./layout";

/** Ville de test : une liste de bâtiments posés en ligne, et une population. */
function town(ids: string[], population: number) {
  const plots: Plot[] = ids.map((id, i) => ({ id, x: 1 + i, y: 1 }));
  const buildings: Record<string, number> = {};
  for (const id of ids) buildings[id] = (buildings[id] ?? 0) + 1;
  return { plots, markers: cityMarkers(plots, computeCity({ buildings, population })) };
}
const at = (t: ReturnType<typeof town>, kind: string) => t.markers.filter((m) => m.kind === kind).map((m) => t.plots.find((p) => p.x === m.x && p.y === m.y)!.id);

describe("pastilles de la ville", () => {
  it("manque d'énergie : sur les centrales, jamais sur un commerce", () => {
    const t = town(["village", "house_m", "factory_m", "shop", "power_s"], 600);
    expect(at(t, "energy")).toEqual(["power_s"]);
    for (const m of t.markers) if (m.kind === "energy") expect(BUILDING_BY_ID[t.plots.find((p) => p.x === m.x)!.id].energyProd).toBeGreaterThan(0);
  });

  it("manque d'énergie sans aucune centrale : sur la mairie, avec un message qui le dit", () => {
    const t = town(["village", "townhall", "factory_m", "shop"], 250);
    expect(at(t, "energy")).toEqual(["townhall"]);
    expect(t.markers.find((m) => m.kind === "energy")!.label).toMatch(/Aucune centrale/);
  });

  it("manque de nourriture : sur les exploitations", () => {
    const t = town(["village", "house_l", "farm_s", "power_m"], 2_700);
    expect(at(t, "food")).toEqual(["farm_s"]);
  });

  it("logements pleins : sur des logements ; postes vacants : sur des lieux de travail", () => {
    const t = town(["village", "shop", "factory_s", "farm_s", "power_s"], 250);
    expect(at(t, "full")).toEqual(["village"]);
    for (const id of at(t, "staff")) { expect(BUILDING_BY_ID[id].jobs).toBeGreaterThan(0); expect(BUILDING_BY_ID[id].housing).toBeUndefined(); }
    expect(at(t, "staff").length).toBeGreaterThan(0);
  });

  it("équipement public insuffisant : sur l'équipement du même service, sinon sur la mairie", () => {
    const withPark = town(["village", "townhall", "house_l", "house_l", "park", "power_m", "farm_m", "farm_m", "greenhouse"], 5_000);
    expect(at(withPark, "service")).toContain("park");
    const none = town(["village", "townhall", "house_l", "power_m", "farm_m", "farm_m", "greenhouse"], 2_600);
    expect(at(none, "service")[0]).toBe("townhall");
    expect(none.markers.find((m) => m.kind === "service")!.label).toMatch(/aucun équipement/);
  });

  it("une seule pastille par bâtiment, et pas plus de trois par problème", () => {
    const t = town(["village", ...Array(6).fill("house_s"), ...Array(6).fill("shop")], 850);
    const keys = t.markers.map((m) => `${m.x},${m.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(at(t, "full").length).toBeLessThanOrEqual(3);
    expect(at(t, "staff").length).toBeLessThanOrEqual(3);
  });

  it("ville sans problème : aucune pastille", () => {
    const t = town(["village", "house_s", "shop", "farm_s", "power_s"], 250);
    expect(t.markers).toEqual([]);
  });
});
