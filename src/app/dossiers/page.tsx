"use client";
import { useState } from "react";
import Link from "next/link";
import { Folder as FolderIcon, Plus, Trash2, X } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { folderLimit } from "@/lib/game/engine";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { useNews } from "@/lib/news";
import { Button, Card, Delta, Empty, PageHeader } from "@/components/ui";
import NewsList from "@/components/NewsList";
import CompanyLogo from "@/components/CompanyLogo";
import AssetPicker from "@/components/AssetPicker";
import { eur2, num, qtyFmt } from "@/lib/format";

export default function FoldersPage() {
  const { game, quotes } = useDerived();
  const createFolder = useGame((s) => s.createFolder);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const news = useNews();
  const limit = folderLimit(game);
  const current = game.folders.find((f) => f.id === selected) ?? game.folders[0] ?? null;

  const avgChange = (symbols: string[]) => {
    const vals = symbols.map((s) => quotes[s]?.change).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const newsCount = (symbols: string[]) => news.items.filter((n) => n.symbols.some((s) => symbols.includes(s))).length;

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const id = createFolder(name);
    if (id) { setName(""); setSelected(id); }
  };

  return (
    <>
      <PageHeader icon={FolderIcon} title="Dossiers" subtitle="Regroupez des entreprises pour suivre un thème : IA, énergie, luxe…" />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-4 space-y-3">
          {game.folders.map((f) => {
            const ch = avgChange(f.symbols);
            const nc = newsCount(f.symbols);
            return (
              <button key={f.id} onClick={() => setSelected(f.id)}
                className={`card w-full text-left p-4 transition-colors ${current?.id === f.id ? "border-primary ring-1 ring-primary/30" : "hover:border-slate-300"}`}>
                <div className="flex items-center gap-2">
                  <FolderIcon size={16} className="text-primary" />
                  <span className="font-semibold flex-1 truncate">{f.name}</span>
                  {ch !== null && <Delta value={ch} />}
                </div>
                <div className="text-[12px] text-muted mt-1.5">
                  {f.symbols.length ? f.symbols.map((s) => ASSET_BY_SYMBOL[s]?.name ?? s).join(", ") : "Aucune entreprise"}
                </div>
                <div className="text-[11px] text-muted mt-2">{num(f.symbols.length)} entreprise{f.symbols.length > 1 ? "s" : ""}{nc ? ` · ${nc} actualité${nc > 1 ? "s" : ""}` : ""}</div>
              </button>
            );
          })}
          {game.folders.length < limit ? (
            <form onSubmit={onCreate} className="card p-3 flex gap-2">
              <label htmlFor="new-folder" className="sr-only">Nom du nouveau dossier</label>
              <input id="new-folder" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du dossier (ex. Intelligence artificielle)"
                className="flex-1 min-w-0 rounded-[8px] border border-line px-3 py-2 text-[13px] outline-none focus:border-primary" />
              <Button type="submit" className="!px-3 inline-flex items-center gap-1"><Plus size={15} />Créer</Button>
            </form>
          ) : (
            <p className="text-[12px] text-muted px-1">Limite de {limit} dossiers atteinte. <Link href="/recherche" className="text-primary font-medium">Dossiers illimités →</Link></p>
          )}
        </div>

        <div className="xl:col-span-8">
          {current ? <FolderDetail key={current.id} id={current.id} /> : (
            <Card><Empty>Créez votre premier dossier pour regrouper des entreprises autour d&apos;un thème.</Empty></Card>
          )}
          {current && news.status === "ready" && (
            <Card title="Actualités du dossier" className="mt-4">
              {(() => {
                const items = news.items.filter((n) => n.symbols.some((s) => current.symbols.includes(s)));
                return items.length ? <NewsList items={items.slice(0, 8)} compact /> : <Empty>Aucune actualité récente pour ces entreprises.</Empty>;
              })()}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function FolderDetail({ id }: { id: string }) {
  const { game, quotes } = useDerived();
  const f = game.folders.find((x) => x.id === id)!;
  const updateFolder = useGame((s) => s.updateFolder);
  const deleteFolder = useGame((s) => s.deleteFolder);
  const [notes, setNotes] = useState(f.notes);
  const [title, setTitle] = useState(f.name);
  const [armed, setArmed] = useState(false);
  const [picking, setPicking] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label htmlFor="folder-title" className="sr-only">Nom du dossier</label>
        <input id="folder-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => updateFolder(f.id, { name: title })}
          className="text-[20px] font-semibold flex-1 min-w-0 rounded-[8px] px-2 py-1 -ml-2 outline-none hover:bg-slate-50 focus:bg-slate-50" />
        <button onClick={() => { if (armed) deleteFolder(f.id); else { setArmed(true); setTimeout(() => setArmed(false), 4000); } }}
          className="inline-flex items-center gap-1 text-[12px] text-danger font-medium rounded-[8px] px-2 py-1.5 hover:bg-danger-soft">
          <Trash2 size={14} />{armed ? "Confirmer la suppression" : "Supprimer"}
        </button>
      </div>

      {f.symbols.length === 0 ? <Empty>Ajoutez des entreprises à ce dossier.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-muted text-[12px]"><tr className="border-b border-line">
              <th className="text-left font-medium py-2">Entreprise</th><th className="text-left font-medium hidden sm:table-cell">Secteur</th>
              <th className="text-right font-medium">Prix</th><th className="text-right font-medium">24 h</th><th className="text-right font-medium">Détenu</th><th />
            </tr></thead>
            <tbody>
              {f.symbols.map((s) => {
                const a = ASSET_BY_SYMBOL[s]; const q = quotes[s]; const h = game.holdings[s];
                return (
                  <tr key={s} className="border-b border-line/70">
                    <td className="py-2.5"><div className="flex items-center gap-2.5"><CompanyLogo symbol={s} size={28} /><div><div className="font-semibold">{a?.name ?? s}</div><div className="text-[11px] text-muted">{s}</div></div></div></td>
                    <td className="text-muted hidden sm:table-cell">{a?.sector}</td>
                    <td className="text-right tabular whitespace-nowrap">{q ? eur2(q.price) : "—"}</td>
                    <td className="text-right">{q ? <Delta value={q.change} /> : "—"}</td>
                    <td className="text-right tabular">{h ? qtyFmt(h.qty) : "—"}</td>
                    <td className="text-right pl-2">
                      <button aria-label={`Retirer ${a?.name ?? s}`} onClick={() => updateFolder(f.id, { symbols: f.symbols.filter((x) => x !== s) })} className="p-1 rounded-[6px] text-muted hover:text-danger hover:bg-danger-soft"><X size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setPicking(true)} className="inline-flex items-center gap-1.5"><Plus size={15} />Ajouter une action</Button>
        <Link href="/relations" className="text-[12px] text-primary font-medium hover:underline">Trouver des entreprises liées →</Link>
      </div>

      {picking && <AssetPicker selected={f.symbols} title={`Ajouter à « ${f.name} »`} onClose={() => setPicking(false)}
        onAdd={(sym) => updateFolder(f.id, { symbols: [...f.symbols, sym] })} />}

      <div className="mt-5">
        <label htmlFor="folder-notes" className="text-[13px] font-medium block mb-1.5">Notes</label>
        <textarea id="folder-notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== f.notes && updateFolder(f.id, { notes })}
          rows={4} placeholder="Votre analyse : pourquoi ce thème, ce que vous surveillez…"
          className="w-full rounded-[10px] border border-line px-3 py-2 text-[13px] outline-none focus:border-primary resize-y" />
      </div>
    </Card>
  );
}
