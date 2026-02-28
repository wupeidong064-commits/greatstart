import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Modal, Form, message, Tag, Input, Space, Select, DatePicker, TimePicker, Checkbox, Descriptions, Row, Col, Card } from 'antd';
import { PlusOutlined, CalendarOutlined, TeamOutlined, UserAddOutlined, FileExcelOutlined } from '@ant-design/icons';
import api from '../services/api';
import { dataService, Teacher } from '../services/dataService';
import { useAuthStore } from '../store/authStore';
import { getDataScopeFilter, normalizeRole } from '../utils/dataFilter';
import dayjs from 'dayjs';
import ImportModal from '../components/ImportModal';

const Classes = () => {
  const { user } = useAuthStore();
  const userRole = user ? normalizeRole(user.role) : null;
  const isSales = userRole === 'sales';
  const isCoach = userRole === 'coach';

  // 销售和教练角色只能查看，不能操作
  const canEdit = !isSales && !isCoach;

  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<any>(null);
  const [form] = Form.useForm();
  const [showExperienceClassOnly, setShowExperienceClassOnly] = useState(false);

  // 筛选状态
  const [filterTeacherId, setFilterTeacherId] = useState<string | null>(null);
  const [filterWeekDay, setFilterWeekDay] = useState<number | null>(null);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [schedulingClass, setSchedulingClass] = useState<any>(null);
  const [scheduleForm] = Form.useForm();
  const [studentsModalVisible, setStudentsModalVisible] = useState(false);
  const [viewingClass, setViewingClass] = useState<any>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [addStudentModalVisible, setAddStudentModalVisible] = useState(false);
  const [addStudentForm] = Form.useForm();
  const [addingToClass, setAddingToClass] = useState<any>(null);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);

  const [newlyCreatedClassId, setNewlyCreatedClassId] = useState<string | null>(null);

  // 批量导入相关状态
  const [batchImportModalVisible, setBatchImportModalVisible] = useState(false);

  // 星期几映射
  const weekDayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 生成班级代码
  const generateClassCode = (weekDays: number[], startTime: string): string => {
    const dayLabel = weekDays.length === 1
      ? weekDayLabels[weekDays[0]]
      : weekDays.map(d => weekDayLabels[d]).join('');

    const timeStr = startTime.replace(':', '');
    return `${dayLabel}${timeStr}`;
  };

  // 获取教练员列表（使用缓存）
  const fetchTeachers = async () => {
    try {
      const data = await dataService.getTeachers();
      setTeachers(data);
    } catch (error: any) {
      console.error('获取教练员列表失败:', error);
    }
  };

  useEffect(() => {
    fetchTeachers(); // 页面加载时获取教练员列表
    if (showExperienceClassOnly) {
      fetchExperienceClasses();
    } else {
      fetchClasses();
    }
  }, [showExperienceClassOnly]);

  // 自动打开排课弹窗（创建班级后）
  useEffect(() => {
    if (newlyCreatedClassId && classes.length > 0) {
      const newClass = classes.find(c => c.id === newlyCreatedClassId);
      if (newClass) {
        setSchedulingClass(newClass);
        scheduleForm.resetFields();
        scheduleForm.setFieldsValue({
          recurrenceType: 'weekly',
          weekDays: [],
        });
        setScheduleModalVisible(true);
        setNewlyCreatedClassId(null);
      }
    }
  }, [newlyCreatedClassId, classes]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      // 应用数据过滤：teacher 角色只看自己的班级
      const filter = getDataScopeFilter('classes');
      const response = await api.get('/classes', { params: { ...filter, pageSize: 1000 } });
      setClasses(response.data || []);
    } catch (error: any) {
      console.error('获取班级列表失败:', error);
      message.error(error.message || '获取班级列表失败');
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchExperienceClasses = async () => {
    setLoading(true);
    try {
      // 获取所有活跃班级，包含学员数统计，按空位数排序
      const response = await api.get('/classes/experience-priority');
      setClasses(response.data || []);
    } catch (error: any) {
      console.error('获取优先安排体验课班级失败:', error);
      setClasses([]);
      message.error(error.message || '获取优先安排体验课班级失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const { user } = useAuthStore.getState();

      if (editingClass) {
        // 编辑班级时，自动更新班级名称
        let updateData = { ...values };

        // 获取教练名称
        const teacher = teachers.find(t => t.id === values.teacherId);
        const teacherName = teacher?.name || editingClass.teacher?.name || '';

        // 生成班级名称：教练名-星期时间-品类
        if (values.weekDays && values.timeRange) {
          const weekDayText = values.weekDays.length === 1
            ? weekDayLabels[values.weekDays[0]]
            : values.weekDays.map((d: number) => weekDayLabels[d]).join('');
          const timeText = values.timeRange[0]?.format('HH:mm') || '';
          const courseTypeText = values.courseType || editingClass.courseType || '';
          updateData.name = `${teacherName}-${weekDayText}${timeText}-${courseTypeText}`;
        }

        // 更新 scheduleRule
        if (values.weekDays && values.timeRange) {
          updateData.scheduleRule = {
            ...editingClass.scheduleRule,
            weekDays: values.weekDays,
            startTime: values.timeRange[0]?.format('HH:mm'),
            endTime: values.timeRange[1]?.format('HH:mm'),
            startDate: values.startDate?.format('YYYY-MM-DD') || editingClass.scheduleRule?.startDate,
            endDate: values.endDate?.format('YYYY-MM-DD') || editingClass.scheduleRule?.endDate,
          };
        }

        await api.put(`/classes/${editingClass.id}`, updateData);
        message.success('更新成功');
        setModalVisible(false);
        fetchClasses();
      } else {
        // 创建班级时需要添加 organizationId
        const classData = {
          ...values,
          organizationId: user?.organizationId || 'default-org',
          campusId: user?.campusId || undefined,
          status: 'active',
        };
        const response = await api.post('/classes', classData);
        message.success('班级创建成功，请设置上课时间');
        setModalVisible(false);

        // 刷新列表后自动打开排课弹窗
        if (response.data?.id) {
          setNewlyCreatedClassId(response.data.id);
        }
        fetchClasses();
      }
    } catch (error: any) {
      console.error('操作失败:', error);
      message.error(error.message || '操作失败');
    }
  };

  const handleScheduleClass = (record: any) => {
    setSchedulingClass(record);
    
    // 如果班级有排课规则，则填充表单
    if (record.scheduleRule) {
      const rule = record.scheduleRule;
      scheduleForm.setFieldsValue({
        recurrenceType: rule.recurrenceType || 'weekly',
        startDate: rule.startDate ? dayjs(rule.startDate) : null,
        endDate: rule.endDate ? dayjs(rule.endDate) : null,
        weekDays: rule.weekDays || [],
        timeRange: rule.startTime && rule.endTime 
          ? [dayjs(rule.startTime, 'HH:mm'), dayjs(rule.endTime, 'HH:mm')]
          : null,
        location: rule.location || '',
      });
    } else {
      scheduleForm.resetFields();
      scheduleForm.setFieldsValue({
        recurrenceType: 'weekly',
        weekDays: [],
      });
    }
    
    setScheduleModalVisible(true);
  };

  const handleScheduleSubmit = async (values: any) => {
    try {
      const { user } = useAuthStore.getState();

      if (!user?.organizationId) {
        message.error('无法获取机构信息，请重新登录');
        return;
      }

      // 验证每周重复必须选择上课日期
      if (values.recurrenceType === 'weekly' && (!values.weekDays || values.weekDays.length === 0)) {
        message.error('每周重复模式必须选择至少一个上课日期');
        return;
      }

      // 获取教练信息
      const teacherId = values.teacherId || schedulingClass.teacherId;
      const teacher = teachers.find(t => t.id === teacherId);
      const teacherName = teacher?.name || schedulingClass?.teacher?.name || '';

      // 【新增】自动生成班级名称：教练名 + 星期时间 + 品类
      const weekDayText = values.weekDays.length === 1
        ? weekDayLabels[values.weekDays[0]]
        : values.weekDays.map(d => weekDayLabels[d]).join('');
      const timeText = values.timeRange[0].format('HH:mm');
      const courseTypeText = schedulingClass?.courseType || '';
      const autoGeneratedName = `${teacherName}-${weekDayText}${timeText}-${courseTypeText}`;

      const scheduleData = {
        classId: schedulingClass.id,
        organizationId: user.organizationId,
        recurrenceType: values.recurrenceType,
        startDate: values.startDate.format('YYYY-MM-DD'),
        endDate: values.endDate.format('YYYY-MM-DD'),
        weekDays: values.weekDays || [],
        startTime: values.timeRange[0].format('HH:mm'),
        endTime: values.timeRange[1].format('HH:mm'),
        location: values.location,
        teacherId: teacherId,
      };

      // 如果班级已有排课，先取消之前的排课
      if (schedulingClass.scheduleRule) {
        Modal.confirm({
          title: '检测到已有排课',
          content: '该班级已有排课记录，修改排课将取消之前所有"待上课"状态的排课。是否继续？',
          okText: '确认修改',
          cancelText: '取消',
          onOk: async () => {
            await submitSchedule(scheduleData, autoGeneratedName);
          },
        });
      } else {
        await submitSchedule(scheduleData, autoGeneratedName);
      }
    } catch (error: any) {
      console.error('排课失败:', error);
      message.error(error.message || '排课失败');
    }
  };

  const submitSchedule = async (scheduleData: any, autoGeneratedName?: string) => {
    try {
      // 取消之前的排课
      if (schedulingClass.scheduleRule) {
        await api.post(`/schedules/cancel-by-class/${schedulingClass.id}`);
      }

      // 创建新排课
      await api.post('/schedules/recurring', scheduleData);

      // 更新班级的排课规则
      const scheduleRule = {
        recurrenceType: scheduleData.recurrenceType,
        startDate: scheduleData.startDate,
        endDate: scheduleData.endDate,
        weekDays: scheduleData.weekDays,
        startTime: scheduleData.startTime,
        endTime: scheduleData.endTime,
        location: scheduleData.location,
      };

      // 自动生成班级代码（如果班级没有代码或代码是旧的A/B/C/D格式）
      const currentCode = schedulingClass.code;
      const isOldFormat = ['A', 'B', 'C', 'D', 'E', 'F'].includes(currentCode);
      const updateData: any = { scheduleRule };

      if (!currentCode || isOldFormat) {
        const newCode = generateClassCode(scheduleData.weekDays || [], scheduleData.startTime);
        updateData.code = newCode;
      }

      // 【新增】自动更新班级名称
      if (autoGeneratedName) {
        updateData.name = autoGeneratedName;
      }

      await api.put(`/classes/${schedulingClass.id}`, updateData);

      // 更新当前班级显示
      setSchedulingClass({
        ...schedulingClass,
        scheduleRule,
        code: updateData.code || schedulingClass.code,
        name: updateData.name || schedulingClass.name,
      });

      message.success('排课成功');
      // 不关闭窗口，保留排课信息显示
      fetchClasses();
    } catch (error: any) {
      console.error('排课失败:', error);
      message.error(error.message || '排课失败');
      throw error;
    }
  };

  const handleEdit = (record: any) => {
    setEditingClass(record);

    // 处理 scheduleRule 字段
    const weekDays = record.scheduleRule?.weekDays;
    const timeRange = record.scheduleRule?.startTime && record.scheduleRule?.endTime
      ? [
          dayjs(record.scheduleRule.startTime, 'HH:mm'),
          dayjs(record.scheduleRule.endTime, 'HH:mm')
        ]
      : undefined;

    const startDate = record.scheduleRule?.startDate ? dayjs(record.scheduleRule.startDate) : undefined;
    const endDate = record.scheduleRule?.endDate ? dayjs(record.scheduleRule.endDate) : undefined;

    form.setFieldsValue({
      ...record,
      weekDays,
      timeRange,
      startDate,
      endDate,
    });

    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该班级吗？',
      onOk: async () => {
        try {
          await api.delete(`/classes/${id}`);
          message.success('删除成功');
          fetchClasses();
        } catch (error: any) {
          console.error('删除失败:', error);
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  const handleSuspendClass = async (id: string) => {
    Modal.confirm({
      title: '确认停课',
      content: '确定要将该班级设置为停课状态吗？停课期间将不会进行正常排课。',
      okText: '确认停课',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.put(`/classes/${id}`, { status: 'inactive' });
          message.success('班级已停课');
          fetchClasses();
        } catch (error: any) {
          console.error('停课失败:', error);
          message.error(error.message || '停课失败');
        }
      },
    });
  };

  const handleResumeClass = async (id: string) => {
    Modal.confirm({
      title: '确认复课',
      content: '确定要恢复该班级吗？',
      okText: '确认复课',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.put(`/classes/${id}`, { status: 'active' });
          message.success('班级已复课');
          fetchClasses();
        } catch (error: any) {
          console.error('复课失败:', error);
          message.error(error.message || '复课失败');
        }
      },
    });
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

  const handleAddStudentToClass = (record: any) => {
    setAddingToClass(record);
    addStudentForm.resetFields();
    fetchAvailableStudents(record.id);
    setAddStudentModalVisible(true);
  };

  const fetchAvailableStudents = async (classId?: string) => {
    try {
      // 获取所有学员
      const response = await api.get('/students', { params: { pageSize: 1000 } });
      let students = response.data || [];

      // 如果指定了班级ID，过滤掉已在该班级中的学员
      if (classId) {
        try {
          // 获取该班级已报名的学员
          const enrolledResponse = await api.get(`/classes/${classId}/students`);
          const enrolledStudentIds = (enrolledResponse.data || []).map((s: any) => s.id);
          // 过滤掉已报名的学员
          students = students.filter((s: any) => !enrolledStudentIds.includes(s.id));
        } catch (e) {
          // 如果获取班级学员失败，继续显示所有学员
          console.warn('获取班级学员失败，显示所有学员', e);
        }
      }

      setAvailableStudents(students);
    } catch (error: any) {
      console.error('获取学员列表失败:', error);
      message.error(error.message || '获取学员列表失败');
    }
  };

  const handleAddStudentSubmit = async (values: any) => {
    if (!addingToClass) return;
    try {
      await api.post('/enrollments', {
        studentId: values.studentId,
        classId: addingToClass.id,
        status: 'active',
        notes: values.notes,
      });
      message.success('添加学员成功');
      setAddStudentModalVisible(false);
      // 刷新班级列表
      fetchClasses();
      // 如果学员名单窗口打开着，也刷新它
      if (viewingClass?.id === addingToClass.id) {
        const response = await api.get(`/classes/${addingToClass.id}/students`);
        setClassStudents(response.data || []);
      }
    } catch (error: any) {
      console.error('添加学员失败:', error);
      message.error(error.message || '添加学员失败');
    }
  };

  const columns = [
    { 
      title: '班级名称', 
      dataIndex: 'name', 
      key: 'name',
      render: (name: string, record: any) => (
        <Space direction="vertical" size={0}>
          <Button type="link" onClick={() => handleScheduleClass(record)}>
            {name}
          </Button>
          {record.scheduleRule && (
            <div style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
              <CalendarOutlined style={{ marginRight: 4 }} />
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
    { title: '班级代码', dataIndex: 'code', key: 'code' },
    {
      title: '班级水平',
      dataIndex: 'level',
      key: 'level',
      render: (level: string) => level || '-',
    },
    {
      title: '负责教练员',
      dataIndex: ['teacher', 'name'],
      key: 'teacher',
      render: (name: string) => name || '-',
    },
    { title: '课程类型', dataIndex: 'courseType', key: 'courseType' },
    { 
      title: '容量', 
      key: 'capacity',
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
            render: (count: number, record: any) => (
              <span>{count} / {record.capacity}</span>
            ),
          },
          {
            title: '空位数',
            dataIndex: 'availableSlots',
            key: 'availableSlots',
            render: (slots: number) => (
              <Tag color={slots > 5 ? 'green' : slots > 0 ? 'orange' : 'red'}>
                {slots} 个空位
              </Tag>
            ),
          },
          {
            title: '满班率',
            dataIndex: 'fillRate',
            key: 'fillRate',
            render: (rate: number) => (
              <Tag color={rate >= 80 ? 'red' : rate >= 50 ? 'orange' : 'green'}>
                {rate}%
              </Tag>
            ),
          },
        ]
      : []),
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          active: { text: '活跃', color: 'green' },
          inactive: { text: '停课', color: 'orange' },
          completed: { text: '已结课', color: 'default' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          {canEdit && (
            <>
              <Button type="link" icon={<UserAddOutlined />} onClick={() => handleAddStudentToClass(record)}>
                添加学员
              </Button>
              <Button type="link" onClick={() => handleEdit(record)}>编辑</Button>
              {record.status === 'active' ? (
                <Button type="link" onClick={() => handleSuspendClass(record.id)}>停课</Button>
              ) : record.status === 'inactive' ? (
                <Button type="link" onClick={() => handleResumeClass(record.id)}>复课</Button>
              ) : null}
              <Button type="link" danger onClick={() => handleDelete(record.id)}>删除</Button>
            </>
          )}
          <Button type="link" icon={<TeamOutlined />} onClick={() => handleViewStudents(record)}>
            学员名单
          </Button>
        </Space>
      ),
    },
  ];

  // 筛选后的班级列表
  const filteredClasses = useMemo(() => {
    let result = classes;

    // 按教练筛选
    if (filterTeacherId) {
      result = result.filter(cls => cls.teacherId === filterTeacherId);
    }

    // 按星期几筛选
    if (filterWeekDay !== null) {
      result = result.filter(cls => {
        const weekDays = cls.scheduleRule?.weekDays || [];
        return weekDays.includes(filterWeekDay);
      });
    }

    return result;
  }, [classes, filterTeacherId, filterWeekDay]);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>班级管理</h1>
        <Space>
          <Button
            type={showExperienceClassOnly ? 'default' : 'primary'}
            onClick={() => {
              setShowExperienceClassOnly(!showExperienceClassOnly);
            }}
          >
            {showExperienceClassOnly ? '取消筛选' : '优先安排体验课班级'}
          </Button>
          {canEdit && (
            <Button icon={<FileExcelOutlined />} onClick={() => setBatchImportModalVisible(true)}>
              批量导入
            </Button>
          )}
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setEditingClass(null);
              form.resetFields();
              setModalVisible(true);
            }}>
              新增班级
            </Button>
          )}
        </Space>
      </div>

      {/* 筛选区域 */}
      <div style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: '#fafafa',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <span style={{ fontWeight: 500 }}>筛选：</span>
        <Select
          placeholder="选择教练"
          allowClear
          style={{ width: 140, minWidth: 140 }}
          value={filterTeacherId}
          onChange={(value) => setFilterTeacherId(value)}
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
          onChange={(value) => setFilterWeekDay(value)}
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
        <span style={{ color: '#999', marginLeft: 'auto' }}>
          共 {filteredClasses.length} 个班级
        </span>
      </div>

      {/* 班级列表 */}
      <Table columns={columns} dataSource={filteredClasses} loading={loading} rowKey="id" />

      <Modal
        title={editingClass ? '编辑班级' : '新增班级'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="name" label="班级名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="班级代码" rules={[{ required: true, message: '请选择班级代码' }]}>
            <Select placeholder="请选择班级代码">
              <Select.Option value="A">A</Select.Option>
              <Select.Option value="B">B</Select.Option>
              <Select.Option value="C">C</Select.Option>
              <Select.Option value="D">D</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="level" label="班级水平">
            <Select placeholder="请选择班级水平" allowClear>
              <Select.Option value="第一阶段">第一阶段</Select.Option>
              <Select.Option value="第二阶段">第二阶段</Select.Option>
              <Select.Option value="第三阶段">第三阶段</Select.Option>
              <Select.Option value="第四阶段">第四阶段</Select.Option>
              <Select.Option value="第五阶段">第五阶段</Select.Option>
              <Select.Option value="第六阶段">第六阶段</Select.Option>
              <Select.Option value="第七阶段">第七阶段</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="teacherId" label="负责教练员">
            <Select 
              placeholder="请选择负责教练员" 
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
          <Form.Item name="courseType" label="课程类型" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>

          {/* 上课时间设置 */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ marginBottom: 12, fontWeight: 500, color: '#666' }}>上课时间设置</div>
            <Form.Item
              name="weekDays"
              label="每周安排"
              rules={[{ required: true, message: '请选择上课日期' }]}
            >
              <Checkbox.Group>
                <Checkbox value={1}>周一</Checkbox>
                <Checkbox value={2}>周二</Checkbox>
                <Checkbox value={3}>周三</Checkbox>
                <Checkbox value={4}>周四</Checkbox>
                <Checkbox value={5}>周五</Checkbox>
                <Checkbox value={6}>周六</Checkbox>
                <Checkbox value={0}>周日</Checkbox>
              </Checkbox.Group>
            </Form.Item>
            <Form.Item
              name="timeRange"
              label="上课时段"
              rules={[{ required: true, message: '请选择上课时段' }]}
            >
              <TimePicker.RangePicker
                style={{ width: '100%' }}
                format="HH:mm"
                minuteStep={15}
              />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="startDate"
                  label="开始日期"
                >
                  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="endDate"
                  label="结束日期"
                >
                  <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>
              </Col>
            </Row>
          </div>
        </Form>
      </Modal>

      {/* 排课弹窗 */}
      <Modal
        title="排课"
        open={scheduleModalVisible}
        onCancel={() => setScheduleModalVisible(false)}
        onOk={() => scheduleForm.submit()}
        width={600}
      >
        <Form form={scheduleForm} onFinish={handleScheduleSubmit} layout="vertical">
          <Form.Item 
            name="recurrenceType" 
            label="重复方式" 
            rules={[{ required: true, message: '请选择重复方式' }]}
          >
            <Select placeholder="请选择重复方式">
              <Select.Option value="weekly">每周重复</Select.Option>
              <Select.Option value="daily">每日重复</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item 
            name="startDate" 
            label="开始日期" 
            rules={[{ required: true, message: '请选择开始日期' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item 
            name="endDate" 
            label="结束日期" 
            rules={[{ required: true, message: '请选择结束日期' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.recurrenceType !== currentValues.recurrenceType}
          >
            {({ getFieldValue }) =>
              getFieldValue('recurrenceType') === 'weekly' ? (
                <Form.Item 
                  name="weekDays" 
                  label="每周安排" 
                  rules={[{ required: true, message: '请选择上课日期' }]}
                >
                  <Checkbox.Group>
                    <Checkbox value={1}>周一</Checkbox>
                    <Checkbox value={2}>周二</Checkbox>
                    <Checkbox value={3}>周三</Checkbox>
                    <Checkbox value={4}>周四</Checkbox>
                    <Checkbox value={5}>周五</Checkbox>
                    <Checkbox value={6}>周六</Checkbox>
                    <Checkbox value={0}>周日</Checkbox>
                  </Checkbox.Group>
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item 
            name="timeRange" 
            label="上课时段" 
            rules={[{ required: true, message: '请选择上课时段' }]}
          >
            <TimePicker.RangePicker 
              style={{ width: '100%' }} 
              format="HH:mm"
              minuteStep={15}
            />
          </Form.Item>

          <Form.Item name="location" label="上课地点">
            <Input placeholder="请输入上课地点" />
          </Form.Item>

          <Form.Item name="teacherId" label="教练/助教">
            <Select 
              placeholder="请选择教练" 
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {teachers.map((teacher) => (
                <Select.Option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 学员名单弹窗 */}
      <Modal
        title={
          <Space>
            <TeamOutlined />
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
              <Descriptions.Item label="班级水平">{viewingClass.level || '-'}</Descriptions.Item>
              <Descriptions.Item label="负责教练">{viewingClass.teacher?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="课程类型">{viewingClass.courseType}</Descriptions.Item>
              <Descriptions.Item label="班级容量">
                {viewingClass._count?.enrollments || viewingClass.currentStudents || classStudents.length} / {viewingClass.capacity}
              </Descriptions.Item>
              <Descriptions.Item label="班级状态">
                <Tag color={viewingClass.status === 'active' ? 'green' : 'orange'}>
                  {viewingClass.status === 'active' ? '活跃' : '停课'}
                </Tag>
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

      {/* 添加学员到班级弹窗 */}
      <Modal
        title={
          <Space>
            <UserAddOutlined />
            <span>{addingToClass?.name} - 添加学员</span>
          </Space>
        }
        open={addStudentModalVisible}
        onCancel={() => {
          setAddStudentModalVisible(false);
          setAddingToClass(null);
          addStudentForm.resetFields();
        }}
        onOk={() => addStudentForm.submit()}
        width={600}
      >
        {addingToClass && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f5ff', borderRadius: 8 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="班级代码">{addingToClass.code}</Descriptions.Item>
              <Descriptions.Item label="班级水平">{addingToClass.level || '-'}</Descriptions.Item>
              <Descriptions.Item label="负责教练">{addingToClass.teacher?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="当前人数/容量">
                {addingToClass._count?.enrollments || 0} / {addingToClass.capacity}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
        
        <Form form={addStudentForm} onFinish={handleAddStudentSubmit} layout="vertical">
          <Form.Item 
            name="studentId" 
            label="选择学员" 
            rules={[{ required: true, message: '请选择学员' }]}
          >
            <Select
              placeholder="请输入或选择学员姓名"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {availableStudents
                .filter((student: any) => student.status === 'active')
                .map((student: any) => (
                  <Select.Option key={student.id} value={student.id}>
                    {student.name} {student.phone ? `(${student.phone})` : ''}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="备注">
            <Input.TextArea
              rows={3}
              placeholder="选填，如：转班、新学员等备注信息"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入 Modal */}
      <ImportModal
        visible={batchImportModalVisible}
        type="classes"
        onClose={() => setBatchImportModalVisible(false)}
        onSuccess={fetchClasses}
      />
    </div>
  );
};

export default Classes;

