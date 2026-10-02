"use client";
// Vue isométrique 2.5D de la ville, dessinée sur un canvas.
// Tout est calculé à partir de `plots` : aucune image externe.
// Navigation : molette / pincement (zoom vers le curseur), glisser, double-clic, clavier (flèches, + / −, 0).
// La ville suit l'heure réelle : elle s'assombrit le soir et les fenêtres s'allument.
import { useEffect, useRef, useState } from "react";
import { BUILDING_BY_ID } from "@/lib/game/config";
import { isBuildable, isRoad, MAP_SIZE, type Plot } from "@/lib/game/layout";

export type CityMode = { kind: "place"; id: string } | { kind: "move"; id: string; from: { x: number; y: number } };

const TW = 64, TH = 32; // taille d'un carreau à l'échelle 1

// ─── Palette (charte : moderne, sobre, légèrement réaliste) ───
const C = {
  grass: ["#A9DA8C", "#A3D686", "#9CD080", "#AEDD93"], grassEdge: "#86BF6A", tuft: "rgba(74,130,64,.35)",
  curb: "#CDD5DF", crosswalk: "rgba(255,255,255,.8)", lamp: "#475569", pineA: "#3F7F4E", pineB: "#336B41",
  soilL: "#B08A63", soilR: "#8F6E4E", soilDark: "#6F543B",
  road: "#5B6778", roadLine: "#E2E8F0", sidewalk: "#D5DCE5",
  wallL: "#F1F5F9", wallR: "#CBD5E1", wallTop: "#F8FAFC",
  roofL: "#E07A5F", roofR: "#B85C44",
  glassTop: "#BFDBFE", glassL: "#7FB2F5", glassR: "#4F8FE8",
  win: "rgba(255,255,255,.75)", winDark: "rgba(15,23,42,.18)",
  indL: "#C3CCD8", indR: "#98A4B5", indTop: "#DCE2EA",
  chimney: "#556274", smoke: "rgba(226,232,240,",
  primary: "#2563EB", primaryDark: "#1D4ED8",
  violet: "#8B5CF6", amber: "#F59E0B",
  crops: ["#D9C46A", "#8CC35F", "#C8B25A"], cropsDark: "#7A9A45",
  treeA: "#4F9E5A", treeB: "#3E8A4B", trunk: "#7A5A3C",
  panel: "#27417A", panelHi: "#3B5EA8",
  shadow: "rgba(15,23,42,.14)",
};

type Pt = [number, number];

/** Objet de la scène : `ax, ay` = point d'ancrage (carreau) pour ne pas dessiner ce qui est hors écran. */
interface Item { depth: number; ax: number; ay: number; draw: (t: number) => void }

/** Indicateur affiché au-dessus d'un bâtiment (manque d'énergie, logements pleins…). */
export type MarkerKind = "energy" | "food" | "full" | "staff";
export interface CityMarker { x: number; y: number; kind: MarkerKind; label: string }
const MARKER_COLOR: Record<MarkerKind, string> = { energy: "#EF4444", food: "#EF4444", full: "#F59E0B", staff: "#F59E0B" };
/** Hauteur approximative des bâtiments (pour poser l'indicateur au-dessus du toit). */
const TOP: Record<string, number> = {
  village: 24, house_s: 22, house_m: 40, house_l: 64, house_xl: 108, shop: 22, services: 56, townhall: 42,
  factory_s: 40, factory_m: 46, factory_l: 56, farm_s: 14, farm_m: 24, farm_l: 32, power_s: 52, power_m: 50, power_l: 48,
};

type ZoomKind = "in" | "out" | "reset";
const ZOOM_BUTTONS: { kind: ZoomKind; label: string; text: string }[] = [
  { kind: "in", label: "Zoomer", text: "+" },
  { kind: "out", label: "Dézoomer", text: "−" },
  { kind: "reset", label: "Recentrer", text: "⟲" },
];
const MIN_ZOOM = 0.6, MAX_ZOOM = 4;

/** 0 le jour, 1 la nuit, avec transitions à l'aube et au crépuscule (heure locale). */
function nightFactor(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 6 || h >= 21) return 1;
  if (h < 7.5) return 1 - (h - 6) / 1.5;
  if (h >= 19.5) return (h - 19.5) / 1.5;
  return 0;
}

