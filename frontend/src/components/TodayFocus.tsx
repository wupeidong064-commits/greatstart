import { useFollowUpRefresh } from '../hooks/useFollowUpRefresh';
import { message } from 'antd';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, CheckCheck, ChevronDown, ClipboardCheck, RotateCcw, ContactRound, Ticket, TrendingDown, UserRoundCheck, UsersRound } from 'lucide-react';
import type { AlertCategory, AlertsResult, FollowUpTask } from '../services/aiApi';
import { useAuthStore } from '../store/authStore';
import { useFollowUpStore } from '../store/followUpStore';
import { MagneticSurface } from './MagneticSurface';
import './TodayFocus.css';

const CompletionMotion = lazy(() => import('./CompletionMotion'));
const icons = { lowClasses: TrendingDown, lowStudents: UsersRound, renewal: UserRoundCheck, lead: ContactRound, experience: Ticket };
const labels = { lowClasses: '与老师核对班级出勤', lowStudents: '了解缺课原因，安排回访', renewal: '联系家长，跟进续费意向', lead: '查看线索跟进情况', experience: '回访体验，了解报名意向' };

interface AlertPanel { data: AlertsResult | null; loading: boolean; error: string | null; reload: () => void }
const NO_TASKS: FollowUpTask[] = [];

export function useTodayFollowUps({ data, loading, reload }: AlertPanel) {
  const user = useAuthStore((state) => state.user);
  const records = useFollowUpStore((state) => state.records);
  const toggle = useFollowUpStore((state) => state.toggle);
  const load = useFollowUpStore((state) => state.load);
  const pending = useFollowUpStore((state) => state.pending);
  const recordScope = useFollowUpStore(state => state.scope);
  const recordsReady = useFollowUpStore(state => state.ready);
  const recordsError = useFollowUpStore(state => state.error);
  const day = data?.day || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const scope = useMemo(() => [user?.organizationId, user?.campusId, user?.id, day],
    [user?.organizationId, user?.campusId, user?.id, day]);
  const scopeKey = JSON.stringify(scope);
  const ready = recordScope === scopeKey && recordsReady;
  useFollowUpRefresh(() => {
    if (!loading) reload();
    void load(scopeKey).catch(() => {});
  });
  useEffect(() => {
    if (user?.id) void load(scopeKey).catch(() => {});
  }, [scopeKey, load, user?.id]);
  const keyOf = useCallback((task: FollowUpTask) => JSON.stringify([...scope, task.key, task.revision]), [scope]);
  const tasks = data?.tasks ?? NO_TASKS;
  const { completed, byCategory } = useMemo(() => {
    let completed = 0;
    const byCategory = new Map<AlertCategory['key'], number>();
    for (const task of tasks) {
      if (ready && records[keyOf(task)]) completed++;
      else byCategory.set(task.category, (byCategory.get(task.category) ?? 0) + 1);
    }
    return { completed, byCategory };
  }, [tasks, keyOf, ready, records]);
  const total = tasks.length;
  return {
    user, records, toggle, load, pending, scopeKey, recordsError, ready, day, keyOf, tasks, completed, total,
    remaining: data && (ready || !total) ? total - completed : null, byCategory,
  };
}

interface Props extends AlertPanel {
  followUps: ReturnType<typeof useTodayFollowUps>;
  navigate: (path: string) => void;
}

