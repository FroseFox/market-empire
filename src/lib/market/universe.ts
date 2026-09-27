// Univers d'actifs du jeu. `basePrice` sert uniquement au mode simulé
// (ordre de grandeur, en €). En mode réel, le prix vient de Supabase.
//
// D'où vient le vrai cours (fonction supabase/functions/refresh-market) :
// - actions et ETF cotés aux États-Unis : Finnhub, converti en euros ;
// - actions étrangères : leur cotation américaine (action ou ADR) × `us[1]`
//   pour retrouver le prix d'une action sur sa place d'origine, en euros ;
// - cryptomonnaies : CoinGecko, directement en euros.
export type AssetKind = "stock" | "etf" | "commodity" | "crypto";
export type Region = "États-Unis" | "Europe" | "Asie" | "Autres";

export interface Asset {
  symbol: string;         // symbole affiché dans le jeu
  providerSymbol: string; // symbole côté fournisseur (Finnhub)
  name: string;
  sector: string;
  country: string;        // code ISO à 2 lettres, « WW » = mondial
  currency: "USD" | "EUR";
  basePrice: number;
  volatility: number;     // 1 = volatilité moyenne
  drift: number;          // tendance annuelle du mode simulé
  kind: AssetKind;
  /** Recherche nécessaire pour acheter cet actif. */
  research: string;
  /** Cotation américaine utilisée pour le prix, et nombre d'unités de cette cotation par action. */
  us?: [string, number];
  coingecko?: string;
  /** Site de l'entreprise, pour le logo (plus fiable que le symbole pour les sociétés étrangères). */
  domain?: string;
  /** Texte court du badge quand il n'y a pas de logo (matières premières). */
  short?: string;
}

const EUROPE = new Set(["FR", "DE", "NL", "GB", "CH", "DK", "IT", "ES", "SE", "FI", "NO", "BE", "IE"]);
const ASIA = new Set(["JP", "CN", "TW", "KR", "IN", "SG", "HK"]);

export function regionOf(a: Pick<Asset, "country">): Region {
  if (a.country === "US") return "États-Unis";
  if (EUROPE.has(a.country)) return "Europe";
  if (ASIA.has(a.country)) return "Asie";
  return "Autres";
}

const stockResearch = (country: string) =>
  country === "US" ? "us_stocks" : EUROPE.has(country) ? "eu_stocks" : "world_stocks";

type Opt = { drift?: number; us?: [string, number]; p?: string; domain?: string; research?: string };

/** Action cotée directement aux États-Unis (y compris sociétés étrangères cotées à New York). */
function st(symbol: string, name: string, sector: string, country: string, basePrice: number, volatility: number, o: Opt = {}): Asset {
  return {
    symbol, name, sector, country, basePrice, volatility,
    providerSymbol: o.p ?? o.us?.[0] ?? symbol,
    currency: EUROPE.has(country) && (o.p?.includes(".") ?? false) ? "EUR" : "USD",
    drift: o.drift ?? 0.06, kind: "stock", research: o.research ?? stockResearch(country),
    us: o.us, domain: o.domain,
  };
}

/** Action étrangère : prix d'origine retrouvé via sa cotation américaine. */
const fx = (symbol: string, name: string, sector: string, country: string, basePrice: number, volatility: number, us: [string, number], domain: string, drift = 0.05) =>
  st(symbol, name, sector, country, basePrice, volatility, { us, domain, drift });

const etf = (symbol: string, name: string, sector: string, country: string, basePrice: number, volatility = 0.6, drift = 0.07, providerSymbol = symbol): Asset =>
  ({ symbol, providerSymbol, name, sector, country, currency: providerSymbol.includes(".") ? "EUR" : "USD", basePrice, volatility, drift, kind: "etf", research: "etf" });

const raw = (symbol: string, name: string, sector: string, short: string, basePrice: number, volatility: number, drift = 0.03): Asset =>
  ({ symbol, providerSymbol: symbol, name, sector, country: "WW", currency: "USD", basePrice, volatility, drift, kind: "commodity", research: "commodities", short });

