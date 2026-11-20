import { useFollowUpRefresh } from '../hooks/useFollowUpRefresh';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Empty, Progress, Spin, Table, Tag } from 'antd';
import { RotateCcw, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import './MyWork.css';
import api from '../services/api';
import { useFollowUpStore } from '../store/followUpStore';
import { Modal } from '../components/overlays';

interface TodayExperience { date: string; startTime: string | null; endTime: string | null; className: string; classroom: string | null; teachingTeacherName: string; assigneeName: string; teaching: boolean; sales: boolean }
interface WorkTask { key: string; category: 'lowClasses' | 'lowStudents' | 'renewal' | 'lead' | 'experience'; name: string; detail: string; revision: string; path: string; done: boolean; completedAt: string | null; experience?: TodayExperience }
interface WorkData {
  day: string; role: string; tasks: WorkTask[];
  todaySchedules: Array<{ id: string; classId: string; class: { name: string }; startTime: string; endTime: string; classroom: string | null; status: string }>;
  progress: { total: number; completed: number };
  caliber: { attendance: string; windows: string; renewal: string; completion: string };
  capabilityNote: string | null;
}
const categories = { lowClasses: '班级低出勤', lowStudents: '学员低出勤', renewal: '待续费', lead: '线索跟进', experience: '体验跟进' };
const todayShanghai = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const clock = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
function errorText(error: any, fallback: string) { const text = error.response?.data?.message || error.response?.data?.error; return typeof text === 'string' ? text : fallback; }

export default function MyWork() {
  const user = useAuthStore(state => state.user);
  const navigate = useNavigate();
  const [data, setData] = useState<WorkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ text: string; task: WorkTask; done: boolean } | null>(null);
  const [tab, setTab] = useState<'pending' | 'done' | 'all'>('pending');
  const [experienceKey, setExperienceKey] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const busy = useRef(false);
  const active = useRef(true);
  const actor = JSON.stringify([user?.id, user?.organizationId, user?.campusId, user?.role]);
  const currentActor = useRef(actor); currentActor.current = actor;
  const load = useCallback(async (force = false) => {
    if (busy.current && !force) return;
    const version = ++requestVersion.current;
    const actorAtRequest = actor;
    setLoading(true); setError(null);
    try {
      const response = await api.get<unknown, { success: boolean; data: WorkData }>('/staff-work');
      if (!response.success || !response.data?.day || !Array.isArray(response.data.tasks)) throw new Error('数据格式无效');
      if (active.current && version === requestVersion.current && currentActor.current === actorAtRequest) setData(response.data);
    } catch (failure) {
      if (active.current && version === requestVersion.current && currentActor.current === actorAtRequest) setError(errorText(failure, '工作数据加载失败，请重试'));
    } finally { if (active.current && version === requestVersion.current && currentActor.current === actorAtRequest) setLoading(false); }
  }, [actor]);
  useEffect(() => {
    active.current = true; setData(null); setSaveError(null); setTab('pending'); setExperienceKey(null); busy.current = false;
    void load();
    return () => { active.current = false; requestVersion.current++; };
  }, [load]);
  useFollowUpRefresh(() => { void load(); });
  const mark = async (task: WorkTask, done: boolean) => {
    if (busy.current || !data) return;
    if (data.day !== todayShanghai()) { void load(); return; }
    busy.current = true; requestVersion.current++; setSaving(task.key); setSaveError(null);
    const actorAtRequest = actor;
    try {
      const response = await api.put('/follow-ups', { taskKey: task.key, revision: task.revision, done, day: data.day });
      if (active.current && currentActor.current === actorAtRequest) {
        const key = JSON.stringify([user?.organizationId, user?.campusId, user?.id, data.day, task.key, task.revision]);
        useFollowUpStore.getState().confirm(key, response.data.done ? { day: response.data.day, completedAt: response.data.completedAt } : null);
        setData(previous => {
          if (!previous || previous.day !== response.data.day) return previous;
          const tasks = previous.tasks.map(item => item.key === task.key && item.revision === task.revision ? { ...item, done: response.data.done, completedAt: response.data.completedAt } : item);
          return { ...previous, tasks, progress: { total: tasks.length, completed: tasks.filter(item => item.done).length } };
        });
        await load(true);
      }
    } catch (failure) {
      if (active.current && currentActor.current === actorAtRequest) setSaveError({ text: errorText(failure, '跟进保存失败，请重试'), task, done });
    } finally { if (active.current && currentActor.current === actorAtRequest) { busy.current = false; setSaving(null); } }
  };
  const tasks = (data?.tasks || []).filter(task => tab === 'all' || task.done === (tab === 'done'));
  const teacher = ['teacher', 'coach'].includes(data?.role ?? '');
  const selectedExperienceTask = data?.tasks.find(task => task.key === experienceKey && task.experience);
  const selectedExperience = selectedExperienceTask?.experience;
  const groups = Object.entries(categories).map(([key, label]) => ({ key, label,
    all: (data?.tasks || []).filter(task => task.category === key),
    visible: tasks.filter(task => task.category === key),
  })).filter(group => group.visible.length > 0)
    .sort((a, b) => Number(b.all.some(task => task.experience)) - Number(a.all.some(task => task.experience)));
  return <section>
    <div className="bz-page-head" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}><div><h1>我的工作</h1><p>{user?.name || '你好'}，{data ? `${data.day}（上海时间）` : '正在获取今日工作'}</p></div><Button icon={<RotateCcw size={14} />} onClick={() => { setSaveError(null); void load(); }} disabled={Boolean(saving)} loading={loading}>刷新工作</Button></div>
    {error ? <Alert type="error" showIcon message={error} description="工作数据未完整载入，不将失败当作没有待办。" action={<Button onClick={() => void load()}>重试加载</Button>} /> : !data ? <div style={{ padding: 60, textAlign: 'center' }}><Spin tip="正在加载我的工作" /></div> : <>
      {data.capabilityNote && <Alert type="info" message={data.capabilityNote} style={{ marginBottom: 20 }} />}
        <section aria-labelledby="work-progress-title" style={{ padding: 20, marginBottom: 24, border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 12 }}>
          <h2 id="work-progress-title" style={{ fontSize: 20, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><CheckCheck size={20} />今日跟进进度</h2>
          <p data-testid="work-progress">已跟进 {data.progress.completed} / {data.progress.total} 项</p>
          <Progress percent={data.progress.total ? Math.round(data.progress.completed / data.progress.total * 100) : 0} />
        </section>
        {teacher && <section aria-labelledby="work-schedules-title" style={{ marginBottom: 28 }}><h2 id="work-schedules-title" style={{ fontSize: 20 }}>今日课表</h2>
          {!loading && data.todaySchedules.length === 0 ? <div className="work-schedule-empty">今天没有安排给您的课程</div> : <Table size="small" rowKey="id" dataSource={data.todaySchedules} loading={loading} scroll={{ x: 540 }} pagination={false} locale={{ emptyText: '今天没有安排给您的课程' }} columns={[
            { title: '时间', key: 'time', render: (_, row) => `${clock(row.startTime)}–${clock(row.endTime)}` },
            { title: '班级', key: 'class', render: (_, row) => row.class.name },
            { title: '教室', dataIndex: 'classroom', render: (value: string) => value || '待安排' },
            { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={value === 'completed' ? 'green' : 'blue'}>{value === 'completed' ? '已完成' : '待上课'}</Tag> },
            { title: '操作', key: 'action', render: (_, row) => <Button type="link" onClick={() => navigate('/operation/weekly-schedule?scheduleId=' + encodeURIComponent(row.id))}>进入签到</Button> },
          ]} />}
        </section>}
        <section aria-labelledby="work-tasks-title" style={{ marginBottom: 28 }}><h2 id="work-tasks-title" style={{ fontSize: 20 }}>我的跟进事项</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }} role="group" aria-label="跟进状态">{([['pending', '待跟进'], ['done', '已跟进'], ['all', '全部']] as const).map(([value, label]) => <Button key={value} type={tab === value ? 'primary' : 'default'} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</Button>)}</div>
          {saveError && <Alert type="error" showIcon message={saveError.text} style={{ marginBottom: 14 }} action={<div style={{ display: 'flex', gap: 8 }}><Button disabled={Boolean(saving)} onClick={() => void mark(saveError.task, saveError.done)}>重试保存</Button><Button onClick={() => { setSaveError(null); void load(); }} disabled={Boolean(saving)}>刷新事实</Button></div>} />}
          {groups.length ? <Collapse className="work-task-groups" defaultActiveKey={data.tasks.some(task => task.experience) ? ['experience'] : []} items={groups.map(group => ({
            key: group.key,
            label: <span className="work-group-heading"><span className="work-group-title">{group.label}</span><span className="work-group-count">待跟进 {group.all.filter(task => !task.done).length} · 已跟进 {group.all.filter(task => task.done).length}</span></span>,
            children: group.visible.length ? <div className="work-task-list">{group.visible.map(task => <article key={task.key} data-testid="work-task" className="work-task-row">
              <div className="work-task-copy"><h3>{task.name}</h3><p>{task.detail}</p></div>
              <div className="work-task-actions"><Checkbox checked={task.done} disabled={Boolean(saving) || loading} onChange={event => void mark(task, event.target.checked)} aria-label={`${task.name} ${categories[task.category]} ${task.detail} 今日已跟进`}>今日已跟进</Checkbox>{saving === task.key && <Spin size="small" />}{task.experience ? <Button size="small" onClick={() => setExperienceKey(task.key)}>查看体验安排</Button> : data.role !== 'staff' && <Button size="small" onClick={() => navigate(task.path)}>查看业务记录</Button>}{task.done && <Button size="small" disabled={Boolean(saving) || loading} onClick={() => void mark(task, false)}>撤销完成</Button>}</div>
            </article>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === 'done' ? '该分类今天还没有已跟进事项' : '该分类暂无待跟进事项'} />,
          }))} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tab === 'done' ? '今天还没有已跟进事项' : tab === 'pending' ? '暂无待跟进事项' : '暂无跟进事项'} />}
          <details style={{ marginTop: 16, fontSize: 12, color: 'var(--text2)' }}><summary>查看事实口径</summary>{teacher && <><p>{data.caliber.windows}</p><p>{data.caliber.attendance}</p><p>{data.caliber.renewal}</p></>}<p>{data.caliber.completion}</p></details>
        </section>
    </>}

    <Modal title="今日体验安排" open={Boolean(selectedExperience)} onCancel={() => setExperienceKey(null)} footer={<Button onClick={() => setExperienceKey(null)}>关闭</Button>} width={580}>
      {selectedExperience && <>
        <h3>{selectedExperienceTask?.name}</h3>
        <p>{[selectedExperience.teaching && '本人授课', selectedExperience.sales && '本人跟进'].filter(Boolean).join('／')}</p>
        <dl className="bz-x-grid">{[
          ['体验日期', selectedExperience.date], ['体验时间', selectedExperience.startTime ? `${selectedExperience.startTime}${selectedExperience.endTime ? '–' + selectedExperience.endTime : ''}` : '待安排'],
          ['班级', selectedExperience.className], ['上课地点', selectedExperience.classroom || '待安排'],
          ['授课老师', selectedExperience.teachingTeacherName], ['销售负责人', selectedExperience.assigneeName],
        ].map(([label, value]) => <div key={label} className="bz-x-item"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {selectedExperience.sales && data?.role !== 'staff' && <Button onClick={() => { setExperienceKey(null); navigate('/cashflow/experience-schedule'); }}>查看体验课记录</Button>}
      </>}
    </Modal>
  </section>;
}
