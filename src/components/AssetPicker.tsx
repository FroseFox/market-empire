"use client";
// Fenêtre de recherche d'actions : taper un nom, un symbole ou un secteur, puis cliquer.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Search, X } from "lucide-react";
import { ASSETS } from "@/lib/market/universe";
import { useGame } from "@/store/game";
import CompanyLogo from "@/components/CompanyLogo";
import { Delta } from "@/components/ui";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function AssetPicker({ selected, onAdd, onClose, title = "Ajouter une action" }: {
  selected: string[]; onAdd: (symbol: string) => void; onClose: () => void; title?: string;
}) {
  const quotes = useGame((s) => s.quotes);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const n = norm(q.trim());
    return ASSETS.filter((a) => !n || norm(`${a.symbol} ${a.name} ${a.sector}`).includes(n));
  }, [q]);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sectors = [...new Set(ASSETS.map((a) => a.sector))];

  // Rendu directement dans <body> : la fenêtre couvre toute la page
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-start sm:place-items-center bg-navy/40 px-4 pt-16 sm:pt-0" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-lg overflow-hidden appear shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search size={18} className="text-muted" />
          <label htmlFor="asset-search" className="sr-only">Rechercher une action</label>
          <input id="asset-search" ref={input} value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
              if (e.key === "Enter" && results[cursor] && !selected.includes(results[cursor].symbol)) onAdd(results[cursor].symbol);
            }}
            placeholder="Nom, symbole ou secteur (ex. Apple, NVDA, Énergie)" className="flex-1 bg-transparent outline-none text-[15px]" />
          <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-[8px] text-muted hover:bg-slate-100"><X size={18} /></button>
        </div>
        {!q && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {sectors.map((s) => <button key={s} onClick={() => setQ(s)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200">{s}</button>)}
          </div>
        )}
        <ul className="max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="text-center text-[13px] text-muted py-8">Aucune action ne correspond à « {q} ».</li>}
          {results.map((a, i) => {
            const inFolder = selected.includes(a.symbol);
            const qt = quotes[a.symbol];
            return (
              <li key={a.symbol}>
                <button disabled={inFolder} onClick={() => onAdd(a.symbol)} onMouseEnter={() => setCursor(i)}
                  className={`w-full flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left ${i === cursor ? "bg-slate-50" : ""} disabled:opacity-60`}>
                  <CompanyLogo symbol={a.symbol} size={34} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[14px] truncate">{a.name}</span>
                    <span className="block text-[11px] text-muted">{a.symbol} · {a.sector}</span>
                  </span>
                  {qt && <Delta value={qt.change} />}
                  {inFolder
                    ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success"><Check size={14} />Ajoutée</span>
                    : <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary"><Plus size={14} />Ajouter</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line px-4 py-2.5 text-[11px] text-muted flex justify-between">
          <span>{results.length} action{results.length > 1 ? "s" : ""}</span>
          <span>Entrée pour ajouter · Échap pour fermer</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
