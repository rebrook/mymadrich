import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get the initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s?.user) {
          await fetchProfile(s.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      // Check for pending invitations and auto-apply role/linkage
      try {
        const { data: invResult } = await supabase.rpc('process_pending_invitation');
        if (invResult?.processed) {
          // Re-fetch profile to get the updated role
          const { data: updatedProfile, error: refetchErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
          if (!refetchErr && updatedProfile) {
            setProfile(updatedProfile);
            return;
          }
        }
      } catch (invErr) {
        // Invitation processing is non-critical; log and continue
        console.warn('Invitation check skipped:', invErr.message);
      }

      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err.message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/madrich`,
      },
    });
    if (error) console.error('Google sign-in error:', error.message);
  }

  async function signInWithMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/madrich`,
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
