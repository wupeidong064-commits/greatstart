import { Drawer, Modal } from '../components/overlays';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Input, message, Space, Table, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../services/api';

const reasons: Record<string, string> = { no_renewal: '确定不续费', no_recall: '不再召回', other: '其他' };
const statuses: Record<string, string> = { active: '活跃', inactive: '非活跃', lost: '流失', graduated: '已毕业', refunded: '已退费' };
const date = (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';

export default function ArchivedStudents() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const historyRequest = useRef(0);
  const [history, setHistory] = useState<{ enrollments: any[]; logs: any[]; error: string; loading: boolean }>({ enrollments: [], logs: [], error: '', loading: false });
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api.get('/students', { params: { status: 'archived', page: pagination.current, pageSize: pagination.pageSize, search: search || undefined } });
      if (!result.data?.length && pagination.current > 1 && result.pagination?.total) {
        setPagination(prev => ({ ...prev, current: Math.ceil(result.pagination!.total / prev.pageSize) }));
        return;
      }
      setRows(result.data || []);
      setPagination(prev => ({ ...prev, total: result.pagination?.total || 0 }));
    } catch (e: any) { setRows([]); setError(e.response?.data?.error?.message || '归档列表加载失败，请重试'); }
    finally { setLoading(false); }
  }, [pagination.current, pagination.pageSize, search]);
  useEffect(() => { void load(); }, [load]);
  const openDetail = async (row: any) => {
    const request = ++historyRequest.current;
    setDetail(row); setHistory({ enrollments: [], logs: [], error: '', loading: true });
    try {
      const [enrollments, logs] = await Promise.all([
        api.get('/enrollments', { params: { studentId: row.id, pageSize: 10 } }),
        api.get('/lesson-logs', { params: { studentId: row.id, pageSize: 10 } }),
      ]);
      if (request === historyRequest.current) setHistory({ enrollments: enrollments.data || [], logs: logs.data || [], error: '', loading: false });
    } catch (e: any) { if (request === historyRequest.current) setHistory({ enrollments: [], logs: [], error: e.response?.data?.error?.message || '历史记录加载失败，请重试', loading: false }); }
  };
  const restore = (row: any) => Modal.confirm({
    title: `恢复「${row.name}」的档案？`, content: '恢复后回到归档前的状态。历史班级不会自动恢复，如需上课请重新安排班级。', okText: '确认恢复', cancelText: '取消',
    onOk: async () => {
      try { await api.post(`/students/${row.id}/restore`); message.success('档案已恢复'); setDetail(null); await load(); }
      catch (e: any) { message.error(e.response?.data?.error?.message || '恢复失败，请重试'); throw e; }
    },
  });
  return <div>
    <div className="biz-page-head" style={{ marginBottom: 20 }}>
      <div className="biz-head-copy"><h1>已归档学员</h1><p>留存不再续费或召回的档案，需要时可以恢复。</p></div>
      <Button onClick={() => navigate('/students')}>返回学员管理</Button>
    </div>
    <Alert type="info" showIcon message="归档不会删除学员、课时和历史记录。恢复后，历史班级不会自动重新加入。" style={{ marginBottom: 16 }} />
    <div style={{ background: 'var(--card2)', padding: 16, borderRadius: 8, marginBottom: 16 }}><Space wrap>
      <Input.Search placeholder="搜索姓名、电话或家长" value={keyword} allowClear enterButton="搜索" style={{ width: 300 }}
        onChange={e => setKeyword(e.target.value)} onSearch={value => { setSearch(value.trim()); setPagination(prev => ({ ...prev, current: 1 })); }} />
      <Button onClick={() => { setKeyword(''); setSearch(''); setPagination(prev => ({ ...prev, current: 1 })); }}>重置</Button>
    </Space></div>
    {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={load}>重试</Button>} style={{ marginBottom: 16 }} />}
    <Table rowKey="id" dataSource={rows} loading={loading} scroll={{ x: 900 }} locale={{ emptyText: error ? '无法加载归档列表' : '暂无已归档学员' }}
      pagination={{ ...pagination, onChange: (current, pageSize) => setPagination(prev => ({ ...prev, current, pageSize })) }} columns={[
        { title: '学员姓名', dataIndex: 'name', key: 'name', render: (name: string, row: any) => <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(row)}>{name}</Button> },
        { title: '家长电话', key: 'phone', render: (_: any, row: any) => row.parentPhone || row.phone || '—' },
        { title: '剩余课时', dataIndex: 'remainingLessons', key: 'remainingLessons', render: (n: number) => `${n ?? 0} 节` },
        { title: '归档原因', dataIndex: 'archiveReason', key: 'archiveReason', render: (value: string) => <Tag>{reasons[value] || value || '—'}</Tag> },
        { title: '归档时间', dataIndex: 'archivedAt', key: 'archivedAt', render: date },
        { title: '操作', key: 'action', render: (_: any, row: any) => <Space><Button type="link" onClick={() => openDetail(row)}>查看档案</Button><Button type="link" onClick={() => restore(row)}>恢复</Button></Space> },
      ]} />
    <Drawer title="归档学员档案" open={!!detail} width={520} onClose={() => { historyRequest.current++; setDetail(null); }}>
      {detail && <>
        <Descriptions column={1} size="small" bordered items={[
          { key: 'name', label: '学员', children: detail.name },
          { key: 'phone', label: '家长电话', children: detail.parentPhone || detail.phone || '—' },
          { key: 'lesson', label: '剩余课时', children: `${detail.remainingLessons ?? 0} 节` },
          { key: 'status', label: '归档前状态', children: statuses[detail.archivePreviousStatus] || detail.archivePreviousStatus || '—' },
          { key: 'reason', label: '归档原因', children: reasons[detail.archiveReason] || detail.archiveReason || '—' },
          { key: 'note', label: '备注', children: detail.archiveNote || '—' },
          { key: 'at', label: '归档时间', children: date(detail.archivedAt) },
        ]} />
        {history.error && <Alert type="error" message={history.error} showIcon action={<Button size="small" onClick={() => openDetail(detail)}>重试</Button>} style={{ marginTop: 16 }} />}
        <Typography.Title level={5} style={{ marginTop: 24 }}>历史班级 <Typography.Text type="secondary">（最近 10 条）</Typography.Text></Typography.Title>
        <Table size="small" rowKey="id" pagination={false} loading={history.loading} dataSource={history.enrollments} columns={[
          { title: '班级', key: 'class', render: (_: any, row: any) => row.class?.name || '—' },
          { title: '加入时间', dataIndex: 'enrolledAt', render: date }, { title: '结束时间', dataIndex: 'endedAt', render: date },
        ]} />
        <Typography.Title level={5} style={{ marginTop: 24 }}>课时记录 <Typography.Text type="secondary">（最近 10 条）</Typography.Text></Typography.Title>
        <Table size="small" rowKey="id" pagination={false} loading={history.loading} dataSource={history.logs} columns={[
          { title: '类型', dataIndex: 'type', render: (v: string, row: any) => row.reversalOfId ? '返还' : v === 'deduct' ? '划课' : '增课' },
          { title: '节数', dataIndex: 'lessons' }, { title: '时间', dataIndex: 'createdAt', render: date },
        ]} />
        <Button block style={{ marginTop: 20 }} onClick={() => restore(detail)}>恢复档案</Button>
      </>}
    </Drawer>
  </div>;
}
