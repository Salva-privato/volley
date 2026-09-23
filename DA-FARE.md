# Da fare

Aggiornato il 22 settembre 2026. Prima partita vera: **venerdì 16 ottobre**,
Geas Volley – Martesana, Under 19, ore 21:00 a Sesto San Giovanni.

## 22 settembre — fatto

- [x] Chiave di trasmissione presa da YouTube e messa in `CHIAVE_TRASMISSIONE`
      su Cloudflare: `diretta.html` mostra il tasto verde, quindi il servizio
      la consegna.
- [x] `push/worker.js` ripubblicato (registrazioni a elenco). Trigger cron
      verificati: `*/2 * * * *` per il canale, 12:30 e 20:30 UTC per il battito.
- [x] Moblin configurata sul telefono principale: trasmissione importata
      (H.264/AVC, 1080p, 30 fps) e widget Browser "Tabellone" su tutte e due le
      scene. **La misura giusta è 1920×1080**: Moblin propone 500×500 e il
      tabellone viene un francobollo. Istruzioni corrette dentro
      `docs/diretta.html`.

## Resta da fare sul telefono

- [ ] **Anche il telefono di scorta**, con gli stessi due passi. Se quello che
      filma si scarica a metà partita, l'altro deve poter riprendere subito:
      configurarlo mentre la partita è in corso non si riesce. Per il telefono
      di un altro genitore si usa "Invito per trasmettere" dalla regia.
- [ ] **Prova.** Diretta **pubblica** mentre si gioca — è la strada scelta il
      22/09 — così il riconoscimento automatico fa tutto da solo e non si
      incolla nessun link. A prova finita, da YouTube Studio si porta il video
      su "non in elenco": "Rivedi la partita" continua a funzionare.
      Il pannello "È partita: avvisa tutti" resta la rete di sicurezza, per le
      dirette non in elenco o se il riconoscimento non partisse.

Tutto in chiaro in `push/ISTRUZIONI.md`.

## Imparato alla prova del 22 settembre

- **La privacy: risolta.** Spegnendo *"Imposta la riproduzione della
  trasmissione dal vivo come non in elenco al termine dello streaming"* (cabina
  di regia → Impostazioni dello stream → Impostazioni aggiuntive) ogni diretta
  nasce **pubblica**, e il riconoscimento automatico la vede. Era quella
  l'eredita' avvelenata: la privacy "non in elenco" applicata a fine streaming
  restava nel modello e se la prendeva la diretta dopo. Il prezzo: le
  registrazioni restano pubbliche finche' non le si nasconde a mano.
- **L'incorporamento: non si puo' rendere permanente.** Provate il 23/09 tutte
  e tre le strade, misurate dall'esterno, tutte con lo stesso esito `false`:
  (1) spunta nel modello della chiave predefinita; (2) spunta sulla diretta
  precedente; (3) **evento pianificato** con la spunta messa alla creazione -
  Moblin ci si aggancia davvero (il titolo dell'evento arriva), ma andando in
  onda YouTube azzera comunque l'incorporamento.
  **L'unico momento in cui la spunta tiene e' a diretta gia' viva**, e li'
  l'effetto e' immediato (verificato: da `false` a `true` in pochi secondi).
  Scritto dentro `docs/diretta.html` come "la sosta di un minuto".
- [ ] **La via definitiva: far sistemare tutto al servizio.** Con le credenziali
      del canale su Cloudflare (OAuth, non la semplice chiave API), quando il
      servizio si accorge che siamo in onda puo' mettere lui il video pubblico e
      incorporabile, e vedrebbe anche le dirette non in elenco. Mezz'ora di
      configurazione, toglie l'unico gesto manuale rimasto. Da decidere prima
      del 16 ottobre.
- **Il widget Browser di Moblin nasce 500×500**: va messo a 1920×1080.
- **Gli identificativi di YouTube non si ricopiano a mano**: `I` maiuscola e
  `l` minuscola sono identiche a schermo, e un carattere sbagliato dà lo stesso
  "video non disponibile" senza dire perché.
- [ ] **Il servizio potrebbe accorgersene.** Quando si incolla un collegamento
      in "È partita", accetta qualunque cosa somigli a un identificativo senza
      chiedere a Google se quel video esiste. Potrebbe rispondere "non trovo
      quel video" invece di accettare in silenzio. Attenzione: per i video non
      in elenco Google non risponde comunque, quindi dev'essere un avviso, non
      un rifiuto.

## Le tre cose lasciate aperte, in ordine di quanto pesano

- [ ] **Nessuno viene avvisato quando si comincia a segnare.** La spinta sul
      telefono ("Siamo in diretta") parte solo quando il servizio si accorge
      che il canale YouTube è andato in onda (`push/worker.js:235`). Se si
      battono solo i punti senza trasmettere — il caso più probabile in
      trasferta — il tabellone compare sull'app ma nessuno lo sa: i genitori
      devono aprirla per caso. Il tasto "Partita iniziata" è il posto giusto
      dove attaccare anche l'avviso.
- [ ] **Fino a un minuto di ritardo.** L'app chiede il punteggio una volta al
      minuto (`docs/index.html`, `avviaDiretta`). Sul finale di un set chi
      guarda da casa vede i punti arrivare a scatti. Si può stringere a dieci
      o quindici secondi mentre c'è una partita in corso, e lasciare tutto
      com'è il resto del tempo.
- [x] ~~**Il tabellone in corso sparisce dopo mezz'ora senza punti.**~~ Fatto
      il 22/09: l'attesa senza punti passa da trenta a **novanta minuti**, il
      risultato finale resta due ore. Il conto riparte a ogni punto, quindi la
      durata della partita non c'entra: conta solo la pausa piu' lunga.

Deciso il 22/09: le dirette si fanno **pubbliche mentre si gioca** (cosi' il
riconoscimento automatico funziona e non si deve incollare nessun link) e
diventano **"non in elenco"** appena si ferma Moblin. Il passaggio non e' a
mano: lo fa YouTube, con l'interruttore *"Imposta la riproduzione della
trasmissione dal vivo come non in elenco al termine dello streaming"*, nella
cabina di regia sotto **Impostazioni dello stream → Impostazioni aggiuntive**.
Il tasto "Rivedi la partita" nell'app continua a funzionare lo stesso.

Nella stessa schermata **non esistono** avvio e arresto automatico: con la
chiave predefinita YouTube parte e si ferma da solo col segnale di Moblin.

## Cose rimaste vuote

- [ ] **`docs/sponsor.json` è una lista vuota:** la striscia degli sponsor
      sotto il tabellone nel video non compare mai. O la si riempie, o quel
      pezzo tanto vale toglierlo.
- [ ] **`docs/notifica.json` ha ancora il testo segnaposto "Ci sono novità".**
      È solo la rete di sicurezza se le altre fonti tacciono, ma se una
      notifica parte da lì il messaggio è quello.

## Si può provare solo in campo, il 16 ottobre

Tutto scritto e mai passato da una partita vera:

- il riconoscimento automatico della diretta su YouTube, con le due trappole
  note (Moblin non riceve i riquadri; Google non vede i video non in elenco);
- la registrazione che a fine partita resta agganciata alla gara;
- gli inviti a tempo da mandare su WhatsApp, per i punti e per trasmettere;
- i promemoria della sera prima alle 18 e di tre ore prima del fischio, che
  non sono mai scattati perché la stagione non è cominciata.