export default function TodayFocus({ data, loading, error, reload, navigate, followUps }: Props) {
  const { user, records, toggle, load, pending, scopeKey, recordsError, ready, day, keyOf, tasks, completed, total, byCategory } = followUps;
  const [selected, setSelected] = useState<AlertCategory['key'] | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; name: string; done: boolean; sequence: number } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  useEffect(() => {
    setFeedback(null);
    setSelected(null);
  }, [scopeKey]);
  const progress = total ? completed / total * 100 : 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const acknowledge = async (task: FollowUpTask) => {
    const key = keyOf(task);
    const done = !records[key];
    try {
      await toggle(key, day);
      setFeedback({ key, name: task.name, done, sequence: Date.now() });
    } catch { message.error('跟进保存失败，请重试'); }
  };

  return <section className="wb-block focus-block" aria-labelledby="today-focus-title">
    <div className="wb-block-head">
      <h3 id="today-focus-title"><ClipboardCheck size={16} /> 今日待处理</h3>
      <button className="focus-refresh" onClick={() => { reload(); void load(scopeKey).catch(() => {}); }} aria-label="刷新今日待处理" disabled={loading}><RotateCcw size={14} /></button>
    </div>
    <div className="focus-panel">
      {loading && !data ? <div className="focus-skeleton" aria-label="正在加载今日事项"><i /><i /><i /></div>
        : error && !data ? <div className="wb-empty">{error} <button className="focus-text-button" onClick={reload}>重试</button></div>
        : <>
          <div className={`focus-summary${total > 0 && completed === total ? ' is-complete' : ''}`}>
            <div><span className="focus-eyebrow">把今天的事，一件件做好</span><p><b>{ready ? completed.toString().padStart(2, '0') : '—'}</b><span> / {total.toString().padStart(2, '0')} 本人今日已跟进</span></p></div>
            <span className="focus-progress-ring" style={{ background: `conic-gradient(var(--ok) ${progress}%, var(--line) 0)` }} aria-hidden="true"><span><CheckCheck size={20} /></span></span>
          </div>
          <div className="focus-progress" role="progressbar" aria-label="本人今日跟进进度" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={completed}><span style={{ width: `${progress}%` }} /></div>
          <div className="focus-categories">
            {data?.items.map((category) => {
              const Icon = icons[category.key];
              const categoryTasks = tasks.filter((task) => task.category === category.key);
              const remaining = category.count === 0 ? 0 : ready && category.count !== null ? (byCategory.get(category.key) ?? 0) : null;
              const active = selected === category.key;
              return <div key={category.key} className={`focus-category-group${active ? ' is-open' : ''}`}>
                <MagneticSurface>
                  <button className={`focus-category${active ? ' is-selected' : ''}`} aria-expanded={active} aria-controls={`focus-${category.key}`} onClick={() => setSelected(active ? null : category.key)}>
                    <span className={`focus-category-icon tone-${category.key}`}><Icon size={18} strokeWidth={1.7} /></span>
                    <span className="focus-category-copy"><strong>{category.text}</strong><small>{category.count === null ? '数据暂不可用' : labels[category.key]}</small></span>
                    <span className="focus-count" title={remaining === null ? undefined : `本人待处理 ${remaining} 项／共 ${category.count} 项`}>{remaining ?? '—'}</span>
                    <ChevronDown size={14} className="focus-chevron" />
                  </button>
                </MagneticSurface>
                {active && <div id={`focus-${category.key}`} className="focus-connected" role="region" aria-label={`${category.text}跟进清单`}>
                  <div className="focus-task-panel">
                    <div className="focus-task-list">
                      {categoryTasks.map((task) => <div key={task.key} className="focus-task followup-risk">
                        <label className="followup-own-check"><input type="checkbox" disabled={!ready || !!recordsError || Boolean(pending[keyOf(task)])} checked={Boolean(records[keyOf(task)])} onChange={() => acknowledge(task)} aria-label={`${task.name}本人今日已跟进`} /><span className="focus-checkbox" aria-hidden="true"><Check size={12} strokeWidth={2.5} /></span></label>
                        <span className="focus-task-copy"><strong>{task.name}</strong><small>{task.detail}</small>
                          {task.owners.length ? <span className="followup-owner-list">{task.owners.map(owner => {
                            const own = ready && owner.id === user?.id;
                            const done = own ? Boolean(records[keyOf(task)]) : owner.done;
                            const at = own ? records[keyOf(task)]?.completedAt : owner.completedAt;
                            return <span key={owner.id} className="followup-owner">{owner.name} · {done ? `今日已跟进${at ? ` ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at))}` : ''}` : '今日未跟进'}</span>;
                          })}</span> : <span className="followup-owner">暂无在职负责人</span>}
                        </span>
                      </div>)}
                      {categoryTasks.length === 0 && <div className="focus-list-empty"><CheckCheck size={22} /><p>暂无相关事项</p></div>}
                    </div>
                    <button className="focus-business-link" onClick={() => navigate(category.path)}>查看完整业务名单 <ArrowUpRight size={14} /></button>
                  </div>
                </div>}
              </div>;
            })}
          </div>
          <span className="focus-sync-status" role="status">{recordsError || (error && data ? '风险数据刷新失败，请重试' : '')}</span>{data?.caliber && <details className="followup-caliber"><summary>查看统计口径</summary><p>{data.caliber.windows}</p><p>{data.caliber.renewal}</p>{Object.entries(data.caliber).filter(([key]) => !['windows','renewal','completion'].includes(key)).map(([key, value]) => <p key={key}>{value}</p>)}</details>}
        </>}
    </div>
    <div className="focus-feedback-slot" role="status" aria-live="polite" aria-atomic="true">
      {feedback && <div className="focus-feedback" key={feedback.sequence}>
        {feedback.done && !reducedMotion ? <Suspense fallback={<CheckCheck size={20} />}><CompletionMotion /></Suspense> : <CheckCheck size={20} />}
        <span><strong>{feedback.done ? '已记录今日跟进' : '已恢复为待跟进'}</strong><small>{feedback.name}</small></span>
        <button className="focus-text-button" onClick={async () => { try { await toggle(feedback.key, day); setFeedback(null); } catch { message.error('撤销失败，请重试'); } }}>撤销</button>
      </div>}
    </div>
  </section>;
}
