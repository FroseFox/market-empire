import { getQuotes, dataMode } from "@/lib/market/provider";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbols = url.searchParams.get("symbols")?.split(",").filter(Boolean).slice(0, 60);
  const quotes = await getQuotes(symbols);
  return Response.json({ mode: dataMode(), logos: !!process.env.LOGO_DEV_KEY, quotes, serverTime: Date.now() }, {
    // Partagé par tous les joueurs pendant 60 s : protège les quotas de l'API
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
