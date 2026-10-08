import { describe, expect, it } from "vitest";
import * as E from "./engine";
import { BUILDINGS, BUILDING_BY_ID, UPGRADES } from "./config";
import { footprint, isRoad, occupancy, plotAt, sideOf } from "./layout";
import { pack, unpack } from "./pack";

const T0 = 1_700_000_000_000;
const ok = (r: E.ActionResult) => { if (!r.ok) throw new Error(r.error); return r.state; };
/** Ville riche sur une carte de 24 × 24, toutes recherches faites : de quoi tout construire. */
const rich = (): E.GameState => ({ ...E.newGame(T0), cash: 1e9, capital: 1e9, population: 300_000, territory: 2, research: [...E.newGame(T0).research, "city_upgrade"] });

describe("taille des bâtiments", () => {
  it("les gros bâtiments occupent 2 × 2 ou 3 × 3 carreaux, et une amélioration ne rétrécit jamais", () => {
    expect(footprint("house_s")).toBe(1);
    expect(footprint("house_l")).toBe(2);
    expect(footprint("airport")).toBe(3);
    for (const [from, to] of Object.entries(UPGRADES)) expect(footprint(to), `${from} → ${to}`).toBeGreaterThanOrEqual(footprint(from));
    // Tout bâtiment tient dans un pâté de maisons (3 × 3 entre deux routes)
    for (const b of BUILDINGS) expect(footprint(b.id)).toBeLessThanOrEqual(3);
  });

  it("un bâtiment de 2 × 2 réserve ses quatre carreaux, jamais à cheval sur une route", () => {
    let g = rich();
    g = ok(E.build(g, "house_l", T0, { x: 5, y: 5 }));
    const p = plotAt(g.plots, 6, 6)!;
    expect(p).toMatchObject({ id: "house_l", x: 5, y: 5, s: 2 });
    expect(E.build(g, "house_s", T0, { x: 6, y: 6 }).ok).toBe(false);       // carreau déjà pris par le grand quartier
    expect(E.build(g, "house_l", T0, { x: 6, y: 6 }).ok).toBe(false);       // chevauche le premier
    expect(E.build(g, "house_l", T0, { x: 7, y: 9 }).ok).toBe(false);       // à cheval sur la route x = 8
    expect(E.build(g, "house_s", T0, { x: 7, y: 5 }).ok).toBe(true);        // le carreau voisin reste libre
    expect(E.landUse(g).used).toBe(E.landUse(rich()).used + 4);
    // Démolir depuis n'importe lequel de ses carreaux libère les quatre
    const d = ok(E.demolish(g, "house_l", T0, { x: 6, y: 5 }));
    expect(plotAt(d.plots, 5, 5)).toBeUndefined();
    expect(E.isTileFree(d, 5, 5, 2)).toBe(true);
  });

  it("un 3 × 3 demande un pâté de maisons entier", () => {
    let g = rich();
    expect(E.build(g, "stadium", T0, { x: 6, y: 5 }).ok).toBe(false);       // déborderait sur la route
    g = ok(E.build(g, "stadium", T0, { x: 5, y: 5 }));
    expect([...occupancy(g.plots)].filter(([, p]) => p.id === "stadium")).toHaveLength(9);
    expect(E.normalize(g)).toBe(g);
  });

  it("le placement automatique trouve un carré libre, sans chevauchement ni route", () => {
    let g = rich();
    for (const id of ["house_l", "stadium", "factory_m", "airport", "house_s", "hospital", "farm_l"]) g = ok(E.build(g, id, T0));
    const tiles = g.plots.flatMap((p) => Array.from({ length: sideOf(p) ** 2 }, (_, i) => [p.x + (i % sideOf(p)), p.y + Math.floor(i / sideOf(p))]));
    expect(new Set(tiles.map(([x, y]) => `${x},${y}`)).size).toBe(tiles.length);
    expect(tiles.some(([x, y]) => isRoad(x, y))).toBe(false);
    expect(tiles.every(([x, y]) => E.isTileFree({ plots: [], territory: 2 }, x, y))).toBe(true);
  });

  it("déplacer garde la taille et ne se gêne pas soi-même", () => {
    let g = ok(E.build(rich(), "house_l", T0, { x: 5, y: 5 }));
    g = ok(E.moveBuilding(g, { x: 6, y: 6 }, { x: 6, y: 6 }));              // glisse d'un carreau sur son propre terrain
    expect(plotAt(g.plots, 7, 7)).toMatchObject({ id: "house_l", x: 6, y: 6, s: 2 });
    expect(E.moveBuilding(g, { x: 6, y: 6 }, { x: 7, y: 7 }).ok).toBe(false); // déborderait sur la route
  });

  it("améliorer vers une version plus grande demande de la place autour", () => {
    let g = rich();
    g = ok(E.build(g, "house_m", T0, { x: 5, y: 5 }));
    // Bloqué de tous les côtés : pas de carré de 2 × 2 qui contienne le carreau
    for (const [x, y] of [[6, 5], [5, 6], [6, 6], [7, 5], [5, 7]]) g = ok(E.build(g, "house_s", T0, { x, y }));
    expect(E.upgrade(g, { x: 5, y: 5 }, T0).ok).toBe(false);
    g = ok(E.demolish(g, "house_s", T0, { x: 6, y: 5 }));
    g = ok(E.demolish(g, "house_s", T0, { x: 5, y: 6 }));
    g = ok(E.demolish(g, "house_s", T0, { x: 6, y: 6 }));
    const cash = g.cash;
    g = ok(E.upgrade(g, { x: 5, y: 5 }, T0));
    expect(plotAt(g.plots, 6, 6)).toMatchObject({ id: "house_l", x: 5, y: 5, s: 2 });
    expect(g.cash).toBe(cash - (BUILDING_BY_ID.house_l.cost - BUILDING_BY_ID.house_m.cost));
    expect(E.normalize(g)).toBe(g);
  });

  it("les bâtiments déjà posés gardent leur carreau, et la sauvegarde garde les tailles", () => {
    // Ancienne partie : un Grand quartier posé sur un seul carreau
    const base = rich();
    const old: E.GameState = { ...base, plots: [...base.plots, { id: "house_l", x: 5, y: 5 }], buildings: { ...base.buildings, house_l: 1 } };
    const kept = E.normalize(old);
    expect(plotAt(kept.plots, 5, 5)).toEqual({ id: "house_l", x: 5, y: 5 });
    expect(E.isTileFree(kept, 6, 6)).toBe(true);
    const g = ok(E.build(kept, "stadium", T0, { x: 9, y: 9 }));
    const back = unpack(pack(g));
    expect([...back.plots].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id))).toEqual([...g.plots].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id)));
  });
});
