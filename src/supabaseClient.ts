import { createClient } from '@supabase/supabase-js'

// Values are injected at build time by Vite (from GitHub Secrets in the workflow)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env missing. Did you set GitHub Secrets and map them to Vite vars?')
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!)
