import { useOverlaySubmit, Modal } from '../components/overlays';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Table, Button, Form, message, Tag, Input, Space, Select, DatePicker, TimePicker, Checkbox, Descriptions, Alert, Dropdown } from 'antd';
import { Plus, CalendarDays, Users, UserPlus, Filter, MoreHorizontal } from 'lucide-react';
import './CashflowSummary.css';
import './TeachingPages.css';
import api from '../services/api';
import { dataService, Teacher } from '../services/dataService';
import { useAuthStore } from '../store/authStore';
import { getDataScopeFilter, normalizeRole } from '../utils/dataFilter';
import dayjs from 'dayjs';
import CourseTypeSettings, { CourseTypeChange } from '../components/CourseTypeSettings';
import ClassEnrollmentModal, { loadEnrollmentPages } from '../components/ClassEnrollmentModal';

const normalizeCourseType = (name: string) => name.trim().toLowerCase();

const weekDayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 班级时间摘要：如「周二 18:00-19:00 · A101」。 */
const formatWeeklyRules = (rules: any[] | undefined | null) =>
  (rules || []).map(rule => ({
    weekday: rule.weekday,
    time: `${weekDayLabels[rule.weekday] ?? '?'} ${rule.startTime}-${rule.endTime}`,
    classroom: rule.classroom,
    text: `${weekDayLabels[rule.weekday] ?? '?'} ${rule.startTime}-${rule.endTime}${rule.classroom ? ` · ${rule.classroom}` : ''}`,
  })).filter(row => row.text.includes('-'));

