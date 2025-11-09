import { createClient } from '@supabase/supabase-js'

// For simplicity, hardcode here. Later we can move to Vite env vars.
export const supabaseUrl = 'https://bkhkgxgmlhvjidoximyx.supabase.co'
export const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGtneGdtbGh2amlkb3hpbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU2NjYsImV4cCI6MjA3ODE2MTY2Nn0.56GAQbU5vFYtBZwz8vFYTj8tttzEdKcwvQRjd8yz8WI'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } }
})
