// Genera le icone dell'app dal logo societario su fondo verde petrolio.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const LOGO = 'data:image/png;base64,' + readFileSync('docs/logo.png').toString('base64');
const page = s => `<body style="margin:0;width:${s}px;height:${s}px;background:#1d4f50;
  display:flex;align-items:center;justify-content:center;border-radius:${Math.round(s*0.22)}px;overflow:hidden">
  <img src="${LOGO}" style="height:${Math.round(s*0.72)}px;filter:brightness(0) invert(1)">
</body>`;

const b = await chromium.launch();
for (const s of [180, 512]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(page(s));
  await p.waitForTimeout(250);
  await p.screenshot({ path: `docs/icon-${s}.png` });
  await p.close();
}
await b.close();
console.log('icone rigenerate dal logo');
