// src/app/api/auth/roblox/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

function generateState() {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

async function generatePKCE() {
  const verifier = generateState() + generateState() // 64 char random string
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return { verifier, challenge }
}

export async function GET() {
  const state = generateState()
  const { verifier, challenge } = await generatePKCE()

  const params = new URLSearchParams({
    client_id:             process.env.ROBLOX_CLIENT_ID!,
    redirect_uri:          process.env.ROBLOX_REDIRECT_URI!,
    response_type:         'code',
    scope:                 'openid profile',
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  })

  const cookieStore = await cookies()
  const opts = { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge: 600 }
  cookieStore.set('roblox_state', state, opts)
  cookieStore.set('roblox_verifier', verifier, opts)

  return NextResponse.redirect(
    `https://apis.roblox.com/oauth/v1/authorize?${params}`
  )
}
