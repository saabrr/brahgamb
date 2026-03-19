// discord-bot/index.ts
// Run with: npx ts-node index.ts
// Deploy to Railway — set env vars in Railway dashboard
//
// Required Discord bot permissions:
//   - Manage Roles
//   - Read Messages
// Required Intents: Guilds
//
// In your Discord server, create these roles (exact names):
//   Whale, God, Staff, Manager
// Make sure the bot's role is ABOVE all of these in the role hierarchy.

import { Client, GatewayIntentBits, Guild, GuildMember } from 'discord.js'
import express, { Request, Response, NextFunction } from 'express'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

// ── Role priority — higher = more prestigious ─────────────────────────────────
const ROLE_HIERARCHY: Record<string, number> = {
  Whale:   1,
  God:     2,
  Staff:   3,
  Manager: 4,
}
// Roles the bot manages (not Owner — that's manual)
const MANAGED_ROLES = Object.keys(ROLE_HIERARCHY)

client.once('ready', () => {
  console.log(`[GroupFlip Bot] Logged in as ${client.user?.tag}`)
})

client.login(process.env.DISCORD_BOT_TOKEN!)

// ── Express webhook server ────────────────────────────────────────────────────
const app = express()
app.use(express.json())

// Auth middleware — verify requests come from our Next.js server
function verifySecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers['x-webhook-secret']
  if (secret !== process.env.DISCORD_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ── POST /assign-role ─────────────────────────────────────────────────────────
// Body: { discord_id: string, role_name: 'Whale' | 'God' | 'Staff' | 'Manager' }
app.post('/assign-role', verifySecret, async (req: Request, res: Response) => {
  const { discord_id, role_name } = req.body

  if (!discord_id || !role_name) {
    return res.status(400).json({ error: 'Missing discord_id or role_name' })
  }

  if (!MANAGED_ROLES.includes(role_name)) {
    return res.status(400).json({ error: `Invalid role: ${role_name}` })
  }

  try {
    const guild = await getGuild()
    const member = await guild.members.fetch(discord_id)

    await assignRoleWithCleanup(guild, member, role_name)

    console.log(`[Bot] Assigned ${role_name} to ${member.user.tag}`)
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[Bot] assign-role error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /remove-role ─────────────────────────────────────────────────────────
app.post('/remove-role', verifySecret, async (req: Request, res: Response) => {
  const { discord_id, role_name } = req.body

  try {
    const guild = await getGuild()
    const member = await guild.members.fetch(discord_id)
    const role = guild.roles.cache.find(r => r.name === role_name)

    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role)
      console.log(`[Bot] Removed ${role_name} from ${member.user.tag}`)
    }

    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /sync-user — sync all roles for a user based on their current rank ──
app.post('/sync-user', verifySecret, async (req: Request, res: Response) => {
  const { discord_id, rank } = req.body
  // rank: 'user' | 'whale' | 'god' | 'staff' | 'manager' | 'owner'

  const rankToRole: Record<string, string | null> = {
    user:    null,
    whale:   'Whale',
    god:     'God',
    staff:   'Staff',
    manager: 'Manager',
    owner:   null, // owner is set manually in Discord
  }

  const targetRole = rankToRole[rank]

  try {
    const guild = await getGuild()
    const member = await guild.members.fetch(discord_id)

    // Remove all managed roles first
    for (const roleName of MANAGED_ROLES) {
      const role = guild.roles.cache.find(r => r.name === roleName)
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role)
      }
    }

    // Assign the correct one
    if (targetRole) {
      const role = guild.roles.cache.find(r => r.name === targetRole)
      if (role) await member.roles.add(role)
    }

    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    ok:      true,
    bot:     client.user?.tag ?? 'Not ready',
    guilds:  client.guilds.cache.size,
    uptime:  Math.floor(process.uptime()),
  })
})

// ── Helper: assign role, removing lower-tier roles ───────────────────────────
async function assignRoleWithCleanup(guild: Guild, member: GuildMember, roleName: string) {
  const targetPriority = ROLE_HIERARCHY[roleName]

  for (const managed of MANAGED_ROLES) {
    const role = guild.roles.cache.find(r => r.name === managed)
    if (!role) continue

    if (ROLE_HIERARCHY[managed] < targetPriority && member.roles.cache.has(role.id)) {
      // Remove lower-tier roles (e.g., remove Whale when assigning God)
      await member.roles.remove(role)
    }
  }

  const newRole = guild.roles.cache.find(r => r.name === roleName)
  if (!newRole) throw new Error(`Role "${roleName}" not found in server. Create it first.`)

  if (!member.roles.cache.has(newRole.id)) {
    await member.roles.add(newRole)
  }
}

// ── Helper: get guild with retry ─────────────────────────────────────────────
async function getGuild(): Promise<Guild> {
  const guildId = process.env.DISCORD_GUILD_ID!
  let guild = client.guilds.cache.get(guildId)

  if (!guild) {
    guild = await client.guilds.fetch(guildId)
  }

  if (!guild) throw new Error(`Guild ${guildId} not found`)
  return guild
}

const PORT = parseInt(process.env.PORT ?? '3001')
app.listen(PORT, () => {
  console.log(`[GroupFlip Bot] Webhook server listening on port ${PORT}`)
})
