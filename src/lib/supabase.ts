import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export function isSupabaseConfigured(): boolean {
  return url.length > 0 && anonKey.length > 0
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export type AuthSession = Session

export const STATEMENT_FILES_BUCKET = 'statement-files'

export const HOUSEHOLD_CACHE_KEY = 'household-ledger.household-id.v1'

export function getCachedHouseholdId(): string | null {
  try {
    return localStorage.getItem(HOUSEHOLD_CACHE_KEY)
  } catch {
    return null
  }
}

export function setCachedHouseholdId(id: string | null): void {
  try {
    if (id) localStorage.setItem(HOUSEHOLD_CACHE_KEY, id)
    else localStorage.removeItem(HOUSEHOLD_CACHE_KEY)
  } catch {
    /* ignore */
  }
}
