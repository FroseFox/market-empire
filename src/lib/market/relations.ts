// Relations entre entreprises, saisies à la main (aucune source gratuite fiable).
// "supplier" : `from` fournit `to`. Les autres liens sont symétriques.
export type RelationType = "supplier" | "competitor" | "partner";
export interface Relation { from: string; to: string; type: RelationType; note: string }

const s = (from: string, to: string, note: string): Relation => ({ from, to, type: "supplier", note });
const c = (from: string, to: string, note: string): Relation => ({ from, to, type: "competitor", note });
const p = (from: string, to: string, note: string): Relation => ({ from, to, type: "partner", note });

export const RELATIONS: Relation[] = [
  // Chaîne des semi-conducteurs
  s("ASML", "TSM", "Machines de lithographie EUV"),
  s("ASML", "INTC", "Machines de lithographie EUV"),
  s("TSM", "NVDA", "Fabrication des puces"),
  s("TSM", "AMD", "Fabrication des puces"),
  s("TSM", "AAPL", "Fabrication des puces A et M"),
  s("TSM", "AVGO", "Fabrication des puces"),
  s("NVDA", "MSFT", "Processeurs IA pour Azure"),
  s("NVDA", "META", "Processeurs IA"),
  s("NVDA", "GOOGL", "Processeurs IA pour Google Cloud"),
  s("NVDA", "AMZN", "Processeurs IA pour AWS"),
  s("NVDA", "TSLA", "Processeurs pour l'entraînement IA"),
  s("AMD", "MSFT", "Processeurs pour Azure et Xbox"),
  s("AVGO", "AAPL", "Composants radio"),
  s("AVGO", "GOOGL", "Puces TPU sur mesure"),
  // Concurrence
  c("NVDA", "AMD", "Processeurs graphiques et IA"),
  c("AMD", "INTC", "Processeurs pour PC et serveurs"),
  c("NVDA", "INTC", "Accélérateurs IA"),
  c("TSM", "INTC", "Fabrication de puces pour des tiers"),
  c("MSFT", "GOOGL", "Cloud, bureautique, IA"),
  c("MSFT", "AMZN", "Cloud"),
  c("AMZN", "GOOGL", "Cloud"),
  c("GOOGL", "META", "Publicité en ligne"),
  c("AAPL", "GOOGL", "Smartphones (iOS contre Android)"),
  c("AAPL", "MSFT", "Ordinateurs et logiciels"),
  c("NFLX", "AMZN", "Streaming vidéo (Prime Video)"),
  c("NFLX", "GOOGL", "Vidéo en ligne (YouTube)"),
  c("XOM", "CVX", "Pétrole et gaz"),
  c("XOM", "TTE", "Pétrole et gaz"),
  c("CVX", "TTE", "Pétrole et gaz"),
  c("MC", "OR", "Parfums et cosmétiques"),
  // Partenariats
  p("V", "JPM", "Cartes de paiement émises par la banque"),
  p("AAPL", "GOOGL", "Moteur de recherche par défaut sur iPhone"),
  p("SAP", "MSFT", "Logiciels SAP hébergés sur Azure"),
  p("AIR", "TTE", "Carburant d'aviation durable"),
];

export interface Neighbor { symbol: string; role: "fournisseur" | "client" | "concurrent" | "partenaire"; note: string }

export function neighbors(symbol: string): Neighbor[] {
  const out: Neighbor[] = [];
  for (const r of RELATIONS) {
    if (r.type === "supplier") {
      if (r.to === symbol) out.push({ symbol: r.from, role: "fournisseur", note: r.note });
      if (r.from === symbol) out.push({ symbol: r.to, role: "client", note: r.note });
    } else if (r.from === symbol || r.to === symbol) {
      out.push({ symbol: r.from === symbol ? r.to : r.from, role: r.type === "competitor" ? "concurrent" : "partenaire", note: r.note });
    }
  }
  // Un même couple peut être concurrent ET partenaire (Apple / Google) : on garde les deux
  return out;
}
