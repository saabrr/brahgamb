// src/app/api/admin/route.ts
// All admin actions in one route — gated by rank

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient } from '@/lib/supabase'
import type { ApiResponse, UserRank } from '@/types'

// ── POST /api/admin — perform an admin action ─────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  const body = await req.json()
  const { action } = body

  try {
    switch (action) {

      // ── Approve/deny group verification ─────────────────────────────────────
      case 'approve_verification':
      case 'reject_verification': {
        const { dbUser } = await requireAdmin('staff')
        const { verification_id, reject_reason } = body
        const service = createServiceClient()

        const update: Record<string, any> = {
          status:      action === 'approve_verification' ? 'approved' : 'rejected',
          reviewed_by: dbUser.id,
        }
        if (action === 'reject_verification') update.reject_reason = reject_reason

        const { error } = await service
          .from('group_verifications')
          .update(update)
          .eq('id', verification_id)

        if (error) throw error

        // Log it
        await service.from('admin_logs').insert({
          admin_id:    dbUser.id,
          action,
          target_id:   verification_id,
          target_type: 'group_verification',
          note:        reject_reason,
        })

        return NextResponse.json({ data: { ok: true } })
      }

      // ── Ban / unban user ─────────────────────────────────────────────────────
      case 'ban_user':
      case 'unban_user': {
        const { dbUser } = await requireAdmin('staff')
        const { target_user_id, reason } = body
        const service = createServiceClient()

        // Can't ban admins above your rank
        const { data: target } = await service
          .from('users')
          .select('rank')
          .eq('id', target_user_id)
          .single()

        const rankOrder: Record<string, number> = { user:0, whale:1, god:2, staff:3, manager:4, owner:5 }
        if (target && rankOrder[target.rank] >= rankOrder[dbUser.rank]) {
          return NextResponse.json({ error: 'Cannot ban someone with equal or higher rank' }, { status: 403 })
        }

        const { error } = await service
          .from('users')
          .update({ is_banned: action === 'ban_user' })
          .eq('id', target_user_id)

        if (error) throw error

        await service.from('admin_logs').insert({
          admin_id:    dbUser.id,
          action,
          target_id:   target_user_id,
          target_type: 'user',
          note:        reason,
        })

        return NextResponse.json({ data: { ok: true } })
      }

      // ── Delete chat message ──────────────────────────────────────────────────
      case 'delete_message': {
        await requireAdmin('staff')
        const { message_id } = body
        const service = createServiceClient()

        const { error } = await service
          .from('chat_messages')
          .update({ is_deleted: true })
          .eq('id', message_id)

        if (error) throw error
        return NextResponse.json({ data: { ok: true } })
      }

      // ── Assign staff role ────────────────────────────────────────────────────
      case 'set_rank': {
        const { dbUser } = await requireAdmin('manager')
        const { target_user_id, new_rank } = body as { target_user_id: string; new_rank: UserRank }
        const service = createServiceClient()

        // Only owner can assign manager+
        const rankOrder: Record<string, number> = { user:0, whale:1, god:2, staff:3, manager:4, owner:5 }
        if (rankOrder[new_rank] >= 4 && dbUser.rank !== 'owner') {
          return NextResponse.json({ error: 'Only the owner can assign manager or higher' }, { status: 403 })
        }

        const { error } = await service
          .from('users')
          .update({ rank: new_rank })
          .eq('id', target_user_id)

        if (error) throw error

        // Notify Discord bot if needed
        const rankToRole: Record<string, string | null> = {
          staff: 'Staff', manager: 'Manager', owner: null,
        }
        const discordRole = rankToRole[new_rank]
        if (discordRole) {
          const { data: targetUser } = await service
            .from('users')
            .select('discord_id')
            .eq('id', target_user_id)
            .single()

          if (targetUser?.discord_id) {
            await fetch(`${process.env.DISCORD_BOT_WEBHOOK_URL}/assign-role`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-webhook-secret': process.env.DISCORD_WEBHOOK_SECRET!,
              },
              body: JSON.stringify({ discord_id: targetUser.discord_id, role_name: discordRole }),
            }).catch(() => {}) // non-fatal
          }
        }

        await service.from('admin_logs').insert({
          admin_id:    dbUser.id,
          action:      'set_rank',
          target_id:   target_user_id,
          target_type: 'user',
          note:        `Set rank to ${new_rank}`,
        })

        return NextResponse.json({ data: { ok: true } })
      }

      // ── Resolve transfer dispute ─────────────────────────────────────────────
      case 'resolve_dispute': {
        const { dbUser } = await requireAdmin('manager')
        const { transfer_id, note } = body
        const service = createServiceClient()

        const { error } = await service
          .from('group_transfers')
          .update({ disputed: false, dispute_note: note })
          .eq('id', transfer_id)

        if (error) throw error

        await service.from('admin_logs').insert({
          admin_id:    dbUser.id,
          action:      'resolve_dispute',
          target_id:   transfer_id,
          target_type: 'group_transfer',
          note,
        })

        return NextResponse.json({ data: { ok: true } })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    if (err.message?.includes('Unauthorized') || err.message?.includes('Forbidden')) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    console.error('admin error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── GET /api/admin — dashboard data ──────────────────────────────────────────
export async function GET() {
  try {
    const { } = await requireAdmin('staff')
    const service = createServiceClient()

    const [
      { data: pendingVerifs },
      { data: disputes },
      { data: recentLogs },
      { count: totalUsers },
      { count: totalFlips },
    ] = await Promise.all([
      service.from('group_verifications')
        .select('*, user:users(id, username, avatar_url)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      service.from('group_transfers')
        .select('*, from_user:users!from_user_id(id, username), to_user:users!to_user_id(id, username)')
        .eq('disputed', true),
      service.from('admin_logs')
        .select('*, admin:users(id, username)')
        .order('created_at', { ascending: false })
        .limit(20),
      service.from('users').select('*', { count: 'exact', head: true }),
      service.from('flips').select('*', { count: 'exact', head: true }),
    ])

    return NextResponse.json({
      data: { pendingVerifs, disputes, recentLogs, totalUsers, totalFlips }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 })
  }
}
