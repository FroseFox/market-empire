// Modèles 3D des bâtiments de la ville, construits par code (aucune image, aucun fichier de modèle).
// Chaque type de bâtiment de config.ts a ici sa maquette : des volumes aux bords arrondis, fusionnés en une seule
// géométrie colorée par sommet, pour qu'un type entier s'affiche en un seul appel (InstancedMesh).
// Repère d'un carreau : origine au centre, x et z de −0,5 à 0,5, y vers le haut. La caméra regarde les faces +x et +z.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];
/** Hélice animée (éolienne) : centre du moyeu et longueur des pales. */
export interface Rotor { at: V3; size: number }
/** Pièce animée d'un bâtiment (grande roue, train, gyrophare…). Sa géométrie est centrée sur son propre pivot `at`.
 *  - spin  : tourne sans fin autour de `axis` (`amount` tours par seconde) ;
 *  - rock  : se balance autour de `axis` (`amount` radians de part et d'autre) ;
 *  - bob   : monte et descend de `amount` ;
 *  - slide : va de `at` à `to`, marque un arrêt, puis revient ;
 *  - pass  : traverse de `at` à `to` puis disparaît jusqu'au passage suivant ;
 *  - pulse : bat (son échelle varie de `amount`), comme un feu qui clignote.
 *  `ry` oriente la pièce avant l'animation ; `period` = durée d'un cycle en secondes. */
export interface Motion {
  geo: THREE.BufferGeometry; at: V3;
  kind: "spin" | "rock" | "bob" | "slide" | "pass" | "pulse";
  axis?: "x" | "y" | "z"; ry?: number; amount?: number; period?: number; to?: V3;
}
export interface Model {
  /** Volumes opaques, couleur par sommet. */
  solid: THREE.BufferGeometry;
  /** Pièces animées, et le modèle complet à l'arrêt (pièces comprises) pour les aperçus. */
  motions: Motion[];
  still: THREE.BufferGeometry;
  /** Fenêtres qui s'allument la nuit. */
  lit: THREE.BufferGeometry | null;
  /** Hauteur du point le plus haut (pour poser indicateurs et infobulles). */
  top: number;
  /** Sorties de fumée (sommet des cheminées). */
  smoke: V3[];
  rotors: Rotor[];
}

// ─── Palette (aspect maquette : couleurs franches, matière mate) ───
const P = {
  cream: 0xf3dfb6, white: 0xe6ebf3, stone: 0xd9ccb2, sand: 0xe8d5a8, brick: 0xc9764f, brickD: 0xa85c3a, concrete: 0xc4b9a2,
  tile: 0xd4482c, tileD: 0xb8341f, blue: 0x2f66c9, slate: 0x4a6f9e, teal: 0x129c8f, violet: 0x7a3ff0, pink: 0xe8548f,
  steel: 0x4c5666, steelL: 0x8a96a8, metal: 0xb9c3d1, glass: 0x4fb0e6, glassL: 0xc7ecff, glassD: 0x2c7fb8, aqua: 0xbfeee0,
  navy: 0x1c3a9c, primary: 0x1f4fd0, gold: 0xe6b92e, amber: 0xf59e0b, red: 0xd9503c, fire: 0xd43a2f, snow: 0xf4f7fb,
  wood: 0x8a5f3c, soil: 0x7d5633, crop: 0x8fc93a, wheat: 0xe6b92e, hay: 0xd9b24a, lawn: 0x6fbb4c, lawnD: 0x5aa83f,
  pave: 0xcdc2aa, paveD: 0xbdb39c, path: 0xe2d3a8, win: 0x345e94, door: 0x6b4a2e, water: 0x5cc0ee, waterL: 0x9bdcf6,
  leaf: 0x2f8f3e, leafL: 0x4fb04c, pine: 0x1f6b3a, pineL: 0x2a8a4a, panel: 0x1c3a9c, panelL: 0x3559b8, asphalt: 0x4a5363,
  green: 0x3fa35a, yellow: 0xf2b544, orange: 0xe9853a, black: 0x2a3140, skin: 0xf5d0a9,
};
/** Hauteur du socle de chaque carreau bâti. */
const B = 0.05;
const col = new THREE.Color();

/** Prépare une géométrie pour la fusion : sans index, sans coordonnées de texture, couleur par sommet. */
function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute("uv");
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  col.set(color);
  const count = n.getAttribute("position").count, arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  n.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return n;
}

/** Bloc posé sur y = 0, aux arêtes arrondies (rayon r). */
function rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const b = Math.min(r, h / 2 - 0.001, w / 2 - 0.001, d / 2 - 0.001);
  if (b <= 0.004) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; }
  const cw = w - 2 * b, cd = d - 2 * b, cr = Math.min(b * 1.2, cw / 2, cd / 2);
  const s = new THREE.Shape();
  s.moveTo(-cw / 2 + cr, -cd / 2); s.lineTo(cw / 2 - cr, -cd / 2); s.quadraticCurveTo(cw / 2, -cd / 2, cw / 2, -cd / 2 + cr);
  s.lineTo(cw / 2, cd / 2 - cr); s.quadraticCurveTo(cw / 2, cd / 2, cw / 2 - cr, cd / 2);
  s.lineTo(-cw / 2 + cr, cd / 2); s.quadraticCurveTo(-cw / 2, cd / 2, -cw / 2, cd / 2 - cr);
  s.lineTo(-cw / 2, -cd / 2 + cr); s.quadraticCurveTo(-cw / 2, -cd / 2, -cw / 2 + cr, -cd / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, b); g.rotateX(-Math.PI / 2);
  return g;
}

/** Atelier : on y empile des volumes, puis `done()` les fusionne en un modèle. */
class Kit {
  private parts: THREE.BufferGeometry[] = [];
  private lits: THREE.BufferGeometry[] = [];
  private smoke: V3[] = [];
  private rotors: Rotor[] = [];
  private motions: Motion[] = [];

  /** Pièce animée : `build` la dessine autour de son pivot (0, 0, 0), qui sera posé en `def.at`. */
  motion(def: Omit<Motion, "geo">, build: (m: Kit) => void) {
    const m = new Kit(); build(m);
    const geo = mergeGeometries(m.parts, false)!;
    for (const p of m.parts) p.dispose();
    this.motions.push({ ...def, geo });
  }
  /** Feu clignotant (balise de toit, gyrophare). */
  beacon(x: number, y: number, z: number, c: number = P.red, r = 0.022, period = 1.6) {
    this.motion({ kind: "pulse", at: [x, y, z], amount: 0.45, period }, (m) => m.ball(r, c, 0, 0, 0));
  }

  add(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0, lit = false) {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    (lit ? this.lits : this.parts).push(paint(g, color));
  }
  box(w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, r = 0.025, ry = 0) { this.add(rbox(w, h, d, r), c, x, y, z, ry); }
  cyl(r: number, h: number, c: number, x = 0, y = 0, z = 0, rTop = r, seg = 12) {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg); g.translate(0, h / 2, 0); this.add(g, c, x, y, z);
  }
  cone(r: number, h: number, c: number, x = 0, y = 0, z = 0, seg = 12, ry = 0) {
    const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); this.add(g, c, x, y, z, ry);
  }
  /** Toit pyramidal sur une base w × d. */
  hip(w: number, d: number, h: number, c: number, x = 0, y = 0, z = 0) {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, h, 4); g.rotateY(Math.PI / 4); g.scale(w, 1, d); g.translate(0, h / 2, 0); this.add(g, c, x, y, z);
  }
  ball(r: number, c: number, x = 0, y = 0, z = 0, sy = 1, detail = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail); g.scale(1, sy, 1); this.add(g, c, x, y, z);
  }
  /** Toit à deux pans, faîtage le long de x (ou de z avec ry = π/2). */
  gable(w: number, d: number, h: number, c: number, x = 0, y = 0, z = 0, ry = 0) {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2); this.add(g, c, x, y, z, ry);
  }
  /** Voûte en demi-cylindre, axe le long de x. */
  barrel(len: number, r: number, c: number, x = 0, y = 0, z = 0, ry = 0, sy = 1) {
    const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI, false); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, 0, -len / 2); g.rotateY(Math.PI / 2); g.scale(1, sy, 1); this.add(g, c, x, y, z, ry);
  }
  /** Tour de refroidissement (profil en hyperbole). */
  cooling(r: number, h: number, c: number, x: number, y: number, z: number) {
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => new THREE.Vector2(r * (0.72 + 0.28 * Math.pow(1 - t * 1.25, 2)), h * t));
    this.add(new THREE.LatheGeometry(pts, 18), c, x, y, z);
    this.cyl(r * 0.66, 0.012, P.steel, x, y + h - 0.03, z, r * 0.66, 18);
    this.smoke.push([x, y + h, z]);
  }
  /** Vitre plane : face +z (ry = 0) ou +x (ry = π/2). */
  win(w: number, h: number, x: number, y: number, z: number, ry = 0, lit = false) {
    this.add(new THREE.PlaneGeometry(w, h), P.win, x, y, z, ry, lit);
  }
  /** Rangées de fenêtres sur les deux façades visibles d'un bloc w × d centré en (cx, cz). */
  wins(w: number, d: number, y0: number, h: number, rows: number, cols: number, cx = 0, cz = 0, colsX = cols) {
    const hh = Math.min(0.11, (h / rows) * 0.56);
    for (let r = 0; r < rows; r++) {
      const y = y0 + ((r + 0.5) / rows) * h;
      const ww = Math.min(0.1, ((w * 0.84) / cols) * 0.62);
      for (let c = 0; c < cols; c++) this.win(ww, hh, cx + ((c + 0.5) / cols - 0.5) * w * 0.84, y, cz + d / 2 + 0.004, 0, (r * 5 + c * 3) % 3 !== 0);
      const wx = Math.min(0.1, ((d * 0.84) / colsX) * 0.62);
      for (let c = 0; c < colsX; c++) this.win(wx, hh, cx + w / 2 + 0.004, y, cz - ((c + 0.5) / colsX - 0.5) * d * 0.84, Math.PI / 2, (r * 7 + c * 2 + 1) % 3 !== 0);
    }
  }
  /** Bandeaux horizontaux d'une tour vitrée. */
  bands(w: number, d: number, y0: number, h: number, n: number, c: number, cx = 0, cz = 0) {
    for (let i = 1; i <= n; i++) this.box(w + 0.025, 0.028, d + 0.025, c, cx, y0 + (h * i) / (n + 1), cz, 0.01);
  }
  /** Socle du carreau (trottoir ou pelouse). */
  lot(c: number, size = 0.94) { this.box(size, B, size, c, 0, 0, 0, 0.02); }
  tree(x: number, z: number, s = 1, pine = false, y = B) {
    this.cyl(0.03 * s, 0.13 * s, P.wood, x, y, z, 0.022 * s, 6);
    if (pine) { this.cone(0.125 * s, 0.2 * s, P.pine, x, y + 0.09 * s, z, 8); this.cone(0.095 * s, 0.19 * s, P.pineL, x, y + 0.2 * s, z, 8); }
    else { this.ball(0.125 * s, P.leaf, x, y + 0.22 * s, z, 0.92); this.ball(0.078 * s, P.leafL, x - 0.045 * s, y + 0.29 * s, z + 0.035 * s); }
  }
  bush(x: number, z: number, s = 1, y = B) { this.ball(0.055 * s, P.leaf, x, y + 0.035 * s, z, 0.8); }
  /** Maison : murs, toit à deux pans, porte, fenêtres, cheminée. Façade (+z) tournée de ry. */
  house(x: number, z: number, roof: number, ry = 0, wall: number = P.cream, s = 1, y = B) {
    const g = new Kit();
    g.box(0.3, 0.19, 0.24, wall, 0, 0, 0, 0.02);
    g.gable(0.335, 0.285, 0.14, roof, 0, 0.185, 0);
    g.box(0.05, 0.1, 0.012, P.door, 0.07, 0, 0.12, 0);
    g.win(0.065, 0.065, -0.07, 0.11, 0.124, 0, true);
    g.win(0.065, 0.065, 0.154, 0.11, 0.02, Math.PI / 2, false);
    g.box(0.04, 0.1, 0.04, P.concrete, 0.08, 0.22, -0.05, 0.008);
    this.absorb(g, x, y, z, ry, s);
  }
  /** Reprend les volumes d'un autre atelier, déplacés, tournés et mis à l'échelle. */
  private absorb(o: Kit, x: number, y: number, z: number, ry: number, s: number) {
    for (const [src, dst] of [[o.parts, this.parts], [o.lits, this.lits]] as const) {
      for (const p of src) { p.scale(s, s, s); if (ry) p.rotateY(ry); p.translate(x, y, z); dst.push(p); }
    }
  }
  /** Immeuble : corps, corniche de toit, fenêtres sur les deux façades visibles. */
  tower(w: number, h: number, d: number, wall: number, roof: number, rows: number, cols: number, x = 0, z = 0, y = B, colsX = cols) {
    this.box(w, h, d, wall, x, y, z, 0.035);
    this.box(w + 0.04, 0.06, d + 0.04, roof, x, y + h - 0.02, z, 0.02);
    this.wins(w, d, y + 0.07, h - 0.16, rows, cols, x, z, colsX);
  }
  /** Bloc technique sur un toit. */
  roofUnit(x: number, y: number, z: number, s = 1) { this.box(0.13 * s, 0.07 * s, 0.1 * s, P.metal, x, y, z, 0.012); this.cyl(0.025 * s, 0.03 * s, P.steelL, x + 0.09 * s, y, z + 0.04 * s, 0.025 * s, 8); }
  /** Cheminée d'usine avec bague rouge ; la fumée en sort. */
  stack(x: number, z: number, h: number, r = 0.05, c: number = P.stone, y = B) {
    this.cyl(r * 1.25, h, c, x, y, z, r, 12);
    this.cyl(r * 1.08, 0.07, P.red, x, y + h * 0.72, z, r * 1.06, 12);
    this.cyl(r * 1.12, 0.03, P.steel, x, y + h - 0.02, z, r * 1.12, 12);
    this.smoke.push([x, y + h, z]);
  }
  car(x: number, z: number, c: number, ry = 0, y = B) {
    const g = rbox(0.17, 0.055, 0.09, 0.02); this.add(g, c, x, y + 0.012, z, ry);
    const t = rbox(0.09, 0.04, 0.078, 0.015); t.translate(-0.01, 0, 0); this.add(t, P.glassL, x, y + 0.058, z, ry);
  }
  /** Éolienne : mât, nacelle, et hélice animée par le moteur d'affichage. */
  turbine(x: number, z: number, h: number, size: number, y = B) {
    this.cyl(0.03, h, P.snow, x, y, z, 0.016, 10);
    this.box(0.06, 0.04, 0.09, P.snow, x, y + h - 0.01, z, 0.012, Math.PI / 4);
    this.rotors.push({ at: [x + 0.045, y + h + 0.01, z + 0.045], size });
  }
  /** Fumée ou vapeur qui s'échappe de ce point. */
  puff(x: number, y: number, z: number) { this.smoke.push([x, y, z]); }
  /** Disque vertical (horloge, enseigne ronde), face tournée vers +z (ou +x avec ry = π/2). */
  disc(r: number, c: number, x: number, y: number, z: number, ry = 0, t = 0.012) {
    const g = new THREE.CylinderGeometry(r, r, t, 16); g.rotateX(Math.PI / 2); this.add(g, c, x, y, z, ry);
  }
  /** Lampadaire de jardin : fût et globe. */
  lamp(x: number, z: number, h = 0.2, y = B) {
    this.cyl(0.009, h, P.steel, x, y, z, 0.007, 6); this.ball(0.024, P.gold, x, y + h + 0.012, z, 1, 0);
  }
  bench(x: number, z: number, ry = 0, y = B) {
    this.box(0.13, 0.014, 0.045, P.wood, x, y + 0.03, z, 0.004, ry); this.box(0.13, 0.03, 0.01, P.wood, x - Math.sin(ry) * 0.02, y + 0.044, z - Math.cos(ry) * 0.02, 0.003, ry);
  }
  /** Clôture basse entre deux points (piquets et lisse). */
  fence(x0: number, z0: number, x1: number, z1: number, c: number = P.wood, y = B) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.11)), ry = -Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) this.cyl(0.008, 0.055, c, x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n, 0.008, 5);
    this.box(len, 0.01, 0.01, c, (x0 + x1) / 2, y + 0.036, (z0 + z1) / 2, 0, ry);
  }
  /** Massif de fleurs. */
  flowers(x: number, z: number, c: number, n = 3, y = B) {
    this.box(0.035 * n + 0.02, 0.016, 0.05, P.soil, x, y, z, 0.006);
    for (let i = 0; i < n; i++) this.ball(0.017, i % 2 ? P.snow : c, x + (i - (n - 1) / 2) * 0.035, y + 0.024, z, 1, 0);
  }
  /** Antenne de toit, avec ou sans feu clignotant. */
  mast(x: number, y: number, z: number, h: number, light = true) {
    this.cyl(0.009, h, P.steelL, x, y, z, 0.005, 6);
    if (light) this.beacon(x, y + h + 0.012, z, P.red, 0.016, 1.8);
  }
  /** Ascenseur vitré le long d'une façade (+z, ou +x avec ry = π/2). */
  lift(x: number, y0: number, y1: number, z: number, ry = 0, period = 10) {
    this.box(0.014, y1 - y0 + 0.12, 0.014, P.metal, x, y0 - 0.02, z, 0, ry);
    this.motion({ kind: "slide", at: [x, y0, z], to: [x, y1, z], ry, period }, (m) => { m.box(0.07, 0.09, 0.03, P.glassL, 0, 0, 0.012, 0.008); m.box(0.074, 0.012, 0.034, P.steel, 0, 0.088, 0.012, 0.003); });
  }
  flag(x: number, y: number, z: number, h: number, c: number) {
    this.cyl(0.008, h, P.snow, x, y, z, 0.008, 6);
    this.box(0.11, 0.065, 0.01, c, x + 0.06, y + h - 0.075, z, 0);
  }
  /** Rangs de culture sur une parcelle (x0..x1, z0..z1). */
  field(x0: number, z0: number, x1: number, z1: number, rows: number, a: number, b: number) {
    this.box(x1 - x0, 0.03, z1 - z0, P.soil, (x0 + x1) / 2, B - 0.005, (z0 + z1) / 2, 0.01);
    const step = (z1 - z0) / rows;
    for (let i = 0; i < rows; i++) this.box(x1 - x0 - 0.05, 0.05, step * 0.56, i % 2 ? a : b, (x0 + x1) / 2, B + 0.015, z0 + step * (i + 0.5), 0.018);
  }
  panelRow(x: number, z: number, w: number, d: number) {
    const g = rbox(w, 0.022, d, 0.006); g.rotateX(-0.5); this.add(g, P.panel, x, B + 0.085, z);
    const l = new THREE.BoxGeometry(w - 0.04, 0.004, 0.008); l.rotateX(-0.5); this.add(l, P.panelL, x, B + 0.099, z + 0.004);
    this.cyl(0.011, 0.08, P.steelL, x - w * 0.32, B, z - 0.01, 0.011, 6); this.cyl(0.011, 0.08, P.steelL, x + w * 0.32, B, z - 0.01, 0.011, 6);
  }
  done(): Model {
    const solid = mergeGeometries(this.parts, false)!;
    const lit = this.lits.length ? mergeGeometries(this.lits, false) : null;
    // Modèle à l'arrêt : les pièces animées posées à leur place de départ
    let still = solid;
    if (this.motions.length) {
      const rest = this.motions.map((mv) => { const g = mv.geo.clone(); if (mv.ry) g.rotateY(mv.ry); g.translate(mv.at[0], mv.at[1], mv.at[2]); return g; });
      still = mergeGeometries([...this.parts, ...rest], false)!;
      for (const g of rest) g.dispose();
    }
    still.computeBoundingBox();
    const top = still.boundingBox ? still.boundingBox.max.y : 1;
    for (const p of this.parts) p.dispose();
    for (const p of this.lits) p.dispose();
    return { solid, lit, top, smoke: this.smoke, rotors: this.rotors, motions: this.motions, still };
  }
}

