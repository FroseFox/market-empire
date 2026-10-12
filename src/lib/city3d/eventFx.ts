// Animations des événements de la semaine (festival, tempête, sécheresse…), dessinées au-dessus de la ville 3D.
// Chaque événement a sa mise en scène : particules (pluie, confettis, feux d'artifice, pièces, poussière…),
// éléments posés (eau d'une inondation, banderoles de grève) et ambiance (lumière, brume, éclairs).
// Rien ne change dans le jeu lui-même : c'est la traduction visuelle de l'événement en cours.
import * as THREE from "three";
import { BUILDING_BY_ID, type Category } from "../game/config";
import { sideOf, type Plot } from "../game/layout";

/** Ambiance demandée à la scène : lumière (1 = normale), éclair (0 à 1), teinte du soleil, brume. */
export interface FxLight { dim: number; flash: number; tint: number | null; tintAmount: number; fog: { color: number; near: number; far: number } | null }
export interface FxView { tx: number; tz: number; span: number }

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const TAU = Math.PI * 2;

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; size: number; spin: number }

/** Une série de particules identiques (une forme, une matière), recyclées à l'infini. */
class Swarm {
  mesh: THREE.InstancedMesh; p: Particle[] = [];
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private s = new THREE.Vector3();
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, n: number, private spawn: (p: Particle, i: number, first: boolean) => void, colors?: number[]) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p: Particle = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 1, spin: 0 };
      spawn(p, i, true); this.p.push(p);
      if (colors) this.mesh.setColorAt(i, c.set(colors[i % colors.length]));
    }
  }
  /** Avance de `dt` secondes ; `shape` donne l'échelle (selon l'âge) et l'orientation de chaque particule. */
  /** `map` place la particule dans la ville (les particules du ciel sont en coordonnées d'écran, de −1 à 1). */
  step(dt: number, shape: (p: Particle, i: number) => { s: number; sy?: number; rx?: number; ry?: number; rz?: number }, map?: (p: Particle) => [number, number], zoom = 1) {
    this.p.forEach((p, i) => {
      p.age += dt;
      if (p.age >= p.life) { p.age = 0; this.spawn(p, i, false); }
      if (p.age >= 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; } // âge négatif : la particule attend son tour
      const k = shape(p, i), [x, z] = map ? map(p) : [p.x, p.z];
      this.e.set(k.rx ?? 0, k.ry ?? 0, k.rz ?? 0); this.q.setFromEuler(this.e);
      this.m4.compose(this.v.set(x, p.y, z), this.q, this.s.set(k.s * zoom, (k.sy ?? k.s) * zoom, k.s * zoom));
      this.mesh.setMatrixAt(i, this.m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class EventFx {
  readonly group = new THREE.Group();
  private swarms: { swarm: Swarm; shape: (p: Particle, i: number) => { s: number; sy?: number; rx?: number; ry?: number; rz?: number }; follow: boolean }[] = [];
  private owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private bobbers: { mesh: THREE.Object3D; y: number; amp: number; period: number; off: number }[] = [];
  private banners: THREE.Object3D[] = [];
  private flashAt = 0; private flashSeed = 1;
  private view: FxView = { tx: 0, tz: 0, span: 20 };
  light: FxLight = { dim: 1, flash: 0, tint: null, tintAmount: 0, fog: null };

  constructor(readonly id: string, plots: Plot[], bounds: { x0: number; x1: number; y0: number; y1: number }, private calm: boolean) {
    const cat = (p: Plot) => BUILDING_BY_ID[p.id]?.category as Category | undefined;
    const centre = (p: Plot): [number, number] => [p.x + sideOf(p) / 2, p.y + sideOf(p) / 2];
    const spots = (want: (c: Category | undefined, p: Plot) => boolean) => plots.filter((p) => want(cat(p), p)).map(centre);
    const cityW = bounds.x1 + 1 - bounds.x0, cityH = bounds.y1 + 1 - bounds.y0;
    const rnd = (i: number, k: number) => hash(i * 13.1 + k, k * 7.7 + this.flashSeed);
    const basic = (color: number, opacity = 1, additive = false) => this.own(new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, depthWrite: !additive && opacity >= 1, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const vertexBasic = (opacity = 1, additive = false) => this.own(new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    // Particules qui tombent du ciel, réparties autour du centre de l'écran (pluie, confettis, pièces, poussière)
    const sky = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, fall: number, height: number, shape: (p: Particle, i: number) => { s: number; sy?: number; rx?: number; ry?: number; rz?: number }, colors?: number[], drift = 0) => {
      const swarm = new Swarm(this.own(geo), mat, this.calm ? Math.round(n / 3) : n, (p, i, first) => {
        p.x = (rnd(i, 1 + p.age) * 2 - 1); p.z = (rnd(i, 2 + p.age) * 2 - 1); p.y = first ? rnd(i, 3) * height : height;
        p.vx = drift; p.vy = -fall * (0.8 + rnd(i, 4) * 0.4); p.vz = drift * 0.3; p.life = height / -p.vy; p.age = first ? (height - p.y) / -p.vy : 0;
        p.size = 0.8 + rnd(i, 5) * 0.5; p.spin = rnd(i, 6) * TAU;
      }, colors);
      this.add(swarm, shape, true);
    };
    // Particules qui montent depuis des bâtiments (étincelles de récolte, pièces, bulles…)
    const rise = (from: [number, number][], geo: THREE.BufferGeometry, mat: THREE.Material, perSpot: number, speed: number, top: number, shape: (p: Particle, i: number) => { s: number; sy?: number; rx?: number; ry?: number; rz?: number }, colors?: number[]) => {
      if (!from.length) return;
      const n = Math.min(260, from.length * perSpot);
      const swarm = new Swarm(this.own(geo), mat, this.calm ? Math.round(n / 3) : n, (p, i, first) => {
        const [x, z] = from[i % from.length];
        p.x = x + (rnd(i, 7 + p.spin) - 0.5) * 0.8; p.z = z + (rnd(i, 8 + p.spin) - 0.5) * 0.8; p.y = 0.3;
        p.vx = (rnd(i, 9) - 0.5) * 0.2; p.vz = (rnd(i, 10) - 0.5) * 0.2; p.vy = speed * (0.7 + rnd(i, 11) * 0.6);
        p.life = top / p.vy; p.age = first ? rnd(i, 12) * p.life : 0; p.size = 0.7 + rnd(i, 13) * 0.6; p.spin += 1.3;
      }, colors);
      this.add(swarm, shape, false);
    };
    const fade = (p: Particle) => Math.max(0, Math.min(1, (1 - p.age / p.life) * 3, (p.age / p.life) * 8));

    switch (id) {
      case "festival": {
        // Confettis multicolores et feux d'artifice au-dessus de la ville
        const CONF = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0xa855f7, 0xec4899, 0xfacc15];
        sky(new THREE.PlaneGeometry(0.13, 0.08), this.own(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), 700, 0.9, 5,
          (p) => ({ s: p.size, rx: p.age * 5 + p.spin, ry: p.age * 3, rz: p.spin }), CONF, 0.01);
        if (!this.calm) {
          // Couleurs pleines (pas de mélange additif : sur l'herbe claire, les étincelles disparaissaient)
          const bursts = 6, per = 70;
          const fw = new Swarm(this.own(new THREE.IcosahedronGeometry(0.13, 0)), this.own(new THREE.MeshBasicMaterial()), bursts * per, (p, i, first) => {
            const b = Math.floor(i / per), cycle = Math.floor((p.spin || 0) + 1);
            const seed = b * 31 + cycle * 7;
            const cx = bounds.x0 + cityW * (0.2 + hash(seed, 1) * 0.6), cz = bounds.y0 + cityH * (0.2 + hash(seed, 2) * 0.6), cy = 2.2 + hash(seed, 3) * 1.4;
            const a = hash(i, cycle) * TAU, el = (hash(i, cycle + 5) - 0.5) * Math.PI, sp = 1.8 + hash(i, cycle + 9) * 0.5;
            p.x = cx; p.y = cy; p.z = cz; p.vx = Math.cos(a) * Math.cos(el) * sp; p.vy = Math.sin(el) * sp; p.vz = Math.sin(a) * Math.cos(el) * sp;
            p.life = 1.6; p.age = first ? -b * 0.7 - hash(b, 4) * 0.5 : -hash(seed, 6) * 1.2; p.spin = cycle;
          }, Array.from({ length: bursts * per }, (_, i) => CONF[Math.floor(i / per) % CONF.length]));
          this.add(fw, (p) => { if (p.age < 0) return { s: 0 }; p.vy -= 0.025; p.vx *= 0.985; p.vz *= 0.985; return { s: 1.2 * (1 - p.age / p.life) }; }, false);
        }
        break;
      }
      case "harvest":
        // Étincelles dorées qui montent des exploitations
        rise(spots((c) => c === "agriculture" || c === "industry"), new THREE.OctahedronGeometry(0.11, 0), vertexBasic(1, true), 24, 0.7, 2.6,
          (p) => ({ s: p.size * fade(p), ry: p.age * 3 }), [0xfacc15, 0xfde68a, 0xf59e0b]);
        this.light.tint = 0xffd27a; this.light.tintAmount = 0.35;
        break;
      case "fair":
        // Pièces d'or qui montent en tournant des commerces et des entreprises
        rise(spots((c) => c === "commerce" || c === "services" || c === "industry"), new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16).rotateX(Math.PI / 2),
          this.own(new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.2, roughness: 0.35, emissive: 0x9a6b00 })), 14, 0.8, 2.8, (p) => ({ s: p.size * fade(p), ry: p.age * 6 }));
        break;
      case "newcomers":
        // Petits cœurs bleus qui montent des logements : la ville attire
        rise(spots((c) => c === "housing" || c === "civic"), new THREE.SphereGeometry(0.11, 10, 8), vertexBasic(1, true), 18, 0.6, 2.4,
          (p) => ({ s: p.size * fade(p) }), [0x60a5fa, 0x93c5fd, 0xf9a8d4]);
        break;
      case "grant": {
        // Pluie de pièces sur la mairie
        const hall = plots.find((p) => p.id === "townhall");
        if (hall) {
          const [hx, hz] = centre(hall), w = sideOf(hall);
          const n = this.calm ? 40 : 140;
          const coins = new Swarm(this.own(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14).rotateX(Math.PI / 2)),
            this.own(new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.2, roughness: 0.35, emissive: 0x9a6b00 })), n, (p, i, first) => {
              p.x = hx + (rnd(i, 1 + p.spin) - 0.5) * (w + 1.5); p.z = hz + (rnd(i, 2 + p.spin) - 0.5) * (w + 1.5); p.y = first ? rnd(i, 3) * 5 : 5;
              p.vx = 0; p.vz = 0; p.vy = -1.4 - rnd(i, 4) * 0.6; p.life = (p.y - 0.15) / -p.vy; p.age = 0; p.spin += 0.7; p.size = 0.8 + rnd(i, 5) * 0.4;
            });
          this.add(coins, (p) => ({ s: p.size, rx: p.age * 7, ry: p.spin }), false);
        }
        break;
      }
      case "storm":
        // Pluie battante, ciel sombre, éclairs
        sky(new THREE.BoxGeometry(0.018, 0.45, 0.018), basic(0xc7d4e4, 0.7), 900, 7, 7, () => ({ s: 1, rz: -0.12 }), undefined, 0.03);
        this.light.dim = 0.55; this.light.tint = 0x8aa0c0; this.light.tintAmount = 0.5;
        this.light.fog = { color: 0x5b6b80, near: 200, far: 300 };
        this.flashAt = 2;
        break;
      case "drought":
        // Chaleur écrasante : lumière orangée, voile de poussière qui dérive
        sky(new THREE.SphereGeometry(0.035, 6, 4), basic(0xd6b97a, 0.5), 260, 0.15, 3, (p) => ({ s: p.size }), undefined, 0.02);
        this.light.tint = 0xffa04d; this.light.tintAmount = 0.6; this.light.dim = 1.05;
        this.light.fog = { color: 0xe8c48a, near: 205, far: 330 };
        break;
      case "flood": {
        // Eau qui recouvre les rues et monte doucement, pluie fine
        // L'eau couvre les rues et les terrains libres ; les bâtiments en sortent
        const used = new Set<string>();
        for (const p of plots) for (let dx = 0; dx < sideOf(p); dx++) for (let dy = 0; dy < sideOf(p); dy++) used.add(`${p.x + dx},${p.y + dy}`);
        const pos: number[] = [];
        for (let x = bounds.x0; x <= bounds.x1; x++) for (let y = bounds.y0; y <= bounds.y1; y++) {
          if (used.has(`${x},${y}`)) continue;
          pos.push(x, 0, y, x, 0, y + 1, x + 1, 0, y, x + 1, 0, y, x, 0, y + 1, x + 1, 0, y + 1);
        }
        const geo = this.own(new THREE.BufferGeometry()); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
        const water = new THREE.Mesh(geo, this.own(new THREE.MeshStandardMaterial({ color: 0x3b8fd1, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.2, depthWrite: false })));
        water.position.y = 0.07; water.renderOrder = 4;
        this.group.add(water); this.bobbers.push({ mesh: water, y: 0.07, amp: 0.03, period: 4, off: 0 });
        // Remous : petits anneaux clairs qui s'élargissent sur l'eau
        const free = [...Array(60)].map((_, i) => [bounds.x0 + hash(i, 1) * cityW, bounds.y0 + hash(i, 2) * cityH] as [number, number]).filter(([x, z]) => !used.has(`${Math.floor(x)},${Math.floor(z)}`));
        if (free.length) {
          const ring = new Swarm(this.own(new THREE.RingGeometry(0.08, 0.11, 18).rotateX(-Math.PI / 2)), basic(0xdbeafe, 0.55), free.length, (p, i, first) => {
            [p.x, p.z] = free[i]; p.y = 0.1; p.vx = p.vy = p.vz = 0; p.life = 2 + hash(i, 3) * 1.5; p.age = first ? hash(i, 4) * p.life : 0;
          });
          this.add(ring, (p) => ({ s: 0.4 + (p.age / p.life) * 1.2 }), false);
        }
        sky(new THREE.BoxGeometry(0.015, 0.3, 0.015), basic(0xc7d4e4, 0.6), 420, 5, 6, () => ({ s: 1 }));
        this.light.dim = 0.75; this.light.tint = 0x9fb4cc; this.light.tintAmount = 0.35;
        break;
      }
      case "strike": {
        // Banderoles rouges qui s'agitent devant les lieux de travail
        const at = spots((c) => c === "industry" || c === "commerce" || c === "services").slice(0, 40);
        const pole = this.own(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5)), flag = this.own(new THREE.PlaneGeometry(0.34, 0.2));
        const poleMat = basic(0xe5e7eb), flagMat = this.own(new THREE.MeshStandardMaterial({ color: 0xdc2626, side: THREE.DoubleSide, emissive: 0x3f0000 }));
        at.forEach(([x, z], i) => {
          const g = new THREE.Group(), pm = new THREE.Mesh(pole, poleMat), fm = new THREE.Mesh(flag, flagMat);
          pm.position.y = 0.35; fm.position.set(0.17, 0.6, 0); g.add(pm, fm);
          g.position.set(x + 0.55, 0.05, z + 0.55); g.rotation.y = hash(i, 3) * TAU;
          this.group.add(g); this.banners.push(g); this.bobbers.push({ mesh: fm, y: 0.6, amp: 0.03, period: 0.9 + hash(i, 4) * 0.5, off: hash(i, 5) * TAU });
        });
        this.light.tint = 0xff8a8a; this.light.tintAmount = 0.15;
        break;
      }
      case "epidemic":
        // Bulles verdâtres qui flottent au-dessus des logements
        rise(spots((c) => c === "housing" || c === "civic"), new THREE.SphereGeometry(0.14, 12, 10), vertexBasic(0.6), 14, 0.35, 1.8,
          (p) => ({ s: p.size * fade(p) }), [0x86efac, 0xa3e635, 0x4ade80]);
        this.light.tint = 0xb8e6a0; this.light.tintAmount = 0.3;
        this.light.fog = { color: 0xa8c49a, near: 215, far: 340 };
        break;
      case "smog":
        // Brume grise épaisse, volutes de fumée au-dessus des usines
        rise(spots((c) => c === "industry" || c === "energy"), new THREE.IcosahedronGeometry(0.22, 1), basic(0x6b7280, 0.35), 8, 0.4, 2.2,
          (p) => ({ s: (0.6 + p.age / p.life * 1.6) * fade(p) }));
        this.light.dim = 0.8; this.light.tint = 0xa3a3a3; this.light.tintAmount = 0.55;
        this.light.fog = { color: 0x8c8f94, near: 195, far: 290 };
        break;
    }
  }

  private own<T extends THREE.BufferGeometry | THREE.Material>(x: T): T { this.owned.push(x); return x; }
  private add(swarm: Swarm, shape: (p: Particle, i: number) => { s: number; sy?: number; rx?: number; ry?: number; rz?: number }, follow: boolean) {
    this.swarms.push({ swarm, shape, follow }); this.group.add(swarm.mesh);
  }

  /** Une image : particules, éléments qui flottent, éclairs. `sec` = temps écoulé (0 si le joueur préfère moins de mouvement). */
  update(sec: number, dt: number, view: FxView) {
    this.view = view;
    const step = this.calm ? 0 : Math.min(0.1, dt);
    // Le ciel suit l'écran : pluie, confettis et poussière remplissent toujours la vue
    const v = this.view, onScreen = (p: Particle): [number, number] => [v.tx + p.x * v.span, v.tz + p.z * v.span];
    // Vue de loin : les particules grossissent un peu pour rester visibles
    const zoom = Math.max(1, Math.min(3.5, v.span / 12));
    for (const { swarm, shape, follow } of this.swarms) swarm.step(step, shape, follow ? onScreen : undefined, zoom);
    for (const b of this.banners) b.scale.setScalar(Math.max(1, zoom * 0.8));
    for (const b of this.bobbers) b.mesh.position.y = b.y + Math.sin(sec * TAU / b.period + b.off) * b.amp;
    // Éclairs : un ou deux flashs brefs toutes les quelques secondes
    if (this.flashAt && !this.calm) {
      if (sec > this.flashAt + 0.35) { this.flashSeed += 1; this.flashAt = sec + 2.5 + hash(this.flashSeed, 9) * 5; }
      const d = sec - this.flashAt;
      this.light.flash = d >= 0 && d < 0.35 ? (d < 0.08 || (d > 0.16 && d < 0.22) ? 1 : 0.25) : 0;
    }
  }

  dispose() {
    for (const { swarm } of this.swarms) swarm.mesh.dispose();
    for (const x of this.owned) x.dispose();
    this.group.clear();
  }
}
