// src/app/api/auth/roblox/route.ts
// Step 1: Redirect user to Roblox OAuth login page

import { NextResponse } from 'next/server'
import { generateState, generateCodeVerifier, calculatePKCECodeChallenge } from 'oslo/oauth2'
import { cookies } from 'next/headers'

export async function GET() {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)

  const params = new URLSearchParams({
    client_id:              process.env.ROBLOX_CLIENT_ID!,
    redirect_uri:           process.env.ROBLOX_REDIRECT_URI!,
    response_type:          'code',
    scope:                  'openid profile',
    state,
    code_challenge:         codeChallenge,
    code_challenge_method:  'S256',
  })

  const cookieStore = await cookies()
  cookieStore.set('roblox_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 10,
  })
  cookieStore.set('roblox_code_verifier', codeVerifier, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 10,
  })

  return NextResponse.redirect(
    `https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`
  )
}
