/**
 * Piccolo servizio per le notifiche, da mettere su Cloudflare Workers.
 * Fa anche da sentinella: GitHub gli manda un "battito" a ogni giro e, se
 * il battito si ferma, il servizio se ne accorge da solo e avvisa. Sta
 * apposta fuori da GitHub: un guardiano che vive nella stessa casa di cio'
 * che sorveglia non serve a niente.
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
// Solo i veri servizi push dei telefoni: cosi' nessuno puo' riempire
// l'elenco di indirizzi inventati.
const SERVIZI_VERI = [
  /^https:\/\/[a-z0-9.-]+\.push\.apple\.com\//i,
  /^https:\/\/fcm\.googleapis\.com\//i,
  /^https:\/\/updates[0-9.-]*\.push\.services\.mozilla\.com\//i,
  /^https:\/\/[a-z0-9.-]+\.notify\.windows\.com\//i,
];
const indirizzoValido = e => typeof e === 'string' && e.length < 600 && SERVIZI_VERI.some(r => r.test(e));
const MASSIMO_ISCRITTI = 300;   // una squadra di genitori, non un servizio pubblico

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

const attendi = ms => new Promise(r => setTimeout(r, ms));

/** Gli iscritti, tutti o solo gli amministratori.
 *  Le voci di servizio cominciano con "meta:" e qui non c'entrano. */
async function iscritti(env, soloAdmin) {
  const chiavi = (await env.ISCRITTI.list()).keys.filter(k => k.name.startsWith('http'));
  const fuori = [];
  for (const k of chiavi) {
    const i = JSON.parse(await env.ISCRITTI.get(k.name) || 'null');
    if (!i) continue;
    if (!soloAdmin || i.admin) fuori.push(i);
  }
  return fuori;
}

/** Manda la spinta, togliendo gli iscritti spariti. Ogni tanto la prima
 *  consegna viene rifiutata: riprova, come fa l'automazione su GitHub. */
async function avvisaTutti(env, soloAdmin) {
  const destinatari = await iscritti(env, soloAdmin);
  let inviate = 0, tolti = 0, tentativi = 0;
  const restano = new Set(destinatari.map(i => i.endpoint));
  for (let giro = 0; giro < 3 && restano.size; giro++) {
    if (giro) await attendi(8000);
    tentativi = giro + 1;
    for (const endpoint of [...restano]) {
      const iscritto = destinatari.find(i => i.endpoint === endpoint);
      let stato = 0;
      try { stato = await spingi(iscritto, env); } catch (e) { stato = 0; }
      if (stato >= 200 && stato < 300) { inviate++; restano.delete(endpoint); }
      else if (stato === 404 || stato === 410) { await env.ISCRITTI.delete(endpoint); tolti++; restano.delete(endpoint); }
    }
  }
  return { inviate, tolti, tentativi, destinatari: destinatari.length, soloAdmin: !!soloAdmin };
}

const leggi = async (env, chiave) => {
  try { return JSON.parse(await env.ISCRITTI.get('meta:' + chiave) || 'null'); } catch (e) { return null; }
};
const scrivi = (env, chiave, valore) => env.ISCRITTI.put('meta:' + chiave, JSON.stringify(valore));

const SILENZIO_SOSPETTO = 6 * 60 * 60e3;    // sei ore senza battito = qualcosa non va
const UN_ALLARME_AL_GIORNO = 24 * 60 * 60e3;

/** Il controllo programmato: il battito c'e' ancora? */
async function sentinella(env) {
  const battito = await leggi(env, 'battito');
  const adesso = Date.now();
  const fermo = !battito ? null : adesso - Date.parse(battito.quando);
  if (battito && fermo < SILENZIO_SOSPETTO) return { stato: 'tutto bene', fermo };

  const ultimo = await leggi(env, 'ultimo-allarme');
  if (ultimo && adesso - Date.parse(ultimo.quando) < UN_ALLARME_AL_GIORNO)
    return { stato: 'gia avvisato', fermo };

  const ore = battito ? Math.round(fermo / 36e5) : null;
  await scrivi(env, 'messaggio-admin', {
    titolo: 'Aggiornamenti fermi',
    testo: ore === null
      ? "L'aggiornamento automatico non da' sue notizie."
      : `L'aggiornamento automatico e' fermo da circa ${ore} ore.`,
    tag: `sentinella-${new Date(adesso).toISOString().slice(0, 13)}`,
    quando: new Date(adesso).toISOString(),
  });
  await scrivi(env, 'ultimo-allarme', { quando: new Date(adesso).toISOString() });
  const esito = await avvisaTutti(env, true);   // solo a chi tiene in piedi l'app
  return { stato: 'avvisato', fermo, ...esito };
}

