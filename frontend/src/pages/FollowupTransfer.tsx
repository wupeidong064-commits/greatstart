import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Select, Space, Statistic, Table, Tag } from 'antd';
import type { SelectProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Modal } from '../components/overlays';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import './FollowupTransfer.css';

type Kind = 'lead' | 'experience' | 'student';
type Person = { id: string; name: string; role: string; jobRole?: string | null; isActive?: boolean };
type SourceItem = { id: string; customerName?: string; studentName?: string; name?: string; contact?: string; phone?: string; status?: string; scheduleDate?: string; renewalStatus?: string; resourceLabel?: string; ownerName?: string; sourceClasses?: string[] };
type Resource = { key: string; kind: Kind; resourceId: string; name: string; contact: string; status: string; scheduleDate?: string; renewalStatus?: string; resourceLabel?: string; ownerName?: string; sourceClasses?: string[] };
type Assignment = { kind: Kind; resourceId: string; toUserId: string };
type PreviewItem = { kind: Kind; resourceId: string; name: string; contact: string; status: 'ready' | 'unavailable'; reason?: string; toUserId: string; toUserName: string };
type Counts = { leads: number; experiences: number; students: number; total: number };
type Preview = { items: PreviewItem[]; readyCount: number; unavailableCount: number; remainingCounts: Counts };
type Body = { fromUserId: string; assignments: Assignment[]; notes?: string };
type Pending = { body: Body; requestId: string; items: PreviewItem[] };
type SubmitResult = { details: { leadCount: number; experienceCount: number; studentCount: number; total: number }; remainingCounts: Counts };
const kindNames: Record<Kind, string> = { lead: '鱼池线索', experience: '体验课', student: '沉默学员' };
const roleNames: Record<string, string> = { coach: '老师', teacher: '老师', sales: '销售', staff: '员工', manager: '管理员', admin: '管理员' };
const statusNames: Record<string, string> = { new: '待跟进', contacted: '已联系', visited: '已到访', pending: '待上课', completed: '已上课', unconverted: '未成单', noshow: '未到场', 'no-show': '未到场', active: '在读', converted: '已成单', lost: '已流失', cancelled: '已取消' };
const dormantCategory = (row: Resource) => row.resourceLabel === '已召回待入班' ? 'recalled' : row.status === 'lost' ? 'lost' : 'no_renewal';
const resourceKey = (item: { kind: Kind; resourceId: string }) => `${item.kind}:${item.resourceId}`;
const errorText = (e: any, fallback: string) => e.response?.data?.error?.message || e.response?.data?.message || e.message || fallback;
const sessionIdentity = () => { const s = useAuthStore.getState(); return JSON.stringify([s.token, s.user?.id, s.user?.organizationId, s.user?.campusId, s.user?.managementLevel, s.user?.isPlatformAdmin]); };
const emptyCounts = (): Counts => ({ leads: 0, experiences: 0, students: 0, total: 0 });
const countResources = (items: { kind: Kind }[]) => items.reduce((counts, item) => { counts[item.kind === 'lead' ? 'leads' : item.kind === 'experience' ? 'experiences' : 'students']++; counts.total++; return counts; }, emptyCounts());
const dateText = (value?: string) => {
  if (!value) return '未安排日期';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(+date) ? date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : value;
};
const flatten = (data: { leads?: SourceItem[]; experiences?: SourceItem[]; students?: SourceItem[] }, kinds: Kind[]): Resource[] =>
  kinds.flatMap(kind => (data[kind === 'lead' ? 'leads' : kind === 'experience' ? 'experiences' : 'students'] || []).map(item => ({ key: `${kind}:${item.id}`, kind, resourceId: item.id, name: item.customerName || item.studentName || item.name || '未填写姓名', contact: item.contact || item.phone || '—', status: item.status || '', scheduleDate: item.scheduleDate, renewalStatus: item.renewalStatus, resourceLabel: item.resourceLabel, ownerName: item.ownerName, sourceClasses: item.sourceClasses })));