const coin = (symbol: string, name: string, id: string, basePrice: number, volatility: number, drift = 0.1): Asset =>
  ({ symbol, providerSymbol: `CG:${id}`, name, sector: "Cryptomonnaie", country: "WW", currency: "EUR", basePrice, volatility, drift, kind: "crypto", research: "crypto", coingecko: id });

export const ASSETS: Asset[] = [
  // ─── États-Unis ───
  st("AAPL", "Apple", "Technologie", "US", 205, 1.0),
  st("MSFT", "Microsoft", "Technologie", "US", 430, 0.9),
  st("NVDA", "NVIDIA", "Semi-conducteurs", "US", 160, 1.7, { drift: 0.2 }),
  st("GOOGL", "Alphabet", "Technologie", "US", 170, 1.1),
  st("AMZN", "Amazon", "Commerce en ligne", "US", 190, 1.1),
  st("META", "Meta Platforms", "Technologie", "US", 600, 1.3),
  st("TSLA", "Tesla", "Automobile", "US", 290, 2.0, { drift: 0.02 }),
  st("AMD", "AMD", "Semi-conducteurs", "US", 140, 1.7, { drift: 0.1 }),
  st("AVGO", "Broadcom", "Semi-conducteurs", "US", 240, 1.5, { drift: 0.15 }),
  st("INTC", "Intel", "Semi-conducteurs", "US", 22, 1.6, { drift: -0.05 }),
  st("QCOM", "Qualcomm", "Semi-conducteurs", "US", 150, 1.3),
  st("MU", "Micron", "Semi-conducteurs", "US", 100, 1.8, { drift: 0.08 }),
  st("TXN", "Texas Instruments", "Semi-conducteurs", "US", 170, 1.0),
  st("ORCL", "Oracle", "Logiciels", "US", 150, 1.2, { drift: 0.1 }),
  st("CRM", "Salesforce", "Logiciels", "US", 250, 1.1),
  st("ADBE", "Adobe", "Logiciels", "US", 350, 1.1),
  st("PLTR", "Palantir", "Logiciels", "US", 120, 2.2, { drift: 0.15 }),
  st("IBM", "IBM", "Technologie", "US", 220, 0.8),
  st("CSCO", "Cisco", "Technologie", "US", 55, 0.7),
  st("NFLX", "Netflix", "Médias", "US", 950, 1.3),
  st("DIS", "Disney", "Médias", "US", 100, 1.0),
  st("TTWO", "Take-Two Interactive", "Jeux vidéo", "US", 200, 1.1),
  st("RBLX", "Roblox", "Jeux vidéo", "US", 70, 2.0, { drift: 0.1 }),
  st("UBER", "Uber", "Transport", "US", 70, 1.4, { drift: 0.08 }),
  st("ABNB", "Airbnb", "Tourisme", "US", 120, 1.3),
  st("DAL", "Delta Air Lines", "Transport", "US", 55, 1.4),
  st("UPS", "UPS", "Transport", "US", 100, 0.9, { drift: 0 }),
  st("JPM", "JPMorgan Chase", "Banque", "US", 250, 0.9),
  st("BAC", "Bank of America", "Banque", "US", 40, 1.0),
  st("GS", "Goldman Sachs", "Banque", "US", 550, 1.0),
  st("MS", "Morgan Stanley", "Banque", "US", 120, 1.0),
  st("BRK.B", "Berkshire Hathaway", "Assurance", "US", 440, 0.6),
  st("V", "Visa", "Paiements", "US", 320, 0.7),
  st("MA", "Mastercard", "Paiements", "US", 480, 0.7),
  st("PYPL", "PayPal", "Paiements", "US", 65, 1.3, { drift: 0.02 }),
  st("COIN", "Coinbase", "Paiements", "US", 250, 2.5, { drift: 0.1 }),
  st("WMT", "Walmart", "Distribution", "US", 85, 0.6),
  st("COST", "Costco", "Distribution", "US", 850, 0.7),
  st("HD", "Home Depot", "Distribution", "US", 350, 0.8),
  st("MCD", "McDonald's", "Restauration", "US", 270, 0.6),
  st("SBUX", "Starbucks", "Restauration", "US", 90, 1.0, { drift: 0.02 }),
  st("NKE", "Nike", "Habillement", "US", 70, 1.2, { drift: 0.01 }),
  st("KO", "Coca-Cola", "Boissons", "US", 65, 0.5, { drift: 0.03 }),
  st("PEP", "PepsiCo", "Boissons", "US", 140, 0.5, { drift: 0.02 }),
  st("PG", "Procter & Gamble", "Consommation", "US", 150, 0.5, { drift: 0.03 }),
  st("JNJ", "Johnson & Johnson", "Santé", "US", 150, 0.6, { drift: 0.03 }),
  st("LLY", "Eli Lilly", "Santé", "US", 750, 1.2, { drift: 0.12 }),
  st("PFE", "Pfizer", "Santé", "US", 24, 0.9, { drift: 0 }),
  st("MRK", "Merck & Co.", "Santé", "US", 90, 0.9, { drift: 0.02 }),
  st("UNH", "UnitedHealth", "Santé", "US", 300, 1.2, { drift: 0.02 }),
  st("BA", "Boeing", "Aéronautique", "US", 190, 1.3),
  st("GE", "GE Aerospace", "Aéronautique", "US", 220, 1.1, { drift: 0.1 }),
  st("LMT", "Lockheed Martin", "Défense", "US", 430, 0.7),
  st("RTX", "RTX", "Défense", "US", 130, 0.8),
  st("CAT", "Caterpillar", "Industrie", "US", 350, 1.0),
  st("F", "Ford", "Automobile", "US", 10, 1.3, { drift: 0 }),
  st("GM", "General Motors", "Automobile", "US", 50, 1.2, { drift: 0.03 }),
  st("T", "AT&T", "Télécoms", "US", 25, 0.6, { drift: 0.02 }),
  st("VZ", "Verizon", "Télécoms", "US", 40, 0.6, { drift: 0.01 }),
  st("XOM", "ExxonMobil", "Énergie", "US", 110, 0.9, { drift: 0.02 }),
  st("CVX", "Chevron", "Énergie", "US", 145, 0.9, { drift: 0.02 }),
  st("NEE", "NextEra Energy", "Énergie", "US", 70, 0.8, { drift: 0.04 }),

  // ─── Europe ───
  st("ASML", "ASML", "Semi-conducteurs", "NL", 650, 1.4, { drift: 0.08, domain: "asml.com" }),
  fx("MC", "LVMH", "Luxe", "FR", 560, 1.1, ["LVMUY", 5], "lvmh.com", 0.03),
  fx("RMS", "Hermès", "Luxe", "FR", 2300, 0.9, ["HESAY", 10], "hermes.com", 0.06),
  fx("KER", "Kering", "Luxe", "FR", 200, 1.4, ["PPRUY", 10], "kering.com", 0),
  fx("OR", "L'Oréal", "Consommation", "FR", 370, 0.8, ["LRLCY", 5], "loreal.com", 0.04),
  fx("BN", "Danone", "Consommation", "FR", 70, 0.6, ["DANOY", 5], "danone.com", 0.03),
  fx("RI", "Pernod Ricard", "Boissons", "FR", 95, 0.9, ["PDRDY", 5], "pernod-ricard.com", 0),
  fx("TTE", "TotalEnergies", "Énergie", "FR", 55, 0.8, ["TTE", 1], "totalenergies.com", 0.02),
  fx("ENGI", "Engie", "Énergie", "FR", 17, 0.7, ["ENGIY", 1], "engie.com", 0.03),
  fx("AIR", "Airbus", "Aéronautique", "FR", 160, 1.0, ["EADSY", 4], "airbus.com", 0.07),
  fx("SAF", "Safran", "Aéronautique", "FR", 260, 1.0, ["SAFRY", 4], "safran-group.com", 0.08),
  fx("SAN", "Sanofi", "Santé", "FR", 90, 0.7, ["SNY", 2], "sanofi.com", 0.03),
  fx("EL", "EssilorLuxottica", "Santé", "FR", 250, 0.8, ["ESLOY", 2], "essilorluxottica.com", 0.06),
  fx("AI", "Air Liquide", "Chimie", "FR", 170, 0.6, ["AIQUY", 5], "airliquide.com", 0.05),
  fx("SU", "Schneider Electric", "Industrie", "FR", 230, 1.0, ["SBGSY", 5], "se.com", 0.08),
  fx("DG", "Vinci", "Construction", "FR", 115, 0.7, ["VCISY", 4], "vinci.com", 0.04),
  fx("BNP", "BNP Paribas", "Banque", "FR", 65, 1.0, ["BNPQY", 2], "bnpparibas.com", 0.04),
  fx("GLE", "Société Générale", "Banque", "FR", 40, 1.3, ["SCGLY", 5], "societegenerale.com", 0.04),
  fx("CS", "AXA", "Assurance", "FR", 38, 0.8, ["AXAHY", 1], "axa.com", 0.05),
  fx("ORA", "Orange", "Télécoms", "FR", 11, 0.6, ["ORANY", 1], "orange.com", 0.02),
  fx("CAP", "Capgemini", "Technologie", "FR", 150, 1.1, ["CGEMY", 5], "capgemini.com", 0.02),
  fx("DSY", "Dassault Systèmes", "Logiciels", "FR", 30, 1.0, ["DASTY", 1], "3ds.com", 0.03),
  fx("RNO", "Renault", "Automobile", "FR", 45, 1.4, ["RNLSY", 5], "renaultgroup.com", 0.03),
  fx("UBI", "Ubisoft", "Jeux vidéo", "FR", 11, 2.2, ["UBSFY", 5], "ubisoft.com", -0.05),
  fx("SAP", "SAP", "Logiciels", "DE", 250, 1.0, ["SAP", 1], "sap.com", 0.08),
  fx("SIE", "Siemens", "Industrie", "DE", 220, 1.0, ["SIEGY", 2], "siemens.com", 0.06),
  fx("ALV", "Allianz", "Assurance", "DE", 350, 0.7, ["ALIZY", 10], "allianz.com", 0.06),
  fx("ADS", "Adidas", "Habillement", "DE", 190, 1.2, ["ADDYY", 2], "adidas.com", 0.03),
  fx("VOW3", "Volkswagen", "Automobile", "DE", 95, 1.2, ["VWAGY", 10], "volkswagen-group.com", 0),
  fx("BMW", "BMW", "Automobile", "DE", 80, 1.0, ["BMWYY", 3], "bmwgroup.com", 0.01),
  fx("MBG", "Mercedes-Benz", "Automobile", "DE", 55, 1.0, ["MBGYY", 4], "mercedes-benz.com", 0.01),
  fx("DBK", "Deutsche Bank", "Banque", "DE", 25, 1.3, ["DB", 1], "db.com", 0.06),
  fx("BAYN", "Bayer", "Santé", "DE", 28, 1.4, ["BAYRY", 4], "bayer.com", -0.02),
  fx("IFX", "Infineon", "Semi-conducteurs", "DE", 35, 1.4, ["IFNNY", 1], "infineon.com", 0.06),
  fx("DTE", "Deutsche Telekom", "Télécoms", "DE", 30, 0.6, ["DTEGY", 1], "telekom.com", 0.06),
  fx("RHM", "Rheinmetall", "Défense", "DE", 1700, 1.8, ["RNMBY", 5], "rheinmetall.com", 0.15),
  st("STLA", "Stellantis", "Automobile", "NL", 11, 1.4, { drift: 0, domain: "stellantis.com" }),
  fx("PHIA", "Philips", "Santé", "NL", 22, 1.0, ["PHG", 1], "philips.com", 0.02),
  fx("INGA", "ING", "Banque", "NL", 18, 1.0, ["ING", 1], "ing.com", 0.05),
  fx("HEIA", "Heineken", "Boissons", "NL", 75, 0.7, ["HEINY", 2], "theheinekencompany.com", 0.02),
  fx("ADYEN", "Adyen", "Paiements", "NL", 1400, 1.6, ["ADYEY", 100], "adyen.com", 0.06),
  fx("NESN", "Nestlé", "Consommation", "CH", 80, 0.5, ["NSRGY", 1], "nestle.com", 0.02),
  fx("ROG", "Roche", "Santé", "CH", 270, 0.7, ["RHHBY", 8], "roche.com", 0.03),
  fx("NOVN", "Novartis", "Santé", "CH", 95, 0.6, ["NVS", 1], "novartis.com", 0.04),
  fx("UBSG", "UBS", "Banque", "CH", 28, 1.1, ["UBS", 1], "ubs.com", 0.05),
  fx("SHEL", "Shell", "Énergie", "GB", 30, 0.8, ["SHEL", 0.5], "shell.com", 0.02),
  fx("BP", "BP", "Énergie", "GB", 4.5, 1.0, ["BP", 1 / 6], "bp.com", 0),
  fx("HSBA", "HSBC", "Banque", "GB", 10, 0.9, ["HSBC", 0.2], "hsbc.com", 0.05),
  fx("ULVR", "Unilever", "Consommation", "GB", 55, 0.6, ["UL", 1], "unilever.com", 0.03),
  st("AZN", "AstraZeneca", "Santé", "GB", 70, 0.8, { domain: "astrazeneca.com" }),
  fx("GSK", "GSK", "Santé", "GB", 17, 0.8, ["GSK", 0.5], "gsk.com", 0.02),
  fx("DGE", "Diageo", "Boissons", "GB", 25, 0.9, ["DEO", 0.25], "diageo.com", 0),
  st("RIO", "Rio Tinto", "Mines", "GB", 60, 1.0, { drift: 0.03, domain: "riotinto.com" }),
  st("ARM", "Arm Holdings", "Semi-conducteurs", "GB", 130, 2.0, { drift: 0.12, domain: "arm.com" }),
  st("NOVO", "Novo Nordisk", "Santé", "DK", 60, 1.4, { us: ["NVO", 1], domain: "novonordisk.com" }),
  st("SPOT", "Spotify", "Médias", "SE", 550, 1.5, { drift: 0.1, domain: "spotify.com" }),
  st("ERIC", "Ericsson", "Télécoms", "SE", 7, 1.0, { drift: 0.02, domain: "ericsson.com" }),
  st("NOK", "Nokia", "Télécoms", "FI", 4.5, 1.0, { drift: 0.02, domain: "nokia.com" }),
  st("EQNR", "Equinor", "Énergie", "NO", 22, 0.9, { drift: 0.02, domain: "equinor.com" }),
  st("RACE", "Ferrari", "Automobile", "IT", 400, 0.9, { drift: 0.1, domain: "ferrari.com" }),
  fx("ENI", "Eni", "Énergie", "IT", 14, 0.8, ["E", 0.5], "eni.com", 0.02),
  fx("SANT", "Banco Santander", "Banque", "ES", 6, 1.1, ["SAN", 1], "santander.com", 0.05),
  fx("ITX", "Inditex", "Habillement", "ES", 48, 0.9, ["IDEXY", 2], "inditex.com", 0.07),
  fx("IBE", "Iberdrola", "Énergie", "ES", 16, 0.6, ["IBDRY", 0.25], "iberdrola.com", 0.05),

  // ─── Asie ───
  st("TSM", "TSMC", "Semi-conducteurs", "TW", 190, 1.3, { drift: 0.12, domain: "tsmc.com", research: "us_stocks" }),
  st("SONY", "Sony", "Électronique", "JP", 22, 1.1, { drift: 0.06, domain: "sony.com" }),
  st("NTDOY", "Nintendo", "Jeux vidéo", "JP", 18, 1.2, { drift: 0.07, domain: "nintendo.com" }),
  st("TM", "Toyota", "Automobile", "JP", 170, 0.9, { drift: 0.04, domain: "toyota.com" }),
  st("HMC", "Honda", "Automobile", "JP", 28, 1.0, { drift: 0.02, domain: "honda.com" }),
  st("MUFG", "Mitsubishi UFJ", "Banque", "JP", 12, 1.1, { drift: 0.06, domain: "mufg.jp" }),
  st("BABA", "Alibaba", "Commerce en ligne", "CN", 110, 1.8, { drift: 0.04, domain: "alibaba.com" }),
  st("PDD", "PDD Holdings (Temu)", "Commerce en ligne", "CN", 110, 1.9, { drift: 0.04, domain: "pddholdings.com" }),
  st("JD", "JD.com", "Commerce en ligne", "CN", 32, 1.7, { drift: 0.02, domain: "jd.com" }),
  st("TCEHY", "Tencent", "Jeux vidéo", "CN", 60, 1.3, { drift: 0.06, domain: "tencent.com" }),
  st("BIDU", "Baidu", "Technologie", "CN", 90, 1.6, { drift: 0.01, domain: "baidu.com" }),
  st("NIO", "NIO", "Automobile", "CN", 5, 2.5, { drift: -0.02, domain: "nio.com" }),
  st("INFY", "Infosys", "Technologie", "IN", 18, 1.0, { drift: 0.05, domain: "infosys.com" }),
  st("HDB", "HDFC Bank", "Banque", "IN", 65, 0.8, { drift: 0.06, domain: "hdfcbank.com" }),
  st("SE", "Sea Limited", "Commerce en ligne", "SG", 120, 1.9, { drift: 0.1, domain: "sea.com" }),

  // ─── Autres pays ───
  st("SHOP", "Shopify", "Commerce en ligne", "CA", 90, 1.8, { drift: 0.1, domain: "shopify.com" }),
  st("RY", "Royal Bank of Canada", "Banque", "CA", 120, 0.6, { drift: 0.05, domain: "rbc.com" }),
  st("ENB", "Enbridge", "Énergie", "CA", 42, 0.6, { drift: 0.03, domain: "enbridge.com" }),
  st("MELI", "MercadoLibre", "Commerce en ligne", "AR", 1900, 1.4, { drift: 0.12, domain: "mercadolibre.com" }),
  st("NU", "Nubank", "Banque", "BR", 12, 1.8, { drift: 0.1, domain: "nubank.com.br" }),
  st("VALE", "Vale", "Mines", "BR", 9, 1.3, { drift: 0.01, domain: "vale.com" }),
  st("PBR", "Petrobras", "Énergie", "BR", 13, 1.3, { drift: 0.02, domain: "petrobras.com.br" }),
  st("BHP", "BHP", "Mines", "AU", 50, 1.0, { drift: 0.03, domain: "bhp.com" }),

  // ─── ETF ───
  etf("SPY", "ETF S&P 500", "Indice", "US", 590),
  etf("QQQ", "ETF Nasdaq 100", "Indice", "US", 520, 0.8, 0.1),
  etf("DIA", "ETF Dow Jones", "Indice", "US", 430),
  etf("IWM", "ETF Russell 2000 (petites entreprises)", "Indice", "US", 220, 0.9, 0.05),
  etf("VTI", "ETF marché américain total", "Indice", "US", 290),
  etf("CAC", "ETF CAC 40", "Indice", "FR", 78, 0.6, 0.06, "CAC.PA"),
  etf("EWQ", "ETF MSCI France", "Pays", "FR", 38, 0.7, 0.05),
  etf("EWG", "ETF MSCI Allemagne", "Pays", "DE", 38, 0.7, 0.05),
  etf("EWU", "ETF MSCI Royaume-Uni", "Pays", "GB", 36, 0.6, 0.04),
  etf("VGK", "ETF Europe", "Pays", "EU", 68, 0.7, 0.05),
  etf("EFA", "ETF pays développés hors États-Unis", "Pays", "WW", 80, 0.6, 0.05),
  etf("EEM", "ETF marchés émergents", "Pays", "WW", 45, 0.8, 0.05),
  etf("EWJ", "ETF MSCI Japon", "Pays", "JP", 68, 0.6, 0.05),
  etf("FXI", "ETF grandes entreprises chinoises", "Pays", "CN", 32, 1.1, 0.03),
  etf("INDA", "ETF MSCI Inde", "Pays", "IN", 50, 0.7, 0.07),
  etf("EWZ", "ETF MSCI Brésil", "Pays", "BR", 26, 1.1, 0.03),
  etf("XLK", "ETF secteur technologie", "Sectoriel", "US", 230, 0.9, 0.1),
  etf("SOXX", "ETF semi-conducteurs", "Sectoriel", "US", 220, 1.4, 0.12),
  etf("XLF", "ETF secteur financier", "Sectoriel", "US", 48, 0.7, 0.06),
  etf("XLE", "ETF secteur énergie", "Sectoriel", "US", 85, 0.8, 0.02),
  etf("XLV", "ETF secteur santé", "Sectoriel", "US", 135, 0.6, 0.05),
  etf("ITA", "ETF aéronautique et défense", "Sectoriel", "US", 160, 0.8, 0.08),
  etf("ICLN", "ETF énergie propre", "Sectoriel", "WW", 12, 1.2, 0.02),
  etf("ARKK", "ETF ARK Innovation", "Sectoriel", "US", 60, 1.9, 0.05),
  etf("TLT", "ETF obligations d'État américaines 20 ans et +", "Obligations", "US", 85, 0.5, 0),

  // ─── Matières premières (ETF qui suivent le cours) ───
  raw("GLD", "Or", "Métaux précieux", "Au", 280, 0.6, 0.06),
  raw("SLV", "Argent", "Métaux précieux", "Ag", 30, 1.1, 0.05),
  raw("PPLT", "Platine", "Métaux précieux", "Pt", 90, 1.1, 0.02),
  raw("CPER", "Cuivre", "Métaux industriels", "Cu", 28, 1.0, 0.03),
  raw("USO", "Pétrole WTI", "Énergie", "WTI", 70, 1.4, 0),
  raw("BNO", "Pétrole Brent", "Énergie", "BRT", 28, 1.3, 0),
  raw("UNG", "Gaz naturel", "Énergie", "GAZ", 14, 2.2, -0.05),
  raw("URA", "Uranium (mines)", "Énergie", "U", 30, 1.5, 0.06),
  raw("DBA", "Agriculture (panier)", "Agriculture", "AGR", 24, 0.7, 0.02),
  raw("WEAT", "Blé", "Agriculture", "BLÉ", 5, 1.2, -0.02),
  raw("CORN", "Maïs", "Agriculture", "MAÏS", 18, 1.0, -0.01),
  raw("SOYB", "Soja", "Agriculture", "SOJA", 21, 0.9, 0),

  // ─── Cryptomonnaies (cotées 24 h / 24, 7 j / 7) ───
  coin("BTC", "Bitcoin", "bitcoin", 90_000, 1.6, 0.15),
  coin("ETH", "Ethereum", "ethereum", 3000, 2.0),
  coin("SOL", "Solana", "solana", 150, 2.6),
  coin("XRP", "XRP", "ripple", 2, 2.4),
  coin("BNB", "BNB", "binancecoin", 600, 1.7),
  coin("DOGE", "Dogecoin", "dogecoin", 0.2, 3.0, 0.05),
  coin("ADA", "Cardano", "cardano", 0.6, 2.6, 0.05),
  coin("AVAX", "Avalanche", "avalanche-2", 25, 2.8, 0.05),
  coin("LINK", "Chainlink", "chainlink", 15, 2.6),
  coin("DOT", "Polkadot", "polkadot", 5, 2.6, 0),
  coin("LTC", "Litecoin", "litecoin", 90, 2.0, 0.03),
  coin("TRX", "TRON", "tron", 0.25, 1.8, 0.05),
];

export const ASSET_BY_SYMBOL: Record<string, Asset> = Object.fromEntries(ASSETS.map((x) => [x.symbol, x]));

export const KIND_LABEL: Record<AssetKind, string> = { stock: "Actions", etf: "ETF", commodity: "Matières premières", crypto: "Crypto" };

/** Drapeau emoji d'un code pays (🌐 pour « mondial », 🇪🇺 pour l'Europe). */
export function flag(country: string): string {
  if (country === "WW") return "🌐";
  if (!/^[A-Z]{2}$/.test(country)) return "";
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Les cryptomonnaies s'achètent par fractions. */
export const fractional = (symbol: string) => ASSET_BY_SYMBOL[symbol]?.kind === "crypto";
