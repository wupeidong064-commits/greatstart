import { useOverlaySubmit, Modal, Popconfirm } from '../components/overlays';
import { useState, useEffect, useRef } from 'react';
import { Table, Input, Space, Tag, message, Button, Select, Form, DatePicker, Tabs, Alert } from 'antd';
import { purchaseLessonsRule, purchasePriceRule } from '../utils/orderNumberFields';
import { Info, Search as SearchOutlined, FileSpreadsheet as FileExcelOutlined, CircleX as CloseCircleOutlined, UserRound as UserOutlined } from 'lucide-react';
import './CashflowSummary.css';
import './CashflowPages.css';
import './RenewalStudents.css';
import { UserRoundCheck } from 'lucide-react';
import api from '../services/api';
import { dataService } from '../services/dataService';
import { useBzExpand, bzExpandable, bzRowClass } from '../hooks/useBzExpand';
import { useBusinessRefresh } from '../hooks/useBusinessRefresh';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';
import { renewalStorageKey, readRenewalSnapshot, preparePendingRenewal, clearPendingRenewal, acknowledgeReviewedRenewal, RenewalPendingConflict, isDefinitiveRenewalFailure, type PendingRenewal, type RenewalSnapshot } from '../utils/renewalRequest';
const renewalAccount = () => { const u = useAuthStore.getState().user; return JSON.stringify(u && [u.id, u.organizationId, u.campusId, u.role, !!u.isPlatformAdmin]); };
const renewalListSession = () => { const s = useAuthStore.getState(); return JSON.stringify([s.token, s.user?.id, s.user?.organizationId, s.user?.campusId, s.user?.role, s.user?.managementLevel]); };
const EXPORT_COLLAPSED = true; // 步骤2 导出收拢：普通经营列表默认关闭导出入口（记录见 EXPORT_MATRIX.md）

const { Option } = Select;
const { RangePicker } = DatePicker;

interface StaffUser {
  id: string;
  name: string;
}

interface ClassInfo {
  id: string;
  name: string;
  code?: string;
  teacher?: { id: string; name: string };
}

