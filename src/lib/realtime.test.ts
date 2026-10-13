import { afterEach, describe, expect, it, vi } from "vitest";
import { watchInserts } from "./realtime";

/** Faux WebSocket : garde les messages envoyés, et laisse le test jouer le serveur. */
class FakeSocket {
  static last: FakeSocket | null = null;
  static OPEN = 1;
  readyState = 1;
  sent: { topic: string; event: string; payload: Record<string, unknown> }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; }
  server(event: string, payload: unknown = {}) { this.onmessage?.({ data: JSON.stringify({ topic: "realtime:chat_messages", event, payload }) }); }
}

afterEach(() => { vi.unstubAllGlobals(); FakeSocket.last = null; });

describe("watchInserts", () => {
  it("s'abonne aux ajouts de la table, avec le jeton du joueur, et prévient à chaque ajout", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const inserts = vi.fn(), live = vi.fn();
    const w = watchInserts("chat_messages", async () => "jeton", inserts, live);
    await vi.waitFor(() => expect(FakeSocket.last).not.toBeNull());
    const ws = FakeSocket.last!;
    expect(ws.url).toMatch(/^wss:\/\/.*\/realtime\/v1\/websocket\?apikey=.*&vsn=1\.0\.0$/);
    ws.onopen!();
    const join = ws.sent[0];
    expect(join.event).toBe("phx_join");
    expect(join.payload.access_token).toBe("jeton");
    expect(JSON.stringify(join.payload.config)).toContain('"table":"chat_messages"');
    expect(w.live).toBe(false);
    ws.server("system", { status: "ok", extension: "postgres_changes" });
    expect(w.live).toBe(true);
    expect(live).toHaveBeenLastCalledWith(true);
    ws.server("postgres_changes", { data: {} });
    expect(inserts).toHaveBeenCalledTimes(1);
    w.close();
    expect(live).toHaveBeenLastCalledWith(false);
  });

  it("abonnement refusé : pas de temps réel (le chat garde sa relecture rapide)", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    const w = watchInserts("chat_messages", async () => "jeton", () => {}, () => {});
    await vi.waitFor(() => expect(FakeSocket.last).not.toBeNull());
    FakeSocket.last!.onopen!();
    FakeSocket.last!.server("system", { status: "error", extension: "postgres_changes" });
    expect(w.live).toBe(false);
    w.close();
  });
});
