// Liste des messages du chat (pur, testé) : voir lib/chat.ts.
export interface ChatMessage { id: number; author: string; name: string; body: string; at: number }

/** Messages gardés par salon : au-delà, les plus anciens sortent de l'écran. */
export const MAX = 120;

/** Fusionne des messages reçus (sans doublon, dans l'ordre, les plus anciens au-delà de MAX retirés). Pur, testé. */
export function mergeMessages(list: ChatMessage[], add: ChatMessage[]): ChatMessage[] {
  if (!add.length) return list;
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-MAX);
}

/** Les messages de plus de 24 h ne s'affichent plus, même si la page reste ouverte. */
export const fresh = (list: ChatMessage[], now: number) => list.filter((m) => now - m.at < 86_400_000);


// ─── Mentions « @Pseudo » ───
// Un pseudo peut contenir des espaces, des points et des tirets : on ne devine pas où il s'arrête, on cherche les
// pseudos connus (le plus long d'abord, sans tenir compte des majuscules). Après le pseudo : fin du texte ou un caractère
// qui n'est ni une lettre ni un chiffre (« @Léo, salut » mentionne Léo, « @Léonard » ne le mentionne pas) ; avant
// l'arobase, pareil (une adresse e-mail n'est pas une mention).
const WORD = /[\p{L}\p{N}_]/u;

/** Le pseudo `name` est-il mentionné (« @name ») dans `body` ? */
export function mentions(body: string, name: string): boolean {
  if (!name) return false;
  const b = body.toLocaleLowerCase("fr"), n = `@${name.toLocaleLowerCase("fr")}`;
  for (let i = b.indexOf(n); i >= 0; i = b.indexOf(n, i + 1)) {
    const after = b[i + n.length], before = b[i - 1];
    if ((after === undefined || !WORD.test(after)) && (before === undefined || !WORD.test(before))) return true;
  }
  return false;
}

export type Segment = { text: string; mention?: string };

/** Découpe un message en morceaux de texte et en mentions de pseudos connus (pour les afficher en couleur). */
export function splitMentions(body: string, names: string[]): Segment[] {
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  const lower = body.toLocaleLowerCase("fr");
  const out: Segment[] = [];
  let from = 0, text = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "@" || (i > 0 && WORD.test(body[i - 1]))) continue;
    const hit = sorted.find((n) => {
      if (!lower.startsWith(n.toLocaleLowerCase("fr"), i + 1)) return false;
      const after = body[i + 1 + n.length];
      return after === undefined || !WORD.test(after);
    });
    if (!hit) continue;
    text = body.slice(from, i);
    if (text) out.push({ text });
    out.push({ text: body.slice(i, i + 1 + hit.length), mention: hit });
    from = i + 1 + hit.length;
    i = from - 1;
  }
  if (from < body.length) out.push({ text: body.slice(from) });
  return out;
}

/** Saisie en cours : « @dé » juste avant le curseur → « dé » (ce qu'il faut compléter), sinon `null`. */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|[^\p{L}\p{N}_])@([\p{L}\p{N} _.-]{0,20})$/u.exec(before);
  if (!m) return null;
  // Deux espaces de suite : ce n'est plus un pseudo
  if (/\s{2}/.test(m[2])) return null;
  return { query: m[2], start: before.length - m[2].length - 1 };
}

/** Pseudos proposés pour compléter `query` (qui commencent par ce qui est tapé), 5 au plus. */
export function mentionChoices(query: string, names: string[], me?: string | null): string[] {
  const q = query.toLocaleLowerCase("fr");
  return [...new Set(names)]
    .filter((n) => n && n !== me && n.toLocaleLowerCase("fr").startsWith(q))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .slice(0, 5);
}
