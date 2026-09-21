/**
 * Promemoria delle partite: la sera prima e tre ore prima del fischio
 * d'inizio. Si esegue ogni ora; decide da solo se c'e' qualcosa da dire e
 * tiene il conto di quelli gia' mandati, per non ripetersi.
 *
 *   node scraper/promemoria.mjs [--adesso 2026-10-16T18:05:00Z]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DATI   = new URL('../docs/data.json', import.meta.url);
const STATO  = new URL('../promemoria-inviati.json', import.meta.url);
const USCITA = new URL('../docs/notifica.json', import.meta.url);
const SEGNALE= new URL('../avvisare.txt', import.meta.url);

const ORA_VIGILIA = 18;              // la sera prima, alle 18 italiane
const ANTICIPO    = 3 * 60 * 60e3;   // e poi tre ore prima della partita
const TOLLERANZA  = 35 * 60e3;       // gira ogni ora: accetto mezz'ora di scarto
const MESI = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const RINOMINA = { 'ASPES VOLLEY CUS STATALE MEDNOW': 'ASPES VOLLEY',
                   'MARTESANA VOLLEY COLOGNO': 'MARTESANA VOLLEY' };
const breve = n => RINOMINA[String(n || '').trim().toUpperCase()] || n;
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Quanto e' avanti l'Italia rispetto al tempo universale, in quel momento. */
function scartoRoma(ms) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return Date.parse(f.format(new Date(ms)).replace(' ', 'T') + 'Z') - ms;
}
/** Data e ora italiane -> istante assoluto (regge il cambio dell'ora legale). */
function istante(data, ora = '00:00') {
  const [Y, M, D] = data.split('-').map(Number);
  const [h, m] = ora.split(':').map(Number);
  const base = Date.UTC(Y, M - 1, D, h, m);
  let t = base - scartoRoma(base);
  t = base - scartoRoma(t);
  return t;
}
/** Le parti di una data, lette con l'orologio italiano. */
function partiRoma(ms) {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const [g, o] = f.format(new Date(ms)).split(' ');
  return { giorno: g, ora: Number(o.slice(0, 2)) };
}

const dati = JSON.parse(readFileSync(DATI));
const nostra = n => norm(n).includes(norm(dati.teamMatch || ''));
const partite = [];
for (const c of dati.championships || [])
  for (const m of c.matches || [])
    if (m.mine && m.date && m.time) partite.push({ ...m, champ: c.label, champId: c.id, quando: istante(m.date, m.time) });
partite.sort((a, b) => a.quando - b.quando);

const argAdesso = process.argv.indexOf('--adesso');
const adesso = argAdesso > 0 ? Date.parse(process.argv[argAdesso + 1]) : Date.now();
const qui = partiRoma(adesso);

let inviati = [];
try { if (existsSync(STATO)) inviati = JSON.parse(readFileSync(STATO)); } catch (e) {}
const gia = new Set(inviati.map(x => x.id));

/** "17:30 con MI3 VOLLEY (in casa, Palestra Toti)" */
function riga(m) {
  const casa = nostra(m.home);
  const avv = breve(casa ? m.away : m.home);
  const dove = m.venue ? `${casa ? 'in casa' : 'in trasferta'}, ${m.venue}` : (casa ? 'in casa' : 'in trasferta');
  const d = new Date(m.quando);
  const p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(d);
  return `${p} con ${avv} (${dove})`;
}

const nuovi = [];
const righe = [];

// 1) la sera prima, alle 18 italiane: le partite di domani
if (qui.ora === ORA_VIGILIA) {
  const domani = partiRoma(adesso + 24 * 60 * 60e3).giorno;
  for (const m of partite.filter(m => m.date === domani)) {
    const id = `${m.champId}-${m.gara}-vigilia`;
    if (gia.has(id)) continue;
    nuovi.push({ id, quando: new Date(adesso).toISOString() });
    righe.push({ tipo: 'vigilia', testo: riga(m) });
  }
}

// 2) tre ore prima del fischio d'inizio
for (const m of partite) {
  const bersaglio = m.quando - ANTICIPO;
  if (Math.abs(adesso - bersaglio) > TOLLERANZA) continue;
  const id = `${m.champId}-${m.gara}-tre-ore`;
  if (gia.has(id)) continue;
  nuovi.push({ id, quando: new Date(adesso).toISOString() });
  righe.push({ tipo: 'tre-ore', testo: riga(m) });
}

if (!righe.length) { console.log('niente da ricordare'); process.exit(0); }

const soloVigilia = righe.every(r => r.tipo === 'vigilia');
const soloTreOre  = righe.every(r => r.tipo === 'tre-ore');
// se sono tutte dello stesso giorno lo dico una volta sola in testa,
// altrimenti lo ripeto riga per riga
const giorno = r => r.tipo === 'vigilia' ? 'domani' : 'oggi';
const testo = (soloVigilia || soloTreOre)
  ? `${giorno(righe[0])} ${righe.map(r => r.testo).join(' · ')}`
  : righe.map(r => `${giorno(r)} ${r.testo}`).join(' · ');
const messaggio = {
  titolo: soloVigilia ? 'Domani si gioca' : soloTreOre ? 'Fra poco si gioca' : 'Promemoria partite',
  testo: testo.charAt(0).toUpperCase() + testo.slice(1),
  tag: `promemoria-${new Date(adesso).toISOString().slice(0, 13)}`,
  quando: new Date(adesso).toISOString(),
};

// tengo solo i promemoria degli ultimi due mesi, il resto non serve piu'
const limite = new Date(adesso - 60 * 24 * 60 * 60e3).toISOString();
writeFileSync(STATO, JSON.stringify([...inviati.filter(x => x.quando > limite), ...nuovi], null, 1));
writeFileSync(USCITA, JSON.stringify(messaggio, null, 1));
writeFileSync(SEGNALE, messaggio.testo);
console.log(`promemoria: ${messaggio.titolo} — ${messaggio.testo}`);
