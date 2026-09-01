import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

/** Auth bootstrap safety timeout (ms). */
const AUTH_INIT_TIMEOUT = 10_000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Guard: whichever of getSession/.then or onAuthStateChange(INITIAL_SESSION)
  // fires first handles the initial profile fetch; the other becomes a no-op.
  const initializedRef = useRef(false);

  useEffect(() => {
    // Fix 3 — Safety timeout: if auth init hasn't resolved in 10 s,
    // force loading to false so the app escapes to login instead of spinning.
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('Auth init safety timeout — forcing loading=false');
        }
        return false;
      });
    }, AUTH_INIT_TIMEOUT);

    // Fix 1 — .catch() on getSession so a rejection always clears loading.
    //          return fetchProfile so its rejection propagates into this chain.
    // Fix 2 — initializedRef prevents double-fetching when onAuthStateChange
    //          also fires INITIAL_SESSION.
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        if (s?.user && !initializedRef.current) {
          initializedRef.current = true;
          return fetchProfile(s.user.id);
        }
        if (!s?.user) {
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('getSession failed:', e);
        setLoading(false);
      });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        setSession(s);

        // De-dupe: if getSession already handled the initial fetch, skip.
        if (event === 'INITIAL_SESSION') {
          if (initializedRef.current) return;
          initializedRef.current = true;
        }

        if (s?.user) {
          await fetchProfile(s.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      // Fix 4 — Set profile immediately so the app renders without waiting
      // on the invitation RPC. Process the invitation in the background.
      setProfile(data);
      processInvitationInBackground(userId);
    } catch (err) {
      console.error('Error fetching profile:', err.message);
      // Only clear profile if we don't already have a working one. This
      // function re-runs on every onAuthStateChange event, including
      // TOKEN_REFRESHED (which fires periodically, and often right when
      // a laptop wakes from sleep or a backgrounded tab regains focus —
      // exactly when a transient network blip is most likely). Without
      // this guard, a blip during a background refresh would wipe an
      // already-authenticated session's profile back to null, forcing
      // ProtectedRoute into its "couldn't load your profile" error even
      // though the user was actively using the app moments before.
      setProfile((prev) => {
        if (prev) {
          console.warn('Profile refresh failed but keeping existing profile (likely a transient blip):', err.message);
          return prev;
        }
        return null;
      });
    } finally {
      setLoading(false);
    }
  }

  /**
   * Non-blocking invitation processing. If a pending invitation is claimed,
   * the profile is silently re-fetched and state is updated in-place.
   */
  async function processInvitationInBackground(userId) {
    try {
      const { data: invResult } = await supabase.rpc('process_pending_invitation');
      if (invResult?.processed) {
        // Re-fetch profile to pick up the updated role/linkage
        const { data: updatedProfile, error: refetchErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (!refetchErr && updatedProfile) {
          setProfile(updatedProfile);
        }
      }
    } catch (invErr) {
      // Invitation processing is non-critical; log and continue
      console.warn('Invitation check skipped:', invErr.message);
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) console.error('Google sign-in error:', error.message);
  }

  async function signInWithMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign-out error:', error.message);
    setSession(null);
    setProfile(null);
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    signInWithGoogle,
    signInWithMagicLink,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