function factory(k: Kit, size: 0 | 1 | 2) {
  const s = [1, 1.12, 1.25][size], h = 0.24 * s;
  k.lot(P.paveD);
  k.box(0.74, h, 0.54, P.brick, 0, B, 0.1, 0.03);
  k.box(0.76, 0.03, 0.56, P.brickD, 0, B + h * 0.42, 0.1, 0.008);
  const n = 3 + (size > 1 ? 1 : 0), w = 0.72 / n;
  for (let i = 0; i < n; i++) {
    k.gable(0.54, w, 0.1 * s, P.steel, -0.36 + w * (i + 0.5), B + h - 0.005, 0.1, Math.PI / 2);
    k.win(w * 0.6, 0.05 * s, -0.36 + w * (i + 0.5), B + h + 0.035 * s, 0.372, 0, i % 2 === 0);
  }
  k.wins(0.74, 0.54, B + 0.06, h * 0.5, 1, 4, 0, 0.1, 3);
  k.box(0.17, 0.15, 0.012, P.steel, 0.18, B, 0.372, 0);
  k.stack(-0.28, -0.32, 0.6 * s, 0.05);
  if (size >= 1) k.stack(0.02, -0.34, 0.5 * s, 0.045);
  if (size >= 2) {
    k.stack(0.3, -0.33, 0.68 * s, 0.05);
    k.cyl(0.07, 0.2, P.metal, 0.4, B, 0.34, 0.07, 14); k.ball(0.07, P.metal, 0.4, B + 0.2, 0.34, 0.5);
    k.cyl(0.018, 0.5, P.steelL, -0.42, B + 0.26, 0.38, 0.018, 6);
  } else {
    k.box(0.1, 0.08, 0.1, P.wood, 0.38, B, 0.4, 0.012); k.box(0.08, 0.06, 0.08, P.hay, 0.38, B + 0.08, 0.4, 0.01);
  }
}

function farm(k: Kit, size: 0 | 1 | 2) {
  k.lot(P.lawn);
  if (size === 0) {
    k.field(-0.44, -0.08, 0.44, 0.44, 5, P.crop, P.wheat);
    k.box(0.26, 0.17, 0.2, P.tileD, 0.24, B, -0.3, 0.02); k.gable(0.29, 0.24, 0.12, 0x7a2219, 0.24, B + 0.165, -0.3);
    k.box(0.09, 0.11, 0.012, P.cream, 0.24, B, -0.198, 0);
    k.cyl(0.035, 0.07, P.hay, -0.12, B, -0.3, 0.035, 10); k.cyl(0.035, 0.07, P.hay, -0.03, B, -0.26, 0.035, 10);
    k.tree(-0.34, -0.32, 0.85);
    return;
  }
  k.field(-0.44, 0.06, 0.44, 0.44, 4, P.crop, P.wheat);
  k.field(-0.44, -0.44, -0.04, -0.02, 4, P.wheat, P.hay);
  k.house(0.22, -0.26, P.tileD, 0, P.cream, 1.05);
  if (size === 2) {
    k.box(0.22, 0.2, 0.3, P.tileD, 0.36, B, 0.0, 0.02); k.barrel(0.3, 0.115, 0x7a2219, 0.36, B + 0.19, 0, Math.PI / 2);
    k.cyl(0.075, 0.42, P.snow, 0.05, B, -0.36, 0.075, 14); k.ball(0.075, P.metal, 0.05, B + 0.42, -0.36, 0.6);
    k.cyl(0.055, 0.3, P.snow, -0.1, B, -0.38, 0.055, 12); k.ball(0.055, P.metal, -0.1, B + 0.3, -0.38, 0.6);
  } else {
    k.cyl(0.06, 0.3, P.snow, 0.02, B, -0.36, 0.06, 12); k.ball(0.06, P.metal, 0.02, B + 0.3, -0.36, 0.6);
  }
  // Tracteur
  k.box(0.1, 0.05, 0.06, P.green, -0.2, B + 0.03, 0.0, 0.012); k.box(0.05, 0.06, 0.055, P.green, -0.23, B + 0.07, 0.0, 0.01);
  k.cyl(0.03, 0.02, P.black, -0.24, B + 0.005, 0.035, 0.03, 8);
}