const Classes = () => {
  const { user } = useAuthStore();
  const userRole = user ? normalizeRole(user.role) : null;

  // 仅管理员可操作班级；销售/老师只读，工作人员及家长不显示操作入口（Z2 修复：原实现
  // "非销售且非老师即可编辑"会让普通工作人员看到新增/导入/编辑/删除按钮）。
  // 兼任管理身份（岗位 staff/coach/sales + managementLevel）由后端兼容角色 user.role=manager 覆盖。
  const canEdit = !user?.isPlatformAdmin && (userRole === 'admin' || userRole === 'manager');
  const canAdjustEnrollment = canEdit;

  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitClassForm, classFormSubmitting] = useOverlaySubmit((values: any) => handleSubmit(values));
  const [editingClass, setEditingClass] = useState<any>(null);
  const [form] = Form.useForm();
  const [courseTypes, setCourseTypes] = useState<{ id: string; name: string; isActive?: boolean }[]>([]);
  const [legacyCourseTypes, setLegacyCourseTypes] = useState<string[]>([]);
  const [courseTypesLoading, setCourseTypesLoading] = useState(false);
  const [courseTypesError, setCourseTypesError] = useState('');
  const courseTypesRequest = useRef(0);
  const loadCourseTypes = async () => {
    const request = ++courseTypesRequest.current;
    setCourseTypesLoading(true);
    setCourseTypesError('');
    try {
      const [catalog, allClasses] = await Promise.all([
        loadEnrollmentPages('/courses'),
        loadEnrollmentPages('/classes', { ...getDataScopeFilter('classes') }),
      ]);
      if (request !== courseTypesRequest.current) return;
      if (catalog.some(course => !course?.id || typeof course.name !== 'string' || !course.name.trim())) throw new Error('课程类型数据格式异常，请重试');
      setCourseTypes(catalog);
      setLegacyCourseTypes(Array.from(new Set<string>(allClasses.map(cls => cls.courseType).filter((name): name is string => typeof name === 'string' && !!name.trim()))));
    } catch (error: any) {
      if (request !== courseTypesRequest.current) return;
      setCourseTypesError(error.response?.data?.error?.message || error.message || '加载课程类型失败，请重试');
    } finally {
      if (request === courseTypesRequest.current) setCourseTypesLoading(false);
    }
  };
  useEffect(() => {
    if (modalVisible) void loadCourseTypes();
    return () => { ++courseTypesRequest.current; };
  }, [modalVisible, user?.organizationId]);
  const courseTypeOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    courseTypes.filter(course => course.isActive !== false).forEach(course => options.set(normalizeCourseType(course.name), { value: course.name, label: course.name }));
    // Preserve old free-text types unless the institution explicitly disabled that name.
    legacyCourseTypes.filter(name => !courseTypes.some(course => normalizeCourseType(course.name) === normalizeCourseType(name))).forEach(name => { if (!options.has(normalizeCourseType(name))) options.set(normalizeCourseType(name), { value: name, label: name }); });
    const original = editingClass?.courseType;
    const available = Array.from(options.values());
    if (original && !available.some(option => option.value === original)) available.push({ value: original, label: `${original}（原班类型，可保留）` });
    return available;
  }, [courseTypes, legacyCourseTypes, editingClass?.courseType]);
  const handleCourseTypesChanged = async (change?: CourseTypeChange) => {
    // Refresh only the renamed field; retain all other unsaved class details.
    if (change?.previousName && change.name && change.previousName !== change.name) {
      if (normalizeCourseType(form.getFieldValue('courseType') || '') === normalizeCourseType(change.previousName)) form.setFieldValue('courseType', change.name);
      setEditingClass((current: any) => current?.courseType && normalizeCourseType(current.courseType) === normalizeCourseType(change.previousName!) ? { ...current, courseType: change.name } : current);
    } else if (change?.name && modalVisible && !form.getFieldValue('courseType')) {
      form.setFieldValue('courseType', change.name);
    }
    await Promise.all([showExperienceClassOnly ? fetchExperienceClasses() : fetchClasses(), ...(modalVisible ? [loadCourseTypes()] : [])]);
  };
  const [showExperienceClassOnly, setShowExperienceClassOnly] = useState(false);

  // 筛选状态
  const [filterTeacherId, setFilterTeacherId] = useState<string | null>(null);
  const [filterWeekDay, setFilterWeekDay] = useState<number | null>(null);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [schedulingClass, setSchedulingClass] = useState<any>(null);
  const [scheduleForm] = Form.useForm();
  const [replacePreview, setReplacePreview] = useState<any>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const previewSequence = useRef(0);
  const previewParams = useRef<{ classId: string; startDate: string; endDate: string } | null>(null);
  const invalidateReplacePreview = () => {
    ++previewSequence.current;
    previewParams.current = null;
    setReplacePreview(null);
    replaceRequestIdRef.current = null;
    setReplaceLoading(false);
  };
  const closeScheduleModal = () => {
    if (scheduleSubmitLock.current) return;
    invalidateReplacePreview();
    setScheduleModalVisible(false);
  };
  const replaceRequestIdRef = useRef<string | null>(null);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const scheduleSubmitLock = useRef(false);
  const schedulePendingKey = (classId: string) => `class-schedule-pending:v1:${user?.organizationId}:${user?.id}:${classId}`;
  const [studentsModalVisible, setStudentsModalVisible] = useState(false);
  const [viewingClass, setViewingClass] = useState<any>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [addStudentModalVisible, setAddStudentModalVisible] = useState(false);
  const [addingToClass, setAddingToClass] = useState<any>(null);

  // 批量选择相关状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);


  // 获取老师列表（使用缓存）
  const fetchTeachers = async () => {
    try {
      const data = await dataService.getTeachers();
      setTeachers(data);
    } catch (error: any) {
      console.error('获取老师列表失败:', error);
    }
  };

  useEffect(() => {
    fetchTeachers(); // 页面加载时获取老师列表
    if (showExperienceClassOnly) {
      fetchExperienceClasses();
    } else {
      fetchClasses();
    }
  }, [showExperienceClassOnly]);

  useEffect(() => {
    if (!scheduleModalVisible || !schedulingClass?.id) return;
    const key = schedulePendingKey(schedulingClass.id);
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && event.key === key && event.newValue) message.warning('另一个标签页有待确认的排课请求，请核对后再提交');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [scheduleModalVisible, schedulingClass?.id, user?.id, user?.organizationId]);

  // 自动打开排课弹窗（创建班级后）的逻辑已移除：建班只保存班级时间规则，
  // 生成课表统一由「每周排课 → 新增排课」按班级时间完成。

  const fetchClasses = async () => {
    setLoading(true);
    try {
      // 应用数据过滤：teacher 角色只看自己的班级
      const filter = getDataScopeFilter('classes');
      const rows = await loadEnrollmentPages('/classes', { ...filter });
      setClasses(rows);
      setViewingClass((current: any) => current ? rows.find(cls => cls.id === current.id) || current : current);
    } catch (error: any) {
      console.error('获取班级列表失败:', error);
      message.error(error.message || '获取班级列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchExperienceClasses = async () => {
    setLoading(true);
    try {
      // 获取所有活跃班级，包含学员数统计，按空位数排序
      const response = await api.get('/classes/experience-priority');
      const rows = response.data || [];
      setClasses(rows);
      setViewingClass((current: any) => current ? rows.find((cls: any) => cls.id === current.id) || current : current);
    } catch (error: any) {
      console.error('获取优先安排体验课班级失败:', error);
      message.error(error.message || '获取优先安排体验课班级失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const { user } = useAuthStore.getState();
      // 班级时间（常规每周规则）随班级资料一起保存；只存规则，不产生任何排课。
      const weeklyRules = (values.weeklyRules || []).map((row: any) => ({
        weekday: row.weekday,
        startTime: row.timeRange?.[0]?.format('HH:mm'),
        endTime: row.timeRange?.[1]?.format('HH:mm'),
        classroom: row.classroom?.trim() || null,
      }));

      if (editingClass) {
        // 编辑班级资料与班级时间规则；已有场次不受影响，重排由每周排课入口显式处理。
        const updateData = { name: values.name, teacherId: values.teacherId, courseType: values.courseType, capacity: values.capacity, weeklyRules };
        await api.put(`/classes/${editingClass.id}`, updateData);
        message.success('更新成功；已有课程未改变，如需按新时间重排请到每周排课操作');
        setModalVisible(false);
        fetchClasses();
      } else {
        // 创建班级：班级代码由服务端生成，界面不要求填写。
        const classData = {
          name: values.name,
          courseType: values.courseType,
          capacity: values.capacity,
          teacherId: values.teacherId,
          weeklyRules,
          organizationId: user?.organizationId || 'default-org',
          campusId: user?.campusId || undefined,
          status: 'active',
        };
        await api.post('/classes', classData);
        message.success('班级创建成功；如需生成课表，请到「每周排课 → 新增排课」按班级时间生成');
        setModalVisible(false);
        fetchClasses();
      }
    } catch (error: any) {
      console.error('操作失败:', error);
      message.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || '操作失败');
    }
  };

  const handleScheduleClass = (record: any) => {
    if (!canEdit || scheduleSubmitLock.current) return;
    invalidateReplacePreview();
    setSchedulingClass(record);
    scheduleForm.resetFields();
    scheduleForm.setFieldsValue({ startDate: dayjs(), endDate: dayjs().add(1, 'month') });
    setReplacePreview(null);
    replaceRequestIdRef.current = null;
    try {
      const stale = JSON.parse(localStorage.getItem(schedulePendingKey(record.id)) || 'null');
      if (stale?.payload) message.warning('上次重排请求尚未确认，请重新预览并确认');
    } catch { /* 保留损坏状态供人工核对 */ }
    setScheduleModalVisible(true);
  };

  const handleReschedulePreview = async () => {
    if (!canEdit || !schedulingClass?.id) return;
    const values = scheduleForm.getFieldsValue();
    if (!values.startDate || !values.endDate) { message.error('请选择课程起止日期'); return; }
    const startDate = values.startDate.format('YYYY-MM-DD');
    const endDate = values.endDate.format('YYYY-MM-DD');
    if (endDate < startDate) { message.error('结束日期不能早于开始日期'); return; }
    invalidateReplacePreview();
    const sequence = previewSequence.current;
    const params = { classId: schedulingClass.id, startDate, endDate };
    setReplaceLoading(true);
    try {
      const response = await api.post('/schedules/class-rules/preview', params);
      if (sequence !== previewSequence.current) return;
      previewParams.current = params;
      setReplacePreview(response.data);
      replaceRequestIdRef.current = crypto.randomUUID();
    } catch (error: any) {
      if (sequence !== previewSequence.current) return;
      const code = error.response?.data?.error?.code;
      if (code === 'NO_CLASS_WEEKLY_RULES') message.error('该班还没有班级时间，请先在班级管理补充每周上课时间');
      else message.error(error.response?.data?.error?.message || '预览失败，请重试');
    } finally {
      if (sequence === previewSequence.current) setReplaceLoading(false);
    }
  };

  const handleRescheduleConfirm = async () => {
    if (!canEdit || !replacePreview || !schedulingClass?.id || scheduleSubmitLock.current) return;
    const values = scheduleForm.getFieldsValue();
    const startDate = values.startDate?.format('YYYY-MM-DD');
    const endDate = values.endDate?.format('YYYY-MM-DD');
    const params = previewParams.current;
    if (!params || params.classId !== schedulingClass.id || params.startDate !== startDate || params.endDate !== endDate) {
      invalidateReplacePreview();
      message.error('日期已变更，请重新预览');
      return;
    }
    const requestId = replaceRequestIdRef.current || crypto.randomUUID();
    replaceRequestIdRef.current = requestId;
    const key = schedulePendingKey(schedulingClass.id);
    const payload = { ...params, replaceFuture: true, expectedClassUpdatedAt: replacePreview.class.updatedAt };
    scheduleSubmitLock.current = true;
    setScheduleSubmitting(true);
    try {
      localStorage.setItem(key, JSON.stringify({ requestId, payload, uncertain: true }));
      const response = await api.post('/schedules/class-rules/generate', { ...payload, requestId });
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      if (stored?.requestId === requestId) localStorage.removeItem(key);
      setScheduleModalVisible(false);
      message.success(response.data?.replayed ? '此前重排请求已处理，请核对课表' : `重排完成，共 ${response.data?.count ?? 0} 场`);
      fetchClasses();
    } catch (error: any) {
      const code = error.response?.data?.error?.code;
      if (code === 'SCHEDULE_LOCKED') message.error('未来课程已有考勤或课时记录，本次重排未执行');
      else if (code === 'CLASS_VERSION_CHANGED') { message.error('班级资料已更新，请重新预览'); invalidateReplacePreview(); }
      else if (code === 'SCHEDULE_REQUEST_CONFLICT') { invalidateReplacePreview(); message.error('请求标识冲突，请重新预览后重试'); }
      else message.error(error.response?.data?.error?.message || '重排失败，请重试');
    } finally {
      scheduleSubmitLock.current = false;
      setScheduleSubmitting(false);
    }
  };


  const handleEdit = (record: any) => {
    setEditingClass(record);

    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      teacherId: record.teacherId,
      courseType: record.courseType,
      capacity: record.capacity,
      // 班级时间回填为可编辑列表；保存只改规则，不影响已有场次。
      weeklyRules: (record.weeklyRules || []).map((rule: any) => ({
        weekday: rule.weekday,
        timeRange: rule.startTime && rule.endTime ? [dayjs(`2000-01-01 ${rule.startTime}`), dayjs(`2000-01-01 ${rule.endTime}`)] : undefined,
        classroom: rule.classroom || '',
      })),
    });

    setModalVisible(true);
  };

  type ClassAction = 'delete' | 'suspend' | 'resume';
  const [classAction, setClassAction] = useState<{ action: ClassAction; records: any[] } | null>(null);
  const [classActionError, setClassActionError] = useState('');
  const [classActionSubmitting, setClassActionSubmitting] = useState(false);
  const classActionLock = useRef(false);
  const [slotActionForm] = Form.useForm();
  const actionNames: Record<ClassAction, string> = { delete: '永久删除', suspend: '停课', resume: '复课' };
  const openClassAction = (action: ClassAction, records: any[]) => {
    if (classActionLock.current) return;
    const eligible = records.filter(record => action === 'delete' || record.status === (action === 'suspend' ? 'active' : 'inactive'));
    if (!eligible.length) {
      message.warning(action === 'delete' ? '请选择要删除的班级' : action === 'suspend' ? '请选择活跃班级' : '请选择停课班级');
      return;
    }
    setClassActionError('');
    if ((action === 'suspend' || action === 'resume') && eligible.length === 1 && (eligible[0].weeklyRules || []).length > 1) {
      slotActionForm.setFieldsValue({ slotKeys: eligible[0].weeklyRules.map((r: any) => `${r.weekday}|${r.startTime}|${r.endTime}`) });
    } else {
      slotActionForm.resetFields();
    }
    setClassAction({ action, records: eligible });
  };
  const submitClassAction = async () => {
    if (!classAction || classActionLock.current) return;
    classActionLock.current = true;
    setClassActionSubmitting(true);
    const { action, records } = classAction;
    const failed: { record: any; reason: string }[] = [];
    const succeeded: string[] = [];
    const slotOnlyIds: string[] = [];
    try {
      for (const record of records) {
        try {
          if (action !== 'delete' && records.length === 1 && (record.weeklyRules || []).length > 1) {
            // 2026-11-07 用户拍板：多时段班级停/复课可只选部分时段；全选则走整班原流程。
            const rules = record.weeklyRules;
            const allKeys = rules.map((r: any) => `${r.weekday}|${r.startTime}|${r.endTime}`);
            const slotKeys: string[] = (slotActionForm.getFieldValue('slotKeys') || []).filter((k: string) => allKeys.includes(k));
            if (!slotKeys.length) throw new Error('请至少选择一个时段');
            if (slotKeys.length < allKeys.length) {
              for (const key of slotKeys) {
                const [weekday, startTime, endTime] = key.split('|');
                await api.post('/schedules/class-rules/slot-status', {
                  classId: record.id, weekday: Number(weekday), startTime, endTime,
                  action: action === 'suspend' ? 'pause' : 'resume',
                });
              }
              slotOnlyIds.push(record.id);
              succeeded.push(record.id);
              continue;
            }
          }
          if (action === 'delete') await api.delete(`/classes/${record.id}`);
          else await api.put(`/classes/${record.id}`, { status: action === 'suspend' ? 'inactive' : 'active' });
          succeeded.push(record.id);
        } catch (error: any) {
          failed.push({ record, reason: error.response?.data?.error?.message || error.response?.data?.message || error.message || `${actionNames[action]}失败` });
        }
      }
      if (succeeded.length) {
        setClasses(current => current.flatMap(record => !succeeded.includes(record.id) ? [record] : action === 'delete' ? [] : slotOnlyIds.includes(record.id) ? [record] : [{ ...record, status: action === 'suspend' ? 'inactive' : 'active' }]));
        setSelectedRowKeys(current => current.filter(id => !succeeded.includes(String(id))));
        message.success(slotOnlyIds.length ? `已按所选时段${actionNames[action]}，班级整体状态不变` : `${actionNames[action]}成功 ${succeeded.length} 个班级`);
      }
      if (failed.length) {
        setClassAction({ action, records: failed.map(item => item.record) });
        setClassActionError(failed.map(item => `${item.record.name}：${item.reason}`).join('；'));
      } else {
        setClassAction(null);
      }
      if (succeeded.length) {
        if (showExperienceClassOnly) await fetchExperienceClasses();
        else await fetchClasses();
      }
    } finally {
      classActionLock.current = false;
      setClassActionSubmitting(false);
    }
  };

  const handleViewStudents = async (record: any) => {
    setViewingClass(record);
    setStudentsModalVisible(true);
    setStudentsLoading(true);
    try {
      const response = await api.get(`/classes/${record.id}/students`);
      setClassStudents(response.data || []);
    } catch (error: any) {
      console.error('获取班级学员失败:', error);
      message.error(error.message || '获取班级学员失败');
      setClassStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  };

  // 从班级移除学员（2026-11-08 口径细分）：多班在读=仅移除本班（减课，不转流失库，无需填原因）；
  // 最后一个在读班=按流失学员库流程承接（2026-11-07 拍板，流失原因+预计召回必填，由后端校验）。
  const [removeTarget, setRemoveTarget] = useState<{ studentId: string; enrollmentId: string; studentName: string } | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const removeSubmitLock = useRef(false);
  const [lostForm] = Form.useForm();

  const openRemoveStudentFlow = (studentId: string, enrollmentId: string, studentName: string) => {
    if (!viewingClass || removeSubmitLock.current) return;
    lostForm.resetFields();
    lostForm.setFieldsValue({ deleteReason: '时间问题' });
    setRemoveTarget({ studentId, enrollmentId, studentName });
  };

  const handleRemoveStudentSubmit = async (values: any) => {
    if (!removeTarget || !viewingClass || removeSubmitLock.current) return;
    removeSubmitLock.current = true;
    setRemoveSubmitting(true);
    try {
      const response = await api.post<unknown, { message?: string }>(`/enrollments/${removeTarget.enrollmentId}/remove-as-lost`, {
        deleteReason: values.deleteReason,
        expectedRecallDate: values.expectedRecallDate?.format('YYYY-MM-DD'),
      });
      // 后端按是否还有其他在读班返回不同结果消息（减课移除 / 转入流失库）
      message.success(response.message || `已移除「${removeTarget.studentName}」`);
      setRemoveTarget(null);
      await api.get(`/classes/${viewingClass.id}/students`).then(response => setClassStudents(response.data || [])).catch(() => message.warning('移除已完成，名单刷新失败，请重新打开名单'));
      void fetchClasses();
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || error.message || '移除失败');
    } finally {
      removeSubmitLock.current = false;
      setRemoveSubmitting(false);
    }
  };

  const handleAddStudentToClass = (record: any) => {
    setAddingToClass(record);
    setAddStudentModalVisible(true);
  };

  useEffect(() => {
    const refresh = () => {
      if (showExperienceClassOnly) void fetchExperienceClasses();
      else void fetchClasses();
    };
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [showExperienceClassOnly]);

  const handleEnrollmentChanged = () => {
    if (studentsModalVisible && viewingClass?.id) {
      void api.get(`/classes/${viewingClass.id}/students`).then(response => setClassStudents(response.data || [])).catch((error: any) => message.error(error.response?.data?.error?.message || '学员名单刷新失败，请重新打开名单'));
    }
  };

  const columns = [
    {
      title: '班级名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record: any) => (
        <Space direction="vertical" size={0}>
          {canEdit ? (
            <Button type="link" onClick={() => handleScheduleClass(record)}>
              {name}
            </Button>
          ) : <span>{name}</span>}
          {record.scheduleWeekDays?.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginLeft: 8 }}>
              待上课：{record.scheduleWeekDays.map((day: number) => weekDayLabels[day]).join('、')}
            </div>
          )}
          {record.scheduleRule && (
            <div style={{ fontSize: 12, color: 'var(--tx3)', marginLeft: 8 }}>
              <CalendarDays size={16} style={{ marginRight: 4 }} />
              {record.scheduleRule.recurrenceType === 'weekly' ? '每周' : '每日'}
              {record.scheduleRule.weekDays && record.scheduleRule.weekDays.length > 0 && (
                <span>
                  {' '}
                  {record.scheduleRule.weekDays.map((day: number) => 
                    ['日', '一', '二', '三', '四', '五', '六'][day]
                  ).join(',')}
                </span>
              )}
              {' '}
              {/* 确保时间格式一致，处理可能的时区问题 */}
              {typeof record.scheduleRule.startTime === 'string' 
                ? record.scheduleRule.startTime 
                : dayjs(record.scheduleRule.startTime).format('HH:mm')}
              -
              {typeof record.scheduleRule.endTime === 'string' 
                ? record.scheduleRule.endTime 
                : dayjs(record.scheduleRule.endTime).format('HH:mm')}
            </div>
          )}
        </Space>
      ),
    },
    {
      title: '班级时间',
      dataIndex: 'weeklyRules',
      key: 'weeklyRules',
      width: 180,
      render: (rules: any[]) => {
        const rows = formatWeeklyRules(rules);
        if (!rows.length) return <span style={{ color: 'var(--tx3)' }}>未设置</span>;
        return (
          <Space direction="vertical" size={0}>
            {rows.map(row => (
              <span key={row.text} style={{ fontSize: 12 }}>
                <span className="teaching-rule-time"><CalendarDays size={14} style={{ marginRight: 4 }} />{row.time}</span>
                {row.classroom && <span className="teaching-rule-room">{row.classroom}</span>}
              </span>
            ))}
          </Space>
        );
      },
    },
    {
      title: '负责老师',
      dataIndex: ['teacher', 'name'],
      key: 'teacher',
      width: 90,
      render: (name: string) => name || '-',
    },
    { title: '课程类型', dataIndex: 'courseType', key: 'courseType', width: 100, ellipsis: true },
    {
      title: '容量',
      key: 'capacity',
      width: 70,
      render: (_: any, record: any) => {
        const currentStudents = record._count?.enrollments || record.currentStudents || 0;
        const capacity = record.capacity || 0;
        return `${currentStudents}/${capacity}`;
      },
    },
    ...(showExperienceClassOnly
      ? [
          {
            title: '当前学员',
            dataIndex: 'currentStudents',
            key: 'currentStudents',
            width: 90,
            render: (count: number, record: any) => (
              <span>{count} / {record.capacity}</span>
            ),
          },
          {
            title: '空位数',
            dataIndex: 'availableSlots',
            key: 'availableSlots',
            width: 90,
            render: (slots: number) => (
              <span className={`bz-tag ${slots > 5 ? 'tone-ok' : slots > 0 ? 'tone-warn' : 'tone-mute'}`}>{slots} 个空位</span>
            ),
          },
          {
            title: '满班率',
            dataIndex: 'fillRate',
            key: 'fillRate',
            width: 80,
            render: (rate: number) => (
              <span className={`bz-tag ${rate >= 80 ? 'tone-acc' : 'tone-mute'}`}>{rate}%</span>
            ),
          },
        ]
      : []),
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '活跃', color: 'tone-ok' },
          inactive: { text: '停课', color: 'tone-warn' },
          completed: { text: '已结课', color: 'tone-mute' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'tone-mute' };
        return <span className={`bz-tag ${statusInfo.color}`}>{statusInfo.text}</span>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 172,
      fixed: 'right' as const,
      className: 'bz-cell-act',
      render: (_: any, record: any) => (
        <div className="teaching-row-actions">
          <Button className="teaching-primary-action" icon={<Users size={14} />} onClick={() => handleViewStudents(record)}>学员名单</Button>
          {canEdit && <Dropdown trigger={['click']} menu={{ items: [
            ...(canAdjustEnrollment ? [{ key: 'enroll', label: '添加学员 / 调班', icon: <UserPlus size={14} />, onClick: () => handleAddStudentToClass(record) }] : []),
            { key: 'edit', label: '编辑', onClick: () => handleEdit(record) },
            ...(record.status === 'active' ? [{ key: 'suspend', label: '停课', onClick: () => openClassAction('suspend', [record]) }] : record.status === 'inactive' ? [{ key: 'resume', label: '复课', onClick: () => openClassAction('resume', [record]) }] : []),
            { key: 'delete', label: '永久删除', danger: true, onClick: () => openClassAction('delete', [record]) },
          ] }}>
            <Button type="text" className="teaching-more-action" aria-label={`${record.name}的更多操作`} icon={<MoreHorizontal size={16} />} />
          </Dropdown>}
        </div>
      ),
    },
  ];

  // 筛选后的班级列表
  const filteredClasses = useMemo(() => {
    let result = classes;

    // 按老师筛选
    if (filterTeacherId) {
      result = result.filter(cls => cls.teacherId === filterTeacherId);
    }

    // Use real, non-cancelled upcoming occurrences in Asia/Shanghai.
    if (filterWeekDay !== null && filterWeekDay !== undefined) {
      result = result.filter(cls => Array.isArray(cls.scheduleWeekDays) && cls.scheduleWeekDays.includes(filterWeekDay));
    }

    return result;
  }, [classes, filterTeacherId, filterWeekDay]);

  return (
    <div className="cfs-page teaching-page" data-testid="teaching-classes">
      <div className="biz-page-head teaching-heading">
        <div className="biz-head-copy"><h1>班级管理</h1><p>班级、负责老师与排课规则管理。</p></div>
        <div className="biz-head-actions">
          <Space wrap>
            <Button
              icon={<Filter size={16} />}
              type={showExperienceClassOnly ? 'primary' : 'default'}
              onClick={() => {
                setShowExperienceClassOnly(!showExperienceClassOnly);
              }}
            >
              {showExperienceClassOnly ? '取消体验课筛选' : '优先安排体验课班级'}
            </Button>
            {canEdit && <CourseTypeSettings onChanged={handleCourseTypesChanged} />}
            {canEdit && (
              <Button type="primary" icon={<Plus size={16} />} onClick={() => {
                setEditingClass(null);
                form.resetFields();
                setModalVisible(true);
              }}>
                新增班级
              </Button>
            )}
          </Space>
        </div>
      </div>

      {/* 筛选区域 */}
      <div className="biz-filter-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontWeight: 500 }}>筛选：</span>
        <Select
          placeholder="选择老师"
          allowClear
          style={{ width: 140, minWidth: 140 }}
          value={filterTeacherId}
          onChange={(value) => setFilterTeacherId(value ?? null)}
        >
          {teachers.map(teacher => (
            <Select.Option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </Select.Option>
          ))}
        </Select>
        <Select
          placeholder="选择星期"
          allowClear
          style={{ width: 110, minWidth: 110 }}
          value={filterWeekDay}
          aria-label="按开课星期筛选"
          onChange={(value) => setFilterWeekDay(value ?? null)}
        >
          <Select.Option value={1}>周一</Select.Option>
          <Select.Option value={2}>周二</Select.Option>
          <Select.Option value={3}>周三</Select.Option>
          <Select.Option value={4}>周四</Select.Option>
          <Select.Option value={5}>周五</Select.Option>
          <Select.Option value={6}>周六</Select.Option>
          <Select.Option value={0}>周日</Select.Option>
        </Select>
        {(filterTeacherId || filterWeekDay !== null) && (
          <Button size="small" onClick={() => {
            setFilterTeacherId(null);
            setFilterWeekDay(null);
          }}>
            清除
          </Button>
        )}
        <span style={{ color: 'var(--tx3)', marginLeft: 'auto' }}>
          共 {filteredClasses.length} 个班级 {filterWeekDay !== null && filterWeekDay !== undefined && `（${weekDayLabels[filterWeekDay]}有待上课程，按北京时间）`}
        </span>
      </div>

      {/* 批量操作栏 */}
      {canEdit && selectedRowKeys.length > 0 && (
        <div className="bz-selection-bar teaching-selection-bar">
          <span>已选择 <strong>{selectedRowKeys.length}</strong> 个班级</span>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          <Button size="small" onClick={() => openClassAction('suspend', classes.filter(record => selectedRowKeys.includes(record.id)))}>批量停课</Button>
          <Button size="small" onClick={() => openClassAction('resume', classes.filter(record => selectedRowKeys.includes(record.id)))}>批量复课</Button>
          <Button size="small" danger onClick={() => openClassAction('delete', classes.filter(record => selectedRowKeys.includes(record.id)))}>批量永久删除</Button>
        </div>
      )}

      {/* 班级列表 */}
      <div className="bz-table-wrap teaching-table-shell" data-testid="classes-table">
      <Table
        columns={columns}
        dataSource={filteredClasses}
        loading={loading}
        rowKey="id"
        tableLayout="fixed"
        scroll={{ x: showExperienceClassOnly ? 1180 : 960 }}
        rowSelection={
          canEdit
            ? {
                selectedRowKeys,
                onChange: (newSelectedRowKeys: React.Key[]) => {
                  setSelectedRowKeys(newSelectedRowKeys);
                },
                selections: [
                  Table.SELECTION_ALL,
                  Table.SELECTION_INVERT,
                  Table.SELECTION_NONE,
                ],
              }
            : undefined
        }
      />
      </div>

      <Modal
        title={classAction ? `确认${actionNames[classAction.action]}` : ''}
        open={!!classAction}
        onCancel={() => { if (!classActionSubmitting) { setClassAction(null); setClassActionError(''); } }}
        onOk={submitClassAction}
        confirmLoading={classActionSubmitting}
        closable={!classActionSubmitting}
        maskClosable={!classActionSubmitting}
        cancelButtonProps={{ disabled: classActionSubmitting }}
        okText={classAction ? `确认${actionNames[classAction.action]}` : '确认'}
        okButtonProps={{ danger: classAction?.action === 'delete' }}
        cancelText="取消"
      >
        {classAction && <>
          <p>确定要{actionNames[classAction.action]} {classAction.records.length === 1 ? `班级「${classAction.records[0].name}」` : `${classAction.records.length} 个${classAction.action === 'delete' ? '' : '符合状态的'}班级`}吗？</p>
          {classAction.action === 'delete' && <p>班级将从管理中移除，删除后不可恢复，也无法复课。历史报名、考勤、课消和账务记录保留；未来课程将从课表移除，已产生的点名和课时记录保留。学员的报名与课时记录保留，剩余课时不会自动变更。</p>}
          {classAction.action === 'suspend' && <p>停课后，该班级尚未开始的未来课程将暂停。已完成的课程及历史报名、考勤、课消和账务记录保留。</p>}
          {classAction.action === 'resume' && <p>复课时将恢复因本次班级停课而暂停、且尚未开始的课程，原先单独取消的课程不会恢复。如果课程时间、老师或教室存在冲突，该班级不会复课，也不会恢复课程；请先根据提示处理冲突，再重试。</p>}
          {(classAction.action === 'suspend' || classAction.action === 'resume') && classAction.records.length === 1 && (classAction.records[0].weeklyRules || []).length > 1 && (
            <Form form={slotActionForm} layout="vertical" style={{ marginTop: 8 }}>
              <Form.Item
                name="slotKeys"
                label={classAction.action === 'suspend' ? '要停的时段（不勾选的时段照常上课）' : '要恢复的时段（不勾选的时段保持暂停）'}
                initialValue={classAction.records[0].weeklyRules.map((r: any) => `${r.weekday}|${r.startTime}|${r.endTime}`)}
                rules={[{ required: true, message: '请至少选择一个时段；要操作全部时段可保持全选' }]}
              >
                <Checkbox.Group
                  options={classAction.records[0].weeklyRules.map((r: any) => ({
                    value: `${r.weekday}|${r.startTime}|${r.endTime}`,
                    label: `${weekDayLabels[r.weekday] ?? '?'} ${r.startTime}-${r.endTime}${r.classroom ? ` · ${r.classroom}` : ''}`,
                  }))}
                />
              </Form.Item>
              <p style={{ color: 'var(--tx3)', fontSize: 12 }}>全选 = 整班停课/复课（原流程）；只选部分 = 仅该时段的未来场次暂停/恢复，班级整体状态不变。</p>
            </Form>
          )}
          {classActionError && <Alert type="error" showIcon message="操作未完成" description={classActionError} />}
        </>}
      </Modal>

      <Modal
        title={editingClass ? '编辑班级' : '新增班级'}
        open={modalVisible}
        confirmLoading={classFormSubmitting}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} onFinish={submitClassForm} layout="vertical">
          <Form.Item name="name" label="班级名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="teacherId" label="负责老师">
            <Select
              placeholder="请选择负责老师"
              allowClear
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {teachers.map((teacher) => (
                <Select.Option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {courseTypesError && <Alert type="error" message={courseTypesError} action={<Button onClick={() => void loadCourseTypes()}>重试加载课程类型</Button>} style={{ marginBottom: 12 }} />}
          <Form.Item name="courseType" label="课程类型" extra="课程类型在班级中确定，排课时自动沿用。" rules={[
            { required: true, message: '请选择课程类型' },
            { validator: (_, value) => !courseTypesLoading && !courseTypesError && courseTypeOptions.some(option => option.value === value) ? Promise.resolve() : Promise.reject(new Error('请加载课程类型并选择有效选项')) },
          ]}>
            <Select showSearch optionFilterProp="label" placeholder="搜索并选择课程类型" loading={courseTypesLoading} disabled={courseTypesLoading || !!courseTypesError} options={courseTypeOptions} notFoundContent="暂无匹配类型，可在下方新建课程类型" />
          </Form.Item>
          <div style={{ marginTop: -12, marginBottom: 16 }}>
            {!courseTypesLoading && !courseTypesError && courseTypeOptions.length === 0 && <p style={{ color: 'var(--tx2)' }}>暂无课程类型，请先新建，已填写的班级资料会保留。</p>}
            <CourseTypeSettings onChanged={handleCourseTypesChanged} />
          </div>
          <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>

          <Form.Item label="班级时间" extra="常规每周上课规则（按北京时间）：确定星期与起止时间，可添加多条。保存班级只保存规则，不会生成课程；生成课表请到「每周排课 → 新增排课」。">
            <Form.List name="weeklyRules">
              {(fields, { add, remove }) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fields.map(field => (
                    <Space key={field.key} align="baseline" wrap>
                      <Form.Item
                        name={[field.name, 'weekday']}
                        rules={[{ required: true, message: '选择星期' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select placeholder="星期" style={{ width: 96 }}>
                          {[1, 2, 3, 4, 5, 6, 0].map(day => (
                            <Select.Option key={day} value={day}>{weekDayLabels[day]}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'timeRange']}
                        rules={[
                          { required: true, message: '选择起止时间' },
                          { validator: (_, value) => !value || !value[0] || !value[1] || value[1].format('HH:mm') > value[0].format('HH:mm') ? Promise.resolve() : Promise.reject(new Error('结束时间须晚于开始时间')) },
                        ]}
                        style={{ marginBottom: 0 }}
                      >
                        <TimePicker.RangePicker format="HH:mm" order={false} placeholder={['开始', '结束']} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'classroom']} style={{ marginBottom: 0 }}>
                        <Input placeholder="地点（选填）" style={{ width: 130 }} />
                      </Form.Item>
                      <Button type="text" danger onClick={() => remove(field.name)}>删除</Button>
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    block
                    icon={<Plus size={16} />}
                    onClick={() => add({ weekday: undefined, timeRange: undefined, classroom: '' })}
                  >
                    添加上课时间
                  </Button>
                </div>
              )}
            </Form.List>
          </Form.Item>

          <Alert type="info" showIcon message={editingClass ? '保存班级资料与班级时间不会更改已有课程；重排未来课程请到每周排课确认影响后再操作。' : '保存班级只登记资料与班级时间，不会直接产生课程。'} />
        </Form>
      </Modal>


      {/* 按班级时间预览重排弹窗 */}
      <Modal
        title={schedulingClass ? `按班级时间重排 · ${schedulingClass.name}` : '按班级时间重排'}
        open={canEdit && scheduleModalVisible}
        onCancel={closeScheduleModal}
        footer={null}
        width={640}
      >
        <Form form={scheduleForm} layout="vertical" disabled={scheduleSubmitting} onValuesChange={invalidateReplacePreview}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>班级时间</div>
            {(() => {
              const rows = schedulingClass ? formatWeeklyRules(schedulingClass.weeklyRules) : [];
              if (!rows.length) return <span style={{ color: 'var(--tx3)' }}>该班还没有班级时间，请先在班级管理补充每周上课时间</span>;
              return (
                <Space direction="vertical" size={0}>
                  {rows.map((row: any) => <span key={row.text} style={{ fontSize: 12 }}>{row.text}</span>)}
                </Space>
              );
            })()}
          </div>
          <Space wrap align="end" style={{ marginBottom: 12 }}>
            <Form.Item name="startDate" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]} style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: 140 }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="endDate" label="结束日期" style={{ marginBottom: 0 }}>
              <DatePicker style={{ width: 140 }} format="YYYY-MM-DD" />
            </Form.Item>
            <Button
              loading={replaceLoading}
              onClick={handleReschedulePreview}
              disabled={!schedulingClass || formatWeeklyRules(schedulingClass?.weeklyRules).length === 0}
            >
              {replacePreview ? '重新预览' : '生成预览'}
            </Button>
          </Space>
          {replacePreview && (
            <div style={{ marginBottom: 12 }}>
              <Alert
                type="warning"
                showIcon
                message={`确认后将替换该班所有未开始的未来场次；已有考勤或课时记录的场次受保护，遇到保护会整批不执行${replacePreview.skippedPast > 0 ? `；已跳过 ${replacePreview.skippedPast} 场过去日期` : ''}`}
              />
              {replacePreview.conflicts?.length > 0 && (
                <Alert
                  type="error"
                  showIcon
                  message="以下场次存在冲突，确认重排将被整批拒绝"
                  description={
                    <Space direction="vertical" size={2}>
                      {replacePreview.conflicts.map((item: any, index: number) => (
                        <span key={index}>{item.businessDate || ''} {item.startTime ? dayjs(item.startTime).format('HH:mm') : ''} {item.reason || item.message || ''}</span>
                      ))}
                    </Space>
                  }
                />
              )}
              <Table
                size="small"
                style={{ marginTop: 8 }}
                pagination={false}
                rowKey={(row: any) => `${row.businessDate}-${row.startTime}`}
                dataSource={replacePreview.occurrences || []}
                columns={[
                  { title: '日期', dataIndex: 'businessDate' },
                  { title: '星期', dataIndex: 'weekday', render: (v: number) => weekDayLabels[v] ?? '-' },
                  { title: '时间', render: (_: any, row: any) => `${dayjs(row.startTime).format('HH:mm')}-${dayjs(row.endTime).format('HH:mm')}` },
                  { title: '地点', dataIndex: 'classroom', render: (v: string) => v || '-' },
                ]}
              />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button disabled={scheduleSubmitting} onClick={closeScheduleModal}>取消</Button>
            <Button type="primary" loading={scheduleSubmitting} disabled={!replacePreview} onClick={handleRescheduleConfirm}>
              确认重排
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 学员名单弹窗 */}
      <Modal
        title={
          <Space>
            <Users size={16} />
            <span>{viewingClass?.name} - 学员名单</span>
          </Space>
        }
        open={studentsModalVisible}
        onCancel={() => {
          setStudentsModalVisible(false);
          setViewingClass(null);
          setClassStudents([]);
        }}
        footer={null}
        width={900}
      >
        {viewingClass && (
          <div style={{ marginBottom: 16 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="班级代码">{viewingClass.code}</Descriptions.Item>
              <Descriptions.Item label="负责老师">{viewingClass.teacher?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="课程类型">{viewingClass.courseType}</Descriptions.Item>
              <Descriptions.Item label="班级容量">
                {viewingClass._count?.enrollments || viewingClass.currentStudents || classStudents.length} / {viewingClass.capacity}
              </Descriptions.Item>
              <Descriptions.Item label="班级状态">
                <Tag color={viewingClass.status === 'active' ? 'green' : viewingClass.status === 'inactive' ? 'orange' : 'default'}>
                  {viewingClass.status === 'active' ? '活跃' : viewingClass.status === 'inactive' ? '停课' : viewingClass.status === 'completed' ? '已结课' : viewingClass.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="班级时间">
                {(() => {
                  const rows = formatWeeklyRules(viewingClass.weeklyRules);
                  if (!rows.length) return <span style={{ color: 'var(--tx3)' }}>未设置</span>;
                  return (
                    <Space direction="vertical" size={0}>
                      {rows.map(row => <span key={row.text} style={{ fontSize: 12 }}>{row.text}</span>)}
                    </Space>
                  );
                })()}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
        
        <Table
          columns={[
            {
              title: '学员姓名',
              dataIndex: 'name',
              key: 'name',
            },
            {
              title: '性别',
              dataIndex: 'gender',
              key: 'gender',
              render: (gender: string) => gender === 'M' ? '男' : gender === 'F' ? '女' : '-',
            },
            {
              title: '联系电话',
              dataIndex: 'phone',
              key: 'phone',
              render: (phone: string, record: any) => phone || record.parentPhone || '-',
            },
            {
              title: '家长姓名',
              dataIndex: 'parentName',
              key: 'parentName',
              render: (name: string) => name || '-',
            },
            {
              title: '加入日期',
              dataIndex: 'enrollmentDate',
              key: 'enrollmentDate',
              render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
              sorter: (a: any, b: any) => {
                if (!a.enrollmentDate) return 1;
                if (!b.enrollmentDate) return -1;
                return new Date(a.enrollmentDate).getTime() - new Date(b.enrollmentDate).getTime();
              },
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              render: (status: string) => {
                const statusMap: Record<string, { text: string; color: string }> = {
                  active: { text: '在读', color: 'green' },
                  inactive: { text: '停课', color: 'orange' },
                  graduated: { text: '毕业', color: 'blue' },
                };
                const statusInfo = statusMap[status] || { text: status, color: 'default' };
                return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
              },
            },
            ...(canEdit ? [{
              title: '操作',
              key: 'action',
              render: (_: any, record: any) => (
                <Button
                  type="link"
                  danger
                  onClick={() => openRemoveStudentFlow(record.id, record.enrollmentId, record.name)}
                >
                  移除
                </Button>
              ),
            }] : []),
          ]}
          dataSource={classStudents}
          loading={studentsLoading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 名学员`,
          }}
        />
      </Modal>

      {/* 移除学员 → 流失学员库承接弹窗 */}
      <Modal
        title={removeTarget ? `移除学员 · ${removeTarget.studentName}` : '移除学员'}
        open={!!removeTarget}
        onCancel={() => { if (!removeSubmitLock.current) setRemoveTarget(null); }}
        onOk={() => lostForm.submit()}
        confirmLoading={removeSubmitting}
        okText="确认移除"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: 'var(--tx2)', marginBottom: 12 }}>
          若学员仍在其他班级在读，将仅从本班移除（减课，不转入流失库，无需填写下方信息）；
          若这是TA最后一个在读班，将转入流失学员库（需填写流失原因与预计召回时间），后续可在「流失学员库」召回。
        </p>
        <Form form={lostForm} onFinish={handleRemoveStudentSubmit} layout="vertical" disabled={removeSubmitting}>
          <Form.Item
            name="deleteReason"
            label="流失原因（仅最后一个在读班时必填）"
          >
            <Select placeholder="请选择流失原因" allowClear>
              <Select.Option value="时间问题">时间问题</Select.Option>
              <Select.Option value="生病问题">生病问题</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="expectedRecallDate"
            label="预计召回时间（仅最后一个在读班时必填）"
          >
            <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <ClassEnrollmentModal
        open={addStudentModalVisible}
        targetClassId={addingToClass?.id}
        onCancel={() => { setAddStudentModalVisible(false); setAddingToClass(null); }}
        onSuccess={handleEnrollmentChanged}
      />
    </div>
  );
};

export default Classes;

