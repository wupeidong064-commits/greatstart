import { Modal } from './overlays';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Radio, Select, Space, Spin, Tag, message } from 'antd';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';

/** Follow the server's pagination so selectors include every accessible record. */
export async function loadEnrollmentPages(path: string, params: Record<string, unknown> = {}) {
  const rows: any[] = [];
  const seen = new Set<string>();
  for (let page = 1; ; page += 1) {
    const response = await api.get(path, { params: { ...params, page, pageSize: 100 } });
    const batch: any[] = response.data || [];
    let added = 0;
    for (const row of batch) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
        added += 1;
      }
    }
    if (response.pagination) {
      if (rows.length >= response.pagination.total) return rows;
      if (batch.length === 0 || added === 0) throw new Error('列表加载不完整，请重试');
    } else if (batch.length < 100) {
      return rows;
    } else if (added === 0) {
      throw new Error('列表分页异常，请重试');
    }
  }
}

const errorMessage = (error: any) => error.response?.data?.error?.message || error.response?.data?.message || error.message || '操作失败，请重试';
const classLabel = (cls: any) => `${cls.name || '未知班级'}${cls.code ? ` (${cls.code})` : ''}`;

type Props = {
  open: boolean;
  studentId?: string;
  targetClassId?: string;
  onCancel: () => void;
  onSuccess: () => void;
};