/** Fabrique de chaque type de bâtiment (mêmes identifiants que config.ts). */
const BUILD: Record<string, (k: Kit) => void> = {
  village(k) {
    k.lot(P.lawn);
    k.box(0.5, 0.012, 0.09, P.path, 0, B, 0.02, 0); k.box(0.09, 0.012, 0.5, P.path, 0, B, 0.02, 0);
    k.house(-0.24, -0.24, P.tile, 0.15); k.house(0.22, -0.26, 0xb9703a, -0.1, P.sand, 0.95);
    k.house(-0.24, 0.24, P.tileD, -0.12, P.sand, 0.9); k.house(0.24, 0.22, P.tile, 0.1);
    k.cyl(0.04, 0.05, P.stone, 0, B, 0.02, 0.04, 10); k.hip(0.1, 0.1, 0.05, P.wood, 0, B + 0.1, 0.02);
    k.tree(0.01, -0.36, 0.75); k.tree(-0.42, 0.02, 0.7, true); k.tree(0.42, 0.42, 0.7);
  },
  house_s(k) {
    k.lot(P.lawn);
    k.box(0.07, 0.012, 0.3, P.path, -0.13, B, 0.3, 0); k.box(0.07, 0.012, 0.22, P.path, 0.25, B, 0.36, 0);
    k.house(-0.2, -0.16, P.tile, 0.12); k.house(0.2, 0.14, P.blue, -0.1);
    k.tree(0.3, -0.28, 0.95); k.tree(-0.34, 0.3, 0.8, true);
    k.bush(-0.02, 0.38); k.bush(0.42, -0.02, 0.9); k.bush(-0.42, -0.4, 0.9);
    k.box(0.3, 0.035, 0.02, P.leaf, 0.2, B, -0.02, 0.008);
  },
  house_m(k) {
    k.lot(P.pave);
    k.tower(0.56, 0.86, 0.54, P.cream, P.tile, 4, 3, -0.04, -0.04);
    for (let r = 0; r < 3; r++) k.box(0.2, 0.03, 0.05, P.stone, -0.04, B + 0.28 + r * 0.19, 0.25, 0.006);
    k.box(0.2, 0.025, 0.1, P.tile, -0.04, B + 0.17, 0.27, 0.008); k.box(0.09, 0.14, 0.012, P.door, -0.04, B, 0.232, 0);
    k.roofUnit(-0.12, B + 0.9, -0.1);
    k.tree(0.38, 0.36, 0.75); k.bush(0.36, 0.1); k.bush(-0.36, 0.38);
  },
  house_l(k) {
    k.lot(P.pave);
    k.tower(0.38, 1.42, 0.38, P.white, P.slate, 7, 2, -0.21, -0.21);
    k.roofUnit(-0.24, B + 1.46, -0.24);
    for (let r = 0; r < 6; r++) k.box(0.05, 0.028, 0.18, P.metal, 0.0, B + 0.3 + r * 0.19, -0.21, 0.006);
    k.tower(0.36, 0.98, 0.36, P.cream, P.tile, 5, 2, 0.22, 0.2);
    k.box(0.2, 0.05, 0.2, P.lawnD, 0.22, B + 1.01, 0.2, 0.015); k.bush(0.18, 0.16, 0.8, B + 1.05);
    k.tree(-0.3, 0.32, 0.75); k.box(0.16, 0.035, 0.05, P.wood, -0.26, B, 0.16, 0.008);
  },
  house_eco(k) {
    k.lot(P.lawn);
    k.tower(0.4, 0.74, 0.42, 0xeef3e6, P.lawnD, 4, 2, -0.2, -0.2);
    k.panelRow(-0.2, -0.22, 0.26, 0.14);
    k.tower(0.38, 0.54, 0.4, 0xeef3e6, P.lawnD, 3, 2, 0.22, 0.2);
    k.bush(0.14, 0.14, 0.9, B + 0.57); k.bush(0.3, 0.26, 0.8, B + 0.57); k.ball(0.06, P.leafL, 0.2, B + 0.62, 0.3);
    for (let r = 0; r < 3; r++) k.box(0.05, 0.028, 0.2, P.wood, 0.0, B + 0.2 + r * 0.18, -0.2, 0.006);
    k.tree(0.26, -0.28, 0.9); k.tree(-0.3, 0.3, 0.8); k.bush(-0.06, 0.4);
  },
  house_xl(k) {
    k.lot(P.pave);
    k.box(0.82, 0.34, 0.82, P.stone, 0, B, 0, 0.035); k.box(0.86, 0.05, 0.86, P.concrete, 0, B + 0.32, 0, 0.015);
    k.wins(0.82, 0.82, B + 0.06, 0.24, 2, 5);
    k.box(0.16, 0.16, 0.012, P.glassD, 0, B, 0.412, 0); k.box(0.22, 0.025, 0.1, P.teal, 0, B + 0.17, 0.44, 0.008);
    k.tower(0.48, 1.9, 0.48, P.white, P.teal, 9, 3, 0, 0, B + 0.36);
    for (let r = 0; r < 8; r++) k.box(0.3, 0.026, 0.045, P.metal, 0, B + 0.6 + r * 0.2, 0.26, 0.006);
    k.roofUnit(-0.08, B + 2.3, -0.06, 1.2); k.cyl(0.05, 0.1, P.steelL, 0.12, B + 2.3, 0.1, 0.05, 10);
    k.box(0.14, 0.05, 0.14, P.lawnD, 0.3, B + 0.37, 0.3, 0.012); k.bush(0.3, 0.3, 1, B + 0.42); k.bush(-0.32, 0.32, 1, B + 0.37);
  },
  house_tower(k) {
    k.lot(P.pave);
    k.box(0.84, 0.3, 0.84, P.concrete, 0, B, 0, 0.035); k.wins(0.84, 0.84, B + 0.05, 0.2, 1, 5);
    k.box(0.6, 2.3, 0.6, P.glass, 0, B + 0.3, 0, 0.05); k.bands(0.6, 0.6, B + 0.3, 2.3, 11, P.glassL);
    k.box(0.36, 0.8, 0.36, P.glass, 0, B + 2.6, 0, 0.04); k.bands(0.36, 0.36, B + 2.6, 0.8, 4, P.glassL);
    k.box(0.4, 0.05, 0.4, P.glassD, 0, B + 3.38, 0, 0.015);
    k.cyl(0.012, 0.42, P.snow, 0, B + 3.42, 0, 0.006, 6); k.ball(0.022, P.red, 0, B + 3.86, 0);
    k.box(0.18, 0.05, 0.18, P.lawnD, 0.3, B + 0.3, 0.3, 0.012); k.bush(0.3, 0.3, 1, B + 0.35); k.bush(-0.33, 0.33, 1, B + 0.3);
  },
  shop(k) {
    k.lot(P.pave);
    k.box(0.68, 0.27, 0.5, P.cream, 0, B, -0.06, 0.03); k.box(0.72, 0.05, 0.54, P.concrete, 0, B + 0.26, -0.06, 0.015);
    for (let i = 0; i < 6; i++) { const g = rbox(0.105, 0.03, 0.2, 0.006); g.rotateX(0.38); g.translate(-0.2625 + i * 0.105, B + 0.2, 0.26); k.add(g, i % 2 ? P.snow : P.violet, 0, 0, 0); }
    k.win(0.4, 0.13, -0.08, B + 0.085, 0.194, 0, true); k.box(0.09, 0.15, 0.012, P.door, 0.24, B, 0.192, 0);
    k.win(0.3, 0.12, 0.344, B + 0.12, -0.06, Math.PI / 2, false);
    k.box(0.26, 0.09, 0.04, P.violet, 0, B + 0.31, 0.16, 0.015);
    k.roofUnit(-0.18, B + 0.31, -0.16, 0.9);
    k.box(0.07, 0.06, 0.07, P.wood, -0.34, B, 0.32, 0.008); k.ball(0.035, P.orange, -0.34, B + 0.085, 0.32); k.bush(0.4, 0.36);
  },
  market(k) {
    k.lot(P.pave);
    k.box(0.78, 0.2, 0.56, P.cream, 0, B, -0.08, 0.03);
    k.barrel(0.8, 0.29, P.tile, 0, B + 0.19, -0.08, 0, 0.62);
    for (let i = 0; i < 4; i++) k.box(0.02, 0.19, 0.6, P.snow, -0.3 + i * 0.2, B + 0.18, -0.08, 0.004);
    k.win(0.5, 0.11, 0, B + 0.1, 0.204, 0, true); k.box(0.012, 0.14, 0.1, P.door, 0.392, B, -0.08, 0);
    for (let i = 0; i < 3; i++) {
      k.box(0.16, 0.07, 0.1, P.wood, -0.26 + i * 0.26, B, 0.36, 0.01);
      const g = rbox(0.19, 0.022, 0.15, 0.006); g.rotateX(0.3); k.add(g, [P.red, P.gold, P.teal][i], -0.26 + i * 0.26, B + 0.16, 0.36);
      k.ball(0.022, P.orange, -0.3 + i * 0.26, B + 0.085, 0.36); k.ball(0.022, P.crop, -0.24 + i * 0.26, B + 0.085, 0.37);
    }
  },
  hotel(k) {
    k.lot(P.pave);
    k.tower(0.5, 1.4, 0.44, P.sand, P.tileD, 7, 3, -0.06, -0.14);
    k.box(0.52, 0.11, 0.46, P.fire, -0.06, B + 1.2, -0.14, 0.02);
    k.box(0.74, 0.2, 0.3, P.snow, 0, B, 0.26, 0.03); k.box(0.3, 0.025, 0.14, P.tileD, 0, B + 0.2, 0.42, 0.008);
    k.win(0.16, 0.13, 0, B + 0.075, 0.414, 0, true); k.win(0.14, 0.1, -0.24, B + 0.1, 0.414, 0, true); k.win(0.14, 0.1, 0.24, B + 0.1, 0.414, 0, false);
    k.cyl(0.014, 0.19, P.gold, -0.12, B, 0.46, 0.014, 6); k.cyl(0.014, 0.19, P.gold, 0.12, B, 0.46, 0.014, 6);
    k.roofUnit(-0.12, B + 1.44, -0.18); k.flag(0.1, B + 1.44, -0.1, 0.24, P.fire);
    k.bush(0.4, 0.44); k.bush(-0.4, 0.44);
  },
  mall(k) {
    k.lot(P.paveD);
    k.box(0.88, 0.32, 0.6, P.white, 0, B, -0.14, 0.035); k.box(0.9, 0.07, 0.62, P.violet, 0, B + 0.22, -0.14, 0.012);
    k.box(0.92, 0.04, 0.64, P.concrete, 0, B + 0.31, -0.14, 0.012);
    k.win(0.62, 0.15, 0, B + 0.1, 0.164, 0, true); k.win(0.4, 0.13, 0.444, B + 0.1, -0.14, Math.PI / 2, false);
    k.box(0.3, 0.12, 0.3, P.glass, 0.18, B + 0.34, -0.18, 0.02); k.hip(0.3, 0.3, 0.14, P.glassL, 0.18, B + 0.45, -0.18);
    k.roofUnit(-0.22, B + 0.35, -0.2, 1.1); k.box(0.2, 0.1, 0.04, P.pink, -0.18, B + 0.35, 0.12, 0.015);
    k.box(0.9, 0.006, 0.26, P.asphalt, 0, B, 0.33, 0);
    for (let i = 0; i < 5; i++) k.box(0.008, 0.008, 0.12, P.snow, -0.36 + i * 0.18, B + 0.004, 0.36, 0);
    k.car(-0.27, 0.37, P.red, Math.PI / 2); k.car(0.09, 0.37, P.blue, Math.PI / 2); k.car(0.27, 0.36, P.snow, Math.PI / 2);
  },
  services(k) {
    k.lot(P.pave);
    k.box(0.56, 1.42, 0.56, P.glass, 0, B, 0, 0.055); k.bands(0.56, 0.56, B + 0.14, 1.28, 7, P.glassL);
    k.box(0.6, 0.06, 0.6, P.glassD, 0, B + 1.4, 0, 0.02); k.roofUnit(0.06, B + 1.46, -0.06, 1.2);
    k.box(0.6, 0.14, 0.6, P.white, 0, B, 0, 0.02); k.win(0.2, 0.1, 0, B + 0.06, 0.304, 0, true); k.box(0.24, 0.02, 0.1, P.glassD, 0, B + 0.14, 0.34, 0.006);
    k.tree(0.38, 0.38, 0.7); k.bush(-0.38, 0.4); k.box(0.14, 0.03, 0.05, P.wood, 0.14, B, 0.42, 0.008);
  },
  bank(k) {
    k.lot(P.pave);
    k.box(0.8, 0.07, 0.76, P.concrete, 0, B, 0, 0.015); k.box(0.72, 0.05, 0.12, P.stone, 0, B + 0.03, 0.36, 0.01);
    k.box(0.68, 0.44, 0.56, P.snow, 0, B + 0.07, -0.06, 0.03);
    for (let i = 0; i < 5; i++) k.cyl(0.03, 0.38, P.snow, -0.26 + i * 0.13, B + 0.07, 0.29, 0.027, 10);
    k.box(0.74, 0.06, 0.2, P.stone, 0, B + 0.45, 0.24, 0.012);
    k.gable(0.2, 0.74, 0.14, P.stone, 0, B + 0.5, 0.24, Math.PI / 2);
    k.box(0.72, 0.06, 0.6, P.stone, 0, B + 0.5, -0.06, 0.015); k.box(0.34, 0.12, 0.34, P.gold, 0, B + 0.55, -0.1, 0.03); k.ball(0.14, P.gold, 0, B + 0.66, -0.1, 0.7, 2);
    k.box(0.1, 0.2, 0.012, P.door, 0, B + 0.07, 0.224, 0); k.wins(0.68, 0.56, B + 0.14, 0.26, 1, 0, 0, -0.06, 4);
    k.bush(0.42, 0.42); k.bush(-0.42, 0.42);
  },
  tech(k) {
    k.lot(P.lawn);
    k.box(0.5, 0.52, 0.4, P.glass, -0.18, B, -0.22, 0.045); k.bands(0.5, 0.4, B + 0.04, 0.48, 3, P.glassL, -0.18, -0.22);
    k.box(0.54, 0.05, 0.44, P.glassD, -0.18, B + 0.51, -0.22, 0.015); k.panelRow(-0.2, -0.24, 0.3, 0.16);
    k.box(0.82, 0.3, 0.3, P.glassL, 0, B, 0.28, 0.04); k.bands(0.82, 0.3, B + 0.02, 0.28, 2, P.glass, 0, 0.28);
    k.box(0.86, 0.04, 0.34, P.white, 0, B + 0.29, 0.28, 0.012); k.win(0.16, 0.1, 0.1, B + 0.06, 0.434, 0, true);
    k.box(0.34, 0.02, 0.3, P.lawnD, 0.26, B, -0.2, 0.008); k.tree(0.28, -0.24, 0.85); k.bush(0.16, -0.08); k.bush(0.4, -0.06);
    k.cyl(0.012, 0.1, P.steelL, 0.3, B + 0.33, 0.26, 0.012, 6); k.cone(0.06, 0.04, P.snow, 0.3, B + 0.42, 0.26, 12);
  },
  townhall(k) {
    k.lot(P.pave);
    k.box(0.8, 0.07, 0.74, P.concrete, 0, B, 0, 0.015); k.box(0.5, 0.045, 0.12, P.stone, 0, B + 0.035, 0.36, 0.01);
    k.box(0.68, 0.36, 0.52, P.snow, 0, B + 0.07, -0.06, 0.03);
    for (let i = 0; i < 4; i++) k.cyl(0.03, 0.32, P.snow, -0.21 + i * 0.14, B + 0.07, 0.26, 0.027, 10);
    k.box(0.74, 0.06, 0.64, P.stone, 0, B + 0.4, -0.02, 0.015);
    k.hip(0.6, 0.5, 0.26, P.primary, 0, B + 0.46, -0.06);
    k.box(0.16, 0.22, 0.16, P.snow, 0, B + 0.5, -0.06, 0.02); k.hip(0.2, 0.2, 0.14, P.primary, 0, B + 0.72, -0.06);
    k.cyl(0.05, 0.012, P.gold, 0, B + 0.6, 0.026, 0.05, 12);
    k.flag(0, B + 0.86, -0.06, 0.26, P.gold);
    k.box(0.1, 0.18, 0.012, P.door, 0, B + 0.07, 0.204, 0); k.wins(0.68, 0.52, B + 0.14, 0.2, 1, 0, 0, -0.06, 4);
    k.win(0.07, 0.11, -0.21, B + 0.24, 0.204, 0, true); k.win(0.07, 0.11, 0.21, B + 0.24, 0.204, 0, true);
    k.bush(0.42, 0.42); k.bush(-0.42, 0.42); k.tree(0.42, -0.36, 0.7);
  },
  branch(k) {
    k.lot(P.pave);
    k.tower(0.64, 0.74, 0.6, P.white, P.steelL, 4, 4, 0, -0.04);
    k.box(0.46, 0.04, 0.44, P.metal, 0, B + 0.78, -0.04, 0.012);
    k.box(0.22, 0.2, 0.05, P.glass, 0, B, 0.27, 0.015); k.box(0.3, 0.02, 0.12, P.steelL, 0, B + 0.2, 0.31, 0.006);
    k.tree(0.4, 0.4, 0.7); k.bush(-0.4, 0.4); k.car(-0.2, 0.42, P.blue, 0);
  },
  factory_s(k) { factory(k, 0); },
  factory_m(k) { factory(k, 1); },
  factory_l(k) { factory(k, 2); },
  warehouse(k) {
    k.lot(P.paveD);
    k.box(0.86, 0.26, 0.56, P.metal, 0, B, -0.12, 0.03); k.barrel(0.86, 0.28, P.steelL, 0, B + 0.25, -0.12, 0, 0.3);
    k.box(0.88, 0.06, 0.58, P.primary, 0, B + 0.17, -0.12, 0.01);
    for (let i = 0; i < 4; i++) k.box(0.13, 0.13, 0.012, P.steel, -0.3 + i * 0.2, B, 0.166, 0);
    k.box(0.9, 0.006, 0.28, P.asphalt, 0, B, 0.32, 0);
    // Camion à quai
    k.box(0.24, 0.12, 0.11, P.snow, 0.1, B + 0.02, 0.34, 0.015); k.box(0.08, 0.09, 0.1, P.primary, 0.27, B + 0.02, 0.34, 0.015);
    k.box(0.09, 0.07, 0.09, P.wood, -0.32, B, 0.34, 0.008); k.box(0.09, 0.07, 0.09, P.wood, -0.21, B, 0.38, 0.008); k.box(0.08, 0.06, 0.08, P.hay, -0.27, B + 0.07, 0.36, 0.008);
  },
  foodplant(k) {
    k.lot(P.paveD);
    k.box(0.76, 0.28, 0.5, 0xe7edd9, 0, B, 0.14, 0.03); k.box(0.78, 0.06, 0.52, P.crop, 0, B + 0.17, 0.14, 0.01);
    k.box(0.8, 0.04, 0.54, P.concrete, 0, B + 0.27, 0.14, 0.012);
    k.wins(0.76, 0.5, B + 0.04, 0.12, 1, 4, 0, 0.14, 3); k.roofUnit(0.16, B + 0.31, 0.16);
    for (const x of [-0.28, -0.06]) { k.cyl(0.095, 0.52, P.snow, x, B, -0.3, 0.095, 14); k.cone(0.095, 0.07, P.metal, x, B + 0.52, -0.3, 14); }
    k.box(0.3, 0.03, 0.04, P.steelL, -0.17, B + 0.44, -0.3, 0.006);
    k.stack(0.26, -0.32, 0.5, 0.042);
    const g = rbox(0.04, 0.03, 0.34, 0.006); g.rotateX(-0.6); k.add(g, P.steelL, -0.17, B + 0.3, -0.1);
  },
  farm_s(k) { farm(k, 0); },
  farm_m(k) { farm(k, 1); },
  farm_l(k) { farm(k, 2); },
  greenhouse(k) {
    k.lot(P.lawn);
    for (let i = 0; i < 3; i++) {
      const x = -0.29 + i * 0.29;
      k.box(0.24, 0.1, 0.8, P.aqua, x, B, 0, 0.015); k.gable(0.8, 0.24, 0.09, P.glassL, x, B + 0.1, 0, Math.PI / 2);
      for (let j = 0; j < 5; j++) k.box(0.25, 0.012, 0.012, P.snow, x, B + 0.095, -0.36 + j * 0.18, 0);
      k.box(0.012, 0.012, 0.82, P.snow, x, B + 0.186, 0, 0);
      k.box(0.08, 0.08, 0.012, P.snow, x, B, 0.402, 0);
    }
  },
  ranch(k) {
    k.lot(P.lawn);
    k.box(0.86, 0.012, 0.5, P.lawnD, 0, B, 0.18, 0.004);
    for (let i = 0; i <= 6; i++) { k.cyl(0.011, 0.07, P.wood, -0.43 + i * 0.143, B, 0.43, 0.011, 5); k.cyl(0.011, 0.07, P.wood, -0.43 + i * 0.143, B, -0.07, 0.011, 5); }
    for (const z of [0.43, -0.07]) { k.box(0.86, 0.012, 0.012, P.wood, 0, B + 0.045, z, 0); }
    for (const x of [-0.43, 0.43]) { k.box(0.012, 0.012, 0.5, P.wood, x, B + 0.045, 0.18, 0); }
    const cows: [number, number, number, number][] = [[-0.26, 0.1, P.snow, 0.4], [0.02, 0.26, P.wood, -0.5], [0.24, 0.08, P.snow, 1.2], [-0.1, 0.34, P.snow, 2.1], [0.3, 0.3, P.wood, 0.2]];
    for (const [x, z, c, ry] of cows) { k.box(0.085, 0.045, 0.045, c, x, B + 0.025, z, 0.012, ry); k.box(0.035, 0.035, 0.035, c === P.snow ? P.black : c, x + Math.cos(ry) * 0.055, B + 0.045, z - Math.sin(ry) * 0.055, 0.008, ry); }
    k.box(0.32, 0.2, 0.24, P.tileD, 0.22, B, -0.3, 0.02); k.barrel(0.24, 0.165, 0x7a2219, 0.22, B + 0.19, -0.3, Math.PI / 2, 0.75);
    k.box(0.1, 0.13, 0.012, P.cream, 0.22, B, -0.178, 0);
    k.cyl(0.04, 0.07, P.hay, -0.1, B, -0.3, 0.04, 10); k.cyl(0.04, 0.07, P.hay, -0.2, B, -0.26, 0.04, 10); k.tree(-0.38, -0.34, 0.8);
  },
  power_s(k) {
    k.lot(0xa9c47c);
    for (let i = 0; i < 3; i++) k.panelRow(-0.14, -0.26 + i * 0.25, 0.5, 0.17);
    k.box(0.1, 0.09, 0.08, P.metal, 0.3, B, -0.3, 0.012);
    k.turbine(0.3, 0.26, 0.66, 0.27);
  },
  power_m(k) {
    k.lot(P.paveD);
    k.box(0.6, 0.34, 0.5, P.white, -0.1, B, 0.12, 0.03); k.box(0.62, 0.06, 0.52, P.amber, -0.1, B + 0.14, 0.12, 0.01);
    k.barrel(0.6, 0.25, P.steelL, -0.1, B + 0.33, 0.12, 0, 0.36);
    k.wins(0.6, 0.5, B + 0.04, 0.1, 1, 4, -0.1, 0.12, 3);
    k.stack(0.3, -0.28, 0.92, 0.058, P.snow);
    k.cyl(0.062, 0.07, P.red, 0.3, B + 0.36, -0.28, 0.06, 12);
    k.box(0.14, 0.12, 0.14, P.steelL, -0.3, B, -0.32, 0.015); k.box(0.14, 0.12, 0.14, P.steelL, -0.1, B, -0.32, 0.015);
    for (const x of [-0.3, -0.1]) k.cyl(0.012, 0.1, P.steel, x, B + 0.12, -0.32, 0.012, 6);
    k.cyl(0.07, 0.22, P.metal, 0.32, B, 0.3, 0.07, 14); k.ball(0.07, P.metal, 0.32, B + 0.22, 0.3, 0.5);
  },
  power_l(k) {
    k.lot(P.paveD);
    k.cooling(0.2, 0.74, P.snow, -0.22, B, -0.2); k.cooling(0.2, 0.74, P.snow, 0.22, B, 0.16);
    k.box(0.34, 0.2, 0.3, P.white, -0.26, B, 0.28, 0.025); k.box(0.36, 0.05, 0.32, P.amber, -0.26, B + 0.1, 0.28, 0.008);
    k.box(0.36, 0.04, 0.32, P.concrete, -0.26, B + 0.19, 0.28, 0.012); k.wins(0.34, 0.3, B + 0.02, 0.08, 1, 3, -0.26, 0.28, 2);
    k.box(0.3, 0.03, 0.04, P.steelL, 0.02, B + 0.12, -0.02, 0.006);
    k.box(0.12, 0.1, 0.12, P.steelL, 0.3, B, -0.32, 0.015); k.cyl(0.012, 0.3, P.steel, 0.3, B + 0.1, -0.32, 0.012, 6);
  },
  solar(k) {
    k.lot(0xa9c47c);
    for (let i = 0; i < 4; i++) k.panelRow(-0.04, -0.33 + i * 0.22, 0.72, 0.15);
    k.box(0.09, 0.1, 0.09, P.metal, 0.4, B, 0.38, 0.012);
  },
  wind(k) {
    k.lot(P.lawn);
    k.turbine(-0.26, -0.26, 1.15, 0.42); k.turbine(0.22, -0.08, 1.0, 0.38); k.turbine(-0.14, 0.28, 0.9, 0.34);
    k.box(0.12, 0.1, 0.1, P.metal, 0.34, B, 0.34, 0.015); k.bush(0.1, 0.38); k.bush(-0.4, 0.06);
  },
  park(k) {
    k.lot(P.lawn);
    k.box(0.9, 0.012, 0.1, P.path, 0, B, 0, 0);
    k.cyl(0.19, 0.012, P.water, 0.2, B, 0.26, 0.19, 20); k.cyl(0.12, 0.016, P.waterL, 0.18, B, 0.25, 0.12, 16);
    k.box(0.14, 0.14, 0.14, P.snow, -0.02, B, -0.26, 0.02); k.hip(0.2, 0.2, 0.09, P.amber, -0.02, B + 0.14, -0.26);
    k.box(0.14, 0.03, 0.045, P.wood, -0.28, B + 0.02, 0.1, 0.006);
    k.tree(-0.28, -0.28, 1.05); k.tree(0.3, -0.26, 0.9, true); k.tree(-0.26, 0.3, 0.95); k.bush(0.42, 0.06); k.bush(-0.08, 0.2, 0.9);
  },
  park_l(k) {
    k.lot(P.lawn, 0.97);
    k.box(0.94, 0.012, 0.1, P.path, 0, B, 0, 0); k.box(0.1, 0.012, 0.94, P.path, 0, B, 0, 0);
    k.cyl(0.19, 0.014, P.path, 0, B, 0, 0.19, 20); k.cyl(0.15, 0.04, P.stone, 0, B, 0, 0.15, 20); k.cyl(0.125, 0.045, P.water, 0, B, 0, 0.125, 18);
    k.cyl(0.02, 0.1, P.stone, 0, B, 0, 0.02, 8); k.ball(0.035, P.waterL, 0, B + 0.11, 0, 0.7);
    const t: [number, number, boolean][] = [[-0.3, -0.3, false], [0.3, -0.32, true], [-0.32, 0.3, true], [0.3, 0.3, false], [-0.18, -0.18, false], [0.2, 0.2, false], [0.4, -0.14, false], [-0.14, 0.4, false]];
    for (const [x, z, p] of t) k.tree(x, z, 0.95, p);
    for (const [x, z, c] of [[-0.38, 0.12, P.pink], [0.14, -0.38, P.gold], [0.38, 0.12, P.red]] as const) { k.box(0.1, 0.02, 0.07, P.soil, x, B, z, 0.006); k.ball(0.022, c, x - 0.025, B + 0.03, z); k.ball(0.022, c, x + 0.025, B + 0.03, z); }
    k.box(0.14, 0.03, 0.045, P.wood, 0.2, B + 0.02, -0.11, 0.006);
  },
  school(k) {
    k.lot(P.pave);
    k.box(0.56, 0.34, 0.66, 0xfff1cf, -0.14, B, 0, 0.03); k.box(0.6, 0.05, 0.7, P.yellow, -0.14, B + 0.33, 0, 0.015);
    k.wins(0.56, 0.66, B + 0.06, 0.24, 2, 3, -0.14, 0, 4);
    k.box(0.18, 0.2, 0.2, 0xfff1cf, -0.14, B + 0.36, 0, 0.02); k.hip(0.24, 0.26, 0.12, P.orange, -0.14, B + 0.55, 0);
    k.cyl(0.045, 0.012, P.snow, -0.14, B + 0.46, 0.104, 0.045, 12);
    k.box(0.012, 0.16, 0.12, P.door, 0.146, B, 0.1, 0);
    k.box(0.3, 0.012, 0.74, P.lawnD, 0.3, B, 0, 0.004);
    k.cyl(0.01, 0.13, P.red, 0.24, B, -0.2, 0.01, 5); k.cyl(0.01, 0.13, P.red, 0.36, B, -0.2, 0.01, 5); k.box(0.14, 0.012, 0.012, P.red, 0.3, B + 0.13, -0.2, 0);
    k.box(0.14, 0.035, 0.04, P.blue, 0.3, B + 0.02, 0.06, 0.006); k.ball(0.03, P.orange, 0.36, B + 0.03, 0.26);
    k.flag(0.3, B, 0.36, 0.3, P.primary); k.tree(0.34, -0.38, 0.7);
  },
  university(k) {
    k.lot(P.lawn);
    k.box(0.8, 0.4, 0.4, P.brick, 0, B, -0.04, 0.03); k.gable(0.82, 0.44, 0.16, P.steel, 0, B + 0.39, -0.04);
    k.wins(0.8, 0.4, B + 0.06, 0.28, 2, 6, 0, -0.04, 2);
    k.box(0.22, 0.44, 0.1, P.stone, 0, B, 0.18, 0.02); k.gable(0.1, 0.24, 0.1, P.stone, 0, B + 0.43, 0.18, Math.PI / 2);
    for (const x of [-0.07, 0.07]) k.cyl(0.02, 0.34, P.snow, x, B + 0.04, 0.24, 0.02, 8);
    k.box(0.1, 0.18, 0.012, P.door, 0, B, 0.232, 0);
    k.box(0.2, 0.9, 0.2, P.brick, -0.28, B, -0.3, 0.025); k.hip(0.24, 0.24, 0.2, P.steel, -0.28, B + 0.9, -0.3);
    k.cyl(0.055, 0.012, P.snow, -0.28, B + 0.72, -0.196, 0.055, 12); k.wins(0.2, 0.2, B + 0.1, 0.5, 3, 1, -0.28, -0.3);
    k.box(0.2, 0.012, 0.26, P.path, 0, B, 0.36, 0);
    k.tree(0.34, 0.34, 0.9); k.tree(-0.36, 0.32, 0.85); k.tree(0.36, -0.36, 0.75, true); k.bush(0.2, 0.42); k.bush(-0.2, 0.42);
  },
  hospital(k) {
    k.lot(P.pave);
    k.tower(0.56, 1.0, 0.42, P.snow, P.metal, 5, 4, -0.06, -0.2, B, 3);
    k.box(0.07, 0.022, 0.24, P.fire, -0.06, B + 1.04, -0.2, 0.004); k.box(0.24, 0.022, 0.07, P.fire, -0.06, B + 1.04, -0.2, 0.004);
    k.box(0.07, 0.22, 0.012, P.fire, -0.06, B + 0.7, 0.014, 0); k.box(0.2, 0.07, 0.012, P.fire, -0.06, B + 0.775, 0.016, 0);
    k.box(0.82, 0.34, 0.36, 0xe0f2fe, 0, B, 0.22, 0.03); k.box(0.86, 0.045, 0.4, P.metal, 0, B + 0.33, 0.22, 0.012);
    k.wins(0.82, 0.36, B + 0.14, 0.14, 1, 6, 0, 0.22, 2);
    k.box(0.26, 0.022, 0.12, P.fire, 0, B + 0.15, 0.44, 0.006); k.win(0.18, 0.1, 0, B + 0.06, 0.404, 0, true);
    // Ambulance
    k.box(0.16, 0.085, 0.085, P.snow, 0.3, B + 0.012, 0.44, 0.015, 0); k.box(0.165, 0.016, 0.088, P.fire, 0.3, B + 0.045, 0.44, 0, 0);
    k.bush(-0.4, 0.44);
  },
  fire(k) {
    k.lot(P.paveD);
    k.box(0.78, 0.3, 0.52, P.fire, 0, B, -0.02, 0.03); k.box(0.82, 0.05, 0.56, P.snow, 0, B + 0.29, -0.02, 0.012);
    for (let i = 0; i < 3; i++) { k.box(0.17, 0.2, 0.012, P.snow, -0.23 + i * 0.23, B, 0.242, 0); for (let j = 1; j < 4; j++) k.box(0.17, 0.006, 0.014, P.metal, -0.23 + i * 0.23, B + j * 0.05, 0.243, 0); }
    k.wins(0.78, 0.52, B + 0.1, 0.12, 1, 0, 0, -0.02, 3);
    k.box(0.2, 0.74, 0.2, P.fire, -0.28, B, -0.3, 0.025); k.box(0.24, 0.05, 0.24, P.snow, -0.28, B + 0.73, -0.3, 0.012); k.wins(0.2, 0.2, B + 0.34, 0.34, 2, 1, -0.28, -0.3);
    k.cyl(0.03, 0.03, P.amber, -0.28, B + 0.78, -0.3, 0.03, 8);
    // Camion de pompiers
    k.box(0.24, 0.1, 0.1, P.fire, 0.16, B + 0.012, 0.4, 0.015); k.box(0.08, 0.075, 0.095, P.snow, 0.3, B + 0.012, 0.4, 0.012);
    k.box(0.2, 0.012, 0.03, P.metal, 0.14, B + 0.115, 0.4, 0);
  },
  // ── Tourisme, transports et bâtiments spéciaux ──
  museum(k) {
    k.lot(P.pave);
    k.box(0.84, 0.06, 0.8, P.stone, 0, B, 0, 0.015); k.box(0.5, 0.04, 0.1, P.concrete, 0, B + 0.03, 0.38, 0.008);
    k.box(0.72, 0.36, 0.5, P.cream, 0, B + 0.06, -0.1, 0.03);
    for (let i = 0; i < 6; i++) k.cyl(0.026, 0.32, P.snow, -0.3 + i * 0.12, B + 0.06, 0.2, 0.023, 10);
    k.box(0.78, 0.05, 0.16, P.stone, 0, B + 0.38, 0.2, 0.01);
    k.gable(0.16, 0.78, 0.12, P.stone, 0, B + 0.43, 0.2, Math.PI / 2);
    k.box(0.76, 0.05, 0.54, P.stone, 0, B + 0.42, -0.1, 0.012);
    // Verrière en pyramide
    k.hip(0.36, 0.36, 0.24, P.glassL, 0, B + 0.47, -0.14); k.box(0.38, 0.02, 0.38, P.glassD, 0, B + 0.46, -0.14, 0.006);
    k.box(0.05, 0.2, 0.012, P.fire, -0.18, B + 0.14, 0.156, 0); k.box(0.05, 0.2, 0.012, P.primary, 0.18, B + 0.14, 0.156, 0);
    k.box(0.1, 0.18, 0.012, P.door, 0, B + 0.06, 0.156, 0);
    k.wins(0.72, 0.5, B + 0.14, 0.2, 1, 0, 0, -0.1, 4);
    // Statue sur son socle
    k.cyl(0.045, 0.06, P.stone, 0.36, B + 0.06, 0.36, 0.045, 10); k.cyl(0.018, 0.09, P.gold, 0.36, B + 0.12, 0.36, 0.014, 8); k.ball(0.022, P.gold, 0.36, B + 0.225, 0.36);
    k.bush(-0.4, 0.42); k.tree(-0.4, -0.4, 0.6);
  },
  stadium(k) {
    k.lot(P.paveD);
    // Tribunes en anneau ovale autour de la pelouse
    const ring = (r: number, tube: number, c: number, y: number, sy: number) => {
      const g = new THREE.TorusGeometry(r, tube, 8, 28); g.rotateX(Math.PI / 2); g.scale(1, sy, 0.82); k.add(g, c, 0, y, 0);
    };
    ring(0.33, 0.1, P.concrete, B + 0.1, 1.5);
    ring(0.3, 0.075, P.primary, B + 0.17, 1.1);
    ring(0.37, 0.035, P.snow, B + 0.27, 0.7);
    k.box(0.42, 0.016, 0.26, P.lawn, 0, B + 0.05, 0, 0.004);
    k.box(0.004, 0.004, 0.26, P.snow, 0, B + 0.068, 0, 0); k.cyl(0.04, 0.003, P.snow, 0, B + 0.067, 0, 0.04, 16); k.cyl(0.034, 0.004, P.lawn, 0, B + 0.067, 0, 0.034, 16);
    k.box(0.006, 0.03, 0.07, P.snow, -0.2, B + 0.066, 0, 0); k.box(0.006, 0.03, 0.07, P.snow, 0.2, B + 0.066, 0, 0);
    // Projecteurs aux quatre coins
    for (const [x, z] of [[-0.4, -0.38], [0.4, -0.38], [-0.4, 0.38], [0.4, 0.38]] as const) {
      k.cyl(0.012, 0.5, P.steelL, x, B, z, 0.012, 6); k.box(0.09, 0.05, 0.02, P.snow, x, B + 0.5, z, 0.006, x * z > 0 ? -Math.PI / 4 : Math.PI / 4);
    }
    k.box(0.14, 0.09, 0.012, P.black, 0, B + 0.3, -0.34, 0.004); k.win(0.11, 0.06, 0, B + 0.345, -0.332, 0, true);
  },
  themepark(k) {
    k.lot(P.lawn);
    // Grande roue, tournée vers la caméra
    const wheel = (g: THREE.BufferGeometry, c: number) => k.add(g, c, -0.14, B + 0.5, -0.14, Math.PI / 4);
    const hues = [P.fire, P.gold, P.primary, P.teal, P.pink, P.orange, P.violet, P.green];
    // La roue tourne lentement ; ses nacelles sont rondes, pour ne jamais paraître à l'envers
    k.motion({ kind: "spin", axis: "z", ry: Math.PI / 4, at: [-0.14, B + 0.5, -0.14], amount: 0.035 }, (m) => {
      m.add(new THREE.TorusGeometry(0.34, 0.012, 6, 32), P.snow, 0, 0, 0);
      m.add(new THREE.TorusGeometry(0.28, 0.007, 6, 32), P.metal, 0, 0, 0);
      for (let i = 0; i < 4; i++) { const s = new THREE.BoxGeometry(0.68, 0.008, 0.008); s.rotateZ((i * Math.PI) / 4); m.add(s, P.steelL, 0, 0, 0); }
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; m.ball(0.036, hues[i], Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0, 0.9); }
    });
    k.ball(0.03, P.fire, -0.14, B + 0.5, -0.14);
    for (const s of [-1, 1]) { const leg = new THREE.BoxGeometry(0.018, 0.56, 0.018); leg.rotateZ(s * 0.3); leg.translate(s * 0.085, -0.27, 0); wheel(leg, P.steel); }
    // Chapiteau rayé
    k.cyl(0.17, 0.09, P.snow, 0.26, B, 0.22, 0.17, 14); k.cone(0.2, 0.2, P.fire, 0.26, B + 0.09, 0.22, 14);
    k.cone(0.2, 0.2, P.snow, 0.26, B + 0.0905, 0.22, 7); k.flag(0.26, B + 0.28, 0.22, 0.12, P.gold);
    // Manège
    k.cyl(0.11, 0.02, P.gold, -0.28, B, 0.3, 0.11, 14); k.cyl(0.012, 0.13, P.snow, -0.28, B + 0.02, 0.3, 0.012, 6); k.cone(0.13, 0.08, P.pink, -0.28, B + 0.14, 0.3, 14);
    k.motion({ kind: "spin", axis: "y", at: [-0.28, B + 0.02, 0.3], amount: 0.14 }, (m) => {
      for (let i = 0; i < 4; i++) { const x = Math.cos(i * 1.57) * 0.075, z = Math.sin(i * 1.57) * 0.075; m.ball(0.02, hues[i + 2], x, 0.035, z); m.cyl(0.004, 0.11, P.gold, x, 0.02, z, 0.004, 4); }
    });
    k.box(0.1, 0.07, 0.08, P.orange, 0.34, B, -0.3, 0.012); k.box(0.12, 0.02, 0.1, P.snow, 0.34, B + 0.07, -0.3, 0.006);
    k.tree(0.4, -0.06, 0.6); k.bush(0.04, 0.4);
  },
  bizdistrict(k) {
    k.lot(P.pave);
    k.box(0.34, 1.7, 0.34, P.glassD, -0.24, B, -0.24, 0.045); k.bands(0.34, 0.34, B + 0.1, 1.56, 9, P.glassL, -0.24, -0.24);
    k.box(0.2, 0.16, 0.2, P.steel, -0.24, B + 1.69, -0.24, 0.02); k.cyl(0.008, 0.22, P.fire, -0.24, B + 1.85, -0.24, 0.008, 6);
    k.box(0.32, 1.16, 0.3, P.glass, 0.22, B, -0.26, 0.04); k.bands(0.32, 0.3, B + 0.1, 1.02, 6, P.snow, 0.22, -0.26);
    k.box(0.36, 0.05, 0.34, P.white, 0.22, B + 1.14, -0.26, 0.015); k.roofUnit(0.2, B + 1.19, -0.28);
    k.box(0.3, 0.78, 0.3, P.aqua, -0.22, B, 0.22, 0.04); k.bands(0.3, 0.3, B + 0.08, 0.66, 4, P.glass, -0.22, 0.22);
    k.box(0.34, 0.05, 0.34, P.glassD, -0.22, B + 0.76, 0.22, 0.015); k.box(0.16, 0.012, 0.16, P.fire, -0.22, B + 0.81, 0.22, 0.004);
    k.win(0.14, 0.09, -0.22, B + 0.055, 0.374, 0, true); k.win(0.16, 0.09, 0.22, B + 0.055, -0.106, 0, true);
    // Parvis
    k.cyl(0.09, 0.03, P.stone, 0.26, B, 0.26, 0.09, 14); k.cyl(0.07, 0.012, P.water, 0.26, B + 0.03, 0.26, 0.07, 14);
    k.tree(0.42, 0.06, 0.6); k.bush(0.06, 0.42); k.car(0.26, 0.44, P.black, 0);
  },
  recycling(k) {
    k.lot(P.paveD);
    k.box(0.6, 0.26, 0.4, P.green, -0.12, B, -0.22, 0.03); k.barrel(0.6, 0.2, P.metal, -0.12, B + 0.25, -0.22, 0, 0.3);
    k.box(0.62, 0.05, 0.42, P.snow, -0.12, B + 0.15, -0.22, 0.01);
    k.box(0.16, 0.15, 0.012, P.steel, -0.24, B, -0.016, 0); k.box(0.16, 0.15, 0.012, P.steel, -0.02, B, -0.016, 0);
    // Tapis de tri incliné
    { const g = rbox(0.4, 0.03, 0.08, 0.008); g.rotateZ(0.42); k.add(g, P.black, 0.3, B + 0.1, -0.24); }
    k.cyl(0.012, 0.19, P.steelL, 0.42, B, -0.24, 0.012, 6); k.cyl(0.012, 0.08, P.steelL, 0.2, B, -0.24, 0.012, 6);
    // Bennes de tri, une couleur par matière
    for (const [i, c] of [P.yellow, P.primary, P.fire, P.leaf].entries()) {
      k.box(0.15, 0.1, 0.11, c, -0.33 + i * 0.2, B, 0.18, 0.015); k.box(0.16, 0.02, 0.12, P.steel, -0.33 + i * 0.2, B + 0.1, 0.18, 0.006);
    }
    // Camion-benne
    k.box(0.2, 0.1, 0.1, P.leafL, -0.02, B + 0.02, 0.38, 0.015); k.box(0.08, 0.08, 0.095, P.snow, 0.13, B + 0.02, 0.38, 0.012);
    k.tree(0.4, 0.38, 0.75); k.bush(-0.42, 0.4);
  },
  port(k) {
    k.lot(P.paveD);
    // Bassin et navire
    k.box(0.94, 0.03, 0.36, P.water, 0, B - 0.004, 0.29, 0.01); k.box(0.94, 0.05, 0.05, P.concrete, 0, B, 0.1, 0.008);
    k.box(0.56, 0.08, 0.16, P.navy, -0.08, B + 0.02, 0.32, 0.03); k.box(0.56, 0.015, 0.17, P.fire, -0.08, B + 0.02, 0.32, 0.004);
    k.box(0.1, 0.12, 0.13, P.snow, -0.3, B + 0.1, 0.32, 0.015); k.cyl(0.018, 0.06, P.fire, -0.3, B + 0.22, 0.32, 0.018, 8);
    for (const [i, c] of [P.fire, P.primary, P.gold, P.teal].entries()) k.box(0.085, 0.06, 0.13, c, -0.17 + i * 0.095, B + 0.1, 0.32, 0.006);
    k.box(0.085, 0.06, 0.13, P.orange, -0.075, B + 0.16, 0.32, 0.006);
    // Portique de quai
    for (const x of [0.16, 0.42]) { k.box(0.025, 0.5, 0.025, P.orange, x, B, 0.02, 0.004); k.box(0.025, 0.5, 0.025, P.orange, x, B, -0.14, 0.004); k.box(0.03, 0.03, 0.2, P.orange, x, B + 0.48, -0.06, 0.004); }
    k.box(0.32, 0.035, 0.035, P.orange, 0.29, B + 0.5, -0.06, 0.004); k.box(0.035, 0.035, 0.62, P.fire, 0.29, B + 0.535, 0.1, 0.004);
    k.motion({ kind: "slide", at: [0.29, B + 0.47, -0.08], to: [0.29, B + 0.47, 0.3], period: 11 }, (m) => {
      m.box(0.06, 0.05, 0.06, P.snow, 0, 0, 0, 0.008); m.cyl(0.004, 0.16, P.steel, 0, -0.16, 0, 0.004, 4); m.box(0.085, 0.055, 0.12, P.teal, 0, -0.21, 0, 0.006);
    });
    // Conteneurs empilés et entrepôt
    for (const [i, c] of [P.primary, P.fire, P.green].entries()) k.box(0.2, 0.07, 0.09, c, -0.32, B + i * 0.07, -0.02, 0.006);
    k.box(0.2, 0.07, 0.09, P.gold, -0.1, B, -0.02, 0.006); k.box(0.2, 0.07, 0.09, P.teal, -0.1, B + 0.07, -0.02, 0.006);
    k.box(0.52, 0.2, 0.24, P.metal, -0.18, B, -0.32, 0.025); k.barrel(0.52, 0.12, P.steelL, -0.18, B + 0.19, -0.32, 0, 0.35);
  },
  workshop(k) {
    k.lot(P.paveD);
    k.box(0.74, 0.26, 0.4, P.concrete, 0, B, -0.24, 0.03); k.box(0.76, 0.06, 0.42, P.orange, 0, B + 0.2, -0.24, 0.01);
    k.box(0.78, 0.03, 0.44, P.steel, 0, B + 0.26, -0.24, 0.01);
    for (let i = 0; i < 3; i++) { k.box(0.18, 0.17, 0.012, P.yellow, -0.24 + i * 0.24, B, -0.036, 0); for (let j = 1; j < 4; j++) k.box(0.18, 0.005, 0.014, P.black, -0.24 + i * 0.24, B + j * 0.042, -0.035, 0); }
    k.roofUnit(-0.2, B + 0.29, -0.26); k.cyl(0.02, 0.14, P.steelL, 0.26, B + 0.29, -0.3, 0.02, 8);
    // Camion-nacelle et matériaux
    k.box(0.22, 0.09, 0.1, P.orange, -0.2, B + 0.02, 0.26, 0.015); k.box(0.08, 0.08, 0.095, P.snow, -0.05, B + 0.02, 0.26, 0.012);
    { const arm = new THREE.BoxGeometry(0.22, 0.014, 0.014); arm.rotateZ(0.8); k.add(arm, P.steelL, -0.2, B + 0.19, 0.26); }
    k.box(0.06, 0.05, 0.06, P.snow, -0.12, B + 0.26, 0.26, 0.008);
    k.cone(0.07, 0.07, P.sand, 0.22, B, 0.2, 10); k.cone(0.06, 0.06, P.stone, 0.36, B, 0.3, 10);
    for (let i = 0; i < 3; i++) k.cone(0.018, 0.045, P.orange, 0.06 + i * 0.07, B, 0.4, 8);
    k.box(0.16, 0.03, 0.06, P.wood, 0.3, B, 0.06, 0.004); k.box(0.16, 0.03, 0.06, P.wood, 0.3, B + 0.03, 0.06, 0.004);
  },
  station(k) {
    k.lot(P.paveD);
    // Halle des voyageurs sous verrière
    k.box(0.82, 0.24, 0.34, P.brick, 0.04, B, -0.26, 0.03); k.barrel(0.82, 0.17, P.glassL, 0.04, B + 0.23, -0.26, 0, 0.7);
    k.box(0.84, 0.03, 0.36, P.brickD, 0.04, B + 0.22, -0.26, 0.008);
    k.wins(0.82, 0.34, B + 0.05, 0.15, 1, 5, 0.04, -0.26, 2); k.box(0.12, 0.16, 0.012, P.door, 0.1, B, -0.086, 0);
    // Tour de l'horloge
    k.box(0.16, 0.56, 0.16, P.cream, -0.34, B, -0.06, 0.02); k.hip(0.2, 0.2, 0.14, P.tileD, -0.34, B + 0.56, -0.06);
    k.cyl(0.05, 0.012, P.snow, -0.34, B + 0.4, 0.022, 0.05, 14); k.box(0.006, 0.04, 0.004, P.black, -0.34, B + 0.4, 0.03, 0);
    // Quai, voies et train
    k.box(0.94, 0.035, 0.1, P.concrete, 0, B, 0.12, 0.008); k.box(0.94, 0.008, 0.24, P.stone, 0, B, 0.32, 0);
    for (const z of [0.27, 0.37]) k.box(0.94, 0.012, 0.012, P.steel, 0, B + 0.008, z, 0);
    for (let i = 0; i < 9; i++) k.box(0.02, 0.006, 0.14, P.wood, -0.4 + i * 0.1, B + 0.006, 0.32, 0);
    k.motion({ kind: "slide", at: [-0.2, B + 0.025, 0.32], to: [0.2, B + 0.025, 0.32], period: 16 }, (m) => {
      m.box(0.26, 0.1, 0.1, P.primary, -0.135, 0, 0, 0.025); m.box(0.26, 0.1, 0.1, P.snow, 0.135, 0, 0, 0.025);
      m.box(0.27, 0.02, 0.102, P.fire, 0.135, 0.025, 0, 0.004); m.box(0.02, 0.03, 0.04, P.steel, 0, 0.03, 0, 0.004);
      m.box(0.2, 0.03, 0.104, P.glassL, -0.135, 0.055, 0, 0.004); m.box(0.2, 0.03, 0.104, P.glassL, 0.135, 0.055, 0, 0.004);
    });
    for (const x of [-0.2, 0.2]) { k.cyl(0.008, 0.16, P.steel, x, B + 0.035, 0.12, 0.008, 6); k.box(0.2, 0.012, 0.1, P.steelL, x, B + 0.19, 0.12, 0.004); }
  },
  police(k) {
    k.lot(P.pave);
    k.box(0.72, 0.4, 0.48, P.slate, 0, B, -0.14, 0.03); k.box(0.76, 0.06, 0.52, P.snow, 0, B + 0.38, -0.14, 0.012);
    k.box(0.74, 0.05, 0.5, P.navy, 0, B + 0.2, -0.14, 0.008);
    k.wins(0.72, 0.48, B + 0.06, 0.3, 2, 4, 0, -0.14, 3); k.box(0.12, 0.17, 0.012, P.door, 0, B, 0.104, 0);
    k.box(0.3, 0.02, 0.12, P.navy, 0, B + 0.18, 0.15, 0.006); k.box(0.2, 0.06, 0.014, P.snow, 0, B + 0.24, 0.106, 0.004);
    // Antenne et gyrophare
    k.cyl(0.012, 0.34, P.steelL, 0.26, B + 0.44, -0.28, 0.008, 6); k.cyl(0.05, 0.012, P.steelL, 0.26, B + 0.62, -0.28, 0.05, 10);
    k.cyl(0.03, 0.04, P.primary, -0.24, B + 0.44, -0.04, 0.03, 10); k.flag(-0.26, B + 0.44, -0.3, 0.3, P.primary);
    // Voitures de patrouille
    for (const x of [-0.24, 0.2]) { k.car(x, 0.34, P.snow, 0); k.box(0.172, 0.014, 0.092, P.navy, x, B + 0.03, 0.34, 0.004); k.box(0.03, 0.012, 0.05, P.fire, x - 0.01, B + 0.098, 0.34, 0.003); }
    k.bush(0.42, 0.1); k.bush(-0.42, 0.1);
  },
  airport(k) {
    k.lot(P.paveD);
    // Piste
    k.box(0.94, 0.008, 0.34, P.asphalt, 0, B, 0.28, 0);
    for (let i = 0; i < 5; i++) k.box(0.09, 0.004, 0.014, P.snow, -0.36 + i * 0.18, B + 0.008, 0.28, 0);
    for (const z of [0.13, 0.43]) k.box(0.94, 0.004, 0.008, P.gold, 0, B + 0.008, z, 0);
    // Aérogare
    k.box(0.6, 0.2, 0.26, P.glass, -0.14, B, -0.28, 0.04); k.barrel(0.6, 0.13, P.snow, -0.14, B + 0.19, -0.28, 0, 0.55);
    k.box(0.62, 0.025, 0.28, P.glassD, -0.14, B + 0.1, -0.28, 0.008); k.win(0.5, 0.06, -0.14, B + 0.05, -0.146, 0, true);
    k.box(0.1, 0.05, 0.16, P.steelL, -0.3, B + 0.07, -0.08, 0.01); k.box(0.1, 0.05, 0.16, P.steelL, 0, B + 0.07, -0.08, 0.01);
    // Tour de contrôle
    k.cyl(0.05, 0.6, P.snow, 0.34, B, -0.3, 0.038, 10); k.cyl(0.07, 0.09, P.glassD, 0.34, B + 0.6, -0.3, 0.09, 10);
    k.cyl(0.1, 0.02, P.snow, 0.34, B + 0.69, -0.3, 0.1, 10); k.cyl(0.006, 0.12, P.fire, 0.34, B + 0.71, -0.3, 0.006, 5);
    // Avion sur la piste
    k.motion({ kind: "pass", at: [-0.24, B + 0.035, 0.28], to: [0.3, B + 0.26, 0.28], period: 13 }, (m) => {
      m.box(0.3, 0.055, 0.055, P.snow, 0, 0, 0, 0.026); m.box(0.07, 0.01, 0.32, P.snow, -0.01, 0.02, 0, 0.004);
      m.box(0.045, 0.08, 0.012, P.fire, -0.13, 0.04, 0, 0.004); m.box(0.035, 0.01, 0.12, P.snow, -0.13, 0.036, 0, 0.004);
      m.box(0.31, 0.012, 0.057, P.primary, 0, 0.02, 0, 0.004); m.box(0.18, 0.014, 0.058, P.glassD, 0.03, 0.036, 0, 0.003);
      for (const z of [-0.08, 0.08]) m.cyl(0.013, 0.045, P.steel, -0.01, -0.012, z, 0.013, 8);
    });
  },
};

