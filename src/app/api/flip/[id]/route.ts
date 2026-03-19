// src/app/api/flip/[id]/route.ts
import { NextRequest } from 'next/server'
import { requireAuth, createServiceClient } from '@/lib/supabase'
import { apiOk, apiErr, handleError } from '@/lib/api'

type Ctx = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const dbUser = await requireAuth()
    const body = await req.json()
    const { action, group_verification_id } = body
    const flipId = params.id

    const service = createServiceClient()

    const { data: flip, error: fetchErr } = await service
      .from('flips')
      .select('*')
      .eq('id', flipId)
      .single()

    if (fetchErr || !flip) return apiErr('Flip not found', 404)

    if (action === 'join') {
      if (flip.status !== 'open') return apiErr('Flip is no longer open')
      if (flip.creator_id === dbUser.id) return apiErr('Cannot join your own flip')
      if (!group_verification_id) return apiErr('Must provide a verified group')

      // Verify challenger group
      const { data: group } = await service
        .from('group_verifications')
        .select('id')
        .eq('id', group_verification_id)
        .eq('user_id', dbUser.id)
        .eq('status', 'approved')
        .single()

      if (!group) return apiErr('Your group is not verified')

      // Join and mark active
      await service
        .from('flips')
        .update({
          challenger_id:       dbUser.id,
          challenger_group_id: group_verification_id,
          status:              'active',
        })
        .eq('id', flipId)
        .eq('status', 'open')

      // Execute flip server-side
      return await resolveFlip(flipId, service)
    }

    return apiErr('Invalid action')
  } catch (e) {
    return handleError(e)
  }
}

async function resolveFlip(flipId: string, service: ReturnType<typeof createServiceClient>) {
  const { data: flip } = await service
    .from('flips')
    .select('*')
    .eq('id', flipId)
    .single()

  if (!flip || flip.status !== 'active') return apiErr('Flip not in active state')
  if (!flip.challenger_id) return apiErr('No challenger')

  // Pure server-side randomness
  const rand = new Uint8Array(1)
  crypto.getRandomValues(rand)
  const result: 'heads' | 'tails' = rand[0] % 2 === 0 ? 'heads' : 'tails'

  const winnerId = result === flip.creator_side ? flip.creator_id : flip.challenger_id
  const loserId  = winnerId === flip.creator_id ? flip.challenger_id : flip.creator_id

  // Atomic resolve via DB function
  const { error: rpcErr } = await service.rpc('resolve_flip', {
    p_flip_id:     flipId,
    p_result_side: result,
    p_winner_id:   winnerId,
    p_loser_id:    loserId,
  })
  if (rpcErr) return apiErr('Failed to resolve flip', 500)

  // Log the transfer
  const loserGroupId = loserId === flip.creator_id
    ? flip.creator_group_id
    : flip.challenger_group_id

  const { data: loserGroup } = await service
    .from('group_verifications')
    .select('roblox_group_id, group_name')
    .eq('id', loserGroupId)
    .single()

  if (loserGroup) {
    await service.from('group_transfers').insert({
      flip_id:         flipId,
      from_user_id:    loserId,
      to_user_id:      winnerId,
      roblox_group_id: loserGroup.roblox_group_id,
      group_name:      loserGroup.group_name,
    })
  }

  // Notify Discord bot if milestone hit (non-fatal)
  await notifyDiscord(winnerId, service).catch(() => {})

  return apiOk({ result, winner_id: winnerId, flip_id: flipId })
}

async function notifyDiscord(userId: string, service: ReturnType<typeof createServiceClient>) {
  const { data: user } = await service
    .from('users')
    .select('wins, discord_id, rank')
    .eq('id', userId)
    .single()

  if (!user?.discord_id) return
  if (['staff', 'manager', 'owner'].includes(user.rank)) return

  const milestones: Record<number, string> = { 25: 'Whale', 100: 'God' }
  const role = milestones[user.wins]
  if (!role) return

  const botUrl = process.env.DISCORD_BOT_WEBHOOK_URL
  const secret = process.env.DISCORD_WEBHOOK_SECRET
  if (!botUrl || !secret) return

  await fetch(`${botUrl}/assign-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
    body: JSON.stringify({ discord_id: user.discord_id, role_name: role }),
  })
}
