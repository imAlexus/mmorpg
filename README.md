
# Mini Web MMORPG (Starter Kit)

Un progetto minimale per avviare subito un piccolo **MMO sul web**:
- Server Node.js + **Socket.IO** per la sincronizzazione in tempo reale
- Client HTML5 Canvas senza librerie esterne
- Movimento con WASD/frecce, chat globale, nomi personalizzabili
- Mappa grande con griglia, camera che segue il giocatore

## Requisiti
- Node.js 18+
- Porta 3000 libera

## Avvio in locale
```bash
npm install
npm run start
```
Poi apri il browser su **http://localhost:3000**. Apri 2+ tab o dispositivi per testare il multiplayer.

## Deploy veloce (Render/Railway/Fly.io)
1. Fai un nuovo repo con questi file.
2. Crea un nuovo servizio **Web** (Node) puntando a `npm start`.
3. Esponi la porta 3000 (o usa `PORT` fornita dalla piattaforma).

## Struttura
```
server.js         # server Express + Socket.IO + world state
public/index.html # UI + canvas
public/client.js  # logica client, input, render
public/style.css  # stile base
package.json
```

## Prossimi step (idee)
- Collisioni con muri/ostacoli, tileset e mappe JSON
- Inventario/XP/quest, salvataggi su DB (Postgres) con utenti
- Stanza/i (istanze) con canali chat separati
- Anti-cheat di base, rate limit, server authority più forte
- Grafica: sprite, effetti particellari, sound FX
- Hosting del server separato dal front-end (CDN) + HTTPS/WSS
