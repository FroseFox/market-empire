"use client";
import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { useGame } from "@/store/game";
import { folderLimit } from "@/lib/game/engine";

/** Ajoute une ou plusieurs entreprises à un dossier existant ou nouveau. */
export default function AddToFolder({ symbols, label = "Ajouter à un dossier" }: { symbols: string[]; label?: string }) {
  const game = useGame((s) => s.game);
  const updateFolder = useGame((s) => s.updateFolder);
  const createFolder = useGame((s) => s.createFolder);
  const notify = useGame((s) => s.notify);
  const [value, setValue] = useState("");
  const canCreate = game.folders.length < folderLimit(game);

  const apply = (v: string) => {
    setValue("");
    if (!v) return;
    if (v === "__new") {
      const id = createFolder(symbols.length === 1 ? symbols[0] : "Nouveau dossier", symbols);
      if (id) notify("Dossier créé");
      return;
    }
    const f = game.folders.find((x) => x.id === v);
    if (!f) return;
    updateFolder(f.id, { symbols: [...f.symbols, ...symbols] });
    notify(`Ajouté au dossier « ${f.name} »`);
  };

  return (
    <label className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-card px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-slate-50 cursor-pointer">
      <FolderPlus size={14} className="text-primary" />
      <span className="sr-only">{label}</span>
      <select id={`add-folder-${symbols.join("-")}`} value={value} onChange={(e) => apply(e.target.value)} className="bg-transparent outline-none cursor-pointer max-w-[170px]">
        <option value="">{label}</option>
        {game.folders.map((f) => <option key={f.id} value={f.id} disabled={symbols.every((s) => f.symbols.includes(s))}>{f.name}</option>)}
        {canCreate && <option value="__new">+ Nouveau dossier</option>}
      </select>
    </label>
  );
}
