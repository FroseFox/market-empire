"use client";
// Vraie carte du monde (Natural Earth 1:110m), projection Equal Earth.
// Navigation : molette ou pincement pour zoomer vers le curseur, glisser pour se déplacer,
// double-clic pour zoomer, flèches et + / − au clavier, bouton « Mon pays ».
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoGraticule10, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { Crosshair, Maximize2, Minus, Plus } from "lucide-react";
import { HUBS, PLAYABLE } from "@/lib/world/countries";

export const MAP_W = 960, MAP_H = 470;
type Country = Feature<Geometry, { name: string }> & { id: string };

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features
  .filter((f) => f.id !== "010") as Country[]; // sans l'Antarctique

const projection = geoEqualEarth().fitExtent([[10, 10], [MAP_W - 10, MAP_H - 10]], { type: "FeatureCollection", features: COUNTRIES });
const path = geoPath(projection);
const SHAPES = COUNTRIES.map((c) => ({
  id: String(c.id), name: PLAYABLE[String(c.id)] ?? c.properties.name, d: path(c) ?? "",
  centroid: path.centroid(c), bounds: path.bounds(c),
}));
const SPHERE = path({ type: "Sphere" }) ?? "";
const GRATICULE = path(geoGraticule10()) ?? "";
const LAND = path(merge(topo, topo.objects.countries.geometries.filter((g) => String(g.id) !== "010") as Parameters<typeof merge>[1])) ?? "";
const HUB_POINTS = HUBS.map((h) => ({ ...h, xy: projection(h.coords) ?? [0, 0] }));

export const countryName = (id: string) => PLAYABLE[id] ?? SHAPES.find((s) => s.id === id)?.name ?? "—";
export const countryCentroid = (id: string) => SHAPES.find((s) => s.id === id)?.centroid ?? [MAP_W / 2, MAP_H / 2];

export interface MapOwner { country: string; cityName: string; isMe: boolean; population: number; name?: string }

const C = {
  land: "#E7ECF2", playable: "#FBFCFE", edge: "#B6C4D6", other: "#C9D5E3",
  me: "#2563EB", meEdge: "#1D4ED8", select: "#0F172A",
};
const MIN_K = 1, MAX_K = 12;

type View = { k: number; x: number; y: number };
const clampView = (v: View): View => {
  const k = Math.max(MIN_K, Math.min(MAX_K, v.k));
  return { k, x: Math.min(0, Math.max(MAP_W - MAP_W * k, v.x)), y: Math.min(0, Math.max(MAP_H - MAP_H * k, v.y)) };
};

