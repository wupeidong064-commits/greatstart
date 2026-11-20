import { useRef, useState } from 'react';
import { Alert, Button, Space, Table, Tag, message } from 'antd';
import { ShieldCheck } from 'lucide-react';
import { Modal } from './overlays';
import api from '../services/api';

type Staff = { id: string; name: string; phone?: string; role: string; jobRole?: string | null; managementLevel: 'none' | 'manager' | 'super'; isActive: boolean };
const labels = { none: '普通员工', manager: '机构管理员', super: '超级机构管理员' };
const jobs: Record<string, string> = { coach: '老师', teacher: '老师', sales: '销售', staff: '工作人员' };
export default function OrganizationAdmins({ organization }: { organization: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const locked = useRef(false);
  const fetchStaff = async () => {
    setLoading(true); setFailure('');
    try { const result = await api.get(`/organizations/${organization.id}/administrators`); setStaff(result.data || []); }
    catch (e: any) { setFailure(e.response?.data?.error?.message || e.message || '读取人员失败'); }
    finally { setLoading(false); }
  };
  const change = (target: Staff, level: Staff['managementLevel']) => {
    let submitting = false;
    const confirmation = Modal.confirm({
      title: level === 'super' ? '任命超级机构管理员' : '取消管理身份',
      content: <p>确定将“{target.name}”{level === 'super' ? '任命为该机构的超级机构管理员' : '恢复为普通员工'}吗？原岗位保留。超级机构管理员仅由系统管理员任免，替换时须先任命接替人。</p>,
      okText: '确认', cancelText: '取消',
      onOk: (close: () => void) => {
        if (locked.current || submitting) return;
        locked.current = true; submitting = true; setBusy(target.id);
        confirmation.update({ okButtonProps: { loading: true }, cancelButtonProps: { disabled: true }, keyboard: false });
        void (async () => {
          try {
            await api.put(`/organizations/${organization.id}/administrators/${target.id}`, { managementLevel: level, expectedLevel: target.managementLevel });
            const result = await api.get(`/organizations/${organization.id}/administrators`);
            const actual = (result.data || []).find((row: Staff) => row.id === target.id);
            if (actual?.managementLevel !== level) throw new Error('任命结果未确认，请刷新核实');
            setStaff(result.data); message.success('管理任命已更新，原岗位保留'); close();
          } catch (e: any) {
            message.error(e.response?.data?.error?.message || e.message || '更新失败');
            confirmation.update({ okButtonProps: { loading: false }, cancelButtonProps: { disabled: false }, keyboard: true });
          } finally { locked.current = false; submitting = false; setBusy(null); }
        })();
      },
    });
  };
  return <>
    <Button type="link" size="small" icon={<ShieldCheck size={16} />} onClick={() => { setOpen(true); void fetchStaff(); }}>管理任命</Button>
    <Modal title={`${organization.name} · 管理任命`} open={open} onCancel={() => setOpen(false)} width={880} footer={<Button onClick={() => setOpen(false)} disabled={!!busy}>关闭</Button>}>
      <Alert type="info" showIcon message="系统管理员指定超级机构管理员；超级机构管理员任免普通机构管理员。原岗位与业务关系保留。" style={{ marginBottom: 16 }} />
      {failure && <Alert type="error" message={failure} action={<Button size="small" onClick={fetchStaff}>重试</Button>} style={{ marginBottom: 16 }} />}
      <Table rowKey="id" dataSource={staff} loading={loading} scroll={{ x: 740 }} pagination={{ pageSize: 10 }} columns={[
        { title: '姓名', dataIndex: 'name', width: 120 },
        { title: '手机号', dataIndex: 'phone', width: 140 },
        { title: '岗位', key: 'job', width: 110, render: (_, row) => row.jobRole === null ? '岗位待确认' : jobs[row.jobRole || row.role] || row.role },
        { title: '管理身份', key: 'level', width: 150, render: (_, row) => <Tag color="purple">{labels[row.managementLevel] || '普通员工'}</Tag> },
        { title: '操作', key: 'actions', width: 220, render: (_, row) => <Space wrap>
          {row.managementLevel !== 'super' && <Button type="link" size="small" disabled={!row.isActive || !!busy} loading={busy === row.id} onClick={() => change(row, 'super')}>任命超级机构管理员</Button>}
          {row.managementLevel !== 'none' && <Button type="link" size="small" disabled={!!busy} onClick={() => change(row, 'none')}>取消管理身份</Button>}
          {!row.isActive && <span style={{ color: 'var(--tx3)' }}>账号已停用</span>}
        </Space> },
      ]} />
    </Modal>
  </>;
}
