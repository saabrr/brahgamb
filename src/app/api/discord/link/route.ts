// src/app/api/discord/link/route.ts
// Links a player's Discord account so the bot can assign roles

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient } from '@/lib/supabase'
import { cookies } from 'next/headers'

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize'
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token'
const DISCORD_ME_URL = 'https://discord.com/api/users/@me'

// ── GET — initiate Discord OAuth ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requireAuth() // must be logged in to link Discord

    const state = crypto.randomUUID()
    const cookieStore = await cookies()
    cookieStore.set('discord_oauth_state', state, {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 10,
    })

    const params = new URLSearchParams({
      client_id:     process.env.DISCORD_CLIENT_ID!,
      redirect_uri:  `${process.env.NEXT_PUBLIC_SITE_URL}/api/discord/callback`,
      response_type: 'code',
      scope:         'identify',
      state,
    })

    return NextResponse.redirect(`${DISCORD_AUTH_URL}?${params}`)
  } catch {
    return NextResponse.redirect(new URL('/profile?error=not_logged_in', req.url))
  }
}

// ── src/app/api/discord/callback/route.ts ────────────────────────────────────
// (this would be a separate file, but kept here for brevity in documentation)
//
// GET /api/discord/callback
// 1. Exchange code for Discord access token
// 2. Fetch Discord user info (id + username)
// 3. Save discord_id to users table
// 4. Sync current rank roles via bot
