// src/app/auth/callback/route.ts
// Step 2: Roblox redirects back here with ?code=xxx&state=xxx

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'

const ROBLOX_TOKEN_URL   = 'https://apis.roblox.com/oauth/v1/token'
const ROBLOX_USERINFO_URL = 'https://apis.roblox.com/oauth/v1/userinfo'
const ROBLOX_AVATAR_URL  = 'https://thumbnails.roblox.com/v1/users/avatar-headshot'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const savedState     = cookieStore.get('roblox_oauth_state')?.value
  const codeVerifier   = cookieStore.get('roblox_code_verifier')?.value

  // Validate state to prevent CSRF
  if (!code || !state || state !== savedState || !codeVerifier) {
    return NextResponse.redirect(new URL('/?error=oauth_failed', req.url))
  }

  // Clear oauth cookies
  cookieStore.delete('roblox_oauth_state')
  cookieStore.delete('roblox_code_verifier')

  try {
    // ── Exchange code for tokens ──────────────────────────────────────────────
    const tokenRes = await fetch(ROBLOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        code_verifier: codeVerifier,
        redirect_uri:  process.env.ROBLOX_REDIRECT_URI!,
        client_id:     process.env.ROBLOX_CLIENT_ID!,
        client_secret: process.env.ROBLOX_CLIENT_SECRET!,
      }),
    })

    if (!tokenRes.ok) throw new Error('Token exchange failed')
    const { access_token, id_token } = await tokenRes.json()

    // ── Get Roblox user info ──────────────────────────────────────────────────
    const userRes = await fetch(ROBLOX_USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!userRes.ok) throw new Error('Userinfo fetch failed')
    const robloxUser = await userRes.json()
    // robloxUser = { sub: "12345678", name: "DisplayName", preferred_username: "Username" }

    const robloxId    = parseInt(robloxUser.sub)
    const username    = robloxUser.preferred_username || robloxUser.name

    // ── Fetch avatar ──────────────────────────────────────────────────────────
    let avatarUrl: string | null = null
    try {
      const avatarRes = await fetch(
        `${ROBLOX_AVATAR_URL}?userIds=${robloxId}&size=150x150&format=Png&isCircular=true`
      )
      const avatarData = await avatarRes.json()
      avatarUrl = avatarData?.data?.[0]?.imageUrl ?? null
    } catch { /* avatar is optional */ }

    // ── Upsert in Supabase Auth ───────────────────────────────────────────────
    const serviceClient = createServiceClient()

    // Use roblox_{id} as the stable email for Supabase auth
    const fakeEmail = `roblox_${robloxId}@groupflip.internal`

    const { data: authData, error: authError } = await serviceClient.auth.admin.getUserById(
      fakeEmail // try to find existing user first
    ).catch(() => ({ data: null, error: new Error('not found') }))

    let supabaseUserId: string

    if (authError || !authData?.user) {
      // Create new Supabase auth user
      const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
        email:          fakeEmail,
        password:       crypto.randomUUID(), // random password, auth is via Roblox only
        email_confirm:  true,
        user_metadata:  { roblox_id: robloxId, username },
      })
      if (createError || !newUser.user) throw new Error('Failed to create auth user')
      supabaseUserId = newUser.user.id
    } else {
      supabaseUserId = authData.user.id
    }

    // ── Upsert in public.users ────────────────────────────────────────────────
    const { error: upsertError } = await serviceClient.from('users').upsert({
      id:         supabaseUserId,
      roblox_id:  robloxId,
      username,
      avatar_url: avatarUrl,
    }, {
      onConflict: 'roblox_id',
      ignoreDuplicates: false,
    })
    if (upsertError) throw new Error(`User upsert failed: ${upsertError.message}`)

    // ── Create a session link token and redirect ──────────────────────────────
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type:  'magiclink',
      email: fakeEmail,
    })
    if (linkError || !linkData?.properties?.hashed_token) {
      throw new Error('Failed to generate session link')
    }

    // Redirect to the magic link which will set the session cookies
    const sessionUrl = new URL(linkData.properties.action_link)
    const redirectUrl = new URL('/auth/confirm', req.url)
    redirectUrl.searchParams.set('token_hash', linkData.properties.hashed_token)
    redirectUrl.searchParams.set('type', 'magiclink')
    redirectUrl.searchParams.set('next', '/')

    return NextResponse.redirect(redirectUrl)

  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(new URL('/?error=auth_failed', req.url))
  }
}
