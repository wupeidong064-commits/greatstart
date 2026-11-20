import { Modal } from './overlays';
import { useState } from 'react';
import { Alert, Button, Form, Input, Select, message } from 'antd';
import api from '../services/api';

type Props = { student: { id: string; name: string }; onArchived: () => void };

export default function ArchiveStudentAction({ student, onArchived }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const submit = async (values: { reason: string; note?: string }) => {
    setSaving(true);
    try {
      await api.post(`/students/${student.id}/archive`, { reason: values.reason, note: values.note?.trim() || undefined });
      message.success('学员已归档');
      setOpen(false);
      form.resetFields();
      onArchived();
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '归档失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <Button size="small" className="stu-act" onClick={() => setOpen(true)}>归档</Button>
    <Modal title={`归档学员 · ${student.name}`} open={open} okText="确认归档" cancelText="取消" confirmLoading={saving}
      onOk={() => form.submit()} onCancel={() => { if (!saving) { setOpen(false); form.resetFields(); } }}>
      <Alert type="info" showIcon style={{ marginBottom: 20 }} message="学员档案、课时和历史记录将保留"
        description="归档会结束当前在读班级，学员不再出现在日常花名册。恢复档案后如需上课，请重新安排班级。" />
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ reason: 'no_renewal' }}>
        <Form.Item name="reason" label="归档原因" rules={[{ required: true, message: '请选择归档原因' }]}>
          <Select options={[{ value: 'no_renewal', label: '确定不续费' }, { value: 'no_recall', label: '不再召回' }, { value: 'other', label: '其他' }]} />
        </Form.Item>
        <Form.Item name="note" label="备注（选填）"><Input.TextArea rows={2} maxLength={200} showCount placeholder="可记录归档说明" /></Form.Item>
      </Form>
    </Modal>
  </>;
}
