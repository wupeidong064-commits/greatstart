import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, message, Tag, Input, Space, Select, DatePicker, TimePicker, Checkbox, Descriptions } from 'antd';
import { PlusOutlined, FilterOutlined, CalendarOutlined, TeamOutlined } from '@ant-design/icons';
import { memfireDB } from '../services/memfireDB';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const Classes = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<any>(null);
  const [form] = Form.useForm();
  const [showLowAttendanceOnly, setShowLowAttendanceOnly] = useState(false);
  const [showExperienceClassOnly, setShowExperienceClassOnly] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [schedulingClass, setSchedulingClass] = useState<any>(null);
  const [scheduleForm] = Form.useForm();
  const [studentsModalVisible, setStudentsModalVisible] = useState(false);
  const [viewingClass, setViewingClass] = useState<any>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // 获取教练员列表
  const fetchTeachers = async () => {
    try {
      const data = await memfireDB.users.listTeachers();
      setTeachers(data || []);
    } catch (error: any) {
      console.error('获取教练员列表失败:', error);
    }
  };

  useEffect(() => {
    fetchTeachers(); // 页面加载时获取教练员列表
    if (showLowAttendanceOnly) {
      fetchLowAttendanceClasses();
    } else if (showExperienceClassOnly) {
      fetchExperienceClasses();
    } else {
      fetchClasses();
    }
  }, [showLowAttendanceOnly, showExperienceClassOnly]);

  const fetchClasses = async () => {
    setLoading(true);
    try {
      const data = await memfireDB.classes.list();
      setClasses(data || []);
    } catch (error: any) {
      console.error('获取班级列表失败:', error);
      message.error(error.message || '获取班级列表失败');
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLowAttendanceClasses = async () => {
    setLoading(true);
    try {
      // 使用 MemFire 获取连续两周出勤率低于60%的班级
      const lowAttendanceData = await memfireDB.attendances.getLowAttendanceClasses(60);
      
        // 将低出勤班级数据转换为与普通班级列表相同的格式
      const formattedClasses = lowAttendanceData.map((item: any) => ({
          ...item.class,
          attendanceRate: item.attendanceRate,
        week1Rate: item.week1Rate,
        week2Rate: item.week2Rate,
          totalStudents: item.totalStudents,
          lowAttendanceCount: item.lowAttendanceCount,
          _count: {
            enrollments: item.totalStudents, // 添加 _count 字段以匹配表格显示逻辑
          },
        }));
        setClasses(formattedClasses);
    } catch (error: any) {
      console.error('获取低出勤班级失败:', error);
      setClasses([]);
      message.error(error.message || '获取低出勤班级失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchExperienceClasses = async () => {
    setLoading(true);
    try {
      // 获取所有活跃班级，包含学员数统计，按空位数排序
      const classesWithStats = await memfireDB.classes.listForExperiencePriority();
      setClasses(classesWithStats);
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
        await memfireDB.classes.update(editingClass.id, values);
        message.success('更新成功');
      } else {
        // 创建班级时需要添加 organizationId
        const classData = {
          ...values,
          organizationId: user?.organizationId || 'default-org',
          campusId: user?.campusId || undefined,
          status: 'active',
        };
        await memfireDB.classes.create(classData);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchClasses();
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
        teacherId: values.teacherId || schedulingClass.teacherId,
      };

      // 如果班级已有排课，先取消之前的排课
      if (schedulingClass.scheduleRule) {
        Modal.confirm({
          title: '检测到已有排课',
          content: '该班级已有排课记录，修改排课将取消之前所有"待上课"状态的排课。是否继续？',
          okText: '确认修改',
          cancelText: '取消',
          onOk: async () => {
            await submitSchedule(scheduleData);
          },
        });
      } else {
        await submitSchedule(scheduleData);
      }
    } catch (error: any) {
      console.error('排课失败:', error);
      message.error(error.message || '排课失败');
    }
  };

  const submitSchedule = async (scheduleData: any) => {
    try {
      // 取消之前的排课
      if (schedulingClass.scheduleRule) {
        await memfireDB.schedules.cancelByClass(schedulingClass.id);
      }

      // 创建新排课
      await memfireDB.schedules.createRecurring(scheduleData);

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
      await memfireDB.classes.update(schedulingClass.id, { scheduleRule });

      // 更新当前班级显示
      setSchedulingClass({
        ...schedulingClass,
        scheduleRule,
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
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该班级吗？',
      onOk: async () => {
        try {
          await memfireDB.classes.delete(id);
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
          await memfireDB.classes.update(id, { status: 'inactive' });
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
          await memfireDB.classes.update(id, { status: 'active' });
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
      const students = await memfireDB.classes.getClassStudents(record.id);
      setClassStudents(students || []);
    } catch (error: any) {
      console.error('获取班级学员失败:', error);
      message.error(error.message || '获取班级学员失败');
      setClassStudents([]);
    } finally {
      setStudentsLoading(false);
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
    ...(showLowAttendanceOnly
      ? [
          {
            title: '学员总数',
            dataIndex: 'totalStudents',
            key: 'totalStudents',
          },
          {
            title: '第一周出勤率',
            dataIndex: 'week1Rate',
            key: 'week1Rate',
            render: (rate: number) => (
              <Tag color={rate >= 60 ? 'green' : rate >= 40 ? 'orange' : 'red'}>
                {rate !== null ? `${rate}%` : '-'}
              </Tag>
            ),
          },
          {
            title: '第二周出勤率',
            dataIndex: 'week2Rate',
            key: 'week2Rate',
            render: (rate: number) => (
              <Tag color={rate >= 60 ? 'green' : rate >= 40 ? 'orange' : 'red'}>
                {rate !== null ? `${rate}%` : '-'}
              </Tag>
            ),
          },
          {
            title: '平均出勤率',
            dataIndex: 'attendanceRate',
            key: 'attendanceRate',
            render: (rate: number) => (
              <Tag color={rate >= 60 ? 'green' : rate >= 40 ? 'orange' : 'red'}>
                {rate}%
              </Tag>
            ),
          },
          {
            title: '低出勤学员',
            dataIndex: 'lowAttendanceCount',
            key: 'lowAttendanceCount',
            render: (count: number) => (
              <Tag color="red">{count} 人</Tag>
            ),
          },
        ]
      : []),
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
          <Button type="link" icon={<TeamOutlined />} onClick={() => handleViewStudents(record)}>
            学员名单
          </Button>
          <Button type="link" onClick={() => handleEdit(record)}>编辑</Button>
          {record.status === 'active' ? (
            <Button type="link" onClick={() => handleSuspendClass(record.id)}>停课</Button>
          ) : record.status === 'inactive' ? (
            <Button type="link" onClick={() => handleResumeClass(record.id)}>复课</Button>
          ) : null}
          <Button type="link" danger onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>班级管理</h1>
        <Space>
          <Button
            type={showLowAttendanceOnly ? 'default' : 'primary'}
            icon={<FilterOutlined />}
            onClick={() => {
              setShowLowAttendanceOnly(!showLowAttendanceOnly);
              setShowExperienceClassOnly(false);
            }}
          >
            {showLowAttendanceOnly ? '取消筛选' : '低出勤班级筛选'}
          </Button>
          <Button
            type={showExperienceClassOnly ? 'default' : 'primary'}
            icon={<FilterOutlined />}
            onClick={() => {
              setShowExperienceClassOnly(!showExperienceClassOnly);
              setShowLowAttendanceOnly(false);
            }}
          >
            {showExperienceClassOnly ? '取消筛选' : '优先安排体验课班级'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditingClass(null);
            form.resetFields();
            setModalVisible(true);
          }}>
            新增班级
          </Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={classes} loading={loading} rowKey="id" />
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
    </div>
  );
};

export default Classes;

