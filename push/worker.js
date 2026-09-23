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
  const salvato = await leggi(env, 'calendario');
  if (salvato && Date.now() - Date.parse(salvato.quando) < 6 * 36e5) return salvato.partite;
  try {
    const dati = await (await fetch(SITO + 'data.json')).json();
    const partite = [];
    for (const c of dati.championships || [])
      for (const m of c.matches || [])
        if (m.mine && m.date) partite.push({ gara: m.gara, inizio: istanteRoma(m.date, m.time) });
    await scrivi(env, 'calendario', { quando: new Date().toISOString(), partite });
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
  await scrivi(env, 'messaggio', {
    titolo: 'Siamo in diretta',
    testo: 'La partita e\' cominciata: tocca per vederla.',
    tag: 'diretta-' + video,
    quando: new Date(adesso).toISOString(),
  });
  const esito = await avvisaTutti(env, false);
  return { stato: 'appena cominciata', video, ...esito };
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

/** Il controllo del canale. Cercare costa cento gettoni, controllare un
 *  video gia' noto ne costa uno: quindi si cerca solo finche' non si trova,
 *  poi si tiene d'occhio quel video e basta. */
async function guardaCanale(env, forza = false) {
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
