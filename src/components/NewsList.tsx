"use client";
import { ExternalLink } from "lucide-react";
import { useGame } from "@/store/game";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { timeAgo, type NewsItem } from "@/lib/news";
import { Delta } from "@/components/ui";

export default function NewsList({ items, compact = false, onSymbol, note }: { items: NewsItem[]; compact?: boolean; onSymbol?: (s: string) => void; note?: (n: NewsItem) => string | undefined }) {
  const quotes = useGame((s) => s.quotes);
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.id} className={compact ? "py-2.5" : "py-4"}>
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="group block">
            <span className={`font-semibold leading-snug group-hover:text-primary ${compact ? "text-[13px]" : "text-[15px]"}`} style={{ textWrap: "pretty" }}>
              {n.title}<ExternalLink size={12} className="inline ml-1.5 -mt-0.5 text-muted" />
            </span>
            {!compact && n.summary && <span className="block text-[13px] text-muted mt-1 max-w-[70ch]">{n.summary}</span>}
          </a>
          {note?.(n) && <div className="mt-1.5 text-[11px] text-slate-600">{note(n)}</div>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 text-[11px] text-muted">
            <span>{n.source} · {timeAgo(n.publishedAt)}</span>
            {!compact && n.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{n.topic}</span>}
            {n.symbols.map((s) => {
              const q = quotes[s];
              const chip = (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary font-semibold">
                  {ASSET_BY_SYMBOL[s]?.name ?? s}{q && !compact && <Delta value={q.change} className="!text-[10px]" />}
                </span>
              );
              return onSymbol ? <button key={s} type="button" onClick={() => onSymbol(s)}>{chip}</button> : <span key={s}>{chip}</span>;
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
