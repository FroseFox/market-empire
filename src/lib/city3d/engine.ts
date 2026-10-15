// Moteur d'affichage 3D de la ville (three.js). Aucune dépendance à React : le composant City3D le pilote.
// Il reprend les règles de l'ancienne vue isométrique : mêmes carreaux, mêmes routes, même cadrage, mêmes gestes
// (glisser, molette, pincement, double-clic), mêmes indicateurs. Seul le rendu change : de vrais volumes éclairés.
// Performances : un type de bâtiment = une géométrie fusionnée affichée en instances ; la scène n'est redessinée
// qu'à 30 images par seconde au repos, et pas du tout quand elle est hors écran.
import * as THREE from "three";
import { BUILDING_BY_ID } from "@/lib/game/config";
import { canPlace, footprint, isBuildable, isRoad, mapBounds, MAP_SIZE, MAX_MAP_SIZE, CENTER, GRID, blockOf, cellOf, onRoadLine, roadAbove, roadBelow, occupancy, sideOf, type Plot } from "@/lib/game/layout";
import { CAT_COLOR, MARKER_COLOR, markerTip, nightFactor, type CityMarker, type CityMode, type CitySign, type Light, type MarkerKind } from "@/components/IsoCity";
import { SEASON_LABEL, seasonOf, type Season } from "@/lib/game/season";
import { EventFx } from "./eventFx";
import { buildingModel, modelReady, propModel, streetDecor, treeModel, warmBuildings, type Motion, type TreeLook, type V3 } from "./models";

export interface CityTip { left: number; top: number; title: string; text: string; warn?: boolean }
export interface CityFrame { height: number | "fill"; compact: boolean; interactive: boolean; initialZoom: number; padTop: number; padBottom: number }
export interface CityLive {
  mode: CityMode | null; selected: { x: number; y: number } | null; tone: "primary" | "danger";
  markers: CityMarker[]; signs: Record<string, CitySign>; layers: boolean; light: Light;
  /** Graphismes légers : sans ombres ni animations, image moins fine. */
  lite?: boolean;
  /** Événement de la semaine en cours (festival, tempête…) : il s'anime au-dessus de la ville. */
  event?: string | null;
}
interface Callbacks { tip: (t: CityTip | null) => void; click: (x: number, y: number) => void; lost: () => void; /** La vue rame depuis plusieurs secondes. */ slow?: () => void }

