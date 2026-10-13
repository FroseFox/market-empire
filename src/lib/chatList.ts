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

