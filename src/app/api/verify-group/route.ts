// src/app/api/verify-group/route.ts
import { NextRequest } from 'next/server'
import { requireAuth, createServiceClient } from '@/lib/supabase'
import { apiOk, apiErr, handleError } from '@/lib/api'

async function checkRolimons(groupId: number) {
  const res = await fetch(`https://www.rolimons.com/groupapi/group/${groupId}`, {
    next: { revalidate: 0 },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.owner_updated) return null
  const ownedSince = new Date(data.owner_updated * 1000)
  const days = (Date.now() - ownedSince.getTime()) / 86_400_000
  return { ownedSince, days, groupName: data.name as string, memberCount: data.member_count as number }
}

async function getRobloxGroup(groupId: number) {
  const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`)
  if (!res.ok) return null
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    const dbUser = await requireAuth()
    const { group_url, method } = await req.json()

    const match = (group_url ?? '').match(/groups\/(\d+)/)
    if (!match) return apiErr('Invalid Roblox group URL')
    const groupId = parseInt(match[1])

    const service = createServiceClient()

    // Check existing
    const { data: existing } = await service
      .from('group_verifications')
      .select('id, status')
      .eq('user_id', dbUser.id)
      .eq('roblox_group_id', groupId)
      .maybeSingle()

    if (existing?.status === 'approved') return apiErr('Group already verified')
    if (existing?.status === 'pending')  return apiErr('Group already pending review')

    if (method === 'auto_rolimons') {
      const rolimons = await checkRolimons(groupId)

      if (!rolimons) {
        return apiOk({ status: 'needs_manual', message: 'Rolimons has no data for this group. Please upload an audit log screenshot.' })
      }

      if (rolimons.days < 30) {
        return apiErr(`Only ${Math.floor(rolimons.days)} days of ownership. Need 30+`)
      }

      // Confirm current ownership via Roblox API
      const groupInfo = await getRobloxGroup(groupId)
      if (groupInfo?.owner?.userId !== dbUser.roblox_id) {
        return apiErr('You are not the current owner of this group on Roblox')
      }

      await service.from('group_verifications').upsert({
        user_id:         dbUser.id,
        roblox_group_id: groupId,
        group_name:      rolimons.groupName || groupInfo?.name || `Group #${groupId}`,
        member_count:    rolimons.memberCount || groupInfo?.memberCount || 0,
        owned_since:     rolimons.ownedSince.toISOString().split('T')[0],
        method:          'auto_rolimons',
        status:          'approved',
      }, { onConflict: 'user_id,roblox_group_id' })

      return apiOk({ status: 'approved' })
    }

    if (method === 'manual_screenshot') {
      const groupInfo = await getRobloxGroup(groupId).catch(() => null)

      await service.from('group_verifications').upsert({
        user_id:         dbUser.id,
        roblox_group_id: groupId,
        group_name:      groupInfo?.name || `Group #${groupId}`,
        member_count:    groupInfo?.memberCount || 0,
        method:          'manual_screenshot',
        status:          'pending',
      }, { onConflict: 'user_id,roblox_group_id' })

      return apiOk({ status: 'pending' })
    }

    return apiErr('Invalid method')
  } catch (e) {
    return handleError(e)
  }
}