export default {
  /** Cloudflare lo chiama agli orari impostati in "Trigger cron". */
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(sentinella(env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // l'app chiede la chiave pubblica per potersi iscrivere
    if (url.pathname === '/chiave') return risposta({ chiave: env.VAPID_PUBBLICA });

    // un telefono si iscrive (o si cancella)
    if (url.pathname === '/iscritti' && req.method === 'POST') {
      const sub = await req.json().catch(() => null);
      if (!indirizzoValido(sub?.endpoint)) return risposta({ errore: 'iscrizione non valida' }, 400);
      // se quel telefono era gia' segnato come "di servizio" resta tale
      const vecchio = JSON.parse(await env.ISCRITTI.get(sub.endpoint) || 'null');
      if (!vecchio && (await iscritti(env, false)).length >= MASSIMO_ISCRITTI)
        return risposta({ errore: 'troppi iscritti' }, 429);
      await env.ISCRITTI.put(sub.endpoint, JSON.stringify({
        endpoint: sub.endpoint, dal: vecchio?.dal || new Date().toISOString(), admin: !!vecchio?.admin }));
      return risposta({ ok: true });
    }
    if (url.pathname === '/iscritti' && req.method === 'DELETE') {
      const sub = await req.json().catch(() => null);
      if (!indirizzoValido(sub?.endpoint)) return risposta({ errore: 'indirizzo non valido' }, 400);
      await env.ISCRITTI.delete(sub.endpoint);
      return risposta({ ok: true });
    }

    // Il telefono legge qui il messaggio. Chi e' amministratore riceve anche
    // gli avvisi di servizio: si riconosce dal proprio indirizzo di iscrizione.
    if (url.pathname === '/messaggio' && req.method === 'GET') {
      const pubblico = await leggi(env, 'messaggio');
      const mio = url.searchParams.get('e');
      if (mio) {
        const i = JSON.parse(await env.ISCRITTI.get(mio) || 'null');
        if (i?.admin) {
          const riservato = await leggi(env, 'messaggio-admin');
          const q = m => Date.parse(m?.quando || 0) || 0;
          return risposta((q(riservato) >= q(pubblico) ? riservato : pubblico) || {});   // a parita' vince l'avviso di servizio
        }
      }
      return risposta(pubblico || {});
    }

    // GitHub dice "sono vivo" a ogni giro
    if (url.pathname === '/battito' && req.method === 'POST') {
      if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
      const corpo = await req.json().catch(() => ({}));
      await scrivi(env, 'battito', {
        quando: corpo.quando || new Date().toISOString(),
        esito: corpo.esito || 'ok',
        chi: corpo.chi || 'github',
      });
      return risposta({ ok: true });
    }

    // GitHub detta un messaggio (per esempio: aggiornamento fallito)
    if (url.pathname === '/messaggio' && req.method === 'POST') {
      if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
      const corpo = await req.json().catch(() => ({}));
      if (!corpo.testo) return risposta({ errore: 'manca il testo' }, 400);
      await scrivi(env, corpo.admin ? 'messaggio-admin' : 'messaggio', {
        titolo: corpo.titolo || 'Martesana Volley',
        testo: corpo.testo,
        tag: corpo.tag || `avviso-${new Date().toISOString().slice(0, 13)}`,
        quando: new Date().toISOString(),
      });
      return risposta({ ok: true });
    }

    // lo stato della sentinella, per poterla controllare
    if (url.pathname === '/stato' && req.method === 'GET') {
      if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
      return risposta({ battito: await leggi(env, 'battito'),
                        ultimoAllarme: await leggi(env, 'ultimo-allarme'),
                        iscritti: (await iscritti(env, false)).length });
    }

    // il controllo si puo' anche forzare a mano
    if (url.pathname === '/controlla' && req.method === 'POST') {
      if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
      return risposta(await sentinella(env));
    }

    // GitHub chiede di avvisare tutti
    if (url.pathname === '/avvisa' && req.method === 'POST') {
      if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
      return risposta(await avvisaTutti(env, url.searchParams.get('admin') === '1'));
    }

    // Segna quali telefoni sono "di servizio": solo loro ricevono gli avvisi
    // sull'automazione. Con {"tutti":true} segna quelli iscritti ora.
    if (url.pathname === '/amministratore' && req.method === 'POST') {
      if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
      const corpo = await req.json().catch(() => ({}));
      const elenco = corpo.tutti
        ? (await iscritti(env, false)).map(i => i.endpoint)
        : [corpo.endpoint].filter(Boolean);
      for (const endpoint of elenco) {
        const i = JSON.parse(await env.ISCRITTI.get(endpoint) || 'null');
        if (i) await env.ISCRITTI.put(endpoint, JSON.stringify({ ...i, admin: corpo.admin !== false }));
      }
      return risposta({ segnati: elenco.length });
    }

    return risposta({ errore: 'non trovato' }, 404);
  },
};
