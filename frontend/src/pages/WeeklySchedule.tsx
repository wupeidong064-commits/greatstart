import { Modal } from '../components/overlays';
import { useState, useEffect, useRef, type ComponentRef } from 'react';
import { Card, Table, Tag, Button, Space, DatePicker, Spin, message, Tabs, Select, Alert, Form, Input, Empty, TimePicker, Radio, Checkbox } from 'antd';
import { CalendarDays, Clock, UserRound, CircleCheck } from 'lucide-react';
import './CashflowSummary.css';
import './TeachingPages.css';
import api from '../services/api';
import { availableLessons, lessonBalanceText, readLessonBalance, type LessonBalance, type LessonSource } from '../utils/lessonBalance';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekday from 'dayjs/plugin/weekday';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(isoWeek);
dayjs.extend(weekday);
dayjs.extend(utc);
dayjs.extend(timezone);

// 设置默认时区为中国
dayjs.tz.setDefault('Asia/Shanghai');

interface Schedule {
  id: string;
  classId: string;
  className: string;
  classCode: string;
  courseName?: string;
  courseBound?: boolean;
  teacherId: string;
  teacherName: string;
  startTime: string;
  endTime?: string;
  classroom: string;
  status: string;
  studentCount: number;
}

interface AttendanceStudent extends Partial<LessonBalance> {
  lessonSource?: LessonSource | null;
  id: string;
  name: string;
  phone?: string;
  phoneLast4?: string | null;
  classNames?: string[];
  remainingLessons: number;
  attendanceStatus?: string;
  isTemporary?: boolean;
  isEnrolled?: boolean;
  pendingTemporary?: boolean;
}

