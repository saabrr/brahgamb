// src/app/auth/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type') as any
  const next       = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(new URL(next, req.url))
    }
  }

  return NextResponse.redirect(new URL('/?error=confirm_failed', req.url))
}
