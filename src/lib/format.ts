const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const eur = (v: number) => `${nf0.format(Math.round(v))} €`;
const nf4 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** Montant au centime ; les tout petits prix (cryptos à moins d'1 €) gardent 4 décimales. */
export const eur2 = (v: number) => `${(Math.abs(v) < 1 && v !== 0 ? nf4 : nf2).format(v)} €`;
/** Quantité : entière pour les actions, jusqu'à 4 décimales pour les cryptos. */
const nfQty = [4, 2, 0].map((d) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }));
/** Quantité de titres : moins de décimales quand le nombre est grand, pour rester lisible. */
export const qtyFmt = (v: number) => nfQty[Math.abs(v) >= 100_000 ? 2 : Math.abs(v) >= 1000 ? 1 : 0].format(v);
export const num = (v: number) => nf0.format(Math.round(v));
export const signedEur = (v: number) => `${v >= 0 ? "+" : "−"}${nf0.format(Math.abs(Math.round(v)))} €`;
/** Pourcentage signé. Une baisse trop petite pour s'afficher ne s'écrit pas « −0,0 % ». */
export const pct = (v: number, digits = 1) => { const t = Math.abs(v * 100).toFixed(digits); return `${v >= 0 || Number(t) === 0 ? "+" : "−"}${t.replace(".", ",")} %`; };
export const pctPlain = (v: number) => `${Math.round(v * 100)} %`;

export function compactEur(v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2).replace(".", ",")} M€`;
  if (a >= 1e4) return `${Math.round(v / 1e3)} k€`;
  return eur(v);
}

/** Capital (deuxième monnaie, produite par les placements) : même abréviation que les euros, avec son propre signe. */
export const capitalFmt = (v: number) => compactEur(Math.floor(v)).replace("€", "◆");

export const tone = (v: number) => (v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted");
