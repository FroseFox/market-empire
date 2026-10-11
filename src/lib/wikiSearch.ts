// Recherche du wiki : elle trouve des passages (un paragraphe, une ligne de tableau, un titre), pas seulement des rubriques,
// et tolère ce qu'un joueur tape vraiment : pluriel, accent oublié, début de mot, faute d'une lettre, mot voisin
// (« argent » pour « liquidités »). Aucune dépendance : le wiki tient dans une page, tout se fait à la frappe.

/** Un passage du wiki. `key` l'identifie pour la page ; `kind` : titre de rubrique, intertitre ou texte courant. */
export interface WikiBlock { key: number; section: string; sectionTitle: string; heading: string; kind: "title" | "heading" | "text"; text: string }
export interface WikiHit { block: WikiBlock; score: number; snippet: { text: string; hit: boolean }[] }

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");

/** Mots vides : ils ne comptent pas, sauf si la recherche n'est faite que d'eux. */
const STOP = new Set("a au aux ce ces c comment d dans de des du en est et il je j l la le les ma mes mon ne on ou par pas pour qu que quel quelle qui quoi sa se ses son sur un une y faire fait avoir etre mes ca".split(" "));

/** Mots voisins : ce que le joueur dit → ce que le wiki écrit (formes sans accent, au singulier).
 *  Le mot du wiki doit être exactement celui-là : sur un simple début, « appli » trouvait « applique ». */
const NEAR: Record<string, string[]> = {
  argent: ["liquidite"], cash: ["liquidite"], sous: ["liquidite"], thune: ["liquidite"],
  pret: ["emprunt", "dette", "levier"], credit: ["emprunt", "dette"], emprunter: ["emprunt"],
  taxe: ["impot"], maison: ["quartier", "logement"], logement: ["quartier"], habitant: ["population"], gens: ["population", "habitant"],
  electricite: ["energie"], courant: ["energie"], nourriture: ["alimentation"], bouffe: ["alimentation"],
  action: ["titre", "placement"], investir: ["placement", "acheter"], gagner: ["rapporte", "revenu", "gain"], perdre: ["perte"],
  niveau: ["rang"], grade: ["rang"], joueur: ["ville", "classement"], ami: ["alliance"], equipe: ["alliance"], clan: ["alliance"], guilde: ["alliance"],
  attaque: ["blocus", "guerre"], attaquer: ["blocus", "guerre"], defense: ["bouclier"], proteger: ["bouclier"],
  catastrophe: ["evenement"], bonheur: ["satisfaction"], content: ["satisfaction"], chomage: ["emploi"], travail: ["emploi"], job: ["emploi"],
  save: ["sauvegarde"], notif: ["notification"], telephone: ["appli"], mobile: ["appli"], app: ["appli"], telecharger: ["appli"], installation: ["appli"],
  crypto: ["cryptomonnaie"], bitcoin: ["cryptomonnaie"], vendre: ["vente"], acheter: ["achat"], detruire: ["demolir", "demolition"], supprimer: ["demolir", "demolition"],
  agrandir: ["terrain", "territoire"], carte: ["monde", "pays"], echange: ["commerce", "contrat"], trade: ["commerce", "contrat"],
};

/** Singulier approximatif : « impôts » → « impot », « niveaux » → « niveau ». */
export const stem = (w: string) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);

/** Une lettre de différence au plus (remplacée, en trop ou en moins), jamais la première :
 *  on se trompe rarement sur l'initiale, et sans cette règle « polution » trouvait « solution ». */