const isPending = (value: any): value is Pending => typeof value?.requestId === 'string' && value.requestId.length > 0 && value.requestId.length <= 128 && typeof value.body?.fromUserId === 'string' && Array.isArray(value.body.assignments) && value.body.assignments.length > 0 && value.body.assignments.length <= 1000 && value.body.assignments.every((item: any) => ['lead', 'experience', 'student'].includes(item?.kind) && typeof item.resourceId === 'string' && typeof item.toUserId === 'string') && (value.body.notes === undefined || (typeof value.body.notes === 'string' && value.body.notes.length <= 2000)) && Array.isArray(value.items) && value.items.length === value.body.assignments.length && value.items.every((item: any) => ['lead', 'experience', 'student'].includes(item?.kind) && typeof item.resourceId === 'string' && typeof item.name === 'string' && typeof item.toUserId === 'string' && typeof item.toUserName === 'string' && item.status === 'ready');

export default function FollowupTransfer({ mode = 'marketing' }: { mode?: 'marketing' | 'dormant' }) {
  const dormant = mode === 'dormant';
  const endpoint = `/resource-transfers/${dormant ? 'dormant' : 'followup'}`;
  const testPrefix = dormant ? 'dormant-handover' : 'followup-handover';
  const resourceKinds: Kind[] = dormant ? ['student'] : ['lead', 'experience'];
  const { user, token } = useAuthStore();
  const session = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.managementLevel, user?.isPlatformAdmin]);
  const active = useRef<string | null>(session); active.current = session;
  const valid = (key: string) => active.current === key && sessionIdentity() === key;
  const canOperate = !!user && !user.isPlatformAdmin && (['super', 'manager'].includes(user.managementLevel || '') || (user.managementLevel === undefined && ['admin', 'manager'].includes(user.role)));
  const [sources, setSources] = useState<Person[]>([]), [recipients, setRecipients] = useState<Person[]>([]), [inactiveSources, setInactiveSources] = useState<Person[]>([]);
  const [from, setFrom] = useState<string>(), [data, setData] = useState<Resource[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [assignments, setAssignments] = useState<Record<string, string>>({});
  const [bulkUser, setBulkUser] = useState<string>(), [filter, setFilter] = useState<Kind | 'all' | 'no_renewal' | 'lost' | 'recalled'>('all');
  const [preview, setPreview] = useState<Preview | null>(null), [notes, setNotes] = useState(''), [open, setOpen] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false), [dataLoading, setDataLoading] = useState(false);
  const [checking, setChecking] = useState(false), [submitting, setSubmitting] = useState(false);
  const [peopleError, setPeopleError] = useState(''), [dataError, setDataError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [legacyWarning, setLegacyWarning] = useState('');
  const [pending, setPending] = useState<Pending | null>(null), pendingRef = useRef<Pending | null>(null);
  const personSeq = useRef(0), dataSeq = useRef(0), previewBusy = useRef(false), submitBusy = useRef(false);
  const receipt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const pendingKey = `buzzer-${dormant ? 'dormant' : 'followup'}-handover-pending:${user?.id}:${user?.organizationId}:${user?.campusId}`;
  const busy = checking || submitting || !!pending;
  const clearPreview = () => { setPreview(null); setOpen(false); setError(''); };
  const rememberPending = (value: Pending | null) => { pendingRef.current = value; setPending(value); try { if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value)); else sessionStorage.removeItem(pendingKey); } catch { /* The in-memory receipt still preserves same-request retries. */ } };

  async function loadPeople() {
    const id = ++personSeq.current, key = session; setPeopleLoading(true); setPeopleError('');
    try {
      const r = await api.get(`${endpoint}/candidates`);
      if (!valid(key) || id !== personSeq.current) return;
      setSources((r.data.sources || []).filter((person: Person) => person.isActive !== false));
      setInactiveSources(dormant ? (r.data.inactiveSources || []).filter((person: Person) => person.isActive === false) : []);
      setRecipients((r.data.recipients || []).filter((person: Person) => person.isActive !== false));
    } catch (e) { if (valid(key) && id === personSeq.current) { setSources([]); setRecipients([]); setInactiveSources([]); setPeopleError(errorText(e, '人员列表加载失败，请重试')); } }
    finally { if (valid(key) && id === personSeq.current) setPeopleLoading(false); }
  }
  async function loadData(personId: string, preserve = false) {
    const id = ++dataSeq.current, key = session; setDataLoading(true); setDataError('');
    if (!preserve) { setData(null); setSelected([]); setAssignments({}); }
    try {
      const r = await api.get(`${endpoint}/${encodeURIComponent(personId)}`);
      if (!valid(key) || id !== dataSeq.current) return;
      const rows = flatten(r.data, resourceKinds), remaining = new Set(rows.map(row => row.key)); setData(rows);
      if (preserve) { setSelected(current => current.filter(key => remaining.has(key))); setAssignments(current => Object.fromEntries(Object.entries(current).filter(([key]) => remaining.has(key)))); }
      else setSelected(rows.map(row => row.key));
    } catch (e) { if (valid(key) && id === dataSeq.current) setDataError(errorText(e, preserve ? '剩余跟进资源刷新失败，请重试' : '跟进资源加载失败，请重试')); }
    finally { if (valid(key) && id === dataSeq.current) setDataLoading(false); }
  }
  useEffect(() => {
    active.current = session; setSources([]); setRecipients([]); setInactiveSources([]); setLegacyWarning(''); setFrom(undefined); setData(null); setSelected([]); setAssignments({}); setBulkUser(undefined); setFilter('all'); setPreview(null); setNotes(''); setOpen(false); setError(''); setNotice(''); setPeopleError(''); setDataError(''); setChecking(false); setSubmitting(false); setDataLoading(false); previewBusy.current = false; submitBusy.current = false; receipt.current = null;
    if (canOperate) {
      void loadPeople(); let saved: Pending | null = null;
      try {
        const raw = sessionStorage.getItem(pendingKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (isPending(parsed) && parsed.body.assignments.every(item => resourceKinds.includes(item.kind))) saved = parsed;
          else if (!dormant && isPending(parsed) && parsed.body.assignments.some(item => item.kind === 'student')) {
            // Preserve the old receipt for manual history reconciliation; never
            // replay the former sales-to-student assignment under new rules.
            sessionStorage.setItem(`${pendingKey}:legacy-student-plan`, raw);
            sessionStorage.removeItem(pendingKey);
            setLegacyWarning('此前保存的交接安排包含学员跟进，已不适用当前规则。旧安排已保留，请先在交接历史核对结果；在班学员随班级交接，沉默学员请到专用页面安排。');
          } else sessionStorage.removeItem(pendingKey);
        }
        if (!dormant && sessionStorage.getItem(`${pendingKey}:legacy-student-plan`)) setLegacyWarning('有一份旧版学员跟进交接安排待人工核对，系统不会再次提交。请先查看交接历史，再按班级交接或沉默学员交接处理。');
      } catch { /* Unavailable browser storage does not authorize any action. */ }
      pendingRef.current = saved; setPending(saved);
      if (saved) {
        setFrom(saved.body.fromUserId); setAssignments(Object.fromEntries(saved.body.assignments.map(item => [resourceKey(item), item.toUserId]))); setSelected(saved.body.assignments.map(resourceKey)); setNotes(saved.body.notes || '');
        setPreview({ items: saved.items, readyCount: saved.items.length, unavailableCount: 0, remainingCounts: emptyCounts() });
        receipt.current = { fingerprint: JSON.stringify(saved.body), requestId: saved.requestId };
        void loadData(saved.body.fromUserId, true);
      }
    } else { pendingRef.current = null; setPending(null); }
    return () => { active.current = null; personSeq.current++; dataSeq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, canOperate, mode]);

  const chosen: Assignment[] = (data || []).filter(row => selected.includes(row.key) && assignments[row.key]).map(row => ({ kind: row.kind, resourceId: row.resourceId, toUserId: assignments[row.key] }));
  const ready = (preview?.items || []).filter(item => item.status === 'ready');
  const byKey = Object.fromEntries((preview?.items || []).map(item => [resourceKey(item), item]));
  async function checkPlan() {
    if (!canOperate || !from || !chosen.length || previewBusy.current || submitBusy.current || pendingRef.current) return;
    const key = session; previewBusy.current = true; setChecking(true); setError(''); setPreview(null);
    try { const r = await api.post(`${endpoint}/preview-batch`, { fromUserId: from, assignments: chosen, notes: notes.trim() || undefined }); if (valid(key)) setPreview(r.data); }
    catch (e) { if (valid(key)) setError(errorText(e, '跟进交接安排检查失败，请重试')); }
    finally { if (valid(key)) { previewBusy.current = false; setChecking(false); } }
  }
  async function submit() {
    if (submitBusy.current || !canOperate) return;
    const retry = pendingRef.current;
    if (!retry && (!from || !ready.length)) return;
    const key = session;
    const submitted = retry?.body.assignments || ready.map(item => ({ kind: item.kind, resourceId: item.resourceId, toUserId: item.toUserId })).sort((a, b) => resourceKey(a).localeCompare(resourceKey(b)));
    const body: Body = retry?.body || { fromUserId: from!, assignments: submitted, notes: notes.trim() || undefined }, fingerprint = JSON.stringify(body);
    if (!receipt.current || receipt.current.fingerprint !== fingerprint) receipt.current = { fingerprint, requestId: crypto.randomUUID() };
    const record = retry || { body, requestId: receipt.current.requestId, items: ready };
    rememberPending(record); submitBusy.current = true; setSubmitting(true); setError('');
    try {
      const r = await api.post(`${endpoint}/execute-batch`, { ...body, requestId: record.requestId });
      if (!valid(key)) return;
      const result: SubmitResult = r.data, completed = new Set(submitted.map(resourceKey));
      rememberPending(null); setData(current => current ? current.filter(row => !completed.has(row.key)) : null);
      setSelected(current => current.filter(id => !completed.has(id))); setAssignments(current => Object.fromEntries(Object.entries(current).filter(([id]) => !completed.has(id))));
      setNotice(dormant ? `本批已移交 ${result.details.studentCount} 名沉默学员的回访责任；剩余 ${result.remainingCounts.total} 人待安排。` : `本批交接完成：鱼池线索 ${result.details.leadCount} 条、体验课 ${result.details.experienceCount} 条（共 ${result.details.total} 项）；剩余 ${result.remainingCounts.total} 项待交接。`);
      setOpen(false); setPreview(null); setNotes(''); receipt.current = null;
      await loadData(body.fromUserId, true); void loadPeople(); window.dispatchEvent(new Event('business-data-changed'));
    } catch (e: any) {
      if (valid(key)) {
        setError(errorText(e, '交接结果暂未确认，请保持安排不变后重试核对'));
        if (e.response?.status >= 400 && e.response.status < 500) { rememberPending(null); setPreview(null); setOpen(false); receipt.current = null; }
      }
    } finally { if (valid(key)) { submitBusy.current = false; setSubmitting(false); } }
  }
  const personOptions = (items: Person[]) => items.map(person => ({ value: person.id, label: person.id === 'unassigned' ? person.name : `${person.name}${person.isActive === false ? ' · 已停用' : ''}（${person.jobRole === null ? '岗位待确认' : roleNames[person.jobRole || person.role] || '工作人员'}）` }));
  const sourceOptions: SelectProps<string>['options'] = dormant ? [
    ...(sources.some(person => person.id === 'unassigned') ? [{ label: '需要安排', options: personOptions(sources.filter(person => person.id === 'unassigned')) }] : []),
    { label: '在职老师', options: personOptions(sources.filter(person => person.id !== 'unassigned')) },
    ...(inactiveSources.length ? [{ label: '已停用老师的遗留资源', options: personOptions(inactiveSources) }] : []),
  ] : personOptions(sources);
  const recipientOptions = personOptions(recipients.filter(person => person.id !== from));
  const counts = countResources(data || []), readyCounts = countResources(ready);
  const visibleRows = (data || []).filter(row => filter === 'all' || (dormant ? dormantCategory(row) === filter : row.kind === filter));
  const columns: ColumnsType<Resource> = [
    { title: '待交接资源', key: 'resource', width: 220, render: (_, row) => <div><strong>{row.name}</strong><div style={{ color: 'var(--tx2)', marginTop: 5 }}><Tag>{row.resourceLabel || kindNames[row.kind]}</Tag><span>{row.contact}</span></div></div> },
    { title: '当前状态 / 日期', key: 'status', width: 125, render: (_, row) => <div>{dormant ? row.resourceLabel || (row.status === 'lost' ? '已移出花名册' : '不续费') : statusNames[row.status] || row.status || '—'}{dormant && <div style={{ color: 'var(--tx2)', marginTop: 5 }}>{row.sourceClasses?.length ? `原班级：${row.sourceClasses.join('、')}` : '暂无原班级记录'}<br />回访老师：{row.ownerName || '待分配'}</div>}{row.kind === 'experience' && <div style={{ color: 'var(--tx2)', marginTop: 5 }}>{dateText(row.scheduleDate)}</div>}</div> },
    { title: '接手人员', key: 'recipient', width: 205, render: (_, row) => <Select aria-label={`${kindNames[row.kind]}${row.name}的接手人员`} data-testid={`${testPrefix}-recipient-${row.kind}-${row.resourceId}`} value={assignments[row.key]} allowClear showSearch optionFilterProp="label" placeholder="暂未安排" style={{ width: '100%', minWidth: 0 }} options={recipientOptions} disabled={busy || !selected.includes(row.key)} onChange={id => { setAssignments(current => ({ ...current, [row.key]: id || '' })); clearPreview(); }} /> },
    { title: '交接检查', key: 'check', width: 210, render: (_, row) => {
      if (!selected.includes(row.key)) return <span style={{ color: 'var(--tx2)' }}>本次不交接</span>;
      if (!assignments[row.key]) return <Tag>暂未安排</Tag>;
      const item = byKey[row.key]; if (!item) return <Tag color="processing">待检查</Tag>;
      return item.status === 'ready' ? <Tag color="success">可交接</Tag> : <div><Tag color="error">暂不可交接</Tag><div style={{ color: 'var(--bad)', marginTop: 5 }}>{item.reason || '资源或接手人员已变化，请刷新后重新安排'}</div></div>;
    } },
  ];

  return <div className="followup-handover" data-testid={testPrefix}>
    <Alert type="info" showIcon message={dormant ? "为不续费、已移出花名册及已召回待入班的学员安排回访老师，可逐人或分批交接。" : "每条鱼池线索和体验课可分配给不同人员，先交接已安排的可用项。"} description={dormant ? "仅移交回访责任，保留原状态、班级历史、课时及成单归属；不会自动恢复入班或续费。在班学员的日常责任随班级交接。" : "销售交接不包含在班学员和续费名单。老师及在班学员请使用班级交接，历史成单销售归属保持不变。"} style={{ marginBottom: 16 }} />
    {legacyWarning && <Alert type="warning" showIcon message="旧版交接安排需要核对" description={legacyWarning} style={{ marginBottom: 16 }} />}
    {pending && <Alert type="warning" showIcon message="这批跟进交接的结果尚未确认" description="确认前暂不能更改安排，请使用同一次交接核对结果，重复核对不会重复交接。" action={<Button data-testid={`${testPrefix}-retry`} loading={submitting} disabled={checking || submitting} onClick={() => void submit()}>重试并核对结果</Button>} style={{ marginBottom: 16 }} />}
    {notice && <Alert type="success" showIcon message={notice} style={{ marginBottom: 16 }} />}
    {peopleError && <Alert type="error" showIcon message={peopleError} action={<Button onClick={() => void loadPeople()}>重试</Button>} style={{ marginBottom: 16 }} />}
    <Card className="followup-handover-card" title={dormant ? "安排沉默学员回访交接" : "安排线索与体验课交接"} extra={<span style={{ color: 'var(--tx2)' }}>{dormant ? '仅移交回访责任' : '仅移交销售跟进'}</span>}>
      <div className="followup-handover-source">
        <div><label htmlFor={`${testPrefix}-from`}>{dormant ? '原回访老师 / 待分配资源' : '待交接人员'}</label><Select id={`${testPrefix}-from`} aria-label={dormant ? '原回访老师 / 待分配资源' : '待交接人员'} showSearch optionFilterProp="label" value={from} placeholder="选择人员查看负责资源" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }} options={sourceOptions} loading={peopleLoading} disabled={!canOperate || busy || peopleLoading || !!peopleError} notFoundContent={dormant ? "暂无待交接老师或资源" : "暂无工作人员"} onChange={id => { setFrom(id); setBulkUser(undefined); setFilter('all'); setNotice(''); clearPreview(); receipt.current = null; void loadData(id); }} /></div>
        <Button disabled={busy || peopleLoading} onClick={() => { void loadPeople(); if (from) { clearPreview(); void loadData(from, true); } }}>刷新资源</Button>
      </div>
      {dataError && <Alert type="error" showIcon message={dataError} action={<Button onClick={() => from && void loadData(from, true)}>刷新重试</Button>} style={{ marginBottom: 16 }} />}
      {error && !open && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      {data && <>
        <div className="resource-transfer-stats">{dormant ? <><Statistic title="沉默学员" value={counts.students} suffix="人" /><Statistic title="不续费" value={(data || []).filter(row => dormantCategory(row) === 'no_renewal').length} suffix="人" /><Statistic title="已移出花名册" value={(data || []).filter(row => dormantCategory(row) === 'lost').length} suffix="人" /><Statistic title="已召回待入班" value={(data || []).filter(row => dormantCategory(row) === 'recalled').length} suffix="人" /></> : <><Statistic title="鱼池线索" value={counts.leads} suffix="条" /><Statistic title="体验课" value={counts.experiences} suffix="条" /></>}</div>
        <Space className="followup-handover-bulk" wrap style={{ marginBottom: 16 }}>
          <Select aria-label="筛选资源类型" style={{ width: 170, maxWidth: '100%', minWidth: 0 }} value={filter} disabled={busy} options={dormant ? [{ value: 'all', label: '全部沉默学员' }, { value: 'no_renewal', label: '不续费' }, { value: 'lost', label: '已移出花名册' }, { value: 'recalled', label: '已召回待入班' }] : [{ value: 'all', label: '全部资源' }, ...resourceKinds.map(kind => ({ value: kind, label: kindNames[kind] }))]} onChange={setFilter} />
          <Select aria-label="批量指定接手人员" style={{ width: 250, maxWidth: '100%', minWidth: 0 }} value={bulkUser} placeholder="批量指定接手人员" showSearch allowClear optionFilterProp="label" options={recipientOptions} disabled={busy || !selected.length} onChange={setBulkUser} />
          <Button disabled={busy || !selected.length || !bulkUser} onClick={() => { if (!bulkUser) return; setAssignments(current => ({ ...current, ...Object.fromEntries(selected.map(key => [key, bulkUser])) })); clearPreview(); }}>应用到全部已选 {selected.length} 条</Button>
        </Space>
        <p style={{ color: 'var(--tx2)', margin: '0 0 16px' }}>切换资源类型会保留其他类型的勾选及安排；批量指定会应用到全部已选资源。</p>
      </>}
      <Table<Resource> data-testid={`${testPrefix}-table`} rowKey="key" size="small" tableLayout="fixed" dataSource={visibleRows} columns={columns} loading={dataLoading} scroll={{ x: 800 }} pagination={false} rowSelection={data ? { selectedRowKeys: selected, preserveSelectedRowKeys: true, getCheckboxProps: () => ({ disabled: busy }), onChange: keys => { setSelected(keys as string[]); clearPreview(); } } : undefined} locale={{ emptyText: <Empty description={from ? '该人员暂无待交接跟进资源' : '请先选择待交接人员'} /> }} />
      {data && <>
        <div className="followup-handover-actions"><Space wrap><Tag color="success">可交接 {ready.length} 条</Tag><Tag color={preview?.unavailableCount ? 'error' : 'default'}>暂不可交接 {preview?.unavailableCount ?? 0} 条</Tag><Tag>未安排 {selected.filter(key => !assignments[key]).length} 条</Tag><span style={{ color: 'var(--tx2)' }}>已选 {selected.length} / {data.length} 条</span></Space><Space wrap><Button data-testid={`${testPrefix}-preview`} loading={checking} disabled={!chosen.length || busy || !!dataError || !!peopleError} onClick={() => void checkPlan()}>检查交接安排</Button><Button data-testid={`${testPrefix}-confirm`} type="primary" disabled={!ready.length || busy || !!dataError || !!peopleError} onClick={() => { setError(''); setOpen(true); }}>交接 {ready.length} 条可用资源</Button></Space></div>
        {preview && <p style={{ color: 'var(--tx2)', margin: '16px 0 0' }}>本次只交接已检查通过的 {ready.length} 条资源；未安排、未勾选和暂不可交接项保留。确认时将再次核对最新负责人及状态。</p>}
      </>}
    </Card>
    <Modal title={dormant ? "确认沉默学员交接" : "确认线索与体验课交接"} open={open} width={820} onCancel={() => { if (!submitBusy.current) setOpen(false); }} onOk={() => void submit()} confirmLoading={submitting} okText="确认交接" cancelText="取消" cancelButtonProps={{ disabled: submitting }} maskClosable={!submitting} keyboard={!submitting}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Alert type="info" showIcon message={dormant ? `本次移交 ${readyCounts.students} 名学员的回访责任。` : `本次交接鱼池 ${readyCounts.leads} 条、体验课 ${readyCounts.experiences} 条。`} description={dormant ? "只移交下列学员的回访责任，不恢复学员状态、不调整课时、不改写历史成单。" : "仅交接下列可用项；授课安排和历史成单销售归属保持不变。"} style={{ marginBottom: 16 }} />
      <Table<PreviewItem> rowKey={resourceKey} size="small" dataSource={ready} pagination={false} scroll={{ x: 620 }} columns={[{ title: '类型', dataIndex: 'kind', render: (kind: Kind) => kindNames[kind] }, { title: '姓名', dataIndex: 'name' }, { title: '联系电话', dataIndex: 'contact' }, { title: '接手人员', dataIndex: 'toUserName' }]} />
      <label htmlFor={`${testPrefix}-notes`} style={{ display: 'block', margin: '20px 0 8px', fontWeight: 600 }}>交接备注（选填）</label><Input.TextArea id={`${testPrefix}-notes`} rows={3} maxLength={2000} showCount value={notes} disabled={submitting || !!pending} onChange={event => setNotes(event.target.value)} placeholder="补充需要提醒接手人员的跟进事项" />
    </Modal>
  </div>;
}
