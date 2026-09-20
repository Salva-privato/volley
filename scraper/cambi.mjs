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
