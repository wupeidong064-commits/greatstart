import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Table, Tabs } from 'antd';
import { History } from 'lucide-react';
import { Modal } from '../components/overlays';
import ClassHandover from './ClassHandover';
import FollowupTransfer from './FollowupTransfer';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

type TransferHistory = {
  id: string; from_teacher_name: string; to_teacher_name: string; operated_by_name: string; notes?: string; created_at: string;
  transfer_details?: { kind?: string; classCount?: number; scheduleCount?: number; studentCount?: number; leadCount?: number; experienceCount?: number };
};
const sessionIdentity = () => { const s = useAuthStore.getState(); return JSON.stringify([s.token, s.user?.id, s.user?.organizationId, s.user?.campusId, s.user?.managementLevel]); };

export default function ResourceTransfer() {
  const { user, token } = useAuthStore();
  const session = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.managementLevel]);
  const active = useRef<string | null>(session); active.current = session;
  const [visible, setVisible] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [history, setHistory] = useState<TransferHistory[]>([]), [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const request = useRef(0);
  const canOperate = !!user && !user.isPlatformAdmin && (['super', 'manager'].includes(user.managementLevel || '') || (user.managementLevel === undefined && ['admin', 'manager'].includes(user.role)));
  const valid = (key: string) => key === active.current && key === sessionIdentity();
  async function fetchHistory(nextPage = 1) {
    const key = session, id = ++request.current; setLoading(true); setError('');
    try { const r = await api.get('/resource-transfers/history', { params: { page: nextPage, pageSize: 10 } }); if (!valid(key) || id !== request.current) return;
      setHistory(r.data || []); setPage(nextPage); setTotal(r.pagination?.total ?? r.data?.length ?? 0);
    } catch (e: any) { if (valid(key) && id === request.current) setError(e.response?.data?.error?.message || e.response?.data?.message || '交接历史加载失败，请重试'); }
    finally { if (valid(key) && id === request.current) setLoading(false); }
  }
  useEffect(() => { active.current = session; setVisible(false); setHistory([]); setError(''); setLoading(false); setPage(1); setTotal(0); return () => { request.current++; active.current = null; }; }, [session]);
  return <div className="resource-transfer-page">
    <div className="resource-transfer-heading"><h2 style={{ margin: 0 }}>资源交接</h2><Button icon={<History size={17} aria-hidden="true" />} disabled={!canOperate} onClick={() => { setVisible(true); void fetchHistory(); }}>交接历史</Button></div>
    <Tabs items={[{ key: 'classes', label: '班级交接', children: <ClassHandover /> }, { key: 'followup', label: '线索与体验课交接', children: <FollowupTransfer mode="marketing" /> }, { key: 'dormant', label: '沉默学员交接', children: <FollowupTransfer mode="dormant" /> }]} />
    <Modal title="交接历史记录" open={visible} onCancel={() => setVisible(false)} footer={null} width={960}>
      {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void fetchHistory(page)}>重试</Button>} style={{ marginBottom: 16 }} />}
      <Table<TransferHistory> rowKey="id" size="small" loading={loading} dataSource={history} scroll={{ x: 820 }} pagination={{ current: page, total, pageSize: 10, showSizeChanger: false, onChange: nextPage => void fetchHistory(nextPage) }} columns={[
        { title: '时间', dataIndex: 'created_at', render: (value: string) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—' },
        { title: '待交接人员', dataIndex: 'from_teacher_name' }, { title: '接手人员', dataIndex: 'to_teacher_name' },
        { title: '交接内容', key: 'details', render: (_, row) => row.transfer_details?.kind === 'dormant' ? `沉默学员回访 ${row.transfer_details.studentCount ?? 0} 人` : row.transfer_details?.kind === 'followup' ? `鱼池 ${row.transfer_details.leadCount ?? 0} 条 · 体验 ${row.transfer_details.experienceCount ?? 0} 条${row.transfer_details.studentCount ? ` · 旧版学员跟进 ${row.transfer_details.studentCount} 人` : ''}` : `班级 ${row.transfer_details?.classCount ?? 0} 个 · 涉及报名 ${row.transfer_details?.studentCount ?? 0} 人次` },
        { title: '操作人', dataIndex: 'operated_by_name' }, { title: '备注', dataIndex: 'notes', render: (value?: string) => value || '—' },
      ]} />
    </Modal>
  </div>;
}
