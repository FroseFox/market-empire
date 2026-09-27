import { ASSET_BY_SYMBOL } from "@/lib/market/universe";

// Logo d'une entreprise, récupéré côté serveur chez Logo.dev.
// La clé (LOGO_DEV_KEY) reste privée : le navigateur ne la voit jamais.
export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("s") ?? "";
  const asset = ASSET_BY_SYMBOL[symbol];
  const key = process.env.LOGO_DEV_KEY;
  if (!asset || asset.kind !== "stock" || !key) return new Response(null, { status: 404 });

  const res = await fetch(`https://img.logo.dev/ticker/${encodeURIComponent(asset.providerSymbol)}?token=${key}&size=96&format=png&retina=true`);
  if (!res.ok) return new Response(null, { status: 404 });
  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/png",
      // Les logos changent rarement : cache d'une semaine
      "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
    },
  });
}
