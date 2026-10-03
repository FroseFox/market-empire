"use client";
// Vue de la ville en 3D (three.js) : mêmes propriétés et mêmes commandes que l'ancienne vue isométrique.
// La bibliothèque 3D n'est chargée qu'ici, au moment où une ville s'affiche. Si la 3D ne peut pas démarrer
// (WebGL absent ou perdu), l'ancienne vue dessinée (IsoCity) prend le relais : le jeu reste jouable partout.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Layers, Moon, Sun } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/game/config";
import { MAP_SIZE, type Plot } from "@/lib/game/layout";
import IsoCity, { CAT_COLOR, LEGEND, readLight, setLight, subLight, ZOOM_BUTTONS, type CityMarker, type CityMode, type CitySign, type Light, type ZoomKind } from "@/components/IsoCity";
import type { CityEngine, CityTip } from "@/lib/city3d/engine";

interface Props {
  plots: Plot[];
  /** Hauteur en pixels, ou "fill" pour occuper tout le parent (vue plein écran). */
  height?: number | "fill"; compact?: boolean;
  markers?: CityMarker[]; mapSize?: number; signs?: Record<string, CitySign>;
  selectedTone?: "primary" | "danger"; padTop?: number; padBottom?: number; zoomClass?: string; hint?: boolean;
  initialZoom?: number; mode?: CityMode | null; selected?: { x: number; y: number } | null;
  onTileClick?: (x: number, y: number) => void;
}

export default function City3D(props: Props) {
  const { plots, height = 440, compact = false, mode = null, selected = null, onTileClick, initialZoom = 1, markers, signs, mapSize = MAP_SIZE, selectedTone = "primary", padTop = 0, padBottom = 0, zoomClass = "right-3 top-3", hint = true } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const engine = useRef<CityEngine | null>(null);
  const clickRef = useRef<typeof onTileClick>(undefined);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<CityTip | null>(null);
  const [layers, setLayers] = useState(false);
  const light = useSyncExternalStore(subLight, readLight, () => "auto" as Light);
  const interactive = !!onTileClick;

  useEffect(() => { clickRef.current = onTileClick; });

  // Démarrage du moteur 3D (une seule fois par vue)
  useEffect(() => {
    const box = wrap.current, cv = canvas.current, ov = overlay.current;
    if (!box || !cv || !ov) return;
    let cancelled = false, made: CityEngine | null = null;
    import("@/lib/city3d/engine").then(({ CityEngine }) => {
      if (cancelled) return;
      made = new CityEngine(box, cv, ov, { tip: setTip, click: (x, y) => clickRef.current?.(x, y), lost: () => setFailed(true) });
      engine.current = made; setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; made?.dispose(); engine.current = null; };
  }, []);

  // Plan de la ville et cadrage
  useEffect(() => {
    if (!ready) return;
    engine.current?.setCity(plots, mapSize, { height, compact, interactive, initialZoom, padTop, padBottom });
  }, [ready, plots, mapSize, height, compact, interactive, initialZoom, padTop, padBottom]);

  // Sélection, mode, indicateurs, calque, éclairage
  useEffect(() => {
    if (!ready) return;
    engine.current?.setLive({ mode, selected, tone: selectedTone, markers: markers ?? [], signs: signs ?? {}, layers, light });
  }, [ready, mode, selected, selectedTone, markers, signs, layers, light, plots]);

  if (failed) return <IsoCity {...props} />;

  function onZoom(kind: ZoomKind) {
    if (kind === "in") engine.current?.zoomAt(1.35);
    else if (kind === "out") engine.current?.zoomAt(1 / 1.35);
    else engine.current?.reset();
  }
  function onKey(e: React.KeyboardEvent) {
    const c = engine.current;
    if (!c) return;
    const k: Record<string, () => void> = {
      "+": () => c.zoomAt(1.35), "=": () => c.zoomAt(1.35), "-": () => c.zoomAt(1 / 1.35), "0": () => c.reset(),
      ArrowLeft: () => c.panBy(80, 0), ArrowRight: () => c.panBy(-80, 0), ArrowUp: () => c.panBy(0, 80), ArrowDown: () => c.panBy(0, -80),
    };
    if (k[e.key]) { e.preventDefault(); k[e.key](); }
  }
  const auto = light === "auto";

  return (
    <div ref={wrap} className={`relative w-full overflow-hidden outline-none ${height === "fill" ? "" : "rounded-[12px] focus-visible:ring-2 focus-visible:ring-primary"}`}
      style={{ height: height === "fill" ? "100%" : height, background: "#69B34C" }}
      tabIndex={compact ? undefined : 0} onKeyDown={compact ? undefined : onKey}>
      <canvas ref={canvas} role="img" className={compact ? "block" : `block ${mode ? "cursor-crosshair" : interactive ? "cursor-pointer" : "cursor-grab"} active:cursor-grabbing touch-none`} aria-label={`Vue de la ville en 3D : ${plots.length} bâtiments`} />
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />
      {!compact && (
        <div className={`absolute z-10 flex flex-col overflow-hidden rounded-[10px] border border-line bg-card shadow-sm ${zoomClass}`}>
          {ZOOM_BUTTONS.map((b) => (
            <button key={b.kind} type="button" aria-label={b.label} title={b.label}
              onClick={() => onZoom(b.kind)}
              className="h-9 w-9 grid place-items-center text-[17px] font-semibold text-ink hover:bg-slate-50 border-b border-line">{b.text}</button>
          ))}
          <button type="button" aria-pressed={layers} onClick={() => setLayers((v) => !v)}
            aria-label="Calque Quartiers" title="Calque Quartiers : colorer les bâtiments par catégorie"
            className={`h-9 w-9 grid place-items-center border-b border-line ${layers ? "bg-primary text-white" : "text-ink hover:bg-slate-50"}`}><Layers size={16} /></button>
          <button type="button" onClick={() => setLight(auto ? "day" : "auto")}
            aria-label={auto ? "Garder la ville en plein jour" : "Suivre l'heure réelle (nuit le soir)"}
            title={auto ? "Éclairage : suit l'heure réelle. Cliquer pour rester en plein jour." : "Éclairage : plein jour. Cliquer pour suivre l'heure réelle."}
            className="h-9 w-9 grid place-items-center text-ink hover:bg-slate-50">{auto ? <Moon size={16} /> : <Sun size={16} />}</button>
        </div>
      )}
      {!compact && layers && (
        <div className="pointer-events-none absolute inset-x-3 z-10 flex justify-center" style={{ top: padTop + 8 }}>
          <ul className="flex max-w-full flex-wrap justify-center gap-x-3 gap-y-1 rounded-[12px] border border-line bg-card/95 px-3 py-1.5 text-[11px] font-medium text-ink shadow-sm backdrop-blur">
            {LEGEND.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CAT_COLOR[c] }} />{CATEGORY_LABELS[c]}</li>
            ))}
          </ul>
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
