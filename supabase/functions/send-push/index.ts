// Market Empire — envoi des notifications (Supabase Edge Function « send-push »).
// Appelée chaque minute par pg_cron quand la file `push_queue` contient un message à envoyer.
// Elle ne reçoit aucun paramètre : elle ne fait qu'envoyer ce qui est dû, donc l'appeler « pour rien » est sans effet.
// Les clés du serveur (VAPID) sont créées ici au premier passage et gardées dans `push_config` : personne ne les manipule.
import { generateVapidKeys, sendPush, type Subscription, type VapidKeys } from "./webpush.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
/** Contact annoncé aux services de notifications (exigé par la norme). */
const SUBJECT = "https://frosefox.github.io/market-empire/";
const HOSTS = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)\//;
const BATCH = 100;

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function keys(): Promise<VapidKeys | null> {
  const read = async () => {
    const r = await db("push_config?select=public_key,private_jwk&id=eq.1");
    const rows = r.ok ? await r.json() as { public_key: string; private_jwk: JsonWebKey }[] : [];
    return rows[0] ? { publicKey: rows[0].public_key, privateJwk: rows[0].private_jwk } : null;
  };
  const have = await read();
  if (have) return have;
  const made = await generateVapidKeys();
  // Deux passages en même temps : le premier gagne, l'autre relit
  await db("push_config", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: 1, public_key: made.publicKey, private_jwk: made.privateJwk }) });
  return read();
}

interface Job { id: number; user_id: string; kind: string; title: string; body: string; url: string }

Deno.serve(async () => {
  try {
    const k = await keys();
    if (!k) return json({ error: "clés indisponibles" }, 500);
    const due = await db(`push_queue?select=id,user_id,kind,title,body,url&sent_at=is.null&send_at=lte.${new Date().toISOString()}&order=send_at.asc&limit=${BATCH}`);
    const jobs = due.ok ? await due.json() as Job[] : [];
    let sent = 0, gone = 0, failed = 0;
    for (const job of jobs) {
      // Marqué d'abord : un message ne part jamais deux fois, même si la fonction est interrompue
      const mark = await db(`push_queue?id=eq.${job.id}&sent_at=is.null`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ sent_at: new Date().toISOString() }) });
      if (!mark.ok || (await mark.json() as unknown[]).length === 0) continue;
      const s = await db(`push_subs?select=endpoint,p256dh,auth&user_id=eq.${job.user_id}`);
      const subs = s.ok ? await s.json() as Subscription[] : [];
      const text = JSON.stringify({ title: job.title, body: job.body, url: job.url, tag: job.kind });
      for (const sub of subs) {
        if (!HOSTS.test(sub.endpoint)) continue;
        try {
          const status = await sendPush(sub, text, k, SUBJECT);
          if (status === 404 || status === 410) { gone++; await db(`push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" }); }
          else if (status >= 200 && status < 300) sent++;
          else failed++;
        } catch { failed++; }
      }
    }
    return json({ jobs: jobs.length, sent, gone, failed });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
