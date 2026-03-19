// src/app/api/admin/route.ts
import { NextRequest } from 'next/server'
import { requireAdmin, createServiceClient } from '@/lib/supabase'
import { apiOk, apiErr, handleError } from '@/lib/api'

export async function GET() {
  try {
    await requireAdmin('staff')
    const service = createServiceClient()

    const [
      { data: pendingVerifs },
      { data: disputes },
      { data: recentLogs },
      { count: totalUsers },
      { count: totalFlips },
    ] = await Promise.all([
      service
        .from('group_verifications')
        .select('*, user:users(id,username,avatar_url)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      service
        .from('group_transfers')
        .select('*, from_user:users!group_transfers_from_user_id_fkey(id,username), to_user:users!group_transfers_to_user_id_fkey(id,username)')
        .eq('disputed', true),
      service
        .from('admin_logs')
        .select('*, admin:users(id,username)')
        .order('created_at', { ascending: false })
        .limit(20),
      service.from('users').select('*', { count: 'exact', head: true }),
      service.from('flips').select('*', { count: 'exact', head: true }),
    ])

    return apiOk({ pendingVerifs, disputes, recentLogs, totalUsers, totalFlips })
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body
    const service = createServiceClient()

    switch (action) {
      case 'approve_verification':
      case 'reject_verification': {
        const dbUser = await requireAdmin('staff')
        const { verification_id, reject_reason } = body

        await service
          .from('group_verifications')
          .update({
            status:       action === 'approve_verification' ? 'approved' : 'rejected',
            reviewed_by:  dbUser.id,
            reject_reason: reject_reason ?? null,
          })
          .eq('id', verification_id)

        await service.from('admin_logs').insert({
          admin_id:    dbUser.id,
          action,
          target_id:   verification_id,
          target_type: 'group_verification',
          note:        reject_reason ?? null,
        })

        return apiOk(null)
      }

      case 'ban_user':
      case 'unban_user': {
        const dbUser = await requireAdmin('staff')
        const { target_user_id, reason } = body

        const rankOrder: Record<string, number> = {
          user: 0, whale: 1, god: 2, staff: 3, manager: 4, owner: 5,
        }
        const { data: target } = await service
          .from('users')
          .select('rank')
          .eq('id', target_user_id)
          .single()

        if (target && (rankOrder[target.rank] ?? 0) >= (rankOrder[dbUser.rank] ?? 0)) {
          return apiErr('Cannot ban someone with equal or higher rank', 403)
        }

        await service
          .from('users')
          .update({ is_banned: action === 'ban_user' })
          .eq('id', target_user_id)

        await service.from('admin_logs').insert({
          admin_id:    dbUser.id,
          action,
          target_id:   target_user_id,
          target_type: 'user',
          note:        reason ?? null,
        })

        return apiOk(null)
      }

      case 'delete_message': {
        await requireAdmin('staff')
        const { message_id } = body
        await service
          .from('chat_messages')
          .update({ is_deleted: true })
          .eq('id', message_id)
        return apiOk(null)
      }

      case 'set_rank': {
        const dbUser = await requireAdmin('manager')
        const { target_user_id, new_rank } = body
        const rankOrder: Record<string, number> = {
          user: 0, whale: 1, god: 2, staff: 3, manager: 4, owner: 5,
        }
        if ((rankOrder[new_rank] ?? 0) >= 4 && dbUser.rank !== 'owner') {
          return apiErr('Only the owner can assign manager or higher', 403)
        }

        await service
          .from('users')
          .update({ rank: new_rank })
          .eq('id', target_user_id)

        await service.from('admin_logs').insert({
          admin_id:    dbUser.id,
          action:      'set_rank',
          target_id:   target_user_id,
          target_type: 'user',
          note:        `Set to ${new_rank}`,
        })

        return apiOk(null)
      }

      default:
        return apiErr('Unknown action')
    }
  } catch (e) {
    return handleError(e)
  }
}
