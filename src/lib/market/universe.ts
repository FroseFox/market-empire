// Univers d'actifs du prototype. `basePrice` sert uniquement au mode simulé
// (ordre de grandeur, en €). En mode réel, le prix vient du fournisseur.
export interface Asset {
  symbol: string;       // symbole affiché dans le jeu
  providerSymbol: string; // symbole côté fournisseur (Finnhub)
  name: string;
  sector: string;
  country: "US" | "FR" | "NL" | "DE" | "TW";
  currency: "USD" | "EUR";
  basePrice: number;
  volatility: number;   // 1 = volatilité moyenne
  drift: number;        // tendance annuelle du mode simulé
  kind: "stock" | "etf";
  /** Recherche nécessaire pour acheter cet actif. */
  research: string;
}

const a = (symbol: string, name: string, sector: string, country: Asset["country"], currency: Asset["currency"], basePrice: number, volatility: number, drift = 0.06, providerSymbol = symbol): Asset =>
  ({ symbol, providerSymbol, name, sector, country, currency, basePrice, volatility, drift, kind: "stock", research: currency === "EUR" ? "eu_stocks" : "us_stocks" });

const etf = (symbol: string, name: string, country: Asset["country"], currency: Asset["currency"], basePrice: number, providerSymbol = symbol): Asset =>
  ({ symbol, providerSymbol, name, sector: "Indice", country, currency, basePrice, volatility: 0.6, drift: 0.07, kind: "etf", research: "etf" });

export const ASSETS: Asset[] = [
  a("AAPL", "Apple", "Technologie", "US", "USD", 205, 1.0),
  a("MSFT", "Microsoft", "Technologie", "US", "USD", 430, 0.9),
  a("NVDA", "NVIDIA", "Semi-conducteurs", "US", "USD", 160, 1.7, 0.2),
  a("GOOGL", "Alphabet", "Technologie", "US", "USD", 170, 1.1),
  a("AMZN", "Amazon", "Commerce en ligne", "US", "USD", 190, 1.1),
  a("META", "Meta Platforms", "Technologie", "US", "USD", 600, 1.3),
  a("TSLA", "Tesla", "Automobile", "US", "USD", 290, 2.0, 0.02),
  a("AMD", "AMD", "Semi-conducteurs", "US", "USD", 140, 1.7, 0.1),
  a("TSM", "TSMC", "Semi-conducteurs", "TW", "USD", 190, 1.3, 0.12),
  a("AVGO", "Broadcom", "Semi-conducteurs", "US", "USD", 240, 1.5, 0.15),
  a("INTC", "Intel", "Semi-conducteurs", "US", "USD", 22, 1.6, -0.05),
  a("NFLX", "Netflix", "Médias", "US", "USD", 950, 1.3),
  a("JPM", "JPMorgan Chase", "Banque", "US", "USD", 250, 0.9),
  a("V", "Visa", "Paiements", "US", "USD", 320, 0.7),
  a("KO", "Coca-Cola", "Consommation", "US", "USD", 65, 0.5, 0.03),
  a("XOM", "ExxonMobil", "Énergie", "US", "USD", 110, 0.9, 0.02),
  a("CVX", "Chevron", "Énergie", "US", "USD", 145, 0.9, 0.02),
  a("ASML", "ASML", "Semi-conducteurs", "NL", "EUR", 650, 1.4, 0.08, "ASML"),
  a("MC", "LVMH", "Luxe", "FR", "EUR", 560, 1.1, 0.03, "MC.PA"),
  a("TTE", "TotalEnergies", "Énergie", "FR", "EUR", 55, 0.8, 0.02, "TTE.PA"),
  a("AIR", "Airbus", "Aéronautique", "FR", "EUR", 160, 1.0, 0.07, "AIR.PA"),
  a("SAN", "Sanofi", "Santé", "FR", "EUR", 90, 0.7, 0.03, "SAN.PA"),
  a("OR", "L'Oréal", "Consommation", "FR", "EUR", 370, 0.8, 0.04, "OR.PA"),
  a("SAP", "SAP", "Logiciels", "DE", "EUR", 250, 1.0, 0.08, "SAP.DE"),
  etf("SPY", "ETF S&P 500", "US", "USD", 590),
  etf("QQQ", "ETF Nasdaq 100", "US", "USD", 520),
  etf("CAC", "ETF CAC 40", "FR", "EUR", 78, "CAC.PA"),
];

export const ASSET_BY_SYMBOL: Record<string, Asset> = Object.fromEntries(ASSETS.map((x) => [x.symbol, x]));
