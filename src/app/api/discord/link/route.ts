// src/app/api/discord/link/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const state = crypto.randomUUID()
    const cookieStore = await cookies()
    cookieStore.set('discord_state', state, {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600,
    })

    const params = new URLSearchParams({
      client_id:     process.env.DISCORD_CLIENT_ID!,
      redirect_uri:  `${process.env.NEXT_PUBLIC_SITE_URL}/api/discord/callback`,
      response_type: 'code',
      scope:         'identify',
      state,
    })

    return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
  } catch {
    return NextResponse.redirect(new URL('/profile?error=not_logged_in', req.url))
  }
}
