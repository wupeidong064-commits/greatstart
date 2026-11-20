import api from './api';
import { useAuthStore } from '../store/authStore';

const noticeKey = 'buzzer-ai-credits-changed';
const subscribers = new Set<() => void>();
let dispose: (() => void) | undefined;
let inFlight: { scope: string; request: Promise<any> } | null = null;

/** Header and workspace can ask together; share only the in-flight request for the same identity. */
export function readCreditQuota(): Promise<any> {
  const { token, user } = useAuthStore.getState();
  const scope = JSON.stringify([token, user?.organizationId, user?.campusId]);
  if (inFlight?.scope === scope) return inFlight.request;
  const request = api.get('/ai/quota').then((r: any) => r?.data ?? r);
  inFlight = { scope, request };
  void request.finally(() => { if (inFlight?.request === request) inFlight = null; }).catch(() => {});
  return request;
}

/** One visible-page clock for all subscribers; other browsers observe server changes within 30 seconds. */
export function subscribeCreditRefresh(callback: () => void) {
  subscribers.add(callback);
  if (!dispose) {
    const notify = () => { if (!document.hidden) for (const subscriber of subscribers) subscriber(); };
    let lastFocus = 0;
    const focus = () => { if (Date.now() - lastFocus > 200) { lastFocus = Date.now(); notify(); } };
    const storage = (event: StorageEvent) => { if (event.key === noticeKey) notify(); };
    const timer = window.setInterval(notify, 30000);
    window.addEventListener('ai-credits-updated', notify);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('storage', storage);
    dispose = () => {
      window.clearInterval(timer);
      window.removeEventListener('ai-credits-updated', notify);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('storage', storage);
    };
  }
  return () => { subscribers.delete(callback); if (!subscribers.size) { dispose?.(); dispose = undefined; } };
}

export function announceCreditUpdate() {
  window.dispatchEvent(new Event('ai-credits-updated'));
  try { localStorage.setItem(noticeKey, JSON.stringify({ at: Date.now(), id: crypto.randomUUID() })); } catch { /* Focus and polling still work. */ }
}
