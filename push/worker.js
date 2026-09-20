/**
 * Piccolo servizio per le notifiche, da mettere su Cloudflare Workers.
 * Tiene l'elenco di chi si e' iscritto (in uno spazio KV chiamato ISCRITTI)
 * e, quando l'automazione di GitHub glielo chiede, manda a tutti una
 * "spinta" senza contenuto: sara' l'app sul telefono a leggere il
 * messaggio da docs/notifica.json e a mostrarlo.
 *
 * Variabili da impostare su Cloudflare:
 *   VAPID_PUBBLICA  chiave pubblica (visibile, la usa anche l'app)
 *   VAPID_PRIVATA   chiave privata in formato JWK  -> segreta
 *   SEGRETO         parola d'ordine che usa GitHub -> segreta
 *   CONTATTO        "mailto:tuo@indirizzo" (lo chiedono i servizi push)
 */

const b64 = d => btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const testo = s => new TextEncoder().encode(s);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-segreto',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
const risposta = (dati, stato = 200) =>
  new Response(JSON.stringify(dati), { status: stato, headers: { 'content-type': 'application/json', ...CORS } });

/** Il lasciapassare firmato che dimostra ai servizi push chi siamo. */
export async function firmaVapid(destinazione, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATA);
  const chiave = await crypto.subtle.importKey(
    'jwk', { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y, key_ops: ['sign'], ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const testa = b64(testo(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64(testo(JSON.stringify({
    aud: new URL(destinazione).origin,
    exp: Math.floor(Date.now() / 1000) + 11 * 3600,
    sub: env.CONTATTO || 'mailto:volley@example.com',
  })));
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chiave, testo(`${testa}.${corpo}`));
  return `${testa}.${corpo}.${b64(firma)}`;
}

/** Una spinta senza contenuto verso un singolo telefono. */
async function spingi(iscritto, env) {
  const t = await firmaVapid(iscritto.endpoint, env);
  const r = await fetch(iscritto.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Urgency: 'high',
      'Content-Length': '0',
      Authorization: `vapid t=${t}, k=${env.VAPID_PUBBLICA}`,
    },
  });
  return r.status;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // l'app chiede la chiave pubblica per potersi iscrivere
    if (url.pathname === '/chiave') return risposta({ chiave: env.VAPID_PUBBLICA });

    // un telefono si iscrive (o si cancella)
    if (url.pathname === '/iscritti' && req.method === 'POST') {
      const sub = await req.json().catch(() => null);
      if (!sub?.endpoint) return risposta({ errore: 'iscrizione non valida' }, 400);
      await env.ISCRITTI.put(sub.endpoint, JSON.stringify({ endpoint: sub.endpoint, dal: new Date().toISOString() }));
      return risposta({ ok: true });
    }
    if (url.pathname === '/iscritti' && req.method === 'DELETE') {
      const sub = await req.json().catch(() => null);
      if (sub?.endpoint) await env.ISCRITTI.delete(sub.endpoint);
      return risposta({ ok: true });
    }

    // GitHub chiede di avvisare tutti
    if (url.pathname === '/avvisa' && req.method === 'POST') {
      if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
      const elenco = await env.ISCRITTI.list();
      let inviate = 0, tolti = 0;
      for (const k of elenco.keys) {
        const iscritto = JSON.parse(await env.ISCRITTI.get(k.name));
        let stato = 0;
        try { stato = await spingi(iscritto, env); } catch (e) { stato = 0; }
        if (stato === 404 || stato === 410) { await env.ISCRITTI.delete(k.name); tolti++; }
        else if (stato >= 200 && stato < 300) inviate++;
      }
      return risposta({ inviate, tolti, iscritti: elenco.keys.length });
    }

    return risposta({ errore: 'non trovato' }, 404);
  },
};
