"use client";
// Objectif commun de la semaine (voir lib/worldGoal.ts) : sur l'accueil et dans Monde.
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button, Progress } from "@/components/ui";
import { WORLD_CAP, claimWorldGoal, loadWorldGoal, useWorldGoal, worldAmount, worldReward, worldText } from "@/lib/worldGoal";
import { useAuth } from "@/lib/auth";
import { compactEur, num } from "@/lib/format";

function timeLeft(ends: string): string {
  const ms = Date.parse(ends) - Date.now();
  if (!(ms > 0)) return "se termine";
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d >= 1 ? `encore ${d} j ${h} h` : `encore ${h} h`;
}

export default function WorldGoal() {
  const signedIn = useAuth((s) => s.status === "in");
  const { status: st, busy } = useWorldGoal();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    void loadWorldGoal(true);
    const id = setInterval(() => { if (!document.hidden) void loadWorldGoal(); }, 5 * 60_000);
    return () => clearInterval(id);
  }, [signedIn]);
  if (!st) return null;
  const reached = st.progress >= st.target, reward = worldReward();
  return (
    <div className="space-y-3">
      {st.previous && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] bg-success-soft px-3 py-2">
          <span className="text-[12px] text-emerald-800">Semaine dernière réussie : <b>{worldText(st.previous.kind, st.previous.target)}</b> (votre part : {worldAmount(st.previous.kind, st.previous.mine)}).</span>
          <Button variant="success" disabled={busy} onClick={async () => setMsg(await claimWorldGoal(st.previous!))} className="shrink-0">+{compactEur(reward)}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[14px] font-semibold">{worldText(st.kind, st.target)}</span>
        <span className="text-[11px] text-muted">{timeLeft(st.ends)} · fin dimanche minuit</span>
      </div>
      <div>
        <Progress value={Math.min(1, st.progress / st.target)} tone={reached ? "bg-success" : "bg-primary"} />
        <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted tabular">
          <span>{worldAmount(st.kind, st.progress)} / {worldAmount(st.kind, st.target)}{reached ? " · atteint !" : ""}</span>
          <span className="inline-flex items-center gap-1"><Users size={12} />{num(st.contributors)} joueur{st.contributors > 1 ? "s ont" : " a"} participé · votre part : {worldAmount(st.kind, Math.min(st.mine, st.target * WORLD_CAP))}{st.mine > st.target * WORLD_CAP ? " (maximum)" : ""}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-slate-50 px-3 py-2">
        <span className="text-[12px]">Récompense pour chaque participant : <b>{compactEur(reward)}</b> <span className="text-muted">(pour votre ville)</span></span>
        {st.claimed ? <span className="text-[11px] font-semibold text-success">Encaissée</span>
          : reached && st.mine > 0 ? <Button variant="success" disabled={busy} onClick={async () => setMsg(await claimWorldGoal(st))}>Encaisser</Button>
          : reached ? <span className="text-[11px] text-muted">Participez pour la toucher</span> : null}
      </div>
      {msg && <p className="text-[12px] text-muted">{msg}</p>}
      <p className="text-[11px] text-muted">Tous les joueurs ensemble, du lundi au dimanche. La cible suit le nombre de joueurs actifs ({num(st.players)} cette semaine). La part d&apos;un joueur compte au plus pour {Math.round(WORLD_CAP * 100)} % de la cible : impossible seul, il faut s&apos;y mettre à plusieurs. Il suffit d&apos;y avoir contribué pour toucher la récompense, jusqu&apos;à la fin de la semaine suivante.</p>
    </div>
  );
}
