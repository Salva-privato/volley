// Decide se vale la pena fare lo scraping completo.
//
// A stagione in corso si cerca solo finche' mancano risultati di partite gia'
// giocate: quando sono tutti dentro, le corse successive escono subito e si
// riprende quando si torna in campo.
//
// Prima dell'inizio della stagione non ci sono risultati da raccogliere, ma il
// calendario puo' ancora cambiare (date da destinarsi, cambi di palestra):
// si fa un solo controllo ogni due giorni.
import { readFileSync } from 'node:fs';

const ATTESA_FINE = 2 * 60 * 60 * 1000;        // una gara si considera finita 2h dopo l'inizio
const LIMITE      = 12 * 24 * 60 * 60 * 1000;  // oltre 12 giorni si rinuncia (gara annullata)
const PRE_STAGIONE = 2 * 24 * 60 * 60 * 1000;  // ritmo dei controlli prima dell'inizio

const esito = (attiva, serve, motivo, dettaglio) => {
  console.log(`attiva=${attiva}`);
  console.log(`serve=${serve}`);
  console.log(`motivo=${motivo}`);
  if (dettaglio) console.error(dettaglio);
  process.exit(0);
};

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));

let dati = null;
try { dati = JSON.parse(readFileSync(new URL('../docs/data.json', import.meta.url))); }
catch { esito(true, true, 'nessun-dato'); }

const ora = Date.now();
const inizio = cfg.startDate ? new Date(`${cfg.startDate}T00:00:00`).getTime() : 0;

// --- prima dell'inizio: un controllo ogni due giorni, per i cambi di calendario ---
if (ora < inizio) {
  const eta = ora - Date.parse(dati.updatedAt || 0);
  const giorni = (eta / 86400000).toFixed(1);
  if (eta >= PRE_STAGIONE)
    esito(true, true, 'controllo-pre-stagione',
          `Stagione non ancora iniziata, ma i dati risalgono a ${giorni} giorni fa: si controlla il calendario.`);
  esito(false, false, 'pre-stagione-recente',
        `Stagione dal ${cfg.startDate}. Dati aggiornati ${giorni} giorni fa: nessun controllo.`);
}

// --- a stagione in corso: si cercano i risultati mancanti ---
const mancanti = [];
for (const c of dati.championships || []) {
  for (const m of c.matches || []) {
    if (!m.mine || !m.date || !m.time) continue;
    if (m.sets && /\d/.test(m.sets)) continue;
    const avvio = new Date(`${m.date}T${m.time}:00`).getTime();
    const da = ora - (avvio + ATTESA_FINE);
    if (da > 0 && da < LIMITE) mancanti.push(`${c.label} ${m.date} ${m.time}`);
  }
}
esito(true, mancanti.length > 0,
      mancanti.length ? 'mancano-risultati' : 'tutto-aggiornato',
      mancanti.length ? 'In attesa di:\n  ' + mancanti.join('\n  ') : null);
