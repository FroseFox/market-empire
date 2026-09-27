import { getQuotes, dataMode } from "@/lib/market/provider";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbols = url.searchParams.get("symbols")?.split(",").filter(Boolean);
  const quotes = await getQuotes(symbols);
  return Response.json({ mode: dataMode(), quotes, serverTime: Date.now() });
}
