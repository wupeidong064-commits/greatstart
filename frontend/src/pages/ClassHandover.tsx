import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Collapse, Empty, Input, Select, Space, Statistic, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Modal } from '../components/overlays';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import './ClassHandover.css';

type Teacher = { id: string; name: string; isActive: boolean; classCount?: number };
type ClassRow = { id: string; name: string; code?: string; courseType?: string; status: string; studentCount: number };
type ScheduleRow = { id: string; startTime: string; status: string; class?: { name: string } };
type Resources = { teacher: Teacher; classes: ClassRow[]; schedules: ScheduleRow[]; summary: { studentCount: number; totalScheduleCount: number; upcomingScheduleCount: number } };
type Details = { classCount: number; scheduleCount: number; studentCount: number };
type Conflict = { startTime: string; endTime: string; conflictingClassName: string };
type PreviewItem = { classId: string; className: string; toTeacherId: string; toTeacherName: string; status: 'ready' | 'conflict'; conflicts: Conflict[]; details: Details };
type Preview = { items: PreviewItem[]; readyCount: number; conflictCount: number };
type Assignment = { classId: string; toTeacherId: string };
type Pending = { body: { fromTeacherId: string; assignments: Assignment[]; notes?: string }; requestId: string; items: PreviewItem[] };
const errorText = (e: any, fallback: string) => e.response?.data?.error?.message || e.response?.data?.message || e.message || fallback;
const businessTime = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
const sessionIdentity = () => { const s = useAuthStore.getState(); return JSON.stringify([s.token, s.user?.id, s.user?.organizationId, s.user?.campusId, s.user?.managementLevel, s.user?.isPlatformAdmin]); };
const statusText: Record<string, string> = { scheduled: '待上课', completed: '已完成', cancelled: '已取消', rescheduled: '已调课', class_paused: '随班停课' };

