/*
 * Authentication Store
 *
 * Manages user authentication state using Zustand with persistence.
 *
 * Authentication Flow:
 * 1. User logs in via MemFire Auth (email/password)
 * 2. Frontend receives Auth token and user ID
 * 3. Frontend queries users table by ID to get role, organizationId, campusId
 * 4. Store persists to localStorage for session continuity
 *
 * Data Isolation:
 * - Backend uses organizationId from user record to filter data
 * - Users can only see data belonging to their organization
 * - CampusId provides additional filtering for multi-campus organizations
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { dataService } from '../services/dataService';

interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: string;
  organizationId?: string;
  campusId?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      _hasHydrated: false,
      setAuth: (token, user) => {
        set({ token, user, isAuthenticated: true });
      },
      clearAuth: () => {
        // 清除所有数据缓存，避免切换用户时显示旧数据
        dataService.clearAllCache();
        set({ token: null, user: null, isAuthenticated: false });
      },
      setHasHydrated: (state) => {
        set({ _hasHydrated: state });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // 状态恢复完成后，设置 _hasHydrated 为 true
        state?.setHasHydrated(true);
      },
    }
  )
);
