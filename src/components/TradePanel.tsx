"use client";
// Commerce entre joueurs : acheter le surplus d'énergie ou de nourriture d'un autre joueur par contrat.
// Le vendeur touche plus qu'à l'export (85 % au lieu de 70 %), l'acheteur paie moins qu'à l'import (85 % au lieu de 100 %).
import { useEffect, useState } from "react";
import { ArrowLeftRight, Wheat, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDerived, useGame } from "@/store/game";
import { useAuth } from "@/lib/auth";
import { cancelContract, signContract, syncContracts } from "@/lib/online";
import { rest, STATIC_MODE } from "@/lib/market/client";
import { CONTRACT_RATIO, EXPORT_RATIO, MAX_CONTRACTS, RESOURCE_PRICES } from "@/lib/game/config";
import type { Contract } from "@/lib/game/engine";
import { PLAYABLE } from "@/lib/world/countries";
import { Button, Card, ConfirmButton, Empty } from "@/components/ui";
import { eur, num } from "@/lib/format";

type Resource = Contract["resource"];
interface Offer { id: string; name: string; city_name: string; country: string | null; energy: number; food: number }
const RES: Record<Resource, { label: string; icon: LucideIcon }> = { energy: { label: "Énergie", icon: Zap }, food: { label: "Nourriture", icon: Wheat } };
const QUERY = "market?select=id,name,city_name,country,energy,food&limit=200";

