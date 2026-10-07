// Ridisegna banner e immagini del profilo:  node grafica/canale-youtube/disegna.cjs
// (serve Google Chrome installato). Le pagine si aprono da un piccolo server
// locale: aperte come file, Chrome non colora la fenice.
const {chromium}=require('../../node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const tipi={png:'image/png',jpg:'image/jpeg',html:'text/html'};
const srv=http.createServer((r,s)=>{const f=path.join(__dirname,decodeURIComponent(r.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{'content-type':tipi[f.split('.').pop()]||'text/plain'});s.end(d);});}).listen(8769);
const qui=n=>path.join(__dirname,n);
(async()=>{const b=await chromium.launch({channel:'chrome'});const p=await b.newPage({viewport:{width:2560,height:2400}});
for(const [pagina,file] of [['banner.html','banner-2560x1440.jpg'],['banner-alternativo.html','banner-alternativo-ragazze-ai-lati.jpg']]){
  await p.goto('http://localhost:8769/'+pagina);await p.waitForSelector('body[data-pronta]');await p.waitForTimeout(500);
  await p.screenshot({path:qui(file),type:'jpeg',quality:92,clip:{x:0,y:0,width:2560,height:1440}});}
await p.goto('http://localhost:8769/semplice-e-profilo.html');await p.waitForSelector('body[data-pronta]');await p.waitForTimeout(500);
await (await p.$('#banner')).screenshot({path:qui('banner-semplice.jpg'),type:'jpeg',quality:92});
await (await p.$('#profilo')).screenshot({path:qui('profilo-scuro.png')});
await (await p.$('#profilo2')).screenshot({path:qui('profilo-turchese.png')});
await b.close();srv.close();})();
