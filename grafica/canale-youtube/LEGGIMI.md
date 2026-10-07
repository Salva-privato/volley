# Grafica del canale YouTube "Martesana Volley Genitori"

Disegnata il 7 ottobre 2026.

| File | Dove va |
|---|---|
| `banner-2560x1440.jpg` | **Banner del canale**: le ragazze accanto alle scritte, visibili anche da telefono |
| `profilo-scuro.png` / `profilo-turchese.png` | Immagine del profilo (YouTube la ritaglia in un cerchio) |

Si disegnano da `banner.html` e `profilo.html`. Dopo una modifica:

    node grafica/canale-youtube/disegna.cjs

YouTube mostra del banner solo una fascia: da computer 2560x423 al centro,
da telefono 1546x423. Scritte e visi devono stare li' dentro.

Le giocatrici (`alzata.jpg`, `schiacciata.jpg`) sono **illustrazioni generate
con Gemini**, non ragazze vere: le stesse delle copertine delle dirette
(`docs/copertine/`).
