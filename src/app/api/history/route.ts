import { getHistory } from "@/lib/market/provider";
import { RANGES, type Range } from "@/lib/market/simulate";
import { ASSET_BY_SYMBOL } from "@/lib/market/universe";

const TTL: Record<Range, number> = { "1J": 600, "1S": 3600, "1M": 21600, "1A": 43200 };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "";
  const range = (url.searchParams.get("range") ?? "1M") as Range;
  if (!ASSET_BY_SYMBOL[symbol] || !RANGES[range]) {
    return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  const { points, source } = await getHistory(symbol, range);
  return Response.json({ symbol, range, points, source }, {
    headers: { "Cache-Control": `public, s-maxage=${TTL[range]}, stale-while-revalidate=${TTL[range]}` },
  });
}
