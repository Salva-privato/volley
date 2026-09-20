# Messa online — istruzioni passo passo

Il progetto va sull'account personale **SalvaJava**, separato da quello di
Noesis Links. Quello che segue tocca a te; la parte tecnica sul Mac è già
pronta (chiave SSH dedicata e configurazione delle identità).

---

## 1. Fai pulizia (facoltativo)

Per ognuno dei due repository di prova, da **SalvaJava**:

`github.com/SalvaJava/<nome>` → **Settings** → in fondo, **Danger Zone** →
**Delete this repository** → riscrivi `SalvaJava/<nome>` per confermare.

L'operazione e' **definitiva**: spariscono codice, cronologia e commenti, e non
si recuperano. Falla solo se sei certo che fossero prove.

## 2. Nascondi la tua email nei commit

Con l'account **SalvaJava**:

**Settings → Emails** → spunta **Keep my email addresses private** e
**Block command line pushes that expose my email**.

Nella stessa pagina compare un indirizzo tipo
`12345678+SalvaJava@users.noreply.github.com`: **copialo**, servirà
subito dopo. È quello che firmerà i commit, così la tua email vera non finisce
nella cronologia pubblica del progetto.

## 3. Registra la chiave SSH

La chiave è già stata creata sul tuo Mac, dedicata solo a questo progetto.

**Settings → SSH and GPG keys → New SSH key**
- Title: `Mac — volley`
- Key type: `Authentication Key`
- Key: incolla la riga che ti ho mostrato in chat (inizia con `ssh-ed25519`)

Se ti serve di nuovo, la ritrovi con:

```bash
cat ~/.ssh/id_ed25519_volley.pub
```

## 4. Crea il repository

**https://github.com/new** (sempre come SalvaJava)

- Nome: `volley`
- Visibilità: **Public**

Sulla visibilità: con GitHub Pages gratuito il sito è comunque raggiungibile da
chiunque abbia l'indirizzo, anche da repository privato a pagamento. I dati
sono già pubblici sul portale FIPAV, quindi Public non espone nulla di nuovo —
e in più rende illimitati i minuti di automazione. Tenerlo privato costerebbe
un piano a pagamento per avere Pages.

**Non** aggiungere README o .gitignore: ci sono già.

## 5. Dimmi nome utente e indirizzo noreply

Scrivimi l'**indirizzo noreply** copiato al punto 2. Configuro l'identità nel
repository e faccio il primo invio io, così non rischi di pubblicare i commit
con l'email di lavoro.

---

## 6. Dopo il primo invio (lo farai tu sul sito)

**Settings → Pages**
- Source: *Deploy from a branch* — Branch: `main`, cartella **/docs** → Save

**Settings → Actions → General → Workflow permissions**
- **Read and write permissions** → Save

Senza questo secondo passaggio l'aggiornamento automatico dei risultati non
riesce a salvare i dati.

Dopo un paio di minuti l'app è su `https://salvajava.github.io/volley/`.

## 7. Installa l'app sul telefono

**iPhone (Safari):** apri il link → Condividi → *Aggiungi a Home*.
**Android (Chrome):** apri il link → menu ⋮ → *Installa app*.

---

## Come restano separate le due identità

- La chiave SSH `~/.ssh/id_ed25519_volley` vale **solo** per questo progetto.
- In `~/.ssh/config` l'alias `github-volley` la associa a GitHub.
- Il repository usa quell'alias al posto di `github.com`, quindi git non può
  usare per sbaglio le credenziali di lavoro.
- L'email dei commit è impostata **nel singolo repository**, non globalmente:
  gli altri progetti sul Mac non cambiano.

## Quando arriveranno Under 21 e Coppa Milano (febbraio)

1. Trova il campionato sul sito FIPAV e copia l'ID dall'URL
   (`.../calendarioris/1001XXX/2026`).
2. Aggiungilo in `config.json`.
3. `git add config.json && git commit -m "Aggiungi Under 21" && git push`

Stessa cosa per la seconda fase di Under 17 e Under 19, che sul portale FIPAV
avrà un ID diverso dalla prima fase.
