// src/app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const base  = new URL('/', req.url).toString()

  const cookieStore = await cookies()
  const savedState   = cookieStore.get('roblox_state')?.value
  const verifier     = cookieStore.get('roblox_verifier')?.value

  cookieStore.delete('roblox_state')
  cookieStore.delete('roblox_verifier')

  if (!code || !state || state !== savedState || !verifier) {
    return NextResponse.redirect(`${base}?error=invalid_state`)
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri:  process.env.ROBLOX_REDIRECT_URI!,
        client_id:     process.env.ROBLOX_CLIENT_ID!,
        client_secret: process.env.ROBLOX_CLIENT_SECRET!,
      }),
    })
    if (!tokenRes.ok) throw new Error('Token exchange failed')
    const { access_token } = await tokenRes.json()

    // 2. Get Roblox user info
    const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!userRes.ok) throw new Error('Userinfo failed')
    const robloxUser = await userRes.json()
    const robloxId = parseInt(robloxUser.sub)
    const username = robloxUser.preferred_username || robloxUser.name || `user_${robloxId}`

    // 3. Fetch avatar (optional)
    let avatarUrl: string | null = null
    try {
      const avatarRes = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=true`
      )
      const avatarData = await avatarRes.json()
      avatarUrl = avatarData?.data?.[0]?.imageUrl ?? null
    } catch { /* non-fatal */ }

    // 4. Upsert in Supabase Auth + public.users
    const service = createServiceClient()
    const fakeEmail = `roblox_${robloxId}@groupflip.internal`

    // Try to find existing auth user
    const { data: listData } = await service.auth.admin.listUsers()
    const existing = listData?.users?.find(u => u.email === fakeEmail)

    let supabaseUserId: string
    if (existing) {
      supabaseUserId = existing.id
    } else {
      const { data: newUser, error: createErr } = await service.auth.admin.createUser({
        email:         fakeEmail,
        password:      crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { roblox_id: robloxId, username },
      })
      if (createErr || !newUser.user) throw new Error('Failed to create auth user')
      supabaseUserId = newUser.user.id
    }

    // Upsert public.users
    await service.from('users').upsert({
      id:         supabaseUserId,
      roblox_id:  robloxId,
      username,
      avatar_url: avatarUrl,
    }, { onConflict: 'roblox_id' })

    // 5. Generate magic link for session
    const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
      type:  'magiclink',
      email: fakeEmail,
    })
    if (linkErr || !linkData.properties?.hashed_token) {
      throw new Error('Failed to generate session link')
    }

    const confirmUrl = new URL('/auth/confirm', req.url)
    confirmUrl.searchParams.set('token_hash', linkData.properties.hashed_token)
    confirmUrl.searchParams.set('type', 'magiclink')
    confirmUrl.searchParams.set('next', '/')

    return NextResponse.redirect(confirmUrl)
  } catch (e) {
    console.error('OAuth callback error:', e)
    return NextResponse.redirect(`${base}?error=auth_failed`)
  }
}
