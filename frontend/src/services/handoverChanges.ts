import { useAuthStore } from '../store/authStore';
import { cacheService, CACHE_KEYS } from './cacheService';

export const HANDOVER_NOTICE_KEY = 'buzzer-handover-business-notice';
type Notice = { version: 1; kind: 'followup-handover' | 'class-handover' | 'dormant-handover'; organizationId: string; campusId: string; nonce: string };

function refreshLocal(notice: Notice) {
  cacheService.invalidate(CACHE_KEYS.LEADS);
  cacheService.invalidate(CACHE_KEYS.STUDENTS);
  if (notice.kind === 'class-handover') cacheService.invalidate(CACHE_KEYS.CLASSES);
  window.dispatchEvent(new CustomEvent('business-data-changed', { detail: notice }));
}

export function receiveHandoverNotice(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const value: Notice = JSON.parse(raw), { user, token } = useAuthStore.getState();
    if (!user || !token || value.version !== 1 || !['followup-handover', 'class-handover', 'dormant-handover'].includes(value.kind) ||
        typeof value.nonce !== 'string' || !value.nonce || value.organizationId !== user.organizationId || value.campusId !== user.campusId) return false;
    refreshLocal(value);
    return true;
  } catch { return false; }
}

export function publishHandoverChange(kind: Notice['kind'], requestAuthorization: unknown) {
  const { user, token } = useAuthStore.getState();
  // Late responses from another signed-in account must not announce a mutation
  // as if it belonged to the current account's organization.
  if (!user?.organizationId || !user.campusId || !token || requestAuthorization !== `Bearer ${token}`) return;
  const notice: Notice = { version: 1, kind, organizationId: user.organizationId, campusId: user.campusId, nonce: crypto.randomUUID() };
  refreshLocal(notice);
  try { localStorage.setItem(HANDOVER_NOTICE_KEY, JSON.stringify(notice)); } catch { /* Focus refresh remains available when storage is blocked. */ }
}

// Imported once by api.ts, so notices also invalidate caches on pages that do
// not currently mount a report hook. No business records or credentials travel.
if (typeof window !== 'undefined') {
  const onStorage = (event: StorageEvent) => { if (event.key === HANDOVER_NOTICE_KEY) receiveHandoverNotice(event.newValue); };
  window.addEventListener('storage', onStorage);
  if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', onStorage));
}
