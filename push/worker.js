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
 *
 * Solo per la diretta (si possono lasciare vuote):
 *   CHIAVE_TRASMISSIONE  la chiave di trasmissione del canale YouTube -> segreta
 *   CHIAVE_YOUTUBE       la chiave per interrogare le API di Google   -> segreta
 *   CANALE_YOUTUBE       il codice del canale (UC...), non e' un segreto
 *   GOOGLE_ID            il client OAuth del progetto Google
 *   GOOGLE_SEGRETO       il suo segreto                              -> segreta
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
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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

// ###########################################################################
// ### INIZIO DIRETTA - punteggio dal vivo, inviti, riconoscimento YouTube ###
// ### Per togliere la diretta: cancellare da qui fino a "FINE DIRETTA",   ###
// ### piu' la riga segnata "aggancio diretta" dentro fetch(). Nient'altro.###
// ###########################################################################

/** Chi puo' comandare: o ha la parola d'ordine, o ha un invito valido.
 *  L'invito serve per delegare una partita senza consegnare il segreto. */
async function permesso(req, env, ruolo) {
  if (req.headers.get('x-segreto') === env.SEGRETO) return { ok: true, chi: 'admin' };
  const gettone = new URL(req.url).searchParams.get('t');
  if (!gettone) return { ok: false };
  const invito = await leggi(env, 'invito:' + gettone);
  if (!invito) return { ok: false };
  if (Date.parse(invito.scade) < Date.now()) return { ok: false };
  if (ruolo && invito.ruolo !== ruolo) return { ok: false };
  return { ok: true, chi: 'invito', invito };
}

// Il tabellone chiede il punteggio ogni paio di secondi, e lo chiedono in
// tanti insieme. Senza questa cache ogni spettatore sarebbe una lettura del
// magazzino: con due ore di partita si sfonderebbe il piano gratuito. Cosi'
// invece la risposta la serve la rete di Cloudflare, e il magazzino lo si
// legge una volta ogni due secondi in tutto.
const CHIAVE_CACHE = 'https://volley.invalid/punteggio';
const RESPIRO = 2;   // secondi

async function punteggioInCache(env) {
  const cache = caches.default;
  const pronta = await cache.match(CHIAVE_CACHE);
  if (pronta) return pronta;
  const dati = await leggi(env, 'punteggio');
  const fresca = new Response(JSON.stringify(dati || {}), {
    headers: { 'content-type': 'application/json', 'Cache-Control': `public, max-age=${RESPIRO}`, ...CORS },
  });
  await cache.put(CHIAVE_CACHE, fresca.clone());
  return fresca;
}

/** Il punteggio arriva sempre intero, mai a pezzi: cosi' due tocchi vicini
 *  non possono scambiarsi di posto e lasciare un risultato impossibile. */
function ripulisciPunteggio(corpo) {
  const numero = n => Math.max(0, Math.min(199, Math.round(Number(n) || 0)));
  const coppia = c => Array.isArray(c) && c.length === 2 ? [numero(c[0]), numero(c[1])] : null;
  const set = (Array.isArray(corpo.set) ? corpo.set : []).map(coppia).filter(Boolean).slice(0, 5);
  return {
    gara: String(corpo.gara || '').slice(0, 20),
    casa: String(corpo.casa || '').slice(0, 60),
    ospiti: String(corpo.ospiti || '').slice(0, 60),
    set,
    punti: coppia(corpo.punti) || [0, 0],
    finita: !!corpo.finita,
    quando: new Date().toISOString(),
  };
}

const UN_GIORNO = 24 * 60 * 60e3;

// --- riconoscere da soli quando si va in onda ------------------------------
const SITO = 'https://salva-privato.github.io/volley/';
const YT = 'https://www.googleapis.com/youtube/v3/';
const PRIMA = 45 * 60e3;          // si comincia a guardare mezz'ora abbondante prima
const DOPO = 4 * 60 * 60e3;       // e si smette quattro ore dopo il fischio d'inizio
const OGNI_RICERCA = 5 * 60e3;    // cercare costa: non piu' di una volta ogni cinque minuti
const MASSIMO_RICERCHE = 60;      // ...e mai piu' di sessanta in un giorno

/** L'ora della partita e' scritta all'italiana. A fine ottobre l'Italia
 *  torna all'ora solare: se il fuso lo scrivessimo a mano, da novembre
 *  guarderemmo il canale con un'ora di ritardo. */
