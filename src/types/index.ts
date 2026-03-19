// src/types/index.ts
// Single source of truth for all TypeScript types across GroupFlip

export type UserRank = 'user' | 'whale' | 'god' | 'staff' | 'manager' | 'owner'
export type VerificationStatus = 'pending' | 'approved' | 'rejected'
export type VerificationMethod = 'auto_rolimons' | 'manual_screenshot'
export type FlipStatus = 'open' | 'active' | 'complete' | 'cancelled'
export type RouletteStatus = 'betting' | 'spinning' | 'complete'
export type RouletteColor = 'red' | 'black' | 'green'
export type CoinSide = 'heads' | 'tails'

export interface User {
  id: string
  roblox_id: number
  username: string
  avatar_url: string | null
  discord_id: string | null
  wins: number
  losses: number
  rank: UserRank
  is_banned: boolean
  created_at: string
  updated_at: string
}

export interface GroupVerification {
  id: string
  user_id: string
  roblox_group_id: number
  group_name: string
  member_count: number
  owned_since: string | null
  method: VerificationMethod
  screenshot_url: string | null
  status: VerificationStatus
  reviewed_by: string | null
  reject_reason: string | null
  created_at: string
  updated_at: string
  // joined
  user?: User
  reviewer?: User
}

export interface Flip {
  id: string
  creator_id: string
  challenger_id: string | null
  creator_group_id: string
  challenger_group_id: string | null
  creator_side: CoinSide
  status: FlipStatus
  winner_id: string | null
  result_side: CoinSide | null
  flipped_at: string | null
  created_at: string
  updated_at: string
  // joined
  creator?: User
  challenger?: User
  creator_group?: GroupVerification
  challenger_group?: GroupVerification
  winner?: User
}

export interface RouletteRound {
  id: string
  round_number: number
  status: RouletteStatus
  spin_at: string
  result: RouletteColor | null
  winner_ids: string[] | null
  created_at: string
  // joined
  bets?: RouletteBet[]
}

export interface RouletteBet {
  id: string
  round_id: string
  user_id: string
  group_verification_id: string
  color: RouletteColor
  won: boolean | null
  created_at: string
  // joined
  user?: User
  group?: GroupVerification
}

export interface ChatMessage {
  id: string
  user_id: string
  message: string
  is_deleted: boolean
  created_at: string
  // joined
  user?: User
}

export interface GroupTransfer {
  id: string
  flip_id: string | null
  round_id: string | null
  from_user_id: string
  to_user_id: string
  roblox_group_id: number
  group_name: string
  confirmed_at: string | null
  disputed: boolean
  dispute_note: string | null
  created_at: string
  // joined
  from_user?: User
  to_user?: User
}

export interface AdminLog {
  id: string
  admin_id: string
  action: string
  target_id: string | null
  target_type: string | null
  note: string | null
  created_at: string
  admin?: User
}

// ── API response shapes ───────────────────────────────────────────────────────
export interface ApiResponse<T = void> {
  data?: T
  error?: string
}

export interface RolimonGroupData {
  group_id: number
  name: string
  member_count: number
  owner_id: number
  owner_updated: number // unix timestamp
}

// ── Realtime payload shapes ───────────────────────────────────────────────────
export interface RealtimeFlipPayload {
  new: Flip
  old: Partial<Flip>
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
}

export interface RealtimeChatPayload {
  new: ChatMessage
  eventType: 'INSERT'
}

export interface RealtimeRoundPayload {
  new: RouletteRound
  old: Partial<RouletteRound>
  eventType: 'INSERT' | 'UPDATE'
}