/** Teinte pastel stable pour le territoire d'un autre joueur. */
function tint(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${(h * 7) % 360} 45% 80%)`;
}

/** Couche des pays : ne dépend pas du zoom (traits non mis à l'échelle), donc rarement redessinée. */
const Countries = memo(function Countries({ owners, selected, onEnter, onSelect }: {
  owners: Map<string, MapOwner>; selected: string | null;
  onEnter: (id: string | null) => void; onSelect: (id: string) => void;
}) {
  return (
    <g>
      {SHAPES.map((s) => {
        const o = owners.get(s.id);
        const fill = o?.isMe ? "url(#me-fill)" : o ? tint(s.id) : PLAYABLE[s.id] ? C.playable : C.land;
        return (
          <path key={s.id} d={s.d} fill={fill} data-id={s.id}
            stroke={o?.isMe ? C.meEdge : C.edge} strokeWidth={o?.isMe ? 1.2 : 0.6} vectorEffect="non-scaling-stroke"
            className="country cursor-pointer" onPointerEnter={() => onEnter(s.id)} onClick={() => onSelect(s.id)} />
        );
      })}
      {selected && (() => {
        const s = SHAPES.find((x) => x.id === selected);
        return s ? <path d={s.d} fill="none" stroke={C.select} strokeWidth={2.2} vectorEffect="non-scaling-stroke" pointerEvents="none" strokeLinejoin="round" /> : null;
      })()}
    </g>
  );
});

export default function WorldMap({ owners, selected, onSelect, focus }: {
  owners: MapOwner[]; selected: string | null; onSelect: (id: string) => void;
  /** Pays sur lequel le bouton « Mon pays » recentre la carte. */
  focus?: string | null;
}) {
  const byCountry = useMemo(() => new Map(owners.map((o) => [o.country, o])), [owners]);
  const [view, setViewState] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const svg = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const anim = useRef(0);
  const moved = useRef(false);
  const downAt = useRef({ x: 0, y: 0 });

  const setView = useCallback((v: View) => { const c = clampView(v); viewRef.current = c; setViewState(c); }, []);

  /** Transition douce vers une vue (désactivée si l'utilisateur préfère moins d'animations). */
  const animateTo = useCallback((target: View) => {
    cancelAnimationFrame(anim.current);
    const to = clampView(target), from = viewRef.current;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setView(to); return; }
    const t0 = performance.now(), D = 380;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
      setView({ k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [setView]);

  /** Coordonnées de la carte (0..960 × 0..470) sous un point de l'écran. */
  const toMap = (clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { mx: ((clientX - r.left) / r.width) * MAP_W, my: ((clientY - r.top) / r.height) * MAP_H };
  };
  const zoomAt = useCallback((factor: number, mx: number, my: number, smooth = false) => {
    const v = viewRef.current;
    const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
    const wx = (mx - v.x) / v.k, wy = (my - v.y) / v.k;
    const next = { k, x: mx - wx * k, y: my - wy * k };
    if (smooth) animateTo(next); else { cancelAnimationFrame(anim.current); setView(next); }
  }, [animateTo, setView]);

  const focusCountry = useCallback((id: string) => {
    const s = SHAPES.find((x) => x.id === id);
    if (!s) return;
    const [[x0, y0], [x1, y1]] = s.bounds;
    const k = Math.max(1.5, Math.min(7, 0.55 * Math.min(MAP_W / (x1 - x0 || 1), MAP_H / (y1 - y0 || 1))));
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    animateTo({ k, x: MAP_W / 2 - cx * k, y: MAP_H / 2 - cy * k });
  }, [animateTo]);

  // Molette (écouteur non passif pour empêcher le défilement de la page)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { mx, my } = toMap(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), mx, my);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Glisser (1 doigt / souris) et pincer (2 doigts)
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; dist: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(anim.current);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) { moved.current = false; downAt.current = { x: e.clientX, y: e.clientY }; }
    gesture.current = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // Infobulle : suit la souris sans redessiner la carte
    const tip = tipRef.current, box = svg.current?.parentElement;
    if (tip && box) { const r = box.getBoundingClientRect(); tip.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top - 38}px) translateX(-50%)`; }
    const pts = pointers.current;
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId)!;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      // Petit mouvement : c'est encore un clic
      if (!moved.current && Math.abs(e.clientX - downAt.current.x) + Math.abs(e.clientY - downAt.current.y) < 5) return;
      if (!moved.current) { moved.current = true; svg.current?.setPointerCapture(e.pointerId); }
      const r = svg.current!.getBoundingClientRect();
      const v = viewRef.current;
      setView({ ...v, x: v.x + (dx * MAP_W) / r.width, y: v.y + (dy * MAP_H) / r.height });
    } else if (pts.size === 2) {
      moved.current = true;
      const [a, b] = [...pts.values()];
      const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2), dist = Math.hypot(a.x - b.x, a.y - b.y);
      const g = gesture.current;
      if (g) {
        const v = viewRef.current;
        const panned = { ...v, x: v.x + (mid.mx - g.x), y: v.y + (mid.my - g.y) };
        viewRef.current = panned;
        zoomAt(dist / (g.dist || dist), mid.mx, mid.my);
      }
      gesture.current = { x: mid.mx, y: mid.my, dist };
    }
  };
  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  const select = useCallback((id: string) => { if (!moved.current) onSelect(id); }, [onSelect]);

  // Clavier
  const onKey = (e: React.KeyboardEvent) => {
    const v = viewRef.current, step = 60;
    const keys: Record<string, () => void> = {
      "+": () => zoomAt(1.5, MAP_W / 2, MAP_H / 2, true), "=": () => zoomAt(1.5, MAP_W / 2, MAP_H / 2, true),
      "-": () => zoomAt(1 / 1.5, MAP_W / 2, MAP_H / 2, true), "0": () => animateTo({ k: 1, x: 0, y: 0 }),
      ArrowLeft: () => animateTo({ ...v, x: v.x + step }), ArrowRight: () => animateTo({ ...v, x: v.x - step }),
      ArrowUp: () => animateTo({ ...v, y: v.y + step }), ArrowDown: () => animateTo({ ...v, y: v.y - step }),
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  };

  const hovered = hoverId ? byCountry.get(hoverId) : undefined;
  const { k } = view;
  // Noms des pays jouables quand on est assez près
  const labels = k >= 2.2 ? SHAPES.filter((s) => PLAYABLE[s.id] && !byCountry.has(s.id) && (s.bounds[1][0] - s.bounds[0][0]) * k > 70) : [];

  return (
    <div className="relative rounded-[14px] overflow-hidden select-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ background: "radial-gradient(ellipse at 50% 35%, #F4F8FC 0%, #E6EDF5 100%)" }}
      tabIndex={0} onKeyDown={onKey} aria-label="Carte du monde interactive. Flèches pour se déplacer, plus et moins pour zoomer.">
      <svg ref={svg} viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block w-full h-auto touch-none cursor-grab active:cursor-grabbing" role="img" aria-label="Carte du monde"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer}
        onPointerLeave={() => setHoverId(null)}
        onDoubleClick={(e) => { const { mx, my } = toMap(e.clientX, e.clientY); zoomAt(2, mx, my, true); }}>
        <defs>
          <radialGradient id="ocean" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#D8E9FA" />
            <stop offset="100%" stopColor="#AFCDEB" />
          </radialGradient>
          <linearGradient id="me-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <clipPath id="sphere-clip"><path d={SPHERE} /></clipPath>
        </defs>
        <style>{`.country{transition:filter .15s}.country:hover{filter:brightness(.94) saturate(1.2)}`}</style>

        <g transform={`translate(${view.x},${view.y}) scale(${k})`}>
          {/* Océan, méridiens, ombre des continents */}
          <path d={SPHERE} fill="url(#ocean)" />
          <g clipPath="url(#sphere-clip)">
            <path d={GRATICULE} fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          </g>
          <path d={LAND} fill="rgba(15,23,42,.16)" transform="translate(0.8,1.4)" />
          <Countries owners={byCountry} selected={selected} onEnter={setHoverId} onSelect={select} />
          <path d={SPHERE} fill="none" stroke="#9DB7D3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </g>

        {/* Repères (taille fixe, quel que soit le zoom) */}
        <g pointerEvents="none" fontFamily="Montserrat, sans-serif">
          {labels.map((s) => (
            <text key={s.id} x={s.centroid[0] * k + view.x} y={s.centroid[1] * k + view.y + 22} textAnchor="middle" fontSize={9.5}
              fontWeight={600} fill="#64748B" letterSpacing=".04em" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">
              {s.name.toUpperCase()}
            </text>
          ))}
          {HUB_POINTS.map((h) => {
            const x = h.xy[0] * k + view.x, y = h.xy[1] * k + view.y;
            return (
              <g key={h.name} transform={`translate(${x},${y})`}>
                <rect x={-5} y={-5} width={10} height={10} rx={1.5} transform="rotate(45)" fill="#F59E0B" stroke="#FFFFFF" strokeWidth={2} />
                {k >= 1.6 && <text y={-10} textAnchor="middle" fontSize={10} fontWeight={700} fill="#92400E" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">{h.name}</text>}
              </g>
            );
          })}
          {owners.map((o) => {
            const [cx, cy] = countryCentroid(o.country);
            const x = cx * k + view.x, y = cy * k + view.y;
            return (
              <g key={o.country} transform={`translate(${x},${y})`}>
                {o.isMe && <circle r={9} fill="none" stroke="#2563EB" strokeWidth={2} className="animate-ping motion-reduce:hidden" style={{ transformOrigin: "center", transformBox: "fill-box", animationDuration: "2.2s" }} />}
                <path d="M0 0 C-7 -9 -8 -13 -8 -16 A8 8 0 1 1 8 -16 C8 -13 7 -9 0 0Z" fill={o.isMe ? "#2563EB" : "#334155"} stroke="#FFFFFF" strokeWidth={1.8} />
                <circle cy={-16} r={3.2} fill="#FFFFFF" />
                {(o.isMe || k >= 1.8) && (
                  <text y={14} textAnchor="middle" fontSize={11} fontWeight={700} fill={o.isMe ? "#1D4ED8" : "#0F172A"} stroke="#FFFFFF" strokeWidth={3.5} paintOrder="stroke">{o.cityName}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Infobulle */}
      <div ref={tipRef} className={`pointer-events-none absolute left-0 top-0 z-10 rounded-[10px] bg-navy text-white px-3 py-1.5 shadow-lg transition-opacity ${hoverId ? "opacity-100" : "opacity-0"}`}>
        {hoverId && (
          <>
            <div className="text-[12px] font-semibold whitespace-nowrap">{countryName(hoverId)}</div>
            <div className="text-[11px] text-slate-300 whitespace-nowrap">
              {hovered ? `${hovered.isMe ? "Votre ville" : hovered.name || "Joueur"} · ${hovered.cityName}` : PLAYABLE[hoverId] ? "Pays libre" : "Non jouable"}
            </div>
          </>
        )}
      </div>

      {/* Commandes */}
      <div className="absolute right-3 top-3 flex flex-col gap-2">
        <div className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-card/95 backdrop-blur shadow-sm">
          <MapButton label="Zoomer" onClick={() => zoomAt(1.6, MAP_W / 2, MAP_H / 2, true)}><Plus size={16} /></MapButton>
          <MapButton label="Dézoomer" onClick={() => zoomAt(1 / 1.6, MAP_W / 2, MAP_H / 2, true)}><Minus size={16} /></MapButton>
          <MapButton label="Vue entière" onClick={() => animateTo({ k: 1, x: 0, y: 0 })}><Maximize2 size={14} /></MapButton>
        </div>
        {focus && (
          <div className="overflow-hidden rounded-[10px] border border-line bg-card/95 backdrop-blur shadow-sm">
            <MapButton label="Aller à mon pays" onClick={() => { onSelect(focus); focusCountry(focus); }}><Crosshair size={15} className="text-primary" /></MapButton>
          </div>
        )}
      </div>
      <div className="absolute left-3 bottom-3 rounded-full bg-card/90 backdrop-blur border border-line px-2.5 py-1 text-[11px] font-semibold text-muted tabular">
        × {k.toFixed(1).replace(".", ",")}
      </div>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="h-9 w-9 grid place-items-center text-ink hover:bg-slate-50 border-b border-line last:border-b-0">
      {children}
    </button>
  );
}
