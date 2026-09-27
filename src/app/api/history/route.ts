import { getQuotes } from "@/lib/market/provider";
import { RANGES, simulatedHistory, type Range } from "@/lib/market/simulate";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";

// Historique : simulé pour l'instant (l'historique en bougies n'est pas inclus
// dans l'offre gratuite Finnhub). En mode réel, la courbe est recalée pour
// finir sur le vrai dernier prix, et marquée comme « indicative ».
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "";
  const range = (url.searchParams.get("range") ?? "1M") as Range;
  if (!ASSET_BY_SYMBOL[symbol] || !RANGES[range]) {
    return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  const now = Date.now();
  let points = simulatedHistory(symbol, range, now);
  const [quote] = await getQuotes([symbol]);
  let indicative = false;
  if (quote && quote.source !== "simulé") {
    const k = quote.price / points[points.length - 1].p;
    points = points.map((p) => ({ t: p.t, p: Math.round(p.p * k * 100) / 100 }));
    indicative = true;
  }
  return Response.json({ symbol, range, points, indicative });
}
