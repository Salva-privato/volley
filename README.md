# Volley Martesana

App personale per seguire le partite di pallavolo: prossima partita in evidenza,
calendario completo e classifica del girone, per più campionati.

I dati arrivano dal portale FIPAV Milano (`sol.milano.federvolley.it`), che è
un'applicazione Blazor Server: il contenuto non è nell'HTML ma viaggia su
WebSocket, quindi va letto con un browser headless (Playwright). Per questo lo
scraper gira su GitHub Actions e non dentro l'app.

## Come funziona

```
config.json          campionati seguiti e nome squadra
scraper/scrape.mjs   apre il sito, trova il girone della squadra, estrae tutto
docs/data.json       output dello scraper (l'app legge solo questo)
docs/index.html      l'app (pagina singola, nessuna dipendenza)
.github/workflows/   aggiornamento automatico dei dati
```

Lo scraper **non ha i gironi cablati**: legge la scheda "Squadre" del campionato
e ricava da lì in quale girone gioca la squadra. Se la squadra cambia girone,
o si aggiunge un campionato nuovo, non va toccato il codice.

## Aggiungere un campionato

Serve solo l'ID che compare nell'URL del campionato sul sito FIPAV
(`.../calendarioris/<ID>/2026`). In `config.json`:

```json
{ "id": "1001xxx", "label": "3ª Divisione Under 21" }
```

Se la squadra non è iscritta a quel campionato, lo scraper lo salta con un
avviso, senza rompere il resto.

## Comandi

```bash
npm install
npx playwright install chromium
node scraper/scrape.mjs        # aggiorna docs/data.json
npx serve docs                 # prova l'app in locale
```

## Aggiornamento automatico

Il workflow riesegue lo scraper e committa `docs/data.json` **solo se qualcosa
è cambiato**. Si può lanciare anche a mano dalla scheda **Actions** di GitHub.

Prima della data indicata in `config.json` come `startDate` (16 ottobre 2026)
si fa **un solo controllo ogni due giorni**: non ci sono risultati da
raccogliere, ma il calendario può ancora cambiare (date da destinarsi,
cambi di palestra).

Quando gira, a stagione iniziata:

- **ogni 2 ore dalle 09:00 alle 23:00**; di notte mai, perche' nessuno inserisce
  risultati mentre dormiamo.

Ma la corsa non scarica il sito ogni volta. Prima controlla `docs/data.json`:
se **tutte le partite gia' giocate hanno il loro risultato**, esce in pochi
secondi senza aprire il browser. Riprende da sola quando si torna in campo e
c'e' di nuovo qualcosa da raccogliere. Fa eccezione la corsa delle 09:00, che
va sempre a fondo per intercettare rinvii, cambi di campo e campionati nuovi.

Una gara senza risultato viene cercata fino a **12 giorni** dopo; oltre si
presume annullata o non omologata e si smette di insistere.

## Note

- I campi risultato restano vuoti finché il campionato non inizia (17/10/2026).
- Le gare con data "DA DESTINARSI" vengono mostrate in fondo, senza data.

## Dirette su SpikeVolley TV

I collegamenti stanno in `docs/dirette.json`, separati dai dati (lo scraper
non lo tocca mai):

```json
{ "canale": "https://www.youtube.com/@SpikeVolley_TV/streams",
  "gare": { "9506": "https://youtu.be/xxxxxxxxxxx" } }
```

Il numero è quello della gara FIPAV, visibile nel calendario del portale.
Si modifica da GitHub anche dal telefono (matita in alto a destra sul file,
poi *Commit changes*): dopo un minuto il pulsante compare nell'app.

Senza collegamento segnato, mentre la partita si gioca il pulsante porta
comunque all'elenco delle dirette del canale.
