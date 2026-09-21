/**
 * Dati di prova: prende il calendario vero e inventa i risultati delle
 * prime giornate, cosi' si puo' vedere come sara' l'app a stagione
 * avviata. Scrive docs/demo.json, che l'app usa solo con ?demo=1.
 * Non tocca mai docs/data.json.
 *
 *   node scraper/demo.mjs 7 1001240       (7 giornate dell'Under 17)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GIORNATE = Number(process.argv[2] || 7);
const SOLO = process.argv[3] || null;              // id del campionato, o tutti
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// numeri a caso ma sempre gli stessi, per poter rifare la stessa prova
let seme = 20261016;
const caso = () => (seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648;
const fra = (a, b) => a + Math.floor(caso() * (b - a + 1));

const punti = (a, b) => a === 3 && b <= 1 ? [3, 0] : a === 3 ? [2, 1] : b === 3 && a <= 1 ? [0, 3] : [1, 2];

/** Un set credibile: 25-x, oppure ai vantaggi, e il quinto a 15. */
function set(vince, quinto) {
  const limite = quinto ? 15 : 25;
  if (caso() < 0.18) { const p = fra(limite, limite + 6); return vince ? [p + 2, p] : [p, p + 2]; }
  const perso = fra(quinto ? 7 : 12, limite - 2);
  return vince ? [limite, perso] : [perso, limite];
}

const dati = JSON.parse(readFileSync(new URL('../docs/data.json', import.meta.url)));

for (const c of dati.championships) {
  if (SOLO && c.id !== SOLO) continue;

  // a ogni squadra una "forza", stabile per tutta la simulazione
  const forza = new Map();
  for (const m of c.matches) for (const t of [m.home, m.away])
    if (!forza.has(norm(t))) forza.set(norm(t), 0.3 + caso() * 0.55);
  // la nostra la mettiamo in alto, ma non prima: e' piu' interessante da guardare
  for (const [k] of forza) if (k.includes(norm(dati.teamMatch))) forza.set(k, 0.72);

  for (const m of c.matches) {
    if ((m.giornata || 99) > GIORNATE) continue;
    const fc = forza.get(norm(m.home)) + 0.06;          // un po' di fattore campo
    const fo = forza.get(norm(m.away));
    const vinceCasa = caso() < fc / (fc + fo);
    const setPersi = caso() < 0.34 ? 2 : caso() < 0.5 ? 1 : 0;
    const quinto = setPersi === 2;
    const sequenza = [];
    let vinti = 0, persi = 0;
    while (vinti < 3 && persi < 3) {
      const tocca = persi < setPersi && caso() < 0.45 ? false : vinti < 3;
      const q = vinti + persi === 4;
      const [a, b] = set(tocca === true, q);
      sequenza.push(vinceCasa ? [a, b] : [b, a]);
      if (tocca) vinti++; else persi++;
      if (persi > setPersi) break;
    }
    const casa = vinceCasa ? 3 : 3 - (quinto ? 1 : 0);
    const fuori = sequenza.length - (vinceCasa ? 3 : 3);
    const setCasa = sequenza.filter(([a, b]) => a > b).length;
    const setFuori = sequenza.length - setCasa;
    m.sets = `${setCasa} ${setFuori}`;
    m.partialsLines = [sequenza.map(x => x[0]).join(' '), sequenza.map(x => x[1]).join(' ')];
    m.partials = m.partialsLines.join(' ');
  }

  // classifica rifatta come fa la FIPAV
  const tab = new Map();
  const tocca = t => { const k = norm(t);
    if (!tab.has(k)) tab.set(k, { team: t, points: 0, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, pf: 0, ps: 0 });
    return tab.get(k); };
  for (const m of c.matches) { tocca(m.home); tocca(m.away); }
  for (const m of c.matches) {
    if (!m.sets) continue;
    const [a, b] = m.sets.split(' ').map(Number);
    const [pa, pb] = punti(a, b);
    const A = tocca(m.home), B = tocca(m.away);
    A.points += pa; B.points += pb; A.played++; B.played++;
    A.setsWon += a; A.setsLost += b; B.setsWon += b; B.setsLost += a;
    (a > b ? A : B).won++; (a > b ? B : A).lost++;
    const righe = m.partialsLines.map(r => r.split(' ').map(Number));
    A.pf += righe[0].reduce((x, y) => x + y, 0); A.ps += righe[1].reduce((x, y) => x + y, 0);
    B.pf += righe[1].reduce((x, y) => x + y, 0); B.ps += righe[0].reduce((x, y) => x + y, 0);
  }
  const fila = [...tab.values()].sort((x, y) =>
    y.points - x.points ||
    (y.setsWon / Math.max(1, y.setsLost)) - (x.setsWon / Math.max(1, x.setsLost)) ||
    (y.pf / Math.max(1, y.ps)) - (x.pf / Math.max(1, x.ps)) ||
    x.team.localeCompare(y.team, 'it'));
  c.standings = fila.map((x, i) => ({
    pos: String(i + 1), team: x.team, points: String(x.points), played: String(x.played),
    won: String(x.won), lost: String(x.lost),
    setsWon: String(x.setsWon), setsLost: String(x.setsLost),
    setRatio: (x.setsWon / Math.max(1, x.setsLost)).toFixed(2),
  }));
  console.log(`${c.label}: ${GIORNATE} giornate simulate`);
  console.table(c.standings.map(r => ({ pos: r.pos, squadra: r.team.slice(0, 28), punti: r.points, set: `${r.setsWon}-${r.setsLost}` })));
}

dati.finto = true;
dati.updatedAt = new Date().toISOString();
writeFileSync(new URL('../docs/demo.json', import.meta.url), JSON.stringify(dati, null, 1));
console.log('scritto docs/demo.json');