function close(a: string, b: string): boolean {
  if (a[0] !== b[0] || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, miss = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++miss > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return miss + (a.length - i) + (b.length - j) <= 1;
}

/** Force de la correspondance entre un mot tapé et un mot du wiki : 0 = aucune. */
function grade(q: string, token: string): number {
  if (token === q || stem(token) === q) return 4;
  if (token.startsWith(q)) return q.length >= 2 ? 3 : 0;
  if (q.length >= 4 && token.includes(q)) return 2;
  if (q.length >= 5 && token.length >= 5 && close(q, stem(token))) return 1.5;
  return 0;
}

interface Term { word: string; near: string[] }
function terms(query: string): Term[] {
  const all = norm(query).split(/[^a-z0-9]+/).filter(Boolean);
  const kept = all.filter((w) => !STOP.has(w));
  return (kept.length ? kept : all).map((w) => { const s = stem(w); return { word: s, near: NEAR[s] ?? NEAR[w] ?? [] }; });
}

const WORD = /[\p{L}\p{N}]+/gu;
/** Mots d'un texte, avec leur place dans le texte d'origine (les accents ne décalent rien). */
function tokens(text: string): { t: string; from: number; to: number }[] {
  const out: { t: string; from: number; to: number }[] = [];
  for (const m of text.matchAll(WORD)) out.push({ t: norm(m[0]), from: m.index, to: m.index + m[0].length });
  return out;
}

function best(term: Term, toks: { t: string }[]): number {
  let g = 0;
  for (const k of toks) {
    g = Math.max(g, grade(term.word, k.t));
    for (const n of term.near) if (grade(n, k.t) === 4) g = Math.max(g, 1.5);
    if (g === 4) break;
  }
  return g;
}

/** Vrai si ce mot du wiki répond à la recherche : sert à le surligner dans la page. */
export function matcher(query: string): (word: string) => boolean {
  const ts = terms(query);
  return (word) => { const t = norm(word); return ts.some((x) => grade(x.word, t) > 0 || x.near.some((n) => grade(n, t) === 4)); };
}

const KIND = { title: 3, heading: 2, text: 1 } as const;

/** Passages qui répondent à la recherche, les plus pertinents d'abord. Chaque mot tapé doit se retrouver dans le passage,
 *  ou à défaut dans son intertitre ou le titre de sa rubrique (« levier banque » trouve les paragraphes de « Levier et Banque »). */
export function searchWiki(query: string, blocks: WikiBlock[]): WikiHit[] {
  const ts = terms(query);
  if (!ts.length) return [];
  const hits: WikiHit[] = [];
  for (const b of blocks) {
    const toks = tokens(b.text);
    const around = b.kind === "text" ? tokens(`${b.sectionTitle} ${b.heading}`) : b.kind === "heading" ? tokens(b.sectionTitle) : [];
    let score = 0, inside = 0, ok = true;
    for (const term of ts) {
      const here = best(term, toks);
      if (here) { score += here; inside++; continue; }
      const ctx = best(term, around);
      if (!ctx) { ok = false; break; }
      score += ctx * 0.4;
    }
    if (!ok || !inside) continue;
    // Un passage court qui répond pèse plus qu'un long paragraphe qui cite le mot en passant
    score = score * KIND[b.kind] * (1 + 12 / (toks.length + 12));
    hits.push({ block: b, score, snippet: snippet(b.text, toks, matcher(query)) });
  }
  return hits.sort((a, b) => b.score - a.score || a.block.key - b.block.key);
}

/** Extrait d'environ 150 caractères autour du premier mot trouvé, découpé en morceaux à surligner ou non. */
function snippet(text: string, toks: { t: string; from: number; to: number }[], is: (w: string) => boolean): { text: string; hit: boolean }[] {
  const marks = toks.filter((k) => is(k.t));
  const MAX = 150;
  let from = 0, to = text.length;
  if (text.length > MAX) {
    const first = marks[0]?.from ?? 0;
    from = Math.max(0, first - 45);
    if (from > 0) { const sp = text.indexOf(" ", from); if (sp >= 0 && sp < first) from = sp + 1; }
    to = Math.min(text.length, from + MAX);
    if (to < text.length) { const sp = text.lastIndexOf(" ", to); if (sp > from + 60) to = sp; }
  }
  const parts: { text: string; hit: boolean }[] = [];
  let at = from;
  const push = (s: string, hit: boolean) => { if (s) parts.push({ text: s, hit }); };
  if (from > 0) push("… ", false);
  for (const m of marks) {
    if (m.from < at || m.to > to) continue;
    push(text.slice(at, m.from), false);
    push(text.slice(m.from, m.to), true);
    at = m.to;
  }
  push(text.slice(at, to), false);
  if (to < text.length) push(" …", false);
  return parts;
}
