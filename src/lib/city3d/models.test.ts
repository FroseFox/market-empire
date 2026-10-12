import { describe, expect, it } from "vitest";
import { buildingModel } from "./models";
import { BUILDINGS } from "../game/config";

/** Nombre de fenêtres allumées tournées vers chaque direction (+x, −x, +z, −z). */
function facing(id: string) {
  const g = buildingModel(id).lit!, n = g.getAttribute("normal"), out = { px: 0, nx: 0, pz: 0, nz: 0 };
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), z = n.getZ(i);
    if (x > 0.9) out.px++; else if (x < -0.9) out.nx++; else if (z > 0.9) out.pz++; else if (z < -0.9) out.nz++;
  }
  return out;
}

describe("modèles 3D des bâtiments", () => {
  it("l'arrière des immeubles a aussi des fenêtres", () => {
    const f = facing("hotel");
    expect(f.pz).toBeGreaterThan(0);
    expect(f.nz).toBeGreaterThan(0);
    expect(f.px).toBeGreaterThan(0);
    expect(f.nx).toBeGreaterThan(0);
  });
  it("tous les modèles se construisent, en géométrie indexée", () => {
    for (const b of BUILDINGS) {
      const m = buildingModel(b.id);
      expect(m.solid.index).not.toBeNull();
      expect(m.still.getAttribute("position").count).toBeGreaterThan(0);
    }
  });
});
