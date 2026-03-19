// src/app/api/verify-group/route.ts
// POST — submit a group for ownership verification

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient } from '@/lib/supabase'
import type { ApiResponse, RolimonGroupData } from '@/types'

const DAYS_REQUIRED = 30

// ── Helper: check Rolimons for ownership date ─────────────────────────────────
async function checkRolimons(groupId: number): Promise<{
  success: boolean
  ownedSince?: Date
  groupName?: string
  memberCount?: number
  error?: string
}> {
  try {
    const res = await fetch(
      `https://www.rolimons.com/groupapi/group/${groupId}`,
      { next: { revalidate: 0 } }
    )
    if (!res.ok) return { success: false, error: 'Group not found on Rolimons' }

    const data: RolimonGroupData = await res.json()

    if (!data.owner_updated) {
      return { success: false, error: 'Rolimons does not have ownership data for this group' }
    }

    const ownedSince = new Date(data.owner_updated * 1000)
    const daysDiff = (Date.now() - ownedSince.getTime()) / 86_400_000

    if (daysDiff < DAYS_REQUIRED) {
      return {
        success: false,
        error: `You have only owned this group for ${Math.floor(daysDiff)} days. You need ${DAYS_REQUIRED} days.`,
      }
    }

    return {
      success: true,
      ownedSince,
      groupName: data.name,
      memberCount: data.member_count,
    }
  } catch {
    return { success: false, error: 'Failed to reach Rolimons API' }
  }
}

// ── Helper: get group info from Roblox API ────────────────────────────────────
async function getRobloxGroupInfo(groupId: number) {
  const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`)
  if (!res.ok) throw new Error('Group not found on Roblox')
  return res.json()
}

// ── POST /api/verify-group ────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { dbUser } = await requireAuth()
    const body = await req.json()
    const { group_url, method } = body

    // Extract group ID from URL (roblox.com/groups/12345/...)
    const match = group_url?.match(/groups\/(\d+)/)
    if (!match) {
      return NextResponse.json({ error: 'Invalid Roblox group URL' }, { status: 400 })
    }
    const groupId = parseInt(match[1])

    const service = createServiceClient()

    // Check for existing verification
    const { data: existing } = await service
      .from('group_verifications')
      .select('id, status')
      .eq('user_id', dbUser.id)
      .eq('roblox_group_id', groupId)
      .maybeSingle()

    if (existing?.status === 'approved') {
      return NextResponse.json({ error: 'This group is already verified for your account' }, { status: 400 })
    }
    if (existing?.status === 'pending') {
      return NextResponse.json({ error: 'This group is already pending review' }, { status: 400 })
    }

    if (method === 'auto_rolimons') {
      // ── Auto verification via Rolimons ──────────────────────────────────────
      const rolimons = await checkRolimons(groupId)

      if (!rolimons.success || !rolimons.ownedSince) {
        // Rolimons failed — return the error but suggest manual
        if (rolimons.error?.includes('does not have ownership data')) {
          return NextResponse.json({
            error: rolimons.error,
            fallback: 'manual', // tell client to switch to screenshot mode
          }, { status: 422 })
        }
        return NextResponse.json({ error: rolimons.error }, { status: 400 })
      }

      // Confirm they are the current owner via Roblox API
      const groupInfo = await getRobloxGroupInfo(groupId)
      if (groupInfo.owner?.userId !== dbUser.roblox_id) {
        return NextResponse.json({ error: 'You are not the current owner of this group on Roblox' }, { status: 403 })
      }

      const { error } = await service.from('group_verifications').upsert({
        user_id:         dbUser.id,
        roblox_group_id: groupId,
        group_name:      rolimons.groupName ?? groupInfo.name,
        member_count:    rolimons.memberCount ?? groupInfo.memberCount,
        owned_since:     rolimons.ownedSince.toISOString().split('T')[0],
        method:          'auto_rolimons',
        status:          'approved', // auto-approved
      }, { onConflict: 'user_id,roblox_group_id' })

      if (error) throw error

      return NextResponse.json({ data: { status: 'approved', auto: true } })

    } else if (method === 'manual_screenshot') {
      // ── Manual screenshot — just create pending record ──────────────────────
      // Screenshot upload is handled separately via /api/verify-group/upload
      const groupInfo = await getRobloxGroupInfo(groupId).catch(() => null)

      const { error } = await service.from('group_verifications').upsert({
        user_id:         dbUser.id,
        roblox_group_id: groupId,
        group_name:      groupInfo?.name ?? `Group #${groupId}`,
        member_count:    groupInfo?.memberCount ?? 0,
        method:          'manual_screenshot',
        status:          'pending',
      }, { onConflict: 'user_id,roblox_group_id' })

      if (error) throw error

      return NextResponse.json({ data: { status: 'pending', auto: false } })
    }

    return NextResponse.json({ error: 'Invalid verification method' }, { status: 400 })

  } catch (err: any) {
    if (err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }
    console.error('verify-group error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST /api/verify-group/upload — upload screenshot to Supabase Storage ────
// (separate route — see /api/verify-group/upload/route.ts)