// ─── Finitions : détails et petites animations ajoutés à chaque maquette ───
// Même esprit que le reste (volumes simples, couleurs franches) : du mobilier, des toits habités, et une chose qui bouge
// là où elle raconte le bâtiment (un train à quai, une grande roue, un gyrophare).

/** Chariot élévateur qui fait des allers-retours le long d'un quai. */
function forklift(k: Kit, x0: number, x1: number, z: number, period = 8) {
  k.motion({ kind: "slide", at: [x0, B, z], to: [x1, B, z], period }, (m) => {
    m.box(0.075, 0.04, 0.05, P.orange, 0, 0.012, 0, 0.01); m.box(0.035, 0.05, 0.045, P.black, -0.018, 0.05, 0, 0.006);
    m.box(0.008, 0.09, 0.04, P.steel, 0.04, 0.012, 0, 0); m.box(0.05, 0.035, 0.04, P.wood, 0.07, 0.03, 0, 0.005);
  });
}
/** Petit véhicule de chantier ou tracteur qui va et vient. */
function rover(k: Kit, from: V3, to: V3, body: number, period: number, cab: number = P.black) {
  k.motion({ kind: "slide", at: from, to, period }, (m) => {
    m.box(0.1, 0.045, 0.06, body, 0, 0.022, 0, 0.012); m.box(0.045, 0.045, 0.055, cab, -0.022, 0.062, 0, 0.008);
    for (const x of [-0.03, 0.035]) for (const z of [-0.032, 0.032]) m.cyl(0.018, 0.012, P.black, x, 0.004, z, 0.018, 8);
  });
}
/** Roue à pales (éolienne de pompage, ventilateur) tournée vers la caméra. */
function fan(k: Kit, x: number, y: number, z: number, r: number, c: number, speed = 0.5, blades = 6) {
  k.motion({ kind: "spin", axis: "z", ry: Math.PI / 4, at: [x, y, z], amount: speed }, (m) => {
    for (let i = 0; i < blades; i++) { const g = new THREE.BoxGeometry(r, r * 0.34, 0.006); g.translate(r * 0.56, 0, 0); g.rotateZ((i * Math.PI * 2) / blades); m.add(g, c, 0, 0, 0); }
    m.ball(r * 0.16, P.steel, 0, 0, 0, 1, 0);
  });
}

