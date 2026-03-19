// src/app/api/flip/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient, createServerSupabase } from '@/lib/supabase'
import { apiOk, apiErr, handleError } from '@/lib/api'

const FLIP_SELECT = `
  *,
  creator:users!flips_creator_id_fkey(id,username,avatar_url,rank,wins,losses),
  challenger:users!flips_challenger_id_fkey(id,username,avatar_url,rank,wins,losses),
  creator_group:group_verifications!flips_creator_group_id_fkey(id,group_name,member_count,roblox_group_id),
  challenger_group:group_verifications!flips_challenger_group_id_fkey(id,group_name,member_count,roblox_group_id)
`

// GET — list open flips
export async function GET() {
  try {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('flips')
      .select(FLIP_SELECT)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return apiErr(error.message, 500)
    return apiOk(data)
  } catch (e) {
    return handleError(e)
  }
}

// POST — create a flip
export async function POST(req: NextRequest) {
  try {
    const dbUser = await requireAuth()
    const body = await req.json()
    const { group_verification_id, side } = body

    if (!group_verification_id) return apiErr('Missing group_verification_id')
    if (!['heads', 'tails'].includes(side)) return apiErr('Invalid side')

    const service = createServiceClient()

    // Verify group is approved and belongs to this user
    const { data: group, error: groupErr } = await service
      .from('group_verifications')
      .select('id')
      .eq('id', group_verification_id)
      .eq('user_id', dbUser.id)
      .eq('status', 'approved')
      .single()

    if (groupErr || !group) return apiErr('Group not found or not verified')

    // Check group isn't already in an active flip
    const { data: inUse } = await service
      .from('flips')
      .select('id')
      .eq('creator_group_id', group_verification_id)
      .in('status', ['open', 'active'])
      .maybeSingle()

    if (inUse) return apiErr('This group is already in an active flip')

    const { data: flip, error: flipErr } = await service
      .from('flips')
      .insert({
        creator_id:       dbUser.id,
        creator_group_id: group_verification_id,
        creator_side:     side,
      })
      .select(FLIP_SELECT)
      .single()

    if (flipErr || !flip) return apiErr(flipErr?.message ?? 'Failed to create flip', 500)
    return apiOk(flip, 201)
  } catch (e) {
    return handleError(e)
  }
}
