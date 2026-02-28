import { useState, useEffect } from 'react';
import { Table, Button, Input, Space, Modal, Form, message, Tag, Select, DatePicker, InputNumber, Alert, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SwapOutlined, SearchOutlined, ReloadOutlined, MinusCircleOutlined, PlusCircleOutlined, DownloadOutlined, UserAddOutlined, ImportOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';
import api from '../services/api';
import dayjs from 'dayjs';
import ImportModal from '../components/ImportModal';

const { Search } = Input;
const { RangePicker } = DatePicker;

const Students = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferForm] = Form.useForm();
  const [studentsList, setStudentsList] = useState([]);
  const [classesList, setClassesList] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [currentClass, setCurrentClass] = useState<any>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [deductLessonModalVisible, setDeductLessonModalVisible] = useState(false);
  const [deductLessonForm] = Form.useForm();
  const [deductLessonStudent, setDeductLessonStudent] = useState<any>(null);
  const [addLessonModalVisible, setAddLessonModalVisible] = useState(false);
  const [addLessonForm] = Form.useForm();
  const [addLessonStudent, setAddLessonStudent] = useState<any>(null);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [lessonLogs, setLessonLogs] = useState<any[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logPagination, setLogPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [logDateRange, setLogDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [logFilters, setLogFilters] = useState<{ type?: string }>({});
  const [showUnscheduledOnly, setShowUnscheduledOnly] = useState(false);
  const { user } = useAuthStore();

  // 创建家长账号选项（新增学员时）
  const [createParentAccount, setCreateParentAccount] = useState(false);

  // 为已有学员创建家长账号相关状态
  const [parentAccountModalVisible, setParentAccountModalVisible] = useState(false);
  const [parentAccountForm] = Form.useForm();
  const [parentAccountStudent, setParentAccountStudent] = useState<any>(null);

  // 从成单信息导入相关状态
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [conversionsList, setConversionsList] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [selectedConversion, setSelectedConversion] = useState<any>(null);

  // 批量导入相关状态
  const [batchImportModalVisible, setBatchImportModalVisible] = useState(false);

  // 权限检查
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageStudents = normalizedRole === 'admin' || normalizedRole === 'manager';

  // 权限检查：允许 admin、manager、sales、teacher、coach 角色访问
  const allowedRoles = ['admin', 'manager', 'sales', 'teacher', 'coach'];
  if (!user || !allowedRoles.includes(user.role)) {
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

  useEffect(() => {
    fetchStudents();
  }, [pagination.current, pagination.pageSize, showUnscheduledOnly]);

  useEffect(() => {
    if (transferModalVisible) {
      fetchAllStudents();
      fetchClasses();
    }
  }, [transferModalVisible]);

  const fetchStudents = async (keyword?: string) => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };

      // 如果有搜索关键词
      if (keyword !== undefined ? keyword : searchKeyword) {
        params.search = keyword !== undefined ? keyword : searchKeyword;
      }

      // 如果筛选未排课学员
      if (showUnscheduledOnly) {
        params.unscheduledOnly = true;
      }

      console.log('[DEBUG fetchStudents] 请求参数:', params);
      // 通过后端 API 获取学员列表（绕过 RLS）
      const response = await api.get('/students', { params });
      console.log('[DEBUG fetchStudents] 返回数据:', response.data);
      console.log('[DEBUG fetchStudents] 第一个学员的 enrollments:', response.data?.[0]?.enrollments);

      setStudents(response.data || []);
      if (response.pagination) {
        setPagination({
          ...pagination,
          total: response.pagination.total || 0,
        });
      }
    } catch (error: any) {
      console.error('获取学员列表失败:', error);
      message.error(error.message || '获取学员列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchKeyword(value);
    setPagination({ ...pagination, current: 1 });
    fetchStudents(value);
  };

  const handleResetSearch = () => {
    setSearchKeyword('');
    setShowUnscheduledOnly(false);
    setPagination({ ...pagination, current: 1 });
    fetchStudents('');
  };

  const handleToggleUnscheduled = () => {
    setShowUnscheduledOnly(!showUnscheduledOnly);
    setPagination({ ...pagination, current: 1 });
  };

  const handleAdd = () => {
    setEditingStudent(null);
    form.resetFields();
    setCreateParentAccount(false); // 重置选项
    fetchClasses(); // 获取班级列表用于选择
    setModalVisible(true);
  };

  // 注意：新增学员功能在此页面，但真正的"新增学员"统计应从成单信息表中获取
  // 成单信息表的记录会自动创建学员，并标记 courseType != '续费'

  const handleEdit = (record: any) => {
    setEditingStudent(record);
    // 获取当前学员的班级ID
    const activeEnrollment = record.enrollments?.find((e: any) => e.status === 'active');
    const classId = activeEnrollment?.class?.id;

    form.setFieldsValue({
      ...record,
      classId: classId,
      birthDate: record.birthDate ? dayjs(record.birthDate) : null,
    });
    setCreateParentAccount(false); // 编辑时不创建家长账号
    fetchClasses(); // 获取班级列表用于选择
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该学员吗？',
      onOk: async () => {
        try {
          await api.delete(`/students/${id}`);
          message.success('删除成功');
          fetchStudents();
        } catch (error: any) {
          console.error('删除失败:', error);
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  const handleSubmit = async (values: any) => {
    try {
      const { user } = useAuthStore.getState();
      const { classId, birthDate, createParent, parentEmail, parentName, parentPassword, remainingLessons, totalLessonsPurchased, courseType, phone, refundDate, refundReason, ...restData } = values;

      // 处理出生日期格式
      const studentData = {
        ...restData,
        phone: phone || restData.contact, // 兼容成单信息导入
        birthDate: birthDate ? birthDate.format('YYYY-MM-DD') : null,
        // 编辑时：如果没有填写课时，保持原值；新增时：默认为0
        remainingLessons: editingStudent
          ? (remainingLessons !== undefined && remainingLessons !== null ? remainingLessons : editingStudent.remainingLessons)
          : (remainingLessons || 0),
      };

      if (editingStudent) {
        // 通过后端 API 更新学员信息（只传有值的字段，避免覆盖剩余课时）
        const updateData: any = {
          name: studentData.name,
          gender: studentData.gender,
          phone: studentData.phone,
          parentName: studentData.parentName,
          parentPhone: studentData.parentPhone,
          birthDate: studentData.birthDate,
          campusId: studentData.campusId,
          status: studentData.status,
        };
        // 处理退费相关字段
        if (studentData.status === 'refunded') {
          updateData.refundReason = refundReason || null;
          updateData.refundDate = refundDate ? (dayjs.isDayjs(refundDate) ? refundDate.format('YYYY-MM-DD') : refundDate) : dayjs().format('YYYY-MM-DD');
        } else {
          // 如果状态不是退费，清空退费信息
          updateData.refundReason = null;
          updateData.refundDate = null;
        }
        // 只有明确填写了课时才更新
        if (remainingLessons !== undefined && remainingLessons !== null) {
          updateData.remainingLessons = remainingLessons;
        }
        await api.put(`/students/${editingStudent.id}`, updateData);

        // 如果选择了班级，处理班级关联
        if (classId) {
          // 检查是否需要更新班级
          const currentEnrollment = editingStudent.enrollments?.find((e: any) => e.status === 'active');
          if (!currentEnrollment || currentEnrollment.class?.id !== classId) {
            // 需要更新班级
            if (currentEnrollment) {
              // 先取消原有班级
              await api.put(`/enrollments/${currentEnrollment.id}`, { status: 'cancelled' });
            }
            // 创建新的班级关联
            await api.post('/enrollments', {
              studentId: editingStudent.id,
              classId: classId,
              status: 'active',
            });
          }
        }
        message.success('更新成功');
      } else {
        // 通过后端 API 创建学员
        const newStudentData = {
          ...studentData,
          organizationId: user?.organizationId,
          status: 'active',
        };
        const response = await api.post('/students', newStudentData);
        const newStudent = response.data;

        // 如果选择了班级，创建班级关联
        if (classId && newStudent?.id) {
          await api.post('/enrollments', {
            studentId: newStudent.id,
            classId: classId,
            status: 'active',
          });
        }

        // 如果是从成单信息导入的，更新成单记录的 studentId
        if (selectedConversion && newStudent?.id) {
          try {
            // 通过后端 API 更新 conversions 表，关联学员ID（绕过 RLS）
            await api.put(`/conversions/${selectedConversion.id}`, {
              studentId: newStudent.id,
              studentName: newStudent.name,
            });
            message.info('成单信息已关联到学员');
          } catch (error) {
            console.error('更新成单信息失败:', error);
          }
          setSelectedConversion(null);
        }

        // 如果选择了创建家长账号，同时创建家长账号
        if (createParent && parentName && parentEmail) {
          try {
            const response = await api.post('/auth/create-parent', {
              email: parentEmail,
              password: parentPassword || undefined,
              name: parentName,
              phone: studentData.parentPhone || undefined,
              studentId: newStudent.id,
            });
            const defaultPassword = response.data?.defaultPassword || parentPassword || '123456';
            message.success(`学员创建成功！家长账号已创建，密码：${defaultPassword}`);
          } catch (parentError: any) {
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
      console.error('操作失败:', error);
      message.error(error.message || '操作失败');
    }
  };

  const fetchAllStudents = async () => {
    try {
      // 通过后端 API 获取所有学员（绕过 RLS）
      const response = await api.get('/students', { params: { pageSize: 1000 } });
      setStudentsList(response.data || []);
    } catch (error: any) {
      console.error('获取学员列表失败:', error);
      message.error(error.message || '获取学员列表失败');
    }
  };

  const fetchClasses = async () => {
    try {
      // 通过后端 API 获取班级列表（绕过 RLS）
      const response = await api.get('/classes', { params: { pageSize: 1000 } });
      setClassesList(response.data || []);
    } catch (error: any) {
      console.error('获取班级列表失败:', error);
      message.error(error.message || '获取班级列表失败');
    }
  };

  const handleTransfer = () => {
    setTransferModalVisible(true);
    transferForm.resetFields();
    setSelectedStudent(null);
    setCurrentClass(null);
  };

  const handleStudentSelect = async (studentId: string) => {
    try {
      const student = studentsList.find((s: any) => s.id === studentId);
      setSelectedStudent(student);

      // 通过后端 API 获取学员的当前班级
      const response = await api.get(`/enrollments`, {
        params: { studentId, status: 'active' }
      });
      const enrollment = response.data?.[0];

      if (enrollment && enrollment.class) {
        setCurrentClass(enrollment.class);
        transferForm.setFieldsValue({
          currentClassId: enrollment.class.id,
        });
      } else {
        setCurrentClass(null);
        transferForm.setFieldsValue({
          currentClassId: undefined,
        });
        message.warning('该学员没有活跃的班级报名记录');
      }
    } catch (error: any) {
      console.error('获取学员班级信息失败:', error);
      setCurrentClass(null);
    }
  };

  const handleTransferSubmit = async (values: any) => {
    try {
      if (!selectedStudent) {
        message.error('请选择学员');
        return;
      }

      if (!values.newClassId) {
        message.error('请选择新班级');
        return;
      }

      if (currentClass && values.newClassId === currentClass.id) {
        message.error('新班级不能与当前班级相同');
        return;
      }

      if (!currentClass) {
        message.error('未找到学员的当前班级');
        return;
      }

      // 通过后端 API 调班
      await api.post('/enrollments/transfer', {
        studentId: selectedStudent.id,
        fromClassId: currentClass.id,
        toClassId: values.newClassId
      });

      message.success('调班成功');
      setTransferModalVisible(false);
      transferForm.resetFields();
      setSelectedStudent(null);
      setCurrentClass(null);
      fetchStudents();
    } catch (error: any) {
      console.error('调班失败:', error);
      message.error(error.message || '调班失败');
    }
  };

  const handleDeductLessons = async (student: any) => {
    const remaining = student?.remainingLessons || 0;
    if (remaining <= 0) {
      message.warning('该学员剩余课时不足，无法划课');
      return;
    }

    // 获取学员的班级信息
    try {
      // 通过后端 API 获取学员详情（绕过 RLS）
      const response = await api.get(`/students/${student.id}`);
      const studentDetail = response.data;
      const activeEnrollments = studentDetail.enrollments?.filter((e: any) => e.status === 'active') || [];

      if (activeEnrollments.length === 0) {
        message.warning('该学员未报名任何班级，无法划课');
        return;
      }

      setDeductLessonStudent({ ...student, enrollments: activeEnrollments });
    deductLessonForm.resetFields();
      deductLessonForm.setFieldsValue({
        lessons: 1,
        attendanceStatus: 'present',
        date: dayjs(),
      });
    setDeductLessonModalVisible(true);
    } catch (error: any) {
      console.error('获取学员信息失败:', error);
      message.error('获取学员信息失败');
    }
  };

  const handleLessonSubmit = async (values: any) => {
    if (!deductLessonStudent) return;
    try {
      const classId = values.classId;
      const attendanceDate = values.date.format('YYYY-MM-DD');
      const attendanceStatus = values.attendanceStatus;
      const lessons = values.lessons || 0;

      // 查找当天该班级的排课
      const schedulesResponse = await api.get('/schedules', {
        params: { classId, date: attendanceDate, pageSize: 1 }
      });
      let schedule = schedulesResponse.data?.[0];

      // 如果没有排课记录，创建一个临时排课（用于手动划课）
      if (!schedule) {
        const newScheduleRes = await api.post('/schedules', {
          classId,
          startTime: `${attendanceDate}T00:00:00+08:00`,
          endTime: `${attendanceDate}T23:59:59+08:00`,
          status: 'completed',
          isRecurring: false,
          classroom: '手动划课',
        });
        schedule = newScheduleRes.data;
      }

      // 通过后端 API 进行划课（绕过 RLS）
      const response = await api.post('/lesson-logs/deduct', {
        studentId: deductLessonStudent.id,
        lessons,
        classId,
        scheduleId: schedule?.id,
        attendanceStatus,
        notes: values.notes || '手动划课',
      });

      const result = response.data;
      message.success(`${deductLessonStudent.name} 划课成功：${result.deducted} 节，剩余 ${result.currentRemaining} 节`);
      setDeductLessonModalVisible(false);
      setDeductLessonStudent(null);
      fetchStudents();
    } catch (error: any) {
      console.error('划课失败:', error);
      message.error(error.message || '划课失败');
    }
  };

  const handleAddLessons = (student: any) => {
    setAddLessonStudent(student);
    addLessonForm.resetFields();
    addLessonForm.setFieldsValue({ lessons: 1 });
    setAddLessonModalVisible(true);
  };

  const handleAddLessonSubmit = async (values: any) => {
    if (!addLessonStudent) return;
    try {
      const addition = values.lessons || 0;
      if (addition <= 0) {
        message.warning('请输入大于 0 的增课节数');
        return;
      }

      // 通过后端 API 增课（绕过 RLS）
      const response = await api.post('/lesson-logs/add', {
        studentId: addLessonStudent.id,
        lessons: addition,
        notes: values.notes || '后台增课',
      });

      const result = response.data;
      message.success(`${addLessonStudent.name} 增课 ${addition} 节，剩余 ${result.currentRemaining} 节`);
      setAddLessonModalVisible(false);
      setAddLessonStudent(null);
      fetchStudents();
    } catch (error: any) {
      console.error('增课失败:', error);
      message.error(error.message || '增课失败');
    }
  };

  const fetchLessonLogs = async (page = 1, pageSize = logPagination.pageSize, filters?: { type?: string }) => {
    setLogLoading(true);
    try {
      // 使用传入的filters或state中的logFilters
      const currentFilters = filters !== undefined ? filters : logFilters;

      // 构建日期范围
      const startDate = logDateRange?.[0]?.format('YYYY-MM-DD') || '2020-01-01';
      const endDate = logDateRange?.[1]?.format('YYYY-MM-DD') || dayjs().add(1, 'year').format('YYYY-MM-DD');

      console.log('📋 查询参数:', { page, pageSize, startDate, endDate, filters: currentFilters });

      // 1. 查询考勤记录（划课记录）- 通过后端 API
      const attendanceRecords: any[] = [];
      if (!currentFilters.type || currentFilters.type === 'deduct') {
        try {
          console.log('🔍 开始查询考勤记录:', { startDate, endDate });
          const attendancesResponse = await api.get('/attendances', {
            params: { startDate, endDate, pageSize: 1000 }
          });
          const attendancesResult = attendancesResponse.data || [];
          console.log('✅ 查询到考勤记录:', attendancesResult.length);

          attendancesResult.forEach((att: any) => {
            attendanceRecords.push({
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
          console.error('❌ 查询考勤记录失败:', err);
          // 继续执行，只是不显示考勤记录
        }
      }

      // 2. 查询课时变动记录（包括增课和手动划课）- 通过后端 API
      const lessonLogRecords: any[] = [];
      // 根据筛选条件查询不同类型的记录
      if (!currentFilters.type || currentFilters.type === 'add' || currentFilters.type === 'deduct') {
        try {
          const params: any = {
            page: 1,
            pageSize: 1000,
          };

          // 只有明确筛选时才传入type参数
          if (currentFilters.type) {
            params.type = currentFilters.type;
          }

          if (logDateRange?.[0]) {
            params.startDate = startDate;
          }
          if (logDateRange?.[1]) {
            params.endDate = endDate;
          }

          console.log('🔍 开始查询课时变动记录:', params);
          const lessonLogsResponse = await api.get('/lesson-logs', { params });
          lessonLogRecords.push(...(lessonLogsResponse.data || []));
          console.log('✅ 查询到课时变动记录:', lessonLogRecords.length);
        } catch (err) {
          console.error('❌ 查询课时变动记录失败:', err);
        }
      }

      // 3. 合并所有记录并排序
      // 注意：当筛选"划课"时，attendanceRecords包含考勤划课，lessonLogRecords包含手动划课
      // 当筛选"增课"时，只有lessonLogRecords包含增课记录
      // 当没有筛选时，显示所有记录
      const allRecords = [...attendanceRecords, ...lessonLogRecords].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      console.log('📊 合并后总记录数:', allRecords.length);

      // 4. 分页
      const total = allRecords.length;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedData = allRecords.slice(startIndex, endIndex);

      console.log('📄 分页信息:', {
        total,
        page,
        pageSize,
        startIndex,
        endIndex,
        paginatedDataLength: paginatedData.length
      });

      setLessonLogs(paginatedData);
      setLogPagination(prev => ({
        ...prev,
        total,
        current: page,
        pageSize,
      }));
    } catch (error: any) {
      console.error('获取划课记录失败:', error);
      message.error(error.message || '获取划课记录失败');
    } finally {
      setLogLoading(false);
    }
  };

  const handleOpenLogModal = () => {
    setLogModalVisible(true);
    setLogPagination(prev => ({ ...prev, current: 1 }));
    fetchLessonLogs(1, logPagination.pageSize);
  };

  const handleLogDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setLogDateRange(dates);
    setLogPagination(prev => ({ ...prev, current: 1 }));
    fetchLessonLogs(1, logPagination.pageSize);
  };

  const handleLogTypeChange = (value: string) => {
    const newFilters = { type: value || undefined };
    setLogFilters(newFilters);
    setLogPagination(prev => ({ ...prev, current: 1 }));
    // 立即使用新的筛选条件获取数据，避免状态异步更新问题
    fetchLessonLogs(1, logPagination.pageSize, newFilters);
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
  const handleOpenImportModal = async () => {
    setImportModalVisible(true);
    setImportLoading(true);
    try {
      // 通过后端 API 获取未关联学员的成单信息（绕过 RLS）
      const response = await api.get('/conversions', {
        params: { unlinkedOnly: true, pageSize: 100 }
      });
      setConversionsList(response.data || []);
    } catch (error: any) {
      console.error('获取成单信息失败:', error);
      message.error('获取成单信息失败');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConversion = async (conversion: any) => {
    try {
      setSelectedConversion(conversion);
      // 将成单信息填充到表单
      form.setFieldsValue({
        name: conversion.studentName,
        gender: conversion.gender,
        phone: conversion.contact,
        parentPhone: conversion.contact,
        parentName: conversion.parentName,
        address: conversion.address,
        // 课时信息
        remainingLessons: conversion.totalLessons || 0,
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
      parentName: student.parentName || '',
    });
    setParentAccountModalVisible(true);
  };

  const handleParentAccountSubmit = async (values: any) => {
    try {
      const { email, password, name, parentPhone } = values;

      // 调用创建家长账号API
      const response = await api.post('/auth/create-parent', {
        email: email || undefined,
        password: password || undefined,
        name,
        phone: parentPhone,
        studentId: parentAccountStudent.id,
      });

      const defaultPassword = response.data?.defaultPassword || password || '123456';
      message.success(`家长账号创建成功！密码：${defaultPassword}`);
      setParentAccountModalVisible(false);
      parentAccountForm.resetFields();
      setParentAccountStudent(null);
    } catch (error: any) {
      console.error('创建家长账号失败:', error);
      const errorMsg = error.response?.data?.error?.message || error.message || '创建家长账号失败';
      message.error(errorMsg);
    }
  };

  // 导出全部学员数据
  const handleExportAllStudents = async () => {
    try {
      message.loading('正在导出全部学员数据...', 0);

      // 通过后端 API 获取所有学员数据（绕过 RLS）
      const response = await api.get('/students', {
        params: { pageSize: 10000 }
      });

      const allStudents = response.data || [];

      if (allStudents.length === 0) {
        message.destroy();
        message.warning('没有学员数据可导出');
        return;
      }

      // 构建 CSV 内容
      const headers = ['姓名', '性别', '电话', '家长电话', '剩余课时', '累计课时', '所属班级', '负责教练', '状态', '备注'];
      const csvContent = [
        headers.join(','),
        ...allStudents.map((student: any) => {
          // 获取活跃的班级和教练信息
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
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      render: (gender: string) => (gender === 'M' ? '男' : gender === 'F' ? '女' : '-'),
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '课时',
      key: 'lessons',
      render: (_: any, record: any) => {
        const remaining = record.remainingLessons ?? 0;
        const total = record.totalLessonsPurchased ?? 0;
        return (
          <div>
            <div>
              剩余 <strong>{remaining}</strong> 节
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>
              累计 {total} 节
            </div>
          </div>
        );
      },
    },
    {
      title: '负责教练',
      key: 'teacher',
      render: (_: any, record: any) => {
        // 从活跃的报名记录中获取教练信息
        if (!record.enrollments || record.enrollments.length === 0) {
          return '-';
        }
        const activeEnrollment = record.enrollments.find((e: any) => e.status === 'active');
        if (!activeEnrollment || !activeEnrollment.class) {
          return '-';
        }
        const teacherName = activeEnrollment.class.teacher?.name;
        return teacherName || '-';
      },
    },
    {
      title: '所属班级',
      key: 'class',
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
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          active: 'green',
          inactive: 'red',
          graduated: 'blue',
          refunded: 'orange',
        };
        const statusText = status === 'active' ? '活跃' : status === 'inactive' ? '非活跃' : status === 'graduated' ? '已毕业' : status === 'refunded' ? '退费' : '-';
        return <Tag color={colorMap[status]}>{statusText}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space wrap>
          {canManageStudents && (
            <Button type="link" icon={<PlusCircleOutlined />} onClick={() => handleAddLessons(record)}>
              增课
            </Button>
          )}
          <Button type="link" icon={<MinusCircleOutlined />} onClick={() => handleDeductLessons(record)}>
            划课
          </Button>
          {canManageStudents && (
            <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
              编辑
            </Button>
          )}
          {canManageStudents && (
            <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
              删除
            </Button>
          )}
          {canManageStudents && record.parentPhone && (
            <Button type="link" icon={<UserAddOutlined />} onClick={() => handleOpenParentAccountModal(record)}>
              创建家长账号
            </Button>
          )}
        </Space>
      ),
      width: 340,
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
      render: (type: string) => (
        <Tag color={type === 'add' ? 'green' : 'volcano'}>
          {type === 'add' ? '增课' : '划课'}
        </Tag>
      ),
    },
    {
      title: '班级',
      dataIndex: 'className',
      key: 'className',
      width: 130,
      render: (text: string, record: any) => {
        if (record.type === 'deduct' && text) {
          return text;
        }
        return record.notes || '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string, record: any) => {
        if (record.type === 'add') return '-';
        return status === 'present' ? (
          <Tag color="success">出勤</Tag>
        ) : (
          <Tag color="default">缺勤</Tag>
        );
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
      render: (notes: string, record: any) => {
        if (record.type === 'deduct') return '-';
        return notes || '-';
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

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>学员管理</h1>
        <Space>
          <Button
            type="default"
            icon={<DownloadOutlined />}
            onClick={handleExportAllStudents}
            style={{ color: '#52c41a', borderColor: '#52c41a' }}
          >
            导出全部学员
          </Button>
          <Button type="default" icon={<PlusCircleOutlined />} onClick={handleOpenLogModal}>
            划课记录
          </Button>
          {canManageStudents && (
            <Button type="primary" icon={<SwapOutlined />} onClick={handleTransfer}>
              调班
            </Button>
          )}
          {canManageStudents && (
            <Button type="default" icon={<ImportOutlined />} onClick={handleOpenImportModal}>
              从成单信息导入
            </Button>
          )}
          {canManageStudents && (
            <Button icon={<FileExcelOutlined />} onClick={() => setBatchImportModalVisible(true)}>
              批量导入
            </Button>
          )}
          {canManageStudents && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增学员
            </Button>
          )}
        </Space>
      </div>

      {/* 搜索栏 */}
      <div style={{ marginBottom: 16, background: '#fafafa', padding: 16, borderRadius: 8 }}>
        <Space size="middle" wrap>
          <Search
            placeholder="搜索学员姓名/电话/家长电话"
            allowClear
            enterButton={<><SearchOutlined /> 搜索</>}
            style={{ width: 350 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onSearch={handleSearch}
          />
          <Button 
            type={showUnscheduledOnly ? 'primary' : 'default'}
            onClick={handleToggleUnscheduled}
          >
            {showUnscheduledOnly ? '显示全部学员' : '仅显示未排课学员'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleResetSearch}>
            重置
          </Button>
          {(searchKeyword || showUnscheduledOnly) && (
            <span style={{ color: '#666' }}>
              {searchKeyword && <>搜索: <strong>{searchKeyword}</strong></>}
              {searchKeyword && showUnscheduledOnly && ' | '}
              {showUnscheduledOnly && <Tag color="blue">未排课学员</Tag>}
            </span>
          )}
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={students}
        loading={loading}
        rowKey="id"
        pagination={{
          ...pagination,
          onChange: (page, pageSize) => {
            setPagination({ ...pagination, current: page, pageSize });
          },
        }}
      />
      <Modal
        title="划课记录"
        open={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        footer={null}
        width={1100}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
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
            <Select.Option value="add">增课</Select.Option>
            <Select.Option value="deduct">划课</Select.Option>
          </Select>
          <Button
            onClick={() => {
              setLogDateRange(null);
              setLogFilters({});
              fetchLessonLogs(1, logPagination.pageSize);
            }}
          >
            重置筛选
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportLogs}
          >
            导出Excel
          </Button>
        </div>
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
      <Modal
        title={`划课 - ${deductLessonStudent?.name || ''}`}
        open={deductLessonModalVisible}
        onCancel={() => {
          setDeductLessonModalVisible(false);
          setDeductLessonStudent(null);
        }}
        onOk={() => deductLessonForm.submit()}
        width={520}
      >
        <Form form={deductLessonForm} onFinish={handleLessonSubmit} layout="vertical">
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f5ff', borderRadius: 8 }}>
            <div style={{ fontSize: 14 }}>
              当前剩余课时：<strong style={{ color: '#1890ff', fontSize: 16 }}>{deductLessonStudent?.remainingLessons ?? 0} 节</strong>
          </div>
          </div>
          
          <Form.Item
            name="classId"
            label="选择班级"
            rules={[{ required: true, message: '请选择班级' }]}
          >
            <Select placeholder="请选择上课班级">
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
            />
          </Form.Item>

          <Form.Item
            name="attendanceStatus"
            label="出勤状态"
            rules={[{ required: true, message: '请选择出勤状态' }]}
          >
            <Select placeholder="请选择出勤状态">
              <Select.Option value="present">✅ 出勤</Select.Option>
              <Select.Option value="absent">❌ 缺勤</Select.Option>
              <Select.Option value="leave">🏥 请假</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="lessons"
            label="划课节数"
            rules={[{ required: true, message: '请输入划课节数' }]}
          >
            <InputNumber
              min={1}
              max={deductLessonStudent?.remainingLessons || undefined}
              style={{ width: '100%' }}
              placeholder="请输入本次划课节数"
            />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="选填，如：补课、调课等" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`增课 - ${addLessonStudent?.name || ''}`}
        open={addLessonModalVisible}
        onCancel={() => {
          setAddLessonModalVisible(false);
          setAddLessonStudent(null);
        }}
        onOk={() => addLessonForm.submit()}
        width={420}
      >
        <Form form={addLessonForm} onFinish={handleAddLessonSubmit} layout="vertical">
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            当前剩余课时：<strong>{addLessonStudent?.remainingLessons ?? 0} 节</strong>
          </div>
          <Form.Item
            name="lessons"
            label="增课节数"
            rules={[{ required: true, message: '请输入增课节数' }]}
          >
            <InputNumber
              min={1}
              style={{ width: '100%' }}
              placeholder="请输入本次增课节数"
            />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="例如赠课/转介绍赠送" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingStudent ? '编辑学员' : '新增学员'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入学员姓名' }]}>
            <Input placeholder="请输入学员姓名" />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Select placeholder="请选择性别" allowClear>
              <Select.Option value="M">男</Select.Option>
              <Select.Option value="F">女</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="birthDate" label="出生日期">
            <DatePicker 
              format="YYYY-MM-DD" 
              style={{ width: '100%' }} 
              placeholder="选择出生日期"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>
          <Form.Item name="parentPhone" label="家长电话">
            <Input placeholder="请输入家长电话" />
          </Form.Item>

          {/* 班级与教练员设置区域 */}
          <div style={{ background: '#f6ffed', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #b7eb8f' }}>
            <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#52c41a' }}>
              📚 班级与教练员设置
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
              选择班级后，该班级的负责教练将自动成为学员的负责教练员
            </div>
            
            {/* 显示当前负责教练（编辑模式） */}
            {editingStudent && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff', borderRadius: 4 }}>
                <span style={{ color: '#666' }}>当前负责教练：</span>
                <strong style={{ color: '#1890ff' }}>
                  {(() => {
                    const activeEnrollment = editingStudent.enrollments?.find((e: any) => e.status === 'active');
                    return activeEnrollment?.class?.teacher?.name || '未分配';
                  })()}
                </strong>
              </div>
            )}

            <Form.Item 
              name="classId" 
              label="所属班级" 
              style={{ marginBottom: 0 }}
              extra="选择班级即可关联对应的负责教练员，更换班级将同时更换负责教练"
            >
              <Select
                placeholder="请选择所属班级"
                allowClear
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                options={classesList
                  .filter((cls: any) => cls.status === 'active')
                  .map((cls: any) => ({
                    label: `${cls.name} (${cls.code}) - 教练: ${cls.teacher?.name || '未分配'}`,
                    value: cls.id,
                  }))}
              />
          </Form.Item>
          </div>

          {/* 课时登记 - 仅新增学员时显示 */}
          {!editingStudent && (
            <div style={{ background: '#fff7e6', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #ffd591' }}>
              <div style={{ marginBottom: 12, fontWeight: 'bold', color: '#fa8c16' }}>
                💰 课时登记
              </div>
              <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
                新报名或续费时，填入新增课时数
              </div>

              <Form.Item
                name="remainingLessons"
                label="新增课时"
                style={{ marginBottom: 0 }}
                initialValue={0}
              >
                <InputNumber
                  min={0}
                  placeholder="新增课时"
                  style={{ width: '100%' }}
                  addonAfter="节"
                />
              </Form.Item>
            </div>
          )}

          {editingStudent && (
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择状态">
                <Select.Option value="active">活跃</Select.Option>
                <Select.Option value="inactive">非活跃</Select.Option>
                <Select.Option value="graduated">已毕业</Select.Option>
                <Select.Option value="refunded">退费</Select.Option>
              </Select>
            </Form.Item>
          )}

          {/* 退费信息 - 当状态为退费时显示 */}
          {editingStudent && (
            <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.status !== currentValues.status}>
              {({ getFieldValue }) => {
                const status = getFieldValue('status');
                if (status === 'refunded') {
                  return (
                    <div style={{ background: '#fff7e6', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #ffd591' }}>
                      <div style={{ marginBottom: 12, fontWeight: 'bold', color: '#fa8c16' }}>
                        退费信息
                      </div>
                      <Form.Item name="refundReason" label="退费原因">
                        <Input.TextArea rows={2} placeholder="请输入退费原因" />
                      </Form.Item>
                      <Form.Item name="refundDate" label="退费日期" initialValue={dayjs()}>
                        <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                      </Form.Item>
                    </div>
                  );
                }
                return null;
              }}
            </Form.Item>
          )}

          {/* 家长账号设置 - 仅新增学员时显示 */}
          {!editingStudent && (
            <div style={{ background: '#e6f7ff', padding: 16, borderRadius: 8, marginBottom: 16, border: '1px solid #91d5ff' }}>
              <div style={{ marginBottom: 12, fontWeight: 'bold', color: '#1890ff' }}>
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
                    message="创建家长账号后，家长可以使用手机号登录系统，查看学员的课表、出勤记录和缴费信息。"
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                  />

                  <Form.Item
                    name="parentName"
                    label="家长姓名"
                    rules={createParentAccount ? [{ required: true, message: '请输入家长姓名' }] : []}
                  >
                    <Input placeholder="请输入家长姓名" />
                  </Form.Item>

                  <Form.Item
                    name="parentEmail"
                    label="家长邮箱"
                    rules={createParentAccount ? [
                      { required: true, message: '请输入家长邮箱' },
                      { type: 'email', message: '请输入有效的邮箱地址' },
                    ] : []}
                  >
                    <Input placeholder="请输入家长邮箱（用于登录）" />
                  </Form.Item>

                  <Form.Item
                    name="parentPassword"
                    label="登录密码"
                    extra="留空则使用默认密码 123456"
                  >
                    <Input.Password placeholder="留空使用默认密码 123456" />
                  </Form.Item>
                </>
              )}
            </div>
          )}
        </Form>
      </Modal>

      <Modal
        title="调班"
        open={transferModalVisible}
        onCancel={() => {
          setTransferModalVisible(false);
          transferForm.resetFields();
          setSelectedStudent(null);
          setCurrentClass(null);
        }}
        onOk={() => transferForm.submit()}
        width={600}
      >
        <Form form={transferForm} onFinish={handleTransferSubmit} layout="vertical">
          <Form.Item name="studentId" label="学员姓名" rules={[{ required: true, message: '请选择学员' }]}>
            <Select
              placeholder="请输入或选择学员姓名"
              showSearch
              filterOption={(input, option: any) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={handleStudentSelect}
              options={studentsList.map((student: any) => ({
                label: student.name,
                value: student.id,
              }))}
            />
          </Form.Item>

          {currentClass && (
            <Form.Item label="当前班级">
              <Input value={currentClass.name} disabled />
            </Form.Item>
          )}

          <Form.Item name="newClassId" label="调整到班级" rules={[{ required: true, message: '请选择新班级' }]}>
            <Select
              placeholder="请选择新班级"
              showSearch
              filterOption={(input, option: any) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={classesList
                .filter((cls: any) => cls.status === 'active' && (!currentClass || cls.id !== currentClass.id))
                .map((cls: any) => ({
                  label: `${cls.name} (${cls.code}) - 教练: ${cls.teacher?.name || '未分配'}`,
                  value: cls.id,
                }))}
            />
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="请输入调班备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 从成单信息导入 Modal */}
      <Modal
        title="从成单信息导入学员"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
        width={900}
      >
        <Alert
          message="选择成单信息导入，导入后成单信息会与学员关联（不会删除原成单记录）"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
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
              render: (price: number) => price ? `¥${price}` : '-',
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
          pagination={false}
          locale={{
            emptyText: importLoading ? '加载中...' : '暂无可导入的成单信息（所有成单已关联学员）',
          }}
        />
      </Modal>

      {/* 为已有学员创建家长账号 Modal */}
      <Modal
        title={`创建家长账号 - ${parentAccountStudent?.name || ''}`}
        open={parentAccountModalVisible}
        onCancel={() => {
          setParentAccountModalVisible(false);
          parentAccountForm.resetFields();
          setParentAccountStudent(null);
        }}
        onOk={() => parentAccountForm.submit()}
        width={500}
      >
        <Form form={parentAccountForm} onFinish={handleParentAccountSubmit} layout="vertical">
          <Alert
            message="提示"
            description="创建家长账号后，家长可以使用手机号登录系统，查看学员的课表、出勤记录和缴费信息。"
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
            label="家长手机号"
            rules={[
              { required: true, message: '请输入家长手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
            ]}
            extra="此手机号将用于登录和关联学员"
          >
            <Input placeholder="用于登录的手机号" />
          </Form.Item>

          <Form.Item
            name="email"
            label="家长邮箱（可选）"
            rules={[
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="可选，用于接收邮件通知" />
          </Form.Item>

          <Form.Item
            name="password"
            label="登录密码"
            extra="留空则使用默认密码 123456"
          >
            <Input.Password placeholder="留空使用默认密码 123456" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入 Modal */}
      <ImportModal
        visible={batchImportModalVisible}
        type="students"
        onClose={() => setBatchImportModalVisible(false)}
        onSuccess={fetchStudents}
      />
    </div>
  );
};

export default Students;
