# Da fare

Aggiornato il 22 settembre 2026. Prima partita vera: **venerdì 16 ottobre**,
Geas Volley – Martesana, Under 19, ore 21:00 a Sesto San Giovanni.

## 22 settembre — fatto

- [x] Chiave di trasmissione presa da YouTube e messa in `CHIAVE_TRASMISSIONE`
      su Cloudflare: `diretta.html` mostra il tasto verde, quindi il servizio
      la consegna.
- [x] `push/worker.js` ripubblicato (registrazioni a elenco). Trigger cron
      verificati: `*/2 * * * *` per il canale, 12:30 e 20:30 UTC per il battito.

## Resta da fare sul telefono

- [ ] **Moblin sul telefono che filma**, una volta sola: installarla, aprirla,
      dare i permessi. Poi da `diretta.html` premere "Apri Moblin già pronto"
      (chiave, H.264, 1080p30, trasmissione in sottofondo entrano da sole).
- [ ] **Il riquadro del tabellone, a mano.** Il collegamento `moblin://` sa
      consegnare solo la trasmissione, non i riquadri: in Moblin **Scenes →
      Widgets → ＋ → Browser**, indirizzo
      `https://salva-privato.github.io/volley/tabellone.html?modo=video`,
      in alto a sinistra, larghezza attorno al 33%.
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
riconoscimento automatico funziona e non si deve incollare nessun link) e si
portano a **"non in elenco" dopo**, a freddo, da YouTube Studio. Il tasto
"Rivedi la partita" nell'app continua a funzionare lo stesso.

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
