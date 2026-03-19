// src/hooks/useRealtime.ts
// All Supabase Realtime subscriptions in one place

'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Flip, ChatMessage, RouletteRound } from '@/types'

// ── Live flips lobby ─────────────────────────────────────────────────────────
export function useFlipsRealtime(onUpdate: (flip: Flip) => void) {
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('flips-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flips' },
        (payload) => onUpdate(payload.new as Flip)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [onUpdate])
}

// ── Single flip watch — used on the coinflip page ────────────────────────────
export function useFlipWatch(flipId: string | null, onUpdate: (flip: Flip) => void) {
  const supabase = createClient()

  useEffect(() => {
    if (!flipId) return

    const channel = supabase
      .channel(`flip-${flipId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'flips',
          filter: `id=eq.${flipId}`,
        },
        (payload) => onUpdate(payload.new as Flip)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [flipId, onUpdate])
}

// ── Live chat ─────────────────────────────────────────────────────────────────
export function useChatRealtime(onMessage: (msg: ChatMessage) => void) {
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('chat-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          // Fetch the user data since postgres_changes doesn't include joins
          const { data: msg } = await supabase
            .from('chat_messages')
            .select('*, user:users(id, username, avatar_url, rank)')
            .eq('id', payload.new.id)
            .single()
          if (msg) onMessage(msg as ChatMessage)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [onMessage])
}

// ── Roulette round watch ──────────────────────────────────────────────────────
export function useRouletteRealtime(onUpdate: (round: RouletteRound) => void) {
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('roulette-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roulette_rounds' },
        (payload) => onUpdate(payload.new as RouletteRound)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [onUpdate])
}

// ── Online presence ───────────────────────────────────────────────────────────
export function usePresence(
  userId: string | null,
  username: string | null,
  onUsersChange: (users: { id: string; username: string }[]) => void
) {
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!userId || !username) return

    const channel = supabase.channel('online-users', {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ username: string }>()
        const users = Object.entries(state).map(([id, presences]) => ({
          id,
          username: presences[0]?.username ?? id,
        }))
        onUsersChange(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ username })
        }
      })

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [userId, username])
}
