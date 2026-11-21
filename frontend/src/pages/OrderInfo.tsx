import { Modal } from '../components/overlays';
import { useState, useEffect, useRef } from 'react';
import { Table, Button, Space, message, Form, Input, Select, DatePicker, Tag, InputNumber, Radio, Statistic, Row, Col, Alert } from 'antd';
import { Info, Plus as PlusOutlined, Pencil as EditOutlined, Trash2 as DeleteOutlined, UserRoundPlus as UserAddOutlined, Import as ImportOutlined, Funnel as FilterOutlined, CirclePlus as PlusCircleOutlined, Undo2 as RollbackOutlined } from 'lucide-react';
import './CashflowSummary.css';
import './CashflowPages.css';
import api from '../services/api';
import { dataService } from '../services/dataService';
import { getDataScopeFilter, normalizeRole } from '../utils/dataFilter';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { registrationStorageKey, isDefinitiveRegistrationFailure, type PendingRegistration } from '../utils/registrationRequest';
import { acknowledgeReviewedSignup, clearPendingSignup, preparePendingSignup, readPendingSignup, signupNeedsReview, SignupPendingConflict } from '../utils/orderRegistrationRequest';
import { renewalStorageKey as sharedRenewalStorageKey, readRenewalSnapshot, preparePendingRenewal, clearPendingRenewal, acknowledgeReviewedRenewal, RenewalPendingConflict, isDefinitiveRenewalFailure, type PendingRenewal, type RenewalSnapshot } from '../utils/renewalRequest';
import { purchaseLessonsRule, purchasePriceRule } from '../utils/orderNumberFields';
import { isCacheRequestCancelled } from '../services/cacheService';
import { isValidContactPhone } from '../utils/phone';

dayjs.extend(utc);
dayjs.extend(timezone);

const accountIdentity = (user: { id: string; organizationId?: string; campusId?: string; role: string; isPlatformAdmin?: boolean } | null) =>
  user ? JSON.stringify([user.id, user.organizationId, user.campusId, user.role, !!user.isPlatformAdmin]) : '';
const currentAccount = () => accountIdentity(useAuthStore.getState().user);

interface RegistrationSchedule {
  id: string;
  classId: string;
  className: string;
  classCode: string | null;
  courseType: string | null;
  startTime: string;
  endTime: string;
  classroom: string | null;
  teacherId: string | null;
  teacherName: string | null;
}

interface RegistrationOption {
  label: string;
  value?: string;
  searchText?: string;
  slot?: RegistrationSchedule;
  options?: RegistrationOption[];
}

function registrationScheduleLabel(slot: RegistrationSchedule) {
  const start = dayjs(slot.startTime).tz('Asia/Shanghai'), end = dayjs(slot.endTime).tz('Asia/Shanghai');
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][start.day()];
  return `${start.format('M月D日')} ${week} ${start.format('HH:mm')}–${end.format(start.isSame(end, 'day') ? 'HH:mm' : 'M月D日 HH:mm')}`;
}

const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

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
}

interface ExperienceLesson {
  id: string;
  studentName: string;
  age?: number;
  contact: string;
  className?: string;
  classId?: string;
  assigneeId?: string;
  assigneeName?: string;
  status: string;
}

