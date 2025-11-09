import React, { useEffect, useState } from "react";
import { createClient, Session, SupabaseClient } from "@supabase/supabase-js";

// Read your keys from Vite env. (Keep your existing env setup)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

type AuthGateProps = {
  children: React.ReactNode;              // The app to render once authenticated
  onSignedOut?: () => void;               // Optional callback on sign out
};

export default function AuthGate({ children, onSignedOut }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      if (!newSession && onSignedOut) onSignedOut();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [onSignedOut]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Sign up then auto-sign-in with the same credentials.
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: undefined }, // no magic link; normal email/password
    });
    if (error) setError(error.message);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (session) {
    // Render the app, but add a small header button to sign out
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "8px 12px" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{session.user.email}</span>
          <button
            onClick={handleSignOut}
            style={{ padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", background: "#f8fafc" }}
          >
            Sign out
          </button>
        </div>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    );
  }

  // Login / Signup view
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", padding: 16 }}>
      <div style={{ width: 360, maxWidth: "92vw", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
          {view === "signin" ? "Sign in" : "Create account"}
        </div>
        <form onSubmit={view === "signin" ? handleSignIn : handleSignUp} style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Email</div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Password</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ flex: 1, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                style={{ padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", cursor: "pointer" }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}

          <button
            type="submit"
            style={{ padding: "10px 12px", border: "1px solid #2563eb", background: "#2563eb", color: "#fff", borderRadius: 8, cursor: "pointer" }}
          >
            {view === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          {view === "signin" ? (
            <>
              Don’t have an account?{" "}
              <button onClick={() => setView("signup")} style={{ color: "#2563eb", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => setView("signin")} style={{ color: "#2563eb", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