function istanteRoma(data, ora) {
  const comeFosseUtc = Date.parse(`${data}T${String(ora || '00:00').replace('.', ':')}:00Z`);
  if (!comeFosseUtc) return 0;
  const scritto = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'longOffset' })
    .formatToParts(comeFosseUtc).find(p => p.type === 'timeZoneName')?.value || 'GMT+01:00';
  const m = /GMT([+-])(\d\d):(\d\d)/.exec(scritto);
  const minuti = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 60;
  return comeFosseUtc - minuti * 60e3;
}

/** Le nostre partite, prese dal sito e tenute da parte per qualche ora. */
async function nostrePartite(env) {
  const salvato = await leggi(env, 'calendario-nomi');
  if (salvato && Date.now() - Date.parse(salvato.quando) < 6 * 36e5) return salvato.partite;
  try {
    const dati = await (await fetch(SITO + 'data.json')).json();
    const partite = [];
    for (const c of dati.championships || [])
      for (const m of c.matches || [])
        if (m.mine && m.date) partite.push({ gara: m.gara, inizio: istanteRoma(m.date, m.time),
                                             casa: m.home, ospiti: m.away });
    await scrivi(env, 'calendario-nomi', { quando: new Date().toISOString(), partite });
    return partite;
  } catch (e) { return salvato?.partite || []; }
}

/** Siamo nell'orario di una partita? Fuori da li' non si chiede niente a
 *  Google: il piano gratuito non e' infinito e va speso dove serve. */
async function orarioDaPartita(env) {
  const adesso = Date.now();
  for (const p of await nostrePartite(env)) {
    if (p.inizio && adesso > p.inizio - PRIMA && adesso < p.inizio + DOPO) return p;
  }
  return null;
}

/** L'identificativo del video, comunque sia scritto il collegamento:
 *  watch?v=..., youtu.be/..., /live/..., o gia' l'identificativo nudo. */
