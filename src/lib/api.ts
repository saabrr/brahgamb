// src/lib/api.ts
import { NextResponse } from 'next/server'
import { ok, err } from '@/types'

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json(ok(data), { status })
}

export function apiErr(message: string, status = 400) {
  return NextResponse.json(err(message), { status })
}

export function handleError(e: unknown) {
  if (e instanceof Error) {
    if (e.message === 'UNAUTHORIZED') return apiErr('Not logged in', 401)
    if (e.message === 'BANNED') return apiErr('Account is banned', 403)
    if (e.message === 'FORBIDDEN') return apiErr('Insufficient permissions', 403)
    console.error(e.message)
    return apiErr(e.message)
  }
  console.error(e)
  return apiErr('Internal server error', 500)
}
