// supabase/functions/roulette-spin/index.ts
// Deploy with: supabase functions deploy roulette-spin
// Schedule:    every 5 seconds via pg_cron (or Supabase cron jobs)
//
// In Supabase Dashboard → Edge Functions → Schedules, set:
//   cron: "* * * * *" (every minute) — then internally we check spin_at

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Roulette probability table:
// 7 red  (indices 0-6)   = 46.7%
// 7 black (indices 7-13) = 46.7%
// 1 green (index 14)     = 6.6%
const OUTCOMES = ['red','red','red','red','red','red','red','black','black','black','black','black','black','black','green'] as const

function spinWheel(): 'red' | 'black' | 'green' {
  const buf = new Uint8Array(1)
  crypto.getRandomValues(buf)
  return OUTCOMES[buf[0] % OUTCOMES.length]
}

Deno.serve(async () => {
  try {
    // Find rounds where spin_at has passed and still in betting status
    const { data: rounds, error } = await supabase
      .from('roulette_rounds')
      .select('id, round_number')
      .eq('status', 'betting')
      .lte('spin_at', new Date().toISOString())

    if (error) throw error
    if (!rounds || rounds.length === 0) {
      return new Response(JSON.stringify({ message: 'No rounds to spin' }), { status: 200 })
    }

    for (const round of rounds) {
      // Mark as spinning first (prevents double-spin)
      const { error: lockErr } = await supabase
        .from('roulette_rounds')
        .update({ status: 'spinning' })
        .eq('id', round.id)
        .eq('status', 'betting') // optimistic lock

      if (lockErr) continue // another instance got it

      const result = spinWheel()

      // Get all bets for this round to determine winners
      const { data: bets } = await supabase
        .from('roulette_bets')
        .select('user_id, color')
        .eq('round_id', round.id)

      const winnerIds = (bets ?? [])
        .filter(b => b.color === result)
        .map(b => b.user_id)

      // Resolve round atomically
      await supabase.rpc('resolve_roulette_round', {
        p_round_id:   round.id,
        p_result:     result,
        p_winner_ids: winnerIds,
      })

      console.log(`Round ${round.round_number} resolved: ${result}, ${winnerIds.length} winners`)
    }

    return new Response(JSON.stringify({ ok: true, processed: rounds.length }), { status: 200 })
  } catch (err) {
    console.error('Spin error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
