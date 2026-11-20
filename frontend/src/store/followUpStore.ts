import { create } from 'zustand';
import api from '../services/api';

interface FollowUpRecord { day: string; completedAt: string }
interface FollowUpState {
  records: Record<string, FollowUpRecord>;
  pending: Record<string, boolean>;
  scope: string;
  version: number;
  ready: boolean;
  error: string | null;
  confirm: (key: string, record: FollowUpRecord | null) => void;
  load: (scope: string) => Promise<void>;
  toggle: (key: string, day: string) => Promise<void>;
}

/** 服务端保存每日个人跟进进度，原业务风险由原记录决定。 */
export const useFollowUpStore = create<FollowUpState>()((set, get) => ({
  records: {}, pending: {}, scope: '', version: 0, ready: false, error: null,
  confirm: (key, record) => {
    if (JSON.stringify(JSON.parse(key).slice(0, 4)) !== get().scope) return;
    set(state => {
      const records = { ...state.records };
      if (record) records[key] = record; else delete records[key];
      return { records, version: state.version + 1, error: null };
    });
  },
  load: async (scope) => {
    if (get().scope === scope && Object.values(get().pending).some(Boolean)) return;
    const version = get().version + 1;
    set(state => ({ scope, version, error: null, ...(state.scope === scope ? {} : { records: {}, pending: {}, ready: false }) }));
    try {
      const result: any = await api.get('/follow-ups');
      if (get().scope !== scope || get().version !== version || Object.values(get().pending).some(Boolean)) return;
      if (!Array.isArray(result.data?.records)) throw new Error('跟进进度格式无效，请刷新');
      const records: Record<string, FollowUpRecord> = {};
      for (const r of result.data.records) {
        if (typeof r.key !== 'string' || JSON.stringify(JSON.parse(r.key).slice(0, 4)) !== scope) throw new Error('跟进范围已变化，请刷新');
        records[r.key] = { day: r.day, completedAt: r.completedAt };
      }
      set({ records, ready: true, error: null });
    } catch (error) {
      if (get().scope === scope && get().version === version) set({ error: '跟进进度刷新失败，请重试' });
      throw error;
    }
  },
  toggle: async (key, day) => {
    if (get().pending[key]) return;
    const [org, campus, user, keyDay, taskKey, revision] = JSON.parse(key);
    const scope = JSON.stringify([org, campus, user, keyDay]);
    if (get().scope !== scope || keyDay !== day) throw new Error('账号或日期已变化，请刷新');
    const done = !get().records[key];
    set(state => ({ pending: { ...state.pending, [key]: true }, version: state.version + 1 }));
    try {
      const result: any = await api.put('/follow-ups', { taskKey, revision, done, day, mode: 'management' });
      if (get().scope !== scope) return;
      set(state => {
        const records = { ...state.records };
        if (result.data.done) records[key] = { day: result.data.day, completedAt: result.data.completedAt };
        else delete records[key];
        return { records, ready: true, error: null, version: state.version + 1 };
      });
    } finally {
      if (get().scope === scope) set(state => ({ pending: { ...state.pending, [key]: false }, version: state.version + 1 }));
    }
  },
}));
