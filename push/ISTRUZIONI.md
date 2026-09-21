# Notifiche: cosa c'è da fare una volta sola

Il sito su GitHub Pages serve solo file fermi: non può svegliare un telefono.
Serve un servizio minuscolo che tenga l'elenco degli iscritti e spedisca le
notifiche. Usiamo Cloudflare Workers, gratuito e senza carta di credito.

## 1. L'account
Vai su <https://dash.cloudflare.com/sign-up>, registrati con l'email e conferma.

## 2. Lo spazio dove tenere gli iscritti
Nel menù a sinistra: **Storage & Databases → KV → Create instance**.
Chiamalo `iscritti-volley`.

## 3. Il servizio
**Compute (Workers) → Create → Start from Hello World → Deploy**.
Chiamalo `volley-notifiche`. Poi **Edit code**: cancella tutto, incolla il
contenuto di `push/worker.js`, **Deploy**.
L'indirizzo che compare (tipo `https://volley-notifiche.xxx.workers.dev`) serve dopo.

## 4. Le impostazioni del servizio
Nel worker: **Settings → Bindings → Add → KV namespace**
- Variable name: `ISCRITTI` → namespace: `iscritti-volley`

Poi **Settings → Variables and Secrets**, e aggiungi:
- `VAPID_PUBBLICA` (testo normale) → la chiave pubblica
- `VAPID_PRIVATA` (**Secret**) → la chiave privata in JWK
- `SEGRETO` (**Secret**) → una parola d'ordine inventata, lunga
- `CONTATTO` (testo normale) → `mailto:` più la tua email

Le due chiavi VAPID sono in `push/chiavi-generate.txt` (resta sul computer).

## 5. Dire a GitHub come chiamare il servizio
Nel repository: **Settings → Secrets and variables → Actions → New repository secret**
- `SERVIZIO_PUSH` → l'indirizzo del worker, senza barra finale
- `SEGRETO_PUSH` → la stessa parola d'ordine di prima

## 6. Accendere il campanello nell'app
In `docs/index.html`, alla riga `const SERVIZIO_PUSH='';` va messo l'indirizzo
del worker. Finché resta vuota, il campanello non compare.

## Come funziona, in breve
L'automazione scarica i dati; se è uscito un risultato o una partita è stata
spostata scrive il messaggio in `docs/notifica.json`, pubblica, aspetta che il
sito sia aggiornato e chiede al worker di avvisare. Il worker manda a ogni
telefono una spinta **senza testo**; è l'app sul telefono che legge
`notifica.json` e mostra la notifica. Così non serve cifrare niente.

Sull'iPhone le notifiche funzionano **solo con l'app aggiunta alla schermata
Home** (è una regola di Apple), e ognuno deve toccare il campanello una volta.

## La sentinella (aggiunta dopo)

Il servizio fa anche da guardiano dell'automazione. Per attivarla, dopo aver
incollato la versione nuova di `push/worker.js` e fatto **Deploy**:

**Worker → Impostazioni → Eventi trigger → Trigger cron → Aggiungi**, e metti:

```
30 12,20 * * *
```

Sono due controlli al giorno (14:30 e 22:30 italiane d'estate, un'ora prima
d'inverno), scelti dentro la fascia in cui l'automazione lavora: di notte non
gira nessuno ed e' normale che non ci sia battito.

Come funziona: a ogni giro GitHub manda un "battito" a `POST /battito`. Se al
controllo il battito manca da piu' di sei ore, il servizio scrive il messaggio
e manda la notifica, al massimo una al giorno.

Indirizzi aggiunti: `POST /battito`, `POST /messaggio`, `GET /messaggio`,
`GET /stato` (per guardare), `POST /controlla` (per forzare il controllo).
Tutti quelli che scrivono vogliono la parola d'ordine.
