import { useAuthStore } from '../store/authStore';

const noticeKey = 'buzzer-follow-up-notice';
const eventName = 'follow-ups-updated';
const subscribers = new Set<() => void>();
let dispose: (() => void) | undefined;

/** Only notify after the API has confirmed the write, using the request's current identity. */
export function publishFollowUpChange(authorization: unknown, day: unknown) {
  const { token, user } = useAuthStore.getState();
  if (!token || authorization !== `Bearer ${token}` || !user?.organizationId || !user.campusId || typeof day !== 'string') return;
  const notice = { organizationId: user.organizationId, campusId: user.campusId, day, nonce: crypto.randomUUID() };
  window.dispatchEvent(new Event(eventName));
  try { localStorage.setItem(noticeKey, JSON.stringify(notice)); } catch { /* Focus and polling remain available. */ }
}

export function subscribeFollowUpRefresh(refresh: () => void) {
  subscribers.add(refresh);
  if (!dispose) {
    const notify = () => { if (!document.hidden) for (const callback of subscribers) callback(); };
    let lastFocus = 0;
    const focus = () => { if (Date.now() - lastFocus > 200) { lastFocus = Date.now(); notify(); } };
    const storage = (event: StorageEvent) => {
      if (event.key !== noticeKey || !event.newValue) return;
      try {
        const notice = JSON.parse(event.newValue), user = useAuthStore.getState().user;
        const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
        if (user && notice.organizationId === user.organizationId && notice.campusId === user.campusId && notice.day === today) notify();
      } catch { /* Ignore unrelated or malformed browser notices. */ }
    };
    const timer = window.setInterval(notify, 30000);
    window.addEventListener(eventName, notify);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('storage', storage);
    dispose = () => {
      window.clearInterval(timer);
      window.removeEventListener(eventName, notify);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('storage', storage);
    };
  }
  return () => { subscribers.delete(refresh); if (!subscribers.size) { dispose?.(); dispose = undefined; } };
}
