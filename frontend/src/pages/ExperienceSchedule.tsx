import { useOverlaySubmit, Modal } from '../components/overlays';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Table, Button, Space, message, Form, Input, Select, DatePicker, InputNumber, Radio, Collapse, Segmented, Alert, Dropdown } from 'antd';
import { Plus as PlusOutlined, Pencil as EditOutlined, Trash2 as DeleteOutlined, UserRoundPlus as UserAddOutlined, Import as ImportOutlined, CircleCheck as CheckCircleOutlined, RotateCw as ReloadOutlined, Clock3 as ClockCircleOutlined, UserRoundX as UserDeleteOutlined, Search as SearchOutlined } from 'lucide-react';
import './CashflowSummary.css';
import './CashflowPages.css';
import { MoreHorizontal, CalendarX2 } from 'lucide-react';
import api from '../services/api';
import { dataService } from '../services/dataService';
import { getDataScopeFilter, normalizeRole } from '../utils/dataFilter';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';
import './ExperienceSchedule.css';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  registrationStorageKey, readPendingRegistration, createPendingRegistration,
  clearPendingRegistration, isDefinitiveRegistrationFailure,
  type PendingRegistration,
} from '../utils/registrationRequest';

dayjs.extend(utc);
dayjs.extend(timezone);

interface AvailableSchedule {
  id: string;
  classId: string;
  className: string;
  startTime: string;
  endTime: string;
  classroom: string | null;
  teacherId: string | null;
  teacherName: string | null;
}

const shanghaiTime = (value: string) => dayjs(value).tz('Asia/Shanghai');
const scheduleLabel = (schedule: AvailableSchedule) => {
  const start = shanghaiTime(schedule.startTime);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][start.day()];
  return `${start.format('M月D日')} ${week} ${start.format('HH:mm')}–${shanghaiTime(schedule.endTime).format('HH:mm')}`;
};
import { useBzExpand, bzExpandable, bzRowClass } from '../hooks/useBzExpand';
import { useBusinessRefresh } from '../hooks/useBusinessRefresh';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search } = Input;

// 统一的来源选项（与鱼池表保持一致）
const SOURCE_OPTIONS = [
  { value: 'meituan', label: '美团', color: 'yellow' },
  { value: 'groundPromotion', label: '地推', color: 'green' },
  { value: 'telemarketing', label: '电销', color: 'blue' },
  { value: 'walkIn', label: '上门', color: 'orange' },
  { value: 'referral', label: '转介绍', color: 'purple' },
  { value: 'crossIndustry', label: '异业', color: 'cyan' },
];

// 来源映射（用于兼容旧数据）
const SOURCE_MAP: Record<string, { text: string; color: string }> = {};
SOURCE_OPTIONS.forEach(opt => {
  SOURCE_MAP[opt.value] = { text: opt.label, color: opt.color };
});

interface StaffUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface ClassInfo {
  id: string;
  name: string;
  code?: string;
  teacher?: { id: string; name: string };
}

interface LeadInfo {
  id: string;
  customerName: string;
  age?: number;
  contact: string;
  source?: string;
  assigneeId?: string;
  assigneeName?: string;
}

// 筛选模式类型
type FilterMode = 'all' | 'pendingConfirm' | 'unconverted';

/**
 * 状态标签语言（bz-tag）：待确认=淡紫、已到课/已成单=低饱和绿、
 * 未成单=橙（需跟进）、未到场=红（真异常）、已取消=中性灰。
 * 口径与旧版一致，仅换文案与色调。
 */
const STATUS_META: Record<string, { text: string; tone: string }> = {
  pending: { text: '待确认', tone: 'tone-acc' },
  completed: { text: '已到课', tone: 'tone-ok' },
  converted: { text: '已成单', tone: 'tone-ok' },
  unconverted: { text: '未成单', tone: 'tone-warn' },
  'no-show': { text: '未到场', tone: 'tone-bad' },
  noshow: { text: '未到场', tone: 'tone-bad' },
  cancelled: { text: '已取消', tone: 'tone-mute' },
};

const experienceSession = () => { const s = useAuthStore.getState(); return JSON.stringify([s.token, s.user?.id, s.user?.organizationId, s.user?.campusId, s.user?.role, s.user?.managementLevel]); };

