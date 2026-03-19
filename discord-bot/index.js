// discord-bot/index.js
// Pure JavaScript — no TypeScript needed, no build step
// Deploy to Railway as a separate project (NOT inside the Next.js repo)
//
// Required env vars:
//   DISCORD_BOT_TOKEN
//   DISCORD_GUILD_ID
//   DISCORD_WEBHOOK_SECRET
//   PORT (Railway sets this automatically)
//
// Install: npm install discord.js express
// Run:     node index.js

const { Client, GatewayIntentBits } = require('discord.js')
const express = require('express')

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

const MANAGED_ROLES = ['Whale', 'God', 'Staff', 'Manager']
const ROLE_PRIORITY = { Whale: 1, God: 2, Staff: 3, Manager: 4 }

client.once('ready', () => {
  console.log(`[GroupFlip Bot] Online as ${client.user.tag}`)
})

client.login(process.env.DISCORD_BOT_TOKEN)

// ── Express webhook server ────────────────────────────────────
const app = express()
app.use(express.json())

// Auth middleware
function auth(req, res, next) {
  if (req.headers['x-webhook-secret'] !== process.env.DISCORD_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// POST /assign-role
app.post('/assign-role', auth, async (req, res) => {
  const { discord_id, role_name } = req.body
  if (!discord_id || !role_name) return res.status(400).json({ error: 'Missing fields' })
  if (!MANAGED_ROLES.includes(role_name)) return res.status(400).json({ error: 'Invalid role' })

  try {
    const guild  = await getGuild()
    const member = await guild.members.fetch(discord_id)

    // Remove lower-tier roles before assigning new one
    for (const r of MANAGED_ROLES) {
      if ((ROLE_PRIORITY[r] ?? 0) < (ROLE_PRIORITY[role_name] ?? 0)) {
        const role = guild.roles.cache.find(x => x.name === r)
        if (role && member.roles.cache.has(role.id)) {
          await member.roles.remove(role)
        }
      }
    }

    const newRole = guild.roles.cache.find(x => x.name === role_name)
    if (!newRole) throw new Error(`Role "${role_name}" not found. Create it in your Discord server first.`)
    if (!member.roles.cache.has(newRole.id)) await member.roles.add(newRole)

    console.log(`[Bot] Assigned ${role_name} to ${member.user.tag}`)
    res.json({ ok: true })
  } catch (e) {
    console.error('[Bot] assign-role error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// POST /sync-user — full role sync based on rank
app.post('/sync-user', auth, async (req, res) => {
  const { discord_id, rank } = req.body
  const rankToRole = { whale: 'Whale', god: 'God', staff: 'Staff', manager: 'Manager' }
  const target = rankToRole[rank] ?? null

  try {
    const guild  = await getGuild()
    const member = await guild.members.fetch(discord_id)

    for (const r of MANAGED_ROLES) {
      const role = guild.roles.cache.find(x => x.name === r)
      if (role && member.roles.cache.has(role.id)) await member.roles.remove(role)
    }

    if (target) {
      const role = guild.roles.cache.find(x => x.name === target)
      if (role) await member.roles.add(role)
    }

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /health
app.get('/health', (_, res) => {
  res.json({ ok: true, bot: client.user?.tag ?? 'not ready', uptime: Math.floor(process.uptime()) })
})

async function getGuild() {
  const id = process.env.DISCORD_GUILD_ID
  return client.guilds.cache.get(id) ?? await client.guilds.fetch(id)
}

const PORT = parseInt(process.env.PORT ?? '3001')
app.listen(PORT, () => console.log(`[GroupFlip Bot] Webhook server on port ${PORT}`))
