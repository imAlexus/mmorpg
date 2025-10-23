
# MMO Web - Auth Starter (Supabase Email+Password)

Starter pronto con:
- Login/Register (email+password) via **Supabase**
- Verifica JWT sul server (Socket.IO middleware)
- Chat overlay in basso a sinistra (stile Albion)
- Mini-mappa e HUD con ping
- Movimento base con WASD/frecce

## Requisiti
- Node.js 18+
- Account Supabase (free)

## Setup
1) Crea un progetto su Supabase e annota **Project URL** e **Anon Key**.
2) Copia `.env.example` in `.env` e incolla i tuoi valori.
3) Apri `public/client.js` e sostituisci `<<INSERISCI_SUPABASE_URL>>` e `<<INSERISCI_SUPABASE_ANON_KEY>>`.
   > In alternativa, puoi fare un semplice build che inietti le env lato client.
4) Installa dipendenze e avvia:
   ```bash
   npm install
   npm run start
   ```
5) Vai su **http://localhost:3000** → appare la schermata di autenticazione.

## Note
- Il server controlla il token in handshake, quindi **senza login non si entra**.
- Nome/Colore al momento non sono salvati su DB; se vuoi salvarli, usa la service role key lato server per upsert su `profiles`.
- Per Produzione: imposta le stesse env (SUPABASE_URL, SUPABASE_ANON_KEY, PORT) sulla piattaforma (Render, Railway, Fly.io).

## Extra DB (opzionale)
Tabella profili:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  color text,
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles
for select using (auth.uid() = id);
create policy "upsert own profile" on public.profiles
for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles
for update using (auth.uid() = id);
```
