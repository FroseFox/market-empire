// Moteur d'affichage 3D de la ville (three.js). Aucune dépendance à React : le composant City3D le pilote.
// Il reprend les règles de l'ancienne vue isométrique : mêmes carreaux, mêmes routes, même cadrage, mêmes gestes
// (glisser, molette, pincement, double-clic), mêmes indicateurs. Seul le rendu change : de vrais volumes éclairés.
// Performances : un type de bâtiment = une géométrie fusionnée affichée en instances ; la scène n'est redessinée
// qu'à 30 images par seconde au repos, et pas du tout quand elle est hors écran.
import * as THREE from "three";
import { BUILDING_BY_ID } from "@/lib/game/config";
import { isBuildable, isRoad, mapBounds, MAP_SIZE, MAX_MAP_SIZE, type Plot } from "@/lib/game/layout";
import { CAT_COLOR, MARKER_COLOR, nightFactor, type CityMarker, type CityMode, type CitySign, type Light, type MarkerKind } from "@/components/IsoCity";
import { buildingModel, propModel, treeModel, type V3 } from "./models";

export interface CityTip { left: number; top: number; title: string; text: string; warn?: boolean }
export interface CityFrame { height: number | "fill"; compact: boolean; interactive: boolean; initialZoom: number; padTop: number; padBottom: number }
export interface CityLive {
  mode: CityMode | null; selected: { x: number; y: number } | null; tone: "primary" | "danger";
  markers: CityMarker[]; signs: Record<string, CitySign>; layers: boolean; light: Light;
}
interface Callbacks { tip: (t: CityTip | null) => void; click: (x: number, y: number) => void; lost: () => void }

const MIN_ZOOM = 0.6, MAX_ZOOM = 4;
/** Hauteur de la caméra au-dessus de l'horizon : 32° donne des carreaux proches du 2:1 de l'ancienne vue. */
const EL = (32 * Math.PI) / 180, SIN = Math.sin(EL), COS = Math.cos(EL), R2 = Math.SQRT1_2;
/** Pixels par carreau de l'ancienne vue à l'échelle 1 : sert à garder les mêmes tailles d'indicateurs. */
const OLD_PX = 45.25;
const LAND = 0x69b34c, ROAD = 0x3d4656, CURB = 0xc4b9a2, LINE = 0xf1f4f8, SAND = 0xefe3bc, SEA = 0x4fb4e4, DEEP = 0x2f8fcb;
const PATCHES = [0x62ad49, 0x7abd55, 0x9fc45c, 0x5ea746, 0x8cc257];
const CAR_COLORS = [0xef4444, 0xf8fafc, 0x2563eb, 0xf59e0b, 0x1f2937, 0x10b981];
const COATS = [0x2563eb, 0xef4444, 0xf59e0b, 0x10b981, 0x8b5cf6, 0x1f2937, 0xec4899];

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const keyOf = (p: Plot) => `${p.id}@${p.x},${p.y}`;

/** Accumule des rectangles plats colorés (sol, routes, mer) dans une seule géométrie. */
class Flat {
  private pos: number[] = []; private colr: number[] = []; private c = new THREE.Color();
  quad4(a: [number, number], b: [number, number], c: [number, number], d: [number, number], y: number, color: number) {
    this.c.set(color);
    for (const p of [a, b, c, a, c, d]) { this.pos.push(p[0], y, p[1]); this.colr.push(this.c.r, this.c.g, this.c.b); }
  }
  /** Rectangle aligné sur les axes, de (ax, az) à (bx, bz). */
  quad(ax: number, az: number, bx: number, bz: number, y: number, color: number) {
    this.quad4([ax, az], [ax, bz], [bx, bz], [bx, az], y, color);
  }
  get empty() { return this.pos.length === 0; }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), n = this.pos.length / 3, nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colr, 3));
    return g;
  }
}

interface Inst { solid: THREE.InstancedMesh; lit: THREE.InstancedMesh | null; index: number; plot: Plot }
interface Puff { at: V3; off: number }
interface Spin { at: V3; size: number; off: number }
interface Mover { axis: "x" | "y"; k: number; speed: number; off: number; dir: number; side: number }

