"use client";
// Temps réel de Supabase (protocole Phoenix sur WebSocket), réduit au strict nécessaire : être prévenu quand une ligne
// est ajoutée à une table. Aucune dépendance : quelques messages JSON suffisent.
// Le serveur n'envoie que les lignes que le joueur a le droit de lire (mêmes règles que pour une lecture normale).
import { SUPABASE_ANON, SUPABASE_URL } from "./market/client";

export interface Watch {
  /** Vrai une fois l'abonnement confirmé par le serveur : on peut alors cesser de l'interroger souvent. */
  readonly live: boolean;
  close(): void;
}

/** Prévient `onInsert` à chaque ligne ajoutée dans `table`, et `onLive` quand l'abonnement est prêt ou perdu.
 *  Se reconnecte tout seul (5 s, puis de plus en plus espacé) tant qu'il n'est pas fermé. */
export function watchInserts(table: string, token: () => Promise<string | null>, onInsert: () => void, onLive: (live: boolean) => void): Watch {
  let ws: WebSocket | null = null, closed = false, live = false, ref = 0, beat: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null, wait = 5_000;
  const topic = `realtime:${table}`;
  const setLive = (v: boolean) => { if (v !== live) { live = v; onLive(v); } };
  const send = (event: string, payload: unknown, t = topic) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) }));
  };
  const stop = () => {
    if (beat) clearInterval(beat);
    beat = null;
    setLive(false);
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch { /* déjà fermé */ } }
    ws = null;
  };
  const again = () => {
    stop();
    if (closed || retry) return;
    retry = setTimeout(() => { retry = null; void open(); }, wait);
    wait = Math.min(wait * 2, 120_000);
  };
  const open = async () => {
    if (closed) return;
    const access = await token();
    if (!access || closed) { again(); return; }
    const host = SUPABASE_URL.replace(/^http/, "ws");
    try { ws = new WebSocket(`${host}/realtime/v1/websocket?apikey=${SUPABASE_ANON}&vsn=1.0.0`); } catch { again(); return; }
    ws.onopen = () => {
      send("phx_join", {
        config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [{ event: "INSERT", schema: "public", table }], private: false },
        access_token: access,
      });
      beat = setInterval(() => send("heartbeat", {}, "phoenix"), 25_000);
    };
    ws.onmessage = (e) => {
      let m: { event?: string; payload?: { status?: string; extension?: string } };
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.event === "postgres_changes") onInsert();
      // Le serveur confirme (ou refuse) l'abonnement aux changements de la table
      else if (m.event === "system" && m.payload?.extension === "postgres_changes") {
        if (m.payload.status === "ok") { setLive(true); wait = 5_000; } else again();
      } else if (m.event === "phx_error" || (m.event === "phx_reply" && m.payload?.status === "error")) again();
    };
    ws.onclose = () => again();
    ws.onerror = () => { /* suivi d'un onclose */ };
  };
  void open();
  return {
    get live() { return live; },
    close() { closed = true; if (retry) clearTimeout(retry); retry = null; stop(); },
  };
}
