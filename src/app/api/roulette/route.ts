// src/app/api/roulette/route.ts
import { NextRequest } from 'next/server'
import { requireAuth, createServiceClient, createServerSupabase } from '@/lib/supabase'
import { apiOk, apiErr, handleError } from '@/lib/api'

export async function GET() {
  try {
    const supabase = await createServerSupabase()

    const { data: round } = await supabase
      .from('roulette_rounds')
      .select('*, bets:roulette_bets(*, user:users(id,username,avatar_url,rank))')
      .in('status', ['betting', 'spinning'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: history } = await supabase
      .from('roulette_rounds')
      .select('id, round_number, result')
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(20)

    return apiOk({ round, history: history ?? [] })
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const dbUser = await requireAuth()
    const { round_id, group_verification_id, color } = await req.json()

    if (!round_id || !group_verification_id) return apiErr('Missing fields')
    if (!['red', 'black', 'green'].includes(color)) return apiErr('Invalid color')

    const service = createServiceClient()

    const { data: round } = await service
      .from('roulette_rounds')
      .select('id, status, spin_at')
      .eq('id', round_id)
      .eq('status', 'betting')
      .single()

    if (!round) return apiErr('Round not accepting bets')
    if (new Date(round.spin_at).getTime() - Date.now() < 2000) return apiErr('Betting window closed')

    const { data: group } = await service
      .from('group_verifications')
      .select('id')
      .eq('id', group_verification_id)
      .eq('user_id', dbUser.id)
      .eq('status', 'approved')
      .single()

    if (!group) return apiErr('Group not verified')

    const { data: existing } = await service
      .from('roulette_bets')
      .select('id')
      .eq('round_id', round_id)
      .eq('user_id', dbUser.id)
      .maybeSingle()

    if (existing) return apiErr('Already placed a bet this round')

    const { data: bet, error } = await service
      .from('roulette_bets')
      .insert({ round_id, user_id: dbUser.id, group_verification_id, color })
      .select()
      .single()

    if (error || !bet) return apiErr(error?.message ?? 'Failed to place bet', 500)
    return apiOk(bet, 201)
  } catch (e) {
    return handleError(e)
  }
}
