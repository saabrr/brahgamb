# GroupFlip

Roblox group wagering platform. One repo, two deployments.

## How it's structured

```
groupflip/
├── src/                          ← Next.js app (Vercel)
│   ├── app/
│   │   ├── page.tsx              ← Full frontend UI
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── auth/
│   │   │   ├── callback/route.ts ← Roblox OAuth callback
│   │   │   └── confirm/route.ts  ← Session confirm
│   │   └── api/
│   │       ├── auth/roblox/      ← Start Roblox OAuth
│   │       ├── flip/             ← Create/list flips
│   │       ├── flip/[id]/        ← Join + execute flip
│   │       ├── roulette/         ← Rounds + bets
│   │       ├── verify-group/     ← Ownership check
│   │       ├── discord/link/     ← Start Discord OAuth
│   │       ├── discord/callback/ ← Discord OAuth callback
│   │       └── admin/            ← All admin actions
│   ├── lib/
│   │   ├── supabase.ts           ← DB clients + auth helpers
│   │   └── api.ts                ← Response helpers
│   ├── types/index.ts            ← All TypeScript types
│   └── middleware.ts             ← Auth + route protection
├── discord-bot/                  ← Discord bot (Railway)
│   ├── index.js                  ← Full bot (plain JS)
│   └── package.json              ← Bot-only deps
├── supabase/
│   ├── migrations/001_schema.sql ← Run this in Supabase SQL Editor
│   └── functions/roulette-spin/  ← Cron Edge Function
├── .env.example                  ← Copy to .env.local, fill in values
├── vercel.json                   ← Vercel config
└── railway.json                  ← Railway config (runs discord-bot/)
```

---

## Setup

### 1. Supabase
1. Create project at supabase.com
2. SQL Editor → paste and run `supabase/migrations/001_schema.sql`
3. Database → Replication → enable Realtime on: `flips`, `roulette_rounds`, `roulette_bets`, `chat_messages`, `users`
4. Storage → create bucket `group-screenshots` (private)

### 2. Roblox OAuth
1. create.roblox.com → Credentials → OAuth 2.0 Apps
2. New app → redirect URI: `https://yourdomain.com/auth/callback`
3. Scopes: `openid profile`
4. Copy client ID and secret

### 3. Discord Bot
1. discord.com/developers/applications → New Application
2. Bot → create bot → copy token
3. OAuth2 → add redirect: `https://yourdomain.com/api/discord/callback`
4. Invite bot to server with scope `bot` and permission `Manage Roles`
5. In your server create roles (exact names): `Whale`, `God`, `Staff`, `Manager`
6. Move the bot role ABOVE all of those in Server Settings → Roles

### 4. Environment Variables
```bash
cp .env.example .env.local
# Fill in every value in .env.local
# NEVER commit .env.local
```

### 5. Deploy — Vercel (Next.js frontend)
1. Push this repo to GitHub (make sure .env.local is NOT committed)
2. vercel.com → New Project → import repo
3. Add all env vars from .env.example in Vercel dashboard → Settings → Environment Variables
4. Deploy

### 6. Deploy — Railway (Discord bot)
1. railway.app → New Project → Deploy from GitHub repo (same repo)
2. Railway reads `railway.json` automatically → it runs `discord-bot/node index.js`
3. Add env vars in Railway dashboard:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_GUILD_ID`
   - `DISCORD_WEBHOOK_SECRET`
4. Settings → Networking → Generate Domain → copy the URL
5. Add that URL as `DISCORD_BOT_WEBHOOK_URL` in Vercel

### 7. Deploy — Roulette Spin (Supabase Edge Function)
```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-id
supabase functions deploy roulette-spin
```
Then in Supabase dashboard → Edge Functions → roulette-spin → Schedules → add cron `* * * * *`

### 8. Make yourself Owner
After logging in for the first time, run this in Supabase SQL Editor:
```sql
update public.users set rank = 'owner' where roblox_id = YOUR_ROBLOX_ID;
```

---

## Generating secrets

```bash
# DISCORD_WEBHOOK_SECRET — run this in terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Cost

| Service | Cost |
|---|---|
| Vercel | Free |
| Supabase | Free |
| Railway | Free → ~$5/mo |
| Domain | ~$12/yr |