const MIN_ZOOM = 0.6, MAX_ZOOM = 4;
// Le zoom est relatif à « toute la carte tient dans le cadre » : sur un écran étroit, ×4 restait minuscule.
// On raisonne donc aussi en pixels par carreau : taille de départ garantie, et zoom maximal identique sur tous les écrans.
const START_PX = 30, CLOSE_PX = 110;
/** Marge (en carreaux) autour du terrain jusqu'où la vue peut aller. */
const PAN_MARGIN = 1;
/** Hauteur de la caméra au-dessus de l'horizon : 32° donne des carreaux proches du 2:1 de l'ancienne vue. */
const EL = (32 * Math.PI) / 180, SIN = Math.sin(EL), COS = Math.cos(EL), R2 = Math.SQRT1_2;
/** Pixels par carreau de l'ancienne vue à l'échelle 1 : sert à garder les mêmes tailles d'indicateurs. */
const OLD_PX = 45.25;
const LAND = 0x69b34c, ROAD = 0x3d4656, CURB = 0xc4b9a2, LINE = 0xf1f4f8, SAND = 0xefe3bc, SEA = 0x4fb4e4, DEEP = 0x2f8fcb;
const PATCHES = [0x62ad49, 0x7abd55, 0x9fc45c, 0x5ea746, 0x8cc257];
/** Couleurs du sol selon la saison : feuilles mortes à Halloween, neige à Noël, prés fleuris à Pâques, herbe dorée l'été. */
const GROUND: Record<Season, { land: number; patches: number[] }> = {
  halloween: { land: 0x7d9443, patches: [0x8a9440, 0xa5863a, 0x7d8f3e, 0xb4743a, 0x96a04a] },
  noel: { land: 0xe6edf4, patches: [0xf4f7fb, 0xd9e3ec, 0xe9eff5, 0xd2deea, 0xf1f5f9] },
  paques: { land: 0x6dbb50, patches: [0x7cc25a, 0x8fcf63, 0xa6d86c, 0xf2c5da, 0xfbe7a1] },
  ete: { land: 0x86b84a, patches: [0x9cc25a, 0xb3c95e, 0xc9c46a, 0x8fbf52, 0xd9c777] },
};
const CAR_COLORS = [0xef4444, 0xf8fafc, 0x2563eb, 0xf59e0b, 0x1f2937, 0x10b981];
const COATS = [0x2563eb, 0xef4444, 0xf59e0b, 0x10b981, 0x8b5cf6, 0x1f2937, 0xec4899];

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const keyOf = (p: Plot) => `${p.id}@${p.x},${p.y}`;
/** Centre du terrain d'un bâtiment, et hauteur de sa maquette : un terrain plus grand donne un bâtiment plus large et un peu plus haut. */
const ctr = (p: Plot, axis: "x" | "y") => p[axis] + sideOf(p) / 2;
const tall = (s: number) => 1 + (s - 1) * 0.6;
const topOf = (p: Plot) => buildingModel(p.id).top * tall(sideOf(p));

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
/** Pièces animées d'un type de bâtiment : une instance par bâtiment posé. */
interface Part { mesh: THREE.InstancedMesh; def: Motion; items: { key: string; x: number; z: number; w: number; h: number; off: number }[] }
interface Spin { at: V3; size: number; off: number }
/** Voiture ou passant qui suit une rue. `speed` en carreaux par seconde. */
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
  /** Hors du territoire : le sol est un peu assombri, pour qu'on voie d'un coup d'œil où s'arrête la ville. */
  private outMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.16, depthWrite: false });
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
  private parts: Part[] = []; private partScale = new Map<string, number>();
  private cars: Mover[] = []; private carMesh: THREE.InstancedMesh | null = null;
  private walkers: Mover[] = []; private bodyMesh: THREE.InstancedMesh | null = null; private headMesh: THREE.InstancedMesh | null = null;
  private glow: THREE.InstancedMesh | null = null;
  private seen: Set<string> | null = null; private births = new Map<string, number>(); private growUntil = 0;
  private hidden: string | null = null;
  /** Ampoules décoratives de la saison (une matière par couleur, plus forte la nuit). */
  private festive = new Map<number, THREE.MeshStandardMaterial>();
  private bulbGeo = new THREE.SphereGeometry(1, 8, 6);
  private flakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  /** Neige qui tombe (Noël) : position de départ de chaque flocon, autour du centre de l'écran. */
  private flakes: { ox: number; oz: number; y0: number; sp: number; ph: number }[] = []; private flakeMesh: THREE.InstancedMesh | null = null;
  /** Animation de l'événement de la semaine, et l'éclairage « de base » (jour/nuit) qu'elle module. */
  private ev: EventFx | null = null; private evT = 0;
  /** Événement dont les shaders se préparent en arrière-plan (voir stageFx). `undefined` : rien en cours. */
  private fxWant: string | null | undefined = undefined;
  /** Shaders de la ville en préparation à l'ouverture : on attend qu'ils soient prêts pour dessiner (voir setCity). */
  private warming = false;
  /** Durée moyenne entre deux images de l'écran (ms) : sous 11 ms, écran 120 Hz ou plus. */
  private tick = 16.7;

  // ─── Ombres en cache (voir shadowPass) ───
  /** Faux si un objet qui projette une ombre sort du cas simple (matériau double face, transparence découpée…) :
   *  three.js calcule alors les ombres lui-même, comme avant. */
  private cacheable = false;
  /** Ombres de tout ce qui ne bouge pas, gardées tant que rien ne change. */
  private staticRT: THREE.WebGLRenderTarget | null = null;
  private shadowKey = ""; private staticVer = 0;
  /** Même matériau que celui de three.js pour ses ombres (MeshDepthMaterial), face arrière comme lui pour un matériau à une face. */
  private depthMat = new THREE.MeshDepthMaterial({ side: THREE.BackSide });
  private baseLight = { hemi: 1.5, sun: 2.9, hemiC: new THREE.Color(0xdfeaff), sunC: new THREE.Color(0xffe9c4) };
  /** Décor de saison de la mairie (selon la date du joueur), vérifié toutes les minutes. */
  private season: Season | null = seasonOf();
  // Vue
  private frameOpts: CityFrame = { height: 440, compact: false, interactive: false, initialZoom: 1, padTop: 0, padBottom: 0 };
  private live: CityLive = { mode: null, selected: null, tone: "primary", markers: [], signs: {}, layers: false, light: "auto" };
  private markerMap = new Map<string, CityMarker>();
  private W = 1; private H = 1; private u = 0.05; private tx = 0; private tz = 0;
  private base = { u: 0.05, tx: 0, tz: 0 }; private view = { zoom: 1, ox: 0, oz: 0 }; private lastInitial = 1;
  private goal: { zoom: number; ox: number; oz: number } | null = null;
  private framed = false;
  private night = 0; private nightAt = 0; private nightSeen: Light = "auto"; private nightDrawn = -1;
  private hoverTile: { x: number; y: number } | null = null;
  /** Point du sol sous le pointeur (fractionnaire) : sert à centrer un grand bâtiment sous le doigt. */
  private hoverPt: { x: number; z: number } | null = null;
  /** Orientation de la caméra (angle autour de la ville) : on la tourne par quarts de tour pour voir derrière les tours. */
  private az = Math.PI / 4; private azGoal = Math.PI / 4;
  private rx = R2; private rz = -R2; private fx = R2; private fz = R2;
  // Boucle
  private raf = 0; private onScreen = true; private lastDraw = 0; private disposed = false;
  private reduce = false; private lite = false; private slowFrames = 0; private prevT = 0; private told = false; private warmed = false;
  /** Vue figée : le joueur préfère moins de mouvement, ou les graphismes légers sont actifs. */
  private get calm() { return this.reduce || this.lite; }
  private pts = new Map<number, { x: number; y: number }>();
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new THREE.Color(LAND);
    // Halo des lampadaires : un dégradé rond, calculé une fois. Blanc pur partout, seule l'opacité varie.
    // Avant, il était dessiné dans un canvas 2D : sur une vraie carte graphique, le navigateur « trame » les dégradés
    // (±1 sur chaque couleur), et ce bruit, très amplifié là où le halo est presque transparent, faisait des pixels
    // de toutes les couleurs sur la route sous les lampadaires.
    const halo = new Uint8Array(64 * 64 * 4);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) {
      const d = Math.hypot(i + 0.5 - 32, j + 0.5 - 32) / 32, o = (j * 64 + i) * 4;
      halo[o] = halo[o + 1] = halo[o + 2] = 255; halo[o + 3] = Math.round(255 * Math.max(0, 1 - d));
    }
    const haloTex = new THREE.DataTexture(halo, 64, 64, THREE.RGBAFormat);
    haloTex.magFilter = THREE.LinearFilter; haloTex.minFilter = THREE.LinearMipmapLinearFilter; haloTex.generateMipmaps = true;
    haloTex.needsUpdate = true;
    this.glowMat.map = haloTex;
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
    // Modèles pas encore prêts (première ouverture d'une grande ville) : on les prépare par petits morceaux, sans figer
    // la page, puis on construit. La ville s'affiche au même moment qu'avant, mais la page reste fluide pendant ce temps.
    const season = seasonOf();
    const missing = [...new Set(plots.map((p) => (p.id === "townhall" && season ? `townhall@${season}` : p.id)))].filter((id) => !modelReady(id));
    if (missing.length > 2) {
      this.pendingCity = [plots, mapSize, f];
      if (!this.warmingModels) {
        this.warmingModels = true;
        warmBuildings(missing, () => {
          this.warmingModels = false;
          const p = this.pendingCity; this.pendingCity = null;
          if (p && !this.disposed) this.setCity(...p);
        });
      }
      return;
    }
    this.pendingCity = null;
    this.plots = plots; this.mapSize = mapSize; this.frameOpts = f;
    this.listen(!f.compact);
    const now = performance.now();
    if (this.seen === null) this.seen = new Set(plots.map(keyOf));
    for (const p of plots) { const k = keyOf(p); if (!this.seen.has(k)) { this.seen.add(k); this.births.set(k, now); this.growUntil = now + 900; } }

    // Zone visible : autour des bâtiments (plus large en mode construction), arrêtée sur une route
    const xs = plots.flatMap((p) => [p.x, p.x + sideOf(p) - 1]), ys = plots.flatMap((p) => [p.y, p.y + sideOf(p) - 1]);
    const pad = f.interactive ? 3 : 1, span = f.interactive ? 6 : 3;
    let x0 = Math.min(...xs, CENTER - span) - pad, x1 = Math.max(...xs, CENTER + span) + pad;
    let y0 = Math.min(...ys, CENTER - span) - pad, y1 = Math.max(...ys, CENTER + span) + pad;
    const { lo, hi } = mapBounds(mapSize);
    x0 = Math.max(lo, x0); y0 = Math.max(lo, y0); x1 = Math.min(hi - 1, x1); y1 = Math.min(hi - 1, y1);
    // Dans sa propre ville, on voit et on peut construire sur tout le territoire, même là où il n'y a encore rien
    if (f.interactive) { x0 = lo; y0 = lo; x1 = hi - 1; y1 = hi - 1; }
    this.x0 = roadBelow(x0); this.y0 = roadBelow(y0);
    this.x1 = Math.min(hi - 1, roadAbove(x1)); this.y1 = Math.min(hi - 1, roadAbove(y1));
    this.byTile = occupancy(plots);
    this.builtBlocks = new Set(plots.map((p) => `${blockOf(p.x)},${blockOf(p.y)}`));

    this.rebuild();
    if (this.ev) this.setFx(this.ev.id);
    const first = !this.framed || this.lastInitial !== f.initialZoom;
    this.layout();
    if (first) { this.framed = true; this.lastInitial = f.initialZoom; this.view = { zoom: this.startZoom(), ox: 0, oz: 0 }; this.applyView(); }
    this.applyLive();
    // Première ouverture : les shaders (programmes de la carte graphique) se préparent sans bloquer la page,
    // puis la ville est dessinée. Avant, la page entière gelait le temps de les préparer au premier dessin.
    if (!this.warmed) {
      this.warmed = true;
      const compile = (this.renderer as { compileAsync?: THREE.WebGLRenderer["compileAsync"] }).compileAsync;
      if (compile) {
        this.warming = true;
        const go = () => { if (!this.warming) return; this.warming = false; this.run(); };
        try { void compile.call(this.renderer, this.scene, this.cam).then(go, go); } catch { this.warming = false; }
        setTimeout(go, 2500); // filet : jamais plus de 2,5 s sans image
      }
    }
    this.run();
  }

  /** Route goudronnée : autour des îlots bâtis, plus les deux axes qui relient la ville à l'extérieur. */
  private paved(x: number, y: number) {
    if (!isRoad(x, y)) return false;
    if (x === CENTER || y === CENTER) return true;
    const bxs = onRoadLine(x) ? [blockOf(x) - 1, blockOf(x)] : [blockOf(x)];
    const bys = onRoadLine(y) ? [blockOf(y) - 1, blockOf(y)] : [blockOf(y)];
    return bxs.some((bx) => bys.some((by) => this.builtBlocks.has(`${bx},${by}`)));
  }

  private clearWorld() {
    this.world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.own) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.world.clear();
    this.cullRecs.clear();
    this.inst.clear(); this.puffs = []; this.spins = []; this.cars = []; this.walkers = []; this.parts = []; this.partScale.clear();
    this.puffMesh = this.spinMesh = this.carMesh = this.bodyMesh = this.headMesh = this.glow = this.layerTiles = null;
    this.modeGrid = null; this.hidden = null; this.flakeMesh = null; this.flakes = [];
  }

  private own(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
    const m = new THREE.Mesh(geo, mat); m.userData.own = true; m.receiveShadow = shadow; this.world.add(m); return m;
  }
  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0) {
    this.e.set(0, ry, 0); this.q.setFromEuler(this.e);
    this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz)); this.setInst(mesh, i, this.m4);
  }

  // ─── Tri de visibilité, exemplaire par exemplaire ───
  // Une série d'instances (tous les bâtiments d'un type, tous les arbres d'une sorte…) est dessinée d'un bloc : three.js ne
  // sait que la garder ou l'écarter en entier. Avec une grande ville, presque tout était dessiné, même hors de l'écran.
  // Ici, avant chaque image où la vue a changé, chaque série ne garde que ses exemplaires visibles à l'écran OU dans la zone
  // d'ombre du soleil (un bâtiment juste hors de l'écran peut y projeter son ombre). Les exemplaires écartés ne touchent
  // aucun pixel : l'image est exactement la même. Mêmes séries, même nombre de dessins ; seulement moins de triangles.
  // Les objets animés (voitures, passants, pièces mobiles…, frustumCulled = false) ne sont pas concernés.
  private pendingCity: [Plot[], number, CityFrame] | null = null; private warmingModels = false;
  private cullRecs = new Map<THREE.InstancedMesh, { n: number; all: Float32Array; colors: Float32Array | null; c: Float32Array; r: Float32Array }>();
  private cullKey = "";
  private fMain = new THREE.Frustum(); private fShadow = new THREE.Frustum(); private sph = new THREE.Sphere(); private pm = new THREE.Matrix4();

  /** Écrit la matrice d'un exemplaire : dans la série elle-même, ou dans sa copie complète si la série est triée. */
  private setInst(mesh: THREE.InstancedMesh, i: number, m: THREE.Matrix4) {
    const rec = this.cullRecs.get(mesh);
    if (!rec) { mesh.setMatrixAt(i, m); return; }
    m.toArray(rec.all, i * 16);
    this.cullSphere(mesh, rec, i);
    this.cullKey = ""; // à refaire avant la prochaine image
  }
  /** Sphère qui contient l'exemplaire `i` (sphère du modèle, déplacée et agrandie comme lui) : jamais trop petite. */
  private cullSphere(mesh: THREE.InstancedMesh, rec: { all: Float32Array; c: Float32Array; r: Float32Array }, i: number) {
    const e = rec.all, o = i * 16, bs = mesh.geometry.boundingSphere!, c = bs.center;
    rec.c[i * 3] = e[o] * c.x + e[o + 4] * c.y + e[o + 8] * c.z + e[o + 12];
    rec.c[i * 3 + 1] = e[o + 1] * c.x + e[o + 5] * c.y + e[o + 9] * c.z + e[o + 13];
    rec.c[i * 3 + 2] = e[o + 2] * c.x + e[o + 6] * c.y + e[o + 10] * c.z + e[o + 14];
    const sc = Math.max(Math.hypot(e[o], e[o + 1], e[o + 2]), Math.hypot(e[o + 4], e[o + 5], e[o + 6]), Math.hypot(e[o + 8], e[o + 9], e[o + 10]));
    rec.r[i] = bs.radius * sc * 1.0001 + 1e-4;
  }
  /** Après la construction de la ville : chaque série fixe garde une copie complète de ses exemplaires. */
  private manageAll() {
    this.cullRecs.clear();
    this.world.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh || m.frustumCulled === false) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const n = m.count;
      const rec = { n, all: (m.instanceMatrix.array as Float32Array).slice(0, n * 16), colors: m.instanceColor ? (m.instanceColor.array as Float32Array).slice(0, n * 3) : null, c: new Float32Array(n * 3), r: new Float32Array(n) };
      for (let i = 0; i < n; i++) this.cullSphere(m, rec, i);
      this.cullRecs.set(m, rec);
    });
    this.cullKey = "";
  }
  /** Garde dans chaque série les exemplaires visibles (écran ou zone d'ombre). Rien à faire si la vue n'a pas bougé. */
  private cull() {
    if (!this.cullRecs.size) return;
    const cam = this.cam, sun = this.sun, shadow = sun.castShadow;
    cam.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (shadow) { sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun); }
    const key = `${this.pm.elements.join(",")}|${shadow ? sun.shadow.matrix.elements.join(",") : "-"}`;
    if (key === this.cullKey) return;
    this.cullKey = key;
    this.fMain.setFromProjectionMatrix(this.pm);
    if (shadow) this.fShadow.copy(sun.shadow.getFrustum());
    for (const [m, rec] of this.cullRecs) {
      const dst = m.instanceMatrix.array as Float32Array, dc = m.instanceColor ? (m.instanceColor.array as Float32Array) : null;
      const caster = shadow && m.castShadow;
      let k = 0;
      for (let i = 0; i < rec.n; i++) {
        this.sph.center.set(rec.c[i * 3], rec.c[i * 3 + 1], rec.c[i * 3 + 2]); this.sph.radius = rec.r[i];
        if (!this.fMain.intersectsSphere(this.sph) && !(caster && this.fShadow.intersectsSphere(this.sph))) continue;
        dst.set(rec.all.subarray(i * 16, i * 16 + 16), k * 16);
        if (dc && rec.colors) dc.set(rec.colors.subarray(i * 3, i * 3 + 3), k * 3);
        k++;
      }
      m.count = k;
      // Série sans aucun exemplaire visible : pas de dessin du tout (le halo des lampadaires a sa propre visibilité, jour/nuit)
      if (m !== this.glow) m.visible = k > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.boundingSphere = null;
    }
  }

  private rebuild() {
    this.clearWorld();
    this.season = seasonOf();
    const ground = this.season ? GROUND[this.season] : { land: LAND, patches: PATCHES };
    (this.scene.background as THREE.Color).set(ground.land); (this.land.material as THREE.MeshStandardMaterial).color.set(ground.land);
    const bulbs: { x: number; y: number; z: number; r: number; c: number }[] = [];
    const { x0, x1, y0, y1 } = this, mid = CENTER;
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
        if (r < 0.62) flat.quad(x + 0.15, y + 0.15, x + CELL - 0.15, y + CELL - 0.15, 0.002, ground.patches[Math.floor((r / 0.62) * ground.patches.length)]);
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
      const cw = 0.1, rx = onRoadLine(x), ry = onRoadLine(y);
      if (!isRoad(x - 1, y)) flat.quad(x, y, x + cw, y + 1, 0.016, CURB);
      if (!isRoad(x + 1, y)) flat.quad(x + 1 - cw, y, x + 1, y + 1, 0.016, CURB);
      if (!isRoad(x, y - 1)) flat.quad(x, y, x + 1, y + cw, 0.016, CURB);
      if (!isRoad(x, y + 1)) flat.quad(x, y + 1 - cw, x + 1, y + 1, 0.016, CURB);
      if (rx && ry) { lamps.push([x + 0.1, y + 0.1]); continue; }
      const nearCross = rx ? cellOf(y) === 1 || cellOf(y) === GRID - 1 : cellOf(x) === 1 || cellOf(x) === GRID - 1;
      if (nearCross) {
        const edge = rx ? (cellOf(y) === 1 ? y + 0.08 : y + 0.72) : cellOf(x) === 1 ? x + 0.08 : x + 0.72;
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
    const modelOf = (p: Plot) => (p.id === "townhall" && this.season ? `townhall@${this.season}` : p.id);
    for (const p of this.plots) { const k = modelOf(p), l = byId.get(k); if (l) l.push(p); else byId.set(k, [p]); }
    for (const [id, list] of byId) {
      const model = buildingModel(id);
      const solid = new THREE.InstancedMesh(model.solid, this.bMat, list.length);
      // Tri de visibilité : une série entièrement hors de l'écran (ou de la zone d'ombre du soleil) n'est pas dessinée.
      // three.js calcule la sphère qui englobe toutes les instances ; on la remet à zéro quand un bâtiment bouge (scaleInst).
      solid.castShadow = true; solid.receiveShadow = true;
      const lit = model.lit ? new THREE.InstancedMesh(model.lit, this.litMat, list.length) : null;
      list.forEach((p, i) => {
        const w = sideOf(p), h = tall(w), cx = ctr(p, "x"), cy = ctr(p, "y");
        this.place(solid, i, cx, 0, cy, w, h, w);
        if (lit) this.setInst(lit, i, this.m4);
        this.inst.set(keyOf(p), { solid, lit, index: i, plot: p });
        for (const s of model.smoke) for (let k = 0; k < 3; k++) this.puffs.push({ at: [cx + s[0] * w, s[1] * h, cy + s[2] * w], off: k / 3 + hash(p.x, p.y) });
        for (const r of model.rotors) this.spins.push({ at: [cx + r.at[0] * w, r.at[1] * h, cy + r.at[2] * w], size: r.size * w, off: hash(p.x * 3, p.y * 5) * 6 });
        for (const l of model.lights) bulbs.push({ x: cx + l.at[0] * w, y: l.at[1] * h, z: cy + l.at[2] * w, r: l.r * w, c: l.c });
      });
      this.world.add(solid); if (lit) this.world.add(lit);
      // Pièces animées de ce type de bâtiment
      for (const def of model.motions) {
        const mesh = new THREE.InstancedMesh(def.geo, this.bMat, list.length);
        mesh.castShadow = true; mesh.frustumCulled = false;
        this.parts.push({ mesh, def, items: list.map((p) => ({ key: keyOf(p), x: ctr(p, "x"), z: ctr(p, "y"), w: sideOf(p), h: tall(sideOf(p)), off: hash(p.x * 7 + 1, p.y * 3 + 2) })) });
        this.world.add(mesh);
      }
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
    // Allure de saison : feuillage d'automne (trois teintes mêlées), neige, arbres en fleurs
    const lookOf = (pine: boolean, x: number, y: number): TreeLook => {
      const sz = this.season;
      if (sz === "noel") return "snow";
      if (sz === "halloween" && !pine) return (`autumn${Math.floor(hash(Math.round(x * 7), Math.round(y * 11)) * 3)}`) as TreeLook;
      if (sz === "paques" && !pine && hash(Math.round(x * 3), Math.round(y * 5)) < 0.6) return "blossom";
      return "";
    };
    const looks = new Set(trees.map((t) => `${t[3] ? 1 : 0}|${lookOf(t[3], t[0], t[1])}`));
    for (const key of looks) {
      const [pf, look] = key.split("|") as [string, TreeLook], pine = pf === "1";
      const list = trees.filter((t) => t[3] === pine && lookOf(pine, t[0], t[1]) === look);
      if (!list.length) continue;
      const tm = new THREE.InstancedMesh(treeModel(pine, look), this.gMat, list.length);
      list.forEach(([x, y, s], i) => this.place(tm, i, x, 0, y, s, s, s, hash(Math.round(x * 5), Math.round(y * 3)) * 6));
      tm.castShadow = true; tm.receiveShadow = true; this.world.add(tm);
    }

    // ─── Décor de saison dans les rues : au pied des lampadaires (un carrefour sur deux pour les sapins) ───
    if (this.season && lamps.length) {
      const deco = streetDecor(this.season), spots = lamps.filter(([x, y]) => this.season !== "noel" || hash(Math.round(x), Math.round(y)) < 0.55);
      if (spots.length) {
        const dm = new THREE.InstancedMesh(deco.solid, this.gMat, spots.length);
        spots.forEach(([x, y], i) => {
          // Au pied du poteau, côté trottoir (le poteau est à 0,1 du coin de l'îlot). Avant : 0,3 plus loin, au milieu
          // du carrefour, où le décor faisait des taches de couleur sur la route.
          const dx = x - 0.07, dz = y - 0.07, ry = hash(Math.round(x * 3), Math.round(y)) * 6;
          this.place(dm, i, dx, 0.016, dz, 1, 1, 1, ry);
          for (const l of deco.lights) {
            // Lumière haute (lanterne d'Halloween) : accrochée sous la tête du lampadaire, au lieu de flotter à côté
            if (l.at[1] > 0.3) { bulbs.push({ x: x + 0.09, y: 0.37, z: y, r: l.r, c: l.c }); continue; }
            const c = Math.cos(ry), sn = Math.sin(ry);
            bulbs.push({ x: dx + l.at[0] * c + l.at[2] * sn, y: 0.016 + l.at[1], z: dz - l.at[0] * sn + l.at[2] * c, r: l.r, c: l.c });
          }
        });
        dm.castShadow = true; this.world.add(dm);
      }
    }
    // Ampoules décoratives : une série par couleur
    const byColor = new Map<number, typeof bulbs>();
    for (const b of bulbs) { const l = byColor.get(b.c); if (l) l.push(b); else byColor.set(b.c, [b]); }
    for (const [c, list] of byColor) {
      let mat = this.festive.get(c);
      if (!mat) { mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.4 }); this.festive.set(c, mat); }
      const bm = new THREE.InstancedMesh(this.bulbGeo, mat, list.length);
      list.forEach((b, i) => this.place(bm, i, b.x, b.y, b.z, b.r));
      this.world.add(bm);
    }
    this.applyNight();
    // Neige qui tombe à Noël (pas en graphismes légers)
    if (this.season === "noel" && !this.lite) {
      const n = 420;
      this.flakes = Array.from({ length: n }, (_, i) => ({ ox: hash(i, 3) * 2 - 1, oz: hash(i, 7) * 2 - 1, y0: hash(i, 11) * 7, sp: 0.6 + hash(i, 13) * 0.8, ph: hash(i, 17) * 6.28 }));
      this.flakeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.028, 0), this.flakeMat, n);
      this.flakeMesh.userData.own = true; this.flakeMesh.frustumCulled = false; this.flakeMesh.renderOrder = 5; this.world.add(this.flakeMesh);
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
    for (let k = roadAbove(x0); k <= x1; k += GRID) lines.push({ axis: "x", k });
    for (let k = roadAbove(y0); k <= y1; k += GRID) lines.push({ axis: "y", k });
    const compact = this.frameOpts.compact;
    if (lines.length && !compact) {
      const nc = Math.min(10, 2 + Math.floor(this.plots.length / 2)), nw = Math.min(26, Math.floor(this.plots.length * 0.8));
      this.cars = Array.from({ length: nc }, (_, i) => ({ ...lines[i % lines.length], speed: 0.7 + hash(i, 3) * 0.4, off: hash(i, 7), dir: i % 2 ? 1 : -1, side: 0 }));
      this.carMesh = new THREE.InstancedMesh(propModel("car"), this.gMat, nc); this.carMesh.castShadow = true; this.carMesh.frustumCulled = false;
      for (let i = 0; i < nc; i++) this.carMesh.setColorAt(i, this.col.set(CAR_COLORS[i % CAR_COLORS.length]));
      this.world.add(this.carMesh);
      if (nw) {
        this.walkers = Array.from({ length: nw }, (_, i) => ({ ...lines[(i * 3 + 1) % lines.length], speed: 0.1 + hash(i, 13) * 0.06, off: hash(i, 19), dir: i % 2 ? 1 : -1, side: hash(i, 23) < 0.5 ? 0.05 : 0.95 }));
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

    // ─── Limites du territoire : un liseré blanc bordé de bleu autour des carreaux constructibles, le dehors assombri ───
    {
      const { lo, hi } = mapBounds(this.mapSize), a = lo + 1, b = hi - 1, line = new Flat(), y = 0.024;
      const frame = (w: number, color: number, inset = 0) => {
        const o = a - inset, e = b + inset;
        line.quad(o - w, o - w, e + w, o, y, color); line.quad(o - w, e, e + w, e + w, y, color);
        line.quad(o - w, o, o, e, y, color); line.quad(e, o, e + w, e, y, color);
      };
      frame(0.16, 0xffffff, 0.04); frame(0.07, 0x2563eb, 0.2);
      this.own(line.geometry(), this.gMat).renderOrder = 1;
      if (this.frameOpts.interactive) {
        const out = new Flat(), far = 260, yy = 0.03;
        out.quad(a - far, a - far, b + far, a - 0.2, yy, 0); out.quad(a - far, b + 0.2, b + far, b + far, yy, 0);
        out.quad(a - far, a - 0.2, a - 0.2, b + 0.2, yy, 0); out.quad(b + 0.2, a - 0.2, b + far, b + 0.2, yy, 0);
        const m = this.own(out.geometry(), this.outMat, false); m.renderOrder = 1;
      }
    }

    // ─── Calque « Quartiers » : une dalle de couleur par bâtiment ───
    if (this.plots.length) {
      this.layerTiles = new THREE.InstancedMesh(this.plane, this.layerMat, this.plots.length);
      this.plots.forEach((p, i) => {
        this.place(this.layerTiles!, i, ctr(p, "x"), 0.062, ctr(p, "y"), sideOf(p), 1, sideOf(p));
        this.layerTiles!.setColorAt(i, this.col.set(CAT_COLOR[BUILDING_BY_ID[p.id]?.category ?? "housing"]));
      });
      this.layerTiles.frustumCulled = false; this.layerTiles.renderOrder = 2; this.layerTiles.visible = false; this.world.add(this.layerTiles);
    }
    this.tagCasters();
    this.manageAll();
  }

  /** Range les objets qui projettent une ombre : calque 1 = ceux qui bougent à chaque image (voitures, piétons,
   *  éoliennes, pièces animées), calque 2 = tout le reste. Les calques ne servent qu'au calcul des ombres :
   *  tous les objets restent aussi sur le calque 0, celui de la caméra. */
  private tagCasters() {
    const moving = new Set<THREE.Object3D>([this.carMesh, this.bodyMesh, this.headMesh, this.spinMesh, ...this.parts.map((p) => p.mesh)].filter((o): o is THREE.InstancedMesh => !!o));
    let ok = true;
    this.scene.traverse((o) => {
      o.layers.disable(1); o.layers.disable(2);
      const m = o as THREE.Mesh;
      if (!o.castShadow || (o as THREE.Light).isLight) return; // le soleil « projette » les ombres : ce n'est pas un objet
      if (!m.isMesh) { ok = false; return; }
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat) || mat.side !== THREE.FrontSide || mat.shadowSide !== null || mat.alphaTest > 0 || mat.alphaToCoverage
        || (mat as THREE.MeshStandardMaterial).displacementMap || (mat as THREE.MeshStandardMaterial).wireframe || m.customDepthMaterial) ok = false;
      o.layers.enable(moving.has(o) ? 1 : 2);
    });
    this.cacheable = ok;
    this.staticVer++;
  }

  /** Ombres du soleil, à chaque image. three.js recalculait celles de TOUTE la ville à chaque image (près de la moitié
   *  des triangles dessinés), alors que presque rien ne bouge. Ici :
   *  - les ombres de ce qui ne bouge pas sont calculées une fois, puis gardées tant que la vue, le soleil et la ville
   *    ne changent pas ;
   *  - à chaque image, on repart de cette copie et on n'ajoute que les ombres de ce qui bouge.
   *  Le résultat est exactement le même : la profondeur la plus proche du soleil, calculée par le même matériau
   *  et les mêmes matrices que three.js. Seul ce qui sert à le calculer change. */
  private shadowPass() {
    const sm = this.renderer.shadowMap, sun = this.sun, sh = sun.shadow;
    if (!this.cacheable || !sun.castShadow) { sm.autoUpdate = true; return; }
    sm.autoUpdate = false; sm.needsUpdate = false;
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    sh.updateMatrices(sun);
    const w = sh.mapSize.x, h = sh.mapSize.y;
    const make = () => {
      // Comme three.js (WebGLShadowMap) : profondeur 24 bits comparée à la lecture, filtrage linéaire
      const rt = new THREE.WebGLRenderTarget(w, h);
      const d = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      d.format = THREE.DepthFormat; d.compareFunction = THREE.LessEqualCompare; d.minFilter = THREE.LinearFilter; d.magFilter = THREE.LinearFilter;
      rt.depthTexture = d;
      return rt;
    };
    if (!sh.map || sh.map.width !== w || sh.map.height !== h) {
      sh.map?.depthTexture?.dispose(); sh.map?.dispose();
      sh.map = make(); sh.map.texture.name = sun.name + ".shadowMap"; sh.map.depthTexture!.name = sun.name + ".shadowMap";
      this.renderer.initRenderTarget(sh.map as THREE.WebGLRenderTarget);
      this.shadowKey = "";
    }
    if (!this.staticRT || this.staticRT.width !== w || this.staticRT.height !== h) {
      this.staticRT?.depthTexture?.dispose(); this.staticRT?.dispose();
      this.staticRT = make(); this.renderer.initRenderTarget(this.staticRT);
      this.shadowKey = "";
    }
    const key = `${sh.matrix.elements.join(",")}|${this.staticVer}`;
    if (key !== this.shadowKey) { this.depthPass(2, this.staticRT, true); this.shadowKey = key; }
    this.renderer.copyTextureToTexture(this.staticRT.depthTexture!, sh.map.depthTexture!);
    this.depthPass(1, sh.map as THREE.WebGLRenderTarget, false);
  }

  /** Dessine la profondeur des objets du calque `layer`, vue du soleil, dans `rt`. */
  private depthPass(layer: number, rt: THREE.WebGLRenderTarget, clear: boolean) {
    const r = this.renderer, sc = this.scene, cam = this.sun.shadow.camera;
    const bg = sc.background, over = sc.overrideMaterial, auto = r.autoClear;
    sc.background = null; sc.overrideMaterial = this.depthMat; r.autoClear = false;
    cam.layers.set(layer);
    r.setRenderTarget(rt);
    if (clear) r.clear();
    r.render(sc, cam);
    r.setRenderTarget(null);
    sc.background = bg; sc.overrideMaterial = over; r.autoClear = auto;
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
    if ((l.event ?? null) !== (this.ev?.id ?? null)) this.stageFx(l.event ?? null);
    if (!!l.lite !== this.lite) {
      this.lite = !!l.lite;
      this.sun.castShadow = !this.lite;
      if (this.ev) this.setFx(this.ev.id);
      this.overlayKey = ""; // les pastilles sont refaites : elles ne se balancent plus en léger
      this.layout();
      this.run();
    }
    this.markerMap = new Map(l.markers.map((m) => [`${m.x},${m.y}`, m]));
    if (l.mode && !this.modeGrid) this.buildModeGrid();
    if (this.modeGrid) this.modeGrid.visible = !!l.mode;
    if (this.layerTiles) this.layerTiles.visible = l.layers;
    // Calque, ou bâtiment à poser : les bâtiments deviennent translucides, une tour ne cache plus les carreaux derrière elle
    const see = l.layers || !!l.mode;
    if (this.bMat.transparent !== see) { this.bMat.transparent = see; this.bMat.needsUpdate = true; }
    this.bMat.opacity = l.layers ? 0.45 : l.mode ? 0.55 : 1;
    // Bâtiment en cours de déplacement : estompé à sa place d'origine
    const from = l.mode?.kind === "move" ? this.byTile.get(`${l.mode.from.x},${l.mode.from.y}`) : undefined;
    const hideKey = from ? keyOf(from) : null;
    if (hideKey !== this.hidden) {
      if (this.hidden) this.scaleInst(this.hidden, 1);
      if (hideKey) this.scaleInst(hideKey, 0);
      this.hidden = hideKey;
    }
    this.fade.visible = !!from;
    if (from) { const w = sideOf(from); this.fade.geometry = buildingModel(from.id).still; this.fade.position.set(ctr(from, "x"), 0, ctr(from, "y")); this.fade.scale.set(w, tall(w), w); }
    // Bâtiment sélectionné : tout son terrain
    const sel = l.mode?.kind === "move" ? l.mode.from : l.selected;
    this.sel.visible = this.ring.visible = !!sel;
    if (sel) {
      const c = l.mode?.kind === "move" ? 0xf59e0b : l.tone === "danger" ? 0xef4444 : 0x2563eb;
      this.selMat.color.set(c); this.ringMat.color.set(c);
      const p = this.byTile.get(`${sel.x},${sel.y}`) ?? { id: "", x: sel.x, y: sel.y }, w = sideOf(p);
      this.sel.position.set(ctr(p, "x"), 0.058, ctr(p, "y")); this.ring.position.set(ctr(p, "x"), 0.06, ctr(p, "y"));
      this.sel.scale.set(w, 1, w); this.ring.scale.set(w, 1, w);
    }
    this.refreshHover();
    this.syncOverlay();
  }

  /** Place chaque pièce animée pour l'instant `sec` (0 = pose de départ, quand le joueur préfère moins de mouvement). */
  private moveParts(sec: number) {
    const TAU = Math.PI * 2, ease = (u: number) => u * u * (3 - 2 * u);
    for (const part of this.parts) {
      const d = part.def, period = d.period ?? 4, amount = d.amount ?? 0;
      part.items.forEach((it, i) => {
        const grow = this.partScale.get(it.key) ?? 1, u = sec === 0 ? 0 : (sec / period + it.off) % 1;
        let px = d.at[0], py = d.at[1], pz = d.at[2], angle = 0, size = 1;
        if (d.kind === "spin") angle = sec * amount * TAU + (sec === 0 ? 0 : it.off * TAU);
        else if (d.kind === "rock") angle = Math.sin(u * TAU) * amount;
        else if (d.kind === "bob") py += Math.sin(u * TAU) * amount;
        else if (d.kind === "pulse") size = 1 + Math.sin(u * TAU) * amount;
        else if (d.to) {
          // slide : aller, arrêt, retour, arrêt ; pass : une traversée, puis rien jusqu'à la suivante
          const k = d.kind === "slide" ? (u < 0.38 ? ease(u / 0.38) : u < 0.5 ? 1 : u < 0.88 ? 1 - ease((u - 0.5) / 0.38) : 0) : Math.min(1, u / 0.6);
          px += (d.to[0] - px) * k; py += (d.to[1] - py) * k; pz += (d.to[2] - pz) * k;
          if (d.kind === "pass") size = u > 0.6 ? 0 : Math.min(1, u * 14, (0.6 - u) * 14);
        }
        // Une rotation couchée (grande roue) garde ses proportions ; le reste suit l'échelle du bâtiment
        const flat = (d.kind === "spin" || d.kind === "rock") && d.axis !== "y" && d.axis !== undefined;
        const sx = flat ? it.h : it.w, sy = it.h, sz = flat ? it.h : it.w;
        this.e.set(0, d.ry ?? 0, 0); this.q.setFromEuler(this.e);
        if (angle) { this.e.set(d.axis === "x" ? angle : 0, d.axis === "y" || !d.axis ? angle : 0, d.axis === "z" ? angle : 0); this.q2.setFromEuler(this.e); this.q.multiply(this.q2); }
        const f = grow * size;
        this.m4.compose(this.v.set(it.x + px * it.w, py * it.h * grow, it.z + pz * it.w), this.q, this.s.set(sx * f, sy * f, sz * f));
        part.mesh.setMatrixAt(i, this.m4);
      });
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private scaleInst(key: string, sy: number) {
    const it = this.inst.get(key); if (!it) return;
    this.staticVer++; // ombres des bâtiments à refaire
    const w = sideOf(it.plot);
    if (sy === 1) this.partScale.delete(key); else this.partScale.set(key, sy);
    this.place(it.solid, it.index, ctr(it.plot, "x"), 0, ctr(it.plot, "y"), sy === 0 ? 0 : w, sy * tall(w), sy === 0 ? 0 : w);
    if (it.lit) this.setInst(it.lit, it.index, this.m4);
  }

  private refreshHover() {
    const hv = this.hoverTile, m = this.live.mode;
    const inside = !!hv && hv.x >= this.x0 && hv.x <= this.x1 && hv.y >= this.y0 && hv.y <= this.y1;
    this.hover.visible = false; this.ghost.visible = false;
    if (!hv || !inside) return;
    const at = this.byTile.get(`${hv.x},${hv.y}`);
    // Terrain visé : en construction ou en déplacement, le carré du bâtiment à poser (le carreau survolé en est l'angle) ;
    // sinon, tout le terrain du bâtiment survolé
    let x = hv.x, y = hv.y, w = 1;
    if (m) {
      const moving = m.kind === "move" ? this.byTile.get(`${m.from.x},${m.from.y}`) : undefined;
      w = moving ? sideOf(moving) : footprint(m.id);
      ({ x, y } = this.anchor(w, moving));
      const free = canPlace(this.byTile, x, y, w, this.mapSize, moving), back = !!moving && moving.x === x && moving.y === y;
      const ok = free || back;
      this.hoverMat.color.set(ok ? 0x10b981 : 0xef4444); this.hoverMat.opacity = ok ? 0.45 : 0.35; this.hover.visible = true;
      if (free && !back) { this.ghost.geometry = buildingModel(m.id).still; this.ghost.position.set(x + w / 2, 0, y + w / 2); this.ghost.scale.set(w, tall(w), w); this.ghost.visible = true; }
    } else if (at) {
      x = at.x; y = at.y; w = sideOf(at);
      this.hoverMat.color.set(this.live.tone === "danger" ? 0xef4444 : 0x2563eb); this.hoverMat.opacity = this.live.tone === "danger" ? 0.28 : 0.22; this.hover.visible = true;
    }
    this.hover.position.set(x + w / 2, 0.056, y + w / 2); this.hover.scale.set(w, 1, w);
  }

  /** Carreau d'angle où poser un bâtiment de côté `w` sous le pointeur. Le bâtiment est centré sous le doigt ;
   *  si ça ne tient pas, on prend l'emplacement libre le plus proche du pointeur (un 2 × 2 se cale tout seul dans
   *  son îlot au lieu de déborder sur la route, et viser la route juste à côté d'un îlot libre suffit). */
  private anchor(w: number, moving?: Plot): { x: number; y: number } {
    const hv = this.hoverTile!, pt = this.hoverPt ?? { x: hv.x + 0.5, z: hv.y + 0.5 };
    const centred = { x: Math.round(pt.x - w / 2), y: Math.round(pt.z - w / 2) };
    if (w === 1 && canPlace(this.byTile, hv.x, hv.y, 1, this.mapSize, moving)) return { x: hv.x, y: hv.y };
    let best: { x: number; y: number } | null = null, bestD = Infinity;
    // Emplacements dont le centre est à moins d'un carreau et demi du pointeur : viser la route à côté d'un îlot
    // suffit pour y poser le bâtiment
    const reach = 1.6, lx = Math.floor(pt.x - w / 2 - reach), hx = Math.ceil(pt.x - w / 2 + reach), ly = Math.floor(pt.z - w / 2 - reach), hy = Math.ceil(pt.z - w / 2 + reach);
    for (let x = lx; x <= hx; x++) for (let y = ly; y <= hy; y++) {
      if (Math.hypot(x + w / 2 - pt.x, y + w / 2 - pt.z) > reach + (w - 1) / 2) continue;
      const ok = canPlace(this.byTile, x, y, w, this.mapSize, moving) || (!!moving && moving.x === x && moving.y === y);
      if (!ok) continue;
      const d = Math.hypot(x + w / 2 - pt.x, y + w / 2 - pt.z);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    return best ?? (w === 1 ? { x: hv.x, y: hv.y } : centred);
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
      this.pins.push({ el, x: ctr(p, "x"), y: ctr(p, "y"), top: topOf(p), lift: 0 });
    }
    if (!l.mode) for (const mk of l.markers) {
      const p = this.byTile.get(`${mk.x},${mk.y}`); if (!p) continue;
      const el = document.createElement("div");
      // Pastille cliquable (zone élargie pour le doigt) : elle ouvre la fiche du bâtiment, qui explique le problème
      el.style.cssText = "position:absolute;left:0;top:0;will-change:transform;pointer-events:auto;cursor:pointer;padding:8px 8px 0;touch-action:manipulation";
      el.innerHTML = markerSvg(mk.kind);
      el.addEventListener("click", (e) => { e.stopPropagation(); this.cb.click(mk.x, mk.y); });
      if (!this.calm) (el.firstElementChild as HTMLElement).animate([{ transform: "translateY(0)" }, { transform: "translateY(-4px)" }], { duration: 1300 + ((mk.x * 37 + mk.y * 11) % 5) * 90, direction: "alternate", iterations: Infinity, easing: "ease-in-out" });
      this.overlay.appendChild(el);
      this.pins.push({ el, x: ctr(p, "x"), y: ctr(p, "y"), top: topOf(p), lift: l.signs[`${mk.x},${mk.y}`] ? 1 : 0 });
    }
    this.placePins();
  }

  private placePins() {
    const sc = 1 / this.u / OLD_PX, size = Math.max(20, Math.min(64, 28 * sc)), r = Math.max(8, Math.min(13, 9 * sc));
    this.overlay.style.setProperty("--s", `${size.toFixed(1)}px`); this.overlay.style.setProperty("--r", `${r.toFixed(1)}px`);
    for (const p of this.pins) {
      const [sx, sy] = this.project(p.x, p.top + 0.06, p.y);
      const off = sx < -80 || sx > this.W + 80 || sy < -40 || sy > this.H + 120;
      p.el.style.display = off ? "none" : "";
      if (!off) p.el.style.transform = `translate(${sx.toFixed(1)}px,${(sy - p.lift * (size * 1.25)).toFixed(1)}px) translate(-50%,-100%)`;
    }
  }

  // ─── Vue : cadrage, zoom, déplacement ───
  private layout() {
    const f = this.frameOpts;
    this.W = Math.max(1, this.box.clientWidth); this.H = Math.max(1, f.height === "fill" ? this.box.clientHeight : f.height);
    const dpr = this.lite ? 1 : Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3_200_000 / (this.W * this.H))));
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(this.W, this.H, false);
    this.canvas.style.width = `${this.W}px`; this.canvas.style.height = `${this.H}px`;
    this.computeBase();
    this.applyView();
  }

  /** Cadrage de base : l'échelle qui fait tenir la ville, et le point visé (il dépend de l'orientation de la caméra). */
  private computeBase() {
    const f = this.frameOpts;
    const n = this.x1 + 1 - this.x0 + (this.y1 + 1 - this.y0), allow = (f.compact ? 1 : 1.8) * COS;
    const spanR = n * R2, spanF = n * R2 * SIN + allow;
    const usable = this.H - f.padTop - f.padBottom >= 160, top = usable ? f.padTop : 0, Ha = usable ? this.H - f.padTop - f.padBottom : this.H;
    const u = Math.max(spanR / Math.max(40, this.W - 24), spanF / Math.max(40, Ha - 16));
    const cx = (this.x0 + this.x1 + 1) / 2, cz = (this.y0 + this.y1 + 1) / 2;
    const k = ((top + Ha / 2 + allow / u / 2 - this.H / 2) * u) / SIN;
    this.base = { u, tx: cx - k * this.fx, tz: cz - k * this.fz };
  }

  /** Zoom le plus fort : au moins ×4, et toujours assez pour voir un bâtiment de près (écrans étroits). */
  private maxZoom() { return Math.max(MAX_ZOOM, this.base.u * CLOSE_PX); }
  /** Zoom de départ : celui demandé, relevé si les carreaux seraient trop petits pour être lisibles. */
  private startZoom() {
    const f = this.frameOpts;
    return f.compact ? f.initialZoom : Math.min(this.maxZoom(), Math.max(f.initialZoom, this.base.u * START_PX));
  }

  private applyView() {
    const v = this.view;
    v.zoom = Math.max(MIN_ZOOM, Math.min(this.maxZoom(), v.zoom));
    this.u = this.base.u / v.zoom; this.tx = this.base.tx + v.ox; this.tz = this.base.tz + v.oz;
    // On peut aller partout sur le terrain, zoomé ou non : c'est le point au centre de l'écran qui doit rester
    // sur le terrain (avant, c'était le centre du terrain qui devait rester à l'écran : en zoomant, on ne pouvait
    // plus s'éloigner que d'un ou deux carreaux).
    const cx = Math.max(this.x0 - PAN_MARGIN, Math.min(this.x1 + 1 + PAN_MARGIN, this.tx));
    const cz = Math.max(this.y0 - PAN_MARGIN, Math.min(this.y1 + 1 + PAN_MARGIN, this.tz));
    if (cx !== this.tx || cz !== this.tz) { v.ox = cx - this.base.tx; v.oz = cz - this.base.tz; this.tx = cx; this.tz = cz; }
    const D = 220;
    this.cam.left = (-this.W * this.u) / 2; this.cam.right = (this.W * this.u) / 2; this.cam.top = (this.H * this.u) / 2; this.cam.bottom = (-this.H * this.u) / 2;
    this.cam.position.set(this.tx + D * COS * this.fx, D * SIN, this.tz + D * COS * this.fz); this.cam.lookAt(this.tx, 0, this.tz); this.cam.updateProjectionMatrix();
    // Le soleil suit la vue : l'ombre ne couvre que ce qui est à l'écran
    const half = Math.max(6, Math.min(70, Math.max(this.W, this.H) * this.u * 0.62 + 3));
    const sc = this.sun.shadow.camera; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 150; sc.updateProjectionMatrix();
    this.sun.target.position.set(this.tx, 0, this.tz); this.sun.position.set(this.tx - 33, 60, this.tz + 13);
    this.land.position.set(Math.round(this.tx), -0.004, Math.round(this.tz));
    this.placePins();
  }

  /** Décale le contenu de (dx, dy) pixels à l'écran. */
  private shift(dx: number, dy: number) {
    const a = dx * this.u, b = (dy * this.u) / SIN;
    this.view.ox -= a * this.rx + b * this.fx; this.view.oz -= a * this.rz + b * this.fz;
    this.tx = this.base.tx + this.view.ox; this.tz = this.base.tz + this.view.oz;
  }
  private project(x: number, y: number, z: number): [number, number] {
    const dx = x - this.tx, dz = z - this.tz;
    return [this.W / 2 + (dx * this.rx + dz * this.rz) / this.u, this.H / 2 + ((dx * this.fx + dz * this.fz) * SIN - y * COS) / this.u];
  }
  /** Point du sol sous un pixel de l'écran. */
  private ground(sx: number, sy: number): [number, number] {
    const a = (sx - this.W / 2) * this.u, b = ((sy - this.H / 2) * this.u) / SIN;
    return [this.tx + a * this.rx + b * this.fx, this.tz + a * this.rz + b * this.fz];
  }
  private viewAround(z: number, sx: number, sy: number) {
    const zoom = Math.max(MIN_ZOOM, Math.min(this.maxZoom(), z)), [gx, gz] = this.ground(sx, sy), u = this.base.u / zoom;
    const a = (sx - this.W / 2) * u, b = ((sy - this.H / 2) * u) / SIN;
    return { zoom, ox: gx - a * this.rx - b * this.fx - this.base.tx, oz: gz - a * this.rz - b * this.fz - this.base.tz };
  }
  private go(target: { zoom: number; ox: number; oz: number }, smooth: boolean) {
    if (!smooth || this.calm || !this.raf) { this.goal = null; this.view = { ...target }; this.applyView(); this.draw(); return; }
    this.goal = target;
  }
  zoomAt(f: number, sx = this.W / 2, sy = this.H / 2) { this.go(this.viewAround((this.goal?.zoom ?? this.view.zoom) * f, sx, sy), true); }
  panBy(dx: number, dy: number) {
    const v = this.goal ?? this.view, u = this.base.u / v.zoom, a = dx * u, b = (dy * u) / SIN;
    this.go({ zoom: v.zoom, ox: v.ox - (a * this.rx + b * this.fx), oz: v.oz - (a * this.rz + b * this.fz) }, true);
  }
  reset() { this.go({ zoom: this.startZoom(), ox: 0, oz: 0 }, true); }
  /** Tourne la vue d'un quart de tour autour du point au centre de l'écran (1 = sens horaire). */
  rotate(dir: 1 | -1) {
    this.azGoal += (dir * Math.PI) / 2;
    if (this.calm || !this.raf) { this.turnTo(this.azGoal); this.draw(); }
  }
  /** Oriente la caméra sans que le centre de l'écran bouge. */
  private turnTo(az: number) {
    const cx = this.tx, cz = this.tz;
    this.az = az;
    this.rx = Math.sin(az); this.rz = -Math.cos(az); this.fx = Math.cos(az); this.fz = Math.sin(az);
    this.computeBase();
    this.view.ox = cx - this.base.tx; this.view.oz = cz - this.base.tz;
    if (this.goal) { this.goal = null; }
    this.applyView(); this.clearHover();
  }

  // ─── Image ───
  private applyNight() {
    const n = this.night;
    const b = this.baseLight;
    b.hemi = 1.5 - 0.5 * n; b.hemiC.set(0xdfeaff).lerp(this.col.set(0x5670c0), n);
    b.sun = 2.9 - 1.6 * n; b.sunC.set(0xffe9c4).lerp(this.col.set(0x9db4ff), n);
    this.applyLight();
    this.litMat.emissiveIntensity = 1.5 * n; this.bulbMat.emissiveIntensity = 2 * n; this.glowMat.opacity = 0.5 * n;
    if (this.glow) this.glow.visible = n > 0.01;
    for (const m of this.festive.values()) m.emissiveIntensity = 0.4 + 1.8 * n;
    this.nightDrawn = n;
  }

  /** Éclairage final : celui du jour ou de la nuit, assombri, teinté ou zébré d'éclairs par l'événement en cours. */
  private applyLight() {
    const b = this.baseLight, l = this.ev?.light;
    const dim = l?.dim ?? 1, flash = l?.flash ?? 0;
    this.hemi.intensity = b.hemi * dim + flash * 2.2; this.sun.intensity = b.sun * dim + flash * 1.2;
    this.hemi.color.copy(b.hemiC); this.sun.color.copy(b.sunC);
    if (l?.tint) { this.col.set(l.tint); this.hemi.color.lerp(this.col, l.tintAmount * 0.6); this.sun.color.lerp(this.col, l.tintAmount); }
    if (flash) { this.col.set(0xeef2ff); this.hemi.color.lerp(this.col, flash * 0.8); }
  }

  /** Met en place l'animation de l'événement de la semaine (ou l'enlève). */
  private newFx(id: string | null) {
    return id && !this.frameOpts.compact ? new EventFx(id, this.plots, { x0: this.x0, x1: this.x1, y0: this.y0, y1: this.y1 }, this.calm) : null;
  }
  private setFx(id: string | null, ready?: EventFx | null) {
    if (this.fxWant !== undefined && ready === undefined) this.fxWant = undefined; // remplace une préparation en cours
    if (this.ev) { this.scene.remove(this.ev.group); this.ev.dispose(); this.ev = null; }
    this.scene.fog = null;
    const ev = ready === undefined ? this.newFx(id) : ready;
    if (ev) {
      this.ev = ev;
      this.scene.add(this.ev.group);
      const f = this.ev.light.fog;
      if (f) this.scene.fog = new THREE.Fog(f.color, f.near, f.far);
    }
    this.tagCasters();
    this.applyLight();
  }

  /** Début ou fin d'un événement (neige, brouillard…) : ses shaders, et ceux de la ville avec ou sans brouillard,
   *  se préparent en arrière-plan, puis l'événement s'affiche. Avant, la page gelait le temps de les recompiler.
   *  Pendant la préparation, rien n'est dessiné avec l'état d'arrivée : l'image reste exactement la même. */
  private stageFx(id: string | null) {
    if (this.fxWant === id) return;
    this.fxWant = id;
    const ev = this.newFx(id);
    const compile = (this.renderer as { compileAsync?: THREE.WebGLRenderer["compileAsync"] }).compileAsync;
    const swap = () => {
      if (this.disposed || this.fxWant !== id) { ev?.dispose(); return; }
      this.fxWant = undefined; this.setFx(id, ev); this.draw();
    };
    if (!compile) { swap(); return; }
    // État d'arrivée posé le temps de lancer la préparation, retiré aussitôt (aucune image dessinée entre-temps)
    const fog = this.scene.fog, f = ev?.light.fog;
    if (ev) this.scene.add(ev.group);
    this.scene.fog = f ? new THREE.Fog(f.color, f.near, f.far) : null;
    let ready: Promise<unknown>;
    try { ready = compile.call(this.renderer, this.scene, this.cam); } catch { ready = Promise.resolve(); }
    if (ev) this.scene.remove(ev.group);
    this.scene.fog = fog;
    void ready.then(swap, swap);
  }

  private frame(t: number) {
    if (this.disposed || this.warming) return;
    if (this.az !== this.azGoal) {
      const d = this.azGoal - this.az;
      this.turnTo(Math.abs(d) < 0.004 ? this.azGoal : this.az + d * 0.2);
    }
    if (this.goal) {
      const v = this.view, g = this.goal, a = 0.22;
      v.zoom += (g.zoom - v.zoom) * a; v.ox += (g.ox - v.ox) * a; v.oz += (g.oz - v.oz) * a;
      if (Math.abs(g.zoom - v.zoom) < 0.002 && Math.abs(g.ox - v.ox) < 0.01 && Math.abs(g.oz - v.oz) < 0.01) { this.view = { ...g }; this.goal = null; }
      this.applyView();
    }
    if (t - this.nightAt > 60_000 || this.nightSeen !== this.live.light || this.nightDrawn < 0) {
      // Nouvelle saison (la page est restée ouverte d'un jour à l'autre) : la mairie change de décor
      if (seasonOf() !== this.season && this.nightDrawn >= 0) { this.rebuild(); this.applyLive(); }
      this.night = this.live.light === "day" ? 0 : nightFactor(); this.nightAt = t; this.nightSeen = this.live.light;
    }
    if (this.night !== this.nightDrawn) this.applyNight();
    const tt = this.calm ? 0 : t;

    // Chantiers : les nouveaux bâtiments sortent de terre
    if (this.births.size) {
      for (const [k, b] of this.births) {
        const g = this.calm ? 1 : Math.min(1, (t - b) / 700);
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
    this.moveParts(tt / 1000);
    if (this.spinMesh) {
      this.spins.forEach((r, i) => {
        this.e.set(0, Math.PI / 2 - this.az, 0); this.q.setFromEuler(this.e); this.e.set(0, 0, tt / 700 + r.off); this.q2.setFromEuler(this.e); this.q.multiply(this.q2);
        this.m4.compose(this.v.set(r.at[0], r.at[1], r.at[2]), this.q, this.s.set(r.size, r.size, r.size)); this.spinMesh!.setMatrixAt(i, this.m4);
      });
      this.spinMesh.instanceMatrix.needsUpdate = true;
    }
    const along = (m: Mover, lane: number): [number, number] => {
      const len = m.axis === "x" ? this.y1 - this.y0 + 1 : this.x1 - this.x0 + 1;
      // Vitesse en carreaux par seconde : la même quelle que soit la taille de la ville (avant, elle était
      // proportionnelle à la longueur de la rue, et les voitures fonçaient sur les grands territoires)
      let u = ((tt / 1000) * m.speed / len + m.off) % 1; if (m.dir < 0) u = 1 - u;
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
    if (this.ev) {
      const dt = this.evT ? (t - this.evT) / 1000 : 0; this.evT = t;
      this.ev.update(tt / 1000, dt, { tx: this.tx, tz: this.tz, span: Math.max(this.W, this.H) * this.u * 0.8 + 3 });
      this.applyLight();
    }
    if (this.flakeMesh) {
      const span = Math.max(this.W, this.H) * this.u * 0.8 + 3, sec = tt / 1000;
      this.flakes.forEach((f, i) => {
        const y = (((f.y0 - sec * 0.45 * f.sp) % 7) + 7) % 7;
        this.place(this.flakeMesh!, i, this.tx + f.ox * span + Math.sin(sec * 0.8 + f.ph) * 0.15, y, this.tz + f.oz * span, 1);
      });
      this.flakeMesh.instanceMatrix.needsUpdate = true;
    }
    this.cull();
    this.shadowPass();
    this.renderer.render(this.scene, this.cam);
  }

  /** Redessine tout de suite si la boucle d'animation ne tourne pas. */
  private draw() { if (!this.raf && !this.disposed) this.frame(performance.now()); }
  private loop = (t: number) => {
    // Pleine fluidité tant que le joueur est sur le jeu. Fenêtre visible mais sans le focus (autre fenêtre ou
    // autre appli au premier plan) : 30 images par seconde suffisent. Onglet caché : la boucle est arrêtée (run).
    // Écran 120 Hz ou plus : une image sur deux suffit (60 à 80 par seconde). Les animations suivent l'horloge :
    // même vitesse, même image ; seulement deux fois moins de calcul sur ces écrans.
    if (this.prevT) { const dt = t - this.prevT; if (dt > 0 && dt < 100) this.tick += (dt - this.tick) * 0.1; }
    const due = this.tick >= 11 || t - this.lastDraw >= 12;
    if ((due && (document.hasFocus() || this.goal || this.az !== this.azGoal || this.pts.size > 0 || t < this.growUntil)) || t - this.lastDraw >= 33) { this.lastDraw = t; this.frame(t); }
    // Mesure de fluidité : sous ~20 images par seconde pendant plusieurs secondes d'affilée, on prévient (une fois)
    if (document.hasFocus() && this.prevT) {
      const dt = t - this.prevT;
      this.slowFrames = dt > 50 && dt < 1000 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      if (this.slowFrames > 60 && !this.told) { this.told = true; this.cb.slow?.(); }
    }
    this.prevT = t;
    this.raf = requestAnimationFrame(this.loop);
  };
  private run = () => {
    cancelAnimationFrame(this.raf); this.raf = 0;
    if (this.disposed) return;
    if (this.calm || !this.onScreen || document.hidden) { this.frame(performance.now()); return; }
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
  private clearHover() { this.hoverTile = null; this.hoverPt = null; this.cb.tip(null); this.refreshHover(); }
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
      if (!(tx >= this.x0 && tx <= this.x1 && ty >= this.y0 && ty <= this.y1)) return;
      const m = this.live.mode;
      if (m) {
        // Même emplacement que l'aperçu : le bâtiment se pose là où on le voit
        const [gx, gz] = this.ground(lx, ly);
        this.hoverTile = { x: tx, y: ty }; this.hoverPt = { x: gx, z: gz };
        const moving = m.kind === "move" ? this.byTile.get(`${m.from.x},${m.from.y}`) : undefined;
        const at = this.anchor(moving ? sideOf(moving) : footprint(m.id), moving);
        this.cb.click(at.x, at.y);
      } else this.cb.click(tx, ty);
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
    const { tx, ty } = this.tileAt(lx, ly), last = this.hoverTile, [gx, gz] = this.ground(lx, ly);
    this.hoverPt = { x: gx, z: gz };
    // En construction, l'aperçu suit le pointeur à l'intérieur du carreau (un 2 × 2 change de côté selon la moitié visée)
    if (last && last.x === tx && last.y === ty) { if (this.live.mode) { this.refreshHover(); this.draw(); } return; }
    this.hoverTile = { x: tx, y: ty };
    const p = this.byTile.get(`${tx},${ty}`), b = p ? BUILDING_BY_ID[p.id] : undefined;
    if (p && !this.live.mode) {
      const [ax, ay] = this.project(ctr(p, "x"), topOf(p) + 0.06, ctr(p, "y"));
      const mk = this.markerMap.get(`${p.x},${p.y}`), sg = this.live.signs[`${p.x},${p.y}`];
      const name = p.id === "townhall" && this.season ? `${b?.name} · décor ${SEASON_LABEL[this.season] === "Été" ? "d'été" : `de ${SEASON_LABEL[this.season]}`}` : b?.name;
      this.cb.tip({ left: ax, top: ay - (mk ? 34 : sg ? 30 : 6), title: sg?.title ?? name ?? p.id, text: (mk && markerTip(mk)) ?? sg?.text ?? b?.description ?? "", warn: !!mk });
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
    this.depthMat.dispose(); this.staticRT?.depthTexture?.dispose(); this.staticRT?.dispose();
    this.sun.shadow.map?.depthTexture?.dispose(); this.sun.shadow.map?.dispose();
    for (const m of [this.gMat, this.bMat, this.litMat, this.ghostMat, this.fadeMat, this.bulbMat, this.glowMat, this.smokeMat, this.tintMat, this.hoverMat, this.selMat, this.ringMat, this.layerMat, this.outMat, this.flakeMat, ...this.festive.values()]) m.dispose();
    this.bulbGeo.dispose();
    if (this.ev) { this.scene.remove(this.ev.group); this.ev.dispose(); this.ev = null; }
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
    : kind === "jobs" ? `<rect x="-0.55" y="-0.25" width="1.1" height="0.75" rx="0.1" fill="#fff"/><path d="M-0.22 -0.25V-0.44H0.22V-0.25" stroke="#fff" stroke-width="0.12" fill="none"/>`
    : kind === "staff" ? `<circle cx="0" cy="-0.24" r="0.24" fill="#fff"/><path d="M-0.44 0.52a0.44 0.38 0 0 1 0.88 0z" fill="#fff"/>`
    : `<path d="M0 0.58V-0.55M0 0.2l-0.32-0.26M0 0.2l0.32-0.26M0-0.08l-0.32-0.26M0-0.08l0.32-0.26M0-0.36l-0.32-0.26M0-0.36l0.32-0.26" stroke="#fff" stroke-width="0.14" stroke-linecap="round" fill="none"/>`;
  return `<svg viewBox="-1.15 -1.15 2.3 2.85" style="display:block;width:calc(var(--r) * 2.3);height:calc(var(--r) * 2.85);overflow:visible"><polygon points="-0.45,0.75 0.45,0.75 0,1.55" fill="${c}"/><circle cx="0" cy="0" r="1" fill="${c}" stroke="#fff" stroke-width="0.14"/>${icon}</svg>`;
}
