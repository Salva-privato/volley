/**
 * Confronta lo scrape appena fatto con quello precedente e tiene una lista
 * degli spostamenti delle NOSTRE partite: data, ora o campo cambiati.
 * Sta in un file suo per poterlo provare senza aprire il browser.
 */
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const GIORNI_IN_LISTA = 30;      // un avviso non resta piu' di un mese
const chiave = (idCamp, gara) => `${idCamp}-${gara}`;

/** Gli avvisi ancora sensati: partita non gia' passata e avviso recente. */
function potatura(avvisi, adesso) {
  const limite = new Date(adesso.getTime() - GIORNI_IN_LISTA * 864e5);
  const ieri = new Date(adesso.getTime() - 864e5).toISOString().slice(0, 10);
  const vivi = avvisi.filter(a =>
    new Date(a.quando) >= limite && (!a.dopo?.date || a.dopo.date >= ieri));
  // di una stessa partita tengo solo lo spostamento piu' recente
  const ultimi = new Map();
  for (const a of vivi.sort((x, y) => new Date(x.quando) - new Date(y.quando)))
    ultimi.set(chiave(a.champId, a.gara), a);
  return [...ultimi.values()].sort((x, y) => new Date(y.quando) - new Date(x.quando));
}

export function confronta(vecchio, nuovo, adesso = new Date()) {
  const avvisi = [...(vecchio?.avvisi || [])];
  const prima = new Map();
  for (const c of vecchio?.championships || [])
    for (const m of c.matches || []) prima.set(chiave(c.id, m.gara), m);

  for (const c of nuovo.championships || [])
    for (const m of c.matches || []) {
      if (!m.mine) continue;
      const v = prima.get(chiave(c.id, m.gara));
      if (!v) continue;                     // partita mai vista prima: non e' uno spostamento
      const cosa = [];
      if ((v.date || '') !== (m.date || '')) cosa.push('data');
      if ((v.time || '') !== (m.time || '')) cosa.push('ora');
      if (norm(v.venue) !== norm(m.venue)) cosa.push('campo');
      if (!cosa.length) continue;
      avvisi.push({
        id: `${chiave(c.id, m.gara)}-${adesso.toISOString().slice(0, 16)}`,
        champId: c.id, champ: c.label, gara: m.gara,
        home: m.home, away: m.away, cosa,
        prima: { date: v.date, time: v.time, venue: v.venue },
        dopo: { date: m.date, time: m.time, venue: m.venue },
        quando: adesso.toISOString(),
      });
    }
  return potatura(avvisi, adesso);
}

/* ------------------------------------------------------------------ */
/* Il testo della notifica: risultati appena pubblicati e spostamenti. */

const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const giocata = m => !!(m.sets && /\d/.test(m.sets));
const numeri = t => (String(t || '').match(/\d+/g) || []).map(Number);
const nostra = (d, n) => norm(n).includes(norm(d.teamMatch || ''));
// gli stessi nomi accorciati che si vedono nell'app
const RINOMINA = { 'ASPES VOLLEY CUS STATALE MEDNOW': 'ASPES VOLLEY', 'MARTESANA VOLLEY COLOGNO': 'MARTESANA VOLLEY' };
const breve = n => RINOMINA[String(n || '').trim().toUpperCase()] || n;
const quando = x => {
  if (!x?.date) return 'data da destinarsi';
  const d = new Date(`${x.date}T${x.time || '00:00'}:00`);
  return `${d.getDate()} ${MESI[d.getMonth()]}` + (x.time ? ` alle ${x.time}` : '');
};

/** I risultati delle nostre partite comparsi da un giro all'altro. */
export function risultatiNuovi(vecchio, nuovo) {
  const prima = new Map();
  for (const c of vecchio?.championships || [])
    for (const m of c.matches || []) prima.set(chiave(c.id, m.gara), m);

  const usciti = [];
  for (const c of nuovo.championships || [])
    for (const m of c.matches || []) {
      if (!m.mine || !giocata(m)) continue;
      const v = prima.get(chiave(c.id, m.gara));
      if (!v || giocata(v)) continue;                 // gia' lo sapevamo
      const [a, b] = numeri(m.sets);
      const casa = nostra(nuovo, m.home);
      const nostri = casa ? a : b, loro = casa ? b : a;
      usciti.push({ champ: c.label, gara: m.gara, avversaria: casa ? m.away : m.home, nostri, loro });
    }
  return usciti;
}

/** "Under 17 Femminile" -> "Under 17": nella notifica lo spazio e' poco e il
 *  genere non distingue niente, i campionati seguiti sono tutti femminili. */
const campionato = s => String(s || '').replace(/\s*(femminile|maschile)\s*$/i, '').trim();

/** Il messaggio da mostrare sul telefono, o null se non c'e' niente da dire. */
export function messaggio(vecchio, nuovo, avvisi, adesso = new Date()) {
  const risultati = risultatiNuovi(vecchio, nuovo);
  const appena = (avvisi || []).filter(a => new Date(a.quando) >= new Date(adesso.getTime() - 6e4));
  const righe = [];

  for (const r of risultati)
    righe.push(`${r.nostri > r.loro ? 'Vinta' : 'Persa'} ${r.nostri}-${r.loro} con ${breve(r.avversaria)}`);
  // il campionato davanti: chi segue due squadre deve sapere di quale si parla
  for (const a of appena) {
    const chi = a.champ ? `${campionato(a.champ)}, ` : '';
    righe.push(a.cosa.length === 1 && a.cosa[0] === 'campo'
      ? `${chi}cambio campo: ora si gioca a ${a.dopo.venue || 'campo da definire'}`
      : `${chi}spostata la partita con ${breve(nostra(nuovo, a.home) ? a.away : a.home)}: ${quando(a.dopo)}`);
  }

  if (!righe.length) return null;
  const titolo = risultati.length
    ? (risultati.length > 1 ? 'Risultati' : 'Risultato')
    : 'Attenzione, partita spostata';
  return { titolo, testo: righe.join(' · '), tag: `volley-${adesso.toISOString().slice(0, 16)}`,
           quando: adesso.toISOString() };
}
