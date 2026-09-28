"use client";
import { useState } from "react";
import Link from "next/link";
import { Lock, Newspaper } from "lucide-react";
import { useGame } from "@/store/game";
import { hasResearch } from "@/lib/game/engine";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";
import { useNews } from "@/lib/news";
import { Card, Empty, PageHeader } from "@/components/ui";
import NewsList from "@/components/NewsList";

export default function NewsPage() {
  const game = useGame((s) => s.game);
  const news = useNews();
  const [filter, setFilter] = useState("all");
  const [topic, setTopic] = useState("");
  const [country, setCountry] = useState("");
  const advanced = hasResearch(game, "news_filters");

  const held = Object.keys(game.holdings);
  let items = news.items;
  if (filter === "held") items = items.filter((n) => n.symbols.some((s) => held.includes(s)));
  else if (filter.startsWith("f:")) {
    const f = game.folders.find((x) => x.id === filter.slice(2));
    items = f ? items.filter((n) => n.symbols.some((s) => f.symbols.includes(s))) : items;
  } else if (filter.startsWith("s:")) items = items.filter((n) => n.symbols.includes(filter.slice(2)));
  if (advanced && topic) items = items.filter((n) => n.topic === topic);
  if (advanced && country) items = items.filter((n) => n.country === country);

  const topics = [...new Set(news.items.map((n) => n.topic).filter(Boolean))].sort();
  const countries = [...new Set(news.items.map((n) => n.country).filter(Boolean))].sort();

  const chip = (id: string, label: string) => (
    <button key={id} onClick={() => setFilter(id)}
      className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${filter === id ? "bg-primary text-white" : "bg-card border border-line text-ink hover:bg-slate-50"}`}>{label}</button>
  );

  return (
    <>
      <PageHeader icon={Newspaper} title="Actualités" subtitle="De vraies actualités économiques, mises à jour chaque heure et reliées aux entreprises. Le jeu ne vous dit jamais quoi acheter." />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="flex flex-wrap gap-2 mb-3">
            {chip("all", "Tout")}
            {chip("held", "Mes positions")}
            {advanced && game.folders.map((f) => chip(`f:${f.id}`, f.name))}
            {filter.startsWith("s:") && chip(filter, ASSET_BY_SYMBOL[filter.slice(2)]?.name ?? filter.slice(2))}
          </div>
          {advanced && (
            <div className="flex flex-wrap gap-2 mb-3">
              <label htmlFor="news-topic" className="sr-only">Thème</label>
              <select id="news-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12px]">
                <option value="">Tous les thèmes</option>{topics.map((t) => <option key={t}>{t}</option>)}
              </select>
              <label htmlFor="news-country" className="sr-only">Pays</label>
              <select id="news-country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-[8px] border border-line bg-card px-2.5 py-1.5 text-[12px]">
                <option value="">Tous les pays</option>{countries.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          <Card className="!py-1">
            {news.status === "loading" ? <Empty>Chargement des actualités…</Empty>
              : news.status === "unavailable" ? <Empty>Impossible de charger les actualités pour l&apos;instant. Réessayez dans un moment.</Empty>
              : items.length === 0 ? <Empty>Aucune actualité pour ce filtre.</Empty>
              : <NewsList items={items} onSymbol={(s) => setFilter(`s:${s}`)} />}
          </Card>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <Card title="Comment lire les actualités">
            <ul className="text-[12px] text-muted space-y-1.5 list-disc pl-4">
              <li>Chaque actualité renvoie vers l&apos;article d&apos;origine.</li>
              <li>Cliquez sur une entreprise pour ne voir que ses actualités.</li>
              <li>Pensez aux <Link href="/relations" className="text-primary">relations</Link> : une nouvelle chez un fournisseur peut toucher ses clients.</li>
            </ul>
          </Card>
          {!advanced && (
            <Card>
              <div className="flex items-start gap-3">
                <span className="h-8 w-8 rounded-full bg-slate-100 text-muted grid place-items-center shrink-0"><Lock size={15} /></span>
                <div>
                  <div className="font-semibold text-[14px]">Filtres avancés</div>
                  <p className="text-[12px] text-muted mt-0.5">Filtrez par dossier, par thème et par pays.</p>
                  <Link href="/recherche" className="text-[12px] text-primary font-medium mt-2 inline-block">Débloquer dans Recherche →</Link>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
