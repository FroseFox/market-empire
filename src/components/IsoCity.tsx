"use client";
// Vue isométrique 2.5D de la ville, dessinée sur un canvas.
// Tout est calculé à partir de `plots` : aucune image externe.
import { useEffect, useRef, useState } from "react";
import { BUILDING_BY_ID } from "@/lib/game/config";
import { isBuildable, isRoad, MAP_SIZE, type Plot } from "@/lib/game/layout";

export type CityMode = { kind: "place"; id: string } | { kind: "move"; id: string; from: { x: number; y: number } };

const TW = 64, TH = 32; // taille d'un carreau à l'échelle 1

// ─── Palette (charte : moderne, sobre, légèrement réaliste) ───
const C = {
  grass: ["#A7D98B", "#9FD382"], grassEdge: "#86BF6A",
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

interface Item { depth: number; draw: (g: CanvasRenderingContext2D, t: number) => void }

type ZoomKind = "in" | "out" | "reset";
const ZOOM_BUTTONS: { kind: ZoomKind; label: string; text: string }[] = [
  { kind: "in", label: "Zoomer", text: "+" },
  { kind: "out", label: "Dézoomer", text: "−" },
  { kind: "reset", label: "Recentrer", text: "⟲" },
];

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export default function IsoCity({ plots, height = 440, compact = false, mode = null, selected = null, onTileClick }: {
  plots: Plot[]; height?: number; compact?: boolean;
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
  const view = useRef({ zoom: 1, px: 0, py: 0 });
  const redraw = useRef<() => void>(() => {});
  const modeRef = useRef<CityMode | null>(null);
  const selectedRef = useRef<{ x: number; y: number } | null>(null);
  const clickRef = useRef<typeof onTileClick>(undefined);
  const interactive = !!onTileClick;

  // Les props qui changent souvent passent par des refs : pas besoin de tout redessiner la scène
  useEffect(() => {
    modeRef.current = mode;
    selectedRef.current = selected;
    clickRef.current = onTileClick;
    redraw.current();
  });

  function onZoom(kind: ZoomKind) {
    const v = view.current;
    if (kind === "in") v.zoom = Math.min(3, v.zoom * 1.3);
    else if (kind === "out") v.zoom = Math.max(0.6, v.zoom / 1.3);
    else view.current = { zoom: 1, px: 0, py: 0 };
    redraw.current();
  }
  const [tip, setTip] = useState<{ left: number; top: number; text: string } | null>(null);

  const keyOf = (p: Plot) => `${p.id}@${p.x},${p.y}`;

  useEffect(() => {
    const cv = canvas.current, box = wrap.current;
    if (!cv || !box) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

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
    let scale = 1, ox = 0, oy = 0, W = 0, H = 0, base = { scale: 1, ox: 0, oy: 0 };

    const iso = (x: number, y: number, z = 0): Pt => [ox + (x - y) * (TW / 2) * scale, oy + (x + y) * (TH / 2) * scale - z * scale];

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = box!.clientWidth; H = height;
      cv!.width = W * dpr; cv!.height = H * dpr;
      cv!.style.width = `${W}px`; cv!.style.height = `${H}px`;
      g!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Emprise écran du losange visible (+ socle + marge pour les tours)
      const spanX = ((x1 + 1 - x0) + (y1 + 1 - y0)) * TW / 2;
      const spanY = ((x1 + 1 - x0) + (y1 + 1 - y0)) * TH / 2 + SLAB + (compact ? 40 : 60);
      const s0 = Math.min((W - 24) / spanX, (H - 16) / spanY);
      const cx = ((x0 - y1 - 1) + (x1 + 1 - y0)) / 2 * TW / 2;
      base = { scale: s0, ox: W / 2 - cx * s0, oy: H - 12 - (SLAB + (x1 + 1 + y1 + 1) * TH / 2) * s0 };
      applyView();
    }

    /** Zoom autour du centre du cadre + déplacement. */
    function applyView() {
      const { zoom, px, py } = view.current;
      scale = base.scale * zoom;
      ox = W / 2 + (base.ox - W / 2) * zoom + px;
      oy = H / 2 + (base.oy - H / 2) * zoom + py;
    }

    // ─── Primitives ───
    const poly = (pts: Pt[], fill: string, stroke?: string) => {
      g!.beginPath(); g!.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g!.lineTo(pts[i][0], pts[i][1]);
      g!.closePath(); g!.fillStyle = fill; g!.fill();
      if (stroke) { g!.strokeStyle = stroke; g!.lineWidth = 1; g!.stroke(); }
    };

    /** Pavé droit [ax..bx]×[ay..by], de z0 à z0+h. */
    function block(ax: number, ay: number, bx: number, by: number, z0: number, h: number, top: string, left: string, right: string) {
      // ombre portée
      poly([iso(ax, ay, 0), iso(bx + h / 60, ay, 0), iso(bx + h / 60, by + h / 90, 0), iso(ax, by + h / 90, 0)], C.shadow);
      poly([iso(ax, by, z0), iso(bx, by, z0), iso(bx, by, z0 + h), iso(ax, by, z0 + h)], left);
      poly([iso(bx, ay, z0), iso(bx, by, z0), iso(bx, by, z0 + h), iso(bx, ay, z0 + h)], right);
      poly([iso(ax, ay, z0 + h), iso(bx, ay, z0 + h), iso(bx, by, z0 + h), iso(ax, by, z0 + h)], top);
    }

    /** Fenêtres sur les deux faces visibles d'un pavé. */
    function windows(ax: number, ay: number, bx: number, by: number, z0: number, h: number, floor = 9, lit = C.win) {
      const rows = Math.floor((h - 4) / floor);
      for (let r = 0; r < rows; r++) {
        const z = z0 + 4 + r * floor;
        const cols = Math.max(2, Math.round((bx - ax) * 5));
        for (let c = 0; c < cols; c++) {
          const u0 = ax + (bx - ax) * ((c + 0.25) / cols), u1 = ax + (bx - ax) * ((c + 0.75) / cols);
          poly([iso(u0, by, z), iso(u1, by, z), iso(u1, by, z + floor * 0.5), iso(u0, by, z + floor * 0.5)], lit);
        }
        const cols2 = Math.max(2, Math.round((by - ay) * 5));
        for (let c = 0; c < cols2; c++) {
          const v0 = ay + (by - ay) * ((c + 0.25) / cols2), v1 = ay + (by - ay) * ((c + 0.75) / cols2);
          poly([iso(bx, v0, z), iso(bx, v1, z), iso(bx, v1, z + floor * 0.5), iso(bx, v0, z + floor * 0.5)], C.winDark);
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
      g!.fillStyle = C.shadow; g!.beginPath(); g!.ellipse(px + 3 * scale, py, 6 * s * scale, 3 * s * scale, 0, 0, Math.PI * 2); g!.fill();
      g!.fillStyle = C.trunk; g!.fillRect(px - 1 * scale, py - 7 * s * scale, 2 * scale, 7 * s * scale);
      g!.fillStyle = C.treeB; g!.beginPath(); g!.arc(px, py - 11 * s * scale, 6 * s * scale, 0, Math.PI * 2); g!.fill();
      g!.fillStyle = C.treeA; g!.beginPath(); g!.arc(px - 1.5 * scale, py - 12.5 * s * scale, 4.2 * s * scale, 0, Math.PI * 2); g!.fill();
    }

    function smoke(x: number, y: number, z: number, t: number) {
      const [px, py] = iso(x, y, z);
      for (let i = 0; i < 4; i++) {
        const k = ((t / 2600 + i / 4) % 1);
        const r = (3 + k * 7) * scale;
        g!.fillStyle = `${C.smoke}${(0.75 * (1 - k)).toFixed(2)})`;
        g!.beginPath(); g!.arc(px + k * 10 * scale, py - k * 34 * scale, r, 0, Math.PI * 2); g!.fill();
      }
    }

    function turbine(x: number, y: number, t: number) {
      const [bx, by] = iso(x, y, 0), [hx, hy] = iso(x, y, 46);
      g!.strokeStyle = "#E2E8F0"; g!.lineWidth = 2.2 * scale; g!.beginPath(); g!.moveTo(bx, by); g!.lineTo(hx, hy); g!.stroke();
      g!.strokeStyle = "#F8FAFC"; g!.lineWidth = 1.8 * scale;
      for (let i = 0; i < 3; i++) {
        const a = t / 700 + (i * Math.PI * 2) / 3;
        g!.beginPath(); g!.moveTo(hx, hy); g!.lineTo(hx + Math.cos(a) * 16 * scale, hy + Math.sin(a) * 16 * scale); g!.stroke();
      }
      g!.fillStyle = "#94A3B8"; g!.beginPath(); g!.arc(hx, hy, 1.8 * scale, 0, Math.PI * 2); g!.fill();
    }

    function coolingTower(x: number, y: number, r: number, h: number) {
      const [bx, by] = iso(x, y, 0), [tx, ty] = iso(x, y, h);
      const R = r * scale, Rt = r * 0.72 * scale, Rw = r * 0.6 * scale;
      g!.fillStyle = C.shadow; g!.beginPath(); g!.ellipse(bx + 6 * scale, by + 2 * scale, R * 1.1, R * 0.5, 0, 0, Math.PI * 2); g!.fill();
      const grad = g!.createLinearGradient(bx - R, 0, bx + R, 0);
      grad.addColorStop(0, "#EEF2F6"); grad.addColorStop(1, "#AEB8C6");
      g!.fillStyle = grad;
      g!.beginPath();
      g!.moveTo(bx - R, by);
      g!.quadraticCurveTo(bx - Rw, (by + ty) / 2, tx - Rt, ty);
      g!.lineTo(tx + Rt, ty);
      g!.quadraticCurveTo(bx + Rw, (by + ty) / 2, bx + R, by);
      g!.ellipse(bx, by, R, R * 0.5, 0, 0, Math.PI);
      g!.fill();
      g!.fillStyle = "#64748B"; g!.beginPath(); g!.ellipse(tx, ty, Rt, Rt * 0.5, 0, 0, Math.PI * 2); g!.fill();
      g!.fillStyle = "#475569"; g!.beginPath(); g!.ellipse(tx, ty + 1 * scale, Rt * 0.8, Rt * 0.38, 0, 0, Math.PI * 2); g!.fill();
    }

    function field(x: number, y: number, rows: string[]) {
      poly([iso(x + 0.06, y + 0.06), iso(x + 0.94, y + 0.06), iso(x + 0.94, y + 0.94), iso(x + 0.06, y + 0.94)], C.crops[(x + y) % 3]);
      for (let i = 1; i < 6; i++) {
        const v = y + 0.06 + (0.88 * i) / 6;
        const a = iso(x + 0.1, v), b = iso(x + 0.9, v);
        g!.strokeStyle = rows[i % rows.length]; g!.lineWidth = 1.6 * scale;
        g!.beginPath(); g!.moveTo(a[0], a[1]); g!.lineTo(b[0], b[1]); g!.stroke();
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
            g!.strokeStyle = "#64748B"; g!.lineWidth = 1.2 * scale; g!.beginPath(); g!.moveTo(ax, ay); g!.lineTo(ax, ay - 10 * scale); g!.stroke();
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

    function frame(t: number) {
      g!.clearRect(0, 0, W, H);

      // Socle (diorama)
      poly([iso(x0, y1 + 1), iso(x1 + 1, y1 + 1), [iso(x1 + 1, y1 + 1)[0], iso(x1 + 1, y1 + 1)[1] + SLAB * scale], [iso(x0, y1 + 1)[0], iso(x0, y1 + 1)[1] + SLAB * scale]], C.soilL);
      poly([iso(x1 + 1, y0), iso(x1 + 1, y1 + 1), [iso(x1 + 1, y1 + 1)[0], iso(x1 + 1, y1 + 1)[1] + SLAB * scale], [iso(x1 + 1, y0)[0], iso(x1 + 1, y0)[1] + SLAB * scale]], C.soilR);
      const edgeL = iso(x0, y1 + 1), edgeC = iso(x1 + 1, y1 + 1), edgeR = iso(x1 + 1, y0);
      poly([edgeL, edgeC, [edgeC[0], edgeC[1] + 4 * scale], [edgeL[0], edgeL[1] + 4 * scale]], C.grassEdge);
      poly([edgeC, edgeR, [edgeR[0], edgeR[1] + 4 * scale], [edgeC[0], edgeC[1] + 4 * scale]], "#76AD5C");

      // Sol : herbe et routes
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const q: Pt[] = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
          if (isRoad(x, y)) {
            poly(q, C.road);
            const rx = x % 4 === 0, ry = y % 4 === 0;
            if (rx !== ry) {
              const a = rx ? iso(x + 0.5, y + 0.2) : iso(x + 0.2, y + 0.5);
              const b = rx ? iso(x + 0.5, y + 0.8) : iso(x + 0.8, y + 0.5);
              g!.strokeStyle = C.roadLine; g!.lineWidth = 1 * scale; g!.setLineDash([3 * scale, 4 * scale]);
              g!.beginPath(); g!.moveTo(a[0], a[1]); g!.lineTo(b[0], b[1]); g!.stroke(); g!.setLineDash([]);
            }
          } else {
            poly(q, C.grass[(x + y) % 2]);
            const p = byTile.get(`${x},${y}`);
            if (p && BUILDING_BY_ID[p.id]?.category !== "agriculture") {
              poly([iso(x + 0.04, y + 0.04), iso(x + 0.96, y + 0.04), iso(x + 0.96, y + 0.96), iso(x + 0.04, y + 0.96)], C.sidewalk);
            }
          }
          const m = modeRef.current, hv = hoverRef.current;
          const free = isBuildable(x, y) && !byTile.has(`${x},${y}`);
          if (m && free) poly(q, "rgba(16,185,129,.10)");
          if (hv && hv.x === x && hv.y === y) {
            if (m) poly(q, free || (m.kind === "move" && m.from.x === x && m.from.y === y) ? "rgba(16,185,129,.45)" : "rgba(239,68,68,.35)");
            else if (byTile.has(`${x},${y}`)) poly(q, "rgba(37,99,235,.22)");
          }
        }
      }

      // Carreau sélectionné / bâtiment en cours de déplacement
      const sel = modeRef.current?.kind === "move" ? modeRef.current.from : selectedRef.current;
      if (sel) {
        const q: Pt[] = [iso(sel.x, sel.y), iso(sel.x + 1, sel.y), iso(sel.x + 1, sel.y + 1), iso(sel.x, sel.y + 1)];
        g!.beginPath(); g!.moveTo(q[0][0], q[0][1]); q.slice(1).forEach((pt) => g!.lineTo(pt[0], pt[1])); g!.closePath();
        g!.lineWidth = 2.5 * scale; g!.strokeStyle = modeRef.current?.kind === "move" ? "#F59E0B" : "#2563EB"; g!.stroke();
      }

      // Objets triés par profondeur
      const items: Item[] = [];
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          if (isRoad(x, y)) continue;
          const p = byTile.get(`${x},${y}`);
          if (p) {
            const b = births.current.get(keyOf(p));
            const grow = b === undefined || reduce ? 1 : Math.min(1, (t - b) / 700);
            const eased = 1 - Math.pow(1 - grow, 3);
            const moving = modeRef.current?.kind === "move" && modeRef.current.from.x === x && modeRef.current.from.y === y;
            items.push({ depth: x + y + 0.5, draw: (_g, tt) => {
              if (moving) g!.globalAlpha = 0.3;
              building(p, tt, eased);
              g!.globalAlpha = 1;
            } });
          } else if (hash(x, y) < 0.35) {
            const n = hash(y, x) < 0.5 ? 1 : 2;
            for (let i = 0; i < n; i++) {
              const tx = x + 0.25 + hash(x + i, y) * 0.5, ty = y + 0.25 + hash(x, y + i) * 0.5;
              items.push({ depth: tx + ty, draw: () => tree(tx, ty, 0.8 + hash(x * i + 1, y) * 0.4) });
            }
          }
        }
      }
      for (const car of cars) {
        if (!car.line) break;
        const len = (car.line.axis === "x" ? y1 - y0 + 1 : x1 - x0 + 1);
        let u = ((reduce ? 0 : t) * car.speed + car.off) % 1;
        if (car.dir < 0) u = 1 - u;
        const pos = (car.line.axis === "x" ? y0 : x0) + u * len;
        const lane = car.dir > 0 ? 0.32 : 0.68;
        const cx = car.line.axis === "x" ? car.line.k + lane : pos;
        const cy = car.line.axis === "x" ? pos : car.line.k + lane;
        items.push({ depth: cx + cy, draw: () => {
          const w = 0.12, l = 0.26;
          if (car.line.axis === "x") block(cx - w / 2, cy - l / 2, cx + w / 2, cy + l / 2, 0, 5, car.color, car.color, "rgba(15,23,42,.35)");
          else block(cx - l / 2, cy - w / 2, cx + l / 2, cy + w / 2, 0, 5, car.color, car.color, "rgba(15,23,42,.35)");
        } });
      }
      // Aperçu du bâtiment à placer
      const m = modeRef.current, hv = hoverRef.current;
      if (m && hv && isBuildable(hv.x, hv.y) && !byTile.has(`${hv.x},${hv.y}`)) {
        items.push({ depth: hv.x + hv.y + 0.5, draw: (_g, tt) => {
          g!.globalAlpha = 0.6;
          building({ id: m.id, x: hv.x, y: hv.y }, tt, 1);
          g!.globalAlpha = 1;
        } });
      }
      items.sort((a, b) => a.depth - b.depth);
      for (const it of items) it.draw(g!, t);
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

    // Survol (identifier un bâtiment) et glisser (déplacer la vue)
    let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, px: view.current.px, py: view.current.py, moved: false };
      cv.setPointerCapture(e.pointerId);
    };
    const tileAt = (e: PointerEvent, r: DOMRect) => {
      const mx = e.clientX - r.left - ox, my = e.clientY - r.top - oy;
      const a = mx / (TW / 2 * scale), b = my / (TH / 2 * scale);
      return { tx: Math.floor((a + b) / 2), ty: Math.floor((b - a) / 2) };
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = drag && !drag.moved;
      drag = null;
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
      if (wasClick && clickRef.current) {
        const { tx, ty } = tileAt(e, cv.getBoundingClientRect());
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) clickRef.current(tx, ty);
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.moved) {
          view.current.px = drag.px + dx; view.current.py = drag.py + dy;
          setTip(null); redraw.current();
          return;
        }
      }
      const { tx, ty } = tileAt(e, r);
      const p = byTile.get(`${tx},${ty}`);
      hoverRef.current = { x: tx, y: ty };
      setTip(p && !modeRef.current ? { left: e.clientX - r.left, top: e.clientY - r.top, text: BUILDING_BY_ID[p.id]?.name ?? p.id } : null);
      if (!raf) frame(performance.now());
    };
    const onLeave = () => { hoverRef.current = null; setTip(null); if (!raf) frame(performance.now()); };
    if (!compact) {
      cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointerup", onUp);
      cv.addEventListener("pointermove", onMove); cv.addEventListener("pointerleave", onLeave);
    }

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", run);
      cv.removeEventListener("pointermove", onMove); cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointerup", onUp);
    };
  }, [plots, height, compact, interactive]);

  return (
    <div ref={wrap} className="relative w-full rounded-[12px] overflow-hidden" style={{ height, background: "linear-gradient(180deg,#EAF2FB 0%,#F5F7FA 100%)" }}>
      <canvas ref={canvas} role="img" className={compact ? "" : `${mode ? "cursor-crosshair" : interactive ? "cursor-pointer" : "cursor-grab"} active:cursor-grabbing touch-none`} aria-label={`Vue isométrique de la ville : ${plots.length} bâtiments`} />
      {!compact && (
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-[10px] border border-line bg-card shadow-sm">
          {ZOOM_BUTTONS.map((b) => (
            <button key={b.kind} type="button" aria-label={b.label} title={b.label}
              onClick={() => onZoom(b.kind)}
              className="h-8 w-8 grid place-items-center text-[16px] font-semibold text-ink hover:bg-slate-50 border-b border-line last:border-b-0">{b.text}</button>
          ))}
        </div>
      )}
      {tip && (
        <div className="pointer-events-none absolute z-10 rounded-[8px] bg-navy text-white text-[12px] font-medium px-2.5 py-1 shadow-lg -translate-x-1/2"
          style={{ left: tip.left, top: tip.top - 34 }}>{tip.text}</div>
      )}
    </div>
  );
}