const EXTRA: Record<string, (k: Kit) => void> = {
  village(k) {
    k.fence(-0.46, 0.46, -0.06, 0.46); k.fence(0.08, 0.46, 0.46, 0.46);
    k.flowers(-0.12, 0.12, P.pink); k.flowers(0.12, -0.1, P.gold);
    // Corde à linge
    k.cyl(0.006, 0.1, P.wood, -0.42, B, -0.08, 0.006, 5); k.cyl(0.006, 0.1, P.wood, -0.42, B, 0.1, 0.006, 5);
    k.box(0.004, 0.004, 0.18, P.snow, -0.42, B + 0.095, 0.01, 0);
    for (const [i, c] of [P.fire, P.snow, P.primary].entries()) k.box(0.006, 0.04, 0.03, c, -0.42, B + 0.055, -0.04 + i * 0.05, 0);
    k.lamp(0.08, 0.08, 0.16);
  },
  house_s(k) {
    k.fence(-0.46, 0.46, -0.2, 0.46); k.fence(-0.06, 0.46, 0.18, 0.46); k.fence(0.32, 0.46, 0.46, 0.46);
    k.flowers(-0.32, 0.02, P.pink); k.flowers(0.08, 0.3, P.gold, 2);
    // Boîte aux lettres, table de jardin et parasol
    k.cyl(0.006, 0.06, P.steel, -0.19, B, 0.42, 0.006, 5); k.box(0.035, 0.025, 0.025, P.fire, -0.19, B + 0.06, 0.42, 0.005);
    k.cyl(0.035, 0.008, P.snow, 0.02, B + 0.045, -0.3, 0.035, 10); k.cyl(0.005, 0.12, P.steel, 0.02, B, -0.3, 0.005, 5); k.cone(0.07, 0.035, P.orange, 0.02, B + 0.11, -0.3, 10);
    k.car(0.4, 0.3, P.teal, Math.PI / 2);
  },
  house_m(k) {
    for (let r = 0; r < 3; r++) k.box(0.17, 0.018, 0.03, P.leafL, -0.04, B + 0.31 + r * 0.19, 0.262, 0.005);
    // Citerne et antennes sur le toit
    k.cyl(0.06, 0.09, P.wood, 0.1, B + 0.92, 0.08, 0.06, 10); k.cone(0.068, 0.04, P.steel, 0.1, B + 1.01, 0.08, 10);
    k.mast(-0.24, B + 0.9, 0.14, 0.16);
    k.lamp(-0.4, 0.14); k.bench(0.12, 0.4);
    k.box(0.05, 0.05, 0.05, P.steelL, 0.244, B + 0.3, -0.2, 0.006); k.box(0.05, 0.05, 0.05, P.steelL, 0.244, B + 0.5, 0.1, 0.006);
  },
  house_l(k) {
    k.mast(-0.12, B + 1.46, -0.12, 0.22);
    // Pergola du toit-jardin, auvents d'entrée
    for (const [x, z] of [[0.12, 0.1], [0.32, 0.1], [0.12, 0.3], [0.32, 0.3]] as const) k.cyl(0.006, 0.09, P.wood, x, B + 1.06, z, 0.006, 5);
    k.box(0.24, 0.01, 0.24, P.wood, 0.22, B + 1.15, 0.2, 0.004);
    k.box(0.14, 0.02, 0.07, P.tile, 0.22, B + 0.16, 0.41, 0.006); k.box(0.07, 0.12, 0.012, P.door, 0.22, B, 0.382, 0);
    k.box(0.07, 0.02, 0.14, P.slate, 0.0, B + 0.16, -0.21, 0.006);
    k.lamp(0.42, -0.3); k.flowers(-0.08, 0.38, P.pink); k.car(0.3, -0.3, P.red, 0);
    k.lift(-0.21, B + 0.2, B + 1.25, -0.015);
  },
  house_eco(k) {
    // Petite éolienne de toit à axe vertical, mur végétal, potager
    k.cyl(0.006, 0.12, P.steelL, -0.34, B + 0.78, -0.34, 0.006, 5);
    k.motion({ kind: "spin", axis: "y", at: [-0.34, B + 0.9, -0.34], amount: 0.6 }, (m) => { for (let i = 0; i < 3; i++) m.box(0.012, 0.1, 0.05, P.snow, Math.cos(i * 2.094) * 0.035, 0, Math.sin(i * 2.094) * 0.035, 0.004, -i * 2.094); });
    k.box(0.012, 0.46, 0.12, P.leafL, 0.004, B + 0.14, -0.3, 0.004); k.box(0.012, 0.3, 0.1, P.leaf, 0.416, B + 0.12, 0.26, 0.004);
    k.box(0.16, 0.02, 0.12, P.soil, -0.34, B, 0.08, 0.006);
    for (let i = 0; i < 3; i++) { k.ball(0.018, P.crop, -0.39 + i * 0.05, B + 0.026, 0.05, 1, 0); k.ball(0.016, P.red, -0.39 + i * 0.05, B + 0.026, 0.11, 1, 0); }
    k.cyl(0.03, 0.07, P.teal, -0.42, B, -0.06, 0.03, 8);
    k.lamp(0.42, -0.06, 0.16); k.bench(0.1, 0.42);
  },
  house_xl(k) {
    k.mast(0.14, B + 2.3, -0.14, 0.2);
    // Terrasse du socle : bassin, parasols
    k.box(0.13, 0.014, 0.3, P.stone, 0.33, B + 0.368, -0.08, 0.006); k.box(0.1, 0.014, 0.26, P.water, 0.33, B + 0.372, -0.08, 0.006);
    for (const z of [-0.3, -0.14]) { k.cyl(0.004, 0.09, P.steel, -0.33, B + 0.37, z, 0.004, 5); k.cone(0.06, 0.03, z < -0.2 ? P.fire : P.gold, -0.33, B + 0.45, z, 10); }
    k.box(0.3, 0.02, 0.12, P.teal, 0, B + 0.2, 0.46, 0.006);
    k.lift(0.245, B + 0.5, B + 2.05, 0.0, Math.PI / 2, 11);
  },
  house_tower(k) {
    k.beacon(0, B + 3.86, 0, P.red, 0.03, 1.6);
    k.lift(0.0, B + 0.42, B + 2.45, 0.303, 0, 12);
    // Jardin suspendu au retrait de la tour
    for (const [x, z] of [[0.24, 0.24], [-0.24, 0.24], [0.24, -0.24]] as const) { k.box(0.1, 0.03, 0.1, P.lawnD, x, B + 2.6, z, 0.01); k.tree(x, z, 0.4, x < 0, B + 2.62); }
    k.box(0.26, 0.02, 0.1, P.glassD, 0, B + 0.17, 0.46, 0.006); k.lamp(0.42, 0.44, 0.14); k.lamp(-0.42, 0.44, 0.14);
  },
  shop(k) {
    // Ardoise sur le trottoir, enseigne tournante, lampadaire
    { const a = rbox(0.05, 0.07, 0.008, 0.002); a.rotateX(0.3); k.add(a, P.black, 0.06, B, 0.37); const b = rbox(0.05, 0.07, 0.008, 0.002); b.rotateX(-0.3); k.add(b, P.black, 0.06, B, 0.41); }
    k.cyl(0.006, 0.1, P.steel, 0.24, B + 0.31, -0.22, 0.006, 5);
    k.motion({ kind: "spin", axis: "y", at: [0.24, B + 0.41, -0.22], amount: 0.12 }, (m) => { m.box(0.12, 0.08, 0.02, P.gold, 0, 0, 0, 0.006); m.box(0.08, 0.03, 0.024, P.violet, 0, 0.025, 0, 0.004); });
    k.lamp(0.42, 0.12); k.bench(-0.1, 0.42);
    k.box(0.06, 0.05, 0.06, P.wood, -0.26, B, 0.34, 0.006); k.ball(0.028, P.crop, -0.26, B + 0.07, 0.34);
  },
  market(k) {
    // Guirlande de fanions devant les étals
    k.cyl(0.006, 0.27, P.wood, -0.42, B, 0.45, 0.006, 5); k.cyl(0.006, 0.27, P.wood, 0.42, B, 0.45, 0.006, 5);
    k.box(0.84, 0.004, 0.004, P.snow, 0, B + 0.265, 0.45, 0);
    for (const [i, c] of [P.fire, P.gold, P.teal, P.primary, P.pink, P.orange, P.green, P.fire, P.gold].entries()) k.box(0.035, 0.04, 0.004, c, -0.36 + i * 0.09, B + 0.225, 0.45, 0);
    k.box(0.07, 0.05, 0.07, P.wood, 0.38, B, 0.16, 0.006); k.box(0.07, 0.05, 0.07, P.wood, 0.38, B + 0.05, 0.16, 0.006); k.ball(0.024, P.red, 0.38, B + 0.115, 0.16);
    k.disc(0.045, P.snow, 0.404, B + 0.3, -0.08, Math.PI / 2);
  },
  hotel(k) {
    for (let i = 0; i < 5; i++) k.box(0.045, 0.07, 0.012, P.gold, -0.2 + i * 0.07, B + 1.47, 0.07, 0.003);
    // Porte tambour, piscine et transats
    k.motion({ kind: "spin", axis: "y", at: [0, B + 0.01, 0.43], amount: 0.22 }, (m) => { m.box(0.1, 0.11, 0.006, P.glassL, 0, 0, 0, 0); m.box(0.006, 0.11, 0.1, P.glassL, 0, 0, 0, 0); });
    k.box(0.22, 0.016, 0.3, P.stone, 0.34, B, -0.16, 0.008); k.box(0.18, 0.016, 0.26, P.water, 0.34, B + 0.004, -0.16, 0.008);
    k.cyl(0.004, 0.1, P.steel, 0.4, B, 0.05, 0.004, 5); k.cone(0.06, 0.03, P.fire, 0.4, B + 0.09, 0.05, 10);
    k.box(0.07, 0.014, 0.03, P.snow, 0.3, B + 0.01, 0.05, 0.004);
    k.mast(0.08, B + 1.44, -0.3, 0.18); k.lamp(-0.42, 0.3); k.lamp(0.42, 0.3);
  },
  mall(k) {
    // Enseigne tournante sur le toit, ballons à l'entrée
    k.cyl(0.008, 0.13, P.steel, -0.3, B + 0.35, -0.34, 0.008, 5);
    k.motion({ kind: "spin", axis: "y", at: [-0.3, B + 0.48, -0.34], amount: 0.1 }, (m) => { m.box(0.13, 0.09, 0.13, P.pink, 0, 0, 0, 0.012); m.box(0.135, 0.03, 0.135, P.snow, 0, 0.03, 0, 0.004); });
    k.motion({ kind: "bob", at: [0.36, B + 0.16, 0.18], amount: 0.018, period: 3.2 }, (m) => { m.ball(0.03, P.fire, 0, 0.05, 0); m.ball(0.028, P.gold, 0.035, 0.03, 0.01); m.ball(0.028, P.primary, -0.03, 0.025, 0.012); m.cyl(0.003, 0.12, P.snow, 0, -0.1, 0, 0.003, 4); });
    k.box(0.36, 0.02, 0.1, P.violet, 0, B + 0.19, 0.2, 0.006);
    k.lamp(-0.44, 0.22, 0.22); k.lamp(0.44, 0.22, 0.22);
    k.box(0.05, 0.03, 0.03, P.metal, -0.08, B + 0.012, 0.44, 0.004); k.box(0.05, 0.03, 0.03, P.metal, -0.14, B + 0.012, 0.44, 0.004);
  },
  services(k) {
    k.mast(-0.16, B + 1.46, 0.14, 0.2);
    k.cyl(0.006, 0.05, P.steel, 0.16, B + 1.46, 0.14, 0.006, 5); k.cone(0.05, 0.03, P.snow, 0.16, B + 1.5, 0.14, 10);
    // Nacelle de lavage de vitres
    k.box(0.004, 1.2, 0.004, P.steel, 0.286, B + 0.24, -0.02, 0); k.box(0.004, 1.2, 0.004, P.steel, 0.286, B + 0.24, 0.12, 0);
    k.motion({ kind: "slide", at: [0.29, B + 0.3, 0.05], to: [0.29, B + 1.2, 0.05], period: 14 }, (m) => { m.box(0.03, 0.04, 0.16, P.metal, 0, 0, 0, 0.006); m.ball(0.014, P.orange, 0.004, 0.055, 0.03, 1, 0); });
    k.flowers(-0.2, 0.42, P.gold); k.lamp(0.42, 0.1);
  },
  bank(k) {
    k.disc(0.04, P.snow, 0, B + 0.555, 0.345); k.box(0.004, 0.03, 0.004, P.black, 0, B + 0.555, 0.353, 0);
    // Pièce d'or qui tourne au-dessus de l'entrée
    k.motion({ kind: "spin", axis: "y", at: [0, B + 0.84, -0.1], amount: 0.2 }, (m) => { const g = new THREE.CylinderGeometry(0.06, 0.06, 0.014, 18); g.rotateX(Math.PI / 2); m.add(g, P.gold, 0, 0, 0); });
    k.lamp(-0.32, 0.44, 0.18); k.lamp(0.32, 0.44, 0.18);
    k.flag(0.3, B + 0.56, -0.3, 0.22, P.navy);
    // Fourgon blindé
    k.box(0.15, 0.08, 0.085, P.navy, -0.2, B + 0.082, 0.44, 0.012); k.box(0.155, 0.014, 0.088, P.gold, -0.2, B + 0.11, 0.44, 0.003);
  },
  tech(k) {
    // Drone en vol stationnaire, tondeuse robot
    k.motion({ kind: "bob", at: [0.12, B + 0.78, 0.02], amount: 0.035, period: 3 }, (m) => {
      m.box(0.05, 0.02, 0.05, P.black, 0, 0, 0, 0.006);
      for (const [x, z] of [[0.045, 0.045], [-0.045, 0.045], [0.045, -0.045], [-0.045, -0.045]] as const) { m.cyl(0.026, 0.004, P.steelL, x, 0.022, z, 0.026, 10); m.box(0.004, 0.004, 0.06, P.steel, x / 2, 0.012, z / 2, 0, Math.atan2(x, z)); }
    });
    rover(k, [0.14, B + 0.02, -0.34], [0.4, B + 0.02, -0.34], P.orange, 9);
    k.mast(-0.36, B + 0.56, -0.36, 0.16);
    // Bornes de recharge et voiture
    k.box(0.02, 0.07, 0.02, P.teal, -0.3, B, 0.45, 0.004); k.box(0.02, 0.07, 0.02, P.teal, -0.18, B, 0.45, 0.004);
    k.lamp(0.44, 0.44, 0.16); k.bench(0.3, 0.02, Math.PI / 2);
  },
  townhall(k) {
    k.disc(0.045, P.snow, 0, B + 0.61, 0.024); k.box(0.004, 0.035, 0.004, P.black, 0, B + 0.61, 0.033, 0);
    for (const [x, c] of [[-0.3, P.primary], [-0.26, P.snow], [-0.22, P.fire], [0.22, P.primary], [0.26, P.snow], [0.3, P.fire]] as const) k.box(0.035, 0.13, 0.006, c, x, B + 0.2, 0.206, 0);
    k.lamp(-0.3, 0.44, 0.18); k.lamp(0.3, 0.44, 0.18);
    k.flowers(-0.16, 0.45, P.fire, 2); k.flowers(0.16, 0.45, P.gold, 2);
    k.bench(-0.42, 0.2, Math.PI / 2);
  },
  branch(k) {
    k.box(0.05, 0.22, 0.05, P.primary, 0.4, B, 0.1, 0.008); k.box(0.06, 0.06, 0.06, P.snow, 0.4, B + 0.2, 0.1, 0.008);
    k.mast(0.2, B + 0.82, -0.2, 0.16);
    k.flag(-0.36, B, 0.2, 0.3, P.primary); k.flag(-0.28, B, 0.2, 0.3, P.gold);
    k.lamp(0.2, 0.44); k.flowers(0.2, 0.3, P.gold, 2);
  },
  factory_s(k) { forklift(k, -0.3, 0.2, 0.44); k.box(0.3, 0.02, 0.08, P.steel, 0.18, B + 0.17, 0.4, 0.004); k.box(0.5, 0.03, 0.03, P.steelL, -0.05, B + 0.2, -0.2, 0.012); k.lamp(-0.42, 0.42); },
  factory_m(k) {
    forklift(k, -0.3, 0.2, 0.44); k.box(0.3, 0.02, 0.08, P.steel, 0.18, B + 0.19, 0.4, 0.004);
    k.box(0.5, 0.03, 0.03, P.steelL, -0.1, B + 0.22, -0.2, 0.012);
    k.cyl(0.06, 0.2, P.metal, 0.38, B, -0.3, 0.06, 12); k.ball(0.06, P.metal, 0.38, B + 0.2, -0.3, 0.5); k.box(0.006, 0.2, 0.02, P.steel, 0.44, B, -0.3, 0);
    k.lamp(-0.42, 0.42);
  },
  factory_l(k) {
    forklift(k, -0.34, 0.14, 0.45); k.beacon(0.3, B + 0.92, -0.33, P.red, 0.02);
    k.box(0.5, 0.03, 0.03, P.steelL, -0.1, B + 0.25, -0.2, 0.012); k.box(0.03, 0.2, 0.03, P.steelL, 0.16, B + 0.06, -0.2, 0.012);
    // Tapis roulant et caisses qui sortent de l'usine
    k.box(0.26, 0.02, 0.05, P.black, 0.3, B + 0.07, 0.12, 0.004); k.cyl(0.008, 0.07, P.steel, 0.2, B, 0.12, 0.008, 5); k.cyl(0.008, 0.07, P.steel, 0.4, B, 0.12, 0.008, 5);
    k.motion({ kind: "pass", at: [0.2, B + 0.09, 0.12], to: [0.4, B + 0.09, 0.12], period: 3.5 }, (m) => m.box(0.04, 0.035, 0.04, P.wood, 0, 0, 0, 0.004));
    k.lamp(-0.44, 0.3);
  },
  warehouse(k) {
    forklift(k, -0.14, 0.02, 0.44, 6);
    for (let i = 0; i < 3; i++) k.box(0.1, 0.012, 0.16, P.glassL, -0.26 + i * 0.26, B + 0.325, -0.12, 0.004);
    k.flag(-0.4, B + 0.26, -0.36, 0.2, P.primary); k.lamp(0.44, 0.2, 0.22);
    k.box(0.9, 0.006, 0.012, P.gold, 0, B + 0.006, 0.19, 0);
  },
  foodplant(k) {
    k.puff(0.16, B + 0.42, 0.16);
    // Camion-citerne en livraison, passerelle des silos
    k.motion({ kind: "slide", at: [-0.26, B, 0.44], to: [0.24, B, 0.44], period: 12 }, (m) => {
      const t = new THREE.CylinderGeometry(0.03, 0.03, 0.13, 10); t.rotateZ(Math.PI / 2); m.add(t, P.metal, -0.02, 0.045, 0);
      m.box(0.05, 0.055, 0.055, P.crop, 0.075, 0.012, 0, 0.008); for (const x of [-0.06, 0.02, 0.08]) m.cyl(0.014, 0.05, P.black, x, 0, 0.0, 0.014, 6);
    });
    k.box(0.008, 0.5, 0.008, P.steel, -0.38, B, -0.3, 0); k.box(0.008, 0.5, 0.008, P.steel, 0.04, B, -0.3, 0);
    k.lamp(0.44, 0.44, 0.16); k.box(0.06, 0.05, 0.06, P.wood, 0.4, B, -0.08, 0.006);
  },
  farm_s(k) {
    // Épouvantail, poules
    k.cyl(0.006, 0.12, P.wood, 0.0, B + 0.03, 0.18, 0.006, 5); k.box(0.1, 0.012, 0.012, P.wood, 0.0, B + 0.11, 0.18, 0); k.box(0.05, 0.05, 0.02, P.fire, 0.0, B + 0.07, 0.18, 0.004); k.ball(0.022, P.hay, 0.0, B + 0.15, 0.18, 1, 0);
    for (const [x, z] of [[0.06, -0.14], [0.12, -0.18], [0.02, -0.19]] as const) { k.ball(0.016, P.snow, x, B + 0.016, z, 0.9, 0); k.ball(0.008, P.fire, x + 0.012, B + 0.03, z, 1, 0); }
    k.fence(-0.46, -0.12, 0.1, -0.12);
    fan(k, -0.2, B + 0.3, -0.36, 0.07, P.snow, 0.4); k.cyl(0.008, 0.3, P.wood, -0.21, B, -0.37, 0.006, 5);
  },
  farm_m(k) {
    rover(k, [-0.34, B + 0.03, 0.25], [0.34, B + 0.03, 0.25], P.fire, 12, P.snow);
    fan(k, 0.41, B + 0.34, -0.02, 0.07, P.snow, 0.4); k.cyl(0.008, 0.34, P.wood, 0.4, B, -0.03, 0.006, 5);
    k.fence(0.0, -0.46, 0.46, -0.46);
    for (const [x, z] of [[0.04, -0.12], [0.1, -0.08]] as const) { k.ball(0.016, P.snow, x, B + 0.016, z, 0.9, 0); k.ball(0.008, P.fire, x + 0.012, B + 0.03, z, 1, 0); }
  },
  farm_l(k) {
    rover(k, [-0.34, B + 0.03, 0.25], [0.34, B + 0.03, 0.25], P.fire, 12, P.snow);
    k.box(0.16, 0.012, 0.012, P.steel, -0.02, B + 0.4, -0.37, 0); k.box(0.006, 0.42, 0.02, P.steel, 0.13, B, -0.36, 0);
    k.fence(0.0, -0.46, 0.46, -0.46);
    k.cyl(0.035, 0.07, P.hay, 0.16, B, 0.0, 0.035, 10); k.cyl(0.035, 0.07, P.hay, 0.16, B, -0.09, 0.035, 10); k.cyl(0.035, 0.07, P.hay, 0.16, B + 0.07, -0.045, 0.035, 10);
  },
  greenhouse(k) {
    // Ventilateurs en pignon, bacs de récolte
    for (let i = 0; i < 3; i++) fan(k, -0.29 + i * 0.29 + 0.004, B + 0.135, 0.412, 0.03, P.steelL, 0.9, 4);
    k.cyl(0.04, 0.12, P.teal, 0.44, B, -0.42, 0.04, 10);
    for (let i = 0; i < 3; i++) { k.box(0.05, 0.03, 0.035, P.wood, -0.38 + i * 0.07, B, 0.45, 0.004); k.ball(0.014, i % 2 ? P.red : P.crop, -0.38 + i * 0.07, B + 0.04, 0.45, 1, 0); }
  },
  ranch(k) {
    // Éolienne de pompage, abreuvoir, un veau qui se promène
    k.cyl(0.01, 0.36, P.steel, -0.02, B, -0.34, 0.006, 5); fan(k, -0.005, B + 0.37, -0.325, 0.085, P.snow, 0.5, 8);
    k.box(0.13, 0.03, 0.05, P.wood, -0.32, B, 0.34, 0.006); k.box(0.11, 0.008, 0.035, P.water, -0.32, B + 0.03, 0.34, 0.002);
    k.motion({ kind: "slide", at: [-0.28, B + 0.02, 0.0], to: [0.12, B + 0.02, 0.0], period: 15 }, (m) => { m.box(0.06, 0.035, 0.035, P.wood, 0, 0, 0, 0.01); m.box(0.026, 0.028, 0.028, P.snow, 0.04, 0.016, 0, 0.006); });
  },
  power_s(k) {
    k.fence(0.16, -0.42, 0.44, -0.42, P.steelL); k.fence(0.44, -0.42, 0.44, -0.16, P.steelL);
    k.box(0.14, 0.09, 0.1, P.snow, 0.3, B, -0.08, 0.012); k.box(0.142, 0.02, 0.102, P.amber, 0.3, B + 0.05, -0.08, 0.003);
    k.beacon(0.3, B + 0.1, -0.3, P.amber, 0.012, 2.2); k.bush(-0.42, 0.42); k.bush(-0.42, -0.42, 0.8);
  },
  power_m(k) {
    k.beacon(0.3, B + 0.97, -0.28, P.red, 0.02);
    // Pylône de départ de ligne
    for (const x of [0.06, 0.14]) k.cyl(0.006, 0.5, P.steel, x, B, -0.38, 0.004, 4);
    for (const y of [0.3, 0.42]) k.box(0.2, 0.008, 0.008, P.steel, 0.1, B + y, -0.38, 0);
    k.box(0.4, 0.03, 0.03, P.steelL, -0.2, B + 0.12, -0.2, 0.012);
    k.puff(-0.1, B + 0.45, 0.12); k.lamp(0.42, 0.06, 0.2);
  },
  power_l(k) {
    k.beacon(-0.09, B + 0.75, -0.2, P.red, 0.02, 1.7); k.beacon(0.35, B + 0.75, 0.16, P.red, 0.02, 2.1);
    k.box(0.2, 0.008, 0.008, P.steel, 0.3, B + 0.32, -0.32, 0); k.box(0.14, 0.008, 0.008, P.steel, 0.3, B + 0.4, -0.32, 0);
    k.box(0.03, 0.03, 0.3, P.steelL, -0.22, B + 0.1, 0.04, 0.012);
    k.fence(-0.46, 0.46, 0.0, 0.46, P.steelL); k.lamp(-0.44, 0.06, 0.2);
  },
  solar(k) {
    // Anémomètre sur le local technique
    k.cyl(0.005, 0.16, P.steel, 0.4, B + 0.1, 0.38, 0.005, 5);
    k.motion({ kind: "spin", axis: "y", at: [0.4, B + 0.26, 0.38], amount: 0.9 }, (m) => { for (let i = 0; i < 3; i++) { const a = i * 2.094; m.box(0.05, 0.004, 0.004, P.steel, Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025, 0, -a); m.ball(0.012, P.snow, Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, 1, 0); } });
    k.fence(-0.46, 0.46, 0.3, 0.46, P.steelL); k.bush(0.42, -0.4); k.bush(0.42, 0.1, 0.8);
  },
  wind(k) {
    k.beacon(-0.26, B + 1.2, -0.26, P.red, 0.016, 2);
    k.box(0.5, 0.01, 0.06, P.path, 0.08, B, 0.2, 0, -0.5);
    k.fence(0.24, 0.44, 0.44, 0.44, P.steelL); k.flowers(-0.36, 0.36, P.gold); k.bush(0.36, -0.36, 0.9);
  },
  park(k) {
    // Canard sur la mare, lampadaire, fleurs
    k.motion({ kind: "slide", at: [0.1, B + 0.014, 0.22], to: [0.3, B + 0.014, 0.32], period: 10 }, (m) => { m.ball(0.02, P.snow, 0, 0.012, 0, 0.8, 0); m.ball(0.012, P.snow, 0.016, 0.03, 0, 1, 0); m.box(0.012, 0.005, 0.008, P.orange, 0.03, 0.028, 0, 0); });
    k.lamp(-0.1, 0.08); k.lamp(0.36, -0.08);
    k.flowers(-0.4, -0.08, P.pink); k.flowers(0.1, -0.1, P.gold, 2); k.bench(0.1, 0.07);
    k.cyl(0.02, 0.05, P.green, -0.14, B, 0.1, 0.018, 8);
  },
  park_l(k) {
    // Jet de la fontaine, balançoire à bascule, cerf-volant
    k.motion({ kind: "bob", at: [0, B + 0.15, 0], amount: 0.03, period: 1.5 }, (m) => { m.ball(0.022, P.waterL, 0, 0, 0, 1.4, 0); m.cyl(0.006, 0.06, P.waterL, 0, -0.06, 0, 0.01, 6); });
    k.cone(0.02, 0.035, P.steel, -0.24, B, 0.14, 6);
    k.motion({ kind: "rock", axis: "z", ry: Math.PI / 4, at: [-0.24, B + 0.04, 0.14], amount: 0.22, period: 2.6 }, (m) => { m.box(0.2, 0.012, 0.03, P.fire, 0, 0, 0, 0.004); m.ball(0.016, P.primary, -0.085, 0.022, 0, 1, 0); m.ball(0.016, P.gold, 0.085, 0.022, 0, 1, 0); });
    k.motion({ kind: "bob", at: [0.3, B + 0.62, -0.06], amount: 0.04, period: 4 }, (m) => { const g = new THREE.ConeGeometry(0.045, 0.012, 4); g.rotateX(Math.PI / 2); m.add(g, P.fire, 0, 0, 0, Math.PI / 4); m.box(0.004, 0.07, 0.004, P.gold, -0.02, -0.07, 0.02, 0); });
    k.lamp(-0.44, 0.06); k.lamp(0.44, -0.06); k.lamp(0.06, 0.44); k.lamp(-0.06, -0.44);
    k.bench(-0.2, 0.09); k.bench(-0.09, -0.24, Math.PI / 2);
  },
  school(k) {
    // La balançoire se balance, panier de basket, marelle
    k.motion({ kind: "rock", axis: "x", at: [0.3, B + 0.13, -0.2], amount: 0.5, period: 1.9 }, (m) => { for (const x of [-0.03, 0.03]) m.box(0.004, 0.09, 0.004, P.steel, x, -0.09, 0, 0); m.box(0.07, 0.01, 0.025, P.wood, 0, -0.095, 0, 0.003); });
    k.cyl(0.008, 0.2, P.steel, 0.42, B, 0.2, 0.008, 5); k.box(0.07, 0.05, 0.008, P.snow, 0.42, B + 0.19, 0.19, 0.003); k.cyl(0.02, 0.006, P.fire, 0.42, B + 0.19, 0.17, 0.02, 8);
    for (let i = 0; i < 4; i++) k.box(0.035, 0.004, 0.035, i % 2 ? P.pink : P.teal, 0.22, B + 0.012, 0.14 + i * 0.04, 0);
    k.disc(0.045, P.snow, -0.14, B + 0.46, 0.106); k.box(0.004, 0.03, 0.004, P.black, -0.14, B + 0.46, 0.114, 0);
    // Car scolaire
    k.box(0.2, 0.085, 0.085, P.yellow, -0.2, B + 0.012, 0.42, 0.015); k.box(0.16, 0.025, 0.088, P.glassD, -0.2, B + 0.06, 0.42, 0.004);
    k.lamp(0.44, -0.06, 0.16);
  },
  university(k) {
    // Girouette, bannières, parc à vélos
    k.motion({ kind: "spin", axis: "y", at: [-0.28, B + 1.14, -0.3], amount: 0.15 }, (m) => { m.box(0.11, 0.01, 0.012, P.gold, 0, 0, 0, 0); m.cone(0.02, 0.04, P.gold, 0.06, -0.015, 0, 4); });
    k.cyl(0.005, 0.06, P.steel, -0.28, B + 1.08, -0.3, 0.005, 5);
    k.box(0.04, 0.2, 0.006, P.primary, -0.16, B + 0.14, 0.166, 0); k.box(0.04, 0.2, 0.006, P.gold, 0.16, B + 0.14, 0.166, 0);
    k.lamp(-0.12, 0.44); k.lamp(0.12, 0.44); k.bench(0.3, 0.14); k.flowers(-0.3, 0.14, P.fire);
    k.cyl(0.035, 0.06, P.stone, 0.4, B, 0.08, 0.035, 8); k.cyl(0.014, 0.08, P.gold, 0.4, B + 0.06, 0.08, 0.01, 6); k.ball(0.02, P.gold, 0.4, B + 0.16, 0.08, 1, 0);
  },
  hospital(k) {
    // Hélicoptère sur son aire, gyrophare de l'ambulance
    k.cyl(0.13, 0.008, P.steel, 0.22, B + 0.376, 0.22, 0.13, 18); k.box(0.012, 0.004, 0.1, P.snow, 0.19, B + 0.384, 0.22, 0); k.box(0.012, 0.004, 0.1, P.snow, 0.25, B + 0.384, 0.22, 0); k.box(0.07, 0.004, 0.012, P.snow, 0.22, B + 0.384, 0.22, 0);
    k.box(0.1, 0.045, 0.05, P.snow, 0.22, B + 0.4, 0.22, 0.02); k.box(0.08, 0.012, 0.012, P.fire, 0.15, B + 0.425, 0.22, 0.003); k.box(0.102, 0.012, 0.052, P.fire, 0.22, B + 0.415, 0.22, 0.003);
    k.motion({ kind: "spin", axis: "y", at: [0.22, B + 0.455, 0.22], amount: 1.1 }, (m) => { m.box(0.24, 0.004, 0.014, P.steel, 0, 0, 0, 0); m.box(0.014, 0.004, 0.24, P.steel, 0, 0, 0, 0); });
    k.beacon(0.3, B + 0.105, 0.44, P.primary, 0.012, 0.7);
    k.lamp(-0.44, 0.2, 0.2); k.bench(-0.24, 0.44); k.flowers(-0.4, 0.3, P.fire, 2);
  },
  fire(k) {
    k.beacon(-0.28, B + 0.83, -0.3, P.red, 0.022, 0.9); k.beacon(0.28, B + 0.1, 0.4, P.primary, 0.012, 0.7);
    // Borne d'incendie, tuyaux qui sèchent, drapeau
    k.cyl(0.014, 0.05, P.fire, -0.4, B, 0.4, 0.012, 6); k.ball(0.014, P.fire, -0.4, B + 0.05, 0.4, 1, 0);
    k.box(0.004, 0.3, 0.02, P.yellow, -0.176, B + 0.36, -0.36, 0); k.box(0.004, 0.3, 0.02, P.yellow, -0.176, B + 0.36, -0.3, 0);
    k.flag(0.32, B + 0.34, -0.2, 0.24, P.fire); k.lamp(0.44, 0.2, 0.2);
  },
  museum(k) {
    // Sculpture qui tourne sur son socle
    k.cyl(0.04, 0.05, P.stone, -0.36, B + 0.06, 0.3, 0.04, 10);
    k.motion({ kind: "spin", axis: "y", at: [-0.36, B + 0.19, 0.3], amount: 0.07 }, (m) => { const a = new THREE.TorusGeometry(0.05, 0.01, 6, 18); m.add(a, P.primary, 0, 0, 0); const b = new THREE.TorusGeometry(0.035, 0.009, 6, 16); b.rotateY(Math.PI / 2); m.add(b, P.fire, 0, 0, 0); });
    k.lamp(-0.2, 0.44, 0.16); k.lamp(0.2, 0.44, 0.16); k.bench(0.38, 0.14, Math.PI / 2);
    k.flag(-0.3, B + 0.47, -0.3, 0.2, P.fire);
  },
  stadium(k) {
    // Dirigeable qui tourne au-dessus, drapeaux des tribunes
    k.motion({ kind: "spin", axis: "y", at: [0, B + 0.78, 0], amount: 0.035 }, (m) => { m.box(0.07, 0.07, 0.2, P.snow, 0.36, 0, 0, 0.034); m.box(0.074, 0.02, 0.1, P.fire, 0.36, 0.025, 0, 0.004); m.box(0.006, 0.05, 0.04, P.fire, 0.36, 0.05, -0.09, 0); m.box(0.03, 0.02, 0.05, P.steel, 0.36, -0.02, 0.01, 0.006); });
    for (const [i, c] of [P.fire, P.gold, P.primary, P.teal, P.fire, P.gold].entries()) { const a = (i / 6) * Math.PI * 2 + 0.5; k.flag(Math.cos(a) * 0.38, B + 0.29, Math.sin(a) * 0.31, 0.12, c); }
    k.box(0.12, 0.08, 0.06, P.snow, 0.4, B, 0.0, 0.01); k.box(0.13, 0.02, 0.08, P.fire, 0.4, B + 0.08, 0.0, 0.004);
  },
  themepark(k) {
    // Ballons du marchand, wagonnet qui file sur son rail
    k.motion({ kind: "bob", at: [0.34, B + 0.22, -0.3], amount: 0.02, period: 2.8 }, (m) => { m.ball(0.03, P.fire, 0, 0.04, 0); m.ball(0.028, P.gold, 0.035, 0.02, 0.01); m.ball(0.028, P.teal, -0.03, 0.015, 0.012); m.cyl(0.003, 0.12, P.snow, 0, -0.1, 0, 0.003, 4); });
    { const g = new THREE.TorusGeometry(0.12, 0.008, 6, 22); g.rotateX(Math.PI / 2); g.scale(1.5, 1, 1); k.add(g, P.steelL, 0.2, B + 0.06, -0.06); }
    for (const [x, z] of [[0.03, -0.06], [0.37, -0.06], [0.2, -0.17], [0.2, 0.05]] as const) k.cyl(0.006, 0.06, P.steel, x, B, z, 0.006, 4);
    k.motion({ kind: "spin", axis: "y", at: [0.2, B + 0.075, -0.06], amount: 0.16 }, (m) => { m.box(0.05, 0.03, 0.035, P.fire, 0.16, 0, 0, 0.008); m.box(0.05, 0.03, 0.035, P.gold, 0.15, 0, 0.06, 0.008, -0.38); });
    k.lamp(-0.44, -0.44, 0.16); k.lamp(0.44, 0.42, 0.16); k.flowers(0.0, 0.2, P.pink);
  },
  bizdistrict(k) {
    k.beacon(-0.24, B + 2.09, -0.24, P.red, 0.022); k.mast(0.3, B + 1.19, -0.34, 0.16);
    k.lift(-0.24, B + 0.2, B + 1.5, -0.066, 0, 9);
    k.motion({ kind: "bob", at: [0.26, B + 0.09, 0.26], amount: 0.02, period: 1.4 }, (m) => { m.ball(0.018, P.waterL, 0, 0, 0, 1.4, 0); m.cyl(0.005, 0.04, P.waterL, 0, -0.045, 0, 0.008, 6); });
    k.lamp(0.44, 0.3, 0.18); k.bench(0.1, 0.3, Math.PI / 2); k.flowers(-0.0, 0.44, P.gold, 2);
    k.cyl(0.07, 0.006, P.snow, -0.22, B + 0.812, 0.22, 0.07, 14);
  },
  recycling(k) {
    k.beacon(-0.38, B + 0.34, -0.38, P.amber, 0.014, 1.3);
    // Déchets qui montent sur le tapis de tri
    k.motion({ kind: "pass", at: [0.14, B + 0.06, -0.24], to: [0.44, B + 0.2, -0.24], period: 3.2 }, (m) => m.box(0.035, 0.03, 0.04, P.yellow, 0, 0, 0, 0.004));
    k.motion({ kind: "pass", at: [0.14, B + 0.06, -0.22], to: [0.44, B + 0.2, -0.22], period: 4.7 }, (m) => m.box(0.03, 0.03, 0.035, P.primary, 0, 0, 0, 0.004));
    k.disc(0.05, P.snow, -0.12, B + 0.36, -0.016); k.lamp(0.44, 0.1, 0.18);
  },
  port(k) {
    k.beacon(0.29, B + 0.6, -0.2, P.red, 0.016, 1.5);
    // Remorqueur dans le bassin, mouette qui tourne
    k.motion({ kind: "slide", at: [0.38, B + 0.012, 0.43], to: [-0.38, B + 0.012, 0.44], period: 18 }, (m) => { m.box(0.08, 0.03, 0.04, P.fire, 0, 0, 0, 0.012); m.box(0.03, 0.03, 0.03, P.snow, 0.01, 0.028, 0, 0.006); m.cyl(0.006, 0.025, P.black, -0.01, 0.055, 0, 0.006, 5); });
    k.motion({ kind: "spin", axis: "y", at: [-0.1, B + 0.72, 0.2], amount: 0.09 }, (m) => { m.box(0.008, 0.004, 0.03, P.snow, 0.2, 0, 0.014, 0, 0.5); m.box(0.008, 0.004, 0.03, P.snow, 0.2, 0, -0.014, 0, -0.5); });
    for (const x of [-0.42, -0.2, 0.02]) k.cyl(0.012, 0.03, P.black, x, B + 0.05, 0.1, 0.012, 6);
    k.lamp(-0.44, -0.14, 0.2);
  },
  workshop(k) {
    k.beacon(-0.05, B + 0.115, 0.26, P.amber, 0.014, 0.9);
    // Étincelles de soudure dans l'atelier, barrière de chantier
    k.beacon(0.0, B + 0.03, -0.02, P.gold, 0.012, 0.35);
    for (const x of [0.02, 0.14]) k.cyl(0.006, 0.05, P.snow, x, B, 0.44, 0.006, 5);
    k.box(0.16, 0.02, 0.008, P.fire, 0.08, B + 0.03, 0.44, 0);
    k.lamp(-0.44, 0.44, 0.18); k.flag(0.34, B + 0.29, -0.4, 0.2, P.orange);
  },
  station(k) {
    // Signal en bout de quai, voyageurs, lampadaires
    k.cyl(0.006, 0.18, P.steel, 0.44, B, 0.2, 0.006, 5); k.box(0.022, 0.05, 0.016, P.black, 0.44, B + 0.17, 0.2, 0.003); k.beacon(0.44, B + 0.2, 0.212, P.green, 0.01, 2.6);
    for (const [x, c] of [[-0.06, P.fire], [0.02, P.primary], [0.32, P.gold]] as const) { k.box(0.02, 0.04, 0.016, c, x, B + 0.035, 0.12, 0.005); k.ball(0.011, P.skin, x, B + 0.086, 0.12, 1, 0); }
    k.box(0.004, 0.022, 0.004, P.black, -0.333, B + 0.41, 0.03, 0, 0.9);
    k.lamp(-0.44, 0.12, 0.18); k.flowers(0.36, -0.06, P.fire, 2);
  },
  police(k) {
    k.beacon(-0.24, B + 0.5, -0.04, P.primary, 0.02, 0.7);
    for (const x of [-0.24, 0.2]) k.beacon(x - 0.01, B + 0.115, 0.34, P.red, 0.01, 0.6);
    // Radar tournant sur l'antenne
    k.motion({ kind: "spin", axis: "y", at: [0.26, B + 0.8, -0.28], amount: 0.2 }, (m) => { m.box(0.1, 0.035, 0.012, P.snow, 0, 0, 0, 0.004); });
    k.lamp(-0.44, 0.44, 0.18); k.lamp(0.44, 0.44, 0.18);
    k.box(0.16, 0.006, 0.04, P.snow, 0, B + 0.006, 0.22, 0);
  },
  airport(k) {
    // Radar de la tour, manche à air, chariot à bagages, feux de piste
    k.motion({ kind: "spin", axis: "y", at: [0.34, B + 0.76, -0.3], amount: 0.3 }, (m) => { m.box(0.13, 0.04, 0.012, P.snow, 0, 0, 0, 0.004); m.box(0.02, 0.02, 0.03, P.steel, 0, 0.01, -0.016, 0); });
    k.cyl(0.006, 0.2, P.steel, -0.42, B, 0.06, 0.006, 5);
    k.motion({ kind: "rock", axis: "y", at: [-0.42, B + 0.2, 0.06], amount: 0.35, period: 3.4 }, (m) => { const g = new THREE.ConeGeometry(0.02, 0.09, 8); g.rotateZ(Math.PI / 2); m.add(g, P.orange, 0.045, 0, 0); });
    k.motion({ kind: "slide", at: [-0.32, B + 0.004, 0.03], to: [0.02, B + 0.004, 0.03], period: 9 }, (m) => { m.box(0.05, 0.03, 0.035, P.gold, 0, 0, 0, 0.006); m.box(0.045, 0.025, 0.035, P.steelL, -0.055, 0, 0, 0.004); m.box(0.045, 0.025, 0.035, P.steelL, -0.105, 0, 0, 0.004); });
    k.beacon(-0.44, B + 0.016, 0.28, P.green, 0.012, 1.2); k.beacon(0.44, B + 0.016, 0.28, P.red, 0.012, 1.2);
    k.box(0.1, 0.06, 0.08, P.fire, 0.2, B, -0.06, 0.01); k.box(0.11, 0.012, 0.03, P.metal, 0.2, B + 0.06, -0.06, 0.003);
  },
};

