import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

type AvatarResponse = { data: { imageData: string | null } };
const currentIdentity = () => { const { token, user } = useAuthStore.getState(); return JSON.stringify([token, user?.id]); };
const noticeKey = 'buzzer-account-avatar';
function imageFrom(response: AvatarResponse) {
  const data = response.data?.imageData;
  if (data !== null && (typeof data !== 'string' || !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(data))) throw new Error('头像数据读取失败，请重试');
  return data;
}

export function useAccountAvatar() {
  const user = useAuthStore(s => s.user), token = useAuthStore(s => s.token);
  const identity = JSON.stringify([token, user?.id]);
  const [record, setRecord] = useState<{ identity: string; data: string | null }>({ identity: '', data: null });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const sequence = useRef(0), active = useRef(true), writing = useRef(false);
  const reload = useCallback(async () => {
    if (!user || !token || writing.current) return;
    const request = ++sequence.current;
    try {
      const response = await api.get<unknown, AvatarResponse>('/auth/avatar');
      const data = imageFrom(response);
      if (active.current && identity === currentIdentity() && request === sequence.current) { setRecord({ identity, data }); setError(''); }
    } catch (failure: any) {
      if (active.current && identity === currentIdentity() && request === sequence.current) setError(failure.response?.data?.error?.message || failure.message || '头像读取失败，请重试');
    }
  }, [identity, user?.id, token]);
  useEffect(() => {
    active.current = true; writing.current = false; setBusy(false); setError(''); void reload();
    const changed = (event: StorageEvent) => {
      if (event.key !== noticeKey || !event.newValue) return;
      try { if (JSON.parse(event.newValue).userId === user?.id) void reload(); } catch { /* Ignore malformed notices. */ }
    };
    const focused = () => { if (!document.hidden) void reload(); };
    window.addEventListener('storage', changed); window.addEventListener('focus', focused);
    return () => { active.current = false; ++sequence.current; window.removeEventListener('storage', changed); window.removeEventListener('focus', focused); };
  }, [reload, user?.id]);

  const write = async (file?: File) => {
    if (writing.current || !user || !token || identity !== currentIdentity()) return false;
    writing.current = true; setBusy(true); setError(''); const request = ++sequence.current;
    try {
      const form = new FormData(); if (file) form.append('avatar', file);
      const response = file ? await api.post<unknown, AvatarResponse>('/auth/avatar', form) : await api.delete<unknown, AvatarResponse>('/auth/avatar');
      const data = imageFrom(response);
      if (!active.current || identity !== currentIdentity() || request !== sequence.current) return false;
      setRecord({ identity, data });
      try { localStorage.setItem(noticeKey, JSON.stringify({ userId: user.id, nonce: crypto.randomUUID() })); } catch { /* Focus refresh remains available. */ }
      return true;
    } catch (failure: any) {
      if (active.current && identity === currentIdentity()) setError(failure.response?.data?.error?.message || failure.message || '头像保存失败，请重试');
      return false;
    } finally { if (active.current && identity === currentIdentity()) { writing.current = false; setBusy(false); } }
  };
  return { imageData: record.identity === identity ? record.data : null, error, busy, reload, save: (file: File) => write(file), reset: () => write() };
}
