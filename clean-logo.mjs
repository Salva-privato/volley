// Il logo di partenza e' verde su BIANCO OPACO: su fondo oro il bianco si vede.
// Qui il bianco diventa trasparente e i bordi sfumati vengono ricostruiti
// come trasparenza del verde, cosi' il logo sta bene su qualunque fondo.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data:image/png;base64,' + readFileSync('docs/logo-originale.png').toString('base64');
const b = await chromium.launch();
const p = await b.newPage();
const out = await p.evaluate(async src => {
  const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  const [TR, TG, TB] = [32, 80, 80];          // verde petrolio del logo
  let bianchi = 0, sfumati = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i+3] === 0) continue;
    // quanto e' "verde" il pixel: 1 = verde pieno, 0 = bianco
    let a = (255 - px[i]) / (255 - TR);
    if (a < 0) a = 0; if (a > 1) a = 1;
    if (a < 0.04) bianchi++; else if (a < 0.96) sfumati++;
    px[i] = TR; px[i+1] = TG; px[i+2] = TB;
    px[i+3] = Math.round(a * px[i+3]);
  }
  x.putImageData(d, 0, 0);
  return { url: c.toDataURL('image/png'), bianchi, sfumati, tot: px.length/4 };
}, SRC);
writeFileSync('docs/logo.png', Buffer.from(out.url.split(',')[1], 'base64'));
console.log(`pixel resi trasparenti: ${out.bianchi}  |  bordi sfumati ricostruiti: ${out.sfumati}  |  totale: ${out.tot}`);
await b.close();