const OrderInfo = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [form] = Form.useForm();
  const [registrationSchedules, setRegistrationSchedules] = useState<RegistrationSchedule[]>([]);
  const [registrationSchedulesLoading, setRegistrationSchedulesLoading] = useState(false);
  const [registrationSchedulesError, setRegistrationSchedulesError] = useState('');
  const [registrationSchedulesReady, setRegistrationSchedulesReady] = useState(false);
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [pendingSignup, setPendingSignup] = useState<PendingRegistration | null>(null);
  const [pendingSignupReviewError, setPendingSignupReviewError] = useState('');
  const [otherSignupPending, setOtherSignupPending] = useState(false);
  const signupSubmitLock = useRef(false);
  const signupAttemptRef = useRef(0);
  const signupOpenRef = useRef(0);
  const scheduleRequestRef = useRef(0);
  const scheduleAbortRef = useRef<AbortController | null>(null);
  const selectedSignupScheduleId = Form.useWatch('scheduleId', form);
  const selectedSignupSchedule = registrationSchedules.find(slot => slot.id === selectedSignupScheduleId);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const [renewalSubmitting, setRenewalSubmitting] = useState(false);
  const [pendingRenewal, setPendingRenewal] = useState<PendingRenewal | null>(null);
  const [pendingRenewalError, setPendingRenewalError] = useState('');
  const [renewalReviewId, setRenewalReviewId] = useState<string | null>(null);
  const renewalSubmitLock = useRef(false);
  const renewalAttemptRef = useRef(0);
  const renewalOpenRef = useRef(0);
  const renewalOwnerRef = useRef('');
  const renewalSnapshotRef = useRef<RenewalSnapshot | null>(null);
  const [renewalForm] = Form.useForm();
  const [renewalStudents, setRenewalStudents] = useState<any[]>([]);
  const [selectedRenewalStudent, setSelectedRenewalStudent] = useState<any>(null);
  const [studentFilterOptions, setStudentFilterOptions] = useState<{ label: string; value: string }[]>([]);
  const [selectedStudentFilter, setSelectedStudentFilter] = useState<string | null>(null);
  
  // 来源类型和体验课列表
  const [sourceType, setSourceType] = useState<'new' | 'experience'>('new');
  const [experienceLessons, setExperienceLessons] = useState<ExperienceLesson[]>([]);
  const [experienceLoading, setExperienceLoading] = useState(false);
  const [experienceError, setExperienceError] = useState('');
  const experienceRequest = useRef(0);
  const [selectedExperienceId, setSelectedExperienceId] = useState<string | null>(null);
  
  // 筛选条件
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [quickFilter, setQuickFilter] = useState<string>('all');
  
  // 统计数据
  const [stats, setStats] = useState<{ totalCount: number; totalAmount: number; pricedCount?: number } | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const fetchRequest = useRef(0);

  // 2026-11-08 用户拍板：成单作废（红冲）——保留记录、课时冲回、退出全部统计口径
  const [voidRecordsOpen, setVoidRecordsOpen] = useState(false);
  const [voidRecords, setVoidRecords] = useState<any[]>([]);
  const [voidSummary, setVoidSummary] = useState<{ count: number; amount: number; pricedCount: number; reversedLessons: number; unresolvedLogs: number } | null>(null);
  const [voidPagination, setVoidPagination] = useState({ current: 1, pageSize: 8, total: 0 });
  const [voidRecordsError, setVoidRecordsError] = useState('');
  const voidRequest = useRef(0);
  const [voidRecordsLoading, setVoidRecordsLoading] = useState(false);
  const fetchVoidRecords = async (page = 1, pageSize = 8) => {
    const account = currentAccount(), request = ++voidRequest.current;
    const isCurrent = () => currentAccount() === account && request === voidRequest.current;
    setVoidRecordsLoading(true);
    setVoidRecordsError('');
    try {
      const response = await api.get('/conversions/voided', { params: { page, pageSize } });
      if (!isCurrent()) return;
      const result = response.data;
      if (!Array.isArray(result?.data) || !result?.pagination || !result?.summary ||
        !['count', 'amount', 'pricedCount', 'reversedLessons', 'unresolvedLogs'].every(key => Number.isFinite(result.summary[key]) && result.summary[key] >= 0)) throw new Error('作废记录响应不完整，请重试');
      setVoidRecords(result.data);
      setVoidSummary(result.summary);
      setVoidPagination({ current: result.pagination.page, pageSize: result.pagination.pageSize, total: result.pagination.total });
    } catch (error: any) {
      if (!isCurrent()) return;
      setVoidRecords([]); setVoidSummary(null);
      setVoidPagination({ current: page, pageSize, total: 0 });
      setVoidRecordsError(error?.response?.data?.error?.message || error.message || '作废记录加载失败，请重试');
    } finally {
      if (isCurrent()) setVoidRecordsLoading(false);
    }
  };
  const handleOpenVoidRecords = () => {
    setVoidRecordsOpen(true);
    void fetchVoidRecords();
  };
  const voidRecordColumns = [
    { title: '学员', dataIndex: 'studentName', key: 'studentName', width: 90 },
    {
      title: '类型', key: 'type', width: 80,
      render: (_: any, record: any) => (['续费', 'renewal', '续报'].includes(record.courseType) ? <Tag color="purple">续费</Tag> : <Tag color="green">新报名</Tag>),
    },
    { title: '金额', dataIndex: 'price', key: 'price', width: 90, render: (v: number | string | null) => v == null ? '未填写' : `¥${Number(v).toLocaleString()}` },
    { title: '课时', dataIndex: 'totalLessons', key: 'totalLessons', width: 70, render: (v: number) => (v ? `${v} 节` : '—') },
    { title: '成单日期', dataIndex: 'conversionDate', key: 'conversionDate', width: 100 },
    {
      title: '作废记录（日期 / 原因 / 操作人）', key: 'voidNote',
      render: (_: any, record: any) => {
        const note = (record.notes || '').split('；').find((s: string) => s.startsWith('【作废'));
        return note || '-';
      },
    },
  ];
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const handleVoid = async () => {
    const account = currentAccount();
    if (!voidTarget) return;
    if (!voidReason.trim()) {
      message.warning('请填写作废原因');
      return;
    }
    setVoidSubmitting(true);
    try {
      const response = await api.post<unknown, { message?: string }>(`/conversions/${voidTarget.id}/void`, { reason: voidReason.trim() });
      if (currentAccount() !== account) return;
      message.success(response.message || '成单已作废，记录已保留');
      setVoidTarget(null);
      setVoidReason('');
      fetchData();
    } catch (error: any) {
      if (currentAccount() !== account) return;
      message.error(error.response?.data?.error?.message || error.message || '作废失败，请重试');
    } finally {
      if (currentAccount() === account) setVoidSubmitting(false);
    }
  };

  // 获取当前用户和权限
  const user = useAuthStore((state) => state.user);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const scopeKey = accountIdentity(user);
  const [renderedAccount, setRenderedAccount] = useState(scopeKey);

  // 权限检查：销售和老师角色只能创建，不能编辑/删除
  const canEdit = normalizedRole === 'admin' || normalizedRole === 'manager';
  const canDelete = normalizedRole === 'admin' || normalizedRole === 'manager';
  const canRenew = !user?.isPlatformAdmin && (['super', 'manager'].includes(user?.managementLevel || '') || ['admin', 'manager', 'coach', 'teacher'].includes(normalizedRole || ''));
  const canCreate = normalizedRole === 'admin' || normalizedRole === 'manager' || normalizedRole === 'coach' || normalizedRole === 'sales';

  useEffect(() => {
    fetchRequest.current += 1;
    experienceRequest.current += 1;
    setExperienceLoading(false); setExperienceError('');
    scheduleRequestRef.current += 1;
    scheduleAbortRef.current?.abort();
    signupOpenRef.current += 1;
    signupAttemptRef.current += 1;
    signupSubmitLock.current = false;
    renewalOpenRef.current += 1;
    renewalOwnerRef.current = '';
    setRenewalReviewId(null);
    renewalSnapshotRef.current = null;
    renewalAttemptRef.current += 1;
    renewalSubmitLock.current = false;
    voidRequest.current += 1;
    setRenewalSubmitting(false); setVoidSubmitting(false); setVoidRecordsLoading(false); setVoidSummary(null);
    setVoidRecordsError(''); setVoidPagination({ current: 1, pageSize: 8, total: 0 });
    setSignupSubmitting(false);
    setData([]); setClasses([]); setStaffList([]); setExperienceLessons([]); setStudentFilterOptions([]);
    setRenewalStudents([]); setSelectedRenewalStudent(null); setPendingRenewal(null); setPendingRenewalError('');
    setModalVisible(false); setRenewalModalVisible(false); setVoidRecordsOpen(false); setVoidRecords([]); setVoidTarget(null);
    setSelectedStudentFilter(null); setSelectedExperienceId(null); setEditingRecord(null);
    setPendingSignup(null); setPendingSignupReviewError(''); setOtherSignupPending(false);
    setRegistrationSchedules([]); setRegistrationSchedulesReady(false); setRegistrationSchedulesError('');
    form.resetFields(); renewalForm.resetFields(); setRenderedAccount(scopeKey);
  }, [scopeKey, form, renewalForm]);

  useEffect(() => {
    if (!user?.organizationId || !user.campusId) return;
    fetchData();
    fetchClasses();
    fetchStaffList();
  }, [pagination.current, pagination.pageSize, dateRange, selectedStudentFilter, scopeKey]);

  useEffect(() => {
    if (user?.organizationId && user.campusId) { fetchStudentOptions(); void fetchExperienceLessons(); }
  }, [scopeKey]);

  useEffect(() => () => { scheduleAbortRef.current?.abort(); scheduleRequestRef.current += 1; experienceRequest.current += 1; }, []);

  const fetchData = async () => {
    const account = currentAccount();
    const requestId = ++fetchRequest.current;
    setLoading(true);
    setStats(null);
    setSummaryError(false);
    try {
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        studentId: selectedStudentFilter || undefined,
      };

      // 添加日期筛选
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      // 应用数据过滤：teacher 角色只看自己的销售数据
      const filter = getDataScopeFilter('sales');
      Object.assign(params, filter);

      const [listResult, summaryResult] = await Promise.allSettled([
        api.get('/conversions', { params }),
        api.get('/conversions/summary', { params }),
      ]);
      if (requestId !== fetchRequest.current || currentAccount() !== account) return;
      if (listResult.status === 'fulfilled') {
        const response = listResult.value;
        setData(response.data || []);
        setPagination(prev => ({ ...prev, total: response.pagination?.total || 0 }));
      } else {
        setData([]);
        setPagination(prev => ({ ...prev, total: 0 }));
        message.error(listResult.reason?.response?.data?.error?.message || '成单列表加载失败');
      }
      if (summaryResult.status === 'fulfilled') {
        const summary = summaryResult.value.data;
        if (summary && summary.amount != null && summary.count != null && Number.isFinite(Number(summary.amount)) && Number.isFinite(Number(summary.count))) {
          setStats({ totalCount: Number(summary.count), totalAmount: Number(summary.amount), pricedCount: summary.pricedCount == null ? undefined : Number(summary.pricedCount) });
        } else setSummaryError(true);
      } else setSummaryError(true);
    } catch (error: any) {
      if (requestId === fetchRequest.current && currentAccount() === account) {
        console.error('获取成单列表失败:', error);
        setSummaryError(true);
        message.error(error.message || '获取成单列表失败');
      }
    } finally {
      if (requestId === fetchRequest.current && currentAccount() === account) setLoading(false);
    }
  };
  
  // 快捷筛选
  const handleQuickFilter = (filter: string) => {
    setQuickFilter(filter);
    const today = dayjs();
    
    switch (filter) {
      case 'week':
        // 近一周
        setDateRange([today.subtract(7, 'day'), today]);
        break;
      case 'month':
        // 本月
        setDateRange([today.startOf('month'), today]);
        break;
      case 'lastMonth': {
        // 上月
        const lastMonth = today.subtract(1, 'month');
        setDateRange([lastMonth.startOf('month'), lastMonth.endOf('month')]);
        break;
      }
      case 'all':
      default:
        setDateRange(null);
        break;
    }
    // 重置分页
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleStudentFilterChange = (value: string | null) => {
    setSelectedStudentFilter(value);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const fetchClasses = async () => {
    const account = currentAccount();
    try {
      const data = await dataService.getClasses();
      if (currentAccount() !== account) return;
      setClasses(data);
    } catch (error) {
      if (isCacheRequestCancelled(error) || currentAccount() !== account) return;
      console.error('获取班级列表失败:', error);
    }
  };

  const fetchStaffList = async () => {
    const account = currentAccount();
    try {
      const data = await dataService.getStaffList(true);
      if (currentAccount() !== account) return;
      setStaffList(data);
    } catch (error) {
      if (isCacheRequestCancelled(error) || currentAccount() !== account) return;
      console.error('获取工作人员列表失败:', error);
    }
  };

  // Load every page of sales-owned bookings, including pending experiences.
  const fetchExperienceLessons = async () => {
    const account = currentAccount(), request = ++experienceRequest.current;
    const isCurrent = () => currentAccount() === account && request === experienceRequest.current;
    setExperienceLoading(true); setExperienceError(''); setExperienceLessons([]);
    try {
      const rows: ExperienceLesson[] = [];
      let page = 1, totalPages = 1;
      do {
        const response = await api.get<unknown, { data: ExperienceLesson[]; pagination: { totalPages: number } }>('/experience-lessons/conversion-candidates', { params: { page, pageSize: 100 } });
        if (!isCurrent()) return;
        if (!Array.isArray(response.data) || !Number.isSafeInteger(response.pagination?.totalPages) || response.pagination.totalPages < 0) throw new Error('体验课列表响应不完整，请重试');
        rows.push(...response.data);
        totalPages = response.pagination.totalPages; page += 1;
      } while (page <= totalPages);
      setExperienceLessons([...new Map(rows.map(row => [row.id, row])).values()]);
    } catch (error: any) {
      if (isCurrent()) setExperienceError(error.response?.data?.error?.message || error.message || '体验课列表加载失败，请重试');
    } finally { if (isCurrent()) setExperienceLoading(false); }
  };

  const fetchStudentOptions = async () => {
    const account = currentAccount();
    try {
      const response = await api.get('/students', { params: { pageSize: 1000 } });
      if (currentAccount() !== account) return;
      const students = response.data || [];
      const options = (students || []).map((student: any) => ({
        label: `${student.name}${student.phone || student.parentPhone ? ` (${student.phone || student.parentPhone})` : ''}`,
        value: student.id,
      }));
      setStudentFilterOptions(options);
    } catch (error) {
      if (currentAccount() !== account) return;
      console.error('获取学员筛选列表失败:', error);
    }
  };

  const fetchRenewalCandidates = async () => {
    const account = currentAccount();
    try {
      const response = await api.get('/students', { params: { pageSize: 1000 } });
      if (currentAccount() !== account) return;
      setRenewalStudents(response.data || []);
    } catch (error) {
      if (currentAccount() !== account) return;
      console.error('获取续费学员列表失败:', error);
    }
  };

  const loadRegistrationSchedules = async () => {
    const account = currentAccount();
    scheduleAbortRef.current?.abort();
    const controller = new AbortController();
    scheduleAbortRef.current = controller;
    const request = ++scheduleRequestRef.current;
    setRegistrationSchedulesLoading(true);
    setRegistrationSchedulesReady(false);
    setRegistrationSchedulesError('');
    setRegistrationSchedules([]);
    try {
      const response = await api.get('/conversions/registration-schedules', { signal: controller.signal });
      if (controller.signal.aborted || request !== scheduleRequestRef.current || currentAccount() !== account) return;
      const rows = response.data?.schedules;
      if (!Array.isArray(rows) || rows.some((slot: RegistrationSchedule) => !slot || typeof slot.id !== 'string' || typeof slot.classId !== 'string' || typeof slot.className !== 'string' || !Number.isFinite(Date.parse(slot.startTime)) || !Number.isFinite(Date.parse(slot.endTime)))) throw new Error('报名排课数据不完整，请重新查询');
      setRegistrationSchedules(rows);
      setRegistrationSchedulesReady(true);
    } catch (error: any) {
      if (!controller.signal.aborted && request === scheduleRequestRef.current && currentAccount() === account) setRegistrationSchedulesError(error.response?.data?.error?.message || error.message || '报名排课读取失败');
    } finally {
      if (!controller.signal.aborted && request === scheduleRequestRef.current && currentAccount() === account) setRegistrationSchedulesLoading(false);
    }
  };

  const restoreSignup = (pending: PendingRegistration | null) => {
    setEditingRecord(null);
    setPendingSignup(pending);
    setPendingSignupReviewError('');
    setOtherSignupPending(false);
    setSourceType(pending?.payload.experienceLessonId ? 'experience' : 'new');
    setSelectedExperienceId(pending?.payload.experienceLessonId as string || null);
    form.resetFields();
    form.setFieldsValue(pending ? { ...pending.payload, conversionDate: pending.payload.conversionDate ? dayjs(pending.payload.conversionDate as string) : dayjs() }
      : { paymentStatus: 'paid', conversionDate: dayjs() });
  };

  const handleAdd = async () => {
    if (signupSubmitLock.current || !user) return;
    const account = currentAccount(), opened = ++signupOpenRef.current;
    try {
      const pending = await readPendingSignup(registrationStorageKey('conversion', user));
      if (currentAccount() !== account || signupOpenRef.current !== opened) return;
      restoreSignup(pending);
      setModalVisible(true);
      if (!pending) { void loadRegistrationSchedules(); void fetchExperienceLessons(); }
    } catch (error: any) { if (currentAccount() === account) message.error(error.message || '无法恢复待确认成单'); }
  };

  useEffect(() => {
    if (!user?.organizationId || !user.campusId) return;
    const key = registrationStorageKey('conversion', user), account = scopeKey;
    const onStorage = async (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try {
        const pending = await readPendingSignup(key);
        if (currentAccount() !== account) return;
        if (pending) setOtherSignupPending(!pendingSignup || pending.requestId !== pendingSignup.requestId);
        else {
          setOtherSignupPending(false);
          if (pendingSignup && modalVisible && !editingRecord && !signupSubmitLock.current) {
            setPendingSignup(null); setPendingSignupReviewError(''); setModalVisible(false); form.resetFields();
            message.info('待确认成单已在另一窗口处理，请查看最新记录');
            void fetchData();
          }
        }
      } catch (error: any) {
        if (currentAccount() === account) { setOtherSignupPending(true); message.error(error.message || '请先核对另一窗口的成单'); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [scopeKey, pendingSignup, modalVisible, editingRecord, form]);

  const renewalStorageKey = () => sharedRenewalStorageKey(useAuthStore.getState().user);

  const handleOpenRenewalModal = async () => {
    if (!canRenew) { message.error('续费由负责老师或管理员处理'); return; }
    if (renewalSubmitLock.current) return;
    const account = currentAccount(), open = ++renewalOpenRef.current;
    renewalOwnerRef.current = account;
    setRenewalReviewId(null);
    renewalSnapshotRef.current = null;
    setPendingRenewal(null);
    setPendingRenewalError('正在读取待确认续费记录');
    try {
      const snapshot = await readRenewalSnapshot(renewalStorageKey());
      if (currentAccount() !== account || open !== renewalOpenRef.current) return;
      renewalSnapshotRef.current = snapshot;
      setPendingRenewal(snapshot.pending);
      setPendingRenewalError('');
    } catch (error: any) {
      if (currentAccount() !== account || open !== renewalOpenRef.current) return;
      setPendingRenewalError(error.message || '无法读取续费记录，请先核对');
    }
    renewalForm.resetFields();
    setSelectedRenewalStudent(null);
    renewalForm.setFieldsValue({ paymentStatus: 'pending', conversionDate: dayjs() });
    setRenewalModalVisible(true);
    fetchRenewalCandidates();
  };

  useEffect(() => {
    let readVersion = 0;
    const onStorage = async (event: StorageEvent) => {
      if (!renewalModalVisible) return;
      const account = currentAccount(), open = renewalOpenRef.current;
      let key: string;
      try { key = renewalStorageKey(); } catch { return; }
      if (event.key !== null && event.key !== key && event.key !== `${key}:settled`) return;
      const version = ++readVersion;
      try {
        // Storage events may be delayed; read the current receipt under the lock.
        const snapshot = await readRenewalSnapshot(key);
        if (account !== currentAccount() || open !== renewalOpenRef.current || version !== readVersion || renewalSubmitLock.current) return;
        if (snapshot.revision !== renewalSnapshotRef.current?.revision) {
          setPendingRenewalError('续费已由另一窗口处理，请关闭后重新打开再登记新一笔');
          return;
        }
        renewalSnapshotRef.current = snapshot;
        setPendingRenewal(snapshot.pending);
      } catch (error: any) {
        if (account === currentAccount() && open === renewalOpenRef.current && version === readVersion) setPendingRenewalError(error.message || '无法读取待确认续费记录');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { readVersion += 1; window.removeEventListener('storage', onStorage); };
  }, [renewalModalVisible, scopeKey]);

  const handleRenewalStudentChange = (studentId: string) => {
    const student = renewalStudents.find(s => s.id === studentId);
    setSelectedRenewalStudent(student);
  };

  const handleRenewalSubmit = async (values: any) => {
    if (!canRenew) { message.error('续费由负责老师或管理员处理'); return; }
    if (renewalSubmitLock.current) return;
    const account = currentAccount(), attempt = ++renewalAttemptRef.current;
    if (renewalOwnerRef.current !== account) { message.error('账号状态发生变化，请重新打开续费窗口'); return; }
    let activeKey: string;
    try { activeKey = renewalStorageKey(); } catch (error: any) { message.error(error.message); return; }
    const isCurrent = () => currentAccount() === account && attempt === renewalAttemptRef.current;
    let isRetry = Boolean(pendingRenewal);
    if (pendingRenewalError) { message.error(pendingRenewalError); return; }
    if (!pendingRenewal && !selectedRenewalStudent) {
      message.error('请选择续费学员');
      return;
    }
    const currentEnrollments = (selectedRenewalStudent?.enrollments || []).filter((e: any) => e.status === 'active');
    if (!pendingRenewal && currentEnrollments.length > 1 && values.classId && !currentEnrollments.some((e: any) => e.classId === values.classId)) {
      message.error('该学员有多个在读班级，请先使用「班级调整」明确处理原班，再办理续费。');
      return;
    }
    renewalSubmitLock.current = true;
    setRenewalSubmitting(true);
    let sent = false;
    let activeRequestId = pendingRenewal?.requestId;
    try {
      const activeEnrollment = selectedRenewalStudent?.enrollments?.find((e: any) => e.status === 'active');
      const originalClassId = activeEnrollment?.classId;
      const originalTeacherId = activeEnrollment?.class?.teacher?.id;
      const finalClassId = values.classId || originalClassId;
      const targetClass = values.classId ? classes.find(c => c.id === values.classId) as any : null;
      const finalSalesId = canEdit ? (values.salesId || targetClass?.teacher?.id || originalTeacherId || null) : (user?.id || null);

      const addition = Number(values.totalLessons);
      const conversionData: PendingRenewal = {
        requestId: pendingRenewal?.requestId || '',
        studentName: selectedRenewalStudent?.name || '',
        classId: finalClassId || null,
        totalLessons: addition,
        price: values.price == null ? null : Number(values.price),
        paymentMethod: values.paymentMethod || null,
        paymentStatus: values.paymentStatus || 'pending',
        salesId: finalSalesId || null,
        conversionDate: values.conversionDate ? values.conversionDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        notes: values.notes ? `续费 - ${values.notes}` : '续费',
        existingStudentId: selectedRenewalStudent?.id || '',
      };
      const key = renewalStorageKey();
      if (!key) throw new Error('账号缺少机构信息，无法办理续费');
      const observed = renewalSnapshotRef.current;
      if (!observed) throw new Error('请重新打开续费窗口');
      const prepared = await preparePendingRenewal(key, conversionData, observed);
      if (!isCurrent()) return;
      isRetry = prepared.existing;
      activeRequestId = prepared.pending.requestId;
      renewalSnapshotRef.current = { ...observed, pending: prepared.pending };
      setPendingRenewal(prepared.pending);
      sent = true;
      const response = await api.post('/conversions/renewal', prepared.pending);
      const actualRemaining = response.data?.remaining;
      await clearPendingRenewal(key, prepared.pending.requestId);
      if (!isCurrent()) return;
      setPendingRenewal(null);

      message.success(actualRemaining == null ? '续费成功' : `续费成功，${prepared.pending.studentName} 剩余 ${actualRemaining} 节`);
      setRenewalModalVisible(false);
      setSelectedRenewalStudent(null);
      fetchData();
    } catch (error: any) {
      if (!isCurrent()) return;
      console.error('续费失败:', error);
      // Only a first attempt with an explicitly rolled-back business rejection
      // can discard the pending key. A retry may follow a committed lost response.
      if (error instanceof RenewalPendingConflict) {
        if (error.snapshot.pending) {
          renewalSnapshotRef.current = error.snapshot;
          setPendingRenewal(error.snapshot.pending);
        } else setPendingRenewalError(error.message);
        message.error(error.message);
        return;
      }
      const confirmedRollback = isDefinitiveRenewalFailure(error);
      if (sent && activeRequestId && error.response?.data?.error?.code === 'USE_CONVERSION_CORRECTION') {
        setRenewalReviewId(activeRequestId);
        message.error(error.response.data.error.message || '原成单已变更，请核对成单和学员课时');
        return;
      }
      if (confirmedRollback && !isRetry) {
        try {
          if (activeKey && activeRequestId) await clearPendingRenewal(activeKey, activeRequestId);
          const snapshot = await readRenewalSnapshot(activeKey);
          if (!isCurrent()) return;
          renewalSnapshotRef.current = snapshot;
          setPendingRenewal(snapshot.pending);
        } catch (storageError: any) {
          if (isCurrent()) setPendingRenewalError(storageError.message || '无法保持续费核对记录');
        }
        if (!isCurrent()) return;
        message.error(error.response?.data?.error?.message || '续费信息无效，请检查后重试');
      } else if (!sent && !error.response) {
        message.error(error.message || '无法保存待确认记录，请检查浏览器存储。');
      } else if (!error.response) {
        message.error('提交结果尚未确认，请先查看成单记录和学员课时后再重试。');
      } else {
        message.error(error.response?.data?.error?.message || '续费结果待核对，请确认后重试');
      }
    } finally {
      if (isCurrent()) { renewalSubmitLock.current = false; setRenewalSubmitting(false); }
    }
  };

  const handleAcknowledgeRenewal = () => {
    const requestId = pendingRenewal?.requestId, account = currentAccount();
    if (!requestId || renewalReviewId !== requestId || renewalSubmitLock.current) return;
    Modal.confirm({
      title: '已核对，结束本次续费？',
      content: '请先查看原成单及学员课时。此操作仅结束本机待确认记录并保留核对凭证，不会退款、加课或修改成单。结束后可重新打开登记新一笔续费。',
      okText: '已核对，结束本次续费', cancelText: '继续核对',
      onOk: async () => {
        if (account !== currentAccount() || renewalOwnerRef.current !== account) throw new Error('账号状态已变化，请重新核对');
        if (renewalSubmitLock.current) throw new Error('正在处理续费，请稍后再试');
        const attempt = ++renewalAttemptRef.current;
        const isCurrent = () => account === currentAccount() && attempt === renewalAttemptRef.current;
        renewalSubmitLock.current = true; setRenewalSubmitting(true);
        try {
          await acknowledgeReviewedRenewal(renewalStorageKey(), requestId, account);
          if (!isCurrent()) return;
          setPendingRenewal(null); setRenewalReviewId(null); setRenewalModalVisible(false);
          message.success('已结束本机待确认续费，未修改成单或课时');
        } catch (error: any) {
          if (isCurrent()) message.error(error.message || '无法结束待确认续费');
          throw error;
        } finally {
          if (isCurrent()) { renewalSubmitLock.current = false; setRenewalSubmitting(false); }
        }
      },
    });
  };

  // 选择体验课时，自动填充表单
  const handleExperienceSelect = (expId: string) => {
    setSelectedExperienceId(expId);
    const exp = experienceLessons.find(e => e.id === expId);
    if (exp) {
      form.setFieldsValue({
        studentName: exp.studentName,
        age: exp.age,
        contact: exp.contact,
        scheduleId: undefined,
        classId: undefined,
        salesId: exp.assigneeId,
      });
    }
  };

  const handleEdit = (record: any) => {
    if (signupSubmitLock.current) return;
    signupOpenRef.current += 1;
    scheduleAbortRef.current?.abort();
    scheduleRequestRef.current += 1;
    setPendingSignup(null);
    setPendingSignupReviewError(''); setOtherSignupPending(false);
    setEditingRecord(record);
    setSourceType('new'); // 编辑时不显示来源选择
    form.resetFields();
    form.setFieldsValue({
      ...record,
      conversionDate: record.conversionDate ? dayjs(record.conversionDate) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该成单记录吗？注意：关联的学员记录不会被删除。',
      onOk: async () => {
        try {
          await api.delete(`/conversions/${id}`);
          message.success('删除成功');
          fetchData();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  // 依照收尾约定保留旧删除代码，不再挂载操作入口；显式保留引用，避免未使用声明阻断类型检查。
  void [DeleteOutlined, canDelete, handleDelete];

  const finishSignup = () => {
    setModalVisible(false);
    setSelectedExperienceId(null);
    form.resetFields();
    dataService.onClassChanged();
    dataService.onLeadChanged();
    void fetchData();
    void fetchStudentOptions();
    void fetchExperienceLessons();
  };

  const postSignup = async (pending: PendingRegistration, retry: boolean, key: string, isCurrent: () => boolean) => {
    if (!isCurrent()) return;
    const response = await api.post('/conversions', { ...pending.payload, requestId: pending.requestId }, { headers: { 'Idempotency-Key': pending.requestId } });
    if (!response.data?.id || !response.data?.studentId) throw new Error('成单结果不完整，请重试原登记以核对');
    await clearPendingSignup(key, pending.requestId);
    if (!isCurrent()) return;
    setPendingSignup(null);
    setPendingSignupReviewError('');
    message.success(retry ? '原成单已核对，请查看最新记录' : response.data.classId ? `成单已保存，学员已加入${response.data.className || '所选班级'}` : (user?.role === 'sales' ? '成单已保存并建档，请联系教务安排班级' : '成单已保存并建档，可在学员管理中安排班级'));
    finishSignup();
  };

  const retrySignup = async () => {
    if (signupSubmitLock.current || !pendingSignup || !user || pendingSignupReviewError) return;
    const account = currentAccount(), attempt = ++signupAttemptRef.current;
    const key = registrationStorageKey('conversion', user);
    const isCurrent = () => currentAccount() === account && attempt === signupAttemptRef.current;
    signupSubmitLock.current = true;
    setSignupSubmitting(true);
    try { await postSignup(pendingSignup, true, key, isCurrent); }
    catch (error: any) {
      if (!isCurrent()) return;
      // A replay can follow a committed operation. No HTTP status proves its original write rolled back.
      if (signupNeedsReview(error)) setPendingSignupReviewError('原成单已作废或状态发生变化，请先核对成单记录和学员课时。');
      message.error(error.response?.data?.error?.message || error.message || '结果仍待确认，请重试原登记');
    } finally { if (isCurrent()) { signupSubmitLock.current = false; setSignupSubmitting(false); } }
  };

  const endReviewedSignup = async () => {
    if (!pendingSignup || !pendingSignupReviewError || !user || signupSubmitLock.current) return;
    const account = currentAccount(), attempt = ++signupAttemptRef.current;
    const isCurrent = () => currentAccount() === account && attempt === signupAttemptRef.current;
    signupSubmitLock.current = true; setSignupSubmitting(true);
    try {
      await acknowledgeReviewedSignup(registrationStorageKey('conversion', user), pendingSignup.requestId);
      if (!isCurrent()) return;
      setPendingSignup(null); setPendingSignupReviewError(''); setOtherSignupPending(false);
      setModalVisible(false); form.resetFields(); void fetchData();
      message.info('已结束本次登记并保留核对编号');
    } catch (error: any) { if (isCurrent()) message.error(error.message || '无法结束本次登记'); }
    finally { if (isCurrent()) { signupSubmitLock.current = false; setSignupSubmitting(false); } }
  };

  const handleSubmit = async (values: any) => {
    if (signupSubmitLock.current || !user) return;
    if (!editingRecord && pendingSignup) { void retrySignup(); return; }
    if (!editingRecord && otherSignupPending) { message.warning('请先核对另一窗口的待确认成单'); return; }
    if (!editingRecord && sourceType === 'experience' && !selectedExperienceId) { message.warning('请先选择要转化的体验课'); return; }
    if (!editingRecord && !registrationSchedulesReady) { message.warning('请先重新加载报名排课后再登记'); return; }
    if (!editingRecord && values.scheduleId && !selectedSignupSchedule) { message.warning('所选场次已变化，请重新选择'); return; }
    signupSubmitLock.current = true;
    setSignupSubmitting(true);
    const account = currentAccount(), attempt = ++signupAttemptRef.current;
    const key = registrationStorageKey('conversion', user);
    const isCurrent = () => currentAccount() === account && attempt === signupAttemptRef.current;
    let pending: PendingRegistration | null = null;
    let reused = false;
    try {
      const selectedSales = staffList.find(s => s.id === values.salesId);

      const submitData = {
        studentName: values.studentName,
        age: values.age ?? null,
        gender: values.gender || null,
        contact: values.contact,
        parentName: values.parentName || null,
        address: values.address || null,
        classId: editingRecord ? editingRecord.classId || null : selectedSignupSchedule?.classId || null,
        className: editingRecord ? editingRecord.className || null : selectedSignupSchedule?.className || null,
        courseType: editingRecord ? editingRecord.courseType || null : null,
        ...(!editingRecord ? { scheduleId: selectedSignupSchedule?.id || null } : {}),
        ...(!editingRecord ? { totalLessons: Number(values.totalLessons), price: Number(values.price) } : {}),
        paymentMethod: values.paymentMethod || null,
        paymentStatus: values.paymentStatus || 'paid',
        salesId: values.salesId || null,
        salesName: selectedSales?.name || null,
        conversionDate: values.conversionDate ? values.conversionDate.format('YYYY-MM-DD') : null,
        notes: values.notes || null,
        experienceLessonId: sourceType === 'experience' ? selectedExperienceId : null,
      };

      if (editingRecord) {
        await api.put(`/conversions/${editingRecord.id}`, submitData);
        if (!isCurrent()) return;
        message.success('更新成功');
        finishSignup();
      } else {
        const prepared = await preparePendingSignup(key, submitData, { registrationSchedule: selectedSignupSchedule || null });
        pending = prepared.pending; reused = prepared.existing;
        if (!isCurrent()) return;
        setPendingSignup(pending);
        await postSignup(pending, reused, key, isCurrent);
      }
    } catch (error: any) {
      if (!isCurrent()) return;
      if (error instanceof SignupPendingConflict) {
        restoreSignup(error.pending);
        message.warning(error.message);
        return;
      }
      console.error('提交失败:', error);
      if (pending && signupNeedsReview(error)) {
        setPendingSignupReviewError('原成单已作废或状态发生变化，请先核对成单记录和学员课时。');
      } else if (pending && !reused && isDefinitiveRegistrationFailure(error)) {
        try { await clearPendingSignup(key, pending.requestId); }
        catch (storageError: any) {
          if (isCurrent()) message.error(storageError.message || '请保留原登记并重试核对');
          return;
        }
        if (!isCurrent()) return;
        setPendingSignup(null);
      }
      message.error(error.response?.data?.error?.message || error.message || '操作失败，请核对原登记');
    } finally { if (isCurrent()) { signupSubmitLock.current = false; setSignupSubmitting(false); } }
  };

  const handleTableChange = (paginationConfig: any) => {
    setPagination({
      ...pagination,
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize,
    });
  };

  const signupScheduleGroups: RegistrationOption[] = [...new Set(registrationSchedules.map(slot => slot.classId))].map(classId => {
    const slots = registrationSchedules.filter(slot => slot.classId === classId);
    return {
      label: `${slots[0].className}${slots[0].classCode ? ` (${slots[0].classCode})` : ''}`,
      options: slots.map(slot => ({ value: slot.id, label: `${slot.className} · ${registrationScheduleLabel(slot)}`, searchText: `${slot.className} ${slot.classCode || ''} ${slot.courseType || ''} ${registrationScheduleLabel(slot)} ${slot.classroom || ''} ${slot.teacherName || ''}`, slot })),
    };
  });
  const signupPreview: RegistrationSchedule | null = editingRecord?.registrationSchedule || pendingSignup?.preview?.registrationSchedule as RegistrationSchedule || selectedSignupSchedule || null;

  const columns = [
    {
      title: '学员姓名',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 100,
    },
    {
      title: '年龄',
      dataIndex: 'age',
      key: 'age',
      width: 60,
      render: (age: number | null) => age ?? '-',
    },
    {
      title: '联系方式',
      dataIndex: 'contact',
      key: 'contact',
      width: 130,
    },
    {
      title: '报名班级',
      dataIndex: 'className',
      key: 'className',
      width: 120,
      render: (text: string, record: any) => <div><span>{text || '暂未分班'}</span>{record.registrationSchedule?.startTime && <div style={{ color: 'var(--tx3)', fontSize: 12, marginTop: 4 }}>{registrationScheduleLabel(record.registrationSchedule)}</div>}</div>,
    },
    {
      title: '课时数',
      dataIndex: 'totalLessons',
      key: 'totalLessons',
      width: 80,
      render: (num: number) => num ? `${num}节` : '-',
    },
    {
      title: '成交金额',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number | string | null) => price == null ? '未填写' : `¥${Number(price).toFixed(2)}`,
    },
    {
      title: '支付状态',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 90,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; tone: string }> = {
          paid: { text: '已付款', tone: 'tone-ok' },
          pending: { text: '待付款', tone: 'tone-warn' },
          partial: { text: '部分付款', tone: 'tone-acc' },
        };
        const statusInfo = statusMap[status] || { text: status, tone: 'tone-mute' };
        return <span className={`bz-tag ${statusInfo.tone}`}>{statusInfo.text}</span>;
      },
    },
    {
      title: '销售',
      dataIndex: 'salesName',
      key: 'salesName',
      width: 80,
      render: (text: string) => text || <span style={{ color: 'var(--tx3)' }}>-</span>,
    },
    {
      title: '成单日期',
      dataIndex: 'conversionDate',
      key: 'conversionDate',
      width: 110,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '来源',
      dataIndex: 'experienceLessonId',
      key: 'source',
      width: 120,
      render: (_: string, record: any) => {
        // 2026-11-08：作废（红冲）单优先标识并携带作废记录（原因/操作人/日期）；其余按续费/新报名显示
        if (record.approvalStatus === 'voided') {
          const voidNote = (record.notes || '').split('；').find((s: string) => s.startsWith('【作废')) || '已作废';
          return <span className="bz-tag tone-bad" title={voidNote}>已作废</span>;
        }
        // 兼容 '续费' 和 'renewal' 两种值
        const isRenewal = record.courseType === '续费' || record.courseType === 'renewal';
        return isRenewal ? (
          <span className="bz-tag tone-acc">续费</span>
        ) : (
          <span className="bz-tag tone-ok">新报名</span>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      className: 'bz-cell-act',
      render: (_: any, record: any) => (
        <Space size="small">
          {record.approvalStatus !== 'voided' && canEdit && (
            <Button
              type="link"
              className="cashflow-edit-action"
              size="small"
              icon={<EditOutlined size={16} />}
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          )}
          {/* 2026-11-08 用户拍板：删除按钮取消，错误成单一律走作废（红冲）保留记录 */}
          {['confirmed', 'pending'].includes(record.approvalStatus) && canEdit && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => { setVoidTarget(record); setVoidReason(''); }}
            >
              作废
            </Button>
          )}
        </Space>
      ),
    },
  ];

  if (renderedAccount !== scopeKey) return <div role="status">正在加载当前账号的数据…</div>;

  return (
    <div className="cfs-page cashflow-page" data-testid="cashflow-orders">
      <div className="cfs-heading cashflow-heading">
        <div className="biz-head-copy"><h1>成单信息表</h1><p>查看新签与续费记录，按日期和学员核对成交金额。</p></div>
        <div className="biz-head-actions">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined size={16} />} onClick={handleAdd}>
              新增成单
            </Button>
          )}
          {canCreate && canRenew && (
            <Button type="default" icon={<PlusCircleOutlined size={16} />} onClick={handleOpenRenewalModal}>
              新增续费
            </Button>
          )}
          {/* 2026-11-08 用户拍板：作废记录汇总入口，放在新增/续费旁 */}
          <Button type="default" icon={<RollbackOutlined size={16} />} onClick={handleOpenVoidRecords}>
            作废记录
          </Button>
        </div>
      </div>

      {/* 筛选区域 */}
      <section className="cfs-glass cashflow-toolbar cashflow-order-filters" aria-label="成单筛选">
        <div className="cashflow-quick-filter">
          <span className="cashflow-filter-label"><FilterOutlined size={16} /> 成单日期</span>
          <Radio.Group value={quickFilter} onChange={(e) => handleQuickFilter(e.target.value)}>
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="week">近一周</Radio.Button>
            <Radio.Button value="month">本月</Radio.Button>
            <Radio.Button value="lastMonth">上月</Radio.Button>
          </Radio.Group>
        </div>
        <div className="cashflow-filter-controls">
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
              setQuickFilter('custom');
              setPagination(prev => ({ ...prev, current: 1 }));
            }}
            format="YYYY-MM-DD"
            placeholder={['开始日期', '结束日期']}
          />
          <Select
            placeholder="筛选学员"
            allowClear
            style={{ width: 220 }}
            showSearch
            options={studentFilterOptions}
            value={selectedStudentFilter}
            onChange={(value) => handleStudentFilterChange(value)}
            optionFilterProp="label"
          />
        </div>
      </section>
      <section className="cashflow-stats" aria-label="成单汇总">
        <article className="cfs-glass cashflow-stat">
          <Statistic title="成单数量" value={stats?.totalCount ?? '—'} loading={loading} suffix="单" />
          <span className="cashflow-stat-note">当前筛选范围内的全部成单</span>
        </article>
        <article className="cfs-glass cashflow-stat cashflow-stat-primary">
          <Statistic title="成交总额" value={stats?.totalAmount ?? '—'} loading={loading} precision={2} prefix="¥" />
          <span className="cashflow-stat-note">新签与续费的成交金额合计</span>
        </article>
      </section>
      {stats && stats.pricedCount != null && stats.pricedCount < stats.totalCount && <div className="cashflow-summary-note">其中 {stats.totalCount - stats.pricedCount} 单未填写成交金额。</div>}
      {summaryError && <Alert type="error" showIcon className="cashflow-summary-note" message="汇总加载失败，列表仍可查看。" action={<Button size="small" onClick={fetchData}>重试</Button>} />}

      <div className="bz-table-wrap">
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 1140 }}
      />
      </div>

      <Modal
        title="新增续费"
        open={renewalModalVisible}
        onCancel={() => {
          if (renewalSubmitting) return;
          setRenewalModalVisible(false);
          setSelectedRenewalStudent(null);
        }}
        onOk={() => pendingRenewal ? void handleRenewalSubmit({}) : renewalForm.submit()}
        okText={pendingRenewal ? '重试并确认' : '确认续费'}
        okButtonProps={{ disabled: Boolean(pendingRenewalError) || renewalReviewId === pendingRenewal?.requestId }}
        confirmLoading={renewalSubmitting}
        closable={!renewalSubmitting}
        maskClosable={!renewalSubmitting}
        width={600}
      >
        {pendingRenewalError && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={pendingRenewalError} />}
        {pendingRenewal && renewalReviewId === pendingRenewal.requestId && <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="原成单已变更，请先核对成单及学员课时"
          action={<Space><Button onClick={() => { setRenewalModalVisible(false); fetchData(); }}>查看成单</Button><Button onClick={handleAcknowledgeRenewal}>已核对，结束本次续费</Button></Space>} />}
        {pendingRenewal ? <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="有一笔续费等待确认"
          description={`${pendingRenewal.studentName} · ${pendingRenewal.totalLessons} 节 · ¥${pendingRenewal.price ?? '未填写'} · ${pendingRenewal.conversionDate}。点击“重试并确认”会核对同一笔操作，不会再次加课。`} /> : <>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="续费确认后保存成单、增加课时，并按成单日期计入收入总结。" description="同一天可办理多笔独立续费；结果未确认时请重试原操作。" />
        <Form form={renewalForm} onFinish={handleRenewalSubmit} layout="vertical" disabled={renewalSubmitting || !!pendingRenewalError}>
          <Form.Item
            name="studentId"
            label="续费学员"
            rules={[{ required: true, message: '请选择续费学员' }]}
          >
            <Select
              placeholder="请选择续费学员"
              options={renewalStudents.map((student) => ({
                label: `${student.name} - ${student.phone || student.parentPhone || '无电话'}（剩余 ${student.remainingLessons || 0} 节）`,
                value: student.id,
              }))}
              showSearch
              optionFilterProp="label"
              onChange={handleRenewalStudentChange}
            />
          </Form.Item>
          {selectedRenewalStudent && (
            <Form.Item label="当前剩余课时">
              <Tag color="blue">{selectedRenewalStudent.remainingLessons || 0} 节</Tag>
            </Form.Item>
          )}

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="classId" label="续费班级">
              <Select
                placeholder="请选择班级（不填则保持原班级）"
                allowClear
                showSearch
                options={classes.map((cls) => ({
                  label: cls.name,
                  value: cls.id,
                }))}
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item name="totalLessons" label="续费课时" required rules={[purchaseLessonsRule]}>
              <Input inputMode="numeric" placeholder="课时数" />
            </Form.Item>
          </div>

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="price" label="续费金额" extra="本次续费整批金额，0 元请填 0。" required rules={[purchasePriceRule]}>
              <Input inputMode="decimal" prefix="¥" placeholder="金额" />
            </Form.Item>
            <Form.Item name="paymentMethod" label="支付方式">
              <Select placeholder="请选择" allowClear>
                <Option value="cash">现金</Option>
                <Option value="wechat">微信</Option>
                <Option value="alipay">支付宝</Option>
                <Option value="card">银行卡</Option>
                <Option value="transfer">转账</Option>
              </Select>
            </Form.Item>
          </div>

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="paymentStatus" label="支付状态" rules={[{ required: true }]}>
              <Select placeholder="请选择">
                <Option value="paid">已付款</Option>
                <Option value="pending">待付款</Option>
                <Option value="partial">部分付款</Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="salesId"
              label="跟进人"
            >
              <Select placeholder={canEdit ? '请选择（不填则算班级老师）' : '续费默认归属本人'} disabled={!canEdit} allowClear showSearch optionFilterProp="children">
                {staffList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div style={{ 
            marginBottom: 16, 
            padding: 8, 
            background: 'var(--acc-bg)', 
            border: '1px solid var(--line)',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--tx2)'
          }}>
            <div className="overlay-note-title"><Info size={15} aria-hidden="true" /><strong>业绩归属说明</strong></div>
            <div>• 填写跟进人 → 业绩算跟进人</div>
            <div>• 填写班级但不填跟进人 → 业绩算该班级老师</div>
            <div>• 都不填 → 业绩算原班级老师</div>
          </div>

          <Form.Item name="conversionDate" label="续费日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" disabledDate={current => !!current && current.isAfter(dayjs().endOf('day'))} />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <TextArea rows={2} placeholder="例如：转介绍/续费" />
          </Form.Item>
        </Form></>}
      </Modal>

      {/* 新增/编辑成单 Modal */}
      <Modal
        title={editingRecord ? '编辑成单信息' : '新增成单'}
        open={modalVisible}
        onCancel={() => {
          if (signupSubmitLock.current) return;
          signupOpenRef.current += 1;
          setModalVisible(false);
          setSelectedExperienceId(null);
          setSourceType('new');
          scheduleAbortRef.current?.abort();
          scheduleRequestRef.current += 1;
        }}
        onOk={() => pendingSignup && !editingRecord ? void retrySignup() : form.submit()}
        okText={signupSubmitting ? '正在保存' : pendingSignup && !editingRecord ? '重试原成单' : editingRecord ? '保存' : '确认成单'}
        confirmLoading={signupSubmitting}
        cancelButtonProps={{ disabled: signupSubmitting }}
        okButtonProps={{ disabled: !editingRecord && (Boolean(pendingSignupReviewError) || (!pendingSignup && (otherSignupPending || !registrationSchedulesReady))) }}
        maskClosable={!signupSubmitting}
        keyboard={!signupSubmitting}
        closable={!signupSubmitting}
        width={700}
        styles={{ body: { maxHeight: 'calc(calc(var(--ui-vh, 1vh) * 100) - 220px)', overflowY: 'auto' } }}
      >
        {otherSignupPending && !pendingSignup && !editingRecord && <Alert type="warning" showIcon message="另一窗口有待确认成单" description="请先核对原登记，再新增成单。当前填写的内容尚未提交。" action={<Button size="small" onClick={handleAdd}>查看原登记</Button>} style={{ marginBottom: 16 }} />}
        {pendingSignup && !editingRecord && !signupSubmitting && <Alert type={pendingSignupReviewError ? 'error' : 'warning'} showIcon message={pendingSignupReviewError ? '原成单需要核对' : '原成单结果待确认'} description={pendingSignupReviewError || '已保留原登记。重试将核对同一笔结果，不会重复建档、入班或增加课时。'} style={{ marginBottom: 16 }} />}
        {pendingSignupReviewError && !editingRecord && <Space wrap style={{ marginBottom: 16 }}>
          <Button onClick={() => { setModalVisible(false); void fetchData(); }}>查看成单记录</Button>
          <Button onClick={() => void endReviewedSignup()} disabled={signupSubmitting}>已核对，结束本次登记</Button>
        </Space>}
        <Form form={form} onFinish={handleSubmit} layout="vertical" disabled={signupSubmitting || Boolean(pendingSignup && !editingRecord)}>
          {!editingRecord && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="同一家长的多个孩子需分别建档" description="同手机号不会自动关联其他孩子。成单后，请由管理员在学员管理中进入每个孩子的“家长账号”，逐个关联已有账号。" />}
          {/* 来源选择（仅新增时显示） */}
          {!editingRecord && (
            <Form.Item label="成单来源">
              <Radio.Group 
                value={sourceType} 
                onChange={(e) => {
                  setSourceType(e.target.value);
                  setSelectedExperienceId(null);
                  form.resetFields(['studentName', 'age', 'contact', 'classId', 'salesId', 'scheduleId']);
                  form.setFieldsValue({ paymentStatus: 'paid', conversionDate: dayjs() });
                }}
              >
                <Radio.Button value="new">
                  <UserAddOutlined size={16} /> 直接成单
                </Radio.Button>
                <Radio.Button value="experience">
                  <ImportOutlined size={16} /> 从体验课转化
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

          {/* 从体验课选择（仅新增且选择体验课时显示） */}
          {!editingRecord && sourceType === 'experience' && (
            <Form.Item label="选择体验课" required>
            <Select
              placeholder="请选择体验课"
                loading={experienceLoading}
                disabled={experienceLoading || !!experienceError}
                value={selectedExperienceId}
                onChange={handleExperienceSelect}
                showSearch
                filterOption={(input, option) => {
                  const exp = experienceLessons.find(e => e.id === option?.value);
                  if (!exp) return false;
                  const searchText = `${exp.studentName} ${exp.contact} ${exp.className || ''}`.toLowerCase();
                  return searchText.includes(input.toLowerCase());
                }}
              >
                {experienceLessons.map(exp => (
                  <Option key={exp.id} value={exp.id}>
                    {exp.studentName} - {exp.contact} {exp.className ? `(${exp.className})` : ''}
                  </Option>
                ))}
              </Select>
              {experienceError && <Alert type="error" showIcon message={experienceError} action={<Button size="small" onClick={() => void fetchExperienceLessons()}>重试</Button>} />}
              {!experienceLoading && !experienceError && experienceLessons.length === 0 && (
                <div style={{ color: 'var(--tx3)', fontSize: 12, marginTop: 4 }}>
                  暂无可转化的体验课
                </div>
              )}
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="studentName" label="学员姓名" rules={[{ required: true, whitespace: true, message: '请输入学员姓名' }, { max: 50, message: '学员姓名不能超过50个字符' }]}>
              <Input placeholder="请输入学员姓名" disabled={signupSubmitting || Boolean(pendingSignup) || sourceType === 'experience' && !!selectedExperienceId} />
            </Form.Item>
            <Form.Item name="age" label="年龄" rules={[{ required: true, message: '请输入年龄' }]}>
              <InputNumber min={0} max={150} placeholder="年龄" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="gender" label="性别">
              <Select placeholder="请选择" allowClear>
                <Option value="male">男</Option>
                <Option value="female">女</Option>
              </Select>
            </Form.Item>
          </div>

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="contact" label="联系方式" extra={sourceType === 'experience' && !!selectedExperienceId ? '使用体验课电话；如无有效电话，请先在体验课资料中修改。' : '仅支持手机、固话或国际电话号码。'} rules={[
              { required: true, whitespace: true, message: '请输入联系电话' },
              { validator: (_, value) => editingRecord && value === editingRecord.contact || typeof value === 'string' && isValidContactPhone(value)
                ? Promise.resolve() : Promise.reject(new Error('请输入有效的电话号码，不支持微信号或字母')) },
            ]}>
              <Input placeholder="请输入手机、固话或国际电话号码" disabled={signupSubmitting || Boolean(pendingSignup) || sourceType === 'experience' && !!selectedExperienceId} />
            </Form.Item>
            <Form.Item name="parentName" label="家长姓名">
              <Input placeholder="请输入家长姓名" />
            </Form.Item>
          </div>

          <Form.Item name="address" label="地址">
            <Input placeholder="请输入地址" />
          </Form.Item>

          {!editingRecord && !pendingSignup ? <>
            <Form.Item name="scheduleId" label="班级与上课时间" extra="选择真实排课后，成单会自动建档并加入该班；暂未定班可留空，之后在学员管理安排。">
              <Select<string, RegistrationOption>
                aria-label="班级与上课时间"
                placeholder="搜索班级、日期或时段（可暂不选择）"
                allowClear showSearch loading={registrationSchedulesLoading}
                options={signupScheduleGroups}
                filterOption={(input, option) => (option?.searchText as string || '').toLowerCase().includes(input.toLowerCase())}
                optionRender={option => { const slot = option.data.slot; return slot ? <div style={{ whiteSpace: 'normal', padding: '3px 0' }}><div style={{ fontWeight: 600 }}>{option.label}</div><div style={{ color: 'var(--tx3)', fontSize: 12 }}>{slot.classroom || '未设置教室'} · {slot.teacherName || '未设置场次老师'}</div></div> : option.label; }}
                notFoundContent={registrationSchedulesLoading ? '正在读取真实排课…' : registrationSchedulesError ? '排课读取失败，请重试' : '未来一个月暂无匹配排课，可先建档后安排班级'}
              />
            </Form.Item>
            {registrationSchedulesError && <Alert type="error" showIcon message="报名排课读取失败" description={registrationSchedulesError} style={{ marginBottom: 16 }} action={<Button size="small" onClick={() => void loadRegistrationSchedules()}>重新查询</Button>} />}
          </> : <Form.Item label="原报名安排"><div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg2)', lineHeight: 1.8 }}>{signupPreview ? <><strong>{signupPreview.className} · {registrationScheduleLabel(signupPreview)}</strong><div style={{ color: 'var(--tx2)' }}>{signupPreview.classroom || '未设置教室'} · {signupPreview.teacherName || '未设置场次老师'}</div></> : editingRecord?.className || pendingSignup?.payload.className as string || '暂未安排班级，后续可在学员管理入班'}</div></Form.Item>}
          {selectedSignupSchedule && !pendingSignup && !editingRecord && <div style={{ color: 'var(--tx2)', fontSize: 12, marginTop: -10, marginBottom: 16 }}>{selectedSignupSchedule.classroom || '未设置教室'} · {selectedSignupSchedule.teacherName || '未设置场次老师'}{selectedSignupSchedule.courseType ? ` · ${selectedSignupSchedule.courseType}` : ''}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="totalLessons" label="购买课时" required={!editingRecord} rules={editingRecord ? [] : [purchaseLessonsRule]}>
              <Input inputMode="numeric" placeholder="课时数" disabled={!!editingRecord || signupSubmitting || Boolean(pendingSignup)} />
            </Form.Item>
            <Form.Item name="price" label="成交金额" required={!editingRecord} rules={editingRecord ? [] : [purchasePriceRule]} extra={editingRecord ? '已登记金额需通过正式更正流程修改' : '填写本次购课整批金额，0 元请填 0。'}>
              <Input inputMode="decimal" prefix="¥" placeholder="金额" disabled={!!editingRecord || signupSubmitting || Boolean(pendingSignup)} />
            </Form.Item>
            <Form.Item name="paymentMethod" label="支付方式">
              <Select placeholder="请选择" allowClear>
                <Option value="cash">现金</Option>
                <Option value="wechat">微信</Option>
                <Option value="alipay">支付宝</Option>
                <Option value="card">银行卡</Option>
                <Option value="transfer">转账</Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="paymentStatus" label="支付状态" rules={[{ required: true }]}>
              <Select placeholder="请选择">
                <Option value="paid">已付款</Option>
                <Option value="pending">待付款</Option>
                <Option value="partial">部分付款</Option>
              </Select>
            </Form.Item>
            <Form.Item name="salesId" label="销售/跟进人">
              <Select placeholder="请选择" allowClear showSearch optionFilterProp="children">
                {staffList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>
                    {staff.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="conversionDate" label="成单日期" rules={[{ required: true, message: '请选择成单日期' }]}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" disabledDate={current => !!current && current.isAfter(dayjs().endOf('day'))} />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="备注">
            <TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 成单作废（红冲）弹窗：保留记录、课时冲回、退出全部统计口径 */}
      <Modal
        title={voidTarget ? `作废成单 · ${voidTarget.studentName}${voidTarget.price != null ? `（¥${Number(voidTarget.price).toFixed(2)} / ${voidTarget.totalLessons ?? 0} 节）` : ''}` : '作废成单'}
        open={!!voidTarget}
        onCancel={() => { if (!voidSubmitting) { setVoidTarget(null); setVoidReason(''); } }}
        onOk={handleVoid}
        confirmLoading={voidSubmitting}
        okText="确认作废"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="作废（红冲）不删除任何记录"
          description="该单将标记为已作废并退出所有统计（现金流、课消、退费计价、家长端缴费记录）；已入账课时会反向冲回（已被消耗的课时无法冲回，将如实提示）；作废原因与操作人会追加记录在原单上，可随时追溯。误录成单请优先作废重录，不要删除。" />
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: 'var(--tx3)', fontSize: 12, marginBottom: 4 }}>作废原因（必填，追加到原单记录）</div>
          <Input.TextArea
            rows={2}
            maxLength={200}
            showCount
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="例如：录错金额/课时，正确单已重录"
            disabled={voidSubmitting}
          />
        </div>
      </Modal>

      {/* 作废记录（红冲）汇总：笔数/金额/实际冲回课时 + 明细表 */}
      <Modal
        title={<span><RollbackOutlined size={16} style={{ marginRight: 8, color: 'var(--bad)' }} />作废记录（红冲汇总）</span>}
        open={voidRecordsOpen}
        onCancel={() => { voidRequest.current += 1; setVoidRecordsOpen(false); }}
        footer={<Button onClick={() => { voidRequest.current += 1; setVoidRecordsOpen(false); }}>关闭</Button>}
        width={860}
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic title="作废笔数" value={voidSummary?.count ?? '—'} suffix={voidSummary ? '笔' : undefined} valueStyle={{ color: 'var(--bad)' }} />
          </Col>
          <Col span={8}>
            <Statistic
              title="作废金额合计"
              value={voidSummary?.amount ?? '—'}
              prefix="¥" precision={2}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="实际冲回课时"
              value={voidSummary?.reversedLessons ?? '—'}
              suffix={voidSummary ? '节' : undefined}
            />
          </Col>
        </Row>
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="作废单不参与现金流、课消、退费计价与家长端缴费记录；每笔的原单与作废记录均永久保留，可在列表悬浮「已作废」标签查看。" />
        {voidSummary && (voidSummary.unresolvedLogs > 0 || voidSummary.pricedCount < voidSummary.count) && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`汇总已覆盖全部作废记录${voidSummary.pricedCount < voidSummary.count ? `；${voidSummary.count - voidSummary.pricedCount} 笔原单金额未填写，金额为已知部分` : ''}${voidSummary.unresolvedLogs ? `；${voidSummary.unresolvedLogs} 条历史冲回流水无法唯一关联原单，课时为已核部分` : ''}。`} />}
        {voidRecordsError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="作废记录读取失败" description={voidRecordsError} action={<Button onClick={() => void fetchVoidRecords(voidPagination.current, voidPagination.pageSize)}>重试</Button>} />}
        <Table
          dataSource={voidRecords}
          columns={voidRecordColumns}
          loading={voidRecordsLoading}
          rowKey="id"
          size="small"
          pagination={{ ...voidPagination, onChange: (page, pageSize) => void fetchVoidRecords(page, pageSize), showTotal: (total) => `共 ${total} 笔` }}
          locale={{ emptyText: voidRecordsError ? '读取失败，请重试' : '暂无作废记录' }}
        />
      </Modal>
    </div>
  );
};

export default OrderInfo;
