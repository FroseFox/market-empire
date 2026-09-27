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

  // Semi-conducteurs (suite)
  s("ARM", "AAPL", "Architecture des puces A et M"),
  s("ARM", "QCOM", "Architecture des processeurs Snapdragon"),
  s("ARM", "NVDA", "Cœurs des processeurs Grace"),
  s("QCOM", "AAPL", "Modems 5G"),
  s("MU", "NVDA", "Mémoire HBM pour les puces IA"),
  s("ASML", "MU", "Machines de lithographie"),
  s("IFX", "TSLA", "Composants de puissance"),
  c("QCOM", "AAPL", "Modems conçus en interne par Apple"),
  // Logiciels et cloud
  c("ORCL", "MSFT", "Bases de données et cloud"),
  c("CRM", "SAP", "Logiciels d'entreprise"),
  c("ADBE", "DSY", "Logiciels de conception"),
  p("ORCL", "NVDA", "Centres de données IA"),
  p("PLTR", "MSFT", "Logiciels d'analyse sur Azure"),
  // Jeux vidéo
  c("TTWO", "UBI", "Mondes ouverts"),
  c("SONY", "MSFT", "Consoles (PlayStation contre Xbox)"),
  c("SONY", "NTDOY", "Consoles"),
  c("NTDOY", "MSFT", "Consoles"),
  c("RBLX", "TCEHY", "Plateformes de jeu"),
  p("TCEHY", "UBI", "Actionnaire de la filiale Vantage Studios"),
  s("AMD", "SONY", "Processeurs de la PlayStation"),
  s("NVDA", "NTDOY", "Processeur de la Switch"),
  // Automobile
  c("TM", "HMC", "Voitures"),
  c("VOW3", "BMW", "Voitures"),
  c("VOW3", "MBG", "Voitures"),
  c("BMW", "MBG", "Voitures haut de gamme"),
  c("RNO", "STLA", "Voitures en Europe"),
  c("F", "GM", "Voitures et pick-up"),
  c("TSLA", "NIO", "Voitures électriques"),
  c("RACE", "MBG", "Voitures de luxe"),
  // Aéronautique et défense
  c("AIR", "BA", "Avions de ligne"),
  s("SAF", "AIR", "Moteurs LEAP (CFM)"),
  s("SAF", "BA", "Moteurs LEAP (CFM)"),
  p("SAF", "GE", "Coentreprise CFM International"),
  s("GE", "BA", "Moteurs"),
  c("LMT", "RTX", "Défense"),
  c("RHM", "LMT", "Défense"),
  // Luxe et consommation
  c("MC", "RMS", "Maroquinerie de luxe"),
  c("MC", "KER", "Mode de luxe"),
  c("RMS", "KER", "Luxe"),
  c("NKE", "ADS", "Articles de sport"),
  c("KO", "PEP", "Boissons"),
  c("RI", "DGE", "Spiritueux"),
  c("HEIA", "DGE", "Bières (Guinness)"),
  c("NESN", "BN", "Alimentation"),
  c("PG", "ULVR", "Produits d'hygiène"),
  c("OR", "ULVR", "Soins et beauté"),
  c("ITX", "NKE", "Habillement"),
  c("MCD", "SBUX", "Restauration rapide"),
  // Commerce et paiements
  c("V", "MA", "Réseaux de cartes"),
  c("PYPL", "ADYEN", "Paiements en ligne"),
  p("ADYEN", "UBER", "Paiements"),
  c("AMZN", "WMT", "Distribution"),
  c("WMT", "COST", "Hypermarchés"),
  c("AMZN", "BABA", "Commerce en ligne"),
  c("BABA", "PDD", "Commerce en ligne"),
  c("BABA", "JD", "Commerce en ligne"),
  c("AMZN", "SHOP", "Boutiques en ligne"),
  c("MELI", "AMZN", "Commerce en ligne en Amérique latine"),
  c("SE", "BABA", "Commerce en ligne en Asie du Sud-Est"),
  // Banques et assurances
  c("JPM", "BAC", "Banque"),
  c("GS", "MS", "Banque d'affaires"),
  c("BNP", "GLE", "Banque en France"),
  c("CS", "ALV", "Assurance"),
  c("HSBA", "UBSG", "Gestion de fortune"),
  // Santé
  c("LLY", "NOVO", "Traitements contre l'obésité"),
  c("SAN", "GSK", "Vaccins"),
  c("ROG", "NOVN", "Médicaments"),
  c("PFE", "MRK", "Médicaments"),
  c("AZN", "PFE", "Médicaments"),
  // Énergie et mines
  c("SHEL", "BP", "Pétrole et gaz"),
  c("SHEL", "TTE", "Pétrole et gaz"),
  c("EQNR", "SHEL", "Pétrole et gaz en mer du Nord"),
  c("ENI", "TTE", "Pétrole et gaz"),
  c("BHP", "RIO", "Minerai de fer"),
  c("VALE", "RIO", "Minerai de fer"),
  c("IBE", "NEE", "Énergies renouvelables"),
  c("ENGI", "IBE", "Électricité"),
  // Télécoms
  c("NOK", "ERIC", "Réseaux mobiles"),
  c("T", "VZ", "Téléphonie aux États-Unis"),
  c("ORA", "DTE", "Téléphonie en Europe"),
  s("ERIC", "T", "Équipements 5G"),
  s("NOK", "VZ", "Équipements réseau"),
  // Médias et services
  c("SPOT", "AAPL", "Musique en ligne"),
  c("NFLX", "DIS", "Streaming vidéo"),
  p("UBER", "TSLA", "Voitures électriques des chauffeurs"),
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