interface Controls { zoomAt: (f: number, sx?: number, sy?: number) => void; panBy: (dx: number, dy: number) => void; reset: () => void }

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export default function IsoCity({ plots, height = 440, compact = false, mode = null, selected = null, onTileClick, initialZoom = 1, markers, selectedTone = "primary", padTop = 0, padBottom = 0, zoomClass = "right-3 top-3", hint = true }: {
  plots: Plot[];
  /** Hauteur en pixels, ou "fill" pour occuper tout le parent (vue plein écran). */
  height?: number | "fill"; compact?: boolean;
  /** Indicateurs posés au-dessus des bâtiments. */
  markers?: CityMarker[];
  /** Couleur du contour du carreau sélectionné. */
  selectedTone?: "primary" | "danger";
  /** Marges haute / basse occupées par l'interface : la ville est cadrée entre les deux. */
  padTop?: number; padBottom?: number;
  /** Position des boutons de zoom. */
  zoomClass?: string;
  /** Affiche le rappel des commandes en bas à gauche. */
  hint?: boolean;
  /** Zoom de départ (plus serré sur téléphone). */
  initialZoom?: number;
  /** Mode placement / déplacement : aperçu du bâtiment sous la souris. */
  mode?: CityMode | null;
  /** Carreau sélectionné (entouré). */
  selected?: { x: number; y: number } | null;
  /** Clic sur un carreau (sans glisser). */
  onTileClick?: (x: number, y: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const births = useRef<Map<string, number>>(new Map());
  const seen = useRef<Set<string> | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const view = useRef({ zoom: initialZoom, px: 0, py: 0 });
  const lastInitial = useRef(initialZoom);
  const redraw = useRef<() => void>(() => {});
  const modeRef = useRef<CityMode | null>(null);
  const selectedRef = useRef<{ x: number; y: number } | null>(null);
  const toneRef = useRef(selectedTone);
  const markersRef = useRef<Map<string, CityMarker>>(new Map());
  const clickRef = useRef<typeof onTileClick>(undefined);
  const controls = useRef<Controls | null>(null);
  const interactive = !!onTileClick;

  // Les props qui changent souvent passent par des refs : pas besoin de tout redessiner la scène
  useEffect(() => {
    modeRef.current = mode;
    selectedRef.current = selected;
    toneRef.current = selectedTone;
    markersRef.current = new Map((markers ?? []).map((m) => [`${m.x},${m.y}`, m]));
    clickRef.current = onTileClick;
    redraw.current();
  });

  function onZoom(kind: ZoomKind) {
    if (kind === "in") controls.current?.zoomAt(1.35);
    else if (kind === "out") controls.current?.zoomAt(1 / 1.35);
    else controls.current?.reset();
  }
  function onKey(e: React.KeyboardEvent) {
    const c = controls.current;
    if (!c) return;
    const k: Record<string, () => void> = {
      "+": () => c.zoomAt(1.35), "=": () => c.zoomAt(1.35), "-": () => c.zoomAt(1 / 1.35), "0": () => c.reset(),
      ArrowLeft: () => c.panBy(80, 0), ArrowRight: () => c.panBy(-80, 0), ArrowUp: () => c.panBy(0, 80), ArrowDown: () => c.panBy(0, -80),
    };
    if (k[e.key]) { e.preventDefault(); k[e.key](); }
  }
  const [tip, setTip] = useState<{ left: number; top: number; title: string; text: string; warn?: boolean } | null>(null);

  const keyOf = (p: Plot) => `${p.id}@${p.x},${p.y}`;

  useEffect(() => {
    const cv = canvas.current, box = wrap.current;
    if (!cv || !box) return;
    const main = cv.getContext("2d");
    if (!main) return;
    // `g` = surface en cours de dessin (l'écran, ou le calque du sol mis en cache)
    let g: CanvasRenderingContext2D = main;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (lastInitial.current !== initialZoom) { lastInitial.current = initialZoom; view.current = { zoom: initialZoom, px: 0, py: 0 }; }

    // Repère les nouveaux bâtiments pour l'animation de construction
    const nowMs = performance.now();
    if (seen.current === null) seen.current = new Set(plots.map(keyOf));
    for (const p of plots) {
      const k = keyOf(p);
      if (!seen.current.has(k)) { seen.current.add(k); births.current.set(k, nowMs); }
    }

    // Zone visible : autour des bâtiments (plus large en mode construction, pour avoir de la place)
    const xs = plots.map((p) => p.x), ys = plots.map((p) => p.y);
    const pad = interactive ? 3 : 1, span = interactive ? 6 : 3;
    let x0 = Math.min(...xs, MAP_SIZE / 2 - span) - pad, x1 = Math.max(...xs, MAP_SIZE / 2 + span) + pad;
    let y0 = Math.min(...ys, MAP_SIZE / 2 - span) - pad, y1 = Math.max(...ys, MAP_SIZE / 2 + span) + pad;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(MAP_SIZE - 1, x1); y1 = Math.min(MAP_SIZE - 1, y1);

    const byTile = new Map(plots.map((p) => [`${p.x},${p.y}`, p]));
    const SLAB = 18; // épaisseur du socle
    let scale = 1, ox = 0, oy = 0, W = 0, H = 0, dpr = 1, base = { scale: 1, ox: 0, oy: 0 };

    const iso = (x: number, y: number, z = 0): Pt => [ox + (x - y) * (TW / 2) * scale, oy + (x + y) * (TH / 2) * scale - z * scale];

    function layout() {
      W = Math.max(1, box!.clientWidth); H = Math.max(1, height === "fill" ? box!.clientHeight : height);
      // Grand écran : on plafonne le nombre de pixels dessinés pour rester fluide
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3_200_000 / (W * H))));
      cv!.width = Math.round(W * dpr); cv!.height = Math.round(H * dpr);
      cv!.style.width = `${W}px`; cv!.style.height = `${H}px`;
      main!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Emprise écran du losange visible (+ socle + marge pour les tours)
      const spanX = ((x1 + 1 - x0) + (y1 + 1 - y0)) * TW / 2;
      const spanY = ((x1 + 1 - x0) + (y1 + 1 - y0)) * TH / 2 + SLAB + (compact ? 40 : 60);
      // Zone libre entre les panneaux du haut et du bas (si elle est trop petite, on garde tout le cadre)
      const usable = H - padTop - padBottom >= 160;
      const top = usable ? padTop : 0, Ha = usable ? H - padTop - padBottom : H;
      const s0 = Math.max(0.05, Math.min((W - 24) / spanX, (Ha - 16) / spanY));
      const cx = ((x0 - y1 - 1) + (x1 + 1 - y0)) / 2 * TW / 2;
      // Centré verticalement (sur un écran haut et étroit, la ville n'est plus collée en bas)
      base = { scale: s0, ox: W / 2 - cx * s0, oy: top + Math.min(Ha - 12, (Ha + spanY * s0) / 2) - (SLAB + (x1 + 1 + y1 + 1) * TH / 2) * s0 };
      applyView();
    }

    /** Zoom autour du centre du cadre + déplacement (la ville reste toujours en partie visible). */
    function applyView() {
      const v = view.current;
      v.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom));
      scale = base.scale * v.zoom;
      ox = W / 2 + (base.ox - W / 2) * v.zoom + v.px;
      oy = H / 2 + (base.oy - H / 2) * v.zoom + v.py;
      const [cx, cy] = iso((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2);
      const fx = Math.max(W * 0.1, Math.min(W * 0.9, cx)) - cx, fy = Math.max(H * 0.1, Math.min(H * 0.9, cy)) - cy;
      if (fx || fy) { v.px += fx; v.py += fy; ox += fx; oy += fy; }
    }

    // Vue visée pendant une animation de zoom (rejointe en douceur image par image)
    let goal: { zoom: number; px: number; py: number } | null = null;
    /** Vue qui garde le point écran (sx, sy) immobile en passant au zoom `z`. */
    function viewAround(z: number, sx: number, sy: number) {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      const k = zoom / view.current.zoom;
      const nox = sx - (sx - ox) * k, noy = sy - (sy - oy) * k;
      return { zoom, px: nox - W / 2 - (base.ox - W / 2) * zoom, py: noy - H / 2 - (base.oy - H / 2) * zoom };
    }
    function go(target: { zoom: number; px: number; py: number }, smooth: boolean) {
      if (!smooth || reduce || !raf) { goal = null; view.current = { ...target }; applyView(); if (!raf) frame(performance.now()); return; }
      goal = target;
    }
    controls.current = {
      zoomAt: (f, sx = W / 2, sy = H / 2) => go(viewAround((goal?.zoom ?? view.current.zoom) * f, sx, sy), true),
      panBy: (dx, dy) => { const v = goal ?? view.current; go({ zoom: v.zoom, px: v.px + dx, py: v.py + dy }, true); },
      reset: () => go({ zoom: initialZoom, px: 0, py: 0 }, true),
    };

    let lights: Pt[][] = [];
    // Lampadaires : un par carrefour
    const lamps: Pt[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (x % 4 === 0 && y % 4 === 0) lamps.push([x + 0.1, y + 0.1]);
    /** Le point d'ancrage (carreau) est-il à l'écran ? Marge pour la hauteur des tours et les ombres. */
    const onScreenAt = (ax: number, ay: number) => {
      const sx = ox + (ax - ay) * (TW / 2) * scale, sy = oy + (ax + ay) * (TH / 2) * scale;
      return sx > -90 * scale && sx < W + 90 * scale && sy > -40 * scale && sy < H + 130 * scale;
    };
    let night = nightFactor(), nightAt = performance.now();

    // ─── Primitives ───
    const poly = (pts: Pt[], fill: string, stroke?: string) => {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath(); g.fillStyle = fill; g.fill();
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    };

    /** Pavé droit [ax..bx]×[ay..by], de z0 à z0+h. */
    function block(ax: number, ay: number, bx: number, by: number, z0: number, h: number, top: string, left: string, right: string) {
      // ombre portée
      poly([iso(ax, ay, 0), iso(bx + h / 60, ay, 0), iso(bx + h / 60, by + h / 90, 0), iso(ax, by + h / 90, 0)], C.shadow);
      poly([iso(ax, by, z0), iso(bx, by, z0), iso(bx, by, z0 + h), iso(ax, by, z0 + h)], left);
      poly([iso(bx, ay, z0), iso(bx, by, z0), iso(bx, by, z0 + h), iso(bx, ay, z0 + h)], right);
      poly([iso(ax, ay, z0 + h), iso(bx, ay, z0 + h), iso(bx, by, z0 + h), iso(ax, by, z0 + h)], top, h > 6 ? "rgba(255,255,255,.28)" : undefined);
    }

    /** Fenêtres sur les deux faces visibles d'un pavé. */
    function windows(ax: number, ay: number, bx: number, by: number, z0: number, h: number, floor = 9, lit = C.win) {
      const rows = Math.floor((h - 4) / floor);
      for (let r = 0; r < rows; r++) {
        const z = z0 + 4 + r * floor;
        const cols = Math.max(2, Math.round((bx - ax) * 5));
        for (let c = 0; c < cols; c++) {
          const u0 = ax + (bx - ax) * ((c + 0.25) / cols), u1 = ax + (bx - ax) * ((c + 0.75) / cols);
          const q: Pt[] = [iso(u0, by, z), iso(u1, by, z), iso(u1, by, z + floor * 0.5), iso(u0, by, z + floor * 0.5)];
          poly(q, lit);
          if (night > 0 && hash(Math.round(u0 * 97), Math.round(z * 3)) < 0.7) lights.push(q);
        }
        const cols2 = Math.max(2, Math.round((by - ay) * 5));
        for (let c = 0; c < cols2; c++) {
          const v0 = ay + (by - ay) * ((c + 0.25) / cols2), v1 = ay + (by - ay) * ((c + 0.75) / cols2);
          const q: Pt[] = [iso(bx, v0, z), iso(bx, v1, z), iso(bx, v1, z + floor * 0.5), iso(bx, v0, z + floor * 0.5)];
          poly(q, C.winDark);
          if (night > 0 && hash(Math.round(v0 * 89), Math.round(z * 5)) < 0.55) lights.push(q);
        }
      }
    }

    /** Maison : pavé + toit à deux pans. */
    function house(ax: number, ay: number, bx: number, by: number, h: number, roofL = C.roofL, roofR = C.roofR) {
      block(ax, ay, bx, by, 0, h, C.wallTop, C.wallL, C.wallR);
      const ym = (ay + by) / 2, r = 7;
      poly([iso(ax, ay, h), iso(bx, ay, h), iso(bx, ym, h + r), iso(ax, ym, h + r)], roofR);
      poly([iso(bx, ay, h), iso(bx, by, h), iso(bx, ym, h + r)], C.wallR);
      poly([iso(ax, ym, h + r), iso(bx, ym, h + r), iso(bx, by, h), iso(ax, by, h)], roofL);
      // porte
      const dx = ax + (bx - ax) * 0.4;
      poly([iso(dx, by, 0), iso(dx + 0.08, by, 0), iso(dx + 0.08, by, 5), iso(dx, by, 5)], "#94A3B8");
    }

    function tree(x: number, y: number, s = 1) {
      const [px, py] = iso(x, y, 0);
      g.fillStyle = C.shadow; g.beginPath(); g.ellipse(px + 3 * scale, py, 6 * s * scale, 3 * s * scale, 0, 0, Math.PI * 2); g.fill();
      if (hash(Math.round(x * 13), Math.round(y * 17)) < 0.35) {
        // Sapin
        g.fillStyle = C.trunk; g.fillRect(px - 1 * scale, py - 5 * s * scale, 2 * scale, 5 * s * scale);
        for (let i = 0; i < 3; i++) {
          const w = (7 - i * 1.8) * s * scale, top = py - (8 + i * 5.5) * s * scale;
          poly([[px - w, top + 6 * s * scale], [px + w, top + 6 * s * scale], [px, top - 5 * s * scale]], i % 2 ? C.pineA : C.pineB);
        }
        return;
      }
      g.fillStyle = C.trunk; g.fillRect(px - 1 * scale, py - 7 * s * scale, 2 * scale, 7 * s * scale);
      g.fillStyle = C.treeB; g.beginPath(); g.arc(px, py - 11 * s * scale, 6 * s * scale, 0, Math.PI * 2); g.fill();
      g.fillStyle = C.treeA; g.beginPath(); g.arc(px - 1.5 * scale, py - 12.5 * s * scale, 4.2 * s * scale, 0, Math.PI * 2); g.fill();
    }

    function smoke(x: number, y: number, z: number, t: number) {
      const [px, py] = iso(x, y, z);
      for (let i = 0; i < 4; i++) {
        const k = ((t / 2600 + i / 4) % 1);
        const r = (3 + k * 7) * scale;
        g.fillStyle = `${C.smoke}${(0.75 * (1 - k)).toFixed(2)})`;
        g.beginPath(); g.arc(px + k * 10 * scale, py - k * 34 * scale, r, 0, Math.PI * 2); g.fill();
      }
    }

    function turbine(x: number, y: number, t: number) {
      const [bx, by] = iso(x, y, 0), [hx, hy] = iso(x, y, 46);
      g.strokeStyle = "#E2E8F0"; g.lineWidth = 2.2 * scale; g.beginPath(); g.moveTo(bx, by); g.lineTo(hx, hy); g.stroke();
      g.strokeStyle = "#F8FAFC"; g.lineWidth = 1.8 * scale;
      for (let i = 0; i < 3; i++) {
        const a = t / 700 + (i * Math.PI * 2) / 3;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.cos(a) * 16 * scale, hy + Math.sin(a) * 16 * scale); g.stroke();
      }
      g.fillStyle = "#94A3B8"; g.beginPath(); g.arc(hx, hy, 1.8 * scale, 0, Math.PI * 2); g.fill();
    }

    function coolingTower(x: number, y: number, r: number, h: number) {
      const [bx, by] = iso(x, y, 0), [tx, ty] = iso(x, y, h);
      const R = r * scale, Rt = r * 0.72 * scale, Rw = r * 0.6 * scale;
      g.fillStyle = C.shadow; g.beginPath(); g.ellipse(bx + 6 * scale, by + 2 * scale, R * 1.1, R * 0.5, 0, 0, Math.PI * 2); g.fill();
      const grad = g.createLinearGradient(bx - R, 0, bx + R, 0);
      grad.addColorStop(0, "#EEF2F6"); grad.addColorStop(1, "#AEB8C6");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(bx - R, by);
      g.quadraticCurveTo(bx - Rw, (by + ty) / 2, tx - Rt, ty);
      g.lineTo(tx + Rt, ty);
      g.quadraticCurveTo(bx + Rw, (by + ty) / 2, bx + R, by);
      g.ellipse(bx, by, R, R * 0.5, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = "#64748B"; g.beginPath(); g.ellipse(tx, ty, Rt, Rt * 0.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#475569"; g.beginPath(); g.ellipse(tx, ty + 1 * scale, Rt * 0.8, Rt * 0.38, 0, 0, Math.PI * 2); g.fill();
    }

    function field(x: number, y: number, rows: string[]) {
      poly([iso(x + 0.06, y + 0.06), iso(x + 0.94, y + 0.06), iso(x + 0.94, y + 0.94), iso(x + 0.06, y + 0.94)], C.crops[(x + y) % 3]);
      for (let i = 1; i < 6; i++) {
        const v = y + 0.06 + (0.88 * i) / 6;
        const a = iso(x + 0.1, v), b = iso(x + 0.9, v);
        g.strokeStyle = rows[i % rows.length]; g.lineWidth = 1.6 * scale;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
    }

    // ─── Dessin d'un bâtiment sur son carreau ───
    function building(p: Plot, t: number, grow: number) {
      const { x, y } = p;
      const H = (h: number) => Math.max(1, h * grow);
      switch (p.id) {
        case "village":
          house(x + 0.1, y + 0.12, x + 0.45, y + 0.45, H(10));
          house(x + 0.55, y + 0.1, x + 0.9, y + 0.42, H(12), "#D08C5B", "#A96F46");
          house(x + 0.12, y + 0.58, x + 0.44, y + 0.9, H(9), "#C9705B", "#A2584A");
          house(x + 0.56, y + 0.56, x + 0.9, y + 0.9, H(11));
          break;
        case "house_s":
          house(x + 0.12, y + 0.14, x + 0.48, y + 0.5, H(11));
          house(x + 0.56, y + 0.52, x + 0.9, y + 0.88, H(10), "#D08C5B", "#A96F46");
          if (grow >= 1) tree(x + 0.78, y + 0.25, 0.8);
          break;
        case "house_m": {
          const h = H(34);
          block(x + 0.15, y + 0.15, x + 0.85, y + 0.85, 0, h, "#EEF2FF", "#E0E7FF", "#B9C4E8");
          windows(x + 0.15, y + 0.15, x + 0.85, y + 0.85, 0, h, 8);
          break;
        }
        case "house_l": {
          block(x + 0.08, y + 0.08, x + 0.5, y + 0.5, 0, H(58), C.glassTop, C.glassL, C.glassR);
          windows(x + 0.08, y + 0.08, x + 0.5, y + 0.5, 0, H(58), 7);
          block(x + 0.55, y + 0.5, x + 0.92, y + 0.92, 0, H(40), "#EEF2FF", "#E0E7FF", "#B9C4E8");
          windows(x + 0.55, y + 0.5, x + 0.92, y + 0.92, 0, H(40), 7);
          break;
        }
        case "house_xl": {
          block(x + 0.1, y + 0.1, x + 0.9, y + 0.9, 0, H(26), "#E2E8F0", "#CBD5E1", "#94A3B8");
          block(x + 0.22, y + 0.22, x + 0.78, y + 0.78, H(26), H(76), C.glassTop, C.glassL, C.glassR);
          windows(x + 0.22, y + 0.22, x + 0.78, y + 0.78, H(26), H(76), 7);
          break;
        }
        case "shop": {
          const h = H(13);
          block(x + 0.12, y + 0.18, x + 0.88, y + 0.82, 0, h, "#E2E8F0", C.wallL, C.wallR);
          // auvent
          poly([iso(x + 0.12, y + 0.82, h * 0.72), iso(x + 0.88, y + 0.82, h * 0.72), iso(x + 0.88, y + 0.96, h * 0.5), iso(x + 0.12, y + 0.96, h * 0.5)], C.violet);
          poly([iso(x + 0.2, y + 0.82, 1), iso(x + 0.8, y + 0.82, 1), iso(x + 0.8, y + 0.82, h * 0.6), iso(x + 0.2, y + 0.82, h * 0.6)], "rgba(147,197,253,.55)");
          block(x + 0.5, y + 0.3, x + 0.65, y + 0.45, h, 3, "#F1F5F9", "#CBD5E1", "#94A3B8");
          break;
        }
        case "services": {
          const h = H(44);
          block(x + 0.14, y + 0.14, x + 0.86, y + 0.86, 0, h, "#DBEAFE", "#93C5FD", "#60A5FA");
          windows(x + 0.14, y + 0.14, x + 0.86, y + 0.86, 0, h, 7);
          block(x + 0.4, y + 0.4, x + 0.6, y + 0.6, h, H(6), "#F1F5F9", "#CBD5E1", "#94A3B8");
          break;
        }
        case "townhall": {
          const h = H(18);
          block(x + 0.12, y + 0.12, x + 0.88, y + 0.88, 0, h, "#F8FAFC", "#FFFFFF", "#DDE3EA");
          for (let i = 0; i < 4; i++) {
            const u = x + 0.2 + i * 0.18;
            poly([iso(u, y + 0.88, 0), iso(u + 0.05, y + 0.88, 0), iso(u + 0.05, y + 0.88, h - 2), iso(u, y + 0.88, h - 2)], "#E2E8F0");
          }
          const [ax, ay] = iso(x + 0.5, y + 0.5, h + 16 * grow);
          poly([iso(x + 0.3, y + 0.3, h), iso(x + 0.7, y + 0.3, h), [ax, ay]], C.primaryDark);
          poly([iso(x + 0.7, y + 0.3, h), iso(x + 0.7, y + 0.7, h), [ax, ay]], C.primaryDark);
          poly([iso(x + 0.3, y + 0.7, h), iso(x + 0.7, y + 0.7, h), [ax, ay]], C.primary);
          poly([iso(x + 0.3, y + 0.3, h), iso(x + 0.3, y + 0.7, h), [ax, ay]], C.primary);
          if (grow >= 1) {
            g.strokeStyle = "#64748B"; g.lineWidth = 1.2 * scale; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, ay - 10 * scale); g.stroke();
            poly([[ax, ay - 10 * scale], [ax + 7 * scale, ay - 8 * scale], [ax, ay - 6 * scale]], C.primary);
          }
          break;
        }
        case "factory_s": case "factory_m": case "factory_l": {
          const big = p.id === "factory_l" ? 1.5 : p.id === "factory_m" ? 1.2 : 1;
          const h = H(16 * big);
          // cheminées (à l'arrière) dessinées avant le hangar
          block(x + 0.14, y + 0.06, x + 0.26, y + 0.18, 0, H(34 * big), "#6B778A", C.chimney, "#465264");
          if (p.id !== "factory_s") block(x + 0.62, y + 0.04, x + 0.74, y + 0.16, 0, H(28 * big), "#6B778A", C.chimney, "#465264");
          block(x + 0.1, y + 0.2, x + 0.9, y + 0.9, 0, h, C.indTop, C.indL, C.indR);
          // toit en dents de scie
          for (let i = 0; i < 3; i++) {
            const a = x + 0.1 + i * 0.267, b = a + 0.267;
            poly([iso(a, y + 0.2, h), iso(b, y + 0.2, h), iso(b, y + 0.2, h + 6), iso(a, y + 0.2, h)], "#8391A5");
            poly([iso(b, y + 0.2, h), iso(b, y + 0.9, h), iso(b, y + 0.9, h + 6), iso(b, y + 0.2, h + 6)], "#9AA7B8");
          }
          if (grow >= 1 && !reduce) smoke(x + 0.2, y + 0.12, 34 * big + 2, t + x * 400);
          if (grow >= 1 && p.id !== "factory_s" && !reduce) smoke(x + 0.68, y + 0.1, 28 * big + 2, t + 900 + y * 300);
          break;
        }
        case "farm_s": case "farm_m": case "farm_l":
          field(x, y, [C.cropsDark, "#A8C766"]);
          if (p.id !== "farm_s") house(x + 0.62, y + 0.1, x + 0.9, y + 0.38, H(12), "#B4463B", "#8E362E");
          else block(x + 0.7, y + 0.1, x + 0.9, y + 0.28, 0, H(7), "#E2E8F0", "#C0877A", "#9E6A5F");
          if (p.id === "farm_l") block(x + 0.14, y + 0.12, x + 0.26, y + 0.24, 0, H(26), "#F1F5F9", "#CBD5E1", "#94A3B8");
          break;
        case "power_s":
          for (let i = 0; i < 3; i++) {
            const v = y + 0.18 + i * 0.24;
            poly([iso(x + 0.12, v, 3), iso(x + 0.62, v, 3), iso(x + 0.62, v + 0.16, 7 * grow), iso(x + 0.12, v + 0.16, 7 * grow)], i % 2 ? C.panelHi : C.panel, "rgba(255,255,255,.25)");
          }
          if (grow >= 1) turbine(x + 0.8, y + 0.5, reduce ? 0 : t + x * 97);
          break;
        case "power_m": {
          const h = H(20);
          block(x + 0.76, y + 0.1, x + 0.9, y + 0.24, 0, H(44), "#6B778A", C.chimney, "#465264");
          block(x + 0.1, y + 0.35, x + 0.7, y + 0.9, 0, h, C.indTop, "#D5DCE5", "#A5B1C2");
          poly([iso(x + 0.1, y + 0.9, h * 0.35), iso(x + 0.7, y + 0.9, h * 0.35), iso(x + 0.7, y + 0.9, h * 0.5), iso(x + 0.1, y + 0.9, h * 0.5)], C.amber);
          if (grow >= 1 && !reduce) smoke(x + 0.83, y + 0.17, 46, t + y * 200);
          break;
        }
        case "power_l":
          coolingTower(x + 0.3, y + 0.35, 11, H(40));
          coolingTower(x + 0.7, y + 0.72, 11, H(40));
          if (grow >= 1 && !reduce) { smoke(x + 0.3, y + 0.35, 42, t); smoke(x + 0.7, y + 0.72, 42, t + 1300); }
          break;
        default:
          block(x + 0.2, y + 0.2, x + 0.8, y + 0.8, 0, H(14), C.wallTop, C.wallL, C.wallR);
      }
    }

    // ─── Voitures ───
    const roadLines: { axis: "x" | "y"; k: number }[] = [];
    for (let k = Math.ceil(x0 / 4) * 4; k <= x1; k += 4) roadLines.push({ axis: "x", k });
    for (let k = Math.ceil(y0 / 4) * 4; k <= y1; k += 4) roadLines.push({ axis: "y", k });
    const carColors = ["#EF4444", "#F8FAFC", "#2563EB", "#F59E0B", "#0F172A", "#10B981"];
    const cars = Array.from({ length: compact ? 0 : Math.min(10, 2 + Math.floor(plots.length / 2)) }, (_, i) => ({
      line: roadLines[i % Math.max(1, roadLines.length)],
      speed: 0.0006 + hash(i, 3) * 0.0005,
      off: hash(i, 7),
      dir: i % 2 ? 1 : -1,
      color: carColors[i % carColors.length],
    }));

    /** Sol : socle, herbe, routes, trottoirs. Ne dépend que de la vue : mis en cache quand elle ne bouge pas. */
    function ground() {
      poly([iso(x0, y1 + 1), iso(x1 + 1, y1 + 1), [iso(x1 + 1, y1 + 1)[0], iso(x1 + 1, y1 + 1)[1] + SLAB * scale], [iso(x0, y1 + 1)[0], iso(x0, y1 + 1)[1] + SLAB * scale]], C.soilL);
      poly([iso(x1 + 1, y0), iso(x1 + 1, y1 + 1), [iso(x1 + 1, y1 + 1)[0], iso(x1 + 1, y1 + 1)[1] + SLAB * scale], [iso(x1 + 1, y0)[0], iso(x1 + 1, y0)[1] + SLAB * scale]], C.soilR);
      const edgeL = iso(x0, y1 + 1), edgeC = iso(x1 + 1, y1 + 1), edgeR = iso(x1 + 1, y0);
      poly([edgeL, edgeC, [edgeC[0], edgeC[1] + 4 * scale], [edgeL[0], edgeL[1] + 4 * scale]], C.grassEdge);
      poly([edgeC, edgeR, [edgeR[0], edgeR[1] + 4 * scale], [edgeC[0], edgeC[1] + 4 * scale]], "#76AD5C");

      const m = modeRef.current;
      const mx = TW * scale, my = TH * scale;
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          // Carreau hors écran : rien à dessiner
          const sx = ox + (x - y) * (TW / 2) * scale, sy = oy + (x + y + 1) * (TH / 2) * scale;
          if (sx < -mx || sx > W + mx || sy < -my || sy > H + my) continue;
          const q: Pt[] = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
          if (isRoad(x, y)) {
            poly(q, C.road);
            const rx = x % 4 === 0, ry = y % 4 === 0;
            // Trottoirs le long de l'herbe
            const cw = 0.1;
            if (!isRoad(x - 1, y)) poly([iso(x, y), iso(x + cw, y), iso(x + cw, y + 1), iso(x, y + 1)], C.curb);
            if (!isRoad(x + 1, y)) poly([iso(x + 1 - cw, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x + 1 - cw, y + 1)], C.curb);
            if (!isRoad(x, y - 1)) poly([iso(x, y), iso(x + 1, y), iso(x + 1, y + cw), iso(x, y + cw)], C.curb);
            if (!isRoad(x, y + 1)) poly([iso(x, y + 1 - cw), iso(x + 1, y + 1 - cw), iso(x + 1, y + 1), iso(x, y + 1)], C.curb);
            if (rx !== ry) {
              const nearCross = rx ? (y % 4 === 1 || y % 4 === 3) : (x % 4 === 1 || x % 4 === 3);
              if (nearCross && scale > 0.5) {
                // Passage piéton à l'approche du carrefour
                const edge = rx ? (y % 4 === 1 ? y + 0.08 : y + 0.72) : (x % 4 === 1 ? x + 0.08 : x + 0.72);
                for (let i = 0; i < 4; i++) {
                  const a0 = 0.18 + i * 0.18, a1 = a0 + 0.09;
                  poly(rx
                    ? [iso(x + a0, edge), iso(x + a1, edge), iso(x + a1, edge + 0.2), iso(x + a0, edge + 0.2)]
                    : [iso(edge, y + a0), iso(edge + 0.2, y + a0), iso(edge + 0.2, y + a1), iso(edge, y + a1)], C.crosswalk);
                }
              } else {
                const a = rx ? iso(x + 0.5, y + 0.2) : iso(x + 0.2, y + 0.5);
                const b = rx ? iso(x + 0.5, y + 0.8) : iso(x + 0.8, y + 0.5);
                g.strokeStyle = C.roadLine; g.lineWidth = 1 * scale; g.setLineDash([3 * scale, 4 * scale]);
                g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]);
              }
            }
          } else {
            poly(q, C.grass[Math.floor(hash(x * 3 + 1, y * 7 + 2) * 4)]);
            if (scale > 0.6 && hash(x + 11, y + 5) < 0.3 && !byTile.has(`${x},${y}`)) {
              // Touffes d'herbe
              g.strokeStyle = C.tuft; g.lineWidth = 1 * scale;
              for (let i = 0; i < 3; i++) {
                const [tx, ty] = iso(x + 0.2 + hash(x, y + i) * 0.6, y + 0.2 + hash(x + i, y) * 0.6);
                g.beginPath(); g.moveTo(tx - 2 * scale, ty); g.lineTo(tx - 1 * scale, ty - 3 * scale);
                g.moveTo(tx, ty); g.lineTo(tx, ty - 4 * scale); g.moveTo(tx + 2 * scale, ty); g.lineTo(tx + 1 * scale, ty - 3 * scale); g.stroke();
              }
            }
            const p = byTile.get(`${x},${y}`);
            if (p && BUILDING_BY_ID[p.id]?.category !== "agriculture") {
              poly([iso(x + 0.04, y + 0.04), iso(x + 0.96, y + 0.04), iso(x + 0.96, y + 0.96), iso(x + 0.04, y + 0.96)], C.sidewalk);
            }
          }
          // Mode construction : carreaux libres en vert
          if (m && isBuildable(x, y) && !byTile.has(`${x},${y}`)) poly(q, "rgba(16,185,129,.10)");
        }
      }
    }

    // Calque du sol : redessiné seulement quand la vue change (zoom, déplacement, mode construction).
    // Pendant un déplacement on dessine en direct ; dès que la vue est stable, on réutilise l'image.
    const groundCv = document.createElement("canvas");
    const groundCtx = groundCv.getContext("2d");
    let groundKey = "", groundSeen = "";
    function paintGround() {
      const key = `${scale.toFixed(5)}|${ox.toFixed(1)}|${oy.toFixed(1)}|${cv!.width}|${cv!.height}|${modeRef.current ? 1 : 0}`;
      if (!groundCtx) { ground(); return; }
      if (key !== groundKey) {
        if (key !== groundSeen) { groundSeen = key; groundKey = ""; ground(); return; }
        if (groundCv.width !== cv!.width || groundCv.height !== cv!.height) { groundCv.width = cv!.width; groundCv.height = cv!.height; }
        groundCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        groundCtx.clearRect(0, 0, W, H);
        g = groundCtx; ground(); g = main!;
        groundKey = key;
      }
      main!.drawImage(groundCv, 0, 0, W, H);
    }

    // ─── Objets fixes (bâtiments, arbres, lampadaires), triés une seule fois par profondeur ───
    const statics: Item[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (isRoad(x, y)) continue;
        const p = byTile.get(`${x},${y}`);
        if (p) {
          statics.push({ depth: x + y + 0.5, ax: x + 0.5, ay: y + 0.5, draw: (t) => {
            const b = births.current.get(keyOf(p));
            const grow = b === undefined || reduce ? 1 : Math.min(1, (t - b) / 700);
            const m = modeRef.current;
            if (m?.kind === "move" && m.from.x === x && m.from.y === y) g.globalAlpha = 0.3;
            building(p, t, 1 - Math.pow(1 - grow, 3));
            g.globalAlpha = 1;
          } });
        } else if (hash(x, y) < 0.35) {
          const n = hash(y, x) < 0.5 ? 1 : 2;
          for (let i = 0; i < n; i++) {
            const tx = x + 0.25 + hash(x + i, y) * 0.5, ty = y + 0.25 + hash(x, y + i) * 0.5, s = 0.8 + hash(x * i + 1, y) * 0.4;
            statics.push({ depth: tx + ty, ax: tx, ay: ty, draw: () => tree(tx, ty, s) });
          }
        }
      }
    }
    for (const [lx, ly] of lamps) {
      statics.push({ depth: lx + ly, ax: lx, ay: ly, draw: () => {
        const [bx, by] = iso(lx, ly, 0), [hx, hy] = iso(lx, ly, 22);
        g.strokeStyle = C.lamp; g.lineWidth = 1.4 * scale;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(hx, hy); g.lineTo(hx + 4 * scale, hy + 1 * scale); g.stroke();
        g.fillStyle = night > 0.3 ? "#FEF3C7" : "#E2E8F0";
        g.beginPath(); g.arc(hx + 4 * scale, hy + 1.5 * scale, 1.6 * scale, 0, Math.PI * 2); g.fill();
      } });
    }
    statics.sort((a, b) => a.depth - b.depth);

    /** Pastille d'alerte au-dessus d'un bâtiment (taille lisible quel que soit le zoom). */
    function marker(mk: CityMarker, id: string, t: number) {
      const r = Math.max(8, Math.min(13, 9 * scale));
      const bob = reduce ? 0 : Math.sin(t / 420 + mk.x * 1.7 + mk.y) * 2;
      const [px, top] = iso(mk.x + 0.5, mk.y + 0.5, (TOP[id] ?? 30) + 4);
      const py = top - r - 5 + bob;
      if (px < -r || px > W + r || py < -r * 2 || py > H + r) return;
      const col = MARKER_COLOR[mk.kind];
      // Pointe vers le bâtiment
      g.fillStyle = col;
      g.beginPath(); g.moveTo(px - r * 0.45, py + r * 0.75); g.lineTo(px + r * 0.45, py + r * 0.75); g.lineTo(px, py + r * 1.55); g.closePath(); g.fill();
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = 1.5; g.strokeStyle = "#FFFFFF"; g.stroke();
      g.fillStyle = "#FFFFFF"; g.lineCap = "round";
      const P = (pts: Pt[]) => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(px + a * r, py + b * r) : g.moveTo(px + a * r, py + b * r))); g.closePath(); g.fill(); };
      if (mk.kind === "energy") P([[0.18, -0.62], [-0.38, 0.1], [-0.02, 0.1], [-0.18, 0.62], [0.38, -0.1], [0.02, -0.1]]);
      else if (mk.kind === "full") P([[-0.56, 0], [0, -0.55], [0.56, 0], [0.34, 0], [0.34, 0.46], [-0.34, 0.46], [-0.34, 0]]);
      else if (mk.kind === "staff") {
        g.beginPath(); g.arc(px, py - r * 0.24, r * 0.24, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(px, py + r * 0.52, r * 0.44, r * 0.38, 0, Math.PI, 0); g.closePath(); g.fill();
      } else {
        // Épi de blé
        g.lineWidth = Math.max(1.3, r * 0.14);
        g.beginPath(); g.moveTo(px, py + r * 0.58); g.lineTo(px, py - r * 0.55);
        for (let i = 0; i < 3; i++) {
          const yy = py + r * (0.2 - i * 0.28);
          g.moveTo(px, yy); g.lineTo(px - r * 0.32, yy - r * 0.26); g.moveTo(px, yy); g.lineTo(px + r * 0.32, yy - r * 0.26);
        }
        g.stroke();
      }
    }

    const dynamic: Item[] = [];
    function frame(t: number) {
      // Animation de zoom en cours : on se rapproche de la vue visée
      if (goal) {
        const v = view.current, a = 0.22;
        v.zoom += (goal.zoom - v.zoom) * a; v.px += (goal.px - v.px) * a; v.py += (goal.py - v.py) * a;
        if (Math.abs(goal.zoom - v.zoom) < 0.002 && Math.abs(goal.px - v.px) < 0.5 && Math.abs(goal.py - v.py) < 0.5) { view.current = { ...goal }; goal = null; }
        applyView();
      }
      lights = [];
      if (t - nightAt > 60_000) { night = nightFactor(); nightAt = t; }
      g = main!;
      g.clearRect(0, 0, W, H);
      paintGround();

      // Carreau survolé
      const m = modeRef.current, hv = hoverRef.current;
      if (hv && hv.x >= x0 && hv.x <= x1 && hv.y >= y0 && hv.y <= y1) {
        const q: Pt[] = [iso(hv.x, hv.y), iso(hv.x + 1, hv.y), iso(hv.x + 1, hv.y + 1), iso(hv.x, hv.y + 1)];
        const taken = byTile.has(`${hv.x},${hv.y}`);
        const free = isBuildable(hv.x, hv.y) && !taken;
        if (m) poly(q, free || (m.kind === "move" && m.from.x === hv.x && m.from.y === hv.y) ? "rgba(16,185,129,.45)" : "rgba(239,68,68,.35)");
        else if (taken) poly(q, toneRef.current === "danger" ? "rgba(239,68,68,.28)" : "rgba(37,99,235,.22)");
      }

      // Carreau sélectionné / bâtiment en cours de déplacement
      const sel = m?.kind === "move" ? m.from : selectedRef.current;
      if (sel) {
        const q: Pt[] = [iso(sel.x, sel.y), iso(sel.x + 1, sel.y), iso(sel.x + 1, sel.y + 1), iso(sel.x, sel.y + 1)];
        const col = m?.kind === "move" ? "#F59E0B" : toneRef.current === "danger" ? "#EF4444" : "#2563EB";
        g.beginPath(); g.moveTo(q[0][0], q[0][1]); q.slice(1).forEach((pt) => g.lineTo(pt[0], pt[1])); g.closePath();
        g.fillStyle = `${col}2E`; g.fill();
        g.lineWidth = Math.max(2, 2.5 * scale); g.strokeStyle = col; g.stroke();
      }

      // Objets mobiles : voitures et aperçu du bâtiment à placer
      dynamic.length = 0;
      for (const car of cars) {
        if (!car.line) break;
        const len = (car.line.axis === "x" ? y1 - y0 + 1 : x1 - x0 + 1);
        let u = ((reduce ? 0 : t) * car.speed + car.off) % 1;
        if (car.dir < 0) u = 1 - u;
        const pos = (car.line.axis === "x" ? y0 : x0) + u * len;
        const lane = car.dir > 0 ? 0.32 : 0.68;
        const cx = car.line.axis === "x" ? car.line.k + lane : pos;
        const cy = car.line.axis === "x" ? pos : car.line.k + lane;
        dynamic.push({ depth: cx + cy, ax: cx, ay: cy, draw: () => {
          const w = 0.12, l = 0.26;
          if (car.line.axis === "x") block(cx - w / 2, cy - l / 2, cx + w / 2, cy + l / 2, 0, 5, car.color, car.color, "rgba(15,23,42,.35)");
          else block(cx - l / 2, cy - w / 2, cx + l / 2, cy + w / 2, 0, 5, car.color, car.color, "rgba(15,23,42,.35)");
        } });
      }
      if (m && hv && isBuildable(hv.x, hv.y) && !byTile.has(`${hv.x},${hv.y}`)) {
        dynamic.push({ depth: hv.x + hv.y + 0.5, ax: hv.x + 0.5, ay: hv.y + 0.5, draw: (tt) => {
          g.globalAlpha = 0.6;
          building({ id: m.id, x: hv.x, y: hv.y }, tt, 1);
          g.globalAlpha = 1;
        } });
      }
      dynamic.sort((a, b) => a.depth - b.depth);
      // Fusion des deux listes déjà triées, en sautant ce qui est hors écran
      let i = 0, j = 0;
      while (i < statics.length || j < dynamic.length) {
        const it = j >= dynamic.length || (i < statics.length && statics[i].depth <= dynamic[j].depth) ? statics[i++] : dynamic[j++];
        if (onScreenAt(it.ax, it.ay)) it.draw(t);
      }

      // Ombres de nuages qui passent (effet de profondeur, très léger)
      if (!compact && !reduce) {
        g.save();
        const [a0, a1, a2, a3] = [iso(x0, y0), iso(x1 + 1, y0), iso(x1 + 1, y1 + 1), iso(x0, y1 + 1)];
        g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.lineTo(a3[0], a3[1]); g.closePath(); g.clip();
        g.fillStyle = `rgba(15,23,42,${0.05 * (1 - night)})`;
        for (let k = 0; k < 3; k++) {
          const u = ((t / 90_000 + k / 3) % 1) * (x1 - x0 + 8) + x0 - 4;
          const [cx, cy] = iso(u, y0 + (y1 - y0) * (0.2 + k * 0.3));
          g.beginPath(); g.ellipse(cx, cy, 70 * scale, 26 * scale, -0.2, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }

      // Nuit : la ville s'assombrit, les fenêtres et les lampadaires s'allument
      if (night > 0) {
        g.fillStyle = `rgba(17,24,58,${0.42 * night})`;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(253,224,138,${0.85 * night})`;
        for (const q of lights) { g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (let k = 1; k < 4; k++) g.lineTo(q[k][0], q[k][1]); g.closePath(); g.fill(); }
        for (const [lx, ly] of lamps) {
          if (!onScreenAt(lx, ly)) continue;
          const [hx, hy] = iso(lx, ly, 22), [gx, gy] = iso(lx + 0.2, ly + 0.2, 0);
          const glow = g.createRadialGradient(gx, gy, 0, gx, gy, 26 * scale);
          glow.addColorStop(0, `rgba(254,240,180,${0.35 * night})`); glow.addColorStop(1, "rgba(254,240,180,0)");
          g.fillStyle = glow; g.beginPath(); g.ellipse(gx, gy, 26 * scale, 13 * scale, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = `rgba(254,243,199,${night})`; g.beginPath(); g.arc(hx + 4 * scale, hy + 1.5 * scale, 2.2 * scale, 0, Math.PI * 2); g.fill();
        }
      }

      // Indicateurs : toujours lisibles, donc dessinés par-dessus la nuit
      if (markersRef.current.size && !m) {
        for (const mk of markersRef.current.values()) {
          const p = byTile.get(`${mk.x},${mk.y}`);
          if (p) marker(mk, p.id, t);
        }
      }
    }

    // Animation seulement quand la vue est visible à l'écran et l'onglet actif
    let raf = 0, onScreen = true;
    const loop = (t: number) => { frame(t); raf = requestAnimationFrame(loop); };
    const run = () => {
      cancelAnimationFrame(raf); raf = 0;
      if (reduce || !onScreen || document.hidden) { frame(performance.now()); return; }
      raf = requestAnimationFrame(loop);
    };
    layout();
    run();
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; run(); });
    io.observe(box);
    document.addEventListener("visibilitychange", run);

    const ro = new ResizeObserver(() => { layout(); if (!raf) frame(performance.now()); });
    ro.observe(box);

    redraw.current = () => { applyView(); if (!raf) frame(performance.now()); };

    // Survol (identifier un bâtiment), glisser (déplacer la vue), pincer / molette (zoom)
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let pinch: { dist: number; mx: number; my: number } | null = null;
    const local = (e: { clientX: number; clientY: number }) => { const r = cv.getBoundingClientRect(); return { lx: e.clientX - r.left, ly: e.clientY - r.top }; };
    const tileAt = (lx: number, ly: number) => {
      const a = (lx - ox) / (TW / 2 * scale), b = (ly - oy) / (TH / 2 * scale);
      return { tx: Math.floor((a + b) / 2), ty: Math.floor((b - a) / 2) };
    };
    const onDown = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
      else { drag = drag ? { ...drag, moved: true } : null; pinch = null; }
      goal = null;
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = pts.size === 1 && drag && !drag.moved;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
      if (pts.size === 0) drag = null;
      if (wasClick && clickRef.current) {
        const { lx, ly } = local(e);
        const { tx, ty } = tileAt(lx, ly);
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) clickRef.current(tx, ty);
      }
    };
    const onMove = (e: PointerEvent) => {
      const { lx, ly } = local(e);
      const prev = pts.get(e.pointerId);
      if (prev) {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size >= 2) {
          const [a, b] = [...pts.values()];
          const r = cv.getBoundingClientRect();
          const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) {
            view.current.px += mx - pinch.mx; view.current.py += my - pinch.my; applyView();
            const next = viewAround(view.current.zoom * (dist / (pinch.dist || dist)), mx, my);
            view.current = next; applyView();
          }
          pinch = { dist, mx, my };
          hoverRef.current = null; setTip(null); if (!raf) frame(performance.now());
          return;
        }
        if (drag) {
          if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) { drag.moved = true; cv.setPointerCapture(e.pointerId); }
          if (drag.moved) {
            view.current.px += e.clientX - prev.x; view.current.py += e.clientY - prev.y;
            hoverRef.current = null; setTip(null); redraw.current();
            return;
          }
        }
      }
      const { tx, ty } = tileAt(lx, ly);
      const last = hoverRef.current;
      if (last && last.x === tx && last.y === ty) return; // même carreau : rien à refaire
      const p = byTile.get(`${tx},${ty}`);
      hoverRef.current = { x: tx, y: ty };
      const b = p ? BUILDING_BY_ID[p.id] : undefined;
      if (p && !modeRef.current) {
        // Infobulle ancrée au-dessus du bâtiment (elle ne suit pas la souris)
        const [ax, ay] = iso(tx + 0.5, ty + 0.5, (TOP[p.id] ?? 30) + 4);
        const mk = markersRef.current.get(`${tx},${ty}`);
        setTip({ left: ax, top: ay - (mk ? 34 : 6), title: b?.name ?? p.id, text: mk?.label ?? b?.description ?? "", warn: !!mk });
      } else setTip(null);
      if (!raf) frame(performance.now());
    };
    const onLeave = () => { hoverRef.current = null; setTip(null); if (!raf) frame(performance.now()); };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { lx, ly } = local(e);
      goal = null;
      view.current = viewAround(view.current.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), lx, ly);
      applyView(); hoverRef.current = null; setTip(null);
      if (!raf) frame(performance.now());
    };
    const onDbl = (e: MouseEvent) => { const { lx, ly } = local(e); go(viewAround((goal?.zoom ?? view.current.zoom) * 1.6, lx, ly), true); };
    if (!compact) {
      cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", onUp);
      cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerleave", onLeave);
      cv.addEventListener("wheel", onWheel, { passive: false }); cv.addEventListener("dblclick", onDbl);
    }

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", run);
      cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointerup", onUp); cv.removeEventListener("pointercancel", onUp);
      cv.removeEventListener("wheel", onWheel); cv.removeEventListener("dblclick", onDbl);
      controls.current = null;
    };
  }, [plots, height, compact, interactive, initialZoom, padTop, padBottom]);

  return (
    <div ref={wrap} className={`relative w-full overflow-hidden outline-none ${height === "fill" ? "" : "rounded-[12px] focus-visible:ring-2 focus-visible:ring-primary"}`}
      style={{ height: height === "fill" ? "100%" : height, background: "radial-gradient(ellipse at 50% 20%, #F3F8FE 0%, #DDE8F4 100%)" }}
      tabIndex={compact ? undefined : 0} onKeyDown={compact ? undefined : onKey}>
      <canvas ref={canvas} role="img" className={compact ? "" : `block ${mode ? "cursor-crosshair" : interactive ? "cursor-pointer" : "cursor-grab"} active:cursor-grabbing touch-none`} aria-label={`Vue isométrique de la ville : ${plots.length} bâtiments`} />
      {!compact && (
        <div className={`absolute z-10 flex flex-col overflow-hidden rounded-[10px] border border-line bg-card shadow-sm ${zoomClass}`}>
          {ZOOM_BUTTONS.map((b) => (
            <button key={b.kind} type="button" aria-label={b.label} title={b.label}
              onClick={() => onZoom(b.kind)}
              className="h-9 w-9 grid place-items-center text-[17px] font-semibold text-ink hover:bg-slate-50 border-b border-line last:border-b-0">{b.text}</button>
          ))}
        </div>
      )}
      {tip && (
        <div className="pointer-events-none absolute z-10 rounded-[10px] bg-navy text-white px-3 py-1.5 shadow-lg -translate-x-1/2 -translate-y-full"
          style={{ left: tip.left, top: tip.top }}>
          <div className="text-[12px] font-semibold whitespace-nowrap">{tip.title}</div>
          {tip.text && <div className={`text-[11px] whitespace-nowrap ${tip.warn ? "text-amber-300" : "text-slate-300"}`}>{tip.text}</div>}
        </div>
      )}
      {!compact && hint && (
        <div className="pointer-events-none absolute left-3 bottom-3 rounded-full bg-card/85 backdrop-blur border border-line px-2.5 py-1 text-[11px] text-muted hidden sm:block">
          Molette ou pincement : zoom · Glisser : se déplacer · Double-clic : zoomer
        </div>
      )}
    </div>
  );
}
