import { describe, expect, it } from "vitest";
import { applyLedger, newGame, type LedgerRow } from "./engine";

const rows: LedgerRow[] = [
  { id: 3, amount: "-40000", label: "Bourse des villes : 10 parts de Nova", kind: "shares" },
  { id: 5, amount: -250000, label: "Alliance fondée : Les Bâtisseurs", kind: "alliance" },
  { id: 8, amount: 141000, label: "Objectif commun : gagner ensemble 2 670 habitants", kind: "reward" },
];

describe("registre des mouvements d'argent du serveur", () => {
  it("applique chaque ligne une seule fois et retient la dernière", () => {
    const g = { ...newGame(0), cash: 1_000_000, ledger: 0 };
    const a = applyLedger(g, rows, 1);
    expect(a.cash).toBe(1_000_000 - 40_000 - 250_000 + 141_000);
    expect(a.ledger).toBe(8);
    expect(applyLedger(a, rows, 2)).toBe(a); // déjà appliquées : rien ne change
  });
  it("une partie reprise d'avant (autre appareil, sauvegarde refusée) rattrape seulement ce qui lui manque", () => {
    const old = { ...newGame(0), cash: 1_000_000, ledger: 5 };
    const b = applyLedger(old, rows, 1);
    expect(b.cash).toBe(1_000_000 + 141_000);
    expect(b.ledger).toBe(8);
    expect(b.transactions[0]).toMatchObject({ kind: "reward", amount: 141_000 });
  });
  it("ordre d'arrivée sans importance", () => {
    const g = { ...newGame(0), cash: 0, ledger: 0 };
    expect(applyLedger(g, [...rows].reverse(), 1).cash).toBe(applyLedger(g, rows, 1).cash);
  });
});
