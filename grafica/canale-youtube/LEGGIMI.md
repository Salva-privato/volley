# Grafica del canale YouTube "Martesana Volley Genitori"

Disegnate il 7 ottobre 2026.

| File | Dove va |
|---|---|
| `banner-2560x1440.jpg` | **Banner in uso**: ragazze ai lati delle scritte, visibili anche da telefono |
| `banner-alternativo-ragazze-ai-lati.jpg` | Variante: ragazze piu' larghe, visibili solo da computer |
| `banner-semplice.jpg` | Prima versione, solo logo e scritte |
| `profilo-scuro.png` / `profilo-turchese.png` | Immagine del profilo (YouTube la ritaglia in un cerchio) |

YouTube mostra del banner solo una fascia: da computer 2560x423 al centro,
da telefono 1546x423. Scritte e visi devono stare li' dentro.

Le tre giocatrici (`alzata.jpg`, `schiacciata.jpg`, `ricezione.jpg`) sono
**illustrazioni generate con Gemini**, non ragazze vere: sono le stesse delle
copertine delle dirette (`docs/copertine/`). Per cambiarle si rifanno con
Gemini, giocatrice a destra e sinistra buia, e si ridisegna.

Per ridisegnare dopo una modifica alle pagine `.html`:

    node grafica/canale-youtube/disegna.cjs
