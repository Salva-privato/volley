import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const BASE = 'https://www.sol.milano.federvolley.it/calendarioris';
const norm = s => (s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Testo di ogni cella di una riga, righe multiple preservate come array. */
const CELLS = `rows => rows.map(r => Array.from(r.querySelectorAll('td'))
  .map(c => c.innerText.split('\\n').map(x => x.trim()).filter(Boolean)))`;

async function openTab(page, label) {
  const tabs = await page.$$eval('.rz-tabview-nav li a', els => els.map(e => e.textContent.trim()));
  let i = tabs.indexOf(label);
  if (i < 0 && label === 'Classifiche') i = tabs.findIndex(t => /^Classific/i.test(t));
  if (i < 0) return false;
  await page.$$eval('.rz-tabview-nav li a', (els, i) => els[i].click(), i);
  await page.waitForTimeout(1500);
  // attende che il pannello attivo abbia almeno una griglia popolata
  await page.waitForFunction(() => {
    const p = document.querySelector('.rz-tabview-panel[aria-hidden="false"]');
    return p && p.querySelectorAll('tbody tr').length > 0;
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return true;
}

/** Blocchi del pannello attivo: intestazione ("GIRONE G - Giornata n. 1") + righe della griglia che segue. */
async function readBlocks(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.rz-tabview-panel[aria-hidden="false"]');
    if (!panel) return [];
    const out = [];
    let title = null;
    for (const el of panel.querySelectorAll('div')) {
      const grid = el.closest('.rz-data-grid');
      if (grid && grid !== el) continue;           // gia' dentro una griglia letta
      if (el.classList.contains('rz-data-grid')) {
        const rows = Array.from(el.querySelectorAll('tbody tr'))
          .map(r => Array.from(r.querySelectorAll('td'))
            .map(c => c.innerText.split('\n').map(x => x.trim()).filter(Boolean)))
          .filter(r => r.length > 1);
        if (rows.length) out.push({ title, rows });
        title = null;
      } else if (el.children.length === 0) {
        const t = el.textContent.trim();
        if (t) title = t;
      }
    }
    return out;
  });
}

function parseDate(lines) {
  // ["17/10/2026", "sab : 15.30"]  oppure  ["DA DESTINARSI"]
  const d = lines.find(l => /^\d{2}\/\d{2}\/\d{4}$/.test(l));
  if (!d) return { date: null, time: null, raw: lines.join(' ') };
  const t = (lines.join(' ').match(/(\d{1,2})[.:](\d{2})/) || [])[0];
  const [dd, mm, yyyy] = d.split('/');
  const time = t ? t.replace('.', ':').padStart(5, '0') : null;
  return { date: `${yyyy}-${mm}-${dd}`, time, raw: lines.join(' ') };
}

async function scrapeChampionship(page, champ) {
  const url = `${BASE}/${champ.id}/${cfg.season}`;
  console.log(`\n== ${champ.label} (${champ.id})`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.rz-tabview-title', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 2, null, { timeout: 60000 });
  await page.waitForTimeout(2000);

  // 1) Tab "Squadre": trova il girone della nostra squadra
  const teamRows = await page.$$eval('.rz-tabview-panel[aria-hidden="false"] tbody tr', eval(CELLS));
  const want = norm(cfg.teamMatch);
  const mine = teamRows.filter(r => r.length >= 3 && r.slice(1).join(' ') && norm(r.join(' ')).includes(want));
  if (!mine.length) { console.log('   squadra non trovata in questo campionato'); return null; }
  const girone = mine[0][1][0];
  const teamName = mine[0][2][0];
  console.log(`   squadra: ${teamName} — girone ${girone}`);

  // 2) Tab del girone: calendario + risultati
  const matches = [];
  if (await openTab(page, girone)) {
    for (const blk of await readBlocks(page)) {
      const giornata = (blk.title && (blk.title.match(/Giornata n\.\s*(\d+)/i) || [])[1]) || null;
      for (const c of blk.rows) {
        if (c.length < 6) continue;
        const { date, time, raw } = parseDate(c[1] || []);
        matches.push({
          gara: (c[0] || [])[0] || null,
          giornata: giornata ? Number(giornata) : null,
          date, time, dateRaw: raw,
          home: (c[2] || [])[0] || null,
          away: (c[2] || [])[1] || null,
          sets: (c[3] || []).join(' ') || null,
          partials: (c[4] || []).join(' ') || null,
          venue: (c[5] || [])[0] || null,
          address: (c[5] || []).slice(1).join(' ') || null,
        });
      }
    }
  }
  console.log(`   partite: ${matches.length}`);

  // 3) Tab "Classifiche": prende solo il blocco del nostro girone
  let standings = [];
  if (await openTab(page, 'Classifiche')) {
    const bs = await readBlocks(page);
    const blk = bs.find(b => norm(b.title) === `GIRONE ${norm(girone)}`) || (bs.length === 1 ? bs[0] : null);
    if (blk) {
      standings = blk.rows.filter(c => c.length >= 12).map((c, i) => ({
        pos: i + 1,
        team: (c[1] || [])[0] || null,
        club: (c[1] || [])[1] || null,
        points: (c[2] || [])[0] || '0',
        played: (c[3] || [])[0], won: (c[4] || [])[0], lost: (c[5] || [])[0],
        setsWon: (c[6] || [])[0], setsLost: (c[7] || [])[0], setRatio: (c[8] || [])[0],
        pointsFor: (c[9] || [])[0], pointsAgainst: (c[10] || [])[0], pointRatio: (c[11] || [])[0],
      }));
    }
  }
  console.log(`   classifica: ${standings.length} squadre`);

  const isMine = n => norm(n).includes(want);
  return {
    id: champ.id, label: champ.label, url, girone, teamName,
    matches: matches.map(m => ({ ...m, mine: isMine(m.home) || isMine(m.away) })),
    standings,
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
const out = { updatedAt: new Date().toISOString(), season: cfg.season, teamMatch: cfg.teamMatch, championships: [] };
for (const champ of cfg.championships) {
  try {
    const r = await scrapeChampionship(page, champ);
    if (r) out.championships.push(r);
  } catch (e) { console.error(`   ERRORE ${champ.label}: ${e.message}`); }
}
await browser.close();
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/data.json', import.meta.url), JSON.stringify(out, null, 1));
const tot = out.championships.reduce((n, c) => n + c.matches.filter(m => m.mine).length, 0);
console.log(`\nScritto docs/data.json — ${out.championships.length} campionati, ${tot} partite di ${cfg.teamMatch}`);
if (!out.championships.length) process.exit(1);
