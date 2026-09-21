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

## Avvisi di servizio solo a chi tiene in piedi l'app

Gli avvisi della sentinella e i guasti dell'automazione non interessano i
genitori: vanno solo ai telefoni segnati come "di servizio".

Si segna un telefono cosi' (serve la parola d'ordine):

```
curl -X POST "$SERVIZIO/amministratore" -H "x-segreto: $SEGRETO" \
  -H 'content-type: application/json' -d '{"tutti":true}'
```

Con `{"tutti":true}` segna tutti quelli iscritti in quel momento - comodo
finche' c'e' solo il tuo telefono. Altrimenti si passa `{"endpoint":"..."}`.
Il contrassegno sopravvive a una nuova iscrizione dallo stesso telefono, ma
non a una reinstallazione dell'app (cambia l'indirizzo): in quel caso va
rifatto.

## Difese

- L'iscrizione accetta **solo** indirizzi dei veri servizi push (Apple, Google,
  Mozilla, Microsoft) e si ferma a 300 iscritti: nessuno puo' riempire l'elenco
  di indirizzi inventati. Chi e' gia' iscritto passa comunque.
- La disiscrizione controlla l'indirizzo allo stesso modo.
- `GET /stato` vuole la parola d'ordine (prima era pubblico) e dice anche
  quanti iscritti ci sono, cosi' non serve piu' chiamare `/avvisa` per contarli.
- Tutti i comandi che scrivono o inviano restano protetti dalla parola d'ordine.

---

# La diretta e il punteggio dal vivo

Tutto questo capitolo si puo' togliere senza toccare le notifiche: nel worker
sta fra i marcatori `INIZIO DIRETTA` e `FINE DIRETTA` piu' due righe segnate
`aggancio diretta`; nell'app sono le pagine `tabellone.html`, `regia.html`,
`diretta.html` e, dentro `index.html`, i blocchi con gli stessi marcatori.

## Come sta insieme

```
regia.html  →  /punteggio  →  tabellone.html  →  dentro il video (Moblin)
                                             →  dentro l'app (sopra il player)

Moblin  →  RTMP  →  canale YouTube  →  il servizio se ne accorge da solo
                                       →  notifica "Siamo in diretta"
                                       →  il video appare nell'app
                                       →  a fine partita resta la registrazione
```

Il punteggio **non entra dentro il video** per magia: dentro il video ci entra
perche' Moblin disegna `tabellone.html` sopra l'immagine. Chi guarda su YouTube
vede il tabellone solo se Moblin e' configurato con quel riquadro.

## Da fare una volta sola

1. **Canale YouTube** della Martesana; attivare la diretta (la prima volta
   Google fa aspettare 24 ore).
2. Tre variabili nel worker:
   - `CHIAVE_TRASMISSIONE` (segreta) - la chiave di trasmissione di YouTube
   - `CHIAVE_YOUTUBE` (segreta) - una chiave API dalla console di Google,
     con la "YouTube Data API v3" attiva
   - `CANALE_YOUTUBE` - il codice del canale, quello che comincia per `UC`
3. Cron del worker: aggiungere `*/2 * * * *` accanto a quello che c'e' gia'.
4. In Moblin, una volta: **Scenes → Widgets → ＋ → Browser**, indirizzo
   `https://salva-privato.github.io/volley/tabellone.html?modo=video`,
   riquadro in alto a sinistra, larghezza attorno al 33%.

La trasmissione (chiave, codec, risoluzione) **non** si configura a mano: la
consegna la pagina `diretta.html` con un collegamento `moblin://`.

## Ogni partita

Apri `diretta.html` → **Apri Moblin gia' pronto** → tasto rosso.
Qualcuno apre `regia.html` e batte i punti.

## Inviti

Quando filma o segna qualcun altro, la regia genera un collegamento a tempo
(`POST /invito`, ruolo `punti` o `trasmetti`, scadenza a ore). Chi lo riceve
non installa l'app e non conosce la parola d'ordine. Il gettone scade da solo
anche nel magazzino.

Attenzione: la chiave del canale, una volta entrata in Moblin, resta su quel
telefono. Per toglierla davvero si rigenera la chiave su YouTube.

## Quanto costa a Google e a Cloudflare

- Cercare una diretta costa **100 gettoni** su 10.000 al giorno: si cerca solo
  negli orari delle partite, al massimo ogni 5 minuti e non piu' di 60 volte
  al giorno. Quando la diretta e' trovata si passa a un controllo da **1**
  gettone.
- Il punteggio lo leggono tutti gli spettatori ogni secondo e mezzo: la
  risposta e' tenuta in cache sulla rete di Cloudflare per 2 secondi, quindi
  il magazzino viene letto una volta ogni 2 secondi in tutto, non una volta
  per spettatore.

## Comandi

```
curl "$SERVIZIO/punteggio"                     # aperto a tutti
curl "$SERVIZIO/diretta"                       # siamo in onda?
curl "$SERVIZIO/registrazioni"                 # le partite gia' trasmesse
curl -X POST "$SERVIZIO/guarda" -H "x-segreto: $SEGRETO"   # forza il controllo
curl -X DELETE "$SERVIZIO/punteggio" -H "x-segreto: $SEGRETO"  # azzera
```
