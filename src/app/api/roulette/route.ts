// src/app/api/roulette/route.ts
// GET  — get current betting round + bets
// POST — place a bet on current round

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient, createServerSupabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'

// ── GET /api/roulette — current round ────────────────────────────────────────
export async function GET() {
  const supabase = await createServerSupabase()

  const { data: round, error } = await supabase
    .from('roulette_rounds')
    .select(`
      *,
      bets:roulette_bets(
        *,
        user:users(id, username, avatar_url, rank),
        group:group_verifications(group_name, member_count)
      )
    `)
    .in('status', ['betting', 'spinning'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also return last 20 completed rounds for history strip
  const { data: history } = await supabase
    .from('roulette_rounds')
    .select('id, round_number, result')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ data: { round, history } })
}

// ── POST /api/roulette — place a bet ─────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { dbUser } = await requireAuth()
    const { round_id, group_verification_id, color } = await req.json()

    if (!round_id || !group_verification_id || !['red', 'black', 'green'].includes(color)) {
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    }

    const service = createServiceClient()

    // Confirm round is still in betting phase
    const { data: round } = await service
      .from('roulette_rounds')
      .select('id, status, spin_at')
      .eq('id', round_id)
      .eq('status', 'betting')
      .single()

    if (!round) {
      return NextResponse.json({ error: 'Round is not accepting bets' }, { status: 400 })
    }

    // Check spin_at hasn't passed (2-second buffer)
    if (new Date(round.spin_at).getTime() - Date.now() < 2000) {
      return NextResponse.json({ error: 'Betting window has closed' }, { status: 400 })
    }

    // Confirm group is approved and owned by this user
    const { data: group } = await service
      .from('group_verifications')
      .select('id')
      .eq('id', group_verification_id)
      .eq('user_id', dbUser.id)
      .eq('status', 'approved')
      .single()

    if (!group) {
      return NextResponse.json({ error: 'Group not verified' }, { status: 400 })
    }

    // Check user hasn't already bet this round
    const { data: existing } = await service
      .from('roulette_bets')
      .select('id')
      .eq('round_id', round_id)
      .eq('user_id', dbUser.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'You already placed a bet this round' }, { status: 400 })
    }

    const { data: bet, error: betErr } = await service
      .from('roulette_bets')
      .insert({
        round_id,
        user_id:                dbUser.id,
        group_verification_id,
        color,
      })
      .select()
      .single()

    if (betErr) throw betErr

    return NextResponse.json({ data: bet })

  } catch (err: any) {
    if (err.message === 'Unauthorized') return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    console.error('roulette bet error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
