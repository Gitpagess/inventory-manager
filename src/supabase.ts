import { createClient } from '@supabase/supabase-js'

// For simplicity, hardcode here. Later we can move to Vite env vars.
export const supabaseUrl = 'https://bkhkgxgmlhvjidoximyx.supabase.co'
export const supabaseKey = 'PASTE_YOUR_ANON_KEY_HERE'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } }
})