const RenewalStudents = () => {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const listSession = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.role, user?.managementLevel]);
  const activeListSession = useRef<string | null>(listSession); activeListSession.current = listSession;
  const isListSessionCurrent = (key: string) => activeListSession.current === key && renewalListSession() === key;
  const pendingListRequest = useRef(0), noRenewalListRequest = useRef(0), teacherRequest = useRef(0), classRequest = useRef(0), staffRequest = useRef(0);
  const scopeKey = JSON.stringify(user && [user.id, user.organizationId, user.campusId, user.role, !!user.isPlatformAdmin]);
  const canChooseSales = !!user && !user.isPlatformAdmin && (['super', 'manager'].includes(user.managementLevel || '') || (user.managementLevel === undefined && ['admin', 'manager'].includes(normalizeRole(user.role))));
  const canWorkRenewals = !user?.isPlatformAdmin && (canChooseSales || ['coach', 'teacher'].includes(normalizeRole(user?.role || '')));
  const responsibleTeachers = (record: any) => [...new Set<string>((record.enrollments || []).filter((enrollment: any) => enrollment.status === 'active').map((enrollment: any) => enrollment.class?.teacher?.name).filter(Boolean))].join('、') || '待安排负责老师';
  const [renewalSubmitting, setRenewalSubmitting] = useState(false);
  const [pendingRenewal, setPendingRenewal] = useState<PendingRenewal | null>(null);
  const [pendingRenewalError, setPendingRenewalError] = useState('');
  const [renewalReviewId, setRenewalReviewId] = useState<string | null>(null);
  const renewalSubmitLock = useRef(false);
  const renewalAttemptRef = useRef(0);
  const renewalOpenRef = useRef(0);
  const renewalOwnerRef = useRef('');
  const renewalSnapshotRef = useRef<RenewalSnapshot | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // 老师列表
  const [teacherList, setTeacherList] = useState<StaffUser[]>([]);
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [classList, setClassList] = useState<ClassInfo[]>([]);
  const [renewalDateRange, setRenewalDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // 续费弹窗
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const [renewingStudent, setRenewingStudent] = useState<any>(null);
  const [renewalForm] = Form.useForm();

  // 不续费弹窗
  const [noRenewalModalVisible, setNoRenewalModalVisible] = useState(false);
  const [submitNoRenewalForm, noRenewalSubmitting] = useOverlaySubmit((values: any) => handleNoRenewalSubmit(values));
  const [noRenewalForm] = Form.useForm();

  // 当前 Tab
  const [activeTab, setActiveTab] = useState<string>('pending');

  // 不续费学员列表
  const [noRenewalStudents, setNoRenewalStudents] = useState<any[]>([]);
  // 行展开（bz-table 单行展开状态机，两个 Tab 共用一套，同一时间只展开一行）
  const bz = useBzExpand();
  const [noRenewalLoading, setNoRenewalLoading] = useState(false);
  const [noRenewalPagination, setNoRenewalPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  useEffect(() => {
    renewalAttemptRef.current += 1;
    renewalOpenRef.current += 1;
    renewalOwnerRef.current = '';
    setRenewalReviewId(null);
    renewalSubmitLock.current = false;
    renewalSnapshotRef.current = null;
    setRenewalSubmitting(false);
    setRenewalModalVisible(false);
    setRenewingStudent(null);
    setPendingRenewal(null);
    setPendingRenewalError('');
    renewalForm.resetFields();
  }, [scopeKey, renewalForm]);

  useEffect(() => {
    const account = renewalAccount();
    let active = true;
    void (async () => {
      try {
        const snapshot = await readRenewalSnapshot(renewalStorageKey(useAuthStore.getState().user));
        if (active && account === renewalAccount()) setPendingRenewal(snapshot.pending);
      } catch (error: any) {
        if (active && account === renewalAccount()) setPendingRenewalError(error.message || '无法读取待确认续费记录');
      }
    })();
    return () => { active = false; };
  }, [scopeKey]);

  useEffect(() => {
    let readVersion = 0;
    const onStorage = async (event: StorageEvent) => {
      if (!renewalModalVisible) return;
      const account = renewalAccount(), open = renewalOpenRef.current;
      let key: string;
      try { key = renewalStorageKey(useAuthStore.getState().user); } catch { return; }
      if (event.key !== null && event.key !== key && event.key !== `${key}:settled`) return;
      const version = ++readVersion;
      try {
        const snapshot = await readRenewalSnapshot(key);
        if (account !== renewalAccount() || open !== renewalOpenRef.current || version !== readVersion || renewalSubmitLock.current) return;
        if (snapshot.revision !== renewalSnapshotRef.current?.revision) {
          setPendingRenewalError('续费已由另一窗口处理，请关闭后重新打开再登记新一笔');
          return;
        }
        renewalSnapshotRef.current = snapshot;
        setPendingRenewal(snapshot.pending);
      } catch (error: any) {
        if (account === renewalAccount() && open === renewalOpenRef.current && version === readVersion) setPendingRenewalError(error.message || '无法读取待确认续费记录');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { readVersion += 1; window.removeEventListener('storage', onStorage); };
  }, [renewalModalVisible, scopeKey]);

  const pendingQuery = JSON.stringify([listSession, pagination.current, pagination.pageSize, searchText, selectedTeacher, renewalDateRange]);
  const noRenewalQuery = JSON.stringify([listSession, noRenewalPagination.current, noRenewalPagination.pageSize, searchText, selectedTeacher]);
  const pendingQueryRef = useRef(pendingQuery); pendingQueryRef.current = pendingQuery;
  const noRenewalQueryRef = useRef(noRenewalQuery); noRenewalQueryRef.current = noRenewalQuery;
  useEffect(() => {
    activeListSession.current = listSession; pendingListRequest.current++; noRenewalListRequest.current++; teacherRequest.current++; classRequest.current++; staffRequest.current++;
    setStudents([]); setNoRenewalStudents([]); setTeacherList([]); setClassList([]); setStaffList([]); setLoading(false); setNoRenewalLoading(false);
    if (user?.organizationId && user.campusId) { void fetchTeacherList(); void fetchClassList(); void fetchStaffList(); }
    return () => { activeListSession.current = null; pendingListRequest.current++; noRenewalListRequest.current++; teacherRequest.current++; classRequest.current++; staffRequest.current++; };
  }, [listSession]);
  useEffect(() => { if (user?.organizationId && user.campusId) void fetchRenewalStudents(); }, [pendingQuery]);
  useEffect(() => { if (user?.organizationId && user.campusId) void fetchNoRenewalStudents(); }, [noRenewalQuery]);
  useBusinessRefresh(() => { if (user?.organizationId && user.campusId) { void fetchRenewalStudents(); void fetchNoRenewalStudents(); void fetchTeacherList(); void fetchClassList(); void fetchStaffList(); } });
  const fetchTeacherList = async () => {
    const request = ++teacherRequest.current, key = listSession;
    try { const data = await dataService.getTeachers(); if (request === teacherRequest.current && isListSessionCurrent(key)) setTeacherList(data); }
    catch { if (request === teacherRequest.current && isListSessionCurrent(key)) console.error('获取老师列表失败'); }
  };
  const fetchClassList = async () => {
    const request = ++classRequest.current, key = listSession;
    try { const data = await dataService.getClasses(); if (request === classRequest.current && isListSessionCurrent(key)) setClassList(data || []); }
    catch { if (request === classRequest.current && isListSessionCurrent(key)) console.error('获取班级列表失败'); }
  };
  const fetchStaffList = async () => {
    const request = ++staffRequest.current, key = listSession;
    try { const data = await dataService.getStaffList(); if (request === staffRequest.current && isListSessionCurrent(key)) setStaffList(data); }
    catch { if (request === staffRequest.current && isListSessionCurrent(key)) console.error('获取续费业绩人员失败'); }
  };

  const fetchRenewalStudents = async () => {
    const request = ++pendingListRequest.current, key = listSession, query = pendingQuery;
    if (!user?.organizationId || !user.campusId) return;
    const isCurrent = () => request === pendingListRequest.current && query === pendingQueryRef.current && isListSessionCurrent(key);
    setLoading(true);
    try {
      // 真实权限由服务端校验，只附加显式老师筛选。
      // 口径（P1-04 统一）：在读 active + 未标记不续费 + 剩余课时 ≤10 —— 与首页待续费提醒同口径
      const params = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        teacherId: selectedTeacher || undefined,
        status: 'active',
        maxRemainingLessons: 10,
        excludeNoRenewal: true,
        includeRenewalHistory: true,
        lastRenewalStartDate: renewalDateRange?.[0]?.format('YYYY-MM-DD'),
        lastRenewalEndDate: renewalDateRange?.[1]?.format('YYYY-MM-DD'),
      };

      const response = await api.get('/students', { params });
      if (!isCurrent()) return;

      // 响应拦截器已经返回 response.data，所以 response 就是后端返回的完整对象
      // 后端 sendPaginated 返回 { success, data, pagination }
      const students = response.data || [];
      const paginationInfo = response.pagination || {} as { total?: number; page?: number; pageSize?: number };

      if (!isCurrent()) return;
      setStudents(students);
      setPagination(prev => ({
        ...prev,
        total: paginationInfo.total || 0,
      }));
    } catch (error: any) {
      if (isCurrent()) { console.error('获取续费学员列表失败'); message.error(error.response?.data?.error?.message || error.message || '获取续费学员列表失败'); }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  const fetchNoRenewalStudents = async () => {
    const request = ++noRenewalListRequest.current, key = listSession, query = noRenewalQuery;
    if (!user?.organizationId || !user.campusId) return;
    const isCurrent = () => request === noRenewalListRequest.current && query === noRenewalQueryRef.current && isListSessionCurrent(key);
    setNoRenewalLoading(true);
    try {
      // 真实权限由服务端校验，只附加显式老师筛选。
      const response = await api.get('/students', {
        params: {
          page: noRenewalPagination.current,
          pageSize: noRenewalPagination.pageSize,
          search: searchText,
          teacherId: selectedTeacher || undefined,
          renewalStatus: 'no_renewal',
        }
      });
      if (!isCurrent()) return;
      const result = response || {};
      setNoRenewalStudents(result.data || []);
      setNoRenewalPagination(prev => ({
        ...prev,
        total: result.pagination?.total || 0,
      }));
    } catch (error: any) {
      if (isCurrent()) console.error('获取不续费学员列表失败');
    } finally {
      if (isCurrent()) setNoRenewalLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    setPagination({ ...pagination, current: 1 });
    setNoRenewalPagination({ ...noRenewalPagination, current: 1 });
  };

  const handleTeacherFilter = (teacherId: string | null) => {
    setSelectedTeacher(teacherId);
    setPagination({ ...pagination, current: 1 });
    setNoRenewalPagination(previous => ({ ...previous, current: 1 }));
  };

  const handleRenewalDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setRenewalDateRange(dates);
    setPagination({ ...pagination, current: 1 });
  };

  // 打开续费弹窗
  const handleRenewal = async (student: any) => {
    if (!canWorkRenewals) { message.error('续费由负责老师或管理员处理'); return; }
    if (renewalSubmitLock.current) return;
    const account = renewalAccount(), open = ++renewalOpenRef.current;
    renewalOwnerRef.current = account;
    setRenewalReviewId(null);
    renewalSnapshotRef.current = null;
    setPendingRenewal(null);
    setPendingRenewalError('正在读取待确认续费记录');
    try {
      const snapshot = await readRenewalSnapshot(renewalStorageKey(useAuthStore.getState().user));
      if (account !== renewalAccount() || open !== renewalOpenRef.current) return;
      renewalSnapshotRef.current = snapshot;
      setPendingRenewal(snapshot.pending);
      setPendingRenewalError('');
    } catch (error: any) {
      if (account !== renewalAccount() || open !== renewalOpenRef.current) return;
      setPendingRenewalError(error.message || '无法读取待确认续费记录');
    }
    setRenewingStudent(student);
    renewalForm.resetFields();
    renewalForm.setFieldsValue({ studentName: student?.name, contact: student?.phone || student?.parentPhone, conversionDate: dayjs(), paymentStatus: 'paid' });
    setRenewalModalVisible(true);
  };

  // 打开不续费弹窗
  const handleNoRenewal = (student: any) => {
    if (!canWorkRenewals) { message.error('续费跟进由负责老师或管理员处理'); return; }
    setRenewingStudent(student);
    noRenewalForm.resetFields();
    setNoRenewalModalVisible(true);
  };

  // 提交续费
  const handleRenewalSubmit = async (values: any) => {
    if (!canWorkRenewals) { message.error('续费由负责老师或管理员处理'); return; }
    if (renewalSubmitLock.current) return;
    if (pendingRenewalError) { message.error(pendingRenewalError); return; }
    if (!pendingRenewal && !renewingStudent) return;
    const account = renewalAccount(), attempt = ++renewalAttemptRef.current;
    if (renewalOwnerRef.current !== account) { message.error('账号状态发生变化，请重新打开续费窗口'); return; }
    const isCurrent = () => account === renewalAccount() && attempt === renewalAttemptRef.current;
    let isRetry = !!pendingRenewal;
    renewalSubmitLock.current = true;
    setRenewalSubmitting(true);
    let key = '', activeRequestId = pendingRenewal?.requestId;
    let sent = false;
    try {
      key = renewalStorageKey(useAuthStore.getState().user);
      const observed = renewalSnapshotRef.current;
      if (!observed) throw new Error('请重新打开续费窗口');
      const activeEnrollment = renewingStudent?.enrollments?.find((e: any) => e.status === 'active');
      const originalTeacherId = activeEnrollment?.class?.teacher?.id;
      const targetClass = classList.find(c => c.id === values.classId);
      const finalSalesId = canChooseSales ? (values.salesId || targetClass?.teacher?.id || originalTeacherId || null) : user?.id || null;
      const payload = {
        studentName: renewingStudent?.name || '',
        classId: values.classId || activeEnrollment?.classId || null,
        totalLessons: Number(values.totalLessons),
        price: Number(values.price),
        paymentMethod: values.paymentMethod || null,
        paymentStatus: values.paymentStatus || 'paid',
        salesId: finalSalesId,
        conversionDate: values.conversionDate ? values.conversionDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        notes: values.notes ? `续费 - ${values.notes}` : '续费',
        existingStudentId: renewingStudent?.id || '',
      };
      const prepared = await preparePendingRenewal(key, payload, observed);
      if (!isCurrent()) return;
      isRetry = prepared.existing;
      activeRequestId = prepared.pending.requestId;
      renewalSnapshotRef.current = { ...observed, pending: prepared.pending };
      setPendingRenewal(prepared.pending);
      sent = true;
      const response = await api.post('/conversions/renewal', prepared.pending);
      await clearPendingRenewal(key, prepared.pending.requestId);
      if (!isCurrent()) return;
      setPendingRenewal(null);
      message.success(response.data?.remaining == null ? '续费已确认' : `续费已确认，剩余 ${response.data.remaining} 节`);
      setRenewalModalVisible(false);
      fetchRenewalStudents();
    } catch (error: any) {
      if (!isCurrent()) return;
      if (error instanceof RenewalPendingConflict) {
        if (error.snapshot.pending) {
          renewalSnapshotRef.current = error.snapshot;
          setPendingRenewal(error.snapshot.pending);
        } else setPendingRenewalError(error.message);
        message.error(error.message);
        return;
      }
      if (sent && activeRequestId && error.response?.data?.error?.code === 'USE_CONVERSION_CORRECTION') {
        setRenewalReviewId(activeRequestId);
        message.error(error.response.data.error.message || '原成单已变更，请核对成单和学员课时');
        return;
      }
      if (sent && !isRetry && isDefinitiveRenewalFailure(error) && activeRequestId) {
        try {
          await clearPendingRenewal(key, activeRequestId);
          const snapshot = await readRenewalSnapshot(key);
          if (!isCurrent()) return;
          renewalSnapshotRef.current = snapshot;
          setPendingRenewal(snapshot.pending);
        } catch (storageError: any) {
          if (isCurrent()) setPendingRenewalError(storageError.message || '无法保持续费核对记录');
        }
        if (isCurrent()) message.error(error.response?.data?.error?.message || '续费信息无效，请检查后重试');
      } else {
        message.error(!sent ? error.message || '无法保存待确认记录' : error.response?.data?.error?.message || '提交结果尚未确认，请核对后重试原续费');
      }
    } finally {
      if (isCurrent()) { renewalSubmitLock.current = false; setRenewalSubmitting(false); }
    }
  };

  const handleAcknowledgeRenewal = () => {
    const requestId = pendingRenewal?.requestId, account = renewalAccount();
    if (!requestId || renewalReviewId !== requestId || renewalSubmitLock.current) return;
    Modal.confirm({
      title: '已核对，结束本次续费？',
      content: '请先查看原成单及学员课时。此操作仅结束本机待确认记录并保留核对凭证，不会退款、加课或修改成单。结束后可重新打开登记新一笔续费。',
      okText: '已核对，结束本次续费', cancelText: '继续核对',
      onOk: async () => {
        if (account !== renewalAccount() || renewalOwnerRef.current !== account) throw new Error('账号状态已变化，请重新核对');
        if (renewalSubmitLock.current) throw new Error('正在处理续费，请稍后再试');
        const attempt = ++renewalAttemptRef.current;
        const isCurrent = () => account === renewalAccount() && attempt === renewalAttemptRef.current;
        renewalSubmitLock.current = true; setRenewalSubmitting(true);
        try {
          await acknowledgeReviewedRenewal(renewalStorageKey(useAuthStore.getState().user), requestId, account);
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

  // 提交不续费
  const handleNoRenewalSubmit = async (values: any) => {
    if (!canWorkRenewals) { message.error('续费跟进由负责老师或管理员处理'); return; }
    try {
      await api.put(`/students/${renewingStudent.id}`, {
        renewalStatus: 'no_renewal',
        noRenewalReason: values.reason,
        noRenewalDate: new Date().toISOString(),
      });

      message.success(`已标记 ${renewingStudent.name} 为不续费`);
      setNoRenewalModalVisible(false);
      fetchRenewalStudents();
    } catch (error: any) {
      console.error('标记不续费失败:', error);
      message.error(error.message || '标记不续费失败');
    }
  };

  // 恢复为待续费
  const handleRestoreRenewal = async (student: any) => {
    if (!canWorkRenewals) { message.error('回访状态由负责老师或管理员处理'); return; }
    try {
      await api.put(`/students/${student.id}`, {
        renewalStatus: null,
        noRenewalReason: null,
        noRenewalDate: null,
      });

      message.success(`已恢复 ${student.name} 的续费意向；名单按当前班级及剩余课时显示`);
      fetchNoRenewalStudents();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  // 待续费主行（用户定稿）：学员、剩余课时、续费状态、跟进操作；
  // 展开列44 + 操作列192；其余三列均匀分配，避免把空白堆到某一列。
  // 电话/负责老师/上次续费/备注移入展开区（完整号码沿用学员数据权限，主表不单列手机号）
  const columns = [
    {
      title: '学员',
      dataIndex: 'name',
      key: 'name',
      className: 'renewal-student-cell',
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
      title: '剩余课时',
      dataIndex: 'remainingLessons',
      key: 'remainingLessons',
      sorter: (a: any, b: any) => (a.remainingLessons || 0) - (b.remainingLessons || 0),
      render: (remaining: number) => {
        const v = remaining ?? 0;
        const color = v <= 3 ? 'var(--bad)' : v <= 5 ? 'var(--warn)' : 'var(--tx)';
        return <span style={{ color, fontWeight: 600 }}>{v} 节</span>;
      },
    },
    {
      title: '续费状态',
      key: 'renewalStatus',
      render: (_: any, record: any) => {
        // 待续费名单内的状态标签：≤3 节=紧急（红=真异常），其余=待续费（橙=需跟进）
        const urgent = (record.remainingLessons ?? 0) <= 3;
        return <span className={`bz-tag ${urgent ? 'tone-bad' : 'tone-warn'}`}>{urgent ? '紧急' : '待续费'}</span>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 192,
      align: 'right' as const,
      className: 'bz-cell-act',
      render: (_: any, record: any) => canWorkRenewals ? (
        <div className="renewal-row-actions">
          <button
            type="button"
            className="bz-act"
            onClick={(e) => { e.stopPropagation(); handleRenewal(record); }}
          >
            续费
          </button>
          <button
            type="button"
            className="renewal-secondary-action"
            onClick={(e) => { e.stopPropagation(); handleNoRenewal(record); }}
          >
            标记不续费
          </button>
        </div>
      ) : <span className="bz-locked">由负责老师处理</span>,
    },
  ];

  // 不续费名单（归档表）：主行 4 列，电话/原因/标记时间入展开区
  const noRenewalColumns = [
    {
      title: '学员',
      dataIndex: 'name',
      key: 'name',
      className: 'renewal-student-cell',
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
      title: '剩余课时',
      dataIndex: 'remainingLessons',
      key: 'remainingLessons',
      render: (remaining: number) => <span style={{ color: 'var(--tx2)' }}>{remaining ?? 0} 节</span>,
    },
    {
      title: '续费状态',
      key: 'renewalStatus',
      render: (_: any, record: any) =>
        record.status === 'graduated'
          ? <span className="bz-tag tone-acc">已毕业</span>
          : <span className="bz-tag tone-mute">已不续费</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 192,
      align: 'right' as const,
      className: 'bz-cell-act',
      render: (_: any, record: any) =>
        canWorkRenewals && record.status !== 'graduated' ? (
          <Popconfirm
            title="确定恢复续费意向吗？" description="只恢复跟进状态，不自动恢复花名册或入班。"
            onConfirm={() => handleRestoreRenewal(record)}
          >
            <button type="button" className="bz-act">恢复</button>
          </Popconfirm>
        ) : (
          <span className="bz-locked">-</span>
        ),
    },
  ];

  return (
    <div className="cfs-page cashflow-page" data-testid="cashflow-renewal">
      <div className="cfs-heading cashflow-heading">
        <div className="biz-head-copy"><h1>续费管理</h1><p>续费名单随班级负责老师同步移交，展开可查看负责老师及回访安排。</p></div>
      </div>
      <section className="cfs-glass cashflow-toolbar" aria-label="续费筛选">
            <Select
              placeholder="按班级老师筛选"
              allowClear
              style={{ width: 150 }}
              value={selectedTeacher}
              onChange={handleTeacherFilter}
            >
              {teacherList.map(teacher => (
                <Option key={teacher.id} value={teacher.id}>{teacher.name}</Option>
              ))}
            </Select>
            <Input.Search
              placeholder="搜索姓名、电话"
              allowClear
              style={{ width: 200 }}
              prefix={<SearchOutlined size={16} />}
              onSearch={handleSearch}
              onChange={(e) => {
                if (!e.target.value) handleSearch('');
              }}
            />
            <RangePicker
              value={renewalDateRange}
              onChange={handleRenewalDateChange}
              format="YYYY-MM-DD"
              allowClear
              placeholder={['最近续费开始日', '最近续费结束日']}
            />
{!EXPORT_COLLAPSED && (            <Button icon={<FileExcelOutlined size={16} />} disabled>
              导出
            </Button>)}
      </section>

      {canWorkRenewals && !renewalModalVisible && (pendingRenewal || pendingRenewalError) && <Alert
        style={{ marginBottom: 16 }} showIcon type={pendingRenewalError ? 'error' : 'warning'}
        message={pendingRenewalError || '有一笔续费等待确认'}
        description={pendingRenewal ? `${pendingRenewal.studentName} · ${pendingRenewal.totalLessons} 节 · ¥${pendingRenewal.price ?? '未填写'}` : undefined}
        action={<Button onClick={() => void handleRenewal(null)}>核对续费记录</Button>}
      />}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'pending',
            label: (
              <span>
                <UserOutlined size={16} /> 待续费学员 ({pagination.total})
              </span>
            ),
            children: (
              <>
                <p className="cashflow-followup-note">以下在读学员剩余课时 ≤ 10 节，请及时跟进续费。</p>
      <div className="bz-table-wrap">
        <Table
          columns={columns}
          dataSource={students}
          loading={loading}
          rowKey="id"
          expandable={{ ...bzExpandable<any>(bz, (record) => (
            <>
              <dl className="bz-x-grid">
                <div className="bz-x-item">
                  <dt>联系电话</dt>
                  <dd>{record.parentPhone || record.phone || '-'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>负责老师</dt>
                  <dd>
                    {responsibleTeachers(record)}
                  </dd>
                </div>
                <div className="bz-x-item">
                  <dt>回访老师</dt>
                  <dd>{record.recallTeacher?.name || '随班级负责老师跟进'}</dd>
                </div>
                <div className="bz-x-item">
                  <dt>上次续费</dt>
                  <dd>
                    {record.lastRenewalPrice != null && record.lastRenewalLessons != null
                      ? <span style={{ color: 'var(--acc-strong)' }}>{record.lastRenewalPrice}/{record.lastRenewalLessons}</span>
                      : record.renewalCount > 0 ? '待核价' : '-'}
                  </dd>
                </div>
                <div className="bz-x-item">
                  <dt>续费次数</dt>
                  <dd>{record.renewalCount == null ? '暂未获取' : record.renewalCount > 0 ? `${record.renewalCount} 次` : '首次续费'}</dd>
                </div>
              </dl>
              <dl className="bz-x-follow">
                <dt>跟进记录</dt>
                <dd className={record.notes ? undefined : 'bz-x-follow-empty'}>
                  {record.notes || '暂无跟进记录（续费/标记不续费后会体现在流水与状态里）'}
                </dd>
              </dl>
            </>
          )), columnWidth: 44 }}
          tableLayout="fixed"
          rowClassName={(record: any) => bzRowClass(bz, record)}
          locale={{
            emptyText: (
              <div className="bz-empty">
                <UserRoundCheck size={28} />
                <p>暂无待续费学员</p>
                <span>剩余课时充足或已全部跟进；阈值口径为在读且剩余课时 ≤ 10 节。</span>
              </div>
            ),
          }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 位学员需要续费`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            },
          }}
          scroll={{ x: 620 }}
        />
      </div>
              </>
            ),
          },
          {
            key: 'no_renewal',
            label: (
              <span>
                <CloseCircleOutlined size={16} /> 不续费学员 ({noRenewalPagination.total})
              </span>
            ),
            children: (
              <>
                <p className="cashflow-followup-note">以下学员已标记为不续费，回访责任可在“沉默学员交接”中安排；有意向后可恢复跟进。</p>
                <div className="bz-table-wrap">
                  <Table
                    columns={noRenewalColumns}
                    dataSource={noRenewalStudents}
                    loading={noRenewalLoading}
                    rowKey="id"
                    expandable={{ ...bzExpandable<any>(bz, (record) => (
                      <>
                        <dl className="bz-x-grid">
                          <div className="bz-x-item">
                            <dt>联系电话</dt>
                            <dd>{record.parentPhone || record.phone || '-'}</dd>
                          </div>
                          <div className="bz-x-item">
                            <dt>负责老师</dt>
                            <dd>{responsibleTeachers(record)}</dd>
                          </div>
                          <div className="bz-x-item">
                            <dt>回访老师</dt>
                            <dd>{record.recallTeacher?.name || '待安排回访老师'}</dd>
                          </div>
                          <div className="bz-x-item">
                            <dt>标记时间</dt>
                            <dd>
                              {(record.noRenewalDate || record.updatedAt)
                                ? dayjs(record.noRenewalDate || record.updatedAt).format('YYYY-MM-DD')
                                : '-'}
                            </dd>
                          </div>
                        </dl>
                        <dl className="bz-x-follow">
                          <dt>原因 / 备注</dt>
                          <dd className={record.status === 'graduated' || record.noRenewalReason ? undefined : 'bz-x-follow-empty'}>
                            {record.status === 'graduated'
                              ? '学员已毕业'
                              : record.noRenewalReason || '暂无备注'}
                          </dd>
                        </dl>
                      </>
                    )), columnWidth: 44 }}
                    tableLayout="fixed"
                    rowClassName={(record: any) => bzRowClass(bz, record)}
                    locale={{
                      emptyText: (
                        <div className="bz-empty">
                          <UserRoundCheck size={28} />
                          <p>暂无不续费学员</p>
                          <span>被标记的学员会出现在这里，可随时恢复为待续费。</span>
                        </div>
                      ),
                    }}
                    pagination={{
                      ...noRenewalPagination,
                      showSizeChanger: true,
                      showTotal: (total) => `共 ${total} 位学员`,
                      onChange: (page, pageSize) => {
                        setNoRenewalPagination({ ...noRenewalPagination, current: page, pageSize });
                      },
                    }}
                    scroll={{ x: 620 }}
                  />
                </div>
              </>
            ),
          },
        ]}
      />

      {/* 续费弹窗 */}
      <Modal
        title={`学员续费 - ${renewingStudent?.name || ''}`}
        open={renewalModalVisible}
        onCancel={() => { if (!renewalSubmitLock.current) setRenewalModalVisible(false); }}
        onOk={() => pendingRenewal ? void handleRenewalSubmit({}) : renewalForm.submit()}
        okText={pendingRenewal ? '重试并确认' : '确认续费'}
        okButtonProps={{ disabled: !!pendingRenewalError || renewalReviewId === pendingRenewal?.requestId }}
        confirmLoading={renewalSubmitting}
        closable={!renewalSubmitting}
        maskClosable={!renewalSubmitting}
        width={500}
      >
        {pendingRenewalError && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={pendingRenewalError} />}
        {pendingRenewal && renewalReviewId === pendingRenewal.requestId && <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="原成单已变更，请先核对成单及学员课时"
          action={<Space><Button onClick={() => navigate('/cashflow/order-info')}>查看成单</Button><Button onClick={handleAcknowledgeRenewal}>已核对，结束本次续费</Button></Space>} />}
        {pendingRenewal ? <Alert type="warning" showIcon message="有一笔续费等待确认"
          description={`${pendingRenewal.studentName} · ${pendingRenewal.totalLessons} 节 · ¥${pendingRenewal.price ?? '未填写'} · ${pendingRenewal.conversionDate}。点击“重试并确认”会核对同一笔操作，不会再次加课。`} /> :
        <Form form={renewalForm} onFinish={handleRenewalSubmit} layout="vertical" disabled={renewalSubmitting || !!pendingRenewalError}>
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--card2)', borderRadius: 4 }}>
            <div>学员：<strong>{renewingStudent?.name}</strong></div>
            <div>当前剩余课时：<Tag color="orange">{renewingStudent?.remainingLessons || 0} 节</Tag></div>
            {renewingStudent?.lastRenewalPrice != null && (
              <div>上次续费：<span style={{ color: 'var(--acc-strong)' }}>{renewingStudent.lastRenewalPrice}/{renewingStudent.lastRenewalLessons}</span></div>
            )}
          </div>

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="totalLessons" label="续费课时数" required rules={[purchaseLessonsRule]}>
              <Input inputMode="numeric" placeholder="课时数" />
            </Form.Item>
            <Form.Item name="price" label="续费金额" extra="填写本次续费整批金额，0 元请填 0。" required rules={[purchasePriceRule]}>
              <Input inputMode="decimal" prefix="¥" placeholder="金额" />
            </Form.Item>
          </div>

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="paymentMethod" label="支付方式">
              <Select placeholder="请选择" allowClear>
                <Option value="cash">现金</Option>
                <Option value="wechat">微信</Option>
                <Option value="alipay">支付宝</Option>
                <Option value="card">银行卡</Option>
                <Option value="transfer">转账</Option>
              </Select>
            </Form.Item>
            <Form.Item name="paymentStatus" label="支付状态" rules={[{ required: true }]}>
              <Select placeholder="请选择">
                <Option value="paid">已付款</Option>
                <Option value="pending">待付款</Option>
                <Option value="partial">部分付款</Option>
              </Select>
            </Form.Item>
          </div>

          <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <Form.Item name="classId" label="续费班级">
              <Select placeholder="请选择班级（不填则保持原班级）" allowClear showSearch optionFilterProp="children">
                {classList.map((cls) => (
                  <Option key={cls.id} value={cls.id}>
                    {cls.name} {cls.teacher?.name && `(${cls.teacher.name})`}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="salesId" label="本次续费业绩归属" hidden={!canChooseSales}>
              <Select placeholder="请选择（不填则算班级老师）" allowClear showSearch optionFilterProp="children">
                {staffList.map((staff) => (
                  <Option key={staff.id} value={staff.id}>{staff.name}</Option>
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
            <div>• 选择业绩归属人员 → 本次续费业绩计入该人员</div>
            <div>• 填写班级但不指定归属 → 业绩算该班级老师</div>
            <div>• 都不填 → 业绩算原班级老师；不改变班级负责老师及学员回访安排</div>
          </div>

          <Form.Item name="conversionDate" label="续费日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>}
      </Modal>

      {/* 不续费弹窗 */}
      <Modal
        title={`标记不续费 - ${renewingStudent?.name || ''}`}
        open={noRenewalModalVisible}
        confirmLoading={noRenewalSubmitting}
        onCancel={() => setNoRenewalModalVisible(false)}
        onOk={() => noRenewalForm.submit()}
        width={400}
      >
        <Form form={noRenewalForm} onFinish={submitNoRenewalForm} layout="vertical">
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--bad-bg)', borderRadius: 4, border: '1px solid var(--bad-line)' }}>
            <div>学员：<strong>{renewingStudent?.name}</strong></div>
            <div>剩余课时：<Tag color="orange">{renewingStudent?.remainingLessons || 0} 节</Tag></div>
          </div>

          <Form.Item
            name="reason"
            label="不续费原因"
            rules={[{ required: true, message: '请选择或填写原因' }]}
          >
            <Select placeholder="请选择原因" allowClear>
              <Option value="价格原因">价格原因</Option>
              <Option value="时间冲突">时间冲突</Option>
              <Option value="搬家/距离远">搬家/距离远</Option>
              <Option value="孩子不想学">孩子不想学</Option>
              <Option value="转其他机构">转其他机构</Option>
              <Option value="课程已学完">课程已学完</Option>
              <Option value="其他原因">其他原因</Option>
            </Select>
          </Form.Item>

          <Form.Item name="remark" label="补充说明">
            <Input.TextArea rows={2} placeholder="可补充详细原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RenewalStudents;