export default function ClassEnrollmentModal({ open, studentId: initialStudentId, targetClassId, onCancel, onSuccess }: Props) {
  const [form] = Form.useForm();
  const { user } = useAuthStore();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [enrollmentError, setEnrollmentError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [retry, setRetry] = useState(0);
  const listRequest = useRef(0);
  const enrollmentRequest = useRef(0);
  const submitLock = useRef(false);
  const loadedStudent = useRef<string>();
  const studentId = Form.useWatch('studentId', form);
  const mode = Form.useWatch('mode', form) || 'add';
  const destinationId = Form.useWatch('toClassId', form);
  const selectedSourceIds: string[] = Form.useWatch('fromEnrollmentIds', form) || [];
  const role = user?.role ? normalizeRole(user.role) : null;
  const canManage = role === 'admin' || role === 'manager';

  useEffect(() => {
    if (!open) {
      ++enrollmentRequest.current;
      form.resetFields();
      setEnrollments([]);
      setLoadError('');
      setEnrollmentError('');
      setSubmitError('');
      return;
    }
    form.resetFields();
    form.setFieldsValue({ mode: 'add', studentId: initialStudentId, toClassId: targetClassId });
  }, [open, initialStudentId, targetClassId, user?.campusId, user?.organizationId, form]);

  useEffect(() => {
    const request = ++listRequest.current;
    if (!open) return;
    setStudents([]);
    setClasses([]);
    setLoadError('');
    setSubmitError('');
    setLoading(true);
    Promise.all([loadEnrollmentPages('/students'), loadEnrollmentPages('/classes')])
      .then(([studentRows, classRows]) => {
        if (request !== listRequest.current) return;
        setStudents(studentRows);
        setClasses(classRows);
      })
      .catch(error => { if (request === listRequest.current) setLoadError(errorMessage(error)); })
      .finally(() => { if (request === listRequest.current) setLoading(false); });
    return () => { ++listRequest.current; };
  }, [open, initialStudentId, targetClassId, user?.campusId, user?.organizationId, retry, form]);

  useEffect(() => {
    const request = ++enrollmentRequest.current;
    loadedStudent.current = undefined;
    setEnrollments([]);
    setEnrollmentError('');
    form.setFieldValue('fromEnrollmentIds', []);
    if (!open || !studentId) {
      setEnrollmentsLoading(false);
      return;
    }
    setEnrollmentsLoading(true);
    loadEnrollmentPages('/enrollments', { studentId, status: 'active' })
      .then(rows => { if (request === enrollmentRequest.current) { loadedStudent.current = studentId; setEnrollments(rows); } })
      .catch(error => { if (request === enrollmentRequest.current) setEnrollmentError(errorMessage(error)); })
      .finally(() => { if (request === enrollmentRequest.current) setEnrollmentsLoading(false); });
    return () => { ++enrollmentRequest.current; };
  }, [open, studentId, retry, form]);

  // A student can have older duplicate enrollment rows; offer each class once,
  // while keeping the exact selected enrollment ID for the atomic transfer API.
  const sourcesByClass = new Map<string, any>();
  enrollments.forEach(enrollment => {
    const classId = enrollment.classId || enrollment.class?.id;
    if (classId && !sourcesByClass.has(classId)) sourcesByClass.set(classId, enrollment);
  });
  const sourceEnrollments = Array.from(sourcesByClass.values());
  const selectedSources = sourceEnrollments.filter(enrollment => selectedSourceIds.includes(enrollment.id));
  const selectedSourceClassIds = new Set(selectedSources.map(enrollment => enrollment.classId || enrollment.class?.id));
  const sourceTargetConflict = selectedSourceClassIds.has(destinationId);
  const destination = classes.find(cls => cls.id === destinationId);
  const destinationUnavailable = !!destinationId && (!destination || destination.status !== 'active');
  const alreadyJoined = enrollments.some(enrollment => (enrollment.classId || enrollment.class?.id) === destinationId);
  const handleSubmit = async (values: any) => {
    if (submitLock.current) return;
    if (!canManage) { setSubmitError('需要机构管理员权限'); return; }
    if (loading || enrollmentsLoading || loadError || enrollmentError || loadedStudent.current !== values.studentId) return;
    if (!classes.some(cls => cls.id === values.toClassId && cls.status === 'active')) { setSubmitError('请选择可用的目标班级'); return; }
    if (values.mode !== 'transfer' && enrollments.some(enrollment => (enrollment.classId || enrollment.class?.id) === values.toClassId)) {
      setSubmitError('该学员已加入目标班级，请选择其他班级');
      return;
    }
    const fromEnrollmentIds: string[] = Array.isArray(values.fromEnrollmentIds) ? values.fromEnrollmentIds : [];
    const sources = sourceEnrollments.filter(enrollment => fromEnrollmentIds.includes(enrollment.id));
    if (values.mode === 'transfer' && (!sources.length || sources.length !== fromEnrollmentIds.length)) { setSubmitError('请至少选择一个可调出的原班级'); return; }
    if (values.mode === 'transfer' && sources.some(enrollment => (enrollment.classId || enrollment.class?.id) === values.toClassId)) { setSubmitError('原班级和目标班级不能相同，请调整选择'); return; }
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      if (values.mode === 'transfer') {
        await api.post('/enrollments/transfer', {
          studentId: values.studentId, fromEnrollmentIds,
          toClassId: values.toClassId, notes: values.notes,
        });
      } else {
        await api.post('/enrollments', { studentId: values.studentId, classId: values.toClassId, notes: values.notes });
      }
      message.success(values.mode === 'transfer' ? `调班成功，已调整选中的${sources.length}个原班，其他班级和课时保持不变` : '新增班级成功，原有班级和课时保持不变');
      onCancel();
      onSuccess();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal title="班级调整" open={open} width={620} onCancel={() => { if (!submitLock.current) onCancel(); }}
      onOk={() => form.submit()} okText={mode === 'transfer' ? '确认调班' : '确认新增班级'} cancelText="取消"
      confirmLoading={submitting} closable={!submitting} maskClosable={!submitting} keyboard={!submitting}
      cancelButtonProps={{ disabled: submitting }}
      okButtonProps={{ disabled: !canManage || loading || enrollmentsLoading || !!loadError || !!enrollmentError || (mode !== 'transfer' && alreadyJoined) || sourceTargetConflict || destinationUnavailable || (mode === 'transfer' && enrollments.length === 0) }}>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="新增班级保留原有班级；调班可多选原班，一起转到一个目标班。未选中的班级保留。均不自动收费，不改变学员课时。" />
      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => setRetry(value => value + 1)}>重新加载</Button>} style={{ marginBottom: 16 }} />}
      {submitError && <Alert type="error" showIcon message={submitError} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} disabled={submitting} initialValues={{ mode: 'add' }}
          onValuesChange={() => setSubmitError('')}>
          <Form.Item name="studentId" label="学员" rules={[{ required: true, message: '请选择学员' }]}>
            <Select showSearch optionFilterProp="label" placeholder="搜索姓名或电话" loading={loading}
              options={students.map(student => ({ value: student.id, label: `${student.name}${student.phone || student.parentPhone ? ` (${student.phone || student.parentPhone})` : ''}` }))} />
          </Form.Item>
          <Form.Item label="全部现有班级">
            {enrollmentsLoading ? <Spin size="small" /> : enrollmentError ? <Alert type="error" message={enrollmentError} action={<Button size="small" onClick={() => setRetry(value => value + 1)}>重试</Button>} /> : !studentId ? '请先选择学员' : enrollments.length ? (
              <Space wrap>{sourceEnrollments.map(enrollment => <Tag key={enrollment.id}>{classLabel(enrollment.class || classes.find(cls => cls.id === enrollment.classId) || {})}</Tag>)}</Space>
            ) : '暂无在读班级'}
          </Form.Item>
          <Form.Item name="mode" label="操作方式" rules={[{ required: true }]}>
            <Radio.Group onChange={() => form.setFieldValue('fromEnrollmentIds', [])}>
              <Radio value="add">新增班级（保留现有班）</Radio>
              <Radio value="transfer">调班（可多选原班）</Radio>
            </Radio.Group>
          </Form.Item>
          {mode === 'transfer' && <Form.Item name="fromEnrollmentIds" label="调出的原班级（可多选）" rules={[
            { required: true, type: 'array', min: 1, message: '请至少选择一个要调出的原班级' },
          ]}>
            <Select mode="multiple" showSearch optionFilterProp="label" placeholder="可一次选择多个原班级" loading={enrollmentsLoading} disabled={!studentId || enrollmentsLoading || !!enrollmentError || submitting}
              options={sourceEnrollments.map(enrollment => ({ value: enrollment.id, disabled: (enrollment.classId || enrollment.class?.id) === destinationId, label: classLabel(enrollment.class || classes.find(cls => cls.id === enrollment.classId) || {}) }))} />
          </Form.Item>}
          <Form.Item name="toClassId" label="目标班级" rules={[{ required: true, message: '请选择目标班级' }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择目标班级"
              options={classes.map(cls => {
                const joined = enrollments.some(enrollment => (enrollment.classId || enrollment.class?.id) === cls.id);
                return { value: cls.id, disabled: (mode !== 'transfer' && joined) || selectedSourceClassIds.has(cls.id) || cls.status !== 'active', label: `${classLabel(cls)}${cls.teacher?.name ? ` · ${cls.teacher.name}` : ''}${cls.status !== 'active' ? ' · 已停用' : joined ? (mode === 'transfer' ? ' · 已在读，将保留' : ' · 已加入') : ''}` };
              })} />
          </Form.Item>
          {mode === 'transfer' && selectedSources.length > 0 && <Alert type="info" style={{ marginBottom: 16 }}
            message={`已选${selectedSources.length}个原班 → ${destination ? `目标：${classLabel(destination)}` : '请选择1个目标班'}`}
            description={`调出：${selectedSources.map(enrollment => classLabel(enrollment.class || classes.find(cls => cls.id === enrollment.classId) || {})).join('、')}。未选中的${Math.max(0, sourceEnrollments.length - selectedSources.length)}个现有班级保留，课时不变。${alreadyJoined ? '目标班已在读，将保留，不重复加入。' : ''}`} />}
          {sourceTargetConflict && <Alert type="warning" message="原班级和目标班级不能相同，请调整选择。" style={{ marginBottom: 16 }} />}
          {destinationUnavailable && <Alert type="warning" showIcon message="目标班级已停用或不可用，请选择其他班级。" style={{ marginBottom: 16 }} />}
          {mode !== 'transfer' && alreadyJoined && <Alert type="warning" showIcon message="该学员已加入目标班级，请选择其他班级。" style={{ marginBottom: 16 }} />}
          {mode === 'transfer' && studentId && !enrollmentsLoading && !enrollmentError && !enrollments.length && <Alert type="warning" showIcon message="该学员没有可调出的班级，请选择新增班级。" style={{ marginBottom: 16 }} />}
          <Form.Item name="notes" label="备注（可选）"><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
}
