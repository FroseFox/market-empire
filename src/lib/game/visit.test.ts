import { describe, expect, it } from "vitest";
import { GRID_KEY, plotsFromCity } from "./layout";

const CUR = { [GRID_KEY]: "5" };

describe("plan de ville publié (visite)", () => {
  it("garde les grands bâtiments, publiés sous « type*côté »", () => {
    const plots = plotsFromCity({ ...CUR, shop: [14, 13], "themepark*4": [7, 7], "house_tower*2": [7, 12] });
    expect(plots).toHaveLength(3);
    expect(plots.find((p) => p.id === "themepark")).toMatchObject({ x: 7, y: 7, s: 4 });
    expect(plots.find((p) => p.id === "house_tower")).toMatchObject({ x: 7, y: 12, s: 2 });
  });
  it("un plan de l'ancienne grille (îlots de 3 × 3, sans marque) est converti : même place dans le même îlot", () => {
    const plots = plotsFromCity({ shop: [15, 14], "themepark*3": [9, 9], "house_tower*2": [9, 13] });
    expect(plots).toHaveLength(3);
    expect(plots.find((p) => p.id === "themepark")).toMatchObject({ x: 7, y: 7, s: 4 });
    expect(plots.find((p) => p.id === "house_tower")).toMatchObject({ x: 7, y: 12, s: 2 });
    expect(plots.find((p) => p.id === "shop")).toMatchObject({ x: 14, y: 13 });
  });
  it("écarte ce qui est invalide : type inconnu, côté absurde, route, chevauchement", () => {
    expect(plotsFromCity({ ...CUR, inconnu: [9, 9], "shop*7": [9, 9], shop: [11, 9, 1.5, 9] })).toHaveLength(0);
    // le second empiète sur le premier
    expect(plotsFromCity({ ...CUR, "house_tower*2": [7, 7], shop: [8, 8, 9, 9] })).toHaveLength(2);
  });
});

describe("plan compact des grandes villes", () => {
  it("une carte de 61 × 61 pleine tient sous 16 Ko et se relit à l'identique", async () => {
    const { compactCity, plotsFromCity, mapBounds, MAX_MAP_SIZE, isBuildable } = await import("./layout");
    const { lo, hi } = mapBounds(MAX_MAP_SIZE);
    const pl: Record<string, number[]> = {};
    const ids = ["house_s", "house_m", "shop", "market", "farm_s", "power_s", "park", "school"];
    let k = 0;
    for (let x = lo; x < hi; x++) for (let y = lo; y < hi; y++) if (isBuildable(x, y, MAX_MAP_SIZE)) (pl[ids[k++ % ids.length]] ??= []).push(x, y);
    expect(k).toBe(12 * 12 * 16); // 144 îlots de 16 carreaux
    const compact = compactCity(pl);
    expect(JSON.stringify(compact).length).toBeLessThan(8_000);
    const back = plotsFromCity(compact);
    expect(back).toHaveLength(k);
    expect(plotsFromCity({ ...pl, ...CUR })).toEqual(back); // l'ancien format (listes de nombres) se relit toujours
  });
});