const ExperienceSchedule = () => {
  // 获取当前用户和权限
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore(state => state.token);
  const sessionKey = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.role, user?.managementLevel]);
  const activeSession = useRef<string | null>(sessionKey); activeSession.current = sessionKey;
  const isCurrent = (key: string) => activeSession.current === key && experienceSession() === key;
  const listRequest = useRef(0), statsRequest = useRef(0), classesRequest = useRef(0), staffRequest = useRef(0), leadsRequest = useRef(0);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageAll = normalizedRole === 'admin' || normalizedRole === 'manager';

  const [data, setData] = useState<any[]>([]);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const [pinTableColumns, setPinTableColumns] = useState(false);
  useLayoutEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    // The three pinned columns use 376px. Leave enough space to read and scroll the other columns.
    const fitColumns = () => setPinTableColumns(viewport.clientWidth >= 660);
    fitColumns();
    const observer = new ResizeObserver(fitColumns);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();
  const [registrationMode, setRegistrationMode] = useState<'schedule' | 'manual'>('schedule');
  const [availableSchedules, setAvailableSchedules] = useState<AvailableSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesError, setSchedulesError] = useState('');
  const [schedulesPeriod, setSchedulesPeriod] = useState<{ start: string; end: string } | null>(null);
  const scheduleRequestRef = useRef(0);
  const scheduleAbortRef = useRef<AbortController | null>(null);
  const submitBusyRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);
  const selectedClassId = Form.useWatch('classId', form);
  const selectedScheduleId = Form.useWatch('scheduleId', form);
  const selectedSchedule = availableSchedules.find(schedule => schedule.id === selectedScheduleId);
  const linkedEdit = Boolean(editingRecord?.scheduleId);
  const linkedFields = linkedEdit || (!editingRecord && registrationMode === 'schedule');
  const pendingKey = user?.id && user.organizationId && user.campusId ? registrationStorageKey('experience', user) : '';

  useEffect(() => () => {
    scheduleAbortRef.current?.abort();
    scheduleRequestRef.current += 1;
  }, []);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [teacherFilter, setTeacherFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [studentNameSearch, setStudentNameSearch] = useState<string>('');
  const [conversionStats, setConversionStats] = useState<any[]>([]);
  const [statsDateRange, setStatsDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // 筛选模式：all-全部, pendingConfirm-待上课确认, unconverted-未成单回访
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // 新增：来源类型和鱼池线索
  const [sourceType, setSourceType] = useState<'new' | 'lead'>('new');
  const [leadsList, setLeadsList] = useState<LeadInfo[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);


  // 批量选择相关状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchStatusModalVisible, setBatchStatusModalVisible] = useState(false);
  const [submitBatchStatus, batchStatusSubmitting] = useOverlaySubmit((values: any) => handleBatchStatusUpdate(values));
  const [batchStatusForm] = Form.useForm();

  // 行展开（bz-table 单行展开状态机：收起走 180ms 退出动效后卸载）
  const bz = useBzExpand();

  const listKey = JSON.stringify([sessionKey, pagination.current, pagination.pageSize, teacherFilter, assigneeFilter, filterMode, studentNameSearch]);
  const statsKey = JSON.stringify([sessionKey, teacherFilter, assigneeFilter, statsDateRange]);
  const currentListKey = useRef(listKey); currentListKey.current = listKey;
  const currentStatsKey = useRef(statsKey); currentStatsKey.current = statsKey;
  useEffect(() => {
    activeSession.current = sessionKey; listRequest.current++; statsRequest.current++; classesRequest.current++; staffRequest.current++; leadsRequest.current++;
    setData([]); setConversionStats([]); setClasses([]); setStaffList([]); setLeadsList([]); setLoading(false);
    scheduleAbortRef.current?.abort(); scheduleRequestRef.current++; setAvailableSchedules([]); setSchedulesLoading(false);
    return () => { activeSession.current = null; listRequest.current++; statsRequest.current++; classesRequest.current++; staffRequest.current++; leadsRequest.current++; };
  }, [sessionKey]);
  useEffect(() => {
    if (!user?.organizationId || !user.campusId) return;
    void fetchClasses(); void fetchStaffList(); void fetchLeadsList();
  }, [sessionKey]);
  useEffect(() => { if (user?.organizationId && user.campusId) void fetchData(); }, [listKey]);
  useEffect(() => { if (user?.organizationId && user.campusId) void fetchTeacherStats(); }, [statsKey]);
  useBusinessRefresh(() => {
    if (!user?.organizationId || !user.campusId) return;
    void fetchData(); void fetchTeacherStats(); void fetchLeadsList(true); void fetchStaffList(); void fetchClasses();
  });

  const fetchData = async () => {
    const request = ++listRequest.current, key = sessionKey, query = listKey;
    if (!user?.organizationId || !user.campusId) return;
    setLoading(true);
    try {
      // 应用数据过滤：teacher 角色只看自己负责的体验课
      const filter = getDataScopeFilter('experiences');

      // 根据筛选模式设置状态过滤
      let statusParam: string | undefined;
      let unconvertedOnly = false;

      if (filterMode === 'pendingConfirm') {
        // 待上课确认：包含待上课、未到场、已取消（待上课邀约的）
        statusParam = 'pending,no-show,noshow,cancelled';
      } else if (filterMode === 'unconverted') {
        // 未成单回访：到场后未成单
        statusParam = undefined;
        unconvertedOnly = true;
      }

      const response = await api.get('/experience-lessons', {
        params: {
          page: pagination.current,
          pageSize: pagination.pageSize,
          teachingTeacherId: teacherFilter || undefined,
          assigneeId: assigneeFilter || filter.assigneeId || undefined,
          status: statusParam || undefined,
          unconvertedOnly,
          studentName: studentNameSearch || undefined,
        }
      });
      if (request !== listRequest.current || query !== currentListKey.current || !isCurrent(key)) return;
      setData(response.data || []);
      if (response.pagination && response.pagination.total !== undefined) {
        setPagination(prev => ({
          ...prev,
          total: response.pagination!.total || 0,
        }));
      }
    } catch (error: any) {
      if (request === listRequest.current && query === currentListKey.current && isCurrent(key)) { console.error('获取体验课列表失败'); message.error(error.response?.data?.error?.message || error.message || '获取体验课列表失败'); }
    } finally {
      if (request === listRequest.current && query === currentListKey.current && isCurrent(key)) setLoading(false);
    }
  };

  const fetchClasses = async () => {
    const request = ++classesRequest.current, key = sessionKey;
    try {
      const data = await dataService.getClasses();
      if (request === classesRequest.current && isCurrent(key)) setClasses(data);
    } catch {
      if (request === classesRequest.current && isCurrent(key)) console.error('获取班级列表失败');
    }
  };

  const fetchStaffList = async () => {
    const request = ++staffRequest.current, key = sessionKey;
    try {
      const data = await dataService.getStaffList();
      if (request === staffRequest.current && isCurrent(key)) setStaffList(data);
    } catch {
      if (request === staffRequest.current && isCurrent(key)) console.error('获取工作人员列表失败');
    }
  };

  const fetchTeacherStats = async () => {
    const request = ++statsRequest.current, key = sessionKey, query = statsKey;
    try {
      const response = await api.get('/experience-lessons/stats', {
        params: {
          teachingTeacherId: teacherFilter || undefined,
          assigneeId: assigneeFilter || undefined,
          startDate: statsDateRange?.[0] ? statsDateRange[0].format('YYYY-MM-DD') : undefined,
          endDate: statsDateRange?.[1] ? statsDateRange[1].format('YYYY-MM-DD') : undefined,
        }
      });
      if (request === statsRequest.current && query === currentStatsKey.current && isCurrent(key)) setConversionStats(response.data || []);
    } catch (error: any) {
      if (request === statsRequest.current && query === currentStatsKey.current && isCurrent(key)) console.error('获取体验课成单率失败');
    }
  };

  const handleStatsDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setStatsDateRange(dates);
  };

  // 获取鱼池线索列表（使用缓存）
  const fetchLeadsList = async (forceRefresh = false) => {
    const request = ++leadsRequest.current, key = sessionKey;
    try {
      const data = await dataService.getLeads(forceRefresh);
      if (request === leadsRequest.current && isCurrent(key)) setLeadsList(data);
    } catch {
      if (request === leadsRequest.current && isCurrent(key)) console.error('获取鱼池线索失败');
    }
  };

  const clearScheduleFields = () => {
    form.setFieldsValue({
      scheduleId: undefined, scheduleDate: null, startTime: undefined, endTime: undefined,
      classroom: undefined, teachingTeacherId: undefined, teachingTeacherName: undefined,
    });
  };

  const resetScheduleQuery = () => {
    scheduleAbortRef.current?.abort();
    scheduleRequestRef.current += 1;
    setAvailableSchedules([]);
    setSchedulesError('');
    setSchedulesLoading(false);
    setSchedulesPeriod(null);
  };

  const fetchAvailableSchedules = async (classId: string) => {
    scheduleAbortRef.current?.abort();
    const controller = new AbortController();
    scheduleAbortRef.current = controller;
    const request = ++scheduleRequestRef.current, key = sessionKey;
    setSchedulesLoading(true);
    setSchedulesError('');
    setAvailableSchedules([]);
    setSchedulesPeriod(null);
    try {
      const response = await api.get('/experience-lessons/available-schedules', {
        params: { classId }, signal: controller.signal,
      });
      if (request !== scheduleRequestRef.current || controller.signal.aborted || !isCurrent(key)) return;
      if (!Array.isArray(response.data?.schedules)) throw new Error('排课数据格式异常，请重试');
      setAvailableSchedules(response.data.schedules);
      setSchedulesPeriod(response.data.period || null);
    } catch (error: any) {
      if (request !== scheduleRequestRef.current || controller.signal.aborted || !isCurrent(key)) return;
      setSchedulesError(error.response?.data?.error?.message || error.response?.data?.message || error.message || '排课查询失败，请重试');
    } finally {
      if (request === scheduleRequestRef.current && isCurrent(key)) setSchedulesLoading(false);
    }
  };

  const handleAdd = () => {
    if (submitBusyRef.current) return;
    if (!pendingKey) {
      message.error('未分配机构或校区，无法登记体验课');
      return;
    }
    try {
      const pending = pendingKey ? readPendingRegistration(pendingKey) : null;
      resetScheduleQuery();
      setEditingRecord(null);
      setPendingRegistration(pending);
      setSourceType(pending?.payload.leadId ? 'lead' : 'new');
      setSelectedLeadId(pending?.payload.leadId as string || null);
      setRegistrationMode(pending?.payload.scheduleId ? 'schedule' : pending ? 'manual' : 'schedule');
      form.resetFields();
      form.setFieldsValue(pending ? {
        ...pending.payload,
        scheduleDate: pending.payload.scheduleDate ? dayjs(pending.payload.scheduleDate as string) : null,
      } : { status: 'pending', assigneeId: !canManageAll ? user?.id : undefined });
      setModalVisible(true);
    } catch (error: any) {
      message.error(error.message || '无法读取待确认登记，请刷新后重试');
    }
  };

  // 选择鱼池线索时，自动填充表单
  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
    const lead = leadsList.find(l => l.id === leadId);
    if (lead) {
      form.setFieldsValue({
        studentName: lead.customerName,
        age: lead.age,
        contact: lead.contact,
        source: lead.source,
        assigneeId: lead.assigneeId,
      });
    }
  };

  const handleClassSelect = (classId?: string) => {
    clearScheduleFields();
    resetScheduleQuery();
    if (classId && !editingRecord && registrationMode === 'schedule') {
      void fetchAvailableSchedules(classId);
    }
  };

  const handleScheduleSelect = (scheduleId?: string) => {
    const schedule = availableSchedules.find(item => item.id === scheduleId);
    clearScheduleFields();
    if (!schedule) return;
    const start = shanghaiTime(schedule.startTime);
    form.setFieldsValue({
      scheduleId: schedule.id,
      scheduleDate: dayjs(start.format('YYYY-MM-DD')),
      startTime: start.format('HH:mm'),
      endTime: shanghaiTime(schedule.endTime).format('HH:mm'),
      classroom: schedule.classroom || undefined,
      teachingTeacherId: schedule.teacherId || undefined,
      teachingTeacherName: schedule.teacherName || undefined,
    });
  };

  const handleModeChange = (mode: 'schedule' | 'manual') => {
    setRegistrationMode(mode);
    clearScheduleFields();
    resetScheduleQuery();
    if (mode === 'schedule' && selectedClassId) void fetchAvailableSchedules(selectedClassId);
  };

  const handleEdit = (record: any) => {
    if (submitBusyRef.current) return;
    resetScheduleQuery();
    setPendingRegistration(null);
    setEditingRecord(record);
    setSourceType('new');
    setSelectedLeadId(null);
    setRegistrationMode('manual');
    form.resetFields();
    form.setFieldsValue({
      ...record,
      scheduleDate: record.scheduleDate ? dayjs(record.scheduleDate) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      okText: '确认删除',
      okButtonProps: { danger: true },
      content: '确定要删除该体验课记录吗？',
      onOk: async () => {
        try {
          await api.delete(`/experience-lessons/${id}`);
          message.success('删除成功');
          fetchData();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  // 批量删除体验课
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的记录');
      return;
    }

    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条记录吗？此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          let successCount = 0;
          let failCount = 0;

          for (const id of selectedRowKeys) {
            try {
              await api.delete(`/experience-lessons/${id}`);
              successCount++;
            } catch {
              failCount++;
            }
          }

          if (failCount === 0) {
            message.success(`成功删除 ${successCount} 条记录`);
          } else {
            message.warning(`成功删除 ${successCount} 条，失败 ${failCount} 条`);
          }

          setSelectedRowKeys([]);
          fetchData();
        } catch (error: any) {
          console.error('批量删除失败:', error);
          message.error(error.message || '批量删除失败');
        }
      },
    });
  };

  // 批量更新状态
  const handleBatchStatusUpdate = async (values: any) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要更新的记录');
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const id of selectedRowKeys) {
        try {
          await api.put(`/experience-lessons/${id}/status`, { status: values.status });
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (failCount === 0) {
        message.success(`成功更新 ${successCount} 条记录`);
      } else {
        message.warning(`成功更新 ${successCount} 条，失败 ${failCount} 条`);
      }

      setSelectedRowKeys([]);
      setBatchStatusModalVisible(false);
      batchStatusForm.resetFields();
      fetchData();
    } catch (error: any) {
      console.error('批量更新失败:', error);
      message.error(error.message || '批量更新失败');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.put(`/experience-lessons/${id}/status`, { status });
      message.success('状态更新成功');
      fetchData();
    } catch (error: any) {
      message.error(error.message || '状态更新失败');
    }
  };

  const sendRegistration = async (pending: PendingRegistration) => {
    await api.post('/experience-lessons', { ...pending.payload, requestId: pending.requestId }, {
      headers: { 'Idempotency-Key': pending.requestId },
    });
    clearPendingRegistration(pendingKey);
    setPendingRegistration(null);
    message.success('创建成功');
    dataService.onLeadChanged();
    void fetchLeadsList();
  };

  const finishSubmit = () => {
    setModalVisible(false);
    setSelectedLeadId(null);
    form.resetFields();
    resetScheduleQuery();
    void fetchData();
  };

  const retryPendingRegistration = async () => {
    if (submitBusyRef.current || !pendingRegistration) return;
    submitBusyRef.current = true;
    setSubmitting(true);
    try {
      await sendRegistration(pendingRegistration);
      finishSubmit();
    } catch (error: any) {
      if (isDefinitiveRegistrationFailure(error)) {
        clearPendingRegistration(pendingKey);
        setPendingRegistration(null);
      }
      message.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || '登记结果仍待确认，请重试原登记');
    } finally {
      submitBusyRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = async (values: any) => {
    values = { ...form.getFieldsValue(true), ...values };
    if (submitBusyRef.current) return;
    if (!editingRecord && pendingRegistration) {
      void retryPendingRegistration();
      return;
    }
    if (!editingRecord && sourceType === 'lead' && !selectedLeadId) {
      message.warning('请先选择鱼池线索');
      return;
    }
    if (!editingRecord && registrationMode === 'schedule' && !selectedSchedule) {
      message.warning('请选择真实排课，或切换为手动登记');
      return;
    }
    submitBusyRef.current = true;
    setSubmitting(true);
    let pending: PendingRegistration | null = null;
    try {
      const selectedClass = classes.find(c => c.id === values.classId);
      const selectedTeacher = staffList.find(s => s.id === values.teachingTeacherId);
      const selectedAssignee = staffList.find(s => s.id === values.assigneeId);
      const submitData: Record<string, unknown> = {
        studentName: values.studentName,
        age: values.age ?? undefined,
        contact: values.contact,
        source: values.source || undefined,
        leadId: editingRecord ? editingRecord.leadId : sourceType === 'lead' ? selectedLeadId : undefined,
        classId: values.classId || (editingRecord ? null : undefined),
        className: selectedClass?.name || (values.classId ? editingRecord?.className : editingRecord ? null : undefined),
        scheduleId: !editingRecord && registrationMode === 'schedule' ? selectedSchedule?.id : undefined,
        scheduleDate: values.scheduleDate ? values.scheduleDate.format('YYYY-MM-DD') : '',
        startTime: values.startTime || (editingRecord ? null : undefined),
        endTime: values.endTime || (editingRecord ? null : undefined),
        classroom: values.classroom || (editingRecord ? null : undefined),
        teachingTeacherId: values.teachingTeacherId || (editingRecord ? null : undefined),
        teachingTeacherName: selectedSchedule?.teacherName || selectedTeacher?.name || values.teachingTeacherName || (editingRecord ? null : undefined),
        assigneeId: values.assigneeId || undefined,
        assigneeName: selectedAssignee?.name || undefined,
        status: values.status || 'pending',
        notes: values.notes ?? undefined,
      };
      if (linkedEdit) {
        // 已关联场次保留原快照；编辑备注不受该场次是否过期影响。
        for (const field of ['classId', 'className', 'scheduleId', 'scheduleDate', 'startTime', 'endTime', 'classroom', 'teachingTeacherId', 'teachingTeacherName']) {
          delete submitData[field];
        }
      }
      if (editingRecord) {
        await api.put(`/experience-lessons/${editingRecord.id}`, submitData);
        message.success('更新成功');
      } else {
        if (!pendingKey) throw new Error('未分配机构或校区，无法登记体验课');
        pending = createPendingRegistration(pendingKey, submitData);
        setPendingRegistration(pending);
        await sendRegistration(pending);
      }
      finishSubmit();
    } catch (error: any) {
      if (pending && isDefinitiveRegistrationFailure(error)) {
        clearPendingRegistration(pendingKey);
        setPendingRegistration(null);
      }
      message.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || '操作失败');
    } finally {
      submitBusyRef.current = false;
      setSubmitting(false);
    }
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      ...pagination,
      current: newPagination.current,
      pageSize: newPagination.pageSize,
    });
  };

  const handleResetFilters = () => {
    setTeacherFilter(null);
    setAssigneeFilter(null);
    setFilterMode('all');
    setStudentNameSearch('');
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleSearch = (value: string) => {
    setStudentNameSearch(value);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // 获取当前筛选模式的统计信息（保留供将来使用）
  const _getFilterStats = () => {
    const stats = {
      pendingConfirm: 0,
      unconverted: 0,
    };
    // 这些统计可以从后端获取，这里暂时返回空
    return stats;
  };
  void _getFilterStats; // 避免未使用警告

  const columns = [
    {
      title: '学员',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 110,
      fixed: pinTableColumns ? 'left' as const : undefined,
      render: (text: string, record: any) => (
        <button
          type="button"
          className="bz-student"
          title="查看详情"
          onClick={(e) => { e.stopPropagation(); bz.toggleExpand(record.id); }}
        >
          {text || '-'}
        </button>
      ),
    },
    {
      title: '体验时间',
      key: 'schedule',
      width: 130,
      render: (_: any, record: any) => {
        if (!record.scheduleDate) return '-';
        const d = dayjs(record.scheduleDate);
        const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.day()];
        const time = record.startTime
          ? (record.endTime ? `${record.startTime}-${record.endTime}` : record.startTime)
          : '';
        return (
          <div className="bz-time">
            <span className="bz-time-top">{week}{time ? ` ${time}` : ''}</span>
            <span className="bz-time-sub">{d.format('M月D日')}</span>
          </div>
        );
      },
    },
    {
      title: '班级',
      dataIndex: 'className',
      key: 'className',
      width: 140,
      render: (text: string) => text || '-',
    },
    {
      title: '授课老师',
      dataIndex: 'teachingTeacherName',
      key: 'teachingTeacherName',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '当前跟进人',
      dataIndex: 'assigneeName',
      key: 'assigneeName',
      width: 100,
      render: (text: string) => text || <span className="bz-locked">未分配</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      fixed: pinTableColumns ? 'right' as const : undefined,
      render: (status: string, record: any) => {
        if (status === 'converted' && record.hasConfirmedSignup === false) {
          return <span className="bz-tag tone-warn" title="原成单已作废或尚未确认，请到成单信息表核对原记录">到场未成单</span>;
        }
        const meta = STATUS_META[status] || { text: status || '-', tone: 'tone-mute' };
        return <span className={`bz-tag ${meta.tone}`}>{meta.text}</span>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      fixed: pinTableColumns ? 'right' as const : undefined,
      className: 'bz-cell-act',
      render: (_: any, record: any) => (
        <Space size={4}>
          {record.status === 'pending' && (
            <button
              type="button"
              className="bz-act"
              onClick={(e) => { e.stopPropagation(); handleStatusChange(record.id, 'completed'); }}
            >
              确认上课
            </button>
          )}
          {record.status === 'converted' ? (
            // 已成单记录锁定，仅保留 ···（无可用操作）
            <span className="bz-locked" title={record.hasConfirmedSignup === false ? '原成单已作废或尚未确认，请到成单信息表核对原记录' : undefined}>已锁定</span>
          ) : (
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'edit', icon: <EditOutlined size={16} />, label: '编辑', onClick: () => handleEdit(record) },
                  { key: 'delete', icon: <DeleteOutlined size={16} />, label: '删除', danger: true, onClick: () => handleDelete(record.id) },
                ],
              }}
            >
              <button
                type="button"
                className="bz-more"
                aria-label="更多操作"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={16} />
              </button>
            </Dropdown>
          )}
        </Space>
      ),
    },
  ];

  // 根据筛选模式获取表格标题
  const getTableTitle = () => {
    switch (filterMode) {
      case 'pendingConfirm':
        return '待上课确认列表（包含待上课、未到场等状态）';
      case 'unconverted':
        return '未成单回访列表（到场后未成单的客户）';
      default:
        return null;
    }
  };

  return (
    <div className="cfs-page cashflow-page" data-testid="cashflow-experience">
      {/* 页头：主标题+说明+主操作同一行（业务页统一页头模板） */}
      <div className="cfs-heading cashflow-heading">
        <div className="biz-head-copy">
          <h1>体验课表</h1>
          <p>体验课排期、到场与转化跟进；点击行首箭头或学员姓名可快速查看联系方式与跟进记录。</p>
        </div>
        <div className="biz-head-actions">
          <Button type="primary" icon={<PlusOutlined size={16} />} onClick={handleAdd}>
            新增体验课
          </Button>
        </div>
      </div>

      {/* 筛选区域 */}
      <section className="cfs-glass cashflow-toolbar cashflow-experience-filters" aria-label="体验课筛选">
        {/* 快捷筛选按钮 */}
        <div className="cashflow-quick-filter">
          <span className="cashflow-filter-label">查看范围</span>
          <Segmented
            value={filterMode}
            onChange={(value) => {
              setFilterMode(value as FilterMode);
              setPagination(prev => ({ ...prev, current: 1 }));
            }}
            options={[
              {
                value: 'all',
                label: (
                  <div style={{ padding: '4px 8px' }}>
                    <CheckCircleOutlined size={16} style={{ marginRight: 6 }} />
                    全部
                  </div>
                ),
              },
              {
                value: 'pendingConfirm',
                label: (
                  <div style={{ padding: '4px 8px' }}>
                    <ClockCircleOutlined size={16} style={{ marginRight: 6 }} />
                    待上课确认
                  </div>
                ),
              },
              {
                value: 'unconverted',
                label: (
                  <div style={{ padding: '4px 8px' }}>
                    <UserDeleteOutlined size={16} style={{ marginRight: 6 }} />
                    未成单回访
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* 详细筛选 */}
        <div className="cashflow-filter-controls">
          <Select
            placeholder="全部授课老师"
            style={{ width: 140 }}
            value={teacherFilter}
            onChange={(value) => setTeacherFilter(value)}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {staffList.filter(person => ['teacher', 'coach'].includes(person.role || '')).map(teacher => (
              <Option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="全部跟进人"
            style={{ width: 140 }}
            value={assigneeFilter}
            onChange={(value) => setAssigneeFilter(value)}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {staffList.map(person => (
              <Option key={person.id} value={person.id}>
                {person.name}
              </Option>
            ))}
          </Select>
          <Search
            placeholder="搜索学员姓名"
            allowClear
            style={{ width: 180 }}
            value={studentNameSearch}
            onChange={(e) => setStudentNameSearch(e.target.value)}
            onSearch={handleSearch}
            enterButton={<SearchOutlined size={16} />}
          />
          <Button
            icon={<ReloadOutlined size={16} />}
            onClick={handleResetFilters}
            disabled={!teacherFilter && !assigneeFilter && filterMode === 'all' && !studentNameSearch}
          >
            重置筛选
          </Button>
        </div>
      </section>

      {/* 转化率统计日期范围 */}
      <div className="cashflow-stats-period">
        <span className="cashflow-filter-label">转化率统计日期</span>
        <RangePicker
          value={statsDateRange}
          onChange={handleStatsDateChange}
          format="YYYY-MM-DD"
          allowClear
          placeholder={['统计开始日期', '统计结束日期']}
        />
      </div>

      {/* 批量操作栏 */}
      {selectedRowKeys.length > 0 && (
        <div className="cashflow-selection-bar">
          <span>已选择 <strong>{selectedRowKeys.length}</strong> 条记录</span>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          <Button size="small" onClick={() => setBatchStatusModalVisible(true)}>批量更新状态</Button>
          <Button size="small" danger onClick={handleBatchDelete}>批量删除</Button>
        </div>
      )}

      <Collapse className="cashflow-stats-collapse" ghost defaultActiveKey={[]}>
        <Collapse.Panel header="老师转化率（点击展开）" key="statsPanel">
          <Table
            columns={[
              { title: '老师', dataIndex: 'teacherName', key: 'teacherName' },
              { title: '总体验课', dataIndex: 'total', key: 'total', width: 100 },
              { title: '成单', dataIndex: 'converted', key: 'converted', width: 90 },
              {
                title: '转化率',
                dataIndex: 'conversionRate',
                key: 'conversionRate',
                width: 120,
                render: (rate: number) => `${rate || 0}%`,
              },
            ]}
            dataSource={conversionStats}
            pagination={false}
            size="small"
            rowKey="teacherId"
          />
        </Collapse.Panel>
      </Collapse>

      {/* 数据表格（bz-table 表格语言样板） */}
      <div className="bz-table-wrap experience-records-table" ref={tableViewportRef}>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: (newSelectedRowKeys: React.Key[]) => {
              setSelectedRowKeys(newSelectedRowKeys);
            },
            selections: [
              Table.SELECTION_ALL,
              Table.SELECTION_INVERT,
              Table.SELECTION_NONE,
            ],
          }}
          title={getTableTitle}
          expandable={bzExpandable<any>(bz, (record) => (
            <>
              {record.status === 'converted' && record.hasConfirmedSignup === false && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="原成单已作废或尚未确认，请到成单信息表核对原记录" />
              )}
              <dl className="bz-x-grid">
                <div className="bz-x-item">
                  <dt>联系方式</dt>
                  <dd>{record.contact || '-'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>来源</dt>
                  <dd>{record.source ? (SOURCE_MAP[record.source]?.text || record.source) : '-'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>年龄</dt>
                  <dd>{record.age ? `${record.age} 岁` : '-'}</dd>
                </div>
              </dl>
              <dl className="bz-x-follow">
                <dt>最近跟进</dt>
                <dd className={record.notes ? undefined : 'bz-x-follow-empty'}>
                  {record.notes
                    ? `${dayjs(record.updatedAt).format('M月D日')}\u3000${record.notes}`
                    : '暂无跟进记录（「··· → 编辑」可补充备注）'}
                </dd>
              </dl>
            </>
          ))}
          rowClassName={(record: any) => bzRowClass(bz, record)}
          locale={{
            emptyText: (
              <div className="bz-empty">
                <CalendarX2 size={28} />
                <p>暂无体验课记录</p>
                <span>点击右上角「新增体验课」排第一节课。</span>
              </div>
            ),
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 1080 }}
        />
      </div>

      {/* 新增/编辑体验课 Modal */}
      <Modal
        title={editingRecord ? '编辑体验课' : '新增体验课'}
        className="experience-registration-modal"
        style={{ top: 24 }}
        styles={{ body: { maxHeight: 'calc(calc(var(--ui-vh, 1vh) * 100) - 200px)', overflowY: 'auto', paddingRight: 6 } }}
        open={modalVisible}
        onCancel={() => {
          if (submitBusyRef.current) return;
          setModalVisible(false);
          setSelectedLeadId(null);
          setSourceType('new');
          resetScheduleQuery();
        }}
        onOk={() => pendingRegistration && !editingRecord ? void retryPendingRegistration() : form.submit()}
        confirmLoading={submitting}
        okText={submitting ? '正在保存' : pendingRegistration && !editingRecord ? '重试原登记' : editingRecord ? '保存' : '登记体验课'}
        cancelButtonProps={{ disabled: submitting }}
        closable={!submitting}
        maskClosable={!submitting}
        keyboard={!submitting}
        width={650}
      >
        {pendingRegistration && !editingRecord && !submitting && (
          <Alert
            type="warning" showIcon style={{ marginBottom: 16 }}
            message="上一笔登记结果待确认"
            description="已保留原登记内容。请点击“重试原登记”确认同一笔结果；关闭或刷新后仍可继续，不会另建重复记录。"
          />
        )}
        <Form form={form} onFinish={handleSubmit} layout="vertical" disabled={submitting || Boolean(pendingRegistration && !editingRecord)}>
          <Form.Item name="scheduleId" hidden><Input /></Form.Item>
          <Form.Item name="teachingTeacherName" hidden><Input /></Form.Item>
          {/* 来源选择（仅新增时显示） */}
          {!editingRecord && (
            <Form.Item label="学员来源">
              <Radio.Group
                value={sourceType}
                onChange={(e) => {
                  setSourceType(e.target.value);
                  setSelectedLeadId(null);
                  form.resetFields(['studentName', 'age', 'contact', 'assigneeId']);
                }}
              >
                <Radio.Button value="new">
                  <UserAddOutlined size={16} /> 新学员
                </Radio.Button>
                <Radio.Button value="lead">
                  <ImportOutlined size={16} /> 从鱼池导入
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

          {/* 从鱼池选择（仅新增且选择鱼池时显示） */}
          {!editingRecord && sourceType === 'lead' && (
            <Form.Item label="选择鱼池线索" required>
              <Select
                placeholder="请选择鱼池中的线索"
                value={selectedLeadId}
                onChange={handleLeadSelect}
                showSearch
                filterOption={(input, option) => {
                  const lead = leadsList.find(l => l.id === option?.value);
                  if (!lead) return false;
                  const searchText = `${lead.customerName} ${lead.contact} ${lead.assigneeName || ''}`.toLowerCase();
                  return searchText.includes(input.toLowerCase());
                }}
              >
                {leadsList.map(lead => (
                  <Option key={lead.id} value={lead.id}>
                    {lead.customerName} - {lead.contact} {lead.assigneeName ? `(${lead.assigneeName})` : ''}
                  </Option>
                ))}
              </Select>
              {leadsList.length === 0 && (
                <div style={{ color: 'var(--tx3)', fontSize: 12, marginTop: 4 }}>
                  鱼池暂无线索，请先在鱼池中添加
                </div>
              )}
            </Form.Item>
          )}

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="studentName" label="学员姓名" rules={[{ required: true, message: '请输入学员姓名' }]}>
              <Input placeholder="请输入学员姓名" disabled={submitting || Boolean(pendingRegistration) || (sourceType === 'lead' && !!selectedLeadId)} />
            </Form.Item>
            <Form.Item name="age" label="年龄">
              <InputNumber min={0} max={150} placeholder="年龄" style={{ width: '100%' }} disabled={submitting || Boolean(pendingRegistration) || (sourceType === 'lead' && !!selectedLeadId)} />
            </Form.Item>
          </div>

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="contact" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}>
              <Input placeholder="请输入联系方式（手机号）" disabled={submitting || Boolean(pendingRegistration) || (sourceType === 'lead' && !!selectedLeadId)} />
            </Form.Item>
            <Form.Item name="source" label="来源" rules={[{ required: true, message: '请选择来源' }]}>
              <Select placeholder="请选择来源">
                {SOURCE_OPTIONS.map(opt => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="classId" label="体验班级">
            <Select
              placeholder="请选择体验班级"
              allowClear showSearch optionFilterProp="children"
              onChange={handleClassSelect}
              disabled={linkedEdit || submitting || Boolean(pendingRegistration)}
            >
              {classes.map((cls) => (
                <Option key={cls.id} value={cls.id}>{cls.name}{cls.code ? ` (${cls.code})` : ''}</Option>
              ))}
            </Select>
          </Form.Item>

          {!editingRecord && !pendingRegistration && (
            <Form.Item label="登记方式">
              <Radio.Group value={registrationMode} onChange={event => handleModeChange(event.target.value)}>
                <Radio.Button value="schedule">选择排课</Radio.Button>
                <Radio.Button value="manual">手动登记</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

          {!editingRecord && registrationMode === 'schedule' && !pendingRegistration && (
            <>
              <Form.Item
                label="选择上课场次"
                required
                extra={schedulesPeriod
                  ? `上海时间 ${shanghaiTime(schedulesPeriod.start).format('M月D日')}—${shanghaiTime(schedulesPeriod.end).format('M月D日')}，共 ${availableSchedules.length} 场真实排课`
                  : '显示未来一个月内已排好的真实场次，包含同日不同时段。'}
              >
                <Select
                  aria-label="选择上课场次"
                  placeholder={selectedClassId ? '请选择日期和时段' : '请先选择体验班级'}
                  value={selectedScheduleId}
                  onChange={handleScheduleSelect}
                  loading={schedulesLoading}
                  disabled={!selectedClassId || schedulesLoading || Boolean(schedulesError)}
                  allowClear showSearch
                  optionFilterProp="searchText"
                  options={availableSchedules.map(schedule => ({
                    value: schedule.id,
                    label: scheduleLabel(schedule),
                    searchText: `${scheduleLabel(schedule)} ${schedule.classroom || ''} ${schedule.teacherName || ''}`,
                    schedule,
                  }))}
                  optionRender={option => (
                    <div style={{ padding: '4px 0' }}>
                      <div style={{ fontWeight: 600 }}>{option.label}</div>
                      <div style={{ color: 'var(--tx3)', fontSize: 12 }}>
                        {option.data.schedule.classroom || '未设置教室'} · {option.data.schedule.teacherName || '未设置场次老师'}
                      </div>
                    </div>
                  )}
                  notFoundContent={schedulesLoading ? '正在查询排课…' : '未来一个月暂无可用排课'}
                />
              </Form.Item>
              {schedulesError && (
                <Alert type="error" showIcon message="排课查询失败" description={schedulesError}
                  style={{ marginBottom: 16 }}
                  action={<Button size="small" onClick={() => selectedClassId && void fetchAvailableSchedules(selectedClassId)}>重试查询</Button>}
                />
              )}
              {selectedClassId && !schedulesLoading && !schedulesError && availableSchedules.length === 0 && (
                <Alert type="info" showIcon message="未来一个月暂无可用排课"
                  description="请先为该班级排课，或切换“手动登记”录入体验时间。" style={{ marginBottom: 16 }} />
              )}
            </>
          )}

          {linkedFields ? (selectedSchedule || linkedEdit || pendingRegistration ? (
            <Form.Item label="场次信息">
              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg2, #f7f5fb)', lineHeight: 1.8 }}>
                {selectedSchedule ? (
                  <>
                    <div style={{ fontWeight: 600 }}>{scheduleLabel(selectedSchedule)}</div>
                    <div>{selectedSchedule.classroom || '未设置教室'} · {selectedSchedule.teacherName || '未设置场次老师'}</div>
                  </>
                ) : linkedEdit || pendingRegistration ? (
                  <>
                    <div style={{ fontWeight: 600 }}>
                      {form.getFieldValue('scheduleDate')?.format('YYYY年M月D日') || '未设置日期'}{' '}
                      {form.getFieldValue('startTime') || ''}{form.getFieldValue('endTime') ? `–${form.getFieldValue('endTime')}` : ''}
                    </div>
                    <div>{form.getFieldValue('classroom') || '未设置教室'} · {form.getFieldValue('teachingTeacherName') || editingRecord?.teachingTeacherName || '未设置场次老师'}</div>
                  </>
                ) : <span style={{ color: 'var(--tx3)' }}>选择场次后自动带入日期、时间、教室和实际授课老师</span>}
                <div style={{ color: 'var(--tx3)', fontSize: 12 }}>场次信息随排课登记保存。</div>
              </div>
            </Form.Item>
          ) : null) : (
            <>
              <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
                <Form.Item name="scheduleDate" label="上课日期" rules={[{ required: true, message: '请选择上课日期' }]}>
                  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" placeholder="选择日期" />
                </Form.Item>
                <Form.Item name="classroom" label="上课教室"><Input placeholder="请输入教室或地点" /></Form.Item>
              </div>
              <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
                <Form.Item name="startTime" label="开始时间" rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: '请按 HH:mm 填写时间' }]}>
                  <Input placeholder="如 09:00（可选）" />
                </Form.Item>
                <Form.Item name="endTime" label="结束时间" rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: '请按 HH:mm 填写时间' }]}>
                  <Input placeholder="如 10:00（可选）" />
                </Form.Item>
              </div>
              <Form.Item name="teachingTeacherId" label="上课老师">
                <Select placeholder="请选择实际授课老师（可选）" allowClear showSearch optionFilterProp="children"
                  onChange={() => form.setFieldValue('teachingTeacherName', undefined)}>
                  {staffList.filter(person => ['teacher', 'coach'].includes(person.role || '')).map(staff => (
                    <Option key={staff.id} value={staff.id}>{staff.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}

          <Form.Item name="assigneeId" label="跟进负责人">
            <Select placeholder="请选择负责人" allowClear showSearch optionFilterProp="children">
              {staffList.map(staff => <Option key={staff.id} value={staff.id}>{staff.name}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
            tooltip="注意：'已成单'状态由成单信息表自动设置，无法手动选择"
          >
            <Select placeholder="请选择状态">
              <Option value="pending">待上课</Option>
              <Option value="completed">到场</Option>
              <Option value="cancelled">已取消</Option>
              <Option value="converted" disabled>
                已成单（由成单信息表自动设置）
              </Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量更新状态 Modal */}
      <Modal
        title="批量更新状态"
        open={batchStatusModalVisible}
        confirmLoading={batchStatusSubmitting}
        onCancel={() => {
          setBatchStatusModalVisible(false);
          batchStatusForm.resetFields();
        }}
        onOk={() => batchStatusForm.submit()}
        width={400}
      >
        <Form form={batchStatusForm} onFinish={submitBatchStatus} layout="vertical">
          <Alert
            message={`确定要更新选中的 ${selectedRowKeys.length} 条记录的状态吗？`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form.Item name="status" label="新状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select placeholder="请选择状态">
              <Option value="pending">待上课</Option>
              <Option value="completed">到场</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ExperienceSchedule;
