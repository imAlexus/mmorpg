
# MMO Web - Auth Starter (Supabase Email+Password, con conferma email)

Pronto con:
- Register/Login Supabase (email+password) **con conferma email**
- Verifica JWT sul server (Socket.IO middleware)
- Chat overlay (basso-sinistra), minimappa, HUD ping
- WASD/frecce per muoversi

## Setup
1) In Supabase → **Authentication → URL Configuration**
   - **Site URL**: `http://localhost:3000`
   - **Additional Redirect URLs**: aggiungi `http://localhost:3000`
2) Copia `.env.example` in `.env` e incolla le chiavi.
3) In `public/client.js` sostituisci `<<INSERISCI_SUPABASE_URL>>` e `<<INSERISCI_SUPABASE_ANON_KEY>>`.
4) Installa e avvia:
   ```bash
   npm install
   npm run start
   ```
5) Registra un account → conferma via email → Login → entri.

## Heroku
- Committa `package-lock.json` (crealo con `npm install`).
- Aggiungi `Procfile` (già incluso) e ENV (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT`).
- Engines: Node 20.x (già impostato).

## (Opzionale) profili persistenti
Se vuoi salvare nome/colore nel tempo, crea tabella `profiles` (vedi conversazione).
