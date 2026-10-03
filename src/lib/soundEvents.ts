"use client";
// Relie les événements du jeu aux sons : chaque action du joueur a son retour sonore.
// On écoute l'état du jeu plutôt que d'appeler play() partout : un seul endroit à maintenir.
import { useGame } from "@/store/game";
import { play, startSound, type Sfx } from "@/lib/sound";
import type { Transaction } from "@/lib/game/engine";

/** Son d'une opération enregistrée dans le journal de la partie. */
function sfxOf(tx: Transaction): Sfx {
  switch (tx.kind) {
    case "buy": return "buy";
    case "sell": return "sell";
    case "reward": return "coin";
    case "move": return "travel";
    case "demolish": return "demolish";
    case "research": return tx.label.startsWith("Bureau") ? "contract" : "research";
    case "build":
      if (tx.label.startsWith("Amélioration")) return "upgrade";
      if (tx.label.startsWith("Grand projet") || tx.label.startsWith("Territoire")) return "project";
      if (tx.label.startsWith("Rénovation")) return "renovate";
      if (tx.label.startsWith("Implantation")) return "contract";
      return "build";
  }
}

let started = false;
export function startSoundEvents() {
  if (started || typeof window === "undefined") return;
  started = true;
  startSound();
  useGame.subscribe((s, prev) => {
    // Messages : une erreur s'entend ; quelques confirmations sans opération au journal ont leur propre son
    if (s.toast && s.toast !== prev.toast) {
      const t = s.toast.text;
      if (s.toast.kind === "error") play("error");
      else if (t.startsWith("Annulé")) play("undo");
      else if (t === "Bâtiment déplacé") play("move");
      else if (t.startsWith("Contrat signé")) play("contract");
      else if (t.startsWith("Contrat résilié")) play("close");
      else if (t === "Ville renommée") play("ok");
    }
    if (s.absence && !prev.absence) play("notify");
    if (s.game === prev.game) return;
    const tx = s.game.transactions[0], old = prev.game.transactions[0];
    // Nouvelle opération faite à l'instant (pas une sauvegarde qu'on vient de charger)
    if (tx && tx.id !== old?.id && s.game.createdAt === prev.game.createdAt && Math.abs(Date.now() - tx.at) < 5_000 && s.game.transactions.length >= prev.game.transactions.length) {
      play(sfxOf(tx));
      return;
    }
    // Un jour de ville vient de passer (les longs rattrapages ont leur journal, et son propre son)
    if (s.game.createdAt === prev.game.createdAt && s.game.day === prev.game.day + 1) play("day");
  });
}