/** Volume neutre pour un type inconnu (jamais censé arriver). */
function fallback(k: Kit) { k.lot(P.pave); k.tower(0.6, 0.4, 0.6, P.white, P.steelL, 2, 3); }

const cache = new Map<string, Model>();
/** Modèle d'un bâtiment, construit à la première demande puis gardé. */
export function buildingModel(id: string): Model {
  let m = cache.get(id);
  if (!m) { const k = new Kit(); (BUILD[id] ?? fallback)(k); EXTRA[id]?.(k); m = k.done(); cache.set(id, m); }
  return m;
}

/** Arbre isolé (feuillu ou sapin), pour la ville et la campagne. Origine au pied. */
export function treeModel(pine: boolean): THREE.BufferGeometry {
  const key = pine ? "#pine" : "#tree";
  let m = cache.get(key);
  if (!m) { const k = new Kit(); k.tree(0, 0, 1.25, pine, 0); m = k.done(); cache.set(key, m); }
  return m.solid;
}

/** Petits objets de la rue. La voiture est blanche : sa couleur vient de l'instance. */
export function propModel(kind: "car" | "lamp" | "boat" | "rotor" | "walker" | "head"): THREE.BufferGeometry {
  const key = `#${kind}`;
  let m = cache.get(key);
  if (!m) {
    const k = new Kit();
    if (kind === "car") { k.box(0.22, 0.07, 0.11, 0xffffff, 0, 0.015, 0, 0.025); k.box(0.11, 0.05, 0.095, 0xb8c6d8, -0.012, 0.075, 0, 0.018); }
    else if (kind === "lamp") { k.cyl(0.012, 0.42, P.steel, 0, 0, 0, 0.009, 6); k.box(0.1, 0.012, 0.012, P.steel, 0.045, 0.41, 0, 0); k.box(0.05, 0.016, 0.03, P.steel, 0.09, 0.4, 0, 0.004); }
    else if (kind === "boat") { k.box(0.5, 0.09, 0.2, P.snow, 0, 0, 0, 0.04); k.cyl(0.008, 0.5, P.wood, 0, 0.08, 0, 0.008, 5); k.gable(0.012, 0.3, 0.42, 0xffffff, 0.02, 0.13, 0.15, Math.PI / 2); }
    else if (kind === "rotor") { for (let i = 0; i < 3; i++) { const g = rbox(0.11, 1, 0.03, 0.012); g.rotateZ((i * Math.PI * 2) / 3); k.add(g, P.snow, 0, 0, 0); } k.ball(0.09, P.metal, 0, 0, 0); }
    else if (kind === "walker") { k.box(0.045, 0.085, 0.035, 0xffffff, 0, 0.03, 0, 0.012); k.box(0.035, 0.03, 0.03, 0x39455a, 0, 0, 0, 0.004); }
    else { k.ball(0.022, P.skin, 0, 0.14, 0); }
    m = k.done(); cache.set(key, m);
  }
  return m.solid;
}
