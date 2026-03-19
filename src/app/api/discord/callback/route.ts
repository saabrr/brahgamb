// src/app/api/discord/callback/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient } from '@/lib/supabase'
import { cookies } from 'next/headers'

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token'
const DISCORD_ME_URL    = 'https://discord.com/api/users/@me'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('discord_oauth_state')?.value
  cookieStore.delete('discord_oauth_state')

  if (!code || state !== savedState) {
    return NextResponse.redirect(new URL('/profile?error=discord_failed', req.url))
  }

  try {
    const { dbUser } = await requireAuth()

    // Exchange code for token
    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${process.env.NEXT_PUBLIC_SITE_URL}/api/discord/callback`,
      }),
    })

    if (!tokenRes.ok) throw new Error('Discord token exchange failed')
    const { access_token } = await tokenRes.json()

    // Get Discord user info
    const meRes = await fetch(DISCORD_ME_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!meRes.ok) throw new Error('Discord user fetch failed')
    const discordUser = await meRes.json()

    const service = createServiceClient()

    // Check if this Discord account is already linked to another GroupFlip user
    const { data: existing } = await service
      .from('users')
      .select('id, username')
      .eq('discord_id', discordUser.id)
      .neq('id', dbUser.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.redirect(
        new URL('/profile?error=discord_already_linked', req.url)
      )
    }

    // Save discord_id to user
    await service
      .from('users')
      .update({ discord_id: discordUser.id })
      .eq('id', dbUser.id)

    // Sync current rank roles via bot
    try {
      await fetch(`${process.env.DISCORD_BOT_WEBHOOK_URL}/sync-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': process.env.DISCORD_WEBHOOK_SECRET!,
        },
        body: JSON.stringify({
          discord_id: discordUser.id,
          rank:       dbUser.rank,
        }),
      })
    } catch { /* non-fatal */ }

    return NextResponse.redirect(new URL('/profile?discord=linked', req.url))

  } catch (err) {
    console.error('Discord callback error:', err)
    return NextResponse.redirect(new URL('/profile?error=discord_failed', req.url))
  }
}
