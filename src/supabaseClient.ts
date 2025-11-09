import { createClient } from '@supabase/supabase-js'

// Values are injected at build time by Vite (from GitHub Secrets in the workflow)
const supabaseUrl = "https://bkhkgxgmlhvjidoximyx.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraGtneGdtbGh2amlkb3hpbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1ODU2NjYsImV4cCI6MjA3ODE2MTY2Nn0.56GAQbU5vFYtBZwz8vFYTj8tttzEdKcwvQRjd8yz8WI";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env missing. Did you set GitHub Secrets and map them to Vite vars?')
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!)