function idVideo(testo) {
  const t = String(testo || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const googleDice = async (via) => {
  const r = await fetch(YT + via);
  if (!r.ok) throw new Error('youtube ' + r.status);
  return r.json();
};

/** Si va in onda: si annota e si avvisa, una volta sola. */
async function accendi(env, video, gara, aMano) {
  const prima = await leggi(env, 'diretta');
  if (prima?.video === video && !prima.finita) return { stato: 'gia in onda', video };
  const adesso = Date.now();
  await scrivi(env, 'diretta', { video, gara: gara || prima?.gara || '', aMano: !!aMano,
                                 dal: new Date(adesso).toISOString(), finita: false });
  // ripartita da poco (telefono scarico, quello di scorta riprende): non e'
  // una partita nuova, e l'avviso lo deve dire
  const ripresa = prima?.finita && adesso - Date.parse(prima.fino || 0) < 60 * 60e3;
  await scrivi(env, 'messaggio', {
    titolo: ripresa ? 'La diretta e\' ripartita' : 'Siamo in diretta',
    testo: ripresa ? 'Si era interrotta: tocca per tornare a vederla.' : 'La partita e\' cominciata: tocca per vederla.',
    tag: 'diretta-' + video,
    quando: new Date(adesso).toISOString(),
  });
  // in prova (meta:prova, scade da sola) l'avviso arriva solo a chi cura l'app
  const prova = !!(await leggi(env, 'prova'));
  const esito = await avvisaTutti(env, prova);
  return { stato: 'appena cominciata', video, prova, ...esito };
}

/** E' finita: il video si aggiunge alle registrazioni di quella giornata.
 *  Sono piu' d'una quando la diretta si spezza - il telefono che filma si
 *  scarica e un altro riprende - perche' YouTube, passato il minuto di
 *  tolleranza, apre un video nuovo. Tenere solo l'ultimo faceva sparire dai
 *  richiami dell'app la prima meta' della partita.
 *  Le vecchie giornate sono rimaste scritte come un video solo: si leggono
 *  lo stesso, e la prima volta che se ne aggiunge uno diventano elenco. */
const MASSIMO_PEZZI = 6;

async function finisci(env, prima) {
  const adesso = Date.now();
  await scrivi(env, 'diretta', { ...prima, finita: true, fino: new Date(adesso).toISOString() });
  const archivio = (await leggi(env, 'registrazioni')) || {};
  const giorno = new Date(adesso).toISOString().slice(0, 10);
  const cera = archivio[giorno];
  const elenco = Array.isArray(cera) ? cera.slice() : (cera ? [cera] : []);
  if (!elenco.includes(prima.video)) elenco.push(prima.video);
  archivio[giorno] = elenco.slice(-MASSIMO_PEZZI);
  await scrivi(env, 'registrazioni', archivio);
  return { stato: 'finita', video: prima.video, pezzi: archivio[giorno].length };
}

// --- comandare il canale, non solo guardarlo --------------------------------
/* Il 29/09 Moblin trasmetteva e YouTube non e' mai andato in onda: con la
   sola chiave predefinita e' YouTube a decidere quando aprire una diretta, e
   da fuori non si poteva ne' vederlo ne' sbloccarlo. Con il permesso del
   canale (OAuth) il servizio:
     - prepara lui la diretta della partita, legata alla chiave di Moblin,
       con l'avvio automatico;
     - vede se a YouTube arriva il segnale di Moblin;
     - se il segnale arriva e YouTube non parte, la manda in onda lui;
     - se una diretta resta "in onda" senza segnale, la chiude lui.
   Variabili in piu' su Cloudflare: GOOGLE_ID e GOOGLE_SEGRETO (segreta), dal
   client OAuth del progetto Google. Il permesso vero (il "refresh token") lo
   si da' una volta dalla pagina diretta.html e sta nel magazzino. */
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const PERMESSO_YT = 'https://www.googleapis.com/auth/youtube';
const ATTESA_AVVIO = 60e3;            // YouTube ha un minuto per partire da solo
const MUTO_TROPPO = 15 * 60e3;        // in onda senza segnale da un quarto d'ora: e' appesa
const FINESTRA_PROSSIMA = 24 * 36e5;  // si prepara la partita delle prossime 24 ore

const collegato = async env => { const g = await leggi(env, 'google'); return !!(g?.refresh && !g.rotto); };

/** Il gettone per parlare con YouTube a nome del canale: dura un'ora e si
 *  tiene da parte, cosi' non lo si chiede a ogni giro. */
async function accessoGoogle(env) {
  const pronto = await leggi(env, 'google-accesso');
  if (pronto?.token && pronto.scade > Date.now() + 60e3) return pronto.token;
  const g = await leggi(env, 'google');
  if (!g?.refresh || g.rotto) throw new Error('canale non collegato');
  const r = await fetch(GOOGLE_TOKEN, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_ID, client_secret: env.GOOGLE_SEGRETO,
                                refresh_token: g.refresh, grant_type: 'refresh_token' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // permesso ritirato o scaduto: si torna al vecchio modo finche' non si ricollega
    if (d.error === 'invalid_grant') await scrivi(env, 'google', { ...g, rotto: new Date().toISOString() });
    throw new Error('Google: ' + (d.error_description || d.error || r.status));
  }
  await env.ISCRITTI.put('meta:google-accesso',
    JSON.stringify({ token: d.access_token, scade: Date.now() + d.expires_in * 1000 }),
    { expirationTtl: Math.max(60, d.expires_in - 120) });
  return d.access_token;
}

/** Una richiesta a YouTube a nome del canale. */
async function canale(env, metodo, via, corpo) {
  const token = await accessoGoogle(env);
  const r = await fetch(YT + via, {
    method: metodo,
    headers: { authorization: 'Bearer ' + token, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const motivo = d.error?.errors?.[0]?.reason || '';
    const e = new Error(motivo || d.error?.message || 'youtube ' + r.status);
    e.motivo = motivo;
    throw e;
  }
  return d;
}

/** Il flusso di YouTube che riceve Moblin: quello con la stessa chiave che
 *  la pagina diretta.html consegna a Moblin. Cosi' Moblin non va toccato. */
async function flussoId(env) {
  const noto = await leggi(env, 'flusso');
  if (noto?.id && noto.chiave === env.CHIAVE_TRASMISSIONE) return noto.id;
  let pagina = '';
  do {
    const d = await canale(env, 'GET', `liveStreams?part=id,cdn&mine=true&maxResults=50${pagina ? '&pageToken=' + pagina : ''}`);
    const f = (d.items || []).find(s => s.cdn?.ingestionInfo?.streamName === env.CHIAVE_TRASMISSIONE);
    if (f) { await scrivi(env, 'flusso', { id: f.id, chiave: env.CHIAVE_TRASMISSIONE }); return f.id; }
    pagina = d.nextPageToken || '';
  } while (pagina);
  throw new Error('la chiave di Moblin non e\' fra le chiavi del canale');
}

/** Quale partita preparare: quella che si sta segnando in regia (anche
 *  un'amichevole), se no la prossima del calendario entro un giorno. */
async function bersaglio(env) {
  const adesso = Date.now();
  const p = await leggi(env, 'punteggio');
  if (p?.gara && !p.finita && adesso - Date.parse(p.quando || 0) < 3 * 36e5)
    return { gara: p.gara, casa: p.casa, ospiti: p.ospiti, inizio: adesso };
  const prossime = (await nostrePartite(env))
    .filter(x => x.inizio > adesso - 3 * 36e5 && x.inizio < adesso + FINESTRA_PROSSIMA)
    .sort((a, b) => a.inizio - b.inizio);
  return prossime[0] || null;
}

const bello = s => String(s || '').toLowerCase().replace(/(^|[\s'-])\S/g, c => c.toUpperCase());

/** Lascia sulla chiave di Moblin una sola diretta in attesa: la nostra.
 *  Provato il 06/10: finita una diretta, YouTube Studio ne crea da solo
 *  un'altra ("Live streaming di ...") legata alla stessa chiave. Con due
 *  dirette in attesa YouTube non ne fa partire nessuna, e rifiuta anche il
 *  comando di avvio (invalidTransition). Quasi certamente e' il 29/09.
 *  Le altre non si cancellano: si staccano dalla chiave e restano li'. */
async function liberaFlusso(env, flusso, nostra) {
  const d = await canale(env, 'GET', 'liveBroadcasts?part=id,status,contentDetails&broadcastStatus=upcoming&broadcastType=all&maxResults=20');
  let staccate = 0;
  for (const b of d.items || []) {
    if (b.id === nostra || b.contentDetails?.boundStreamId !== flusso) continue;
    await canale(env, 'POST', `liveBroadcasts/bind?id=${b.id}&part=id`).catch(() => {});   // senza streamId = stacca
    staccate++;
  }
  return staccate;
}

/** Crea la diretta su YouTube e la lega al flusso di Moblin. Una diretta
 *  preparata e mai usata si cancella: due dirette in attesa sulla stessa
 *  chiave, e non si saprebbe quale parte. */
async function crea(env, t) {
  if (await leggi(env, 'creando')) return null;   // la sta gia' creando qualcun altro
  await env.ISCRITTI.put('meta:creando', '1', { expirationTtl: 60 });
  try {
    const flusso = await flussoId(env);
    const vecchia = await leggi(env, 'preparata');
    if (vecchia?.video) {
      const v = await canale(env, 'GET', `liveBroadcasts?part=status&id=${vecchia.video}`).catch(() => null);
      const stato = v?.items?.[0]?.status?.lifeCycleStatus;
      if (stato === 'created' || stato === 'ready')
        await canale(env, 'DELETE', `liveBroadcasts?id=${vecchia.video}`).catch(() => {});
    }
    const adesso = Date.now();
    const quando = new Date(Math.max(t?.inizio || 0, adesso + 2 * 60e3));
    const giorno = quando.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit' });
    const titolo = (t?.casa && t?.ospiti ? `${bello(t.casa)} – ${bello(t.ospiti)}` : 'Martesana Volley in diretta')
      .slice(0, 85) + ' · ' + giorno;
    const nuova = await canale(env, 'POST', 'liveBroadcasts?part=id,snippet,status,contentDetails', {
      snippet: {
        title: titolo,
        scheduledStartTime: quando.toISOString(),
        description: 'Il punteggio dal vivo e i risultati sono nell\'app della Martesana: ' + SITO,
      },
      // pubblica mentre si gioca: deciso il 22/09
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      contentDetails: {
        enableAutoStart: true, enableAutoStop: true, enableDvr: true, recordFromStart: true,
        monitorStream: { enableMonitorStream: false },   // cosi' si puo' andare in onda in un passo solo
      },
    });
    await canale(env, 'POST', `liveBroadcasts/bind?id=${nuova.id}&part=id&streamId=${flusso}`);
    await liberaFlusso(env, flusso, nuova.id);
    const preparata = { video: nuova.id, gara: t?.gara || '', titolo, inizio: quando.toISOString(),
                        creata: new Date(adesso).toISOString() };
    await scrivi(env, 'preparata', preparata);
    return preparata;
  } finally {
    await env.ISCRITTI.delete('meta:creando');
  }
}

/** La diretta preparata e' ancora buona? Se no se ne fa un'altra. */
async function assicuraPreparata(env) {
  const prep = await leggi(env, 'preparata');
  if (prep?.video) {
    const d = await canale(env, 'GET', `liveBroadcasts?part=status,contentDetails&id=${prep.video}`).catch(() => null);
    const b = d?.items?.[0];
    const stato = b?.status?.lifeCycleStatus;
    if (['created', 'ready', 'testing'].includes(stato)) {
      const flusso = await flussoId(env);
      if (b.contentDetails?.boundStreamId !== flusso)
        await canale(env, 'POST', `liveBroadcasts/bind?id=${prep.video}&part=id&streamId=${flusso}`);
      await liberaFlusso(env, flusso, prep.video);
      return prep;
    }
  }
  return crea(env, await bersaglio(env));
}

/** Il cuore: guarda il canale e rimette le cose a posto. Lo chiamano il
 *  cron ogni due minuti e la pagina diretta.html finche' e' aperta.
 *  opz.inOnda: chi trasmette ha premuto "Manda in onda adesso".
 *  opz.prepara: ha premuto "Prepara una diretta nuova". */
async function sistema(env, opz = {}) {
  const adesso = Date.now();
  const flusso = await flussoId(env);
  const [fl, attive] = await Promise.all([
    canale(env, 'GET', `liveStreams?part=status&id=${flusso}`),
    canale(env, 'GET', 'liveBroadcasts?part=id,snippet,status&broadcastStatus=active&broadcastType=all&maxResults=5'),
  ]);
  const st = fl.items?.[0]?.status || {};
  const arriva = st.streamStatus === 'active';
  const salute = st.healthStatus?.status || '';

  // da quanto il segnale arriva, o manca: si scrive solo quando cambia
  const prima = (await leggi(env, 'segnale')) || {};
  const ora = arriva ? { attivoDal: prima.attivoDal || adesso } : { mutoDal: prima.mutoDal || adesso };
  if (ora.attivoDal !== prima.attivoDal || ora.mutoDal !== prima.mutoDal) await scrivi(env, 'segnale', ora);

  const fuori = { collegato: true, arriva, salute };
  const viva = (attive.items || [])[0];
  const diretta = await leggi(env, 'diretta');
  let prep = await leggi(env, 'preparata');

  if (opz.prepara && !viva) prep = await crea(env, await bersaglio(env));

  // 1) c'e' una diretta aperta su YouTube
  if (viva) {
    const stato = viva.status?.lifeCycleStatus;
    Object.assign(fuori, { video: viva.id, titolo: viva.snippet?.title });
    if (stato === 'live') {
      const gara = prep?.video === viva.id ? prep.gara : '';
      await accendi(env, viva.id, gara, false);   // avvisa tutti, una volta sola
      // una diretta finita non riparte: la prossima volta se ne fa un'altra
      if (prep?.video === viva.id && !prep.usata) await scrivi(env, 'preparata', { ...prep, usata: true });
      fuori.stato = 'in onda';
    } else fuori.stato = 'sta partendo';
    // in onda senza segnale da troppo: e' la diretta appesa del 29/09
    if (!arriva && adesso - ora.mutoDal > MUTO_TROPPO) {
      await canale(env, 'POST', `liveBroadcasts/transition?broadcastStatus=complete&id=${viva.id}&part=id`).catch(() => {});
      if (diretta?.video === viva.id && !diretta.finita) await finisci(env, diretta);
      fuori.stato = 'chiusa perche\' muta';
    }
    return fuori;
  }

  // 2) niente in onda: se l'app crede di si', la diretta e' finita
  if (diretta?.video && !diretta.finita) await finisci(env, diretta);

  // 3) Moblin trasmette ma YouTube non e' partito: dopo un minuto ci si pensa
  //    noi. Subito, se non c'era niente di pronto da far partire da solo.
  const pronta = prep?.video && !prep.usata;
  if (arriva) {
    if (opz.inOnda || !pronta || adesso - ora.attivoDal > ATTESA_AVVIO) {
      const p = await assicuraPreparata(env);
      if (!p) return { ...fuori, stato: 'sto preparando' };
      Object.assign(fuori, { video: p.video, titolo: p.titolo });
      try {
        await canale(env, 'POST', `liveBroadcasts/transition?broadcastStatus=live&id=${p.video}&part=id`);
        fuori.stato = 'mandata in onda';
      } catch (e) {
        fuori.stato = e.motivo === 'redundantTransition' ? 'sta partendo' : 'non parte';
        fuori.errore = e.message;
      }
    } else {
      Object.assign(fuori, { stato: 'ricevo, aspetto YouTube', video: prep?.video, titolo: prep?.titolo });
    }
    return fuori;
  }

  // 4) tutto fermo: si prepara la prossima partita, se non c'e' gia'
  // Se la creazione fallisce si riprova fra venti minuti, non a ogni giro:
  // ogni tentativo costa a Google cento gettoni anche quando va male.
  const t = await bersaglio(env);
  if (t && prep?.gara !== t.gara && !(await leggi(env, 'pausa-crea'))) {
    try { prep = (await crea(env, t)) || prep; }
    catch (e) {
      await env.ISCRITTI.put('meta:pausa-crea', JSON.stringify(e.message), { expirationTtl: 20 * 60 });
      fuori.errore = e.message;
    }
  }
  // Studio puo' aver messo un'altra diretta sulla chiave: la nostra deve restare sola
  if (prep && !prep.usata) await liberaFlusso(env, flusso, prep.video).catch(() => {});
  if (prep && !prep.usata) Object.assign(fuori, { stato: 'pronta', video: prep.video, titolo: prep.titolo, inizio: prep.inizio });
  else fuori.stato = 'niente in programma';
  return fuori;
}

/** Il controllo del canale. Cercare costa cento gettoni, controllare un
 *  video gia' noto ne costa uno: quindi si cerca solo finche' non si trova,
 *  poi si tiene d'occhio quel video e basta.
 *  Col canale collegato non si cerca piu' niente: comanda sistema(). */
async function guardaCanale(env, forza = false) {
  if (await collegato(env)) return sistema(env).catch(e => ({ stato: 'errore', errore: e.message }));
  if (!env.CHIAVE_YOUTUBE || !env.CANALE_YOUTUBE) return { stato: 'non configurato' };
  const chiavi = `key=${env.CHIAVE_YOUTUBE}`;
  const prima = await leggi(env, 'diretta');
  const adesso = Date.now();

  // 1) se sapevamo di un video in onda, basta chiedere se lo e' ancora
  if (prima?.video && !prima.finita) {
    // una diretta non puo' durare in eterno: se per qualsiasi motivo non
    // arriva la conferma, dopo cinque ore si chiude lo stesso
    const troppoVecchia = adesso - Date.parse(prima.dal || 0) > 5 * 36e5;
    let ancora = false, saputo = false;
    try {
      const d = await googleDice(`videos?part=snippet&id=${prima.video}&${chiavi}`);
      // Attenzione: se il video e' "non in elenco" Google potrebbe non
      // restituirlo affatto. Nessuna notizia non vuol dire "finita":
      // spegnere per questo chiuderebbe la diretta dopo due minuti.
      if (d.items?.length) { ancora = d.items[0].snippet?.liveBroadcastContent === 'live'; saputo = true; }
    } catch (e) { /* Google muto */ }
    if (ancora) return { stato: 'in onda', video: prima.video };
    // non si sa: si resta in onda fino alle cinque ore, o finche' non lo
    // dice chi trasmette con "Ho finito"
    if (!saputo) return troppoVecchia ? finisci(env, prima) : { stato: 'in onda, senza conferma', video: prima.video };
    return finisci(env, prima);
  }

  // 2) altrimenti si cerca, ma solo negli orari delle partite e con misura.
  //    "forza" serve a provare la catena fuori dagli orari, da chi trasmette:
  //    salta l'orario e l'attesa fra una ricerca e l'altra, ma non il tetto
  //    giornaliero - quello protegge i gettoni di Google.
  const partita = forza ? { gara: '' } : await orarioDaPartita(env);
  if (!partita) return { stato: 'fuori orario' };
  const conto = (await leggi(env, 'ricerche')) || { giorno: '', fatte: 0, ultima: 0 };
  const oggi = new Date(adesso).toISOString().slice(0, 10);
  if (conto.giorno !== oggi) { conto.giorno = oggi; conto.fatte = 0; }
  if (conto.fatte >= MASSIMO_RICERCHE) return { stato: 'basta cercare per oggi' };
  if (!forza && adesso - (conto.ultima || 0) < OGNI_RICERCA) return { stato: 'cercato da poco' };

  let video = null;
  try {
    const d = await googleDice(
      `search?part=snippet&channelId=${env.CANALE_YOUTUBE}&eventType=live&type=video&maxResults=1&${chiavi}`);
    video = d.items?.[0]?.id?.videoId || null;
  } catch (e) { return { stato: 'google muto' }; }
  conto.fatte++; conto.ultima = adesso;
  await scrivi(env, 'ricerche', conto);
  if (!video) return { stato: 'non ancora in onda', cercate: conto.fatte };

  // trovata: si avvisano tutti, una volta sola
  return accendi(env, video, partita.gara, false);
}

/** Tutte le rotte della diretta. Torna null se l'indirizzo non e' suo,
 *  cosi' il resto del servizio continua come se questo pezzo non esistesse. */
async function rottaDiretta(req, env, url) {
  const via = url.pathname;

  // --- il punteggio ---------------------------------------------------
  if (via === '/punteggio' && req.method === 'GET') return punteggioInCache(env);

  if (via === '/punteggio' && (req.method === 'POST' || req.method === 'DELETE')) {
    if (!(await permesso(req, env, 'punti')).ok) return risposta({ errore: 'no' }, 401);
    if (req.method === 'DELETE') await env.ISCRITTI.delete('meta:punteggio');
    else {
      const corpo = await req.json().catch(() => null);
      if (!corpo) return risposta({ errore: 'manca il punteggio' }, 400);
      await scrivi(env, 'punteggio', ripulisciPunteggio(corpo));
    }
    await caches.default.delete(CHIAVE_CACHE);   // il tabellone deve vederlo subito
    return risposta({ ok: true });
  }

  // --- gli inviti a tempo ----------------------------------------------
  if (via === '/invito' && req.method === 'POST') {
    if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
    const corpo = await req.json().catch(() => ({}));
    const ruolo = corpo.ruolo === 'trasmetti' ? 'trasmetti' : 'punti';
    const ore = Math.max(1, Math.min(24, Number(corpo.ore) || 12));
    const gettone = b64(crypto.getRandomValues(new Uint8Array(18)));
    const invito = {
      ruolo, gettone,
      gara: String(corpo.gara || '').slice(0, 20),
      casa: String(corpo.casa || '').slice(0, 60),
      ospiti: String(corpo.ospiti || '').slice(0, 60),
      scade: new Date(Date.now() + ore * 36e5).toISOString(),
    };
    // scade da solo anche nel magazzino: nessun invito dimenticato in giro
    await env.ISCRITTI.put('meta:invito:' + gettone, JSON.stringify(invito),
      { expirationTtl: Math.round(ore * 3600) + 60 });
    return risposta(invito);
  }

  // Chi ha l'invito ritira qui la sua configurazione. La chiave del canale
  // esce solo per il ruolo "trasmetti", e solo finche' l'invito e' vivo.
  if (via === '/config' && req.method === 'GET') {
    const p = await permesso(req, env, null);
    if (!p.ok) return risposta({ errore: 'invito scaduto o non valido' }, 401);
    const invito = p.invito || { ruolo: 'admin', gara: url.searchParams.get('gara') || '' };
    const fuori = { ruolo: invito.ruolo, gara: invito.gara, casa: invito.casa, ospiti: invito.ospiti };
    if (invito.ruolo !== 'punti') fuori.chiave = env.CHIAVE_TRASMISSIONE || '';
    return risposta(fuori);
  }

  // --- il permesso sul canale YouTube -------------------------------------
  // Si da' una volta sola: diretta.html chiede l'indirizzo, il browser va da
  // Google, chi ha il canale preme "Consenti" e Google torna qui col codice.
  if (via === '/google/collega' && req.method === 'POST') {
    if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
    if (!env.GOOGLE_ID || !env.GOOGLE_SEGRETO) return risposta({ errore: 'mancano GOOGLE_ID e GOOGLE_SEGRETO su Cloudflare' }, 400);
    const stato = b64(crypto.getRandomValues(new Uint8Array(18)));
    await env.ISCRITTI.put('meta:google-stato:' + stato, '1', { expirationTtl: 15 * 60 });
    const q = new URLSearchParams({
      client_id: env.GOOGLE_ID, redirect_uri: url.origin + '/google/torna', response_type: 'code',
      scope: PERMESSO_YT, access_type: 'offline', prompt: 'consent', state: stato,
    });
    return risposta({ indirizzo: 'https://accounts.google.com/o/oauth2/v2/auth?' + q });
  }
  if (via === '/google/torna' && req.method === 'GET') {
    const pagina = (titolo, testo, bene) => new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titolo}</title><body style="font:17px/1.5 -apple-system,sans-serif;background:#0b1a19;color:#e7efed;padding:24px">
<h1 style="font-size:22px;color:${bene ? '#7fd1a4' : '#f08072'}">${titolo}</h1><p>${testo}</p>
<p><a style="color:#74c4b8" href="${SITO}diretta.html">Torna a "Vai in diretta"</a></p>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } });
    const stato = url.searchParams.get('state') || '';
    if (!stato || !(await env.ISCRITTI.get('meta:google-stato:' + stato)))
      return pagina('Collegamento scaduto', 'Questo passaggio vale un quarto d\'ora: ricomincia dal tasto "Collega il canale YouTube".');
    await env.ISCRITTI.delete('meta:google-stato:' + stato);
    if (url.searchParams.get('error'))
      return pagina('Non collegato', 'Google dice: ' + url.searchParams.get('error') + '. Non e\' cambiato niente.');
    const r = await fetch(GOOGLE_TOKEN, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: env.GOOGLE_ID,
        client_secret: env.GOOGLE_SEGRETO, redirect_uri: url.origin + '/google/torna', grant_type: 'authorization_code' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.refresh_token)
      return pagina('Non collegato', 'Google non ha dato il permesso (' + (d.error_description || d.error || 'manca il permesso permanente') + ').');
    // chi ha premuto "Consenti" doveva scegliere il canale della Martesana, non il proprio
    const c = await fetch(YT + 'channels?part=snippet&mine=true', { headers: { authorization: 'Bearer ' + d.access_token } })
      .then(x => x.json()).catch(() => ({}));
    const ch = c.items?.[0];
    if (!ch || (env.CANALE_YOUTUBE && ch.id !== env.CANALE_YOUTUBE))
      return pagina('Canale sbagliato', `Hai scelto <b>${ch?.snippet?.title || 'un account senza canale'}</b>. ` +
        'Ricomincia e, quando Google chiede quale account o canale usare, scegli <b>Martesana Volley Genitori</b>.');
    await scrivi(env, 'google', { refresh: d.refresh_token, canale: ch.id, nome: ch.snippet?.title, quando: new Date().toISOString() });
    await env.ISCRITTI.delete('meta:google-accesso');
    await env.ISCRITTI.delete('meta:flusso');
    return pagina('Collegato ✓', `Il servizio ora comanda il canale <b>${ch.snippet?.title}</b>. Puoi chiudere questa pagina.`, true);
  }

  // Lo stato della diretta, e le mani per sistemarla: la pagina diretta.html
  // lo chiede ogni quindici secondi finche' e' aperta.
  if (via === '/sistema' && req.method === 'POST') {
    if (!(await permesso(req, env, 'trasmetti')).ok) return risposta({ errore: 'no' }, 401);
    if (!(await collegato(env))) return risposta({ collegato: false, rotto: !!(await leggi(env, 'google'))?.rotto });
    try {
      return risposta(await sistema(env, { inOnda: url.searchParams.get('inonda') === '1',
                                           prepara: url.searchParams.get('prepara') === '1' }));
    } catch (e) { return risposta({ collegato: true, stato: 'errore', errore: e.message }); }
  }

  // --- siamo in onda? ---------------------------------------------------
  if (via === '/diretta' && req.method === 'GET') return risposta(await leggi(env, 'diretta') || {});

  /* "Guarda adesso": fa fare al servizio, su richiesta, lo stesso controllo
     che fa da solo negli orari delle partite. Serve a provare la catena senza
     aspettare la domenica, e il giorno della partita a capire perche' la
     diretta non compare, invece di incollare il link alla cieca. */
  if (via === '/guarda' && req.method === 'POST') {
    if (!(await permesso(req, env, 'trasmetti')).ok) return risposta({ errore: 'no' }, 401);
    return risposta(await guardaCanale(env, url.searchParams.get('forza') === '1'));
  }

  // A mano: serve quando la diretta e' "non in elenco", perche' il catalogo
  // di Google, interrogato senza credenziali, quei video non li mostra.
  // Vale anche come rete di sicurezza se il riconoscimento non funzionasse.
  if (via === '/diretta' && (req.method === 'POST' || req.method === 'DELETE')) {
    if (!(await permesso(req, env, 'trasmetti')).ok) return risposta({ errore: 'no' }, 401);
    if (req.method === 'DELETE') {
      const prima = await leggi(env, 'diretta');
      // col canale collegato "Ho finito" chiude anche la diretta su YouTube
      if (prima?.video && !prima.finita && await collegato(env))
        await canale(env, 'POST', `liveBroadcasts/transition?broadcastStatus=complete&id=${prima.video}&part=id`).catch(() => {});
      if (prima?.video) await finisci(env, prima);
      return risposta({ ok: true });
    }
    const corpo = await req.json().catch(() => ({}));
    const video = idVideo(corpo.video || corpo.url || '');
    if (!video) return risposta({ errore: 'non riconosco il collegamento' }, 400);
    return risposta(await accendi(env, video, corpo.gara, true));
  }
  if (via === '/registrazioni' && req.method === 'GET') return risposta(await leggi(env, 'registrazioni') || {});

  // il controllo del canale si puo' forzare a mano, per provarlo
  if (via === '/guarda' && req.method === 'POST') {
    if (req.headers.get('x-segreto') !== env.SEGRETO) return risposta({ errore: 'no' }, 401);
    return risposta(await guardaCanale(env));
  }

  return null;
}

// ###########################################################################
// ### FINE DIRETTA                                                        ###
// ###########################################################################

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
    ctx.waitUntil(guardaCanale(env));   // aggancio diretta
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const diretta = await rottaDiretta(req, env, url);   // aggancio diretta
    if (diretta) return diretta;

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
