/**
 * Stores the local API session for this browser. PrivateRoute revalidates the token with
 * /auth/me after hydration; the backend enforces role and campus scope on requests.
 */
import { create } from 'zustand';
import { cacheService } from '../services/cacheService';

interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: string;
  isPlatformAdmin?: boolean;
  managementLevel?: 'none' | 'manager' | 'super';
  jobRole?: string | null;
  organizationId?: string;
  campusId?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  setAuth: (token: string, user: User) => void;
  refreshUser: (token: string, user: User) => void;
  clearAuth: () => void;
}

const cacheIdentity = (user: User | null): string => JSON.stringify(user && [
  user.id,
  user.organizationId ?? null,
  user.campusId ?? null,
  user.role,
  user.isPlatformAdmin ?? false,
  user.managementLevel ?? 'none',
  user.jobRole ?? null,
]);

const storageKey = 'auth-storage';
const signedOut = { token: null, user: null, isAuthenticated: false };

function readSession() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return signedOut;
  try {
    const state = JSON.parse(raw)?.state;
    if (typeof state?.token === 'string' && state.token && state.user?.id) {
      return { token: state.token as string, user: state.user as User, isAuthenticated: true };
    }
  } catch { /* Ignore malformed stored state. */ }
  return signedOut;
}

export function isCurrentBrowserSession(token: string): boolean {
  try { return readSession().token === token; }
  catch { return true; } // A browser without storage can still use its in-memory session.
}

export const useAuthStore = create<AuthState>((set, get) => {
  let initial;
  try { initial = readSession(); } catch { initial = signedOut; }
  return {
    ...initial,
    _hasHydrated: true,
    setAuth: (token, user) => {
      const state = { token, user, isAuthenticated: true };
      if (get().token !== token) cacheService.clearAll();
      try { localStorage.setItem(storageKey, JSON.stringify({ state, version: 0 })); } catch { /* Use the in-memory session. */ }
      set(state);
    },
    refreshUser: (token, user) => {
      if (get().token !== token || !isCurrentBrowserSession(token)) return;
      if (cacheIdentity(get().user) !== cacheIdentity(user)) cacheService.clearAll();
      set({ user });
    },
    clearAuth: () => {
      const token = get().token;
      try {
        if (token && readSession().token === token) localStorage.removeItem(storageKey);
      } catch { /* Clear the in-memory session below. */ }
      cacheService.clearAll();
      set(signedOut);
    },
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== localStorage || (event.key !== null && event.key !== storageKey)) return;
    const token = useAuthStore.getState().token;
    const nextSession = readSession();
    if (nextSession.token === token) return;
    // Dispose old forms and in-flight UI work before loading the other tab's identity.
    cacheService.clearAll();
    useAuthStore.setState(signedOut);
    if (nextSession.token) window.location.reload();
    else window.location.replace('/login');
  });
}
