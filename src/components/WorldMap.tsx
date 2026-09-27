"use client";
// Vraie carte du monde (Natural Earth 1:110m), projection Equal Earth.
import { useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoGraticule10, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { HUBS, PLAYABLE } from "@/lib/world/countries";

export const MAP_W = 960, MAP_H = 470;
type Country = Feature<Geometry, { name: string }> & { id: string };

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features
  .filter((f) => f.id !== "010") as Country[]; // sans l'Antarctique

const projection = geoEqualEarth().fitExtent([[8, 8], [MAP_W - 8, MAP_H - 8]], { type: "FeatureCollection", features: COUNTRIES });
const path = geoPath(projection);
const SHAPES = COUNTRIES.map((c) => ({ id: String(c.id), name: PLAYABLE[String(c.id)] ?? c.properties.name, d: path(c) ?? "", centroid: path.centroid(c) }));
const GRATICULE = path(geoGraticule10()) ?? "";
const HUB_POINTS = HUBS.map((h) => ({ ...h, xy: projection(h.coords) ?? [0, 0] }));

export const countryName = (id: string) => PLAYABLE[id] ?? SHAPES.find((s) => s.id === id)?.name ?? "—";
export const countryCentroid = (id: string) => SHAPES.find((s) => s.id === id)?.centroid ?? [MAP_W / 2, MAP_H / 2];

export interface MapOwner { country: string; cityName: string; isMe: boolean; population: number }

const C = {
  ocean: "#CFE1F4", graticule: "#FFFFFF",
  free: "#EEF1F5", playable: "#E1E7EF", edge: "#B8C5D5",
  player: "#A9B8CB", me: "#2563EB", meEdge: "#1D4ED8",
  hover: "#D5DFEA", select: "#0F172A",
};

export default function WorldMap({ owners, selected, onSelect }: { owners: MapOwner[]; selected: string | null; onSelect: (id: string) => void }) {
  const byCountry = useMemo(() => new Map(owners.map((o) => [o.country, o])), [owners]);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null);

  const zoom = (f: number) => setView((v) => {
    const k = Math.max(1, Math.min(8, v.k * f));
    const cx = (MAP_W / 2 - v.x) / v.k, cy = (MAP_H / 2 - v.y) / v.k;
    return k === 1 ? { k: 1, x: 0, y: 0 } : { k, x: MAP_W / 2 - cx * k, y: MAP_H / 2 - cy * k };
  });

  const toSvg = (dx: number) => {
    const w = box.current?.clientWidth ?? MAP_W;
    return (dx * MAP_W) / w;
  };

  const fill = (id: string) => {
    const o = byCountry.get(id);
    if (o?.isMe) return C.me;
    if (o) return C.player;
    return PLAYABLE[id] ? C.playable : C.free;
  };

  return (
    <div ref={box} className="relative rounded-[12px] overflow-hidden select-none" style={{ background: `linear-gradient(180deg, #DDEBF8 0%, ${C.ocean} 100%)` }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block w-full h-auto touch-none cursor-grab active:cursor-grabbing" role="img" aria-label="Carte du monde"
        onPointerDown={(e) => { drag.current = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, moved: false }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
            if (d.moved && view.k > 1) setView((v) => ({ ...v, x: d.x + toSvg(dx), y: d.y + toSvg(dy) }));
          }
        }}
        onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
        onPointerLeave={() => setHover(null)}>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <path d={GRATICULE} fill="none" stroke={C.graticule} strokeOpacity={0.7} strokeWidth={0.6 / view.k} />
          {SHAPES.map((s) => {
            const isSel = s.id === selected;
            return (
              <path key={s.id} d={s.d} fill={hover?.id === s.id && !byCountry.get(s.id)?.isMe ? C.hover : fill(s.id)}
                stroke={isSel ? C.select : byCountry.get(s.id)?.isMe ? C.meEdge : C.edge} strokeWidth={(isSel ? 1.6 : 0.6) / view.k}
                className="cursor-pointer transition-[fill] duration-150"
                onPointerMove={(e) => {
                  const r = box.current!.getBoundingClientRect();
                  setHover({ id: s.id, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onClick={() => { if (!drag.current?.moved) onSelect(s.id); }} />
            );
          })}
          {/* Places financières neutres */}
          {HUB_POINTS.map((h) => (
            <g key={h.name} transform={`translate(${h.xy[0]},${h.xy[1]}) scale(${1 / view.k})`} pointerEvents="none">
              <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" fill="#FFFFFF" stroke="#64748B" strokeWidth={1.6} />
              <text y={-9} textAnchor="middle" fontSize={10} fontWeight={600} fill="#334155" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke" fontFamily="Montserrat, sans-serif">{h.name}</text>
            </g>
          ))}
          {/* Villes des joueurs */}
          {owners.map((o) => {
            const [x, y] = countryCentroid(o.country);
            return (
              <g key={o.country} transform={`translate(${x},${y}) scale(${1 / view.k})`} pointerEvents="none">
                <circle r={o.isMe ? 6 : 5} fill="#FFFFFF" stroke={o.isMe ? C.meEdge : "#475569"} strokeWidth={o.isMe ? 3 : 2} />
                <text y={18} textAnchor="middle" fontSize={11} fontWeight={700} fill={o.isMe ? "#1D4ED8" : "#0F172A"} stroke="#FFFFFF" strokeWidth={3.5} paintOrder="stroke" fontFamily="Montserrat, sans-serif">{o.cityName}</text>
              </g>
            );
          })}
        </g>
      </svg>

      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-[8px] bg-navy text-white text-[12px] font-medium px-2.5 py-1 shadow-lg -translate-x-1/2"
          style={{ left: hover.x, top: hover.y - 36 }}>
          {countryName(hover.id)}{byCountry.get(hover.id) ? ` · ${byCountry.get(hover.id)!.cityName}` : ""}
        </div>
      )}

      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-[10px] border border-line bg-card shadow-sm">
        <button type="button" aria-label="Zoomer" onClick={() => zoom(1.5)} className="h-8 w-8 grid place-items-center text-[16px] font-semibold hover:bg-slate-50 border-b border-line">+</button>
        <button type="button" aria-label="Dézoomer" onClick={() => zoom(1 / 1.5)} className="h-8 w-8 grid place-items-center text-[16px] font-semibold hover:bg-slate-50 border-b border-line">−</button>
        <button type="button" aria-label="Vue entière" onClick={() => setView({ k: 1, x: 0, y: 0 })} className="h-8 w-8 grid place-items-center text-[14px] hover:bg-slate-50">⟲</button>
      </div>
    </div>
  );
}
