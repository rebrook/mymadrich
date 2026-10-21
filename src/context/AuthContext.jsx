import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { activeRoleKey, resolveActiveRole, sortRoles } from '../utils/roles';

const AuthContext = createContext(null);

/** Auth bootstrap safety timeout (ms). */
const AUTH_INIT_TIMEOUT = 10_000;

/** How long to wait for the person's roles before falling back to their profile role (ms). */
const ROLES_TIMEOUT = 4_000;

/** Rejects if `promise` has not settled within `ms`. */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * If the startup check (reading the saved session and loading the profile) takes unusually long,
 * record how long it took and what the browser's locks were doing. This is a measurement only:
 * it changes nothing on screen. The most recent report is kept in localStorage so it can be read
 * after the fact:  localStorage.getItem('mymadrich:slow_startup')
 */
const SLOW_STARTUP_MS = 3_000;

async function recordSlowStartup(ms, reason) {
  let locks = 'unavailable';
  try {
    if (navigator.locks && navigator.locks.query) {
      const snapshot = await navigator.locks.query();
      const brief = (l) => ({ name: l.name, mode: l.mode, clientId: l.clientId });
      locks = {
        held: (snapshot.held || []).map(brief),
        pending: (snapshot.pending || []).map(brief),
      };
    }
  } catch {
    // Not available in this browser; the timing alone is still useful
  }
  const report = { ms, reason, at: new Date().toISOString(), locks };
  console.warn(`MyMadrich startup took ${ms} ms (${reason}).`, report);
  try {
    localStorage.setItem('mymadrich:slow_startup', JSON.stringify(report));
  } catch {
    // Storage unavailable: the console line above is all we keep
  }
}

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable; the view simply won't be remembered
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Roles the person holds, and the one they are viewing as right now.
  // Refs mirror the state so the long-lived auth listeners below always see current values.
  const [roles, setRoles] = useState([]);
  const [activeRole, setActiveRole] = useState(null);
  const rolesRef = useRef([]);
  const activeRef = useRef(null);
  const userIdRef = useRef(null);

  // Guard: whichever of getSession/.then or onAuthStateChange(INITIAL_SESSION)
  // fires first handles the initial profile fetch; the other becomes a no-op.
  const initializedRef = useRef(false);

  // One profile load at a time per person. The sign-in listener can fire several events in quick
  // succession (more with several tabs open); a load already running is shared, not repeated.
  const inFlightRef = useRef(null);

  // Startup timing (measurement only, see recordSlowStartup)
  const startedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const startupNotedRef = useRef(false);

  useEffect(() => {
    // Fix 3 — Safety timeout: if auth init hasn't resolved in 10 s,
    // force loading to false so the app escapes to login instead of spinning.
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          console.warn('Auth init safety timeout — forcing loading=false');
          noteStartup('safety timeout');
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
          noteStartup('no saved session');
        }
      })
      .catch((e) => {
        console.error('getSession failed:', e);
        setLoading(false);
      });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        setSession(s);

        // De-dupe: if getSession already handled the initial fetch, skip.
        if (event === 'INITIAL_SESSION') {
          if (initializedRef.current) return;
          initializedRef.current = true;
        }

        // Supabase warns against calling any of its methods (or awaiting them) inside this
        // callback: it runs while the auth state is being processed, and a request made from
        // inside it can wait on that same processing and deadlock. The work is handed off to run
        // right after the callback returns.
        // https://supabase.com/docs/reference/javascript/auth-onauthstatechange
        setTimeout(() => {
          if (s?.user) {
            fetchProfile(s.user.id);
          } else {
            setProfile(null);
            clearRoles();
            setLoading(false);
            noteStartup('signed out');
          }
        }, 0);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  function clearRoles() {
    rolesRef.current = [];
    activeRef.current = null;
    userIdRef.current = null;
    setRoles([]);
    setActiveRole(null);
  }

  /** Records startup timing once, and only reports it when it was slow. */
  function noteStartup(reason) {
    if (startupNotedRef.current) return;
    startupNotedRef.current = true;
    const ms = Math.round(performance.now() - startedAtRef.current);
    if (ms >= SLOW_STARTUP_MS) recordSlowStartup(ms, reason);
  }

  /**
   * Loads the person's profile and roles. If a load for the same person is already running,
   * that one is shared instead of starting another. `force` skips sharing (used by
   * refreshProfile, which wants fresh data after a role change).
   */
  function fetchProfile(userId, { force = false } = {}) {
    const running = inFlightRef.current;
    if (!force && running && running.userId === userId) return running.promise;

    const promise = loadProfile(userId).finally(() => {
      if (inFlightRef.current && inFlightRef.current.promise === promise) {
        inFlightRef.current = null;
      }
    });
    inFlightRef.current = { userId, promise };
    return promise;
  }

  async function loadProfile(userId) {
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

      // Roles are loaded before `loading` clears so the very first render already
      // knows the active view (no flash of the wrong view). This never throws:
      // on any problem it falls back to the single role on the profile.
      await loadRoles(userId, data.role);

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
      noteStartup('profile loaded');
    }
  }

  /**
   * Loads the roles the person holds and decides which view to use.
   * Never throws. If the roles can't be loaded it keeps the last known list,
   * or falls back to the single role on the profile, so a roles problem can
   * never lock anyone out of the app.
   */
  async function loadRoles(userId, primaryRole) {
    // A different person signing in on the same tab starts clean.
    if (userIdRef.current && userIdRef.current !== userId) {
      rolesRef.current = [];
      activeRef.current = null;
    }
    userIdRef.current = userId;

    let granted = null;
    try {
      const { data, error } = await withTimeout(
        supabase.from('profile_roles').select('role').eq('profile_id', userId),
        ROLES_TIMEOUT,
      );
      if (error) throw error;
      granted = (data || []).map((r) => r.role);
    } catch (err) {
      console.warn('Could not load roles; falling back to the profile role:', err.message);
    }

    let list = sortRoles(granted);
    if (list.length === 0) {
      list = rolesRef.current.length > 0 ? rolesRef.current : sortRoles([primaryRole]);
    }

    const next = resolveActiveRole({
      roles: list,
      current: activeRef.current,
      stored: readStored(activeRoleKey(userId)),
      primary: primaryRole,
    });

    rolesRef.current = list;
    activeRef.current = next;
    setRoles(list);
    setActiveRole(next);
  }

  /**
   * Non-blocking invitation processing. If a pending invitation is claimed,
   * the profile and roles are silently re-fetched and state is updated in-place.
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
          await loadRoles(userId, updatedProfile.role);
        }
      }
    } catch (invErr) {
      // Invitation processing is non-critical; log and continue
      console.warn('Invitation check skipped:', invErr.message);
    }
  }

  /**
   * Switches the view for people who hold more than one role.
   * Returns true if the switch happened, false if the person doesn't hold that role.
   */
  const switchRole = useCallback((nextRole) => {
    if (!rolesRef.current.includes(nextRole)) return false;
    activeRef.current = nextRole;
    setActiveRole(nextRole);
    if (userIdRef.current) {
      writeStored(activeRoleKey(userIdRef.current), nextRole);
    }
    return true;
  }, []);

  /**
   * Re-reads the signed-in person's profile and roles (for example after an administrator changes
   * their own roles), so the view switcher updates without a reload.
   */
  const refreshProfile = useCallback(async () => {
    if (userIdRef.current) await fetchProfile(userIdRef.current, { force: true });
  }, []);

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
    clearRoles();
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    // The view the person is using now. Every existing `role` check in the app
    // reads this, so it behaves exactly like a single role for any one view.
    role: activeRole ?? profile?.role ?? null,
    roles,
    hasMultipleRoles: roles.length > 1,
    switchRole,
    refreshProfile,
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
