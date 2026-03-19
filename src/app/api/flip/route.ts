// src/app/api/flip/route.ts
// GET  — list open flips
// POST — create a new flip

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient, createServerSupabase } from '@/lib/supabase'
import type { ApiResponse, Flip } from '@/types'

// ── GET /api/flip — list open flips ──────────────────────────────────────────
export async function GET() {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('flips')
    .select(`
      *,
      creator:users!flips_creator_id_fkey(id, username, avatar_url, rank, wins),
      challenger:users!flips_challenger_id_fkey(id, username, avatar_url, rank, wins),
      creator_group:group_verifications!flips_creator_group_id_fkey(id, group_name, member_count, roblox_group_id),
      challenger_group:group_verifications!flips_challenger_group_id_fkey(id, group_name, member_count, roblox_group_id)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ── POST /api/flip — create a flip ───────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Flip>>> {
  try {
    const { dbUser } = await requireAuth()
    const { group_verification_id, side } = await req.json()

    if (!group_verification_id || !['heads', 'tails'].includes(side)) {
      return NextResponse.json({ error: 'Missing group_verification_id or invalid side' }, { status: 400 })
    }

    const service = createServiceClient()

    // Confirm the group is approved and belongs to this user
    const { data: group, error: groupErr } = await service
      .from('group_verifications')
      .select('id, status, user_id')
      .eq('id', group_verification_id)
      .eq('user_id', dbUser.id)
      .eq('status', 'approved')
      .single()

    if (groupErr || !group) {
      return NextResponse.json({ error: 'Group not found or not verified' }, { status: 400 })
    }

    // Check the group isn't already in an active/open flip
    const { data: activeFlip } = await service
      .from('flips')
      .select('id')
      .eq('creator_group_id', group_verification_id)
      .in('status', ['open', 'active'])
      .maybeSingle()

    if (activeFlip) {
      return NextResponse.json({ error: 'This group is already in an active flip' }, { status: 400 })
    }

    const { data: flip, error: flipErr } = await service
      .from('flips')
      .insert({
        creator_id:       dbUser.id,
        creator_group_id: group_verification_id,
        creator_side:     side,
        status:           'open',
      })
      .select(`
        *,
        creator:users!flips_creator_id_fkey(id, username, avatar_url, rank, wins),
        creator_group:group_verifications!flips_creator_group_id_fkey(id, group_name, member_count)
      `)
      .single()

    if (flipErr || !flip) throw flipErr

    return NextResponse.json({ data: flip })

  } catch (err: any) {
    if (err.message === 'Unauthorized') return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    console.error('flip create error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
