import { useOverlaySubmit, Modal, Drawer } from '../components/overlays';
import { useState, useEffect, useRef } from 'react';
import { Table, Button, Input, Space, Form, message, Tag, Select, DatePicker, InputNumber, Alert, Checkbox, Radio } from 'antd';
import { EditOutlined, SwapOutlined, SearchOutlined, ReloadOutlined, MinusCircleOutlined, PlusCircleOutlined, DownloadOutlined, UserAddOutlined, StopOutlined, RollbackOutlined, ImportOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';
import api from '../services/api';
import { availableLessons, lessonBalanceText, type LessonSource } from '../utils/lessonBalance';
import { useDeductionContext } from '../hooks/useDeductionContext';
import { isValidPhone, normalizePhone, isValidContactPhone } from '../utils/phone';
import { lessonAddStorageKey, readPendingLessonAdd, savePendingLessonAdd, type PendingLessonAdd } from '../utils/lessonAddRequest';
import { activityDeductStorageKey, readPendingActivityDeduct, savePendingActivityDeduct, type PendingActivityDeduct } from '../utils/activityDeductRequest';
import dayjs from 'dayjs';
import ClassEnrollmentModal, { loadEnrollmentPages } from '../components/ClassEnrollmentModal';
import ArchiveStudentAction from '../components/ArchiveStudentAction';
import StudentOrderTotal from '../components/StudentOrderTotal';
import StudentLessonPricing from '../components/StudentLessonPricing';
import RefundRecords from './RefundRecords';
import { validPrice } from '../utils/lessonPricing';
import { Banknote } from 'lucide-react';
const EXPORT_COLLAPSED = true; // 步骤2 导出收拢：普通经营列表默认关闭导出入口（记录见 EXPORT_MATRIX.md）

const { Search } = Input;
const { RangePicker } = DatePicker;
const ageFromBirthday = (value: string) => Math.max(0, dayjs().diff(dayjs(value), 'year'));
// 2026-11-08 拍板：登记年龄随时间自动累加（按整年推算，不精确到生日）；有出生日期时仍优先按生日计算。
const estimatedAge = (record: any) => {
  if (record.birthDate) return ageFromBirthday(record.birthDate);
  if (record.recordedAge === null || record.recordedAge === undefined) return null;
  const since = record.recordedAgeAt || record.createdAt;
  const years = since ? dayjs().diff(dayjs(since), 'year') : 0;
  return record.recordedAge + Math.max(0, years);
};
const ageTooltip = (record: any) => {
  if (record.birthDate) return `按出生日期 ${dayjs(record.birthDate).format('YYYY-MM-DD')} 计算`;
  const at = record.recordedAgeAt ? `，登记于 ${dayjs(record.recordedAgeAt).format('YYYY-MM-DD')}` : '';
  return `登记时 ${record.recordedAge} 岁${at}，展示时按时间自动累加`;
};
// 2026-11-08：成单入账流水尾部的成单编号（UUID）仅系统追溯用（赠课/成单口径靠前缀识别），界面只显示"续费入账/新签入账"
const prettyLessonNote = (note?: string | null) => (note || '').replace(/：[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '');

const Students = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitStudentForm, studentFormSubmitting] = useOverlaySubmit((values: any) => handleSubmit(values));
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [studentFormDirty, setStudentFormDirty] = useState(false);
  const [form] = Form.useForm();
  const formBirthDate = Form.useWatch('birthDate', form);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [enrollmentStudentId, setEnrollmentStudentId] = useState<string | undefined>();
  const [classesList, setClassesList] = useState<any[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [deductLessonModalVisible, setDeductLessonModalVisible] = useState(false);
  const [deductSubmitting, setDeductSubmitting] = useState(false);
  const deductSubmitLock = useRef(false);
  const [pendingActivityDeduct, setPendingActivityDeduct] = useState<PendingActivityDeduct | null>(null);
  const [deductLessonForm] = Form.useForm();
  // 2026-11-08（⑫）：划课模式——场次签到（选班级/场次）或活动划课（不选班级时间，直接扣+必填备注）
  const deductMode = Form.useWatch('deductMode', deductLessonForm);
  const [deductLessonStudent, setDeductLessonStudent] = useState<any>(null);
  const openDeductReq = useRef(0);
  const chosenSchedule = Form.useWatch('scheduleId', deductLessonForm);
  const lessonSource: LessonSource = Form.useWatch('lessonSource', deductLessonForm) || 'paid';
  const context = useDeductionContext(deductLessonModalVisible ? deductLessonStudent?.id : undefined,
    deductMode === 'schedule' ? chosenSchedule : undefined, deductLessonForm);
  /** 划课：该班该日的真实可选场次（后端 startDate/endDate 当日区间；已过滤取消场次） */
  const [deductScheduleOptions, setDeductScheduleOptions] = useState<any[]>([]);
  const [deductSchedulesLoading, setDeductSchedulesLoading] = useState(false);
  const [addLessonModalVisible, setAddLessonModalVisible] = useState(false);
  const [addLessonForm] = Form.useForm();
  const [addLessonStudent, setAddLessonStudent] = useState<any>(null);
  const [addLessonSubmitting, setAddLessonSubmitting] = useState(false);
  const addLessonSubmitLock = useRef(false);
  const [pendingLessonAdd, setPendingLessonAdd] = useState<PendingLessonAdd | null>(null);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [lessonLogs, setLessonLogs] = useState<any[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logPagination, setLogPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [logDateRange, setLogDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [logFilters, setLogFilters] = useState<{ type?: string; studentName?: string }>({});
  const [logNameInput, setLogNameInput] = useState('');
  const logRequestId = useRef(0);
  const studentRequestId = useRef(0);
  const [showUnscheduledOnly, setShowUnscheduledOnly] = useState(false);
  const { user } = useAuthStore();

  // 创建家长账号选项（新增学员时）
  const [createParentAccount, setCreateParentAccount] = useState(false);

  // 为已有学员创建家长账号相关状态
  const [parentAccountModalVisible, setParentAccountModalVisible] = useState(false);
  const [submitParentForm, parentFormSubmitting] = useOverlaySubmit((values: any) => handleParentAccountSubmit(values));
  const [parentAccountForm] = Form.useForm();
  const [parentAccountStudent, setParentAccountStudent] = useState<any>(null);

  // 从成单信息导入相关状态
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [conversionsList, setConversionsList] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState(false);
  const [conversionPagination, setConversionPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [selectedConversion, setSelectedConversion] = useState<any>(null);

  // 学员详情查询相关状态
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailStudent, setDetailStudent] = useState<any>(null);

  // 销售列表（用于表单选择）
  const [salesList, setSalesList] = useState<any[]>([]);

  // 权限检查
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageStudents = normalizedRole === 'admin' || normalizedRole === 'manager';
  const canRefund = canManageStudents || normalizedRole === 'coach';
  const token = useAuthStore(state => state.token);
  const refundScope = JSON.stringify([user?.id,user?.organizationId,user?.campusId,user?.role,user?.managementLevel,token]);
  const [refundTarget, setRefundTarget] = useState<{ student: any; scope: string } | null>(null);
  useEffect(() => { setRefundTarget(null); }, [refundScope]);
  const canRefundStudent = (student: any) => canRefund && student.status === 'active' &&
    (canManageStudents || student.enrollments?.some((e: any) => e.status === 'active' && e.class?.teacherId === user?.id));
  const pricingScope = JSON.stringify([user?.organizationId, user?.campusId, user?.id, user?.role, user?.isPlatformAdmin]);
  const canPriceLessons = canManageStudents && !!user?.organizationId && !!user.campusId && !user.isPlatformAdmin;
  const [pricingTarget, setPricingTarget] = useState<{ id: string; name: string; scope: string } | null>(null);
  useEffect(() => { setPricingTarget(null); }, [pricingScope]);

  // 权限检查：允许 admin、manager、sales、teacher、coach 角色访问。
  // 2026-11-08 代码检查修复：早退 guard 原写在 Hook 之前（rules-of-hooks 违规，
  // 用户登出/角色变化时会因 Hook 数量改变而崩溃）——改为先算 allowed，
  // 数据请求按 allowed 跳过，JSX 渲染前再返回权限提示。
  const allowedRoles = ['admin', 'manager', 'sales', 'teacher', 'coach'];
  const allowed = !!user && allowedRoles.includes(user.role);

  useEffect(() => {
    if (allowed) fetchStudents();
  }, [pagination.current, pagination.pageSize, showUnscheduledOnly, allowed]);

  const fetchStudents = async (keyword?: string, unscheduled = showUnscheduledOnly, page = pagination.current) => {
    const requestId = ++studentRequestId.current;
    setLoading(true);
    try {
      const params: any = {
        page,
        pageSize: pagination.pageSize,
        // 2026-11-08 拍板：不续费学员移至续费管理维护，本页不再保留（后端原生支持该参数）
        excludeNoRenewal: true,
      };

      // 如果有搜索关键词
      if (keyword !== undefined ? keyword : searchKeyword) {
        params.search = keyword !== undefined ? keyword : searchKeyword;
      }

      // 如果筛选未排课学员
      if (unscheduled) {
        params.unscheduledOnly = true;
      }

      // 通过后端 API 获取学员列表（绕过 RLS）
      const response = await api.get('/students', { params });

      if (requestId !== studentRequestId.current) return;
      setStudents(response.data || []);
      if (response.pagination) {
        const total = response.pagination.total || 0;
        setPagination(prev => ({ ...prev, total }));
      }
    } catch (error: any) {
      if (requestId === studentRequestId.current) {
        console.error('获取学员列表失败:', error);
        message.error(error.message || '获取学员列表失败');
      }
    } finally {
      if (requestId === studentRequestId.current) setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchKeyword(value);
    setPagination({ ...pagination, current: 1 });
    fetchStudents(value, showUnscheduledOnly, 1);
  };

  const handleResetSearch = () => {
    setSearchKeyword('');
    setShowUnscheduledOnly(false);
    setPagination({ ...pagination, current: 1 });
    fetchStudents('', false, 1);
  };

  const handleToggleUnscheduled = () => {
    setShowUnscheduledOnly(!showUnscheduledOnly);
    setPagination({ ...pagination, current: 1 });
  };

  // 新签确认后自动建档；未定班学员通过班级调整安排，不再提供重复导入入口。
  // 历史导入表单与原有记录暂留兼容，关闭公开按钮不删除业务数据。

  // 获取销售列表
  const fetchSalesList = async () => {
    try {
      const response = await api.get('/users', {
        params: { role: 'sales,staff,manager,admin,teacher,coach', pageSize: 1000 }
      });
      setSalesList(response.data || []);
    } catch (error: any) {
      console.error('获取销售列表失败:', error);
    }
  };

  // 注意：新增学员功能在此页面，但真正的"新增学员"统计应从成单信息表中获取
  // 成单信息表的记录会自动创建学员，并标记 courseType != '续费'

  // 2026-10-26：标记不续费（周报「不续费/续费率」数据源）。
  // 2026-11-08 拍板：标记后学员移入续费管理·不续费名单，本页列表不再保留；撤销/恢复在续费管理操作。
  const handleToggleNoRenewal = (record: any) => {
    Modal.confirm({
      title: `确认标记「${record.name}」为不续费？`,
      content: '标记后学员将移入「续费管理 → 不续费学员」名单，本页不再显示；如需恢复请到续费管理操作。',
      okText: '确认标记',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.put(`/students/${record.id}`, {
            renewalStatus: 'no_renewal',
            noRenewalDate: new Date().toISOString(),
          });
          message.success('已标记为不续费，名单已移入续费管理');
          fetchStudents();
        } catch (error: any) {
          message.error(error.message || '操作失败');
        }
      },
    });
  };

  const handleEdit = (record: any) => {
    setEditingStudent(record);
    setStudentFormDirty(false);
    form.setFieldsValue({
      ...record,
      classId: undefined,
      // 将出生日期转换为年龄
      age: record.birthDate ? ageFromBirthday(record.birthDate) : record.recordedAge ?? undefined,
      birthDate: record.birthDate ? dayjs(record.birthDate) : null,
      cardOpenDate: record.cardOpenDate ? dayjs(record.cardOpenDate) : null,
      lastClassDate: record.lastClassDate ? dayjs(record.lastClassDate) : null,
      salesId: record.salesId || undefined,
    });
    setCreateParentAccount(false); // 编辑时不创建家长账号
    fetchClasses(); // 获取班级列表用于选择
    fetchSalesList(); // 获取销售列表
    setModalVisible(true);
  };

  // 2026-11-08 拍板：移除「删除空档案」功能入口（单个+批量）——
  // 建档错误可直接编辑修正；不续费/退费各有专门按钮，空档案不再需要删除。
  // 后端 DELETE /students/:id 保留但页面不再提供入口。

  const handleSubmit = async (values: any) => {
    const owner = useAuthStore.getState().token;
    const isCurrent = () => owner === useAuthStore.getState().token;
    try {
      const { user } = useAuthStore.getState();
      const { classId, age, birthDate, createParent, parentName, phone, cardOpenDate, totalPayment, salesId, lastClassDate, conversionPrice, ...restData } = values;
      const orderLessons = selectedConversion?.totalLessons ?? 0;
      const orderPrice = selectedConversion?.price == null ? conversionPrice : Number(selectedConversion.price);
      if (!editingStudent && selectedConversion && orderLessons > 0 && !validPrice(orderPrice)) {
        form.setFields([{ name: 'conversionPrice', errors: ['请填写原成单的整批成交金额，0 元请填 0，最多两位小数'] }]);
        return;
      }
      // 成单维度的字段不随学员档案提交（此前靠解构剔除，改为显式删除，避免 lint 未用变量报错）
      delete restData.totalLessonsPurchased;
      delete restData.courseType;

      // 成单年龄是登记时的年龄，并不代表真实生日。
      const ageValue = age === undefined || age === null ? null : Number(age);
      const hasBirthDate = Boolean(birthDate);
      const recordedAge = hasBirthDate
        ? (selectedConversion?.age ?? editingStudent?.recordedAge ?? null)
        : ageValue;
      const conversionDate = selectedConversion?.conversionDate;
      const validConversionDate = typeof conversionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(conversionDate) && dayjs(conversionDate).isValid() && dayjs(conversionDate).format('YYYY-MM-DD') === conversionDate ? conversionDate : null;
      const sourceDate = selectedConversion && recordedAge === selectedConversion.age
        ? validConversionDate
        : editingStudent && recordedAge === editingStudent.recordedAge
          ? (editingStudent.recordedAgeAt || null)
          : recordedAge === null ? null : dayjs().format('YYYY-MM-DD');

      const studentData = {
        ...restData,
        parentName,
        phone: phone || restData.contact, // 兼容成单信息导入
        birthDate: birthDate ? birthDate.format('YYYY-MM-DD') : null,
        recordedAge,
        recordedAgeAt: recordedAge === null ? null : sourceDate,
        // 只有原成单能带入购买课时。独立建档从零开始，编辑档案不写余额。
        remainingLessons: orderLessons,
        cardOpenDate: cardOpenDate ? cardOpenDate.format('YYYY-MM-DD') : null,
        purchasedLessons: orderLessons,
        consumedLessons: 0,
        totalPayment: totalPayment || 0,
        salesId: salesId || null,
        lastClassDate: lastClassDate ? lastClassDate.format('YYYY-MM-DD') : null,
      };

      if (editingStudent) {
        // 通过后端 API 更新学员信息（只传有值的字段，避免覆盖剩余课时）
        // 2026-11-08 用户拍板：编辑表单已撤课时与缴费块——开卡时间/销售/最后上课日期不再随编辑提交
        // （销售归属随成单信息表：建档时带入；最后上课在查询抽屉与划课流水体现），防止空值覆盖存量；
        // 状态不随编辑提交——流转全部走专门入口（移除转流失/退费记录/归档）。
        const updateData: any = {
          name: studentData.name,
          gender: studentData.gender,
          phone: studentData.phone,
          parentName: studentData.parentName,
          parentPhone: studentData.parentPhone,
          birthDate: studentData.birthDate,
          recordedAge: studentData.recordedAge,
          recordedAgeAt: studentData.recordedAgeAt,
          address: studentData.address,
          campusId: studentData.campusId,
        };
        await api.put(`/students/${editingStudent.id}`, updateData);
        if (!isCurrent()) return;
        message.success('更新成功');
      } else {
        // 通过后端 API 创建学员
        const newStudentData = {
          ...studentData, classId, conversionId:selectedConversion?.id,
          ...(selectedConversion ? { conversionPrice: orderPrice ?? null, expectedConversionPrice: selectedConversion.price ?? null } : {}),
          organizationId: user?.organizationId,
          status: 'active',
        };
        const response = await api.post('/students', newStudentData);
        if (!isCurrent()) return;
        const newStudent = response.data;

        if(selectedConversion)setSelectedConversion(null);
        // 如果选择了创建家长账号，同时创建家长账号
        if (createParent && parentName && studentData.parentPhone) {
          try {
            const response = await api.post('/auth/create-parent', {
              name: parentName,
              phone: normalizePhone(studentData.parentPhone),
              studentId: newStudent.id,
            });
            if (!isCurrent()) return;
            showParentAccountResult(response.data, studentData.parentPhone);
          } catch (parentError: any) {
            if (!isCurrent()) return;
            console.error('创建家长账号失败:', parentError);
            message.warning('学员创建成功，但家长账号创建失败：' + (parentError.response?.data?.error?.message || parentError.message));
          }
        } else {
          message.success('创建成功');
        }
      }
      setModalVisible(false);
      fetchStudents();
    } catch (error: any) {
      if (!isCurrent()) return;
      console.error('操作失败:', error);
      message.error(error.response?.data?.error?.message || error.message || '操作失败');
    }
  };

  const fetchClasses = async () => {
    try {
      setClassesList(await loadEnrollmentPages('/classes'));
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || error.message || '获取班级列表失败');
    }
  };

  const handleTransfer = (studentId?: string) => {
    setEnrollmentStudentId(studentId);
    setTransferModalVisible(true);
  };

  useEffect(() => {
    const refresh = () => { void fetchStudents(); };
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [pagination.current, pagination.pageSize, searchKeyword, showUnscheduledOnly]);

  const handleAdjustFromEditor = () => {
    const proceed = () => { setModalVisible(false); handleTransfer(editingStudent.id); };
    if (studentFormDirty) {
      Modal.confirm({ title: '前往班级调整？', content: '未保存的学员资料修改将丢失。', okText: '放弃修改并前往', cancelText: '继续编辑', onOk: proceed });
    } else proceed();
  };

  const handleEnrollmentChanged = () => {
    if (detailModalVisible && detailStudent?.id) {
      void loadDetailExtra(detailStudent.id);
      void api.get(`/students/${detailStudent.id}`).then(response => setDetailStudent(response.data)).catch(() => message.error('学员详情刷新失败，请重新打开详情'));
    }
  };

  const handleDeductLessons = async (student: any) => {
    if (!user || deductSubmitLock.current) return;
    const request = ++openDeductReq.current;
    // 余额 0 不再拦截入口：更正请假/缺勤可返还课时，出勤/迟到的余额校验由服务端按实际差额判定
    // 获取学员的班级信息
    try {
      // 通过后端 API 获取学员详情（绕过 RLS）
      const response = await api.get(`/students/${student.id}`);
      if (openDeductReq.current !== request) return;
      const studentDetail = response.data;
      const pending = readPendingActivityDeduct(activityDeductStorageKey(user.organizationId, user.id, student.id), student.id);
      setPendingActivityDeduct(pending);
      const activeEnrollments = studentDetail.enrollments?.filter((e: any) => e.status === 'active') || [];

      // 2026-11-08（⑫）：未报名班级也可活动划课，不再拦截；场次签到模式下班级为空自然不可用
      setDeductLessonStudent({ ...student, ...studentDetail, enrollments: activeEnrollments });
    deductLessonForm.resetFields();
      deductLessonForm.setFieldsValue({
        deductMode: pending ? 'activity' : 'schedule',
        lessonSource: pending?.lessonSource ?? 'paid',
        attendanceStatus: 'present',
        date: dayjs(),
        classId: activeEnrollments[0]?.classId,
        activityLessons: pending?.lessons ?? 1,
        activityNotes: pending?.notes,
      });
    setDeductLessonModalVisible(true);
      // 默认加载首个班级当日的真实场次
      if (activeEnrollments[0]?.classId) {
        void loadSchedulesForDeduct(activeEnrollments[0].classId, dayjs().format('YYYY-MM-DD'));
      }
    } catch (error: any) {
      if (openDeductReq.current !== request) return;
      console.error('获取学员信息失败:', error);
      message.error(error.message || '获取学员信息失败');
    }
  };

  const handleLessonSubmit = async (values: any) => {
    if (!user || !deductLessonStudent || deductSubmitLock.current) return;
    const submittedSource = values.lessonSource;
    if (submittedSource !== 'paid' && submittedSource !== 'gift') {
      message.warning('请选择扣课来源');
      return;
    }
    deductSubmitLock.current = true;
    setDeductSubmitting(true);
    try {
      // 2026-11-08（⑫）：活动划课——不选班级/场次，直接扣课时，活动说明必填（进增减课台账）
      if (values.deductMode === 'activity') {
        let storageKey: string | undefined;
        try {
          storageKey = activityDeductStorageKey(user.organizationId, user.id, deductLessonStudent.id);
          const pending = readPendingActivityDeduct(storageKey, deductLessonStudent.id);
          const lessons = values.activityLessons;
          const notes = (values.activityNotes || '').trim();
          if (pending && (pending.lessons !== lessons || pending.notes !== notes || pending.lessonSource !== submittedSource)) {
            deductLessonForm.setFieldsValue({ activityLessons: pending.lessons, activityNotes: pending.notes, lessonSource: pending.lessonSource });
            setPendingActivityDeduct(pending);
            message.warning('上次活动划课结果待确认，已恢复原参数；请先重试确认，再发起新操作');
            return;
          }
          if (!pending && (!context.balance || availableLessons(context.balance, submittedSource) < lessons)) {
            message.warning(!context.balance ? '请先读取学员分项余额' : submittedSource === 'gift' ? '赠课余额不足，请调整课时或选择付费课' : '付费课余额不足，请调整课时或选择赠课');
            return;
          }
          const request: PendingActivityDeduct = pending || {
            requestId: crypto.randomUUID(), studentId: deductLessonStudent.id, lessons, notes, lessonSource: submittedSource,
          };
          // Persist before sending: closing/reloading after a lost response must replay this operation.
          savePendingActivityDeduct(storageKey, request);
          setPendingActivityDeduct(request);
          const response = await api.post('/lesson-logs/activity-deduct', request);
          sessionStorage.removeItem(storageKey);
          setPendingActivityDeduct(null);
          message.success(`${deductLessonStudent.name} 活动划课已确认：扣 ${request.lessons} 节，本次操作后剩余 ${response.data?.remainingLessons} 节；列表将刷新当前余额`);
          setDeductLessonModalVisible(false);
          setDeductLessonStudent(null);
          fetchStudents();
        } catch (error: any) {
          const code = error.response?.data?.error?.code;
          if (storageKey && ((error.response?.status === 400 && code === 'INVALID_PARAMS') ||
              ['INSUFFICIENT_GIFT_LESSONS', 'INSUFFICIENT_PAID_LESSONS', 'INSUFFICIENT_LESSONS'].includes(code))) {
            sessionStorage.removeItem(storageKey);
            setPendingActivityDeduct(null);
          }
          message.error(error?.response?.data?.error?.message || error.message || '活动划课结果待确认，请重试原操作');
        }
        return;
      }

      try {
        const { scheduleId, attendanceStatus, notes } = values;
        if (!context.attendance) { message.warning('请先读取该学员本场次的原签到'); return; }
        const deducting = ['present', 'late', 'makeUp'].includes(attendanceStatus);
        const originalSource = context.attendance.source;
        const alreadyDeducted = ['present', 'late', 'makeUp'].includes(context.attendance.status || '');
        if (deducting && !(alreadyDeducted && originalSource === submittedSource) &&
            (!context.balance || availableLessons(context.balance, submittedSource) < 1)) {
          message.warning(!context.balance ? '请先读取学员余额' : submittedSource === 'gift' ? '赠课余额不足，请调整扣课来源' : '付费课余额不足，请调整扣课来源');
          return;
        }
        // 统一批量签到接口（/lesson-logs/deduct 内部走 submitScheduleAttendance）：
        // 场次签到每次 1 课时；更正为请假/缺勤时自动返还，重复提交不重复扣课（服务端幂等）
        const response = await api.post('/lesson-logs/deduct', {
          studentId: deductLessonStudent.id,
          scheduleId,
          attendanceStatus,
          notes: notes || '场次签到',
          lessonSource: deducting ? submittedSource : originalSource,
        });
        const result = response.data?.results?.[0];
        if (!result) throw new Error('签到接口未返回该学员结果');
        const statusText: Record<string, string> = { present: '出勤', late: '迟到', leave: '请假', absent: '缺勤' };
        if (result.deducted > 0) {
          message.success(`${deductLessonStudent.name} ${statusText[result.status] ?? ''}签到成功：扣 ${result.deducted} 节，剩余 ${result.remainingLessons} 节`);
        } else if (result.deducted < 0) {
          message.success(`${deductLessonStudent.name} 更正为${statusText[result.status] ?? ''}：返还 ${-result.deducted} 节，剩余 ${result.remainingLessons} 节`);
        } else if (deducting && alreadyDeducted && submittedSource !== originalSource) {
          message.success(`${deductLessonStudent.name} 原扣课已返还，改扣${submittedSource === 'gift' ? '赠课' : '付费课'} 1 节，总剩余 ${result.remainingLessons} 节`);
        } else {
          message.success(`${deductLessonStudent.name} 已记录${statusText[result.status] ?? ''}（不扣课时），剩余 ${result.remainingLessons} 节`);
        }
        setDeductLessonModalVisible(false);
        setDeductLessonStudent(null);
        fetchStudents();
      } catch (error: any) {
        // 失败保留填写内容，绝不显示成功
        console.error('划课失败:', error);
        message.error(error?.response?.data?.error?.message || error.message || '划课失败');
      }
    } finally {
      deductSubmitLock.current = false;
      setDeductSubmitting(false);
    }
  };

  /** 打开划课弹窗/变更班级或日期时：加载该班该日的真实场次（startDate/endDate 当日区间）。
   * 请求代际守卫：快速切换班级/日期时丢弃过期响应；失败不再伪装成“无排课”，给出重试。 */
  const deductSchedReqRef = useRef(0);
  const [deductSchedulesError, setDeductSchedulesError] = useState('');
  const loadSchedulesForDeduct = async (classId: string, dateStr: string) => {
    const req = ++deductSchedReqRef.current;
    setDeductScheduleOptions([]);
    setDeductSchedulesError('');
    deductLessonForm.setFieldValue('scheduleId', undefined);
    if (!classId || !dateStr) return;
    setDeductSchedulesLoading(true);
    try {
      const res: any = await api.get('/schedules', {
        params: { classId, startDate: dateStr, endDate: dateStr, page: 1, pageSize: 50 },
      });
      if (req !== deductSchedReqRef.current) return; // 已切换到其他班级/日期，丢弃过期结果
      const rows: any[] = Array.isArray(res?.data) ? res.data : [];
      // 只允许未取消的真实场次；教师名尽力展示
      setDeductScheduleOptions(rows.filter((s) => s.status !== 'cancelled'));
    } catch (error: any) {
      if (req !== deductSchedReqRef.current) return;
      setDeductSchedulesError(error?.response?.data?.error?.message || error.message || '场次查询失败');
    } finally {
      if (req === deductSchedReqRef.current) setDeductSchedulesLoading(false);
    }
  };

  const handleAddLessons = (student: any) => {
    if (addLessonSubmitLock.current) return;
    const currentUser = user;
    if (!currentUser?.organizationId || !currentUser.id) {
      message.error('登录状态已失效，请重新登录后增课');
      return;
    }
    try {
      const pending = readPendingLessonAdd(lessonAddStorageKey(currentUser.organizationId, currentUser.id, student.id), student.id);
      setAddLessonStudent(student);
      setPendingLessonAdd(pending);
      addLessonForm.resetFields();
      addLessonForm.setFieldsValue(pending || { lessons: 1 });
      setAddLessonModalVisible(true);
    } catch (error: any) {
      message.error(error.message || '无法读取待确认增课记录');
    }
  };

  const handleAddLessonSubmit = async (values: any) => {
    if (!addLessonStudent || addLessonSubmitLock.current) return;
    const currentUser = user;
    if (!currentUser?.organizationId || !currentUser.id) {
      message.error('登录状态已失效，请重新登录后增课');
      return;
    }
    addLessonSubmitLock.current = true;
    setAddLessonSubmitting(true);
    let storageKey: string | undefined;
    try {
      const addition = values.lessons;
      if (!Number.isSafeInteger(addition) || addition <= 0 || addition > 2147483647) {
        message.warning('请输入有效的正整数增课节数');
        return;
      }
      storageKey = lessonAddStorageKey(currentUser.organizationId, currentUser.id, addLessonStudent.id);
      const pending = readPendingLessonAdd(storageKey, addLessonStudent.id);
      const notes = (values.notes || '').trim() || '后台增课';
      if (pending && (pending.lessons !== addition || pending.notes !== notes)) {
        addLessonForm.setFieldsValue(pending);
        setPendingLessonAdd(pending);
        message.warning('上次增课结果待确认，已恢复原参数；请先重试确认，再发起新操作');
        return;
      }
      const request: PendingLessonAdd = pending || {
        requestId: crypto.randomUUID(),
        studentId: addLessonStudent.id,
        lessons: addition,
        notes,
      };
      // Persist before sending. Refresh/close/reopen must keep the same operation ID.
      savePendingLessonAdd(storageKey, request);
      setPendingLessonAdd(request);
      addLessonForm.setFieldsValue(request);
      const response = await api.post('/lesson-logs/add', request);
      const result = response.data;
      sessionStorage.removeItem(storageKey);
      setPendingLessonAdd(null);
      message.success(`${addLessonStudent.name} 增课 ${addition} 节已确认，操作后剩余 ${result.currentRemaining} 节`);
      setAddLessonModalVisible(false);
      setAddLessonStudent(null);
      fetchStudents();
    } catch (error: any) {
      // Only explicit validation rejection proves this attempt did not execute. Keep all
      // uncertain/network/5xx/auth/conflict results recoverable with the original key.
      const code = error.response?.data?.error?.code;
          if (storageKey && ((error.response?.status === 400 && code === 'INVALID_PARAMS') ||
              ['INSUFFICIENT_GIFT_LESSONS', 'INSUFFICIENT_PAID_LESSONS', 'INSUFFICIENT_LESSONS'].includes(code))) {
        sessionStorage.removeItem(storageKey);
        setPendingLessonAdd(null);
      }
      message.error(error.response?.data?.error?.message || error.message || '增课结果待确认，请重试原操作');
    } finally {
      addLessonSubmitLock.current = false;
      setAddLessonSubmitting(false);
    }
  };

  const fetchLessonLogs = async (
    page = 1,
    pageSize = logPagination.pageSize,
    filters = logFilters,
    dates = logDateRange,
  ) => {
    const requestId = ++logRequestId.current;
    setLogLoading(true);
    try {
      const response = await api.get('/lesson-logs', { params: {
        page, pageSize,
        source: 'manual', // 2026-11-08（⑪修订）：只看手动增减课（赠课增课+划课/更正），成单入账与退费扣返不出现
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.studentName?.trim() ? { studentName: filters.studentName.trim() } : {}),
        ...(dates?.[0] ? { startDate: dates[0].startOf('day').toISOString() } : {}),
        ...(dates?.[1] ? { endDate: dates[1].endOf('day').toISOString() } : {}),
      } });
      if (requestId !== logRequestId.current) return;
      setLessonLogs(response.data || []);
      setLogPagination({ current: page, pageSize, total: response.pagination?.total || 0 });
    } catch (error: any) {
      if (requestId === logRequestId.current) {
        setLessonLogs([]);
        setLogPagination(prev => ({ ...prev, total: 0 }));
        message.error(error.response?.data?.error?.message || '获取课时记录失败，请重试');
      }
    } finally {
      if (requestId === logRequestId.current) setLogLoading(false);
    }
  };

  const handleOpenLogModal = () => {
    setLogModalVisible(true);
    fetchLessonLogs(1, logPagination.pageSize);
  };

  const handleLogDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setLogDateRange(dates);
    fetchLessonLogs(1, logPagination.pageSize, logFilters, dates);
  };

  const handleLogTypeChange = (value: string) => {
    const filters = { ...logFilters, type: value || undefined };
    setLogFilters(filters);
    fetchLessonLogs(1, logPagination.pageSize, filters);
  };

  const handleLogNameSearch = (value: string) => {
    const filters = { ...logFilters, studentName: value.trim() || undefined };
    setLogNameInput(value);
    setLogFilters(filters);
    fetchLessonLogs(1, logPagination.pageSize, filters);
  };

  const handleExportLogs = async () => {
    try {
      message.loading('正在导出数据...', 0);

      // 构建日期范围
      const startDate = logDateRange?.[0]?.format('YYYY-MM-DD') || '2020-01-01';
      const endDate = logDateRange?.[1]?.format('YYYY-MM-DD') || dayjs().add(1, 'year').format('YYYY-MM-DD');

      // 1. 查询所有考勤记录（不分页）- 通过后端 API
      const allAttendanceRecords: any[] = [];
      if (!logFilters.type || logFilters.type === 'deduct') {
        try {
          const attendancesResponse = await api.get('/attendances', {
            params: { startDate, endDate, pageSize: 10000 }
          });
          const attendancesResult = attendancesResponse.data || [];
          attendancesResult.forEach((att: any) => {
            allAttendanceRecords.push({
              id: `att-${att.id}`,
              studentId: att.studentId,
              studentName: att.studentName || '-',
              type: 'deduct',
              lessons: 1,
              operatorName: att.operatorName || '系统',
              notes: `${att.className || '未知班级'} - ${att.status === 'present' ? '出勤' : '缺勤'}`,
              createdAt: att.attendanceDate || att.createdAt,
              className: att.className,
              scheduleTime: att.scheduleTime,
              status: att.status,
            });
          });
        } catch (err) {
          console.error('❌ 导出时查询考勤记录失败:', err);
        }
      }

      // 2. 查询所有课时变动记录（不分页，包括增课和手动划课）- 通过后端 API
      const allLessonLogRecords: any[] = [];
      if (!logFilters.type || logFilters.type === 'add' || logFilters.type === 'deduct') {
        try {
          const params: any = {
            page: 1,
            pageSize: 10000,
          };

          // 只有明确筛选时才传入type参数
          if (logFilters.type) {
            params.type = logFilters.type;
          }

          if (logDateRange?.[0]) {
            params.startDate = startDate;
          }
          if (logDateRange?.[1]) {
            params.endDate = endDate;
          }

          const lessonLogsResponse = await api.get('/lesson-logs', { params });
          allLessonLogRecords.push(...(lessonLogsResponse.data || []));
        } catch (err) {
          console.error('❌ 导出时查询课时变动记录失败:', err);
        }
      }

      // 3. 合并并排序
      const allRecords = [...allAttendanceRecords, ...allLessonLogRecords].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      if (allRecords.length === 0) {
        message.destroy();
        message.warning('没有数据可导出');
        return;
      }

      // 4. 构建 CSV 内容
      const headers = ['学员', '类型', '班级', '状态', '节数', '操作者', '备注', '时间'];
      const csvContent = [
        headers.join(','),
        ...allRecords.map(log => {
          const type = log.type === 'add' ? '增课' : '划课';
          const className = log.type === 'deduct' && log.className ? log.className : (log.notes || '-');
          const status = log.type === 'add' ? '-' : (log.status === 'present' ? '出勤' : '缺勤');
          const notes = log.type === 'deduct' ? '-' : (log.notes || '-');
          const time = log.createdAt ? dayjs(log.createdAt).format('YYYY-MM-DD HH:mm') : '-';

          return [
            log.studentName || '-',
            type,
            className,
            status,
            `${log.lessons || 0}节`,
            log.operatorName || '-',
            notes,
            time
          ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        })
      ].join('\n');

      // 5. 添加 BOM 以支持中文
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `划课记录_${dayjs().format('YYYY-MM-DD_HHmmss')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.destroy();
      message.success(`成功导出 ${allRecords.length} 条记录`);
    } catch (error: any) {
      console.error('导出失败:', error);
      message.destroy();
      message.error('导出失败: ' + (error.message || '未知错误'));
    }
  };

  const handleLogTableChange = (page: number, pageSize?: number) => {
    const size = pageSize || logPagination.pageSize;
    setLogPagination(prev => ({ ...prev, current: page, pageSize: size }));
    fetchLessonLogs(page, size);
  };

  // 从成单信息导入相关函数
  const handleOpenImportModal = async (page = 1, pageSize = conversionPagination.pageSize) => {
    setImportModalVisible(true);
    setImportLoading(true);
    setImportError(false);
    try {
      // 通过后端 API 获取未关联学员的成单信息（绕过 RLS）
      const response = await api.get('/conversions', {
        params: { unlinkedOnly: true, page, pageSize }
      });
      setConversionsList(response.data || []);
      setConversionPagination({ current: page, pageSize, total: response.pagination?.total || 0 });
    } catch (error: any) {
      setConversionsList([]);
      setImportError(true);
      console.error('获取成单信息失败:', error);
      message.error('获取成单信息失败');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConversion = async (conversion: any) => {
    try {
      setEditingStudent(null);
      setStudentFormDirty(false);
      setCreateParentAccount(false);
      form.resetFields();
      fetchClasses();
      fetchSalesList();
      setSelectedConversion(conversion);
      const rawContact = typeof conversion.contact === 'string' ? conversion.contact.trim() : '';
      const gender = ['M', 'male', '男'].includes(conversion.gender) ? 'M' : ['F', 'female', '女'].includes(conversion.gender) ? 'F' : undefined;
      // 将成单信息填充到表单
      form.setFieldsValue({
        name: conversion.studentName,
        age: conversion.age ?? undefined,
        gender,
        phone: rawContact,
        parentPhone: rawContact && isValidPhone(rawContact) ? normalizePhone(rawContact) : undefined,
        parentName: conversion.parentName,
        address: conversion.address,
        classId: conversion.classId || undefined,
        salesId: conversion.salesId || undefined,
        // 课时信息
        // totalLessonsPurchased 从 conversions 表计算，不存储在 students 表
        courseType: conversion.courseType,
      });
      // 关闭导入 Modal，打开新增学员 Modal
      setImportModalVisible(false);
      setModalVisible(true);
      message.success('成单信息已加载，请确认后提交');
    } catch (error: any) {
      console.error('导入成单信息失败:', error);
      message.error('导入成单信息失败');
    }
  };

  // 为已有学员创建家长账号
  const handleOpenParentAccountModal = (student: any) => {
    setParentAccountStudent(student);
    parentAccountForm.resetFields();
    // 预填家长电话
    parentAccountForm.setFieldsValue({
      parentPhone: student.parentPhone || '',
      name: student.parentName || '',
    });
    setParentAccountModalVisible(true);
  };

  // 查询学员详情
  const handleViewDetail = (student: any) => {
    setDetailStudent(student);
    setDetailModalVisible(true);
  };

  // 详情抽屉分区数据：报名/续费 + 出勤/课时流水（真实接口；切换学员即重置，失败可重试）
  const [detailEnrollments, setDetailEnrollments] = useState<any[]>([]);
  const [detailLogs, setDetailLogs] = useState<any[]>([]);
  const [detailLogsTotal, setDetailLogsTotal] = useState(0);
  const [detailLogsPage, setDetailLogsPage] = useState(1);
  const [detailExtraLoading, setDetailExtraLoading] = useState(false);
  const [detailExtraError, setDetailExtraError] = useState('');
  const detailReqRef = useRef('');

  const loadDetailExtra = async (studentId: string, page = 1) => {
    const req = `${studentId}:${page}`;
    detailReqRef.current = req;
    setDetailExtraLoading(true);
    setDetailExtraError('');
    try {
      const [detailRes, logsRes] = await Promise.all([
        api.get(`/students/${studentId}`),
        api.get('/lesson-logs', { params: { studentId, page, pageSize: 6 } }),
      ]);
      if (detailReqRef.current !== req) return; // 已切换学员或翻页，丢弃过期响应
      setDetailEnrollments(detailRes.data?.enrollments || []);
      setDetailLogs(logsRes.data || []);
      setDetailLogsTotal(Number(logsRes.pagination?.total ?? logsRes.data?.length ?? 0));
      setDetailLogsPage(page);
    } catch (error: any) {
      if (detailReqRef.current !== req) return;
      setDetailExtraError(error?.response?.data?.error?.message || error.message || '加载失败');
    } finally {
      if (detailReqRef.current === req) setDetailExtraLoading(false);
    }
  };

  useEffect(() => {
    if (detailStudent?.id && detailModalVisible) {
      setDetailEnrollments([]);
      setDetailLogs([]);
      setDetailLogsTotal(0);
      setDetailLogsPage(1);
      void loadDetailExtra(detailStudent.id);
    }
    if (!detailModalVisible) detailReqRef.current = 'closed';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailStudent?.id, detailModalVisible]);

  const showParentAccountResult = (account: any, phone: string) => {
    const reused = account?.accountReused === true;
    Modal.info({
      title: reused ? '家长账号已关联' : '家长账号已创建',
      content: (
        <div>
          <p>登录手机号：<strong>{account?.phone || phone}</strong></p>
          {reused ? <p>已关联已有家长账号，请使用原密码。</p> : account?.defaultPassword ? <>
            <p>初始密码：<strong style={{ overflowWrap: 'anywhere' }}>{account.defaultPassword}</strong></p>
            <p>初始密码默认与登录手机号相同，请提醒家长登录后尽快修改密码。</p>
          </> : <p>服务未返回初始密码，请联系机构管理员核实账号状态。</p>}
        </div>
      ),
      okText: '已记录',
      maskClosable: false,
    });
  };

  const handleParentAccountSubmit = async (values: any) => {
    const owner = useAuthStore.getState().token;
    const isCurrent = () => owner === useAuthStore.getState().token;
    try {
      const { name, parentPhone } = values;
      const phone = normalizePhone(parentPhone);
      const student = parentAccountStudent;

      // 2026-11-08 修复：后端要求账号手机号与学员档案的家长电话一致，否则报
      // 「请核对学员与家长电话」。此前空名单学员常未填家长电话，被建档顺序卡死；
      // 现在创建账号前先把手机号/姓名写回学员档案，再创建账号。
      const profilePhone = student?.parentPhone ? normalizePhone(student.parentPhone) : '';
      if (!student) return;
      if (phone !== profilePhone || (name && name !== student.parentName)) {
        await api.put(`/students/${student.id}`, {
          parentPhone: phone,
          ...(name ? { parentName: name } : {}),
        });
        if (!isCurrent()) return;
      }

      // 调用创建家长账号API
      const response = await api.post('/auth/create-parent', {
        name,
        phone,
        studentId: student.id,
      });
      if (!isCurrent()) return;
      showParentAccountResult(response.data, parentPhone);
      setParentAccountModalVisible(false);
      parentAccountForm.resetFields();
      setParentAccountStudent(null);
      fetchStudents(); // 家长信息可能已写回档案，刷新列表
    } catch (error: any) {
      if (!isCurrent()) return;
      console.error('创建家长账号失败:', error);
      const errorMsg = error.response?.data?.error?.message || error.message || '创建家长账号失败';
      message.error(errorMsg);
    }
  };

  // 2026-11-08（⑫）：家长账号一键恢复默认密码（=登录手机号），解决家长忘密码
  const handleResetParentPassword = () => {
    const phone = normalizePhone(parentAccountForm.getFieldValue('parentPhone') || '');
    if (!isValidPhone(phone)) {
      message.warning('请先填写有效的家长电话');
      return;
    }
    Modal.confirm({
      title: '恢复默认密码？',
      content: `将把手机号 ${phone} 的家长账号密码重置为默认（=登录手机号）。家长可立即用「手机号 + 手机号」登录，建议登录后尽快修改密码。`,
      okText: '恢复默认密码',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post('/auth/reset-parent-password', { phone });
          message.success('密码已恢复为默认（与登录手机号相同）');
        } catch (error: any) {
          message.error(error.response?.data?.error?.message || error.message || '重置失败，请重试');
        }
      },
    });
  };

  // 导出全部学员数据
  const handleExportAllStudents = async () => {
    try {
      message.loading('正在导出全部学员数据...', 0);

      // 通过后端 API 获取所有学员数据（绕过 RLS）；与页面同口径排除不续费学员
      const response = await api.get('/students', {
        params: { pageSize: 10000, excludeNoRenewal: true }
      });

      const allStudents = response.data || [];

      if (allStudents.length === 0) {
        message.destroy();
        message.warning('没有学员数据可导出');
        return;
      }

      // 构建 CSV 内容
      const headers = ['姓名', '性别', '电话', '家长电话', '剩余课时', '累计课时', '所属班级', '负责老师', '状态', '备注'];
      const csvContent = [
        headers.join(','),
        ...allStudents.map((student: any) => {
          // 获取活跃的班级和老师信息
          const activeEnrollments = student.enrollments?.filter((e: any) => e.status === 'active') || [];
          const classNames = activeEnrollments
            .map((e: any) => e.class?.name || e.class?.code || '')
            .filter((name: string) => name)
            .join('、') || '-';

          const teacherNames = activeEnrollments
            .map((e: any) => e.class?.teacher?.name || '')
            .filter((name: string) => name)
            .join('、') || '-';

          const gender = student.gender === 'M' ? '男' : student.gender === 'F' ? '女' : '-';
          const status = student.status === 'active' ? '活跃' : student.status === 'inactive' ? '非活跃' : student.status === 'graduated' ? '已毕业' : '-';

          return [
            `"${student.name || '-'}"`,
            gender,
            `"${student.phone || '-'}"`,
            `"${student.parentPhone || '-'}"`,
            student.remainingLessons || 0,
            student.totalLessonsPurchased || 0,
            `"${classNames}"`,
            `"${teacherNames}"`,
            status,
            `"${student.notes || '-'}"`,
          ].join(',');
        })
      ].join('\n');

      // 添加 BOM 以支持中文
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const dateStr = dayjs().format('YYYYMMDD_HHmmss');

      link.setAttribute('href', url);
      link.setAttribute('download', `全部学员_${dateStr}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      message.destroy();
      message.success(`成功导出 ${allStudents.length} 位学员的数据`);
    } catch (error: any) {
      console.error('导出失败:', error);
      message.destroy();
      message.error('导出失败: ' + (error.message || '未知错误'));
    }
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      render: (name: string, record: any) => <button type="button" className="student-name-link" onClick={() => handleViewDetail(record)}>{name}</button>,
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 70,
      render: (gender: string) => (gender === 'M' ? '男' : gender === 'F' ? '女' : '-'),
    },
    {
      title: '年龄',
      key: 'age',
      width: 70,
      render: (_: any, record: any) => {
        const age = estimatedAge(record);
        if (age === null) return '-';
        const aged = !record.birthDate && record.recordedAge != null && record.recordedAge !== age;
        return <span title={ageTooltip(record)}>{age}岁{aged && <small style={{ color: 'var(--tx3)' }}>（推算）</small>}</span>;
      },
    },
    {
      title: '课时信息',
      key: 'lessons',
      width: 120,
      render: (_: any, record: any) => {
        const remaining = record.remainingLessons ?? 0;
        return (
          <div style={{ whiteSpace: 'nowrap' }}>
            剩余 <strong style={{ color: remaining <= 5 ? 'var(--bad)' : 'var(--acc-strong)' }}>{remaining}</strong> 节
          </div>
        );
      },
    },
    {
      title: '负责老师',
      key: 'teacher',
      width: 100,
      render: (_: any, record: any) => {
        const teacherNames = [...new Set((record.enrollments || [])
          .filter((enrollment: any) => enrollment.status === 'active')
          .map((enrollment: any) => enrollment.class?.teacher?.name)
          .filter(Boolean))];
        return teacherNames.length ? teacherNames.join('、') : '-';
      },
    },
    {
      title: '所属班级',
      key: 'class',
      width: 200,
      render: (_: any, record: any) => {
        // 从活跃的报名记录中获取班级信息
        if (!record.enrollments || record.enrollments.length === 0) {
          return '-';
        }
        const activeEnrollments = record.enrollments.filter((e: any) => e.status === 'active');
        if (activeEnrollments.length === 0) {
          return '-';
        }
        // 如果有多个活跃班级，用顿号连接
        const classNames = activeEnrollments
          .map((e: any) => e.class?.name || e.class?.code || '-')
          .filter((name: string) => name !== '-');
        return classNames.length > 0 ? classNames.join('、') : '-';
      },
    },
    {
      title: '家长电话',
      dataIndex: 'parentPhone',
      key: 'parentPhone',
      width: 130,
    },
    // 2026-11-08 用户拍板：状态列取消——本页以活跃学员为主，例外状态在详情抽屉（退费提示等）呈现。
    {
      title: '操作',
      key: 'action',
      // 2026-11-08 拍板：操作按钮统一为同色描边小按钮（.stu-act：字重/描边加粗，样式见 index.css）；
      // 移除「删除空档案」与「撤销不续费」（撤销在续费管理）。
      render: (_: any, record: any) => (
        <Space size={4} wrap style={{ lineHeight: 1.2 }}>
          <Button size="small" className="stu-act" icon={<SearchOutlined />} onClick={() => handleViewDetail(record)}>
            查询
          </Button>
          {canRefundStudent(record) && <Button size="small" className="stu-act" icon={<Banknote size={13} />}
            onClick={() => setRefundTarget({ student: record, scope: refundScope })}>退费</Button>}
          {canManageStudents && (
            <Button size="small" className="stu-act" icon={<UserAddOutlined />} onClick={() => handleOpenParentAccountModal(record)}>
              家长账号
            </Button>
          )}
          {canManageStudents && (
            <Button size="small" className="stu-act" icon={<PlusCircleOutlined />} onClick={() => handleAddLessons(record)}>
              增课
            </Button>
          )}
          {canPriceLessons && <Button size="small" className="stu-act" icon={<Banknote size={13} />}
            onClick={() => setPricingTarget({ id: record.id, name: record.name, scope: pricingScope })}>历史课时计价</Button>}
          <Button size="small" className="stu-act" icon={<MinusCircleOutlined />} onClick={() => handleDeductLessons(record)}>
            划课
          </Button>
          {canManageStudents && (
            <Button size="small" className="stu-act" icon={<StopOutlined />} onClick={() => handleToggleNoRenewal(record)}>
              不续费
            </Button>
          )}
          {canManageStudents && (
            <Button size="small" className="stu-act" icon={<SwapOutlined />} onClick={() => handleTransfer(record.id)}>
              班级调整
            </Button>
          )}
          {canManageStudents && (
            <Button size="small" className="stu-act" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
          )}
          {canManageStudents && <ArchiveStudentAction student={record} onArchived={() => fetchStudents()} />}
        </Space>
      ),
      width: 300,
    },
  ];

  const logColumns = [
    {
      title: '学员',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 120,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => {
        // 退费扣课（refund）与成单作废冲回（void）须与普通增减课区分
        if (type === 'refund') return <Tag color="orange">退费</Tag>;
        if (type === 'void') return <Tag color="default">作废冲回</Tag>;
        return (
          <Tag color={type === 'add' ? 'green' : 'volcano'}>
            {type === 'add' ? '增课 / 返还' : '划课'}
          </Tag>
        );
      },
    },
    {
      title: '班级',
      dataIndex: 'className',
      key: 'className',
      width: 130,
      render: (text: string) => {
        return text || '-';
      },
    },
    {
      title: '节数',
      dataIndex: 'lessons',
      key: 'lessons',
      width: 70,
      render: (lessons: number) => `${lessons || 0} 节`,
    },
    {
      title: '操作者',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 110,
      render: (text: string) => text || '-',
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      width: 180,
      ellipsis: true,
      render: (notes: string) => {
        return prettyLessonNote(notes) || '-';
      },
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-',
    },
  ];

  // 2026-11-08 代码检查修复：权限提示移到所有 Hook 之后（见顶部 allowed 注释）
  if (!allowed) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Alert
          message="权限受限"
          description="您没有权限访问学员管理页面，如需访问请联系系统管理员"
          type="warning"
          showIcon
        />
      </div>
    );
  }

  return (
    <div>
      <div className="biz-page-head" style={{ marginBottom: 16 }}>
        <div className="biz-head-copy"><h1>学员管理</h1><p>学员档案、课时与跟进入口；点击姓名可打开右侧详情。不续费学员在续费管理中维护。</p></div>
        <Space>
{!EXPORT_COLLAPSED && (          <Button
            type="default"
            icon={<DownloadOutlined />}
            onClick={handleExportAllStudents}
          >
            导出全部学员
          </Button>)}          {/* 2026-11-08（⑪修订）：增减课记录回到本页弹窗——只看手动增减课（赠课+划课），成单/退费不出现 */}
          <Button type="default" className="stu-act" icon={<PlusCircleOutlined />} onClick={handleOpenLogModal}>
            增减课记录
          </Button>
          {canManageStudents && (
            <Button type="primary" className="stu-act" icon={<SwapOutlined />} onClick={() => handleTransfer()}>
              班级调整
            </Button>
          )}
          {/* 2026-11-08 用户拍板：原「已归档学员」按钮位改为退费记录快捷入口（已归档学员仍可从学员管理卡片墙进入） */}
          {canRefund && <Button className="stu-act" icon={<RollbackOutlined />} onClick={() => navigate('/students/refunds')}>退费记录</Button>}
        </Space>
      </div>

      {/* 搜索栏 */}
      <div style={{ marginBottom: 16, background: 'var(--card2)', padding: 16, borderRadius: 8 }}>
        <Space size="middle" wrap style={{ maxWidth: '100%' }}>
          <Search
            placeholder="搜索学员姓名/家长电话"
            allowClear
            enterButton={<><SearchOutlined /> 搜索</>}
            style={{ width: 'min(350px, calc(calc(var(--ui-vw, 1vw) * 100) - 56px))', maxWidth: '100%' }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onSearch={handleSearch}
          />
          <Button
            className="stu-act"
            type={showUnscheduledOnly ? 'primary' : 'default'}
            onClick={handleToggleUnscheduled}
          >
            {showUnscheduledOnly ? '显示全部学员' : '未排班学员'}
          </Button>
          <Button className="stu-act" icon={<ReloadOutlined />} onClick={handleResetSearch}>
            重置
          </Button>
          {(searchKeyword || showUnscheduledOnly) && (
            <span style={{ color: 'var(--tx2)' }}>
              {searchKeyword && <>搜索: <strong>{searchKeyword}</strong></>}
              {searchKeyword && showUnscheduledOnly && ' | '}
              {showUnscheduledOnly && <Tag color="blue">未排班学员</Tag>}
            </span>
          )}
        </Space>
      </div>

      {/* 2026-11-08：批量删除空档案入口已移除，行选择复选框一并去除 */}

      <Table
        columns={columns}
        dataSource={students}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1400 }}
        pagination={{
          ...pagination,
          onChange: (page, pageSize) => {
            setPagination({ ...pagination, current: page, pageSize });
          },
        }}
      />
      <Modal
        title="增减课记录（手动增课与划课）"
        open={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        footer={null}
        width={1100}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Search placeholder="搜索学员姓名" allowClear value={logNameInput} onChange={e => setLogNameInput(e.target.value)} onSearch={handleLogNameSearch} style={{ width: 200 }} />
          <RangePicker
            value={logDateRange}
            onChange={handleLogDateChange}
            format="YYYY-MM-DD"
            allowClear
          />
          <Select
            placeholder="按类型"
            allowClear
            value={logFilters.type}
            onChange={handleLogTypeChange}
            style={{ width: 140 }}
          >
            <Select.Option value="add">赠课/增课</Select.Option>
            <Select.Option value="deduct">划课</Select.Option>
          </Select>
          <Button
            onClick={() => {
              setLogDateRange(null);
              setLogFilters({});
              setLogNameInput('');
              fetchLessonLogs(1, logPagination.pageSize, {}, null);
            }}
          >
            重置筛选
          </Button>
{!EXPORT_COLLAPSED && (          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportLogs}
          >
            导出Excel
          </Button>)}        </div>
        <Table
          columns={logColumns}
          dataSource={lessonLogs}
          loading={logLoading}
          rowKey="id"
          pagination={{
            current: logPagination.current,
            pageSize: logPagination.pageSize,
            total: logPagination.total,
            showSizeChanger: true,
            onChange: handleLogTableChange,
          }}
          scroll={{ x: 1000 }}
        />
      </Modal>
      {canPriceLessons && pricingTarget?.scope === pricingScope && <StudentLessonPricing
        key={pricingScope + ':' + pricingTarget.id} studentId={pricingTarget.id} studentName={pricingTarget.name}
        scopeKey={pricingScope} onClose={() => setPricingTarget(null)} />}
      <Modal
        title={`划课 - ${deductLessonStudent?.name || ''}`}
        open={deductLessonModalVisible}
        onCancel={() => {
          if (deductSubmitLock.current) return;
          openDeductReq.current++;
          setDeductLessonModalVisible(false);
          setDeductLessonStudent(null);
        }}
        onOk={() => deductLessonForm.submit()}
        okText={deductMode === 'activity' ? (pendingActivityDeduct ? '重试并确认原划课' : '确认活动划课') : '确定'}
        confirmLoading={deductSubmitting}
        okButtonProps={{ disabled: deductSubmitting || (!pendingActivityDeduct && (deductMode === 'activity' ? !context.balance : !!chosenSchedule && !context.attendance)) }}
        cancelButtonProps={{ disabled: deductSubmitting }}
        maskClosable={!deductSubmitting}
        keyboard={!deductSubmitting}
        width={520}
      >
        <Form form={deductLessonForm} onFinish={handleLessonSubmit} layout="vertical">
          {pendingActivityDeduct && <Alert type="warning" showIcon style={{ marginBottom: 16 }}
            message="已有活动划课操作待确认"
            description="上次请求可能已扣课。关闭或刷新后仍会恢复原操作；请重试确认原结果后再发起新活动划课。原参数已锁定，重试不会重复扣课。" />}
          <div style={{ marginBottom: 14, padding: '9px 12px', background: 'var(--acc-bg)', borderRadius: 8 }}>
            {context.balanceError ? <Space>分项余额读取失败：{context.balanceError}<Button size="small" onClick={context.retryBalance}>重试余额</Button></Space>
              : context.balance ? lessonBalanceText(context.balance) : '正在读取分项余额…'}
          </div>
          {/* 2026-11-08（⑫）：划课方式——场次签到 / 活动划课（不选班级时间，直接扣课时） */}
          <Form.Item name="deductMode" label="划课方式" initialValue="schedule">
            <Radio.Group disabled={deductSubmitting || !!pendingActivityDeduct} onChange={() => deductLessonForm.setFieldValue('lessonSource', 'paid')}>
              <Radio.Button value="schedule">场次签到</Radio.Button>
              <Radio.Button value="activity">活动划课</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="lessonSource" label="扣课来源" extra={lessonSource === 'gift' ? '赠课从独立赠课余额扣减，课消金额为 0 元。' : '按购买批次先进先出。历史待核课时保留数量，金额待核。'}>
            <Radio.Group disabled={deductSubmitting || !!pendingActivityDeduct || (deductMode === 'schedule' && !!chosenSchedule && !context.attendance)}>
              <Radio.Button value="paid">付费课</Radio.Button>
              <Radio.Button value="gift" disabled={!pendingActivityDeduct && context.attendance?.source !== 'gift' && context.balance?.giftRemainingLessons === 0}>赠课</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {context.rosterError && deductMode === 'schedule' && <Alert type="error" message={context.rosterError}
            action={<Button size="small" onClick={context.retryRoster}>重试原签到</Button>} style={{ marginBottom: 12 }} />}
          {deductMode !== 'activity' ? (
          <>
          <Form.Item
            name="classId"
            label="选择班级"
            rules={[{ required: true, message: '请选择班级' }]}
          >
            <Select placeholder="请选择上课班级" notFoundContent={<div style={{ padding: '4px 8px', color: 'var(--tx3)' }}>该学员暂无在读班级：请切换上方「活动划课」直接扣减课时</div>} onChange={(classId: string) => {
              const dateVal = deductLessonForm.getFieldValue('date');
              void loadSchedulesForDeduct(classId, dateVal ? dateVal.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
            }}>
              {(deductLessonStudent?.enrollments || []).map((enrollment: any) => (
                <Select.Option key={enrollment.classId} value={enrollment.classId}>
                  {enrollment.class?.name} ({enrollment.class?.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="date"
            label="上课日期"
            rules={[{ required: true, message: '请选择上课日期' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
              onChange={(d) => {
                const classId = deductLessonForm.getFieldValue('classId');
                if (classId) void loadSchedulesForDeduct(classId, d ? d.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
              }}
            />
          </Form.Item>

          <Form.Item
            name="scheduleId"
            label="选择课程场次"
            rules={[{ required: true, message: '请选择该班当日的真实课程场次' }]}
          >
            <Select
              placeholder={deductSchedulesLoading ? '正在查询场次…' : deductSchedulesError ? '场次查询失败' : '请先选择场次'}
              loading={deductSchedulesLoading}
              notFoundContent={
                deductSchedulesLoading ? '查询中…' : (
                  <div style={{ padding: '8px 4px', color: 'var(--tx3)', fontSize: 14 }}>
                    该班当日没有未取消的排课。请到
                    <a
                      style={{ color: 'var(--acc-strong)', margin: '0 4px' }}
                      onClick={() => { setDeductLessonModalVisible(false); navigate('/operation/weekly-schedule'); }}
                    >
                      周课表
                    </a>
                    新增或补排课程后再签到；系统不再自动生成全天占位场次。
                  </div>
                )
              }
            >
              {deductScheduleOptions.map((s) => (
                <Select.Option key={s.id} value={s.id}>
                  {new Date(s.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  {' - '}
                  {new Date(s.endTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  {s.classroom ? ` · ${s.classroom}` : ''}
                  {s.teacherName ? ` · ${s.teacherName}` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {deductSchedulesError && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message={`场次查询失败：${deductSchedulesError}`}
              description="请重试；重试仍失败时，可先到周课表核对当日排课。此处不是“无排课”。"
              action={<Button size="small" danger onClick={() => {
                const classId = deductLessonForm.getFieldValue('classId');
                const date = deductLessonForm.getFieldValue('date');
                if (classId) void loadSchedulesForDeduct(classId, (date || dayjs()).format('YYYY-MM-DD'));
              }}>重试</Button>}
            />
          )}

          <Form.Item
            name="attendanceStatus"
            label="出勤状态"
            rules={[{ required: true, message: '请选择出勤状态' }]}
          >
            <Select placeholder="请选择出勤状态">
              <Select.Option value="present">出勤（扣 1 课时）</Select.Option>
              <Select.Option value="late">迟到（扣 1 课时）</Select.Option>
              <Select.Option value="leave">请假（不扣课时）</Select.Option>
              <Select.Option value="absent">缺勤（不扣课时）</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="选填，如：补签原因、调课说明" />
          </Form.Item>
          </>
          ) : (
          <>
            <Form.Item name="activityLessons" label="扣减课时" rules={[{ required: true, message: '请输入扣减课时' }]}>
              <InputNumber disabled={deductSubmitting || !!pendingActivityDeduct} min={1} precision={0} style={{ width: '100%' }} addonAfter="节" />
            </Form.Item>
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="活动划课不关联班级与场次：不生成考勤、不改动最后上课日期；仅扣减课时并计入增减课台账与课消，活动说明必填。" />
            <Form.Item name="activityNotes" label="活动说明（必填）" rules={[{ required: true, whitespace: true, message: '请填写活动说明，如活动名称与内容' }]}>
              <Input.TextArea disabled={deductSubmitting || !!pendingActivityDeduct} rows={2} maxLength={200} placeholder="例如：万圣节主题活动课" />
            </Form.Item>
          </>
          )}
        </Form>
      </Modal>
      <Modal
        title={`增课 - ${addLessonStudent?.name || ''}`}
        open={addLessonModalVisible}
        onCancel={() => {
          if (addLessonSubmitLock.current) return;
          setAddLessonModalVisible(false);
          setAddLessonStudent(null);
        }}
        onOk={() => addLessonForm.submit()}
        confirmLoading={addLessonSubmitting}
        okText={pendingLessonAdd ? '重试并确认原增课' : '确认增课'}
        cancelButtonProps={{ disabled: addLessonSubmitting }}
        closable={!addLessonSubmitting}
        maskClosable={!addLessonSubmitting}
        width={420}
      >
        {pendingLessonAdd && <Alert style={{ marginBottom: 12 }} type="warning" showIcon message="已有增课操作待确认" description="参数已锁定。请重试原操作确认结果；不会重复增加课时。关闭后重新打开或刷新后再次打开此学员，仍可继续确认。" />}
        <Form form={addLessonForm} onFinish={handleAddLessonSubmit} layout="vertical" disabled={addLessonSubmitting || !!pendingLessonAdd}>
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            当前剩余课时：<strong>{addLessonStudent?.remainingLessons ?? '—'} 节</strong>
            <div style={{ color: 'var(--tx3)', fontSize: 12 }}>本次增课将存入赠课余额，使用时核销 0 元。</div>
          </div>
          <Form.Item
            name="lessons"
            label="增课节数"
            rules={[{ required: true, message: '请输入增课节数' }]}
          >
            <InputNumber
              min={1}
              max={2147483647}
              precision={0}
              style={{ width: '100%' }}
              placeholder="请输入本次增课节数"
            />
          </Form.Item>
          {/* 2026-11-08（⑪）：无偿赠课须留痕——增课备注必填 */}
          <Form.Item name="notes" label="备注（必填）" rules={[{ required: true, whitespace: true, message: '请填写增课备注（如赠课原因、赠送说明）' }]}>
            <Input.TextArea rows={2} placeholder="例如赠课/转介绍赠送——必填，便于增减课台账核对" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingStudent ? '编辑学员' : selectedConversion ? '从成单导入 · 建档' : '新增学员'}
        open={modalVisible}
        confirmLoading={studentFormSubmitting}
        onCancel={() => { setModalVisible(false); setSelectedConversion(null); }}
        onOk={() => form.submit()}
        width={600}
        styles={{ body: { maxHeight: 'calc(calc(var(--ui-vh, 1vh) * 100) - 220px)', overflowY: 'auto' } }}
      >
        <Form form={form} onFinish={submitStudentForm} layout="vertical" onValuesChange={() => setStudentFormDirty(true)}>
          {selectedConversion && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="已带入成单资料，请核对并补充缺失信息" description="年龄是成单时登记的年龄；出生日期未知时无需填写。" />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', columnGap: 16 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true, message: '请输入学员姓名' }, { max: 50, message: '学员姓名不能超过50个字符' }]}>
            <Input placeholder="请输入学员姓名" />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Select placeholder="请选择性别" allowClear>
              <Select.Option value="M">男</Select.Option>
              <Select.Option value="F">女</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="birthDate" label="出生日期（选填）" extra="仅在知道准确生日时填写。">
            <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} disabledDate={current => !!current && current.isAfter(dayjs().endOf('day'))}
              onChange={value => { if (value) form.setFieldValue('age', ageFromBirthday(value.format('YYYY-MM-DD'))); }} />
          </Form.Item>
          <Form.Item name="age" label="登记年龄" extra={formBirthDate ? '已填写出生日期，年龄按出生日期显示。' : '仅记录登记时年龄；展示时按时间自动累加（每年 +1，不精确到生日）。'}>
            <InputNumber
              min={0}
              max={150}
              precision={0}
              disabled={!!formBirthDate}
              placeholder="请输入年龄"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="parentPhone" label="家长电话" rules={[
            { required: !editingStudent && createParentAccount, message: '创建家长账号需填写家长电话' },
            { validator: (_, value) => !value || (createParentAccount && !editingStudent ? isValidPhone(value) : isValidContactPhone(value)) ? Promise.resolve() : Promise.reject(new Error(createParentAccount && !editingStudent ? '创建家长账号请输入有效的大陆手机号' : '请输入有效的家长电话')) },
          ]}>
            <Input placeholder="请输入家长电话" />
          </Form.Item>
          <Form.Item name="parentName" label="家长姓名" rules={!editingStudent && createParentAccount ? [{ required: true, message: '请输入家长姓名' }] : []}>
            <Input placeholder="请输入家长姓名" />
          </Form.Item>
          <Form.Item name="address" label="地址"><Input placeholder="请输入地址" /></Form.Item>
          </div>

          {editingStudent ? (
            <Form.Item label="所属班级">
              <Space wrap style={{ marginBottom: 8 }}>
                {(editingStudent.enrollments || []).filter((enrollment: any) => enrollment.status === 'active').map((enrollment: any) => (
                  <Tag key={enrollment.id}>{enrollment.class?.name || '未知班级'}{enrollment.class?.teacher?.name ? ` · ${enrollment.class.teacher.name}` : ''}</Tag>
                ))}
                {!(editingStudent.enrollments || []).some((enrollment: any) => enrollment.status === 'active') && <span>暂无在读班级</span>}
              </Space>
              <Alert type="info" showIcon message="基本资料编辑不会调整报名。新增班级或调班请使用班级调整，先保存当前资料再操作。" />
              <Button type="link" onClick={handleAdjustFromEditor}>前往班级调整</Button>
            </Form.Item>
          ) : (
            <Form.Item name="classId" label="所属班级" extra="可选，创建学员时加入所选班级；之后可使用班级调整增加班级。">
              <Select placeholder="请选择所属班级" allowClear showSearch optionFilterProp="label"
                options={classesList.filter((cls: any) => cls.status === 'active').map((cls: any) => ({
                  label: `${cls.name} (${cls.code}) - 老师: ${cls.teacher?.name || '未分配'}`, value: cls.id,
                }))} />
            </Form.Item>
          )}

          {/* 课时登记 - 仅新增学员时显示 */}
          {!editingStudent && (
            <div style={{ background: 'var(--card2)', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid var(--line)' }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>
                {selectedConversion ? '原成单购课信息' : '建档课时'}
              </div>
              <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--tx2)' }}>
                {selectedConversion ? '购买课时与成交金额从选中的原成单同步到学员。' : '普通建档初始为 0 节。购买课时从成单同步，赠课请在建档后使用「增课」登记。'}
              </div>

              <div className="overlay-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <Form.Item
                  name="cardOpenDate"
                  label="开卡时间"
                  initialValue={dayjs()}
                >
                  <DatePicker
                    style={{ width: '100%' }}
                    format="YYYY-MM-DD"
                    placeholder="选择开卡时间"
                  />
                </Form.Item>

                {selectedConversion && <>
                  <Form.Item label="原单购买课时"><strong>{selectedConversion.totalLessons ?? 0} 节</strong></Form.Item>
                  {selectedConversion.price != null
                    ? <Form.Item label="原单成交金额（元）"><strong>¥{Number(selectedConversion.price).toFixed(2)}</strong></Form.Item>
                    : <Form.Item name="conversionPrice" label="成交金额（元）"
                        rules={Number(selectedConversion.totalLessons) > 0 ? [{ required: true, message: '请填写原成单的整批成交金额，0 元请填 0' }] : []}
                        extra="这笔历史成单缺少价格，请凭原始凭证补齐整批金额，0 元请填 0。">
                        <InputNumber min={0} max={99999999.99} precision={2} prefix="¥" placeholder="原单整批金额，0 元请填 0" style={{ width: '100%' }} />
                      </Form.Item>}
                </>}

                <Form.Item
                  name="salesId"
                  label="销售"
                >
                  <Select
                    placeholder="选择销售"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    filterOption={(input, option) =>
                      (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    options={salesList.map((sales: any) => ({
                      label: sales.name,
                      value: sales.id,
                    }))}
                  />
                </Form.Item>
              </div>
            </div>
          )}

          {/* 2026-11-08 用户拍板：编辑模式撤掉课时与缴费信息块——课时/成交金额在查询抽屉可见；
              销售归属随成单信息表（建档带入，续费业绩按成单记录）；最后上课时间在查询抽屉与划课流水中体现。 */}
          {/* 2026-11-08 用户拍板：编辑弹窗撤掉状态选择——状态流转全部走专门入口：
              流失=班级名单移除（流失库）、退费=退费记录、归档=归档按钮、召回=流失库恢复；编辑只管基础资料。 */}

          {/* 家长账号设置 - 仅新增学员时显示 */}
          {!editingStudent && (
            <div style={{ background: 'var(--acc-bg)', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid var(--line)' }}>
              <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--acc-strong)' }}>
                <UserAddOutlined style={{ marginRight: 8 }} />
                家长账号设置
              </div>

              <Form.Item name="createParent" valuePropName="checked" style={{ marginBottom: 12 }}>
                <Checkbox
                  checked={createParentAccount}
                  onChange={(e) => setCreateParentAccount(e.target.checked)}
                >
                  同时创建家长登录账号
                </Checkbox>
              </Form.Item>

              {createParentAccount && (
                <>
                  <Alert
                    message="创建家长账号后，家长可以使用手机号和密码登录系统，查看学员的课表、出勤记录和缴费信息。"
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                  />

                </>
              )}
            </div>
          )}
        </Form>
      </Modal>

      <ClassEnrollmentModal
        open={transferModalVisible}
        studentId={enrollmentStudentId}
        onCancel={() => { setTransferModalVisible(false); setEnrollmentStudentId(undefined); }}
        onSuccess={handleEnrollmentChanged}
      />

      {/* 从成单信息导入 Modal */}
      <Modal
        title="从成单信息导入学员"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
        width={900}
      >
        <Alert
          message="仅显示尚未建立学员档案的成单。导入后关联学员，原成单记录会保留。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        {importError && <Alert type="error" showIcon message="成单信息加载失败" action={<Button size="small" onClick={() => handleOpenImportModal(conversionPagination.current)}>重试</Button>} style={{ marginBottom: 16 }} />}
        <Table
          columns={[
            {
              title: '学员姓名',
              dataIndex: 'studentName',
              key: 'studentName',
            },
            {
              title: '联系方式',
              dataIndex: 'contact',
              key: 'contact',
            },
            {
              title: '课程类型',
              dataIndex: 'courseType',
              key: 'courseType',
            },
            {
              title: '课时数',
              dataIndex: 'totalLessons',
              key: 'totalLessons',
              render: (lessons: number) => lessons ? `${lessons} 节` : '-',
            },
            {
              title: '金额',
              dataIndex: 'price',
              key: 'price',
              render: (price: number | null) => price == null ? '-' : `¥${Number(price).toFixed(2)}`,
            },
            {
              title: '成单日期',
              dataIndex: 'conversionDate',
              key: 'conversionDate',
              render: (date: string) => date || '-',
            },
            {
              title: '销售',
              dataIndex: 'salesName',
              key: 'salesName',
              render: (name: string) => name || '-',
            },
            {
              title: '操作',
              key: 'action',
              render: (_: any, record: any) => (
                <Button
                  type="primary"
                  size="small"
                  icon={<ImportOutlined />}
                  onClick={() => handleImportConversion(record)}
                >
                  导入
                </Button>
              ),
            },
          ]}
          dataSource={conversionsList}
          loading={importLoading}
          rowKey="id"
          pagination={{ ...conversionPagination, onChange: (page, pageSize) => handleOpenImportModal(page, pageSize) }}
          locale={{
            emptyText: importLoading ? '加载中...' : importError ? '加载失败，请重试' : '暂无待导入的成单，已建档的成单不会重复显示。',
          }}
        />
      </Modal>

      {/* 为已有学员创建家长账号 Modal */}
      <Modal
        title={`创建家长账号 - ${parentAccountStudent?.name || ''}`}
        open={parentAccountModalVisible}
        confirmLoading={parentFormSubmitting}
        onCancel={() => {
          setParentAccountModalVisible(false);
          parentAccountForm.resetFields();
          setParentAccountStudent(null);
        }}
        onOk={() => parentAccountForm.submit()}
        width={500}
      >
        <Form name="parentAccount" form={parentAccountForm} onFinish={submitParentForm} layout="vertical">
          <Alert
            message="提示"
            description="手机号将保存为当前孩子的家长电话。已有同机构家长账号会关联当前孩子并沿用原密码；其他同电话孩子不会自动关联，请管理员从每个孩子的“家长账号”入口逐个确认关联。家长登录后可查看已关联孩子的课表、出勤记录和缴费信息。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="name"
            label="家长姓名"
            rules={[{ required: true, message: '请输入家长姓名' }]}
          >
            <Input placeholder="请输入家长姓名" />
          </Form.Item>

          <Form.Item
            name="parentPhone"
            normalize={normalizePhone}
            label="家长电话"
            rules={[
              { required: true, message: '请输入家长电话' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的家长电话' },
            ]}
          >
            <Input placeholder="请输入家长电话（用于登录）" />
          </Form.Item>

        </Form>
        <div style={{ marginTop: 12 }}>
          <Button size="small" className="stu-act" onClick={handleResetParentPassword}>恢复默认密码（=手机号）</Button>
          <span style={{ marginLeft: 8, color: 'var(--tx3)', fontSize: 12 }}>家长忘记密码时使用；新账号初始密码本就是手机号</span>
        </div>
      </Modal>

      {refundTarget?.scope === refundScope && <RefundRecords embedded student={refundTarget.student}
        onClose={() => setRefundTarget(null)} onConfirmed={() => {
          setRefundTarget(null);
          if (detailStudent?.id === refundTarget.student.id) { setDetailModalVisible(false); setDetailStudent(null); }
          void fetchStudents();
        }} />}

      {/* 学员详情：右侧抽屉（保留列表筛选/滚动位置；390 宽占满屏） */}
      <Drawer
        title="学员详情"
        placement="right"
        open={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        width={480}
        styles={{ body: { padding: '12px 16px' } }}
        footer={
          <Button key="close" block onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>
        }
      >
        {detailStudent && (
          <div className="student-profile">
            {/* 查询抽屉展示档案；退费可从列表行「退费」或「退费记录」办理。 */}
            <div className="student-profile__identity">
              <span className="student-profile__avatar" aria-hidden="true">{detailStudent.name?.slice(0, 1)}</span>
              <div><span className="student-profile__eyebrow">学员档案</span><h2>{detailStudent.name}</h2>
                <p title={ageTooltip(detailStudent)}>{detailStudent.gender === 'M' ? '男' : detailStudent.gender === 'F' ? '女' : '性别未填写'}{estimatedAge(detailStudent) !== null ? ` · ${estimatedAge(detailStudent)}岁` : ''}</p>
              </div>
            </div>
            <section className="student-profile__section">
              <div className="student-profile__heading"><div><h3>课时概览</h3><p>当前账户课时情况</p></div></div>
              <div className="student-profile__metrics">
                <div><span>剩余课时</span><strong>{detailStudent.remainingLessons ?? 0}<small> 节</small></strong></div>
                <div><span>已购课时</span><strong>{detailStudent.purchasedLessons ?? 0}<small> 节</small></strong></div>
                <div><span>已消课时</span><strong>{detailStudent.consumedLessons ?? 0}<small> 节</small></strong></div>
              </div>
            </section>
            <section className="student-profile__section">
              <div className="student-profile__heading"><div><h3>基本信息</h3><p>联系与购课信息</p></div></div>
              <dl className="student-profile__details">
                <div><dt>家长电话</dt><dd>{detailStudent.parentPhone || '未填写'}</dd></div>
                <div><dt>{canManageStudents ? '累计成交金额' : '本人负责的成交金额'}</dt><dd><StudentOrderTotal studentId={detailStudent.id} /></dd></div>
                <div><dt>开卡时间</dt><dd>{detailStudent.cardOpenDate ? dayjs(detailStudent.cardOpenDate).format('YYYY-MM-DD') : '未填写'}</dd></div>
                <div><dt>最后上课</dt><dd>{(() => {
                  // 2026-11-08：签到自动推进 lastClassDate（服务端维护）；历史学员无值时从最新划课流水兜底推算
                  const latestDeduct = detailLogs.find((l: any) => l.type === 'deduct' && l.businessDate)?.businessDate;
                  return detailStudent.lastClassDate ? dayjs(detailStudent.lastClassDate).format('YYYY-MM-DD')
                    : latestDeduct ? `${latestDeduct}（流水）` : '暂无记录';
                })()}</dd></div>
                <div><dt>负责销售</dt><dd>{detailStudent.sales?.name || '未分配'}</dd></div>
              </dl>
            </section>

            {/* 报名与续费（真实报名记录 + 不续费标记） */}
            <section className="student-profile__section">
              <div className="student-profile__heading">
                <div><h3>报名与续费</h3><p>当前有效班级与续费状态</p></div>
              </div>
              {detailExtraError ? (
                <Alert
                  type="error" showIcon style={{ marginBottom: 8 }}
                  message={`详情加载失败：${detailExtraError}`}
                  action={<Button size="small" danger onClick={() => detailStudent.id && loadDetailExtra(detailStudent.id)}>重试</Button>}
                />
              ) : (
                <>
                  {detailStudent.status === 'refunded' && (
                    <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                      message={`已退费${detailStudent.refundDate ? `（${dayjs(detailStudent.refundDate).format('YYYY-MM-DD')}）` : ''}${detailStudent.refundReason ? `：${detailStudent.refundReason}` : ''}`}
                      description="退费在「学员管理 → 退费记录」中登记与取消。" />
                  )}
                  {detailExtraLoading && detailEnrollments.length === 0 ? (
                    <p style={{ color: 'var(--tx3)', fontSize: 14 }}>报名信息加载中…</p>
                  ) : detailEnrollments.length === 0 ? (
                    <p style={{ color: 'var(--tx3)', fontSize: 14 }}>暂无有效报名记录</p>
                  ) : (
                    detailEnrollments.map((e: any, i: number) => (
                      <dl className="student-profile__details" key={e.id || i} style={{ marginBottom: i < detailEnrollments.length - 1 ? 8 : 0 }}>
                        <div>
                          <dt>班级</dt>
                          <dd>{e.class?.name ? `${e.class.name}${e.class.code ? `（${e.class.code}）` : ''}` : e.classId?.slice(0, 8)}</dd>
                        </div>
                        <div><dt>入班日期</dt><dd>{e.enrolledAt ? dayjs(e.enrolledAt).format('YYYY-MM-DD') : '—'}</dd></div>
                        <div><dt>状态</dt><dd><Tag color={e.status === 'active' ? 'green' : 'default'}>{e.status === 'active' ? '在班' : e.status}</Tag></dd></div>
                      </dl>
                    ))
                  )}
                </>
              )}
            </section>

            {/* 出勤与课时流水（真实流水，按页加载） */}
            <section className="student-profile__section">
              <div className="student-profile__heading">
                <div><h3>出勤与课时流水</h3><p>扣课 / 返还 / 增课记录（含场次业务日期）</p></div>
              </div>
              {detailExtraError ? (
                <p style={{ color: 'var(--tx3)', fontSize: 14 }}>流水未加载（上方可重试）</p>
              ) : detailExtraLoading && detailLogs.length === 0 ? (
                <p style={{ color: 'var(--tx3)', fontSize: 14 }}>流水加载中…</p>
              ) : detailLogs.length === 0 ? (
                <p style={{ color: 'var(--tx3)', fontSize: 14 }}>暂无课时流水</p>
              ) : (
                <>
                  {detailLogs.map((log: any, i: number) => (
                    <div key={log.id || i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i === 0 ? '1px solid var(--line)' : 'none', borderBottom: '1px solid var(--line)' }}>
                        <Tag color={log.type === 'deduct' ? 'red' : log.type === 'add' ? 'green' : log.type === 'refund' ? 'orange' : 'default'}>
                          {log.type === 'deduct' ? `扣 ${log.lessons}` : log.type === 'add' ? `返/增 ${log.lessons}` : log.type === 'refund' ? `退费 ${log.lessons}` : log.type === 'void' ? `作废冲回 ${log.lessons}` : `${log.type} ${log.lessons}`}
                        </Tag>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14 }}>
                          {log.businessDate || (log.createdAt ? dayjs(log.createdAt).format('YYYY-MM-DD') : '—')}
                          {log.scheduleId ? <span style={{ color: 'var(--tx3)', fontSize: 12 }}> · 场次签到</span> : null}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prettyLessonNote(log.notes) || '—'}</div>
                      </div>
                    </div>
                  ))}
                  {detailLogsTotal > 6 && (
                    <div style={{ textAlign: 'center', paddingTop: 8 }}>
                      <Button size="small" loading={detailExtraLoading}
                        onClick={() => detailStudent.id && loadDetailExtra(detailStudent.id, detailLogsPage + 1 <= Math.ceil(detailLogsTotal / 6) ? detailLogsPage + 1 : 1)}>
                        {detailLogsPage < Math.ceil(detailLogsTotal / 6) ? `加载更多（${detailLogs.length}/${detailLogsTotal}）` : `回到第一页（共 ${detailLogsTotal} 条）`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default Students;