export class CityEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
  private hemi = new THREE.HemisphereLight(0xdfeaff, 0x55703f, 1);
  private sun = new THREE.DirectionalLight(0xffe9c4, 1);
  private world = new THREE.Group();
  // Matières partagées
  private gMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  private bMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  private litMat = new THREE.MeshStandardMaterial({ color: 0x345e94, roughness: 0.35, emissive: 0xffd58a, emissiveIntensity: 0 });
  private ghostMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, transparent: true, opacity: 0.6 });
  private fadeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, transparent: true, opacity: 0.3 });
  private bulbMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0xfef3c7, emissiveIntensity: 0 });
  private glowMat = new THREE.MeshBasicMaterial({ color: 0xfef0b4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  private smokeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false });
  private tintMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.24, depthWrite: false });
  private hoverMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.4, depthWrite: false });
  private selMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.2, depthWrite: false });
  private ringMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });
  private layerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  // Objets persistants
  private land: THREE.Mesh; private hover: THREE.Mesh; private sel: THREE.Mesh; private ring: THREE.Mesh;
  private ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
  private fade = new THREE.Mesh(new THREE.BufferGeometry(), this.fadeMat);
  private plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  // Contenu de la ville (refait à chaque changement de plan)
  private plots: Plot[] = []; private byTile = new Map<string, Plot>(); private inst = new Map<string, Inst>();
  private x0 = 0; private x1 = 0; private y0 = 0; private y1 = 0; private mapSize = MAP_SIZE; private builtBlocks = new Set<string>();
  private modeGrid: THREE.Group | null = null; private layerTiles: THREE.InstancedMesh | null = null;
  private puffs: Puff[] = []; private puffMesh: THREE.InstancedMesh | null = null;
  private spins: Spin[] = []; private spinMesh: THREE.InstancedMesh | null = null;
  private cars: Mover[] = []; private carMesh: THREE.InstancedMesh | null = null;
  private walkers: Mover[] = []; private bodyMesh: THREE.InstancedMesh | null = null; private headMesh: THREE.InstancedMesh | null = null;
  private glow: THREE.InstancedMesh | null = null;
  private seen: Set<string> | null = null; private births = new Map<string, number>(); private growUntil = 0;
  private hidden: string | null = null;
  // Vue
  private frameOpts: CityFrame = { height: 440, compact: false, interactive: false, initialZoom: 1, padTop: 0, padBottom: 0 };
  private live: CityLive = { mode: null, selected: null, tone: "primary", markers: [], signs: {}, layers: false, light: "auto" };
  private markerMap = new Map<string, CityMarker>();
  private W = 1; private H = 1; private u = 0.05; private tx = 0; private tz = 0;
  private base = { u: 0.05, tx: 0, tz: 0 }; private view = { zoom: 1, ox: 0, oz: 0 }; private lastInitial = 1;
  private goal: { zoom: number; ox: number; oz: number } | null = null;
  private night = 0; private nightAt = 0; private nightSeen: Light = "auto"; private nightDrawn = -1;
  private hoverTile: { x: number; y: number } | null = null;
  // Boucle
  private raf = 0; private onScreen = true; private lastDraw = 0; private disposed = false;
  private reduce = false; private pts = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private pinch: { dist: number; mx: number; my: number } | null = null;
  private io: IntersectionObserver; private ro: ResizeObserver;
  private overlayKey = ""; private pins: { el: HTMLElement; x: number; y: number; top: number; lift: number }[] = [];
  // Outils de calcul réutilisés
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3(); private s = new THREE.Vector3(); private e = new THREE.Euler(); private col = new THREE.Color();

  constructor(private box: HTMLElement, private canvas: HTMLCanvasElement, private overlay: HTMLElement, private cb: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new THREE.Color(LAND);
    // Halo des lampadaires : un dégradé rond, dessiné une fois
    const halo = document.createElement("canvas"); halo.width = halo.height = 64;
    const hx = halo.getContext("2d");
    if (hx) { const gr = hx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); hx.fillStyle = gr; hx.fillRect(0, 0, 64, 64); }
    this.glowMat.map = new THREE.CanvasTexture(halo);
    this.sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.world);
    this.land = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: LAND, roughness: 0.95 }));
    this.land.position.y = -0.004; this.land.receiveShadow = true; this.scene.add(this.land);
    this.hover = new THREE.Mesh(this.plane, this.hoverMat); this.hover.visible = false; this.hover.renderOrder = 3;
    this.sel = new THREE.Mesh(this.plane, this.selMat); this.sel.visible = false; this.sel.renderOrder = 3;
    // Contour du carreau sélectionné : quatre barres fines
    const bar = new THREE.BoxGeometry(1.04, 0.025, 0.05), parts: THREE.BufferGeometry[] = [];
    for (const [x, z, r] of [[0, -0.5, 0], [0, 0.5, 0], [-0.5, 0, 1], [0.5, 0, 1]] as const) { const g = bar.clone(); if (r) g.rotateY(Math.PI / 2); g.translate(x, 0, z); parts.push(g); }
    const ringGeo = new THREE.BufferGeometry();
    const pos: number[] = [], idx: number[] = []; let off = 0;
    for (const g of parts) { const a = g.getAttribute("position"); for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i)); const ix = g.index!; for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off); off += a.count; g.dispose(); }
    bar.dispose(); ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); ringGeo.setIndex(idx);
    this.ring = new THREE.Mesh(ringGeo, this.ringMat); this.ring.visible = false;
    this.ghost.visible = false; this.fade.visible = false;
    this.scene.add(this.hover, this.sel, this.ring, this.ghost, this.fade);

    canvas.addEventListener("webglcontextlost", this.onLost);
    this.io = new IntersectionObserver(([e]) => { this.onScreen = e.isIntersecting; this.run(); });
    this.io.observe(box);
    this.ro = new ResizeObserver(() => { this.layout(); this.draw(); });
    this.ro.observe(box);
    document.addEventListener("visibilitychange", this.run);
  }

  // ─── Plan de la ville ───
  setCity(plots: Plot[], mapSize: number, f: CityFrame) {
    this.plots = plots; this.mapSize = mapSize; this.frameOpts = f;
    this.listen(!f.compact);
    const now = performance.now();
    if (this.seen === null) this.seen = new Set(plots.map(keyOf));
    for (const p of plots) { const k = keyOf(p); if (!this.seen.has(k)) { this.seen.add(k); this.births.set(k, now); this.growUntil = now + 900; } }

    // Zone visible : autour des bâtiments (plus large en mode construction), arrêtée sur une route
    const xs = plots.map((p) => p.x), ys = plots.map((p) => p.y);
    const pad = f.interactive ? 3 : 1, span = f.interactive ? 6 : 3;
    let x0 = Math.min(...xs, MAP_SIZE / 2 - span) - pad, x1 = Math.max(...xs, MAP_SIZE / 2 + span) + pad;
    let y0 = Math.min(...ys, MAP_SIZE / 2 - span) - pad, y1 = Math.max(...ys, MAP_SIZE / 2 + span) + pad;
    const { lo, hi } = mapBounds(mapSize);
    x0 = Math.max(lo, x0); y0 = Math.max(lo, y0); x1 = Math.min(hi - 1, x1); y1 = Math.min(hi - 1, y1);
    this.x0 = Math.floor(x0 / 4) * 4; this.y0 = Math.floor(y0 / 4) * 4;
    this.x1 = Math.min(hi - 1, Math.ceil(x1 / 4) * 4); this.y1 = Math.min(hi - 1, Math.ceil(y1 / 4) * 4);
    this.byTile = new Map(plots.map((p) => [`${p.x},${p.y}`, p]));
    this.builtBlocks = new Set(plots.map((p) => `${Math.floor(p.x / 4)},${Math.floor(p.y / 4)}`));

    this.rebuild();
    if (this.lastInitial !== f.initialZoom) { this.lastInitial = f.initialZoom; this.view = { zoom: f.initialZoom, ox: 0, oz: 0 }; }
    this.layout();
    this.applyLive();
    this.run();
  }

  /** Route goudronnée : autour des îlots bâtis, plus les deux axes qui relient la ville à l'extérieur. */
  private paved(x: number, y: number) {
    if (!isRoad(x, y)) return false;
    if (x === MAP_SIZE / 2 || y === MAP_SIZE / 2) return true;
    const bxs = x % 4 === 0 ? [x / 4 - 1, x / 4] : [Math.floor(x / 4)];
    const bys = y % 4 === 0 ? [y / 4 - 1, y / 4] : [Math.floor(y / 4)];
    return bxs.some((bx) => bys.some((by) => this.builtBlocks.has(`${bx},${by}`)));
  }

  private clearWorld() {
    this.world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.own) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.world.clear();
    this.inst.clear(); this.puffs = []; this.spins = []; this.cars = []; this.walkers = [];
    this.puffMesh = this.spinMesh = this.carMesh = this.bodyMesh = this.headMesh = this.glow = this.layerTiles = null;
    this.modeGrid = null; this.hidden = null;
  }

  private own(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
    const m = new THREE.Mesh(geo, mat); m.userData.own = true; m.receiveShadow = shadow; this.world.add(m); return m;
  }
  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0) {
    this.e.set(0, ry, 0); this.q.setFromEuler(this.e);
    this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz)); mesh.setMatrixAt(i, this.m4);
  }

  private rebuild() {
    this.clearWorld();
    const { x0, x1, y0, y1 } = this, mid = MAP_SIZE / 2;
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, R = Math.max(28, Math.max(x1 - x0, y1 - y0) * 1.5 + 10);
    const wx0 = Math.floor(cx - R), wx1 = Math.ceil(cx + R), wy0 = Math.floor(cy - R), wy1 = Math.ceil(cy + R);
    const flat = new Flat();

    // ─── Campagne : damier de prés et de champs, bosquets ───
    const COAST = mapBounds(MAX_MAP_SIZE).hi + 5, CELL = 5;
    const coast = (x: number) => COAST + Math.sin(x * 0.45) * 0.9 + Math.sin(x * 0.17 + 1) * 1.6;
    const trees: [number, number, number, boolean][] = [];
    for (let gx = Math.floor(wx0 / CELL); gx <= Math.floor(wx1 / CELL); gx++) {
      for (let gy = Math.floor(wy0 / CELL); gy <= Math.floor(wy1 / CELL); gy++) {
        const x = gx * CELL, y = gy * CELL;
        if (y + CELL > COAST - 4) continue;
        const r = hash(gx * 7 + 3, gy * 11 + 5);
        if (r < 0.62) flat.quad(x + 0.15, y + 0.15, x + CELL - 0.15, y + CELL - 0.15, 0.002, PATCHES[Math.floor((r / 0.62) * PATCHES.length)]);
        const inCity = x + CELL > x0 - 1 && x < x1 + 2 && y + CELL > y0 - 1 && y < y1 + 2;
        const onRoad = (x <= 17 && x + CELL >= 16) || (y <= 17 && y + CELL >= 16);
        if (!inCity && !onRoad && hash(gx * 13 + 1, gy * 5 + 9) < 0.42) {
          const n = 3 + Math.floor(hash(x + 2, y + 9) * 4);
          for (let i = 0; i < n; i++) {
            const tx = x + 0.6 + hash(x + i, y) * (CELL - 1.2), ty = y + 0.6 + hash(x, y + i * 3) * (CELL - 1.2);
            trees.push([tx, ty, 1 + hash(Math.round(tx * 9), Math.round(ty * 7)) * 0.2, hash(Math.round(tx * 13), Math.round(ty * 17)) < 0.35]);
          }
        }
      }
    }
    // Routes qui quittent la ville
    const outRoad = (ax: number, ay: number, bx: number, by: number, alongX: boolean) => {
      flat.quad(ax, ay, bx, by, 0.012, ROAD);
      const len = alongX ? bx - ax : by - ay;
      for (let t = 0.2; t < len; t += 0.8) {
        if (alongX) flat.quad(ax + t, ay + 0.48, ax + Math.min(t + 0.4, len), ay + 0.52, 0.02, LINE);
        else flat.quad(ax + 0.48, ay + t, ax + 0.52, ay + Math.min(t + 0.4, len), 0.02, LINE);
      }
    };
    const quay = coast(mid + 0.5) - 0.2;
    if (wx0 < x0) outRoad(wx0, mid, x0, mid + 1, true);
    if (wx1 > x1 + 1) outRoad(x1 + 1, mid, wx1, mid + 1, true);
    if (wy0 < y0) outRoad(mid, wy0, mid + 1, y0, false);
    if (wy1 > y1 + 1) outRoad(mid, y1 + 1, mid + 1, Math.min(quay, wy1), false);
    // Côte : plage, mer, large, ponton, voiliers
    if (wy1 > COAST - 4) {
      const far = Math.max(wy1, COAST) + 40;
      const band = (off: number, y: number, color: number, to?: number) => {
        for (let x = wx0 - 40; x < wx1 + 40; x++) flat.quad4([x, coast(x) + off], [x, to === undefined ? far : coast(x) + to], [x + 1, to === undefined ? far : coast(x + 1) + to], [x + 1, coast(x + 1) + off], y, color);
      };
      band(-0.8, 0.004, SAND); band(0, 0.006, SEA); band(0.04, 0.008, 0xffffff, 0.16); band(4.5, 0.008, DEEP);
      flat.quad(mid + 0.3, quay, mid + 0.7, quay + 2.4, 0.03, 0xc9a77a);
      const boats: [number, number][] = [];
      for (let i = 0; i < 9; i++) { const bx = -30 + i * 11 + hash(i, 41) * 6; boats.push([bx, coast(bx) + 2 + hash(i, 17) * 7]); }
      const bm = new THREE.InstancedMesh(propModel("boat"), this.gMat, boats.length);
      boats.forEach(([bx, by], i) => this.place(bm, i, bx, 0.01, by, 1, 1, 1, hash(i, 5) * 3));
      bm.castShadow = true; this.world.add(bm);
    }

    // ─── Rues de la ville : chaussée, trottoirs, marquage ───
    const lamps: [number, number][] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (!this.paved(x, y)) continue;
      flat.quad(x, y, x + 1, y + 1, 0.012, ROAD);
      const cw = 0.1, rx = x % 4 === 0, ry = y % 4 === 0;
      if (!isRoad(x - 1, y)) flat.quad(x, y, x + cw, y + 1, 0.016, CURB);
      if (!isRoad(x + 1, y)) flat.quad(x + 1 - cw, y, x + 1, y + 1, 0.016, CURB);
      if (!isRoad(x, y - 1)) flat.quad(x, y, x + 1, y + cw, 0.016, CURB);
      if (!isRoad(x, y + 1)) flat.quad(x, y + 1 - cw, x + 1, y + 1, 0.016, CURB);
      if (rx && ry) { lamps.push([x + 0.1, y + 0.1]); continue; }
      const nearCross = rx ? y % 4 === 1 || y % 4 === 3 : x % 4 === 1 || x % 4 === 3;
      if (nearCross) {
        const edge = rx ? (y % 4 === 1 ? y + 0.08 : y + 0.72) : x % 4 === 1 ? x + 0.08 : x + 0.72;
        for (let i = 0; i < 4; i++) {
          const a0 = 0.18 + i * 0.18, a1 = a0 + 0.09;
          if (rx) flat.quad(x + a0, edge, x + a1, edge + 0.2, 0.02, LINE); else flat.quad(edge, y + a0, edge + 0.2, y + a1, 0.02, LINE);
        }
      } else if (rx) { flat.quad(x + 0.48, y + 0.2, x + 0.52, y + 0.45, 0.02, LINE); flat.quad(x + 0.48, y + 0.6, x + 0.52, y + 0.85, 0.02, LINE); }
      else { flat.quad(x + 0.2, y + 0.48, x + 0.45, y + 0.52, 0.02, LINE); flat.quad(x + 0.6, y + 0.48, x + 0.85, y + 0.52, 0.02, LINE); }
    }
    this.own(flat.geometry(), this.gMat);

    // ─── Bâtiments : une série d'instances par type ───
    const byId = new Map<string, Plot[]>();
    for (const p of this.plots) { const l = byId.get(p.id); if (l) l.push(p); else byId.set(p.id, [p]); }
    for (const [id, list] of byId) {
      const model = buildingModel(id);
      const solid = new THREE.InstancedMesh(model.solid, this.bMat, list.length);
      solid.castShadow = true; solid.receiveShadow = true; solid.frustumCulled = false;
      const lit = model.lit ? new THREE.InstancedMesh(model.lit, this.litMat, list.length) : null;
      if (lit) lit.frustumCulled = false;
      list.forEach((p, i) => {
        this.place(solid, i, p.x + 0.5, 0, p.y + 0.5);
        if (lit) lit.setMatrixAt(i, this.m4);
        this.inst.set(keyOf(p), { solid, lit, index: i, plot: p });
        for (const s of model.smoke) for (let k = 0; k < 3; k++) this.puffs.push({ at: [p.x + 0.5 + s[0], s[1], p.y + 0.5 + s[2]], off: k / 3 + hash(p.x, p.y) });
        for (const r of model.rotors) this.spins.push({ at: [p.x + 0.5 + r.at[0], r.at[1], p.y + 0.5 + r.at[2]], size: r.size, off: hash(p.x * 3, p.y * 5) * 6 });
      });
      this.world.add(solid); if (lit) this.world.add(lit);
    }

    // ─── Arbres : dans la ville (carreaux libres) et bosquets de campagne ───
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (isRoad(x, y) || this.byTile.has(`${x},${y}`) || hash(x, y) >= 0.35) continue;
      const n = hash(y, x) < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const tx = x + 0.25 + hash(x + i, y) * 0.5, ty = y + 0.25 + hash(x, y + i) * 0.5;
        trees.push([tx, ty, 0.8 + hash(x * i + 1, y) * 0.4, hash(Math.round(tx * 13), Math.round(ty * 17)) < 0.35]);
      }
    }
    for (const pine of [false, true]) {
      const list = trees.filter((t) => t[3] === pine);
      if (!list.length) continue;
      const tm = new THREE.InstancedMesh(treeModel(pine), this.gMat, list.length);
      list.forEach(([x, y, s], i) => this.place(tm, i, x, 0, y, s, s, s, hash(Math.round(x * 5), Math.round(y * 3)) * 6));
      tm.castShadow = true; tm.receiveShadow = true; this.world.add(tm);
    }

    // ─── Lampadaires (un par carrefour), ampoules et halos de nuit ───
    if (lamps.length) {
      const poles = new THREE.InstancedMesh(propModel("lamp"), this.gMat, lamps.length);
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 8, 6), this.bulbMat, lamps.length); bulbs.userData.own = true;
      this.glow = new THREE.InstancedMesh(this.plane, this.glowMat, lamps.length); this.glow.renderOrder = 2;
      lamps.forEach(([x, y], i) => { this.place(poles, i, x, 0, y); this.place(bulbs, i, x + 0.09, 0.385, y); this.place(this.glow!, i, x + 0.2, 0.03, y + 0.2, 2.1); });
      poles.castShadow = true; this.world.add(poles, bulbs, this.glow);
    }

    // ─── Voitures et passants ───
    const lines: { axis: "x" | "y"; k: number }[] = [];
    for (let k = Math.ceil(x0 / 4) * 4; k <= x1; k += 4) lines.push({ axis: "x", k });
    for (let k = Math.ceil(y0 / 4) * 4; k <= y1; k += 4) lines.push({ axis: "y", k });
    const compact = this.frameOpts.compact;
    if (lines.length && !compact) {
      const nc = Math.min(10, 2 + Math.floor(this.plots.length / 2)), nw = Math.min(26, Math.floor(this.plots.length * 0.8));
      this.cars = Array.from({ length: nc }, (_, i) => ({ ...lines[i % lines.length], speed: 0.0006 + hash(i, 3) * 0.0005, off: hash(i, 7), dir: i % 2 ? 1 : -1, side: 0 }));
      this.carMesh = new THREE.InstancedMesh(propModel("car"), this.gMat, nc); this.carMesh.castShadow = true; this.carMesh.frustumCulled = false;
      for (let i = 0; i < nc; i++) this.carMesh.setColorAt(i, this.col.set(CAR_COLORS[i % CAR_COLORS.length]));
      this.world.add(this.carMesh);
      if (nw) {
        this.walkers = Array.from({ length: nw }, (_, i) => ({ ...lines[(i * 3 + 1) % lines.length], speed: 0.00006 + hash(i, 13) * 0.00006, off: hash(i, 19), dir: i % 2 ? 1 : -1, side: hash(i, 23) < 0.5 ? 0.05 : 0.95 }));
        this.bodyMesh = new THREE.InstancedMesh(propModel("walker"), this.gMat, nw); this.headMesh = new THREE.InstancedMesh(propModel("head"), this.gMat, nw);
        this.bodyMesh.frustumCulled = this.headMesh.frustumCulled = false; this.bodyMesh.castShadow = true;
        for (let i = 0; i < nw; i++) this.bodyMesh.setColorAt(i, this.col.set(COATS[i % COATS.length]));
        this.world.add(this.bodyMesh, this.headMesh);
      }
    }

    // ─── Fumées et éoliennes ───
    if (this.puffs.length) {
      this.puffs.length = Math.min(this.puffs.length, 360);
      this.puffMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), this.smokeMat, this.puffs.length);
      this.puffMesh.userData.own = true; this.puffMesh.frustumCulled = false; this.puffMesh.renderOrder = 4; this.world.add(this.puffMesh);
    }
    if (this.spins.length) {
      this.spinMesh = new THREE.InstancedMesh(propModel("rotor"), this.gMat, this.spins.length);
      this.spinMesh.frustumCulled = false; this.spinMesh.castShadow = true; this.world.add(this.spinMesh);
    }

    // ─── Calque « Quartiers » : une dalle de couleur par bâtiment ───
    if (this.plots.length) {
      this.layerTiles = new THREE.InstancedMesh(this.plane, this.layerMat, this.plots.length);
      this.plots.forEach((p, i) => {
        this.place(this.layerTiles!, i, p.x + 0.5, 0.062, p.y + 0.5);
        this.layerTiles!.setColorAt(i, this.col.set(CAT_COLOR[BUILDING_BY_ID[p.id]?.category ?? "housing"]));
      });
      this.layerTiles.frustumCulled = false; this.layerTiles.renderOrder = 2; this.layerTiles.visible = false; this.world.add(this.layerTiles);
    }
  }

  /** Mode construction : tout le quadrillage des rues et les carreaux libres en vert. */
  private buildModeGrid() {
    const roads = new Flat(), free = new Flat();
    for (let x = this.x0; x <= this.x1; x++) for (let y = this.y0; y <= this.y1; y++) {
      if (isRoad(x, y)) { if (!this.paved(x, y)) roads.quad(x, y, x + 1, y + 1, 0.011, 0x5b6677); }
      else if (isBuildable(x, y, this.mapSize) && !this.byTile.has(`${x},${y}`)) free.quad(x + 0.03, y + 0.03, x + 0.97, y + 0.97, 0.03, 0xffffff);
    }
    const g = new THREE.Group();
    if (!roads.empty) { const m = new THREE.Mesh(roads.geometry(), this.gMat); m.userData.own = true; m.receiveShadow = true; g.add(m); }
    if (!free.empty) { const m = new THREE.Mesh(free.geometry(), this.tintMat); m.userData.own = true; m.renderOrder = 1; g.add(m); }
    this.world.add(g); this.modeGrid = g;
  }

  // ─── État vivant : sélection, mode, indicateurs, calque, éclairage ───
  setLive(l: CityLive) { this.live = l; this.applyLive(); this.draw(); }

  private applyLive() {
    const l = this.live;
    this.markerMap = new Map(l.markers.map((m) => [`${m.x},${m.y}`, m]));
    if (l.mode && !this.modeGrid) this.buildModeGrid();
    if (this.modeGrid) this.modeGrid.visible = !!l.mode;
    if (this.layerTiles) this.layerTiles.visible = l.layers;
    this.bMat.transparent = l.layers; this.bMat.opacity = l.layers ? 0.45 : 1; this.bMat.needsUpdate = true;
    // Bâtiment en cours de déplacement : estompé à sa place d'origine
    const from = l.mode?.kind === "move" ? this.byTile.get(`${l.mode.from.x},${l.mode.from.y}`) : undefined;
    const hideKey = from ? keyOf(from) : null;
    if (hideKey !== this.hidden) {
      if (this.hidden) this.scaleInst(this.hidden, 1);
      if (hideKey) this.scaleInst(hideKey, 0);
      this.hidden = hideKey;
    }
    this.fade.visible = !!from;
    if (from) { this.fade.geometry = buildingModel(from.id).solid; this.fade.position.set(from.x + 0.5, 0, from.y + 0.5); }
    // Carreau sélectionné
    const sel = l.mode?.kind === "move" ? l.mode.from : l.selected;
    this.sel.visible = this.ring.visible = !!sel;
    if (sel) {
      const c = l.mode?.kind === "move" ? 0xf59e0b : l.tone === "danger" ? 0xef4444 : 0x2563eb;
      this.selMat.color.set(c); this.ringMat.color.set(c);
      this.sel.position.set(sel.x + 0.5, 0.058, sel.y + 0.5); this.ring.position.set(sel.x + 0.5, 0.06, sel.y + 0.5);
    }
    this.refreshHover();
    this.syncOverlay();
  }

  private scaleInst(key: string, sy: number) {
    const it = this.inst.get(key); if (!it) return;
    this.place(it.solid, it.index, it.plot.x + 0.5, 0, it.plot.y + 0.5, sy === 0 ? 0 : 1, sy, sy === 0 ? 0 : 1);
    it.solid.instanceMatrix.needsUpdate = true;
    if (it.lit) { it.lit.setMatrixAt(it.index, this.m4); it.lit.instanceMatrix.needsUpdate = true; }
  }

  private refreshHover() {
    const hv = this.hoverTile, m = this.live.mode;
    const inside = !!hv && hv.x >= this.x0 && hv.x <= this.x1 && hv.y >= this.y0 && hv.y <= this.y1;
    this.hover.visible = false; this.ghost.visible = false;
    if (!hv || !inside) return;
    const taken = this.byTile.has(`${hv.x},${hv.y}`), free = isBuildable(hv.x, hv.y, this.mapSize) && !taken;
    if (m) {
      const ok = free || (m.kind === "move" && m.from.x === hv.x && m.from.y === hv.y);
      this.hoverMat.color.set(ok ? 0x10b981 : 0xef4444); this.hoverMat.opacity = ok ? 0.45 : 0.35; this.hover.visible = true;
      if (free) { this.ghost.geometry = buildingModel(m.id).solid; this.ghost.position.set(hv.x + 0.5, 0, hv.y + 0.5); this.ghost.visible = true; }
    } else if (taken) {
      this.hoverMat.color.set(this.live.tone === "danger" ? 0xef4444 : 0x2563eb); this.hoverMat.opacity = this.live.tone === "danger" ? 0.28 : 0.22; this.hover.visible = true;
    }
    this.hover.position.set(hv.x + 0.5, 0.056, hv.y + 0.5);
  }

  // ─── Indicateurs et enseignes : de simples éléments HTML posés au-dessus des bâtiments ───
  private syncOverlay() {
    const l = this.live;
    const key = JSON.stringify([l.mode ? 1 : 0, l.markers, Object.entries(l.signs).map(([k, s]) => [k, s.src, s.label, s.colors, s.dim]), this.plots.length]);
    if (key === this.overlayKey) return;
    this.overlayKey = key; this.overlay.replaceChildren(); this.pins = [];
    for (const [k, sg] of Object.entries(l.signs)) {
      const p = this.byTile.get(k); if (!p || p.id !== "branch") continue;
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;opacity:${sg.dim ? 0.45 : 1};will-change:transform`;
      const panel = document.createElement("div");
      panel.style.cssText = `width:var(--s);height:var(--s);border-radius:22%;border:1.5px solid #fff;box-shadow:1.5px 2px 0 rgba(15,23,42,.18);overflow:hidden;display:grid;place-items:center;color:#fff;font:700 calc(var(--s) * ${sg.label.length > 3 ? 0.3 : 0.38}) Montserrat,system-ui,sans-serif;background:linear-gradient(135deg,${sg.colors[0]},${sg.colors[1]})`;
      panel.textContent = sg.label;
      if (sg.src) {
        const img = new Image(); img.alt = ""; img.style.cssText = "width:100%;height:100%;object-fit:cover;background:#fff";
        img.onload = () => { panel.textContent = ""; panel.appendChild(img); };
        img.src = sg.src;
      }
      const mast = document.createElement("div"); mast.style.cssText = "width:1.6px;height:calc(var(--s) * 0.2);background:#64748B";
      el.append(panel, mast); this.overlay.appendChild(el);
      this.pins.push({ el, x: p.x, y: p.y, top: buildingModel(p.id).top, lift: 0 });
    }
    if (!l.mode) for (const mk of l.markers) {
      const p = this.byTile.get(`${mk.x},${mk.y}`); if (!p) continue;
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;will-change:transform";
      el.innerHTML = markerSvg(mk.kind);
      if (!this.reduce) (el.firstElementChild as HTMLElement).animate([{ transform: "translateY(0)" }, { transform: "translateY(-4px)" }], { duration: 1300 + ((mk.x * 37 + mk.y * 11) % 5) * 90, direction: "alternate", iterations: Infinity, easing: "ease-in-out" });
      this.overlay.appendChild(el);
      this.pins.push({ el, x: mk.x, y: mk.y, top: buildingModel(p.id).top, lift: l.signs[`${mk.x},${mk.y}`] ? 1 : 0 });
    }
    this.placePins();
  }

  private placePins() {
    const sc = 1 / this.u / OLD_PX, size = Math.max(20, Math.min(64, 28 * sc)), r = Math.max(8, Math.min(13, 9 * sc));
    this.overlay.style.setProperty("--s", `${size.toFixed(1)}px`); this.overlay.style.setProperty("--r", `${r.toFixed(1)}px`);
    for (const p of this.pins) {
      const [sx, sy] = this.project(p.x + 0.5, p.top + 0.06, p.y + 0.5);
      const off = sx < -80 || sx > this.W + 80 || sy < -40 || sy > this.H + 120;
      p.el.style.display = off ? "none" : "";
      if (!off) p.el.style.transform = `translate(${sx.toFixed(1)}px,${(sy - p.lift * (size * 1.25)).toFixed(1)}px) translate(-50%,-100%)`;
    }
  }

  // ─── Vue : cadrage, zoom, déplacement ───
  private layout() {
    const f = this.frameOpts;
    this.W = Math.max(1, this.box.clientWidth); this.H = Math.max(1, f.height === "fill" ? this.box.clientHeight : f.height);
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3_200_000 / (this.W * this.H))));
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(this.W, this.H, false);
    this.canvas.style.width = `${this.W}px`; this.canvas.style.height = `${this.H}px`;
    const n = this.x1 + 1 - this.x0 + (this.y1 + 1 - this.y0), allow = (f.compact ? 1 : 1.8) * COS;
    const spanR = n * R2, spanF = n * R2 * SIN + allow;
    const usable = this.H - f.padTop - f.padBottom >= 160, top = usable ? f.padTop : 0, Ha = usable ? this.H - f.padTop - f.padBottom : this.H;
    const u = Math.max(spanR / Math.max(40, this.W - 24), spanF / Math.max(40, Ha - 16));
    const cx = (this.x0 + this.x1 + 1) / 2, cz = (this.y0 + this.y1 + 1) / 2;
    const k = ((top + Ha / 2 + allow / u / 2 - this.H / 2) * u) / SIN;
    this.base = { u, tx: cx - k * R2, tz: cz - k * R2 };
    this.applyView();
  }

  private applyView() {
    const v = this.view;
    v.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom));
    this.u = this.base.u / v.zoom; this.tx = this.base.tx + v.ox; this.tz = this.base.tz + v.oz;
    // La ville reste toujours en partie visible
    const [sx, sy] = this.project((this.x0 + this.x1 + 1) / 2, 0, (this.y0 + this.y1 + 1) / 2);
    const fx = Math.max(this.W * 0.1, Math.min(this.W * 0.9, sx)) - sx, fy = Math.max(this.H * 0.1, Math.min(this.H * 0.9, sy)) - sy;
    if (fx || fy) this.shift(fx, fy);
    const D = 220;
    this.cam.left = (-this.W * this.u) / 2; this.cam.right = (this.W * this.u) / 2; this.cam.top = (this.H * this.u) / 2; this.cam.bottom = (-this.H * this.u) / 2;
    this.cam.position.set(this.tx + D * COS * R2, D * SIN, this.tz + D * COS * R2); this.cam.lookAt(this.tx, 0, this.tz); this.cam.updateProjectionMatrix();
    // Le soleil suit la vue : l'ombre ne couvre que ce qui est à l'écran
    const half = Math.max(6, Math.min(70, Math.max(this.W, this.H) * this.u * 0.62 + 3));
    const sc = this.sun.shadow.camera; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 150; sc.updateProjectionMatrix();
    this.sun.target.position.set(this.tx, 0, this.tz); this.sun.position.set(this.tx - 33, 60, this.tz + 13);
    this.land.position.set(Math.round(this.tx), -0.004, Math.round(this.tz));
    this.placePins();
  }

  /** Décale le contenu de (dx, dy) pixels à l'écran. */
  private shift(dx: number, dy: number) {
    const a = dx * this.u * R2, b = (dy * this.u * R2) / SIN;
    this.view.ox -= a + b; this.view.oz -= -a + b;
    this.tx = this.base.tx + this.view.ox; this.tz = this.base.tz + this.view.oz;
  }
  private project(x: number, y: number, z: number): [number, number] {
    const dx = x - this.tx, dz = z - this.tz;
    return [this.W / 2 + ((dx - dz) * R2) / this.u, this.H / 2 + ((dx + dz) * R2 * SIN - y * COS) / this.u];
  }
  /** Point du sol sous un pixel de l'écran. */
  private ground(sx: number, sy: number): [number, number] {
    const a = (sx - this.W / 2) * this.u * R2, b = ((sy - this.H / 2) * this.u * R2) / SIN;
    return [this.tx + a + b, this.tz - a + b];
  }
  private viewAround(z: number, sx: number, sy: number) {
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)), [gx, gz] = this.ground(sx, sy), u = this.base.u / zoom;
    const a = (sx - this.W / 2) * u * R2, b = ((sy - this.H / 2) * u * R2) / SIN;
    return { zoom, ox: gx - a - b - this.base.tx, oz: gz + a - b - this.base.tz };
  }
  private go(target: { zoom: number; ox: number; oz: number }, smooth: boolean) {
    if (!smooth || this.reduce || !this.raf) { this.goal = null; this.view = { ...target }; this.applyView(); this.draw(); return; }
    this.goal = target;
  }
  zoomAt(f: number, sx = this.W / 2, sy = this.H / 2) { this.go(this.viewAround((this.goal?.zoom ?? this.view.zoom) * f, sx, sy), true); }
  panBy(dx: number, dy: number) {
    const v = this.goal ?? this.view, u = this.base.u / v.zoom, a = dx * u * R2, b = (dy * u * R2) / SIN;
    this.go({ zoom: v.zoom, ox: v.ox - (a + b), oz: v.oz - (-a + b) }, true);
  }
  reset() { this.go({ zoom: this.frameOpts.initialZoom, ox: 0, oz: 0 }, true); }

  // ─── Image ───
  private applyNight() {
    const n = this.night;
    this.hemi.intensity = 1.5 - 0.5 * n; this.hemi.color.set(0xdfeaff).lerp(this.col.set(0x5670c0), n);
    this.sun.intensity = 2.9 - 1.6 * n; this.sun.color.set(0xffe9c4).lerp(this.col.set(0x9db4ff), n);
    this.litMat.emissiveIntensity = 1.5 * n; this.bulbMat.emissiveIntensity = 2 * n; this.glowMat.opacity = 0.5 * n;
    if (this.glow) this.glow.visible = n > 0.01;
    this.nightDrawn = n;
  }

  private frame(t: number) {
    if (this.disposed) return;
    if (this.goal) {
      const v = this.view, g = this.goal, a = 0.22;
      v.zoom += (g.zoom - v.zoom) * a; v.ox += (g.ox - v.ox) * a; v.oz += (g.oz - v.oz) * a;
      if (Math.abs(g.zoom - v.zoom) < 0.002 && Math.abs(g.ox - v.ox) < 0.01 && Math.abs(g.oz - v.oz) < 0.01) { this.view = { ...g }; this.goal = null; }
      this.applyView();
    }
    if (t - this.nightAt > 60_000 || this.nightSeen !== this.live.light || this.nightDrawn < 0) {
      this.night = this.live.light === "day" ? 0 : nightFactor(); this.nightAt = t; this.nightSeen = this.live.light;
    }
    if (this.night !== this.nightDrawn) this.applyNight();
    const tt = this.reduce ? 0 : t;

    // Chantiers : les nouveaux bâtiments sortent de terre
    if (this.births.size) {
      for (const [k, b] of this.births) {
        const g = this.reduce ? 1 : Math.min(1, (t - b) / 700);
        if (k !== this.hidden) this.scaleInst(k, Math.max(0.02, 1 - Math.pow(1 - g, 3)));
        if (g >= 1) this.births.delete(k);
      }
    }
    if (this.puffMesh) {
      this.puffs.forEach((p, i) => {
        const k = (tt * 0.00022 + p.off) % 1, s = (0.6 + k * 1.7) * (1 - k * k * k);
        this.place(this.puffMesh!, i, p.at[0] + k * 0.24, p.at[1] + 0.04 + k * 0.62, p.at[2] - k * 0.1, s);
      });
      this.puffMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.spinMesh) {
      this.spins.forEach((r, i) => {
        this.e.set(0, Math.PI / 4, 0); this.q.setFromEuler(this.e); this.e.set(0, 0, tt / 700 + r.off); this.q2.setFromEuler(this.e); this.q.multiply(this.q2);
        this.m4.compose(this.v.set(r.at[0], r.at[1], r.at[2]), this.q, this.s.set(r.size, r.size, r.size)); this.spinMesh!.setMatrixAt(i, this.m4);
      });
      this.spinMesh.instanceMatrix.needsUpdate = true;
    }
    const along = (m: Mover, lane: number): [number, number] => {
      const len = m.axis === "x" ? this.y1 - this.y0 + 1 : this.x1 - this.x0 + 1;
      let u = (tt * m.speed + m.off) % 1; if (m.dir < 0) u = 1 - u;
      const pos = (m.axis === "x" ? this.y0 : this.x0) + u * len;
      return m.axis === "x" ? [m.k + lane, pos] : [pos, m.k + lane];
    };
    if (this.carMesh) {
      this.cars.forEach((c, i) => {
        const [x, y] = along(c, c.dir > 0 ? 0.32 : 0.68), ok = this.paved(Math.floor(x), Math.floor(y));
        this.place(this.carMesh!, i, x, 0.012, y, ok ? 1 : 0, ok ? 1 : 0, ok ? 1 : 0, c.axis === "x" ? Math.PI / 2 : 0);
      });
      this.carMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.bodyMesh && this.headMesh) {
      const show = this.u < 0.05;
      this.walkers.forEach((w, i) => {
        const [x, y] = along(w, w.side), s = show && this.paved(Math.floor(x), Math.floor(y)) ? 1 : 0;
        this.place(this.bodyMesh!, i, x, 0.016, y, s); this.headMesh!.setMatrixAt(i, this.m4);
      });
      this.bodyMesh.instanceMatrix.needsUpdate = true; this.headMesh.instanceMatrix.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.cam);
  }

  /** Redessine tout de suite si la boucle d'animation ne tourne pas. */
  private draw() { if (!this.raf && !this.disposed) this.frame(performance.now()); }
  private loop = (t: number) => {
    if (this.goal || this.pts.size > 0 || t < this.growUntil || t - this.lastDraw >= 30) { this.lastDraw = t; this.frame(t); }
    this.raf = requestAnimationFrame(this.loop);
  };
  private run = () => {
    cancelAnimationFrame(this.raf); this.raf = 0;
    if (this.disposed) return;
    if (this.reduce || !this.onScreen || document.hidden) { this.frame(performance.now()); return; }
    this.raf = requestAnimationFrame(this.loop);
  };

  // ─── Gestes ───
  private listening = false;
  private listen(on: boolean) {
    if (on === this.listening) return;
    const c = this.canvas; this.listening = on;
    const act = on ? c.addEventListener.bind(c) : c.removeEventListener.bind(c);
    act("pointerdown", this.onDown as EventListener); act("pointerup", this.onUp as EventListener); act("pointercancel", this.onUp as EventListener);
    act("pointermove", this.onMove as EventListener); act("pointerleave", this.onLeave);
    if (on) c.addEventListener("wheel", this.onWheel, { passive: false }); else c.removeEventListener("wheel", this.onWheel);
    act("dblclick", this.onDbl as EventListener);
  }
  private local(e: { clientX: number; clientY: number }) { const r = this.canvas.getBoundingClientRect(); return { lx: e.clientX - r.left, ly: e.clientY - r.top }; }
  private tileAt(lx: number, ly: number) { const [gx, gz] = this.ground(lx, ly); return { tx: Math.floor(gx), ty: Math.floor(gz) }; }
  private clearHover() { this.hoverTile = null; this.cb.tip(null); this.refreshHover(); }
  private onDown = (e: PointerEvent) => {
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 1) this.drag = { x: e.clientX, y: e.clientY, moved: false };
    else { this.drag = this.drag ? { ...this.drag, moved: true } : null; this.pinch = null; }
    this.goal = null;
  };
  private onUp = (e: PointerEvent) => {
    const wasClick = this.pts.size === 1 && this.drag && !this.drag.moved;
    this.pts.delete(e.pointerId);
    if (this.pts.size < 2) this.pinch = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (this.pts.size === 0) this.drag = null;
    if (wasClick && this.frameOpts.interactive) {
      const { lx, ly } = this.local(e), { tx, ty } = this.tileAt(lx, ly);
      if (tx >= this.x0 && tx <= this.x1 && ty >= this.y0 && ty <= this.y1) this.cb.click(tx, ty);
    }
  };
  private onMove = (e: PointerEvent) => {
    const { lx, ly } = this.local(e), prev = this.pts.get(e.pointerId);
    if (prev) {
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pts.size >= 2) {
        const [a, b] = [...this.pts.values()], r = this.canvas.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) { this.shift(mx - this.pinch.mx, my - this.pinch.my); this.view = this.viewAround(this.view.zoom * (dist / (this.pinch.dist || dist)), mx, my); this.applyView(); }
        this.pinch = { dist, mx, my }; this.clearHover(); this.draw();
        return;
      }
      if (this.drag) {
        if (!this.drag.moved && Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y) > 4) { this.drag.moved = true; this.canvas.setPointerCapture(e.pointerId); }
        if (this.drag.moved) { this.shift(e.clientX - prev.x, e.clientY - prev.y); this.applyView(); this.clearHover(); this.draw(); return; }
      }
    }
    const { tx, ty } = this.tileAt(lx, ly), last = this.hoverTile;
    if (last && last.x === tx && last.y === ty) return;
    this.hoverTile = { x: tx, y: ty };
    const p = this.byTile.get(`${tx},${ty}`), b = p ? BUILDING_BY_ID[p.id] : undefined;
    if (p && !this.live.mode) {
      const [ax, ay] = this.project(tx + 0.5, buildingModel(p.id).top + 0.06, ty + 0.5);
      const mk = this.markerMap.get(`${tx},${ty}`), sg = this.live.signs[`${tx},${ty}`];
      this.cb.tip({ left: ax, top: ay - (mk ? 34 : sg ? 30 : 6), title: sg?.title ?? b?.name ?? p.id, text: mk?.label ?? sg?.text ?? b?.description ?? "", warn: !!mk });
    } else this.cb.tip(null);
    this.refreshHover(); this.draw();
  };
  private onLeave = () => { this.clearHover(); this.draw(); };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { lx, ly } = this.local(e);
    this.goal = null;
    this.view = this.viewAround(this.view.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), lx, ly);
    this.applyView(); this.clearHover(); this.draw();
  };
  private onDbl = (e: MouseEvent) => { const { lx, ly } = this.local(e); this.go(this.viewAround((this.goal?.zoom ?? this.view.zoom) * 1.6, lx, ly), true); };
  private onLost = (e: Event) => { e.preventDefault(); this.cb.lost(); };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf);
    this.io.disconnect(); this.ro.disconnect(); document.removeEventListener("visibilitychange", this.run);
    this.listen(false);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.clearWorld(); this.overlay.replaceChildren();
    this.land.geometry.dispose(); (this.land.material as THREE.Material).dispose(); this.plane.dispose(); this.ring.geometry.dispose();
    this.glowMat.map?.dispose();
    for (const m of [this.gMat, this.bMat, this.litMat, this.ghostMat, this.fadeMat, this.bulbMat, this.glowMat, this.smokeMat, this.tintMat, this.hoverMat, this.selMat, this.ringMat, this.layerMat]) m.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}

