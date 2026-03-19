// src/lib/supabase.ts
import { createServerClient } from '@supabase/ssr'
import { createBrowserClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser client — use in Client Components
export function createClient() {
  return createBrowserClient(URL, ANON)
}

// Server client — use in Server Components and API routes
export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component — middleware handles cookie refresh
        }
      },
    },
  })
}

// Service role — server only, never expose to client
export function createServiceClient() {
  return createBrowserClient(URL, SERVICE)
}

// Get current logged-in user from DB
export async function getDbUser() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}

// Require auth — returns dbUser or throws
export async function requireAuth() {
  const dbUser = await getDbUser()
  if (!dbUser) throw new Error('UNAUTHORIZED')
  if (dbUser.is_banned) throw new Error('BANNED')
  return dbUser
}

// Require admin rank
export async function requireAdmin(minRank: 'staff' | 'manager' | 'owner' = 'staff') {
  const dbUser = await requireAuth()
  const order: Record<string, number> = {
    user: 0, whale: 1, god: 2, staff: 3, manager: 4, owner: 5,
  }
  const userLevel = order[dbUser.rank] ?? 0
  const required = order[minRank]
  if (userLevel < required) throw new Error('FORBIDDEN')
  return dbUser
}
