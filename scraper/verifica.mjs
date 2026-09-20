// Decide se vale la pena fare lo scraping completo.
//
// Regola: si cerca solo finche' mancano risultati di partite gia' giocate.
// Quando tutti i risultati della settimana sono dentro, le corse successive
// escono subito e si riprende quando si torna in campo.
import { readFileSync } from 'node:fs';

const ATTESA_FINE = 2 * 60 * 60 * 1000;   // una gara si considera finita 2h dopo l'inizio
const LIMITE      = 12 * 24 * 60 * 60 * 1000; // oltre 12 giorni si rinuncia (gara annullata o non omologata)

let dati;
try { dati = JSON.parse(readFileSync(new URL('../docs/data.json', import.meta.url))); }
catch { console.log('motivo=nessun-dato'); console.log('serve=true'); process.exit(0); }

const ora = Date.now();
const mancanti = [];
for (const c of dati.championships || []) {
  for (const m of c.matches || []) {
    if (!m.mine || !m.date || !m.time) continue;
    if (m.sets && /\d/.test(m.sets)) continue;              // risultato gia' presente
    const inizio = new Date(`${m.date}T${m.time}:00`).getTime();
    const da = ora - (inizio + ATTESA_FINE);
    if (da > 0 && da < LIMITE) mancanti.push(`${c.label} ${m.date} ${m.time}`);
  }
}

console.log(`motivo=${mancanti.length ? 'mancano-risultati' : 'tutto-aggiornato'}`);
console.log(`serve=${mancanti.length > 0}`);
if (mancanti.length) console.error('In attesa di:\n  ' + mancanti.join('\n  '));
