// supabase/functions/roulette-spin/index.ts
// Deploy: supabase functions deploy roulette-spin
// Schedule: every minute via Supabase cron jobs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// 7 red, 7 black, 1 green = 46.7% / 46.7% / 6.6%
const WHEEL = ['red','red','red','red','red','red','red','black','black','black','black','black','black','black','green'] as const

function spin() {
  const buf = new Uint8Array(1)
  crypto.getRandomValues(buf)
  return WHEEL[buf[0] % WHEEL.length]
}

Deno.serve(async () => {
  const { data: rounds } = await supabase
    .from('roulette_rounds')
    .select('id, round_number')
    .eq('status', 'betting')
    .lte('spin_at', new Date().toISOString())

  if (!rounds?.length) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 })
  }

  for (const round of rounds) {
    // Lock optimistically
    const { error: lockErr } = await supabase
      .from('roulette_rounds')
      .update({ status: 'spinning' })
      .eq('id', round.id)
      .eq('status', 'betting')

    if (lockErr) continue // another instance got it

    const result = spin()

    const { data: bets } = await supabase
      .from('roulette_bets')
      .select('user_id, color')
      .eq('round_id', round.id)

    const winners = (bets ?? []).filter(b => b.color === result).map(b => b.user_id)

    await supabase.rpc('resolve_roulette_round', {
      p_round_id:   round.id,
      p_result:     result,
      p_winner_ids: winners,
    })

    console.log(`Round ${round.round_number}: ${result}, ${winners.length} winners`)
  }

  return new Response(JSON.stringify({ ok: true, processed: rounds.length }), { status: 200 })
})
