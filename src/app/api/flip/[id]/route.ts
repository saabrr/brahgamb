// src/app/api/flip/[id]/route.ts
// POST /api/flip/:id/join  — join someone's flip
// POST /api/flip/:id/flip  — execute the flip (server-side randomness)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient } from '@/lib/supabase'
import type { ApiResponse } from '@/types'

type Params = { params: { id: string } }

// ── POST /api/flip/[id] — join a flip ────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse<ApiResponse>> {
  try {
    const { dbUser } = await requireAuth()
    const { action, group_verification_id } = await req.json()
    const flipId = params.id

    const service = createServiceClient()

    // Fetch the flip
    const { data: flip, error: flipErr } = await service
      .from('flips')
      .select('*')
      .eq('id', flipId)
      .single()

    if (flipErr || !flip) {
      return NextResponse.json({ error: 'Flip not found' }, { status: 404 })
    }

    // ── JOIN ─────────────────────────────────────────────────────────────────
    if (action === 'join') {
      if (flip.status !== 'open') {
        return NextResponse.json({ error: 'This flip is no longer open' }, { status: 400 })
      }
      if (flip.creator_id === dbUser.id) {
        return NextResponse.json({ error: 'You cannot join your own flip' }, { status: 400 })
      }
      if (!group_verification_id) {
        return NextResponse.json({ error: 'You must provide a verified group to challenge with' }, { status: 400 })
      }

      // Verify challenger's group
      const { data: group } = await service
        .from('group_verifications')
        .select('id')
        .eq('id', group_verification_id)
        .eq('user_id', dbUser.id)
        .eq('status', 'approved')
        .single()

      if (!group) {
        return NextResponse.json({ error: 'Your group is not verified' }, { status: 400 })
      }

      // Set challenger and move to active
      const { error: joinErr } = await service
        .from('flips')
        .update({
          challenger_id:        dbUser.id,
          challenger_group_id:  group_verification_id,
          status:               'active',
        })
        .eq('id', flipId)
        .eq('status', 'open') // optimistic lock

      if (joinErr) {
        return NextResponse.json({ error: 'Failed to join — flip may have been taken' }, { status: 409 })
      }

      // Auto-execute the flip now that both players are in
      return executeFlip(flipId, service)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err: any) {
    if (err.message === 'Unauthorized') return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    console.error('flip action error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── Core flip logic — server-side only ───────────────────────────────────────
async function executeFlip(flipId: string, service: ReturnType<typeof createServiceClient>) {
  const { data: flip } = await service
    .from('flips')
    .select('*')
    .eq('id', flipId)
    .single()

  if (!flip || flip.status !== 'active') {
    return NextResponse.json({ error: 'Flip is not in active state' }, { status: 400 })
  }

  // True server-side randomness — never exposed to client before commit
  const result: 'heads' | 'tails' = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0
    ? 'heads'
    : 'tails'

  const winnerId = result === flip.creator_side ? flip.creator_id : flip.challenger_id
  const loserId  = winnerId === flip.creator_id ? flip.challenger_id : flip.creator_id

  if (!winnerId || !loserId) {
    return NextResponse.json({ error: 'Missing player IDs' }, { status: 500 })
  }

  // Atomic DB function — updates flip, wins, losses in one transaction
  const { error } = await service.rpc('resolve_flip', {
    p_flip_id:     flipId,
    p_result_side: result,
    p_winner_id:   winnerId,
    p_loser_id:    loserId,
  })

  if (error) {
    console.error('resolve_flip RPC error:', error)
    return NextResponse.json({ error: 'Failed to resolve flip' }, { status: 500 })
  }

  // Create transfer record — loser owes winner their group
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

  // Notify Discord bot if a milestone was crossed
  await notifyDiscordMilestone(winnerId, service)

  return NextResponse.json({
    data: { result, winner_id: winnerId, flip_id: flipId }
  })
}

// ── Discord milestone check ───────────────────────────────────────────────────
async function notifyDiscordMilestone(userId: string, service: ReturnType<typeof createServiceClient>) {
  const { data: user } = await service
    .from('users')
    .select('wins, discord_id, rank')
    .eq('id', userId)
    .single()

  if (!user?.discord_id) return

  const milestones: Record<number, string> = { 25: 'Whale', 100: 'God' }
  const newRole = milestones[user.wins]

  if (!newRole) return

  // Only assign if not already a higher rank
  if (['staff', 'manager', 'owner'].includes(user.rank)) return

  try {
    await fetch(`${process.env.DISCORD_BOT_WEBHOOK_URL}/assign-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.DISCORD_WEBHOOK_SECRET!,
      },
      body: JSON.stringify({ discord_id: user.discord_id, role_name: newRole }),
    })
  } catch (err) {
    console.error('Discord milestone notify failed:', err)
    // Non-fatal — game still resolved correctly
  }
}
