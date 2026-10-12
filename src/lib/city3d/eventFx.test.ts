import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CITY_EVENTS } from "../game/events";
import { EventFx } from "./eventFx";
import type { Plot } from "../game/layout";

const PLOTS: Plot[] = [{ id: "townhall", x: 13, y: 13, s: 3 }, { id: "farm_s", x: 17, y: 13 }, { id: "factory_s", x: 18, y: 13 }, { id: "shop", x: 17, y: 14 }, { id: "house_m", x: 18, y: 14 }];
const BOUNDS = { x0: 8, x1: 23, y0: 8, y1: 23 };
const visible = (m: THREE.InstancedMesh) => {
  const mat = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, mat); if (Math.hypot(mat.elements[0], mat.elements[1], mat.elements[2]) > 0.01) n++; }
  return n;
};

describe("animations des événements de ville", () => {
  it("chaque événement a sa mise en scène, qui s'anime sans erreur puis se libère", () => {
    for (const e of CITY_EVENTS) {
      const fx = new EventFx(e.id, PLOTS, BOUNDS, false);
      expect(fx.group.children.length, e.id).toBeGreaterThan(0);
      for (let f = 0; f < 90; f++) fx.update(f / 30, 1 / 30, { tx: 16, tz: 16, span: 20 });
      fx.dispose();
    }
  });
  it("le festival tire des feux d'artifice", () => {
    const fx = new EventFx("festival", PLOTS, BOUNDS, false);
    const meshes = fx.group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);
    let best = 0;
    for (let f = 0; f < 150; f++) { fx.update(f / 30, 1 / 30, { tx: 16, tz: 16, span: 20 }); best = Math.max(best, visible(meshes[1])); }
    expect(best).toBeGreaterThan(50);
  });
  it("la tempête assombrit la ville et lance des éclairs", () => {
    const fx = new EventFx("storm", PLOTS, BOUNDS, false);
    expect(fx.light.dim).toBeLessThan(1);
    let flashed = false;
    for (let f = 0; f < 400; f++) { fx.update(f / 30, 1 / 30, { tx: 16, tz: 16, span: 20 }); flashed ||= fx.light.flash > 0; }
    expect(flashed).toBe(true);
  });
  it("en mouvement réduit, rien ne bouge et il n'y a pas de feux d'artifice", () => {
    const fx = new EventFx("festival", PLOTS, BOUNDS, true);
    expect(fx.group.children.length).toBe(1); // les confettis seulement
  });
});
