const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const eur = (v: number) => `${nf0.format(Math.round(v))} €`;
export const eur2 = (v: number) => `${nf2.format(v)} €`;
export const num = (v: number) => nf0.format(Math.round(v));
export const signedEur = (v: number) => `${v >= 0 ? "+" : "−"}${nf0.format(Math.abs(Math.round(v)))} €`;
export const pct = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits).replace(".", ",")} %`;
export const pctPlain = (v: number) => `${Math.round(v * 100)} %`;

export function compactEur(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2).replace(".", ",")} M€`;
  if (a >= 1e4) return `${Math.round(v / 1e3)} k€`;
  return eur(v);
}

export const tone = (v: number) => (v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted");
