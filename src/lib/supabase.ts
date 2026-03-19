// src/lib/supabase.ts
// Two clients: one for server components/routes, one for client components

import { createServerClient } from '@supabase/ssr'
import { createBrowserClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ── Browser client (use in Client Components) ─────────────────────────────────
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// ── Server client (use in Server Components, API Routes, Middleware) ──────────
export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component — can't set cookies, middleware handles it
        }
      },
    },
  })
}

// ── Service role client (server-side only — NEVER expose to client) ───────────
export function createServiceClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// ── Auth helpers ─────────────────────────────────────────────────────────────
export async function getSession() {
  const supabase = await createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUser() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getDbUser(userId: string) {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

// ── Require auth — throws if not authenticated ────────────────────────────────
export async function requireAuth() {
  const user = await getUser()
  if (!user) throw new Error('Unauthorized')
  const dbUser = await getDbUser(user.id)
  if (!dbUser) throw new Error('User not found')
  if (dbUser.is_banned) throw new Error('Account is banned')
  return { authUser: user, dbUser }
}

// ── Require admin role ────────────────────────────────────────────────────────
export async function requireAdmin(minRank: 'staff' | 'manager' | 'owner' = 'staff') {
  const { authUser, dbUser } = await requireAuth()
  const ranks = { staff: 0, manager: 1, owner: 2 }
  if (ranks[dbUser.rank as keyof typeof ranks] === undefined || 
      ranks[dbUser.rank as keyof typeof ranks] < ranks[minRank]) {
    throw new Error('Forbidden: insufficient rank')
  }
  return { authUser, dbUser }
}
