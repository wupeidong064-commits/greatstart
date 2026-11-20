import { Modal } from './overlays';
import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Form, Input, message, Space, Table, Tag } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
interface CourseType { id: string; name: string; isActive: boolean }
export interface CourseTypeChange { previousName?: string; name?: string }
export interface CourseTypeSettingsProps { onChanged?: (change?: CourseTypeChange) => void | Promise<void> }
const PAGE_SIZE = 20;
const errorText = (e: any) => e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || '操作失败，请重试';
export default function CourseTypeSettings({ onChanged }: CourseTypeSettingsProps) {
  const formId = useId();
  const role = useAuthStore(s => s.user?.role);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CourseType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const request = useRef(0);
  const [editing, setEditing] = useState<CourseType | null | undefined>(undefined);
  const [form] = Form.useForm();
  useEffect(() => () => { ++request.current; }, []);
  const load = async (nextPage: number) => {
    const current = ++request.current;
    setLoading(true); setError('');
    try {
      const result: any = await api.get('/courses', { params: { page: nextPage, pageSize: PAGE_SIZE } });
      if (!result.success || !Array.isArray(result.data)) throw new Error(result.message || '获取课程类型失败');
      if (current !== request.current) return;
      setRows(result.data); setTotal(result.pagination?.total ?? result.data.length); setPage(nextPage);
    } catch (e) { if (current === request.current) { setRows([]); setError(errorText(e)); } }
    finally { if (current === request.current) setLoading(false); }
  };
  const mutate = async (action: () => Promise<any>, change?: CourseTypeChange) => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const result = await action();
      if (!result.success) throw new Error(result.message || '保存失败');
      setEditing(undefined);
      await load(page);
      try { await onChanged?.(change); }
      catch { message.warning('课程类型已保存，课程选项刷新失败，请重试加载班级课程类型'); }
      message.success('课程类型已保存');
    } catch (e) { message.error(errorText(e)); }
    finally { busy.current = false; setSaving(false); }
  };
  const saveName = async () => {
    try {
      const values = await form.validateFields();
      const name = values.name.trim();
      // Patch only the field being edited: preserve existing code, price and duration.
      if (editing) await mutate(() => api.put(`/courses/${editing.id}`, { name }), { previousName: editing.name, name });
      else await mutate(() => api.post('/courses', { name }), { name });
    } catch (e: any) {
      // Only Ant Design field validation already has an inline error.
      if (!Array.isArray(e?.errorFields)) message.error(errorText(e));
    }
  };
  if (!['admin', 'manager'].includes(role || '')) return null;
  return <>
    <Button icon={<SettingOutlined />} onClick={() => { setOpen(true); void load(1); }}>课程类型设置</Button>
    <Modal title="课程类型设置" open={open} width={680} footer={null} maskClosable={!saving} closable={!saving}
      onCancel={() => { if (!saving) { ++request.current; setOpen(false); setEditing(undefined); } }}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert type="info" message="课程类型在新增或编辑班级时选择，例如美术、书法、英语。停用后不再供新班选择，已有班级和历史场次保留。" />
        <Button type="primary" disabled={saving} onClick={() => { setEditing(null); form.resetFields(); }}>新建课程类型</Button>
        {error && <Alert type="error" message={error} action={<Button size="small" onClick={() => void load(page)}>重试</Button>} />}
        <Table<CourseType> rowKey="id" size="small" loading={loading} dataSource={rows}
          locale={{ emptyText: error ? '课程类型加载失败' : '暂无课程类型，请先新建' }}
          pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, onChange: next => void load(next) }}
          columns={[
            { title: '课程类型名称', dataIndex: 'name' },
            { title: '状态', render: (_, row) => <Tag color={row.isActive ? 'green' : undefined}>{row.isActive ? '启用' : '已停用'}</Tag> },
            { title: '操作', render: (_, row) => <Space>
              <Button size="small" disabled={saving} onClick={() => { setEditing(row); form.setFieldsValue({ name: row.name }); }}>改名</Button>
              <Button size="small" disabled={saving} onClick={() => void mutate(() => api.put(`/courses/${row.id}`, { isActive: !row.isActive }))}>{row.isActive ? '停用' : '启用'}</Button>
            </Space> },
          ]} />
      </Space>
    </Modal>
    <Modal title={editing ? '课程类型改名' : '新建课程类型'} open={editing !== undefined} onOk={() => void saveName()}
      okText="保存" cancelText="取消" confirmLoading={saving} cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving}
      onCancel={() => { if (!saving) setEditing(undefined); }} destroyOnClose>
      <Form name={`course-type-${formId}`} form={form} layout="vertical" preserve={false}>
        <Form.Item label="课程类型名称" name="name" rules={[{ required: true, whitespace: true, message: '请输入课程类型名称' }, { max: 100, message: '名称最多100个字符' }]}>
          <Input maxLength={100} placeholder="例如：美术、书法、英语" disabled={saving} />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
