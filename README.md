# GroupFlip — Setup Guide

Roblox group wagering platform. No real money. Supabase + Next.js + Discord Bot.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Database | Supabase (PostgreSQL + Realtime + Auth + Storage) |
| Auth | Roblox OAuth 2.0 |
| Ownership Check | Rolimons API (auto) + manual screenshot |
| Discord | discord.js v14 bot on Railway |
| Hosting | Vercel (frontend) + Railway (bot) |

---

## Quick Start

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. In **Database → Replication**, enable Realtime on:
   - `flips`
   - `roulette_rounds`
   - `roulette_bets`
   - `chat_messages`
   - `users`
4. In **Storage**, create a bucket called `group-screenshots` and set it to **private**
5. Copy your `SUPABASE_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` from Settings → API

### 2. Roblox OAuth

1. Go to [create.roblox.com](https://create.roblox.com) → **Credentials** → **OAuth 2.0 Apps**
2. Create an app
3. Set redirect URI: `https://yourdomain.com/auth/callback`
4. Request scopes: `openid profile`
5. Copy `CLIENT_ID` and `CLIENT_SECRET`

### 3. Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Create a new application
3. Under **Bot**, create a bot and copy the token
4. Under **OAuth2**, add redirect: `https://yourdomain.com/api/discord/callback`
5. Invite the bot to your server with scope `bot` and permission `Manage Roles`
6. In your Discord server, create these roles **exactly** (case-sensitive):
   - `Whale`
   - `God`
   - `Staff`
   - `Manager`
7. Move the bot's role **above** all of the above in Server Settings → Roles

### 4. Local Development

```bash
# Clone the repo
git clone your-repo
cd groupflip

# Install dependencies
npm install

# Copy env file
cp .env.example .env.local
# Fill in all values in .env.local

# Run the app
npm run dev
# → http://localhost:3000

# Run the Discord bot (separate terminal)
cd discord-bot
npm install
npx ts-node index.ts
```

### 5. Deploy Frontend (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add all env vars in Vercel dashboard → Settings → Environment Variables
```

### 6. Deploy Discord Bot (Railway)

1. Push `discord-bot/` to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set environment variables:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_GUILD_ID`
   - `DISCORD_WEBHOOK_SECRET`
   - `PORT=3001`
4. Railway auto-assigns a public URL — set `DISCORD_BOT_WEBHOOK_URL` to it in Vercel

### 7. Deploy Roulette Spin Function (Supabase Edge Functions)

```bash
# Install Supabase CLI
npm i -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-id

# Deploy the spin function
supabase functions deploy roulette-spin

# Set up a cron schedule in Supabase Dashboard:
# Functions → roulette-spin → Schedule → every minute "* * * * *"
```

### 8. Make Yourself Owner

After logging in for the first time, run this in Supabase SQL Editor:

```sql
update public.users
set rank = 'owner'
where roblox_id = YOUR_ROBLOX_ID;
```

---

## File Structure

```
groupflip/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/roblox/route.ts       ← Start Roblox OAuth
│   │   │   ├── verify-group/route.ts      ← Group ownership check
│   │   │   ├── flip/route.ts              ← Create/list flips
│   │   │   ├── flip/[id]/route.ts         ← Join + execute flip
│   │   │   ├── roulette/route.ts          ← Rounds + bet placement
│   │   │   ├── discord/link/route.ts      ← Start Discord OAuth
│   │   │   ├── discord/callback/route.ts  ← Discord OAuth callback
│   │   │   └── admin/route.ts             ← All admin actions
│   │   ├── auth/callback/route.ts         ← Roblox OAuth callback
│   │   └── [pages]...
│   ├── hooks/
│   │   └── useRealtime.ts                 ← All Supabase Realtime hooks
│   ├── lib/
│   │   └── supabase.ts                    ← Supabase client helpers
│   ├── types/
│   │   └── index.ts                       ← All TypeScript types
│   └── middleware.ts                      ← Auth session refresh + route guard
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql         ← All tables, RLS, functions
│   └── functions/
│       └── roulette-spin/index.ts         ← Cron spin Edge Function
├── discord-bot/
│   └── index.ts                           ← Full Discord bot
├── .env.example                           ← All required env vars
└── package.json
```

---

## Security Notes

- **Service role key** is only used server-side. Never in client components.
- **Flip randomness** uses `crypto.getRandomValues()` server-side. Client never sees result before DB commit.
- **RLS** is enabled on every table. Test it — try hitting the API with a different user's JWT.
- **Discord webhook** uses a shared secret header. The bot rejects requests without it.
- **Group ownership** — always confirm `owner.userId` from Roblox API matches the logged-in user, even after Rolimons auto-approval.

---

## Cost

| Service | Cost |
|---|---|
| Vercel | Free |
| Supabase | Free (500MB DB, 2GB storage) |
| Railway | Free (500hr) → ~$5/mo always-on |
| Domain | ~$12/yr |
| **Total** | **~$0–17** |
