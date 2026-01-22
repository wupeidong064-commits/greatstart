import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, DatePicker, Spin, message, Tabs, Modal, Popconfirm, Radio, Select, Checkbox } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, EnvironmentOutlined, UserOutlined, DeleteOutlined, ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { memfireDB } from '../services/memfireDB';
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
  teacherId: string;
  teacherName: string;
  startTime: string;
  endTime: string;
  classroom: string;
  status: string;
  studentCount: number;
}

const WeeklySchedule = () => {
  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<Dayjs>(dayjs());
  const [weekSchedules, setWeekSchedules] = useState<Record<number, Schedule[]>>({
    1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] // 周一到周日
  });
  const [batchAttendanceVisible, setBatchAttendanceVisible] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<Record<string, string>>({});
  const [batchStatus, setBatchStatus] = useState<string>('present');

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
    setLoading(true);
    try {
      // 使用完整的时间戳（包含时区），确保查询范围正确
      const startDate = currentWeek.startOf('isoWeek').format('YYYY-MM-DD') + 'T00:00:00+08:00';
      const endDate = currentWeek.endOf('isoWeek').format('YYYY-MM-DD') + 'T23:59:59+08:00';

      const schedules = await memfireDB.schedules.list({
        startDate,
        endDate,
        includeAll: false, // 不包含已取消的排课
      });

      // 按星期几分组
      const grouped: Record<number, Schedule[]> = {
        1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: []
      };

      for (const schedule of schedules || []) {
        // 跳过已取消的排课
        if (schedule.status === 'cancelled') {
          continue;
        }
        
        const dayOfWeek = dayjs(schedule.startTime).tz('Asia/Shanghai').day();
        const classInfo = schedule.class as any;
        
        // 只计算 active 状态的学员数
        const activeEnrollments = classInfo?.enrollments?.filter((e: any) => e.status === 'active') || [];
        
        grouped[dayOfWeek].push({
          id: schedule.id,
          classId: schedule.classId,
          className: classInfo?.name || '-',
          classCode: classInfo?.code || '-',
          teacherId: schedule.teacherId,
          teacherName: schedule.teacher?.name || '-',
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          classroom: schedule.classroom || '-',
          status: schedule.status,
          studentCount: activeEnrollments.length,
        });
      }

      // 按开始时间排序
      Object.keys(grouped).forEach(day => {
        grouped[Number(day)].sort((a, b) => 
          dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()
        );
      });

      setWeekSchedules(grouped);
    } catch (error: any) {
      console.error('获取排课失败:', error);
      message.error(error.message || '获取排课失败');
    } finally {
      setLoading(false);
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

  const handleCancelSchedule = async (schedule: Schedule) => {
    let cancelType = 'single'; // 默认取消单次

    Modal.confirm({
      title: '确认取消排课',
      icon: <ExclamationCircleOutlined />,
      width: 500,
      content: (
        <div>
          <p style={{ marginBottom: 16 }}>确定要取消以下排课吗？</p>
          <div style={{ 
            background: '#f5f5f5', 
            padding: 12, 
            borderRadius: 4, 
            marginBottom: 16 
          }}>
            <p style={{ margin: 0, marginBottom: 4 }}>
              <strong>{schedule.className} ({schedule.classCode})</strong>
            </p>
            <p style={{ margin: 0, marginBottom: 4 }}>
              时间：{dayjs(schedule.startTime).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm')} - {dayjs(schedule.endTime).tz('Asia/Shanghai').format('HH:mm')}
            </p>
            <p style={{ margin: 0 }}>教练：{schedule.teacherName}</p>
          </div>
          
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>取消范围：</div>
            <Radio.Group 
              defaultValue="single"
              onChange={(e) => { cancelType = e.target.value; }}
            >
              <Space direction="vertical">
                <Radio value="single">仅取消当前这节课</Radio>
                <Radio value="allFuture">
                  <span>取消该班级从当前日期起的所有未来排课</span>
                  <div style={{ fontSize: 12, color: '#999', marginLeft: 24 }}>
                    将取消该班级所有在 {dayjs(schedule.startTime).tz('Asia/Shanghai').format('YYYY-MM-DD')} 及之后的排课
                  </div>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          <p style={{ color: '#ff4d4f', marginTop: 16, marginBottom: 0 }}>
            ⚠️ 取消后排课状态将变为"已取消"，无法恢复
          </p>
        </div>
      ),
      okText: '确认取消',
      okType: 'danger',
      cancelText: '返回',
      onOk: async () => {
        try {
          if (cancelType === 'single') {
            await memfireDB.schedules.cancel(schedule.id);
            message.success('排课已取消');
          } else {
            const fromDate = dayjs(schedule.startTime).tz('Asia/Shanghai').format('YYYY-MM-DD');
            await memfireDB.schedules.cancelAllFuture(schedule.classId, fromDate);
            message.success('该班级的未来排课已全部取消');
          }
          fetchWeekSchedules();
        } catch (error: any) {
          console.error('取消排课失败:', error);
          message.error(error.message || '取消排课失败');
        }
      },
    });
  };

  const handleDeleteSchedule = async (schedule: Schedule) => {
    Modal.confirm({
      title: '确认删除排课',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>确定要删除以下排课吗？</p>
          <p style={{ marginTop: 8 }}>
            <strong>{schedule.className} ({schedule.classCode})</strong>
          </p>
          <p>时间：{dayjs(schedule.startTime).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm')} - {dayjs(schedule.endTime).tz('Asia/Shanghai').format('HH:mm')}</p>
          <p>教练：{schedule.teacherName}</p>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}>
            ⚠️ 删除后数据将无法恢复！建议使用"取消排课"功能
          </p>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '返回',
      onOk: async () => {
        try {
          await memfireDB.schedules.delete(schedule.id);
          message.success('排课已删除');
          fetchWeekSchedules();
        } catch (error: any) {
          console.error('删除排课失败:', error);
          message.error(error.message || '删除排课失败');
        }
      },
    });
  };

  // 打开批量划课模态框
  const handleBatchAttendance = async (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setBatchAttendanceVisible(true);
    
    try {
      // 获取班级学员列表
      const students = await memfireDB.classes.getClassStudents(schedule.classId);
      setClassStudents(students);
      
      // 初始化所有学员的考勤状态为"出勤"
      const initialStatus: Record<string, string> = {};
      students.forEach((student: any) => {
        initialStatus[student.id] = 'present';
      });
      setStudentAttendance(initialStatus);
      setBatchStatus('present');
    } catch (error: any) {
      console.error('获取学员列表失败:', error);
      message.error(error.message || '获取学员列表失败');
    }
  };

  // 批量设置考勤状态
  const handleBatchSetStatus = (status: string) => {
    setBatchStatus(status);
    const newStatus: Record<string, string> = {};
    classStudents.forEach((student: any) => {
      newStatus[student.id] = status;
    });
    setStudentAttendance(newStatus);
  };

  // 提交批量划课
  const handleBatchAttendanceSubmit = async () => {
    if (!selectedSchedule) return;

    const user = JSON.parse(localStorage.getItem('auth-storage') || '{}').state?.user;
    if (!user?.organizationId) {
      message.error('无法获取机构信息');
      return;
    }

    try {
      setLoading(true);
      
      // 为每个学员创建考勤记录并扣课时
      const promises = classStudents.map(async (student: any) => {
        const status = studentAttendance[student.id];
        
        // 先检查是否已存在考勤记录
        const existingAttendances = await memfireDB.attendances.list({
          scheduleId: selectedSchedule.id,
          studentId: student.id,
        });

        if (existingAttendances && existingAttendances.length > 0) {
          // 如果已存在，更新考勤记录
          const existingId = existingAttendances[0].id;
          await memfireDB.attendances.update(existingId, { status });
          
          // 如果之前不是出勤，现在改为出勤，则需要扣课时
          const wasPresent = existingAttendances[0].status === 'present';
          const isNowPresent = status === 'present';
          
          if (!wasPresent && isNowPresent && student.remainingLessons > 0) {
            // 从非出勤改为出勤，需要扣课时
            await memfireDB.students.update(student.id, {
              remainingLessons: student.remainingLessons - 1,
            });
            await memfireDB.lessonLogs.create({
              studentId: student.id,
              studentName: student.name,
              type: 'deduct',
              lessons: 1,
              notes: '批量划课 - 出勤',
            });
          }
        } else {
          // 不存在，创建新考勤记录
          await memfireDB.attendances.create({
            organizationId: user.organizationId,
            classId: selectedSchedule.classId,
            scheduleId: selectedSchedule.id,
            studentId: student.id,
            status: status,
          });

          // 只有出勤才扣除课时
          if (status === 'present' && student.remainingLessons > 0) {
            await memfireDB.students.update(student.id, {
              remainingLessons: student.remainingLessons - 1,
            });

            // 记录课时变动日志
            await memfireDB.lessonLogs.create({
              studentId: student.id,
              studentName: student.name,
              type: 'deduct',
              lessons: 1,
              notes: '批量划课 - 出勤',
            });
          }
        }
      });

      await Promise.all(promises);
      
      message.success(`已为 ${classStudents.length} 名学员完成考勤记录`);
      setBatchAttendanceVisible(false);
      setSelectedSchedule(null);
      setClassStudents([]);
      setStudentAttendance({});
    } catch (error: any) {
      console.error('批量划课失败:', error);
      message.error(error.message || '批量划课失败');
    } finally {
      setLoading(false);
    }
  };

  const renderScheduleCard = (schedule: Schedule) => {
    const statusColors: Record<string, string> = {
      scheduled: 'blue',
      completed: 'green',
      cancelled: 'red',
      rescheduled: 'orange',
    };

    const statusTexts: Record<string, string> = {
      scheduled: '待上课',
      completed: '已完成',
      cancelled: '已取消',
      rescheduled: '已改期',
    };

    const canCancel = schedule.status === 'scheduled' && dayjs(schedule.startTime).isAfter(dayjs());

    return (
      <Card
        key={schedule.id}
        size="small"
        style={{ 
          marginBottom: 8,
          opacity: schedule.status === 'cancelled' ? 0.6 : 1,
        }}
        hoverable={canCancel}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>
              {schedule.className} ({schedule.classCode})
            </div>
            <Space direction="vertical" size={2}>
              <div style={{ fontSize: 12, color: '#666' }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                {dayjs(schedule.startTime).tz('Asia/Shanghai').format('HH:mm')} - {dayjs(schedule.endTime).tz('Asia/Shanghai').format('HH:mm')}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                <UserOutlined style={{ marginRight: 4 }} />
                {schedule.teacherName} · {schedule.studentCount}人
              </div>
              {schedule.classroom && schedule.classroom !== '-' && (
                <div style={{ fontSize: 12, color: '#666' }}>
                  <EnvironmentOutlined style={{ marginRight: 4 }} />
                  {schedule.classroom}
                </div>
              )}
            </Space>
            {canCancel && (
              <div style={{ marginTop: 8 }}>
                <Space size={4}>
                  <Button 
                    type="text" 
                    size="small" 
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleBatchAttendance(schedule)}
                  >
                    批量划课
                  </Button>
                  <Button 
                    type="text" 
                    size="small" 
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleCancelSchedule(schedule)}
                  >
                    取消排课
                  </Button>
                </Space>
              </div>
            )}
          </div>
          <Tag color={statusColors[schedule.status] || 'default'}>
            {statusTexts[schedule.status] || schedule.status}
          </Tag>
        </div>
      </Card>
    );
  };

  const renderDayColumn = (day: typeof weekDays[0]) => {
    const schedules = weekSchedules[day.key] || [];
    const isToday = day.date.isSame(dayjs(), 'day');
    const isPast = day.date.isBefore(dayjs(), 'day');

    return (
      <Card
        key={day.key}
        title={
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              fontSize: 16, 
              fontWeight: isToday ? 'bold' : 'normal',
              color: isToday ? '#1890ff' : 'inherit'
            }}>
              {day.label}
            </div>
            <div style={{ 
              fontSize: 12, 
              color: isToday ? '#1890ff' : '#999',
              fontWeight: 'normal'
            }}>
              {day.date.format('MM-DD')}
            </div>
          </div>
        }
        style={{ 
          height: '100%',
          opacity: isPast ? 0.7 : 1,
        }}
        headStyle={{
          backgroundColor: isToday ? '#e6f7ff' : '#fafafa',
          borderBottom: isToday ? '2px solid #1890ff' : '1px solid #f0f0f0',
        }}
        bodyStyle={{
          padding: 12,
          maxHeight: 'calc(100vh - 280px)',
          overflowY: 'auto',
        }}
      >
        {schedules.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#999', 
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
          color: '#999' 
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
            <div>{dayjs(time).format('MM-DD')}</div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs(time).day()]}
            </div>
          </div>
        ),
      },
      {
        title: '时间',
        key: 'time',
        width: 120,
        render: (_: any, record: Schedule) => (
          <div>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {dayjs(record.startTime).tz('Asia/Shanghai').format('HH:mm')} - {dayjs(record.endTime).tz('Asia/Shanghai').format('HH:mm')}
          </div>
        ),
      },
      {
        title: '班级',
        key: 'class',
        render: (_: any, record: Schedule) => (
          <div>
            <div>{record.className}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.classCode}</div>
          </div>
        ),
      },
      {
        title: '教练',
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
        title: '教室',
        dataIndex: 'classroom',
        key: 'classroom',
        width: 100,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 90,
        render: (status: string) => {
          const statusColors: Record<string, string> = {
            scheduled: 'blue',
            completed: 'green',
            cancelled: 'red',
            rescheduled: 'orange',
          };
          const statusTexts: Record<string, string> = {
            scheduled: '待上课',
            completed: '已完成',
            cancelled: '已取消',
            rescheduled: '已改期',
          };
          return (
            <Tag color={statusColors[status] || 'default'}>
              {statusTexts[status] || status}
            </Tag>
          );
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 120,
        render: (_: any, record: Schedule) => {
          const canCancel = record.status === 'scheduled' && dayjs(record.startTime).isAfter(dayjs());
          
          if (!canCancel) {
            return <span style={{ color: '#999' }}>-</span>;
          }

          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                danger
                onClick={() => handleCancelSchedule(record)}
              >
                取消
              </Button>
              <Popconfirm
                title="确认删除排课？"
                description="删除后数据将无法恢复"
                onConfirm={() => handleDeleteSchedule(record)}
                okText="确认"
                cancelText="取消"
                okType="danger"
              >
                <Button
                  type="link"
                  size="small"
                  danger
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          );
        },
      },
    ];

    const allSchedules = Object.values(weekSchedules)
      .flat()
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

    return (
      <Table
        columns={columns}
        dataSource={allSchedules}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
      />
    );
  };

  const totalSchedules = Object.values(weekSchedules).reduce(
    (sum, schedules) => sum + schedules.length,
    0
  );

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>每周排课</h1>
        <Space>
          <Button onClick={handlePrevWeek}>上一周</Button>
          <Button type="primary" onClick={handleToday}>本周</Button>
          <Button onClick={handleNextWeek}>下一周</Button>
          <DatePicker
            value={currentWeek}
            onChange={(date) => date && setCurrentWeek(date)}
            picker="week"
            format="YYYY年 第WW周"
          />
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large">
          <div>
            <CalendarOutlined style={{ marginRight: 8, color: '#1890ff' }} />
            <span style={{ fontWeight: 'bold' }}>
              {currentWeek.startOf('isoWeek').format('YYYY年MM月DD日')} - {currentWeek.endOf('isoWeek').format('MM月DD日')}
            </span>
          </div>
          <div>
            共 <span style={{ color: '#1890ff', fontWeight: 'bold', fontSize: 18 }}>{totalSchedules}</span> 节课
          </div>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <Tabs
          defaultActiveKey="calendar"
          items={[
            {
              key: 'calendar',
              label: '日历视图',
              children: (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(7, 1fr)', 
                  gap: 12 
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
        title="批量划课"
        open={batchAttendanceVisible}
        onCancel={() => {
          setBatchAttendanceVisible(false);
          setSelectedSchedule(null);
          setClassStudents([]);
          setStudentAttendance({});
        }}
        onOk={handleBatchAttendanceSubmit}
        width={700}
        okText="确认提交"
        cancelText="取消"
      >
        {selectedSchedule && (
          <div>
            <div style={{ 
              background: '#f5f5f5', 
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
              <p style={{ margin: 0 }}>教练：{selectedSchedule.teacherName}</p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Space>
                <span>批量设置考勤状态：</span>
                <Select 
                  value={batchStatus} 
                  onChange={handleBatchSetStatus}
                  style={{ width: 120 }}
                >
                  <Select.Option value="present">出勤</Select.Option>
                  <Select.Option value="absent">缺勤</Select.Option>
                </Select>
              </Space>
            </div>

            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              学员列表 ({classStudents.length} 人)：
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <Table
                size="small"
                dataSource={classStudents}
                rowKey="id"
                pagination={false}
                columns={[
                  {
                    title: '学员姓名',
                    dataIndex: 'name',
                    key: 'name',
                  },
                  {
                    title: '手机号',
                    dataIndex: 'phone',
                    key: 'phone',
                  },
                  {
                    title: '剩余课时',
                    dataIndex: 'remainingLessons',
                    key: 'remainingLessons',
                    render: (val: number) => (
                      <span style={{ color: val <= 5 ? '#ff4d4f' : 'inherit' }}>
                        {val}
                      </span>
                    ),
                  },
                  {
                    title: '考勤状态',
                    key: 'attendance',
                    render: (_: any, record: any) => (
                      <Select
                        value={studentAttendance[record.id] || 'present'}
                        onChange={(value) => {
                          setStudentAttendance({
                            ...studentAttendance,
                            [record.id]: value,
                          });
                        }}
                        style={{ width: 100 }}
                        size="small"
                      >
                        <Select.Option value="present">出勤</Select.Option>
                        <Select.Option value="absent">缺勤</Select.Option>
                      </Select>
                    ),
                  },
                ]}
              />
            </div>

            <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 4 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                ⚠️ 提示：
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                1. 提交后将为所有学员创建考勤记录
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                2. 仅出勤会扣除1课时，缺勤不扣课时
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                3. 课时不足的学员将跳过扣课时操作
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WeeklySchedule;