export default function TradePanel() {
  const { game, city } = useDerived();
  const notify = useGame((s) => s.notify);
  const auth = useAuth();
  const online = !STATIC_MODE && auth.status === "in";
  // undefined = chargement, null = commerce indisponible
  const [offers, setOffers] = useState<Offer[] | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const fetchAll = (fresh: boolean) => Promise.all([rest<Offer[]>(QUERY, fresh ? 0 : 30_000), syncContracts()]).then(([rows]) => rows);
  useEffect(() => {
    if (!online) return;
    let alive = true;
    fetchAll(false).then((rows) => { if (alive) setOffers(rows); });
    return () => { alive = false; };
  }, [online]);

  const contracts = game.contracts ?? [];
  const bought = (r: Resource) => contracts.reduce((a, c) => a + (c.side === "buy" && c.resource === r ? c.qty : 0), 0);
  const balance = { energy: city.energy.balance, food: city.food.balance };
  /** Ce qu'il reste à couvrir par contrat. */
  const need = (r: Resource) => Math.max(0, Math.floor(-balance[r]) - bought(r));
  const nameOf = (id: string) => offers?.find((o) => o.id === id)?.city_name ?? "Autre joueur";
  const buys = contracts.filter((c) => c.side === "buy").length;

  const act = async (run: () => Promise<boolean>, okText: string, koText: string) => {
    if (busy) return;
    setBusy(true);
    try { const ok = await run(); notify(ok ? okText : koText, ok ? "ok" : "error"); } catch { notify("Commerce indisponible pour le moment, réessayez plus tard.", "error"); }
    setOffers(await fetchAll(true));
    setBusy(false);
  };

  if (!online) return <Card><Empty>Le commerce entre joueurs est disponible sur le site publié, une fois connecté.</Empty></Card>;

  return (
    <div className="grid items-start gap-4 grid-cols-1 xl:grid-cols-12">
      <Card className="xl:col-span-7" title="Marché des surplus" icon={ArrowLeftRight}>
        <p className="mb-3 text-[12px] text-muted">
          Un contrat vous livre chaque jour une part du surplus d&apos;un autre joueur à {Math.round(CONTRACT_RATIO * 100)} % du prix plein, au lieu de 100 % à l&apos;import.
          Le vendeur touche {Math.round(CONTRACT_RATIO * 100)} % au lieu de {Math.round(EXPORT_RATIO * 100)} % à l&apos;export. Chacun peut résilier à tout moment.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(Object.keys(RES) as Resource[]).map((r) => {
            const Icon = RES[r].icon, b = Math.round(balance[r]);
            return (
              <div key={r} className="rounded-[10px] bg-slate-50 p-2.5 text-[12px]">
                <div className="flex items-center gap-1.5 text-muted"><Icon size={13} />{RES[r].label} de votre ville</div>
                <div className={`font-bold tabular ${b < 0 ? "text-danger" : "text-success"}`}>{b >= 0 ? "+" : "−"}{num(Math.abs(b))} / jour</div>
                <div className="text-[11px] text-muted">{b < 0 ? `${num(need(r))} à couvrir par contrat` : "Surplus proposé aux autres joueurs"}</div>
              </div>
            );
          })}
        </div>
        {offers === undefined ? <Empty>Chargement du marché…</Empty>
          : offers === null ? <Empty>Commerce indisponible pour le moment.</Empty>
          : (() => {
            const rows = offers.filter((o) => o.id !== auth.user?.id).flatMap((o) => (Object.keys(RES) as Resource[]).filter((r) => o[r] > 0).map((r) => ({ o, r })));
            if (rows.length === 0) return <Empty>Aucun joueur n&apos;a de surplus à vendre pour l&apos;instant.</Empty>;
            return (
              <ul className="divide-y divide-line">
                {rows.map(({ o, r }) => {
                  const Icon = RES[r].icon, qty = Math.min(o[r], need(r));
                  const saving = qty * RESOURCE_PRICES[r] * (1 - CONTRACT_RATIO);
                  return (
                    <li key={o.id + r} className="flex items-center gap-3 py-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary"><Icon size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{o.city_name} <span className="font-normal text-muted">· {o.name}{o.country && PLAYABLE[o.country] ? ` · ${PLAYABLE[o.country]}` : ""}</span></div>
                        <div className="text-[11px] text-muted">{RES[r].label} : {num(o[r])} / jour disponibles</div>
                      </div>
                      <Button disabled={busy || qty <= 0 || buys >= MAX_CONTRACTS} className="shrink-0 !px-3"
                        title={buys >= MAX_CONTRACTS ? `${MAX_CONTRACTS} contrats d'achat au maximum` : qty <= 0 ? "Votre ville n'en manque pas" : `Économie : ${eur(saving)} par jour`}
                        onClick={() => act(() => signContract(o.id, r, qty), `Contrat signé : ${num(qty)} ${RES[r].label.toLowerCase()} par jour`, "Ce surplus vient d'être pris par un autre joueur.")}>
                        {qty > 0 ? `Acheter ${num(qty)} / j` : "Pas de besoin"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
      </Card>

      <Card className="xl:col-span-5" title={`Mes contrats (${contracts.length})`}>
        {contracts.length === 0 ? <Empty>Aucun contrat en cours.</Empty> : (
          <ul className="divide-y divide-line">
            {contracts.map((c) => {
              const Icon = RES[c.resource].icon;
              // Ce qui passe vraiment par contrat aujourd'hui dépend du surplus ou du manque réel de la ville
              const live = c.resource === "energy" ? (c.side === "buy" ? city.contracts.energyBought : city.contracts.energySold) : (c.side === "buy" ? city.contracts.foodBought : city.contracts.foodSold);
              return (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${c.side === "buy" ? "bg-primary-soft text-primary" : "bg-success-soft text-success"}`}><Icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{c.side === "buy" ? "Achat à" : "Vente à"} {nameOf(c.partner)}</div>
                    <div className="text-[11px] text-muted">
                      {num(c.qty)} {RES[c.resource].label.toLowerCase()} / jour
                      {live <= 0 ? (c.side === "buy" ? " · sans effet : votre ville n'en manque plus" : " · sans effet : vous n'avez plus de surplus") : ""}
                    </div>
                  </div>
                  <ConfirmButton disabled={busy} onConfirm={() => act(() => cancelContract(c.id), "Contrat résilié", "Contrat déjà résilié.")} confirmLabel="Confirmer"
                    className="shrink-0 text-[12px] font-semibold text-danger hover:underline disabled:opacity-40">Résilier</ConfirmButton>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted">Les contrats de vente se créent quand un autre joueur achète votre surplus. Jusqu&apos;à {MAX_CONTRACTS} contrats d&apos;achat.</p>
      </Card>
    </div>
  );
}
