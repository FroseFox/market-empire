import { describe, expect, it } from "vitest";
import { plotsFromCity } from "./layout";

describe("plan de ville publié (visite)", () => {
  it("garde les grands bâtiments, publiés sous « type*côté »", () => {
    const plots = plotsFromCity({ shop: [15, 14], "themepark*3": [9, 9], "house_tower*2": [9, 13] });
    expect(plots).toHaveLength(3);
    expect(plots.find((p) => p.id === "themepark")).toMatchObject({ x: 9, y: 9, s: 3 });
    expect(plots.find((p) => p.id === "house_tower")).toMatchObject({ x: 9, y: 13, s: 2 });
  });
  it("écarte ce qui est invalide : type inconnu, côté absurde, route, chevauchement", () => {
    expect(plotsFromCity({ inconnu: [9, 9], "shop*7": [9, 9], shop: [8, 9, 1.5, 9] })).toHaveLength(0);
    // le second empiète sur le premier
    expect(plotsFromCity({ "house_tower*2": [9, 9], shop: [10, 10, 11, 11] })).toHaveLength(2);
  });
});