export default function ClassHandover() {
  const { user, token } = useAuthStore();
  const session = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.managementLevel, user?.isPlatformAdmin]);
  const active = useRef<string | null>(session); active.current = session;
  const valid = (key: string) => active.current === key && sessionIdentity() === key;
  const canOperate = !!user && !user.isPlatformAdmin && (['super', 'manager'].includes(user.managementLevel || '') || (user.managementLevel === undefined && ['admin', 'manager'].includes(user.role)));
  const [sources, setSources] = useState<Teacher[]>([]), [recipients, setRecipients] = useState<Teacher[]>([]);
  const [from, setFrom] = useState<string>(), [resources, setResources] = useState<Resources | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [assignments, setAssignments] = useState<Record<string, string>>({});
  const [bulkTeacher, setBulkTeacher] = useState<string>(), [preview, setPreview] = useState<Preview | null>(null);
  const [notes, setNotes] = useState(''), [open, setOpen] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false), [resourceLoading, setResourceLoading] = useState(false);
  const [checking, setChecking] = useState(false), [submitting, setSubmitting] = useState(false);
  const [peopleError, setPeopleError] = useState(''), [resourceError, setResourceError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const pendingKey = `buzzer-class-handover-pending:${user?.id}:${user?.organizationId}:${user?.campusId}`;
  const rememberPending = (value: Pending | null) => { pendingRef.current = value; setPending(value); try { if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value)); else sessionStorage.removeItem(pendingKey); } catch { /* In-memory retry still uses the original request ID. */ } };
  const sequence = useRef(0), peopleSequence = useRef(0), previewBusy = useRef(false), submitBusy = useRef(false);
  const receipt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const busy = checking || submitting || !!pending;
  const clearPlan = () => { setPreview(null); setError(''); setOpen(false); };

  async function loadPeople() {
    const id = ++peopleSequence.current, key = session; setPeopleLoading(true); setPeopleError('');
    try { const r = await api.get('/resource-transfers/candidates'); if (!valid(key) || id !== peopleSequence.current) return;
      // 2026-11-15 用户拍板：待交接老师下拉补入"已停用但仍有班级"的老师（后端 inactiveSources 专为该场景返回，
      // 查询条件已保证有班），否则先停用后离职的老师无法被选为交接发起方；标签带（已停用）区分。
      const inactive = (r.data.inactiveSources || []) as Teacher[];
      setSources([...(r.data.sources || []), ...inactive.map((p: Teacher) => ({ ...p, name: `${p.name}（已停用）` }))]);
      setRecipients((r.data.recipients || []).filter((p: Teacher) => p.isActive !== false));
    } catch (e) { if (valid(key) && id === peopleSequence.current) { setSources([]); setRecipients([]); setPeopleError(errorText(e, '老师列表加载失败，请重试')); } }
    finally { if (valid(key) && id === peopleSequence.current) setPeopleLoading(false); }
  }
  async function loadResources(teacherId: string, preserve = false) {
    const id = ++sequence.current, key = session; setResourceLoading(true); setResourceError('');
    if (!preserve) { setResources(null); setSelected([]); setAssignments({}); }
    try { const r = await api.get(`/resource-transfers/teacher-resources/${encodeURIComponent(teacherId)}`); if (!valid(key) || id !== sequence.current) return;
      const data: Resources = r.data; setResources(data); const remaining = new Set(data.classes.map(c => c.id));
      if (preserve) { setSelected(current => current.filter(id => remaining.has(id))); setAssignments(current => Object.fromEntries(Object.entries(current).filter(([id]) => remaining.has(id)))); }
      else setSelected(data.classes.map(c => c.id));
    } catch (e) { if (valid(key) && id === sequence.current) setResourceError(errorText(e, preserve ? '剩余资源刷新失败，请刷新重试' : '班级资源加载失败，请重试')); }
    finally { if (valid(key) && id === sequence.current) setResourceLoading(false); }
  }
  useEffect(() => {
    active.current = session; setSources([]); setRecipients([]); setFrom(undefined); setResources(null); setSelected([]); setAssignments({}); setBulkTeacher(undefined); setPreview(null); setNotes(''); setOpen(false); setError(''); setNotice(''); setPeopleError(''); setResourceError(''); setChecking(false); setSubmitting(false); setResourceLoading(false); previewBusy.current = false; submitBusy.current = false; receipt.current = null;
    if (canOperate) {
      void loadPeople();
      let saved: Pending | null = null;
      try { const raw = sessionStorage.getItem(pendingKey); if (raw) { const value = JSON.parse(raw); if (typeof value.requestId === 'string' && value.requestId.length <= 128 && typeof value.body?.fromTeacherId === 'string' && Array.isArray(value.body.assignments) && value.body.assignments.length > 0 && value.body.assignments.length <= 1000 && value.body.assignments.every((item: any) => typeof item?.classId === 'string' && typeof item?.toTeacherId === 'string') && (value.body.notes === undefined || typeof value.body.notes === 'string') && Array.isArray(value.items) && value.items.every((item: any) => typeof item?.classId === 'string' && typeof item?.toTeacherId === 'string' && item.status === 'ready' && Array.isArray(item.conflicts) && typeof item.details?.scheduleCount === 'number' && typeof item.details?.classCount === 'number' && typeof item.details?.studentCount === 'number')) saved = value; } } catch { /* Invalid or blocked browser storage is not authoritative. */ }
      pendingRef.current = saved; setPending(saved);
      if (saved) {
        setFrom(saved.body.fromTeacherId); setAssignments(Object.fromEntries(saved.body.assignments.map(item => [item.classId, item.toTeacherId]))); setSelected(saved.body.assignments.map(item => item.classId));
        setNotes(saved.body.notes || ''); setPreview({ items: saved.items, readyCount: saved.items.length, conflictCount: 0 });
        receipt.current = { fingerprint: JSON.stringify(saved.body), requestId: saved.requestId };
        void loadResources(saved.body.fromTeacherId, true);
      }
    } else { pendingRef.current = null; setPending(null); }
    return () => { active.current = null; sequence.current++; peopleSequence.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, canOperate]);
  const chosen = selected.filter(id => assignments[id]).map(classId => ({ classId, toTeacherId: assignments[classId] }));
  const ready = (preview?.items || []).filter(item => item.status === 'ready');
  const previewByClass = Object.fromEntries((preview?.items || []).map(item => [item.classId, item]));
  async function checkPlan() {
    if (previewBusy.current || submitBusy.current || pendingRef.current || !from || !chosen.length || !canOperate) return;
    const key = session; previewBusy.current = true; setChecking(true); setError(''); setPreview(null);
    try { const r = await api.post('/resource-transfers/preview-batch', { fromTeacherId: from, assignments: chosen, notes: notes.trim() || undefined }); if (valid(key)) setPreview(r.data); }
    catch (e) { if (valid(key)) setError(errorText(e, '交接安排检查失败，请重试')); }
    finally { if (valid(key)) { previewBusy.current = false; setChecking(false); } }
  }
  async function submit() {
    if (submitBusy.current || !canOperate) return;
    const retry = pendingRef.current;
    if (!retry && (!from || !ready.length)) return;
    const key = session;
    const submitted: Assignment[] = retry?.body.assignments || ready.map(item => ({ classId: item.classId, toTeacherId: item.toTeacherId })).sort((a, b) => a.classId.localeCompare(b.classId));
    const body = retry?.body || { fromTeacherId: from!, assignments: submitted, notes: notes.trim() || undefined }, fingerprint = JSON.stringify(body);
    if (!receipt.current || receipt.current.fingerprint !== fingerprint) receipt.current = { fingerprint, requestId: crypto.randomUUID() };
    const record: Pending = retry || { body, requestId: receipt.current.requestId, items: ready };
    rememberPending(record);
    submitBusy.current = true; setSubmitting(true); setError('');
    try { const r = await api.post('/resource-transfers/execute-batch', { ...body, requestId: record.requestId }); if (!valid(key)) return;
      const result: { details: Details; remainingClassCount: number } = r.data, completed = new Set(submitted.map(item => item.classId));
      rememberPending(null);
      setResources(current => current ? { ...current, classes: current.classes.filter(c => !completed.has(c.id)) } : null);
      setSelected(current => current.filter(id => !completed.has(id))); setAssignments(current => Object.fromEntries(Object.entries(current).filter(([id]) => !completed.has(id))));
      setNotice(`已交接 ${result.details.classCount} 个班级，剩余 ${result.remainingClassCount} 个待交接。`); setOpen(false); setPreview(null); setNotes(''); receipt.current = null;
      if (!result.remainingClassCount) { setFrom(undefined); setResources(null); setSelected([]); setAssignments({}); }
      else await loadResources(body.fromTeacherId, true);
      void loadPeople(); window.dispatchEvent(new Event('business-data-changed'));
    } catch (e: any) { if (valid(key)) {
      setError(errorText(e, '交接结果暂未确认，请保持安排不变后重试核对'));
      if (e.response?.status >= 400 && e.response.status < 500) { rememberPending(null); setPreview(null); setOpen(false); receipt.current = null; }
    } }
    finally { if (valid(key)) { submitBusy.current = false; setSubmitting(false); } }
  }
  const options = recipients.filter(p => p.id !== from).map(p => ({ value: p.id, label: p.name }));
  const columns: ColumnsType<ClassRow> = [
    { title: '待交接班级', key: 'class', width: 240, render: (_, row) => <div><strong>{row.name}</strong><div style={{ color: 'var(--tx2)', marginTop: 5 }}>{[row.courseType, row.code].filter(Boolean).join(' · ')} <Tag>{row.status === 'inactive' ? '已停课' : row.status === 'active' ? '开课中' : '已结班'}</Tag></div></div> },
    { title: '在读报名', dataIndex: 'studentCount', width: 100, render: (n: number) => `${n ?? 0} 人次` },
    { title: '接手老师', key: 'recipient', width: 210, render: (_, row) => <Select aria-label={`${row.name}的接手老师`} data-testid={`class-handover-recipient-${row.id}`} value={assignments[row.id]} allowClear showSearch optionFilterProp="label" placeholder="暂未安排" style={{ width: '100%', minWidth: 155 }} options={options} disabled={busy || !selected.includes(row.id)} onChange={value => { setAssignments(current => ({ ...current, [row.id]: value || '' })); clearPlan(); }} /> },
    { title: '交接检查', key: 'check', width: 320, render: (_, row) => {
      const item = previewByClass[row.id];
      if (!selected.includes(row.id)) return <span style={{ color: 'var(--tx2)' }}>本次不交接</span>;
      if (!assignments[row.id]) return <Tag>暂未安排</Tag>;
      if (!item) return <Tag color="processing">待检查</Tag>;
      if (item.status === 'ready') return <div><Tag color="success">可交接</Tag><span style={{ color: 'var(--tx2)' }}>{item.details.scheduleCount} 个未来未完成课次</span></div>;
      return <div><Tag color="error">时间冲突</Tag>{item.conflicts.slice(0, 2).map((c, i) => <div key={i} style={{ color: 'var(--bad)', marginTop: 4 }}>{businessTime(c.startTime)} — {businessTime(c.endTime)}<br />与「{c.conflictingClassName}」重叠</div>)}{item.conflicts.length > 2 && <div style={{ color: 'var(--tx2)' }}>另有 {item.conflicts.length - 2} 处冲突</div>}</div>;
    } },
  ];
  const counts = ready.reduce((all, item) => ({ classCount: all.classCount + item.details.classCount, scheduleCount: all.scheduleCount + item.details.scheduleCount, studentCount: all.studentCount + item.details.studentCount }), { classCount: 0, scheduleCount: 0, studentCount: 0 });
  return <div className="class-handover" data-testid="class-handover">
    <Alert type="info" showIcon message="每个班级可安排不同的接手老师；先交接可用项，未安排或冲突的班级留待下一批。" description="在班学员及待续费名单随班交给新负责老师，未来未完成课程一并交接；历史授课与划课记录保留原老师。不续费及已移出花名册的回访资源可在“沉默学员交接”中单独安排。" style={{ marginBottom: 16 }} />
    {pending && <Alert type="warning" showIcon message="这批交接的结果尚未确认" description="请先核对这批交接，确认前暂不能更改安排。重复核对不会重复交接。" action={<Button data-testid="class-handover-retry" loading={submitting} disabled={checking || submitting} onClick={() => void submit()}>重试并核对结果</Button>} style={{ marginBottom: 16 }} />}
    {notice && <Alert type="success" showIcon message={notice} style={{ marginBottom: 16 }} />}
    {peopleError && <Alert type="error" showIcon message={peopleError} action={<Button onClick={() => void loadPeople()}>重试</Button>} style={{ marginBottom: 16 }} />}
    <Card className="class-handover-card" title="安排班级交接" extra={<span style={{ color: 'var(--tx2)' }}>时间均为北京时间</span>}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: '1 1 260px', minWidth: 0, maxWidth: 'min(100%, 420px)' }}><label htmlFor="class-handover-from" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>待交接老师</label><Select id="class-handover-from" aria-label="待交接老师" showSearch optionFilterProp="label" value={from} placeholder="选择老师查看负责班级" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }} loading={peopleLoading} disabled={!canOperate || busy || peopleLoading || !!peopleError} options={sources.map(p => ({ value: p.id, label: p.name }))} notFoundContent="暂无老师" onChange={id => { setFrom(id); setBulkTeacher(undefined); setNotice(''); clearPlan(); receipt.current = null; void loadResources(id); }} /></div>
        <Button disabled={busy || peopleLoading} onClick={() => { void loadPeople(); if (from) { clearPlan(); void loadResources(from, true); } }}>刷新资源</Button>
      </div>
      {resourceError && <Alert type="error" showIcon message={resourceError} action={<Button onClick={() => from && void loadResources(from, true)}>刷新重试</Button>} style={{ marginBottom: 16 }} />}
      {error && !open && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {resources && <><div className="resource-transfer-stats"><Statistic title="待交接班级" value={resources.classes.length} suffix="个" /><Statistic title="班内在读报名" value={resources.summary.studentCount} suffix="人次" /><Statistic title="未来待上课" value={resources.summary.upcomingScheduleCount} suffix="课次" /></div>
      <Space className="class-handover-bulk" wrap style={{ marginBottom: 16 }}><Select aria-label="批量指定接手老师" style={{ width: 230, maxWidth: '100%', minWidth: 0 }} placeholder="批量指定接手老师" value={bulkTeacher} showSearch allowClear optionFilterProp="label" options={options} disabled={busy || !selected.length} onChange={setBulkTeacher} /><Button disabled={busy || !selected.length || !bulkTeacher} onClick={() => { if (!bulkTeacher) return; setAssignments(current => ({ ...current, ...Object.fromEntries(selected.map(id => [id, bulkTeacher])) })); clearPlan(); }}>应用到已选 {selected.length} 个班级</Button><span style={{ color: 'var(--tx2)' }}>也可在每行单独选择接手老师</span></Space></>}
      <Table<ClassRow> data-testid="class-handover-table" rowKey="id" columns={columns} loading={resourceLoading} dataSource={resources?.classes || []} pagination={false} size="small" scroll={{ x: 920 }} rowSelection={resources ? { selectedRowKeys: selected, getCheckboxProps: () => ({ disabled: busy }), onChange: keys => { setSelected(keys as string[]); clearPlan(); } } : undefined} locale={{ emptyText: <Empty description={from ? '暂无待交接班级' : '请先选择待交接老师'} /> }} />
      {resources && <><div className="class-handover-actions" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 24 }}><Space wrap><Tag color="success">可交接 {ready.length} 个</Tag><Tag color={preview?.conflictCount ? 'error' : 'default'}>冲突 {preview?.conflictCount ?? 0} 个</Tag><Tag>未安排 {selected.filter(id => !assignments[id]).length} 个</Tag><span style={{ color: 'var(--tx2)' }}>已选 {selected.length} / {resources.classes.length} 个班级</span></Space><Space wrap><Button data-testid="class-handover-preview" loading={checking} disabled={!chosen.length || busy || !!resourceError || !!peopleError} onClick={() => void checkPlan()}>检查交接安排</Button><Button data-testid="class-handover-confirm" type="primary" disabled={!ready.length || busy || !!resourceError || !!peopleError} onClick={() => { setError(''); setOpen(true); }}>交接 {ready.length} 个可交接班级</Button></Space></div>
      {preview && <p style={{ color: 'var(--tx2)', margin: '16px 0 0' }}>本次只提交已检查通过的 {ready.length} 个班级，冲突、未安排及未勾选项均保留。确认时将再次检查最新课表。</p>}
      <Collapse style={{ marginTop: 24 }} items={[{ key: 'schedules', label: `查看原老师最近排课记录（共 ${resources.summary.totalScheduleCount} 条，最多展示50条）`, children: <Table<ScheduleRow> rowKey="id" size="small" dataSource={resources.schedules} pagination={{ pageSize: 10 }} scroll={{ x: 620 }} columns={[{ title: '班级', key: 'class', render: (_, row) => row.class?.name || '—' }, { title: '上课时间', dataIndex: 'startTime', render: businessTime }, { title: '状态', dataIndex: 'status', render: (v: string) => statusText[v] || v }]} /> }]} /></>}
    </Card>
    <Modal title="确认班级交接" open={open} width={760} onCancel={() => { if (!submitBusy.current) setOpen(false); }} onOk={() => void submit()} confirmLoading={submitting} okText="确认交接" cancelText="取消" cancelButtonProps={{ disabled: submitting }} maskClosable={!submitting} keyboard={!submitting}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}<Alert type="info" showIcon message={`本次交接 ${counts.classCount} 个班级、${counts.scheduleCount} 个未来未完成课次，涉及 ${counts.studentCount} 在读报名人次。`} description="下列班级的在班学员及待续费责任同步交接；未安排和冲突班级继续保留在原老师名下。" style={{ marginBottom: 16 }} />
      <Table<PreviewItem> rowKey="classId" size="small" pagination={false} dataSource={ready} scroll={{ x: 560 }} columns={[{ title: '班级', dataIndex: 'className' }, { title: '接手老师', dataIndex: 'toTeacherName' }, { title: '未来未完成课次', key: 'count', render: (_, row) => row.details.scheduleCount }]} />
      <label htmlFor="class-handover-notes" style={{ display: 'block', margin: '20px 0 8px', fontWeight: 600 }}>交接备注（选填）</label><Input.TextArea id="class-handover-notes" rows={3} maxLength={2000} showCount value={notes} disabled={submitting || !!pending} onChange={event => setNotes(event.target.value)} placeholder="补充需要提醒接手老师的事项" />
    </Modal>
  </div>;
}