/** Pastille d'alerte (mêmes pictogrammes que l'ancienne vue), dessinée dans un repère de −1 à 1. */
function markerSvg(kind: MarkerKind): string {
  const c = MARKER_COLOR[kind];
  const pts = (a: [number, number][]) => `<polygon points="${a.map((p) => p.join(",")).join(" ")}" fill="#fff"/>`;
  const icon = kind === "energy" ? pts([[0.18, -0.62], [-0.38, 0.1], [-0.02, 0.1], [-0.18, 0.62], [0.38, -0.1], [0.02, -0.1]])
    : kind === "full" ? pts([[-0.56, 0], [0, -0.55], [0.56, 0], [0.34, 0], [0.34, 0.46], [-0.34, 0.46], [-0.34, 0]])
    : kind === "service" ? pts([[-0.16, -0.58], [0.16, -0.58], [0.16, 0.58], [-0.16, 0.58]]) + pts([[-0.58, -0.16], [0.58, -0.16], [0.58, 0.16], [-0.58, 0.16]])
    : kind === "staff" ? `<circle cx="0" cy="-0.24" r="0.24" fill="#fff"/><path d="M-0.44 0.52a0.44 0.38 0 0 1 0.88 0z" fill="#fff"/>`
    : `<path d="M0 0.58V-0.55M0 0.2l-0.32-0.26M0 0.2l0.32-0.26M0-0.08l-0.32-0.26M0-0.08l0.32-0.26M0-0.36l-0.32-0.26M0-0.36l0.32-0.26" stroke="#fff" stroke-width="0.14" stroke-linecap="round" fill="none"/>`;
  return `<svg viewBox="-1.15 -1.15 2.3 2.85" style="display:block;width:calc(var(--r) * 2.3);height:calc(var(--r) * 2.85);overflow:visible"><polygon points="-0.45,0.75 0.45,0.75 0,1.55" fill="${c}"/><circle cx="0" cy="0" r="1" fill="${c}" stroke="#fff" stroke-width="0.14"/>${icon}</svg>`;
}
