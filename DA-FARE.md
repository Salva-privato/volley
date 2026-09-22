# Da fare

Aggiornato il 21 settembre 2026. Prima partita vera: **venerdì 16 ottobre**,
Geas Volley – Martesana, Under 19, ore 21:00 a Sesto San Giovanni.

## Domani, 22 settembre dopo le 15:35

La diretta su YouTube si sblocca (l'attivazione è stata chiesta il 21/09 alle
15:35 e YouTube fa aspettare 24 ore). Manca **solo la chiave di trasmissione**:
tutto il resto della configurazione è già dentro Cloudflare e verificato.

- [ ] **Prendere la chiave di trasmissione.** `studio.youtube.com/channel/UCPfD8euVksy_zOQf6m57MDw`
      → Crea → Trasmetti dal vivo → *Impostazioni di streaming*. È un segreto
      vero: non passa dalla chat e non finisce su GitHub.
- [ ] **Metterla nel worker.** Cloudflare → `volley-notifiche` → Settings →
      Variables → `CHIAVE_TRASMISSIONE`, spuntare **Encrypt**. Finché non c'è,
      `diretta.html` dice "il servizio non ha ancora la chiave".
- [ ] **Moblin sul telefono che filma**, una volta sola: installarla, aprirla,
      dare i permessi. Poi da `diretta.html` premere "Apri Moblin già pronto"
      (chiave, H.264, 1080p30, trasmissione in sottofondo entrano da sole).
- [ ] **Il riquadro del tabellone, a mano.** Il collegamento `moblin://` sa
      consegnare solo la trasmissione, non i riquadri: in Moblin **Scenes →
      Widgets → ＋ → Browser**, indirizzo
      `https://salva-privato.github.io/volley/tabellone.html?modo=video`,
      in alto a sinistra, larghezza attorno al 33%.
- [ ] **Prova.** Diretta **"non in elenco"** (le private non si incorporano
      nell'app, le non in elenco sì). Google non restituisce i video non in
      elenco, quindi il riconoscimento automatico non scatta: in `diretta.html`
      usare "È partita: avvisa tutti" e, a fine prova, "Ho finito".

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

## Da ripubblicare su Cloudflare

- [ ] **`push/worker.js` è cambiato il 22/09** (le registrazioni di una
      giornata diventano un elenco invece dell'ultimo video, per le dirette
      spezzate in due quando il telefono che filma si scarica). Finché non lo
      si incolla nel worker e si preme Deploy, il servizio gira ancora col
      codice di prima: l'app è già pronta a leggere tutti e due i formati,
      quindi nel frattempo non si rompe niente.

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
