// src/app/api/discord/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const base  = process.env.NEXT_PUBLIC_SITE_URL!

  const cookieStore = await cookies()
  const saved = cookieStore.get('discord_state')?.value
  cookieStore.delete('discord_state')

  if (!code || state !== saved) {
    return NextResponse.redirect(`${base}/profile?error=discord_failed`)
  }

  try {
    const dbUser = await requireAuth()

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${base}/api/discord/callback`,
      }),
    })
    if (!tokenRes.ok) throw new Error('Discord token exchange failed')
    const { access_token } = await tokenRes.json()

    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!meRes.ok) throw new Error('Discord user fetch failed')
    const discordUser = await meRes.json()

    const service = createServiceClient()

    // Check not already linked to another account
    const { data: conflict } = await service
      .from('users')
      .select('id')
      .eq('discord_id', discordUser.id)
      .neq('id', dbUser.id)
      .maybeSingle()

    if (conflict) {
      return NextResponse.redirect(`${base}/profile?error=discord_taken`)
    }

    await service
      .from('users')
      .update({ discord_id: discordUser.id })
      .eq('id', dbUser.id)

    // Sync roles via bot
    const botUrl = process.env.DISCORD_BOT_WEBHOOK_URL
    const secret = process.env.DISCORD_WEBHOOK_SECRET
    if (botUrl && secret) {
      await fetch(`${botUrl}/sync-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
        body: JSON.stringify({ discord_id: discordUser.id, rank: dbUser.rank }),
      }).catch(() => {})
    }

    return NextResponse.redirect(`${base}/profile?discord=linked`)
  } catch (e) {
    console.error('Discord callback:', e)
    return NextResponse.redirect(`${base}/profile?error=discord_failed`)
  }
}
