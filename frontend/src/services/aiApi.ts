import { useAuthStore } from '../store/authStore';
import { readCreditQuota } from './creditRefresh';

/**
 * AI 工作台 API 客户端
 * - streamChat: POST /api/ai/chat 的 SSE 流式读取（fetch + ReadableStream）
 * - fetchContextSummary: GET /api/ai/context-summary（经营速览，走既有 axios 实例）
 *
 * baseURL 与 services/api.ts 同规则：优先 VITE_API_BASE，否则相对路径 /api
 * （dev 由 vite 代理、prod 由 nginx 代理到后端：3000）。
 */

const baseURL = import.meta.env.VITE_API_BASE || '/api';

export interface StreamHandlers {
  onMessage?: (id:string)=>void;
  onDelta: (text: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
  /** 服务端结算反馈：本次消耗与余额（积分，展示字符串） */
  onCredits?: (c: { settled: string; balance: string }) => void;
  /** 会话定位：新会话或回放时服务端返回 conversationId */
  onConversation?: (conversationId: string, opts?: { replay?: boolean }) => void;
  /** 是否为历史范围缩短（上下文预算裁剪且回退近期历史） */
  onHistoryTruncated?: () => void;
  /** G2 证据卡（确定性渲染；modelText 不下发） */
  onEvidences?: (cards: unknown[]) => void;
  onFileCard?: (card: unknown) => void;
  /** R2-4 叙述数字核验：未在证据中出现的数字（前端标黄提示） */
  onVerificationNotice?: (notice: string) => void;
}

export interface ChatSendPayload {
  /** 会话 ID；不传则服务端自动新建 */
  conversationId?: string | null;
  /** 当前消息内容（客户端不提交历史） */
  content: string;
  /** 幂等请求 ID：同 ID 重复提交回放既有结果，不双任务不双扣 */
  requestId: string;
  uploadIds?: string[];
}

export async function streamChat(
  payload: ChatSendPayload,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const token = useAuthStore.getState().token;
  let res: Response;
  try {
    res = await fetch(`${baseURL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    throw new Error('网络连接失败，请检查网络后重试');
  }

  if (!res.ok) {
    let message = `请求失败（HTTP ${res.status}）`;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
      else if (typeof data?.error?.message === 'string') message = data.error.message;
      else if (typeof data?.message === 'string') message = data.message;
    } catch {
      // 保留默认信息
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error('服务端未返回数据流');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let streamError: string | null = null;

  // 逐块解析 SSE：data: {...}\n\n
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const rawEvent of events) {
      const line = rawEvent.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const json = JSON.parse(payload);
        if (typeof json.conversationId === 'string' && json.conversationId) {
          handlers.onConversation?.(json.conversationId, { replay: Boolean(json.replay) });
        }
        if(typeof json.messageId==='string')handlers.onMessage?.(json.messageId);
        if (typeof json.delta === 'string' && json.delta.length > 0) {
          handlers.onDelta(json.delta);
        }
        if (typeof json.error === 'string' && json.error.length > 0) {
          streamError = json.error;
        }
        if (json.credits && typeof json.credits.settled === 'string') {
          handlers.onCredits?.({ settled: json.credits.settled, balance: json.credits.balance });
        }
        if (json.historyTruncated) {
          handlers.onHistoryTruncated?.();
        }
        if (Array.isArray(json.evidences)) {
          handlers.onEvidences?.(json.evidences);
        }
        if (json.fileCard && typeof json.fileCard === 'object') {
          handlers.onFileCard?.(json.fileCard);
        }
        if (typeof json.verificationNotice === 'string') {
          handlers.onVerificationNotice?.(json.verificationNotice);
        }
        if (json.done) {
          handlers.onDone();
        }
      } catch {
        // 忽略无法解析的事件
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
}

/* ==================== 会话记忆（G1）：新建/列出/恢复/重命名/删除 ==================== */

export interface ConversationItem {
  id: string;
  title: string | null;
  updatedAt: string;
}

export async function listConversations(): Promise<ConversationItem[]> {
  const { default: api } = await import('./api');
  const res: any = await api.get('/ai/conversations');
  const rows = res?.data ?? res;
  return Array.isArray(rows) ? rows : [];
}

export interface ConversationMessage {
  id: string;
  sequence: number;
  role: 'user' | 'assistant';
  content: string;
  status: string;
  createdAt: string;
  evidences?: unknown[] | null;
  verificationNotice?: string;
}

export interface ConversationMessagesPage {
  messages: ConversationMessage[];
  hasMore: boolean;
  oldestSequence: number | null;
}

/** R1-8：默认最新一页；传 before=<sequence> 向更早翻页（游标稳定） */
export async function fetchConversationMessages(conversationId: string, limit = 50, before?: number): Promise<ConversationMessagesPage> {
  const { default: api } = await import('./api');
  const res: any = await api.get(`/ai/conversations/${conversationId}/messages`, {
    params: { limit, ...(before !== undefined ? { before } : {}) },
  });
  const data = res?.data ?? res;
  return {
    messages: Array.isArray(data?.messages) ? data.messages : [],
    hasMore: Boolean(data?.hasMore),
    oldestSequence: typeof data?.oldestSequence === 'number' ? data.oldestSequence : null,
  };
}

export async function renameConversationApi(conversationId: string, title: string): Promise<void> {
  const { default: api } = await import('./api');
  await api.patch(`/ai/conversations/${conversationId}`, { title });
}

export async function deleteConversationApi(conversationId: string): Promise<void> {
  const { default: api } = await import('./api');
  await api.delete(`/ai/conversations/${conversationId}`);
}

export interface AiQuota {
  model?: string;
  provider?: string;
  testBudget?: {model:string;limitCny:number;estimatedCny:number;remainingCny:number;calls:number;actualCashCharge:null;freeQuotaDeduction:null}|null;
  enabled: boolean;
  pricingReady: boolean;
  chatAvailable: boolean;
  billingCode?: string | null;
  billingReason?: string | null;
  billingMode?: 'mock_free' | 'metered' | 'blocked';
  balance?: string;
  available?: string;
}

export async function fetchAiQuota(): Promise<AiQuota> {
  const data = await readCreditQuota();
  if (!data || typeof data.chatAvailable !== 'boolean') throw new Error('暂时无法确认 AI 服务状态，请刷新后重试。');
  return data;
}

export interface OrgSummary {
  activeClasses: number | null;
  activeStudents: number | null;
  monthOrderCount: number | null;
  monthOrderAmount: number | null;
  monthNewOrderCount: number | null;
  monthRenewalOrderCount: number | null;
  lowAttendanceStudents: number | null;
  lowAttendanceDays: number;
  lowAttendanceThreshold: number;
  generatedAt: string;
  errors: string[];
}

/** 经营速览（右栏与 AI 快照同源），refresh=true 强制绕过 60s 缓存 */
export async function fetchContextSummary(refresh = false): Promise<OrgSummary> {
  const { default: api } = await import('./api');
  const res: any = await api.get('/ai/context-summary', {
    params: refresh ? { refresh: 'true' } : undefined,
  });
  const data = res?.data ?? res;
  // 形状防御：接口返回畸形结构（空数组/字符串等）时按错误处理，
  // 绝不让坏数据进入渲染层导致整页崩溃
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('经营速览数据格式异常，请稍后重试');
  }
  return data;
}

/* ==================== 经营工作台（首页）真实数据 ==================== */

/**
 * 首页指标与右栏数据全部来自既有业务接口，口径与对应业务页一致：
 * - 在册学员/本周课消：GET /consumption/statistics（周区间，同"课消收入总结"页）
 * - 本周新签流水：GET /conversions 列表（接口无日期参数，取前 200 条客户端
 *   过滤本周非续费单汇总——见交付报告"接口缺口"备注）
 * - 待处理预警：低出勤班级 + 连续请假学员 + 待续费学员（剩余课时≤10，
 *   与续费跟进页统一阈值）三个既有接口组合
 * - 今日课表：GET /schedules 当日区间 + /classes + /users/teachers 拼装
 */

import dayjs from 'dayjs';

export function weekRangeISO(): { start: string; end: string } {
  const today = dayjs();
  // 周一为一周起点
  const start = today.subtract((today.day() + 6) % 7, 'day').startOf('day');
  return { start: start.format('YYYY-MM-DD'), end: today.format('YYYY-MM-DD') };
}

export interface WeekStats {
  activeStudents: number | null;
  weekConsumption: number | null;
}

/** 指标卡 1/2：在册学员 + 本周课消人次（/consumption/statistics 周区间） */
export async function fetchWeekStats(): Promise<WeekStats> {
  const { default: api } = await import('./api');
  const { start, end } = weekRangeISO();
  const res: any = await api.get('/consumption/statistics', {
    params: { startDate: start, endDate: end },
  });
  const d = res?.data ?? res;
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    throw new Error('课消统计数据格式异常');
  }
  return {
    activeStudents: typeof d.baseCount === 'number' ? d.baseCount : null,
    weekConsumption: typeof d.totalAttendance === 'number' ? d.totalAttendance : null,
  };
}

export interface NewSigningResult {
  amount: number | null;
  count: number;
  /** 数据可能不完整（单页上限），用于界面提示 */
  truncated: boolean;
}

/** 指标卡 3：本周新签流水（新单金额合计，排除续费） */
export async function fetchWeekNewSigning(): Promise<NewSigningResult> {
  const { default: api } = await import('./api');
  const { start, end } = weekRangeISO();
  const res: any = await api.get('/conversions/summary', { params: { startDate: start, endDate: end, newOnly: true } });
  return { amount: res.data.amount, count: res.data.count, truncated: false };
}

export type AlertLevel = 'ok' | 'warn' | 'bad';

/** 泛化提醒着色阈值：<5 绿 / 5-10 黄 / >10 红 */
export function alertLevel(n: number): AlertLevel {
  return n < 5 ? 'ok' : n <= 10 ? 'warn' : 'bad';
}

export interface AlertCategory {
  key: 'lowClasses' | 'lowStudents' | 'renewal' | 'lead' | 'experience';
  text: string;
  /** 提醒数量；null = 该源接口本次失败（行内显示 —，不计入合计） */
  count: number | null;
  /** 点击跳转的业务页 */
  path: string;
  /** 口径/截断说明（悬浮提示） */
  hint?: string;
}

export interface FollowUpOwner {
  id: string;
  name: string;
  jobRole: string;
  done: boolean;
  completedAt: string | null;
}

export interface AlertsResult {
  day: string;
  items: AlertCategory[];
  total: number;
  tasks: FollowUpTask[];
  caliber: { windows: string; renewal: string; completion: string; [key: string]: string };
}

export interface FollowUpTask {
  key: string;
  category: AlertCategory['key'];
  name: string;
  detail: string;
  revision: string;
  path: string;
  owners: FollowUpOwner[];
}

/** 管理员与员工从同一套服务端风险事实生成事项。 */
export async function fetchAlerts(): Promise<AlertsResult> {
  const actorId = useAuthStore.getState().user?.id;
  const { default: api } = await import('./api');
  const result: any = await api.get('/staff-work/manager-followups', { timeout: 20000 });
  const data = result?.data;
  if (!data || typeof data.day !== 'string' || !Array.isArray(data.people) || !Array.isArray(data.unassigned) || !data.caliber) {
    throw new Error('待处理数据格式不完整，请刷新重试');
  }
  type RawTask = Omit<FollowUpTask, 'owners'> & { done: boolean; completedAt: string | null };
  const grouped = new Map<string, FollowUpTask>();
  const categories: Array<{ key: AlertCategory['key']; text: string; path: string }> = [
    { key: 'lowClasses', text: '低出勤班级', path: '/attendances/low-attendance-classes' },
    { key: 'lowStudents', text: '低出勤学员', path: '/students/low-attendance' },
    { key: 'renewal', text: '待续费学员', path: '/students/renewal' },
    { key: 'lead', text: '线索跟进', path: '/cashflow/marketing' },
    { key: 'experience', text: '体验课跟进', path: '/cashflow/experience-schedule' },
  ];
  const allowed = new Set(categories.map(c => c.key));
  const add = (task: RawTask, owner?: FollowUpOwner) => {
    if (!task || !task.key || !allowed.has(task.category) || !task.revision) throw new Error('待处理事项数据不完整');
    let existing = grouped.get(task.key);
    if (!existing) {
      existing = { key: task.key, category: task.category, name: task.name, detail: task.detail, revision: task.revision, path: task.path, owners: [] };
      grouped.set(task.key, existing);
    }
    // A shared student can have a distinct responsibility revision for each teacher.
    // Use my own version so my work list and the management checklist share one receipt.
    if (owner?.id === actorId) existing.revision = task.revision;
    if (owner && !existing.owners.some(item => item.id === owner.id)) existing.owners.push(owner);
  };
  data.people.forEach((person: any) => {
    if (!person.id || !Array.isArray(person.tasks)) throw new Error('跟进人员数据不完整');
    person.tasks.forEach((task: RawTask) => add(task, { id: person.id, name: person.name, jobRole: person.jobRole, done: task.done, completedAt: task.completedAt }));
  });
  data.unassigned.forEach((task: RawTask) => add(task));
  const tasks = [...grouped.values()];
  return { day: data.day, items: categories.map(c => ({ ...c, count: tasks.filter(task => task.category === c.key).length })), total: tasks.length, tasks, caliber: data.caliber };
}

export interface TodayScheduleRow {
  id: string;
  time: string;
  className: string;
  teacherName: string;
  status: string;
}

/** 右栏「今日课表」：当日排课 + 班级名/老师名拼装（排课表只存 id） */
export async function fetchTodaySchedules(): Promise<TodayScheduleRow[]> {
  const { default: api } = await import('./api');
  const today = dayjs().format('YYYY-MM-DD');

  const [schedulesRes, classesRes, teachersRes] = await Promise.all([
    api.get('/schedules', {
      params: { startDate: today, endDate: today, page: 1, pageSize: 100 },
    }),
    api.get('/classes', { params: { page: 1, pageSize: 200 } }),
    api.get('/users/teachers'),
  ]);

  const schedules: any[] = Array.isArray(schedulesRes?.data) ? schedulesRes.data : [];
  const classes: any[] = Array.isArray(classesRes?.data) ? classesRes.data : [];
  const teachers: any[] = Array.isArray(teachersRes?.data) ? teachersRes.data : [];

  const classMap = new Map(classes.map((c: any) => [c.id, c]));
  const teacherMap = new Map(teachers.map((t: any) => [t.id, t]));

  return schedules
    .filter((s) => s.status !== 'cancelled')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((s) => {
      const cls = s.classId ? classMap.get(s.classId) : null;
      const teacher = s.teacherId || cls?.teacherId ? teacherMap.get(s.teacherId || cls?.teacherId) : null;
      return {
        id: s.id,
        time: dayjs(s.startTime).format('HH:mm'),
        className: cls?.name || '未关联班级',
        teacherName: teacher?.name || '—',
        status: s.status,
      };
    });
}