const WeeklySchedule = () => {
  const [searchParams,setSearchParams] = useSearchParams();
  const requestedScheduleId = searchParams.get('scheduleId');
  const user = useAuthStore(state=>state.user);
  const canManageSchedules = ['admin','manager'].includes(user?.role || '');
  const [deepError,setDeepError] = useState('');
  const [deepRetry,setDeepRetry] = useState(0);
  const [rosterError,setRosterError] = useState('');
  const submitBusyRef = useRef(false);
  const teacherBusyRef = useRef(false);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [draftTeacherId, setDraftTeacherId] = useState<string>();
  const deepReqRef = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [createForm] = Form.useForm();
  const lessonDatePicker = useRef<ComponentRef<typeof DatePicker>>(null);
  const [scheduleTeachers, setScheduleTeachers] = useState<{ id: string; name: string }[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState('');
  const teachersReqRef = useRef(0);
  const selectedClassId = Form.useWatch('classId', createForm);
  const selectedClass = classes.find(c => c.id === selectedClassId);
  const defaultTeacherId = selectedClass?.teacherId || selectedClass?.teacher?.id;
  // 2026-11-07 用户拍板：多时段班级可只勾选部分班级时间生成。默认全选，切换班级自动重置。
  const ruleKey = (r: any) => `${r.weekday}|${r.startTime}|${r.endTime}`;
  const [selectedRuleKeys, setSelectedRuleKeys] = useState<string[]>([]);
  const effectiveSelectedRules = selectedClass?.weeklyRules
    ?.filter((r: any) => selectedRuleKeys.includes(ruleKey(r)))
    .map((r: any) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }));

  const loadScheduleTeachers = async (availableClasses = classes) => {
    const request = ++teachersReqRef.current;
    setTeachersLoading(true);
    setTeachersError('');
    setScheduleTeachers([]);
    try {
      const response = await api.get('/users/teachers');
      if (!Array.isArray(response.data) || response.data.some((teacher: any) => !teacher?.id || !teacher?.name)) {
        throw new Error('授课老师数据格式异常，请重试');
      }
      if (request !== teachersReqRef.current) return;
      setScheduleTeachers(response.data);
      const chosenClass = availableClasses.find(c => c.id === createForm.getFieldValue('classId'));
      const defaultId = chosenClass?.teacherId || chosenClass?.teacher?.id;
      const currentId = createForm.getFieldValue('teacherId');
      createForm.setFieldValue('teacherId', response.data.some((t: any) => t.id === currentId) ? currentId : response.data.some((t: any) => t.id === defaultId) ? defaultId : undefined);
    } catch (error: any) {
      if (request === teachersReqRef.current) setTeachersError(error.response?.data?.error?.message || error.response?.data?.message || error.message || '加载授课老师失败，请重试');
    } finally {
      if (request === teachersReqRef.current) setTeachersLoading(false);
    }
  };

  const createBusyRef = useRef(false);
  const previewReqRef = useRef(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [scheduleServiceReady, setScheduleServiceReady] = useState(false);
  const [legacyScheduleService, setLegacyScheduleService] = useState(false);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilityChecked, setCapabilityChecked] = useState(false);
  const capabilityReqRef = useRef(0);
  const checkScheduleCapability = async (availableClasses = classes) => {
    const request = ++capabilityReqRef.current;
    setScheduleServiceReady(false);
    setLegacyScheduleService(false);
    setCapabilityLoading(true);
    setCapabilityChecked(false);
    try {
      const response = await api.get('/courses', { params: { capability: 'schedule_course_selection' } });
      if (request !== capabilityReqRef.current) return;
      if (response.data?.scheduleCourseSelection === true) {
        setScheduleServiceReady(true);
        void loadScheduleTeachers(availableClasses);
      } else if (Array.isArray(response.data) || response.data?.scheduleCourseSelection === false) {
        setLegacyScheduleService(true);
      }
    } catch (error: any) {
      // Only explicit unsupported endpoint responses permit the original form.
      // Network/server errors leave writing blocked until a successful retry.
      if (request === capabilityReqRef.current && [404, 501].includes(error.response?.status)) setLegacyScheduleService(true);
    } finally {
      if (request === capabilityReqRef.current) { setCapabilityLoading(false); setCapabilityChecked(true); }
    }
  };

  const scheduleMode = Form.useWatch('scheduleMode', createForm) || 'single';
  // 班级时间（常规每周规则）预览与生成状态；requestId 由前端持有，网络重试复用同一标识。
  const weekDayTexts = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const pendingGenerateRef = useRef<{ requestId: string; payload: any; teacherId: string | undefined } | null>(null);
  const classRuleSummary = (rules: any[] | undefined | null) =>
    (rules || []).map(rule => `${weekDayTexts[rule.weekday] ?? '?'} ${rule.startTime}-${rule.endTime}${rule.classroom ? ` · ${rule.classroom}` : ''}`);

  const resetClassRulesPreview = () => {
    ++previewReqRef.current;
    setPreviewData(null);
    setPreviewError('');
    pendingGenerateRef.current = null;
  };

  const runClassRulesPreview = async () => {
    const req = ++previewReqRef.current;
    const values = createForm.getFieldsValue();
    setPreviewError('');
    if (!values.classId) { setPreviewError('请先选择班级'); return; }
    if (!values.dateRange?.[0] || !values.dateRange?.[1]) { setPreviewError('请选择排课起止日期'); return; }
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const payload = {
        classId: values.classId,
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        ...(effectiveSelectedRules?.length ? { selectedRules: effectiveSelectedRules } : {}),
      };
      const response = await api.post('/schedules/class-rules/preview', payload);
      if (req !== previewReqRef.current) return;
      // 预览成功即确定本次生成意图；确认生成复用同一 requestId，网络重试不会重复生成。
      pendingGenerateRef.current = {
        requestId: crypto.randomUUID(),
        payload,
        teacherId: values.teacherId ?? undefined,
      };
      setPreviewData(response.data);
    } catch (error: any) {
      if (req !== previewReqRef.current) return;
      pendingGenerateRef.current = null;
      setPreviewError(error.response?.data?.error?.message || error.response?.data?.message || error.message || '预览失败，请重试');
    } finally {
      if (req === previewReqRef.current) setPreviewLoading(false);
    }
  };

  const submitClassRulesGenerate = async () => {
    const values = createForm.getFieldsValue();
    const startDate = values.dateRange?.[0]?.format('YYYY-MM-DD');
    const endDate = values.dateRange?.[1]?.format('YYYY-MM-DD');
    const selection = effectiveSelectedRules?.length ? effectiveSelectedRules : undefined;
    if (selectedClass?.weeklyRules?.length && !selection?.length) { setCreateError('请至少勾选一个要生成的时段'); return false; }
    const sameSelection = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const existing = pendingGenerateRef.current;
    // 2026-11-07 用户拍板：预览非必经步骤。未预览或班级/日期/时段与预览不一致时，直接以表单当前内容生成；
    // 冲突（如老师同时段已排课）由服务端在事务中校验并整批拒绝，前端弹框明确告知原因。
    const intent = existing && existing.payload.classId === values.classId && existing.payload.startDate === startDate && existing.payload.endDate === endDate && sameSelection(existing.payload.selectedRules, selection)
      ? existing
      : values.classId && startDate && endDate
        ? { requestId: crypto.randomUUID(), payload: { classId: values.classId, startDate, endDate, ...(selection ? { selectedRules: selection } : {}) }, teacherId: values.teacherId ?? undefined }
        : null;
    if (!intent) { setCreateError(!values.classId ? '请先选择班级' : '请选择排课起止日期'); return false; }
    const currentTeacherId = values.teacherId ?? undefined;
    // 老师改变属于新意图：换新的请求标识重新提交，服务端按新批次处理。
    const requestId = currentTeacherId === intent.teacherId ? intent.requestId : crypto.randomUUID();
    pendingGenerateRef.current = { ...intent, requestId, teacherId: currentTeacherId };
    const response = await api.post('/schedules/class-rules/generate', {
      ...intent.payload,
      requestId,
      expectedClassUpdatedAt: previewData?.class?.updatedAt ?? classes.find((c: any) => c.id === intent.payload.classId)?.updatedAt,
      teacherId: currentTeacherId,
    });
    return response.data ?? true;
  };

  const closeCreateSchedule = () => {
    if (createBusyRef.current) return;
    ++capabilityReqRef.current; ++teachersReqRef.current; ++previewReqRef.current;
    setCreateOpen(false);
  };
  const openCreateSchedule = async () => {
    setCreateError('');
    setScheduleServiceReady(false);
    setLegacyScheduleService(false);
    setCapabilityChecked(false);
    resetClassRulesPreview();
    createForm.resetFields();
    // 主路径：按班级时间预览生成；旧班级可补充规则后再生成，或改用单次排课。
    createForm.setFieldValue('scheduleMode', 'classRules');
    try {
      const response = await api.get('/classes', { params: { pageSize: 1000 } });
      if (!Array.isArray(response.data)) throw new Error('班级数据格式异常，请重试');
      setClasses(response.data);
      setCreateOpen(true);
      void checkScheduleCapability(response.data);
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || '加载班级失败，请重试');
    }
  };
  const submitCreateSchedule = async (values: any) => {
    if (createBusyRef.current) return;
    if ((!scheduleServiceReady && !legacyScheduleService) || capabilityLoading) { setCreateError('无法确认排课服务版本，请重试检查服务'); return; }
    if (scheduleServiceReady && (teachersLoading || teachersError || !scheduleTeachers.some(t => t.id === values.teacherId))) {
      setCreateError('请加载老师列表并选择有效的授课老师');
      return;
    }
    const startClock = values.lessonTime?.[0]?.format('HH:mm');
    const endClock = values.lessonTime?.[1]?.format('HH:mm');
    if (scheduleServiceReady && values.scheduleMode !== 'classRules' && (!startClock || !endClock || endClock <= startClock)) { setCreateError('每次结束时间须晚于开始时间，不支持跨午夜排课'); return; }
    if (legacyScheduleService && (!values.legacyTime?.[0] || !values.legacyTime?.[1] || values.legacyTime[1].valueOf() <= values.legacyTime[0].valueOf())) { setCreateError('结束时间须晚于开始时间'); return; }
    createBusyRef.current = true;
    setCreating(true);
    setCreateError('');
    const common = { classId: values.classId, teacherId: values.teacherId };
    try {
      if (legacyScheduleService) {
        const resp: any = await api.post('/schedules', { classId: values.classId, startTime: dayjs.tz(values.legacyTime[0].format('YYYY-MM-DD HH:mm:ss'), 'Asia/Shanghai').toISOString(), endTime: dayjs.tz(values.legacyTime[1].format('YYYY-MM-DD HH:mm:ss'), 'Asia/Shanghai').toISOString(), classroom: values.classroom });
        message.success(resp?.message || '排课已保存');
      } else if (values.scheduleMode === 'classRules') {
        const generated = await submitClassRulesGenerate();
        if (!generated) return;
        if (generated !== true) {
          const { count, createdCount, reusedCount, replayed, coexisting, coexistingTotal } = generated;
          if (replayed) message.info(`此前排课请求已处理：共 ${count} 场，请核对课表`);
          else if (reusedCount > 0) message.success(`排课完成：新建 ${createdCount} 场，${reusedCount} 场与现有排课完全重复，已跳过（未重复创建）`);
          else message.success(`排课完成：共生成 ${count} 场`);
          // 2026-11-07 用户拍板的重复提示三档：①完全相同→弹"重复排课"；②该时间点已有其他课（含已停课班级占的时间）→弹提醒不拦；③同老师/同教室→服务端 409 拦截弹错。
          if (!replayed && reusedCount > 0 && createdCount === 0) {
            Modal.warning({ title: '重复排课', content: `所选时段已存在完全相同的 ${reusedCount} 场课，本次未新建任何场次（防重复设计，未重复创建）。`, width: 520 });
          }
          if (!replayed && coexisting?.length) {
            const noteText = (n: any) => `${dayjs.tz(n.startTime, 'Asia/Shanghai').format('MM-DD HH:mm')} 「${n.className}」老师：${n.teacherName || '—'}` +
              (n.classStatus !== 'active' ? '（该班已整体停课）' : n.sessionStatus === 'class_paused' ? '（该时段已停课）' : '');
            Modal.warning({
              title: '该时间点已有一节课（老师/教室不冲突，已照常排课）',
              width: 560,
              content: (
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {coexisting.map((n: any) => <div key={n.scheduleId} style={{ padding: '2px 0' }}>· {noteText(n)}</div>)}
                  {(coexistingTotal || 0) > coexisting.length ? <div style={{ color: '#888', marginTop: 4 }}>…等共 {coexistingTotal} 条</div> : null}
                </div>
              ),
            });
          }
        }
        resetClassRulesPreview();
      } else {
        const date = values.lessonDate.format('YYYY-MM-DD');
        const resp: any = await api.post('/schedules', { ...common, startTime: dayjs.tz(`${date} ${startClock}`, 'Asia/Shanghai').toISOString(), endTime: dayjs.tz(`${date} ${endClock}`, 'Asia/Shanghai').toISOString(), classroom: values.classroom });
        message.success(resp?.message || '排课已保存');
      }
      setCreateOpen(false);
      createForm.resetFields();
      await fetchWeekSchedules();
    } catch (error: any) {
      const reason = error.response?.data?.error?.message || error.response?.data?.message || '新增失败，表单已保留，请检查后重试';
      setCreateError(reason);
      // 2026-11-07 用户拍板：失败必须弹框明确告知原因（如老师同时段冲突），不做静默处理。
      Modal.error({ title: '新增排课失败', content: reason, width: 520 });
    } finally {
      createBusyRef.current = false;
      setCreating(false);
    }
  };

  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<Dayjs>(dayjs());
  const [weekSchedules, setWeekSchedules] = useState<Record<number, Schedule[]>>({
    1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] // 周一到周日
  });
  const [batchAttendanceVisible, setBatchAttendanceVisible] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [classStudents, setClassStudents] = useState<AttendanceStudent[]>([]);
  const [temporarySearchOpen, setTemporarySearchOpen] = useState(false);
  const [temporaryQuery, setTemporaryQuery] = useState('');
  const [temporaryCandidates, setTemporaryCandidates] = useState<AttendanceStudent[]>([]);
  const [temporarySearching, setTemporarySearching] = useState(false);
  const [temporarySearched, setTemporarySearched] = useState(false);
  const [temporarySearchError, setTemporarySearchError] = useState('');
  const temporaryReqRef = useRef(0);
  const [studentAttendance, setStudentAttendance] = useState<Record<string, string>>({});
  /** 打开名单时已保存在服务端的状态：提交只发与它不同的学员，避免覆盖他人刚做的更正 */
  const [sourceChoices, setSourceChoices] = useState<Record<string, LessonSource>>({});
  const selectedSource = (student: AttendanceStudent) => sourceChoices[student.id] ?? student.lessonSource ?? 'paid';
  const [originalAttendance, setOriginalAttendance] = useState<Record<string, string>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [, setBatchStatus] = useState<string>('present');

  // 请求代际守卫：快速切换周/场次时丢弃过期响应，防止旧请求覆盖新数据
  const weekReqRef = useRef(0);
  const rosterReqRef = useRef(0);

  const weekDays = [
    { key: 1, label: '周一', date: currentWeek.startOf('isoWeek') },
    { key: 2, label: '周二', date: currentWeek.startOf('isoWeek').add(1, 'day') },
    { key: 3, label: '周三', date: currentWeek.startOf('isoWeek').add(2, 'day') },
    { key: 4, label: '周四', date: currentWeek.startOf('isoWeek').add(3, 'day') },
    { key: 5, label: '周五', date: currentWeek.startOf('isoWeek').add(4, 'day') },
    { key: 6, label: '周六', date: currentWeek.startOf('isoWeek').add(5, 'day') },
    { key: 0, label: '周日', date: currentWeek.startOf('isoWeek').add(6, 'day') },
  ];

  useEffect(() => {
    fetchWeekSchedules();
  }, [currentWeek]);

  const fetchWeekSchedules = async () => {
    const req = ++weekReqRef.current;
    setLoading(true);
    try {
      setLoadError('');
      const grouped: Record<number, Schedule[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
      for (let page = 1; ; page++) {
        const response: any = await api.get('/schedules', { params: { startDate: currentWeek.startOf('isoWeek').format('YYYY-MM-DD'), endDate: currentWeek.endOf('isoWeek').format('YYYY-MM-DD'), page, pageSize: 100 } });
        if (req !== weekReqRef.current) return; // 已切换到其他周，丢弃本次结果
        const rows = response.data || [];
        rows.forEach((row: any) => grouped[dayjs(row.startTime).tz('Asia/Shanghai').day()].push({ ...row, className: row.class?.name || '-', classCode: row.class?.code || '-', teacherName: row.teacher?.name || '-', courseName: row.course?.name || row.class?.courseType || '未设置', courseBound: !!row.course?.name, studentCount: row.studentCount || 0 }));
        if (rows.length < 100) break;
      }
      setWeekSchedules(grouped);
    } catch (error: any) {
      if (req !== weekReqRef.current) return;
      console.error('获取排课失败:', error);
      setWeekSchedules({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] });
      setLoadError(error.response?.data?.message || '获取排课失败，请重试');
    } finally {
      if (req === weekReqRef.current) setLoading(false);
    }
  };

  const handlePrevWeek = () => {
    setCurrentWeek(currentWeek.subtract(1, 'week'));
  };

  const handleNextWeek = () => {
    setCurrentWeek(currentWeek.add(1, 'week'));
  };

  const handleToday = () => {
    setCurrentWeek(dayjs());
  };

  // 打开批量划课模态框
  // 2026-11-07 用户反馈补齐：当天代课没有入口。批量划课弹窗内可换"本次授课老师"——
  // PUT /schedules/:id 仅改本场次老师（后端做在职校验 + 新老师该时段冲突检查），班级负责老师不受影响。
  const applySubstituteTeacher = async (teacherId: string) => {
    if (!selectedSchedule || teacherId === selectedSchedule.teacherId || teacherBusyRef.current || submitBusyRef.current) return;
    const scheduleId = selectedSchedule.id;
    const req = rosterReqRef.current;
    teacherBusyRef.current = true;
    setSavingTeacher(true);
    try {
      await api.put(`/schedules/${scheduleId}`, { teacherId });
      if (req !== rosterReqRef.current) return;
      const name = scheduleTeachers.find(t => t.id === teacherId)?.name || '已更新';
      setSelectedSchedule(prev => prev?.id === scheduleId ? { ...prev, teacherId, teacherName: name } : prev);
      message.success(`已更换本次授课老师：${name}（仅本场次，代课）`);
      void fetchWeekSchedules();
    } catch (error: any) {
      if (req === rosterReqRef.current) message.error(error.response?.data?.error?.message || error.message || '更换代课老师失败，请重试');
    } finally {
      teacherBusyRef.current = false;
      setSavingTeacher(false);
    }
  };

  const handleBatchAttendance = async (schedule: Schedule) => {
    const req = ++rosterReqRef.current;
    resetTemporarySearch();
    setSelectedSchedule(schedule);
    setDraftTeacherId(schedule.teacherId);
    setBatchAttendanceVisible(true);
    // 代课老师选择需要老师列表；有管理权限者打开弹窗时顺带加载。
    if (canManageSchedules) void loadScheduleTeachers();
    setCheckedIds(new Set());
    setClassStudents([]);
    setStudentAttendance({});
    setSourceChoices({});
    setOriginalAttendance({});
    setRosterLoading(true);
    setRosterError('');

    try {
      const response = await api.get(`/schedules/${encodeURIComponent(schedule.id)}/roster`);
      if (req !== rosterReqRef.current) return;
      if (!Array.isArray(response.data?.students)) throw new Error('场次名单格式异常，请重试');
      const students: AttendanceStudent[] = Array.from(new Map<string, AttendanceStudent>(response.data.students.map((student: AttendanceStudent) => [student.id, student])).values());
      const initialStatus: Record<string, string> = {};
      students.forEach((student: any) => { initialStatus[student.id] = student.attendanceStatus || 'none'; });
      setClassStudents(students);
      setStudentAttendance(initialStatus);
      setOriginalAttendance(initialStatus);
      setBatchStatus('present');
    } catch (error: any) {
      if (req !== rosterReqRef.current) return;
      console.error('获取学员名单失败:', error);
      setRosterError(error.response?.data?.error?.message || error.response?.data?.message || error.message || '获取场次名单失败，请重试');
    } finally {
      if (req === rosterReqRef.current) setRosterLoading(false);
    }
  };

  const resetTemporarySearch = () => {
    temporaryReqRef.current++;
    setTemporarySearchOpen(false);
    setTemporaryQuery('');
    setTemporaryCandidates([]);
    setTemporarySearching(false);
    setTemporarySearched(false);
    setTemporarySearchError('');
  };

  const searchTemporaryStudents = async (query: string) => {
    const req = ++temporaryReqRef.current;
    const name = query.trim();
    setTemporaryCandidates([]);
    setTemporarySearchError('');
    setTemporarySearched(false);
    if (!name || !selectedSchedule) { setTemporarySearching(false); return; }
    setTemporarySearching(true);
    try {
      const response = await api.get(`/schedules/${encodeURIComponent(selectedSchedule.id)}/temporary-students`, { params: { q: name } });
      if (req !== temporaryReqRef.current) return;
      if (!Array.isArray(response.data)) throw new Error('查找结果格式异常，请重试');
      setTemporaryCandidates(Array.from(new Map<string, AttendanceStudent>(response.data.map((student: AttendanceStudent) => [student.id, student])).values()));
      setTemporarySearched(true);
    } catch (error: any) {
      if (req !== temporaryReqRef.current) return;
      setTemporarySearchError(error.response?.data?.error?.message || error.response?.data?.message || error.message || '查找失败，请重试');
    } finally {
      if (req === temporaryReqRef.current) setTemporarySearching(false);
    }
  };

  const addTemporaryStudent = (student: AttendanceStudent) => {
    if (submitting || rosterLoading || rosterError || student.isEnrolled || student.isTemporary || classStudents.some(st => st.id === student.id)) return;
    setClassStudents(prev => prev.some(st => st.id === student.id) ? prev : [...prev, { ...student, isTemporary: true, pendingTemporary: true }]);
    setStudentAttendance(prev => ({ ...prev, [student.id]: 'none' }));
  };

  const removePendingTemporaryStudent = (studentId: string) => {
    if (submitting) return;
    setClassStudents(prev => prev.filter(st => st.id !== studentId || !st.pendingTemporary));
    setStudentAttendance(prev => { const next = { ...prev }; delete next[studentId]; return next; });
    setSourceChoices(prev => { const next = { ...prev }; delete next[studentId]; return next; });
    setCheckedIds(prev => { const next = new Set(prev); next.delete(studentId); return next; });
  };

  // A signed-in teacher arrives from today's actual occurrence, including substitute assignments.
  useEffect(() => {
    if (!requestedScheduleId) return;
    const request = ++deepReqRef.current;
    let cancelled = false;
    setDeepError('');
    api.get(`/schedules/${encodeURIComponent(requestedScheduleId)}`).then(async response => {
      if (cancelled || request !== deepReqRef.current) return;
      const row = response.data;
      const schedule = { ...row, className: row.class?.name || '-', classCode: row.class?.code || '-', teacherName: row.teacher?.name || '-', courseName: row.course?.name || row.class?.courseType || '未设置', courseBound: !!row.course?.name, studentCount: row.studentCount || 0 };
      setCurrentWeek(dayjs(row.startTime).tz('Asia/Shanghai'));
      await handleBatchAttendance(schedule);
    }).catch((error:any) => {
      if (!cancelled && request === deepReqRef.current) setDeepError(error.response?.data?.message || '无法打开该场次，请确认授课权限后重试');
    });
    return () => { cancelled = true; deepReqRef.current++; rosterReqRef.current++; };
  }, [requestedScheduleId, deepRetry, user?.id]);
  useEffect(() => () => { weekReqRef.current++; rosterReqRef.current++; temporaryReqRef.current++; teachersReqRef.current++; capabilityReqRef.current++; }, []);

  /** 名单多选：勾选后出现式操作栏（对选中者批量设状态；清空选择；未选学员状态保持） */
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const batchSetChecked = (status: string) => {
    setStudentAttendance((prev) => {
      const next = { ...prev };
      checkedIds.forEach((id) => { next[id] = status; });
      return next;
    });
  };

  // 全量操作：出勤=全员设为出勤；reset=恢复打开时的已保存状态（撤销本次全部修改）
  const handleBatchSetStatus = (status: 'present' | 'reset') => {
    setBatchStatus(status);
    if (status === 'reset') {
      setStudentAttendance(originalAttendance);
      setSourceChoices({});
      setClassStudents(prev => prev.filter(student => !student.pendingTemporary));
      setCheckedIds(new Set());
      return;
    }
    setStudentAttendance((prev) => {
      const next = { ...prev };
      classStudents.forEach((st: any) => { next[st.id] = 'present'; });
      return next;
    });
  };

  /** 该状态是否计为已扣课 1 节（与服务端 net 口径一致；历史 makeUp 视同已扣） */
  const wantedNet = (status?: string) => (['present', 'late', 'makeUp'].includes(status || '') ? 1 : 0);

  const sourceChanged = (student: AttendanceStudent) =>
    !!wantedNet(studentAttendance[student.id]) && selectedSource(student) !== (student.lessonSource ?? 'paid');
  const dirtyEntries = classStudents
    .filter(student => {
      const status = studentAttendance[student.id];
      return status && status !== 'none' && (status !== (originalAttendance[student.id] ?? 'none') || sourceChanged(student));
    })
    .map(student => ({
      student, studentId: student.id, status: studentAttendance[student.id],
      lessonSource: wantedNet(studentAttendance[student.id]) ? selectedSource(student) : student.lessonSource ?? 'paid',
    }));

  const submitPreview = (() => {
    const counts: Record<string, number> = { present: 0, late: 0, leave: 0, absent: 0 };
    let deduct = 0, refund = 0;
    const insufficient: string[] = [];
    for (const { student, status, lessonSource } of dirtyEntries) {
      if (counts[status] !== undefined) counts[status]++;
      const before = wantedNet(originalAttendance[student.id]);
      const after = wantedNet(status);
      const switched = before === 1 && after === 1 && sourceChanged(student);
      if ((after && !before) || switched) {
        deduct++;
        const balance = readLessonBalance(student);
        if (!balance || availableLessons(balance, lessonSource) < 1) {
          const reason = !balance ? '余额待核' : lessonSource === 'gift' ? '赠课不足' : '付费课不足';
          insufficient.push(`${student.name}（${reason}）`);
        }
      }
      if ((before && !after) || switched) refund++;
    }
    return { counts, willSubmit: dirtyEntries.length, deduct, refund, insufficient };
  })();

  // 只提交本次修改；临时串课显式标记，由服务端按本场次保存，不创建正式报名。
  const handleBatchAttendanceSubmit = async () => {
    if (!selectedSchedule || submitBusyRef.current || teacherBusyRef.current || rosterLoading || rosterError) return;
    if (draftTeacherId && draftTeacherId !== selectedSchedule.teacherId) {
      message.info('请先确认更换老师，或将选择恢复为当前老师，再提交点名');
      return;
    }
    if (!dirtyEntries.length) { message.info('没有需要提交的变更（未修改或设为跳过的学员不会重复提交）'); return; }

    const req = rosterReqRef.current;
    submitBusyRef.current = true;
    setSubmitting(true);
    try {
      const response = await api.post('/attendances/batch', {
        scheduleId: selectedSchedule.id,
        entries: dirtyEntries.map(({ student, studentId, status, lessonSource }) => ({ studentId, status, lessonSource, ...(student.isTemporary ? { temporary: true } : {}) })),
      });
      if (req !== rosterReqRef.current) return; // 弹窗已切换，丢弃过期结果
      const results = response.data?.results as (LessonBalance & { studentId: string; remainingLessons: number; deducted: number; lessonSource: LessonSource | null })[] | undefined;
      if (!Array.isArray(results) || dirtyEntries.some(entry => !results.some(r => r.studentId === entry.studentId))) {
        throw new Error('保存结果不完整，请重新打开名单核对');
      }
      const byId = new Map(results.map(result => [result.studentId, result]));
      setClassStudents(prev => prev.map(student => {
        const saved = byId.get(student.id);
        return saved ? { ...student, ...saved, attendanceStatus: dirtyEntries.find(e => e.studentId === student.id)?.status || student.attendanceStatus, pendingTemporary: false } : student;
      }));
      setSourceChoices(prev => {
        const next = { ...prev };
        results.forEach(result => { delete next[result.studentId]; });
        return next;
      });
      setStudentAttendance(prev => { const next = { ...prev }; dirtyEntries.forEach(({studentId,status}) => { next[studentId] = status; }); return next; });
      setOriginalAttendance((prev) => { const next = { ...prev }; dirtyEntries.forEach(({ studentId, status }) => { next[studentId] = status; }); return next; });
      const deducted = results.filter(r => r.deducted > 0).length;
      const refunded = results.filter(r => r.deducted < 0).length;
      const unchanged = results.length - deducted - refunded;
      message.success(`已保存 ${results.length} 人：扣课 ${deducted}，返还 ${refunded}，总课时不变 ${unchanged}`);
      await fetchWeekSchedules();
    } catch (error: any) {
      if (req === rosterReqRef.current) message.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || '保存失败，选择已保留，请重试');
    } finally {
      submitBusyRef.current = false;
      setSubmitting(false);
    }
  };

  const renderScheduleStatus = (schedule: Schedule) => {
    const date = dayjs(schedule.startTime).tz('Asia/Shanghai');
    const today = dayjs().tz('Asia/Shanghai').startOf('day');
    const isPast = date.isBefore(today, 'day');
    const isToday = date.isSame(today, 'day');
    const text = schedule.status === 'cancelled' ? '已取消' : schedule.status === 'rescheduled' ? '已调课' : isPast ? '已过' : isToday ? '今天' : '待上课';
    const tone = schedule.status === 'cancelled' ? 'tone-mute' : schedule.status === 'rescheduled' ? 'tone-warn' : isPast ? 'tone-mute' : 'tone-acc';
    return <span className={`bz-tag ${tone}`}>{text}</span>;
  };

  const renderScheduleCard = (schedule: Schedule) => {
    const scheduleDate = dayjs(schedule.startTime).tz('Asia/Shanghai');
    const today = dayjs().tz('Asia/Shanghai').startOf('day');
    const isToday = scheduleDate.isSame(today, 'day');
    // 2026-11-07 用户拍板：日历卡片只留 时间/班级名/授课老师，其余详情（课程类型、班级代码、人数）进"批量划课"弹窗。

    return (
      <Card
        key={schedule.id}
        className="teaching-session-card"
        size="small"
        style={{
          marginBottom: 8,
          borderColor: isToday ? 'var(--acc-strong)' : undefined,
          minWidth: 0,
        }}
        hoverable
        styles={{ body: { padding: '6px 8px' } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
            <Clock size={14} style={{ marginRight: 4 }} />
            {dayjs(schedule.startTime).tz('Asia/Shanghai').format('HH:mm')}-{dayjs(schedule.endTime).tz('Asia/Shanghai').format('HH:mm')}
          </span>
          {renderScheduleStatus(schedule)}
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${schedule.className}（${schedule.classCode}）`}>
          {schedule.className}
        </div>
        <div style={{ fontSize: 12, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`授课老师：${schedule.teacherName || '未指派'}`}>
          <UserRound size={14} style={{ marginRight: 4 }} />
          {schedule.teacherName || '未指派'}
        </div>
        <Button
          type="link"
          size="small"
          icon={<CircleCheck size={14} />}
          style={{ padding: 0, height: 22, marginTop: 4, fontSize: 12 }}
          disabled={['cancelled','rescheduled'].includes(schedule.status)} onClick={() => handleBatchAttendance(schedule)}
        >
          批量划课
        </Button>
      </Card>
    );
  };

  const renderDayColumn = (day: typeof weekDays[0]) => {
    const schedules = weekSchedules[day.key] || [];
    const isToday = day.date.isSame(dayjs(), 'day');

    return (
      <Card
        key={day.key}
        className="teaching-day-card"
        size="small"
        title={
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <div style={{
              fontSize: 14,
              fontWeight: isToday ? 600 : 400,
              color: isToday ? 'var(--acc-strong)' : 'inherit'
            }}>
              {day.label}
            </div>
            <div style={{
              fontSize: 12,
              color: isToday ? 'var(--acc-strong)' : 'var(--tx3)',
              fontWeight: 400
            }}>
              {day.date.format('MM-DD')}
            </div>
          </div>
        }
        style={{
          height: '100%',
          minWidth: 0,
        }}
        styles={{
          header: {
            backgroundColor: isToday ? 'var(--acc-bg)' : 'var(--card2)',
            borderBottom: isToday ? '2px solid var(--acc)' : '1px solid var(--line)',
            padding: '8px 12px',
            minHeight: 'auto',
          },
          body: {
            padding: 8,
            maxHeight: 'calc(calc(var(--ui-vh, 1vh) * 100) - 250px)',
            overflowY: 'auto',
          },
        }}
      >
        {schedules.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--tx3)', 
            padding: '20px 0',
            fontSize: 12
          }}>
            暂无排课
          </div>
        ) : (
          schedules.map(schedule => renderScheduleCard(schedule))
        )}
        <div style={{ 
          textAlign: 'center', 
          marginTop: 8, 
          fontSize: 12, 
          color: 'var(--tx3)' 
        }}>
          共 {schedules.length} 节课
        </div>
      </Card>
    );
  };

  const renderListView = () => {
    const columns = [
      {
        title: '日期',
        dataIndex: 'startTime',
        key: 'date',
        width: 100,
        render: (time: string) => (
          <div>
            <div>{dayjs(time).tz('Asia/Shanghai').format('MM-DD')}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)' }}>
              {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs(time).tz('Asia/Shanghai').day()]}
            </div>
          </div>
        ),
      },
      {
        title: '时间',
        key: 'time',
        width: 155,
        render: (_: any, record: Schedule) => (
          <div>
            <Clock size={14} style={{ marginRight: 4 }} />
            {dayjs(record.startTime).tz('Asia/Shanghai').format('HH:mm')} - {dayjs(record.endTime).tz('Asia/Shanghai').format('HH:mm')}
          </div>
        ),
      },
      {
        title: '班级',
        key: 'class',
        width: 250,
        render: (_: any, record: Schedule) => (
          <div>
            <div>{record.className}</div>
            <div style={{ fontSize: 12 }}>{record.courseBound ? `课程类型：${record.courseName}` : `课程类型未记录（班级当前：${record.courseName}）`}</div>
            <div style={{ fontSize: 12, color: 'var(--tx3)' }}>{record.classCode}</div>
          </div>
        ),
      },
      {
        title: '老师',
        dataIndex: 'teacherName',
        key: 'teacher',
        width: 100,
      },
      {
        title: '学员',
        dataIndex: 'studentCount',
        key: 'studentCount',
        width: 80,
        render: (count: number) => `${count}人`,
      },
      {
        title: '状态',
        key: 'status',
        width: 90,
        render: (_: any, record: Schedule) => renderScheduleStatus(record),
      },
      {
        title: '操作',
        key: 'action',
        width: 110,
        fixed: 'right' as const,
        className: 'bz-cell-act',
        render: (_: any, record: Schedule) => {

          if (['cancelled','rescheduled'].includes(record.status)) {
            return <span style={{ color: 'var(--tx3)' }}>-</span>;
          }

          return (
            <Button
              className="teaching-primary-action"
              size="small"
              icon={<CircleCheck size={14} />}
              onClick={() => handleBatchAttendance(record)}
            >
              划课
            </Button>
          );
        },
      },
    ];

    const allSchedules = Object.values(weekSchedules)
      .flat()
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

    return (
      <div className="bz-table-wrap teaching-table-shell" data-testid="weekly-list-table">
      <Table
        columns={columns}
        dataSource={allSchedules}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 900 }}
        tableLayout="fixed"
      />
      </div>
    );
  };

  const totalSchedules = Object.values(weekSchedules).reduce(
    (sum, schedules) => sum + schedules.length,
    0
  );

  return (
    <div className="cfs-page teaching-page" data-testid="teaching-weekly">
      <div className="biz-page-head teaching-heading">
        <div className="biz-head-copy"><h1>{canManageSchedules ? '每周排课' : '我的课表'}</h1><p>{canManageSchedules ? '按周查看与调整课程场次，点击场次进入签到。' : '仅显示本人授课场次，含已指派给您的代课；选择场次点名。'}</p></div>
        <Space wrap className="teaching-week-controls">
          {canManageSchedules && <Button type="primary" onClick={openCreateSchedule}>新增排课</Button>}
          <Button onClick={handlePrevWeek}>上一周</Button>
          <Button onClick={handleToday}>本周</Button>
          <Button onClick={handleNextWeek}>下一周</Button>
          <DatePicker
            value={currentWeek}
            onChange={(date) => date && setCurrentWeek(date)}
            picker="week"
            format="YYYY年 第WW周"
          />
        </Space>
      </div>

      <div className="biz-filter-row teaching-week-summary">
        <Space size="large" wrap>
          <div>
            <CalendarDays size={14} style={{ marginRight: 8, color: 'var(--acc-strong)' }} />
            <span style={{ fontWeight: 600 }}>
              {currentWeek.startOf('isoWeek').format('YYYY年MM月DD日')} - {currentWeek.endOf('isoWeek').format('MM月DD日')}
            </span>
          </div>
          <div>
            共 <span style={{ color: 'var(--acc-strong)', fontWeight: 600, fontSize: 14 }}>{totalSchedules}</span> 节课
          </div>
        </Space>
      </div>

      {loadError && <Alert type="error" message={loadError} action={<Button onClick={fetchWeekSchedules}>重试</Button>} />}
      {!loadError && !loading && totalSchedules === 0 && <Empty description="本周暂无排课" />}
      {deepError && <Alert type="error" message={deepError} style={{marginBottom:16}} action={<Button onClick={()=>setDeepRetry(value=>value+1)}>重试打开场次</Button>} />}
      <Modal title="新增排课" open={createOpen} width={680} confirmLoading={creating} okText={scheduleMode === 'classRules' && scheduleServiceReady ? '确认生成' : '保存'} okButtonProps={{ disabled: (!scheduleServiceReady && !legacyScheduleService) || capabilityLoading }} cancelButtonProps={{ disabled: creating }} closable={!creating} maskClosable={!creating} onCancel={closeCreateSchedule} onOk={() => createForm.submit()}>
        <Form form={createForm} layout="vertical" disabled={creating} initialValues={{ scheduleMode: 'single' }} onFinish={submitCreateSchedule} onFinishFailed={() => setCreateError('')} onValuesChange={() => setCreateError('')}>
          <Alert type="info" message={scheduleServiceReady ? "时间均按北京时间（Asia/Shanghai，UTC+8）填写；每周排课包含起止日期当天。" : "时间均按北京时间（Asia/Shanghai，UTC+8）填写。"} style={{ marginBottom: 16 }} />
          {capabilityLoading && <Alert type="info" message="正在检查排课服务版本…" style={{ marginBottom: 16 }} />}
          {legacyScheduleService && <Alert type="warning" message="新版排课尚未启用，当前使用原有单次排课" style={{ marginBottom: 16 }} />}
          {capabilityChecked && !scheduleServiceReady && !legacyScheduleService && <Alert type="error" message="无法确认排课服务版本，请重试检查服务" action={<Button onClick={() => checkScheduleCapability()}>重试检查服务</Button>} style={{ marginBottom: 16 }} />}
          {createError && <Alert type="error" message={createError} description="表单已保留，请调整后重试。" style={{ marginBottom: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} />}
          <Form.Item name="classId" label="班级" extra={selectedClass ? `课程类型：${selectedClass.courseType || '未设置'} / 负责老师：${selectedClass.teacher?.name || scheduleTeachers.find(t => t.id === defaultTeacherId)?.name || '未设置'}` : undefined} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder="搜索并选择班级" onChange={(classId: string) => { const chosenClass = classes.find(c => c.id === classId); const teacherId = chosenClass?.teacherId || chosenClass?.teacher?.id; createForm.setFieldValue('teacherId', scheduleTeachers.some(t => t.id === teacherId) ? teacherId : undefined); setSelectedRuleKeys((chosenClass?.weeklyRules || []).map(ruleKey)); resetClassRulesPreview(); }} options={classes.map(c => ({ value: c.id, label: c.name }))} /></Form.Item>
          {scheduleServiceReady && <>
          {teachersError && <Alert type="error" message={teachersError} action={<Button onClick={() => loadScheduleTeachers()}>重试加载老师</Button>} />}
          {!teachersLoading && !teachersError && scheduleTeachers.length === 0 && <Alert type="warning" message="暂无可选授课老师，请先维护机构教师资料后重试" action={<Button onClick={() => loadScheduleTeachers()}>重试加载老师</Button>} />}
          {selectedClass && !teachersLoading && !teachersError && scheduleTeachers.length > 0 && !scheduleTeachers.some(t => t.id === defaultTeacherId) && <Alert type="warning" message="该班级未设置可用的负责老师，请手动选择本次授课老师" />}
          <Form.Item name="teacherId" label="本次授课老师" extra="选择班级后默认班级负责老师；代课时可选择其他老师，仅用于本次排课。" rules={[{ required: true, message: '请选择本次授课老师' }, { validator: (_, value) => !teachersLoading && !teachersError && scheduleTeachers.some(t => t.id === value) ? Promise.resolve() : Promise.reject(new Error('请加载老师列表并选择有效的授课老师')) }]}>
            <Select showSearch optionFilterProp="label" loading={teachersLoading} disabled={creating || teachersLoading || !!teachersError || scheduleTeachers.length === 0} placeholder="请选择授课老师" options={scheduleTeachers.map(t => ({ value: t.id, label: t.name }))} />
          </Form.Item>
          <Form.Item name="scheduleMode" label="排课方式"><Radio.Group options={[{ label: '按班级时间生成', value: 'classRules' }, { label: '单次排课', value: 'single' }]} /></Form.Item>
          {scheduleMode === 'classRules' ? <>
            {(() => {
              const rules = classRuleSummary(selectedClass?.weeklyRules);
              if (!selectedClass) return <Alert type="info" message="先选择班级，将自动使用该班的班级时间。" style={{ marginBottom: 12 }} />;
              if (!rules.length) return <Alert type="warning" message="该班级还没有班级时间" description="请先到「班级管理」编辑该班，添加每周上课时间后再来生成；或改用单次排课。" style={{ marginBottom: 12 }} />;
              return <>
                <Alert type="info" message={`将使用该班的班级时间：${rules.join('；')}`} description="选择排课起止日期后即可直接生成；预览场次为可选步骤，想先核对时再点。" style={{ marginBottom: 12 }} />
                {(selectedClass.weeklyRules || []).length > 1 && (
                  <Form.Item label="本次生成的时段" style={{ marginBottom: 12 }} extra="多时段班级可只勾选部分时段生成；停课/复课也支持按时段操作。">
                    <Checkbox.Group
                      value={selectedRuleKeys}
                      onChange={(keys: any[]) => { setSelectedRuleKeys(keys); resetClassRulesPreview(); }}
                      options={(selectedClass.weeklyRules || []).map((rule: any, index: number) => ({ value: ruleKey(rule), label: rules[index] }))}
                    />
                  </Form.Item>
                )}
              </>;
            })()}
            <Form.Item name="dateRange" label="排课起止日期" extra="包含结束日；按班级时间的星期与时间生成，已过去的日期不会生成。" rules={[{ required: true, message: '请选择排课起止日期' }, { validator: (_, value) => { if (!value?.[0] || !value?.[1]) return Promise.resolve(); const span = value[1].startOf('day').diff(value[0].startOf('day'), 'day'); if (span < 0) return Promise.reject(new Error('结束日期不得早于开始日期')); if (span > 366) return Promise.reject(new Error('排课起止日期跨度最多366天，请缩短日期范围')); return Promise.resolve(); } }]}>
              <DatePicker.RangePicker format="YYYY-MM-DD" onChange={() => resetClassRulesPreview()} />
            </Form.Item>
            <Button onClick={() => void runClassRulesPreview()} loading={previewLoading} disabled={creating || !selectedClass || !classRuleSummary(selectedClass?.weeklyRules).length}>预览场次</Button>
            {previewError && <Alert type="error" message={previewError} style={{ marginTop: 8 }} />}
            {previewData && (
              <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
                <div style={{ marginBottom: 6, fontSize: 14 }}>
                  共 <b>{previewData.occurrences?.length ?? 0}</b> 场
                  {!!previewData.skippedPast && <span style={{ color: 'var(--tx2)' }}>；已跳过过去日期 {previewData.skippedPast} 场</span>}
                  {!!previewData.conflicts?.length && <span style={{ color: 'var(--bad)', fontWeight: 600 }}>；存在 {previewData.conflicts.length} 场冲突</span>}
                </div>
                {!!previewData.conflicts?.length && (
                  <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                    message="以下场次与现有课程冲突，处理后再生成"
                    description={<div style={{ maxHeight: 120, overflowY: 'auto' }}>{previewData.conflicts.map((row: any) => <div key={`${row.businessDate}-${row.startTime}-${row.withName}`}>{row.businessDate}（{weekDayTexts[row.weekday]}）{dayjs(row.startTime).tz('Asia/Shanghai').format('HH:mm')} 与{row.kind}{row.withName}已有场次重叠</div>)}</div>}
                  />
                )}
                <Table
                  size="small"
                  rowKey={(row: any) => `${row.businessDate}-${row.startTime}`}
                  pagination={false}
                  dataSource={previewData.occurrences || []}
                  scroll={{ y: 220 }}
                  columns={[
                    { title: '日期', dataIndex: 'businessDate', width: 110, render: (value: string, row: any) => `${value}（${weekDayTexts[row.weekday]}）` },
                    { title: '时间', key: 'time', width: 120, render: (_: any, row: any) => `${dayjs(row.startTime).tz('Asia/Shanghai').format('HH:mm')}-${dayjs(row.endTime).tz('Asia/Shanghai').format('HH:mm')}` },
                    { title: '地点', dataIndex: 'classroom', render: (value: string) => value || '-' },
                  ]}
                />
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--tx2)' }}>确认后将一次生成以上全部场次；任一场次冲突时整批不保存。</p>
              </div>
            )}
          </> : <>
            <Form.Item name="lessonDate" label="上课日期" required rules={[{ validator: (_, date?: Dayjs) => {
              // Invalid typed text can coexist with the picker's last committed date.
              const text = lessonDatePicker.current?.nativeElement.querySelector('input')?.value;
              if (!date || (text !== undefined && text !== date.format('YYYY-MM-DD'))) {
                return Promise.reject(new Error('请输入有效的上课日期（YYYY-MM-DD）'));
              }
              return Promise.resolve();
            } }]}><DatePicker ref={lessonDatePicker} format="YYYY-MM-DD" preserveInvalidOnBlur /></Form.Item>
            <Form.Item name="lessonTime" label="上课起止时间" extra="当天结束时间须晚于开始时间。" rules={[{ required: true, message: '请选择上课起止时间' }, { validator: (_, value) => !value || value[1]?.format('HH:mm') > value[0]?.format('HH:mm') ? Promise.resolve() : Promise.reject(new Error('结束时间须晚于开始时间，不支持跨午夜排课')) }]}><TimePicker.RangePicker format="HH:mm" order={false} /></Form.Item>
            <Form.Item name="classroom" label="教室"><Input /></Form.Item>
          </>}
          </>}
          {legacyScheduleService && <Form.Item name="legacyTime" label="上课起止时间" rules={[{ required: true, message: '请选择上课起止时间' }, { validator: (_, value) => !value || value[1]?.valueOf() > value[0]?.valueOf() ? Promise.resolve() : Promise.reject(new Error('结束时间须晚于开始时间')) }]}><DatePicker.RangePicker showTime /></Form.Item>}
        </Form>
      </Modal>
      <Spin spinning={loading}>
        <Tabs
          defaultActiveKey="calendar"
          items={[
            {
              key: 'calendar',
              label: '日历视图',
              children: (
                <div className="teaching-calendar" aria-label="每周排课日历" tabIndex={0} style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))',
                  gap: 8,
                  overflowX: 'auto',
                  paddingBottom: 8,
                }}>
                  {weekDays.map(day => renderDayColumn(day))}
                </div>
              ),
            },
            {
              key: 'list',
              label: '列表视图',
              children: renderListView(),
            },
          ]}
        />
      </Spin>

      {/* 批量划课模态框 */}
      <Modal
        title="本场次点名划课"
        className="attendance-dialog"
        open={batchAttendanceVisible}
        onCancel={() => {
          if (submitBusyRef.current || teacherBusyRef.current) return;
          const next=new URLSearchParams(searchParams);next.delete('scheduleId');setSearchParams(next,{replace:true});
          rosterReqRef.current += 1; // 使在途名单请求失效，防止关闭后回填旧数据
          resetTemporarySearch();
          setBatchAttendanceVisible(false);
          setSelectedSchedule(null);
          setDraftTeacherId(undefined);
          setClassStudents([]);
          setStudentAttendance({});
          setOriginalAttendance({});
        }}
        onOk={handleBatchAttendanceSubmit}
        okButtonProps={{ loading: submitting || savingTeacher, disabled: rosterLoading || Boolean(rosterError) || submitPreview.willSubmit === 0 || submitPreview.insufficient.length > 0 || draftTeacherId !== selectedSchedule?.teacherId }}
        cancelButtonProps={{ disabled: submitting || savingTeacher }}
        maskClosable={!submitting && !savingTeacher}
        closable={!submitting && !savingTeacher}
        width={780}
        okText="确认提交"
        cancelText="取消"
      >
        {selectedSchedule && (
          <div>
            <div style={{ 
              background: 'var(--card2)', 
              padding: 12, 
              borderRadius: 4, 
              marginBottom: 16 
            }}>
              <p style={{ margin: 0, marginBottom: 4 }}>
                <strong>{selectedSchedule.className} ({selectedSchedule.classCode})</strong>
              </p>
              <p style={{ margin: 0, marginBottom: 4 }}>
                时间：{dayjs(selectedSchedule.startTime).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm')} - {dayjs(selectedSchedule.endTime).tz('Asia/Shanghai').format('HH:mm')}
              </p>
              <p style={{ margin: 0, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  老师：{selectedSchedule.teacherName}
                  {(() => { const clsTeacher = (selectedSchedule as any).class?.teacherId; return clsTeacher && selectedSchedule.teacherId && selectedSchedule.teacherId !== clsTeacher ? <Tag color="orange" style={{ marginLeft: 6 }}>代课</Tag> : null; })()}
                </span>
                {canManageSchedules && !['cancelled','rescheduled'].includes(selectedSchedule.status) && (scheduleTeachers.length > 0 || teachersLoading) && (
                  <Space wrap>
                  <Select
                    aria-label="本次授课老师"
                    size="small"
                    showSearch
                    optionFilterProp="label"
                    style={{ minWidth: 150 }}
                    loading={teachersLoading}
                    disabled={submitting || savingTeacher}
                    value={draftTeacherId}
                    placeholder="指定代课老师（仅本场次）"
                    onChange={(value: string) => setDraftTeacherId(value)}
                    options={[
                      ...(!selectedSchedule.teacherId || scheduleTeachers.some(t => t.id === selectedSchedule.teacherId) ? [] : [{ value: selectedSchedule.teacherId, label: `${selectedSchedule.teacherName}（当前）` }]),
                      ...scheduleTeachers.map(t => ({ value: t.id, label: t.name })),
                    ]}
                  />
                  <Button size="small" loading={savingTeacher} disabled={submitting || !draftTeacherId || draftTeacherId === selectedSchedule.teacherId || !scheduleTeachers.some(t => t.id === draftTeacherId)} onClick={() => draftTeacherId && void applySubstituteTeacher(draftTeacherId)}>
                    确认更换老师
                  </Button>
                  <span style={{ color: 'var(--tx2)' }}>选择后须确认才保存，仅修改本场次老师；取消或退出不保存未确认的选择。</span>
                  </Space>
                )}
                <span>课程类型：{selectedSchedule.courseBound ? selectedSchedule.courseName : `未记录（班级当前：${selectedSchedule.courseName}）`}</span>
              </p>
              <p style={{ margin: 0 }}>报名人数：{selectedSchedule.studentCount} 人</p>
            </div>

            {rosterError && <Alert type="error" message={rosterError} style={{marginBottom:12}} action={<Button onClick={()=>void handleBatchAttendance(selectedSchedule)}>重试名单</Button>} />}
            <div style={{ marginBottom: 16 }}>
              <Button disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => setTemporarySearchOpen(open => !open)}>
                {temporarySearchOpen ? '收起临时串课查找' : '添加临时串课学员'}
              </Button>
              {temporarySearchOpen && (
                <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--line)', borderRadius: 8 }}>
                  <p style={{ margin: '0 0 10px', color: 'var(--tx2)', fontSize: 14 }}>仅加入本场次，不新增正式报名。添加后选择考勤状态，再点击「确认提交」；关闭弹窗不会保存未提交的学员。</p>
                  <Input.Search
                    aria-label="搜索临时串课学员姓名或手机号后四位"
                    placeholder="输入姓名或手机号后四位"
                    value={temporaryQuery}
                    disabled={submitting || rosterLoading || Boolean(rosterError)}
                    loading={temporarySearching}
                    enterButton="查找"
                    allowClear
                    onChange={event => {
                      temporaryReqRef.current++;
                      setTemporaryQuery(event.target.value);
                      setTemporaryCandidates([]);
                      setTemporarySearching(false);
                      setTemporarySearched(false);
                      setTemporarySearchError('');
                    }}
                    onSearch={value => void searchTemporaryStudents(value)}
                  />
                  {temporarySearchError && <Alert style={{ marginTop: 10 }} type="error" message={`查找失败：${temporarySearchError}`} action={<Button size="small" onClick={() => void searchTemporaryStudents(temporaryQuery)}>重试</Button>} />}
                  {!temporarySearching && !temporarySearchError && temporarySearched && temporaryCandidates.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到匹配学员，请调整姓名或手机号后四位重试" />}
                  {temporaryCandidates.map(student => {
                    const alreadyInRoster = student.isEnrolled || student.isTemporary || classStudents.some(st => st.id === student.id);
                    return (
                      <div key={student.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 10, borderTop: '1px solid var(--line)' }}>
                        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          <strong>{student.name}</strong>
                          <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>
                            手机尾号：{student.phoneLast4?.slice(-4) || '未登记'}
                            <span style={{ marginLeft: 8 }}>当前班级：{student.classNames?.join('、') || '暂无在读班级'}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--tx2)' }}>剩余 {student.remainingLessons ?? 0} 课时</div>
                        </div>
                        <Button size="small" disabled={submitting || Boolean(alreadyInRoster)} onClick={() => addTemporaryStudent(student)}>{alreadyInRoster ? '已在本场名单' : '添加到本场'}</Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {classStudents.some(student => student.pendingTemporary) && <Alert style={{ marginTop: 10 }} type="info" message={`已临时加入 ${classStudents.filter(student => student.pendingTemporary).length} 人，尚未保存；请选择考勤状态后提交，设为「跳过」不会保存。`} />}
            </div>
            <div className="attendance-dialog__tools">
              <Space>
                <span>勾选学员后批量设置，也可以逐人调整；未修改的学员不会重复提交。</span>
              </Space>
              <Space>
                <Button size="small" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => handleBatchSetStatus('present')}>全部出勤</Button>
                <Button size="small" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => handleBatchSetStatus('reset')}>恢复已保存状态</Button>
              </Space>
            </div>

            {/* 出现式操作栏：仅在勾选后出现 */}
            {checkedIds.size > 0 && (
              <div className="bz-selection-bar" role="toolbar" aria-label="批量设置选中学员状态">
                <span>已选 <strong>{checkedIds.size}</strong> 人</span>
                <Button size="small" type="primary" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => batchSetChecked('present')}>设为出勤</Button>
                <Button size="small" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => batchSetChecked('late')}>迟到</Button>
                <Button size="small" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => batchSetChecked('leave')}>请假</Button>
                <Button size="small" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => batchSetChecked('absent')}>缺勤</Button>
                <Button size="small" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => batchSetChecked('none')}>跳过</Button>
                <Button size="small" type="text" disabled={submitting || rosterLoading || Boolean(rosterError)} onClick={() => setCheckedIds(new Set())}>清空选择</Button>
              </div>
            )}

            {/* 提交预览：只统计本次修改的学员；净扣/返还按每人净变化估算，与服务端口径一致 */}
            <div style={{ marginBottom: 10, fontSize: 14, color: 'var(--tx2)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {submitPreview.willSubmit === 0 ? (
                <span>没有待提交的变更：未修改的学员不会重复提交，重复签到也不会重复扣课。</span>
              ) : (
                <>
                  <span>本次提交 <b style={{ color: 'var(--tx)' }}>{submitPreview.willSubmit}</b> 人：</span>
                  <span>出勤 <b style={{ color: 'var(--tx)' }}>{submitPreview.counts.present}</b></span>
                  <span>迟到 <b style={{ color: 'var(--tx)' }}>{submitPreview.counts.late}</b></span>
                  <span>请假 <b style={{ color: 'var(--tx)' }}>{submitPreview.counts.leave}</b></span>
                  <span>缺勤 <b style={{ color: 'var(--tx)' }}>{submitPreview.counts.absent}</b></span>
                  {submitPreview.deduct > 0 && <span>预计扣课 <b style={{ color: 'var(--bad)' }}>{submitPreview.deduct}</b> 课时</span>}
                  {submitPreview.refund > 0 && <span>预计返还 <b style={{ color: 'var(--ok)' }}>{submitPreview.refund}</b> 课时</span>}
                  {submitPreview.deduct === 0 && submitPreview.refund === 0 && <span>无课时变化（重复提交同样状态不扣课）</span>}
                </>
              )}
            </div>
            {submitPreview.insufficient.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 10 }}
                message={`以下学员剩余课时不足本次扣课，整批将无法保存：${submitPreview.insufficient.join('、')}`}
                description="请检查所选课时来源，或将该学员设为跳过。余额待核时可重新打开名单。"
              />
            )}

            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              名单（仅提交本次修改的学员；"跳过"与未修改的学员不提交）：
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <Table
                size="small"
                dataSource={classStudents}
                rowKey="id"
                pagination={false}
                loading={rosterLoading}
                scroll={{ x: 600 }}
                rowSelection={{
                  selectedRowKeys: Array.from(checkedIds),
                  getCheckboxProps: () => ({disabled: submitting || rosterLoading || Boolean(rosterError)}),
                  onChange: (keys) => setCheckedIds(new Set(keys as string[])),
                  columnWidth: 36,
                }}
                columns={[
                  {
                    title: '学员姓名',
                    dataIndex: 'name',
                    key: 'name',
                    render: (name: string, record: any) => (
                      <div>
                        <span style={{ color: (studentAttendance[record.id] || 'none') === 'none' ? 'var(--tx3)' : 'inherit' }}>{name}</span>
                        {record.isTemporary && <div style={{ marginTop: 3 }}><Tag color="purple">临时串课</Tag></div>}
                        {record.pendingTemporary && <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} disabled={submitting} onClick={() => removePendingTemporaryStudent(record.id)}>移出本场</Button>}
                      </div>
                    ),
                  },
                  {
                    title: '手机号',
                    dataIndex: 'phone',
                    key: 'phone',
                  },
                  {
                    title: '课时来源 / 可用余额',
                    key: 'lessonSource',
                    render: (_, student: AttendanceStudent) => {
                      const balance = readLessonBalance(student);
                      const source = selectedSource(student);
                      const sameGift = student.lessonSource === 'gift' && wantedNet(originalAttendance[student.id]);
                      return <Space direction="vertical" size={2}>
                        <Select<LessonSource> aria-label={student.name + '课时来源'} size="small" value={source}
                          disabled={submitting || ['leave', 'absent'].includes(studentAttendance[student.id])}
                          onChange={value => setSourceChoices(prev => ({ ...prev, [student.id]: value }))}
                          options={[{ label: '付费课', value: 'paid' }, { label: '赠课（0 元）', value: 'gift', disabled: !sameGift && (!balance || balance.giftRemainingLessons < 1) }]} />
                        <small style={{ color: 'var(--tx3)' }}>{lessonBalanceText(balance)}</small>
                      </Space>;
                    },
                  },
                  {
                    title: '考勤状态',
                    key: 'attendance',
                    render: (_: any, record: any) => {
                      const st = studentAttendance[record.id] || 'none';
                      const orig = originalAttendance[record.id] ?? 'none';
                      const dirty = st !== orig || sourceChanged(record);
                      return (
                        <Space size={6}>
                          <Select
                            value={st}
                            disabled={submitting || rosterLoading || Boolean(rosterError)}
                            onChange={(value) => {
                              setStudentAttendance(prev => ({
                                ...prev,
                                [record.id]: value,
                              }));
                            }}
                            style={{ width: 96 }}
                            size="small"
                          >
                            <Select.Option value="present">出勤</Select.Option>
                            <Select.Option value="late">迟到</Select.Option>
                            <Select.Option value="leave">请假</Select.Option>
                            <Select.Option value="absent">缺勤</Select.Option>
                            <Select.Option value="none">跳过</Select.Option>
                          </Select>
                          {dirty && st !== 'none' && <Tag color="processing">待提交</Tag>}
                          {!dirty && orig !== 'none' && <Tag>已保存</Tag>}
                        </Space>
                      );
                    },
                  },
                ]}
              />
            </div>

            <div style={{ marginTop: 16, padding: 12, background: 'var(--warn-bg)', borderRadius: 4 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--tx2)', fontWeight: 600 }}>
                划课规则：
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--tx2)' }}>
                1. 可在任意日期对课程进行划课
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--tx2)' }}>
                2. 同一场次重复提交不会重复扣课，更正状态会同步返还或补扣
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--tx2)' }}>
                3. 状态设为「跳过」的学员本次不划课、不建记录
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--tx2)' }}>
                4. 出勤、迟到扣 1 节，付费课按购买批次先进先出，赠课金额为 0 元。更换来源或取消扣课时原路返还。
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--tx2)' }}>
                5. 任一学员课时不足时整批不保存，请调整名单或续费
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WeeklySchedule;
