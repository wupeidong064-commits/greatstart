import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, DatePicker, Spin, message, Tabs, Modal, Select } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../services/api';
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
  endTime?: string;
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
      // 获取当前周的日期范围
      const weekStart = currentWeek.startOf('isoWeek');
      const weekEnd = currentWeek.endOf('isoWeek');

      // 获取所有班级数据（包含 scheduleRule）
      const response = await api.get('/classes', {
        params: { pageSize: 1000 }
      });
      const classes = response.data || [];

      // 按星期几分组
      const grouped: Record<number, Schedule[]> = {
        1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: []
      };

      // 调试：输出所有班级的 scheduleRule
      console.log('=== 每周排课调试 ===');
      console.log('当前周范围:', weekStart.format('YYYY-MM-DD'), '-', weekEnd.format('YYYY-MM-DD'));

      // 遍历每个班级，根据 scheduleRule 生成本周排课
      for (const cls of classes) {
        // 跳过非活跃班级
        if (cls.status !== 'active') continue;

        const scheduleRule = cls.scheduleRule;
        if (!scheduleRule || !scheduleRule.weekDays || scheduleRule.weekDays.length === 0) continue;

        // 检查班级有效期是否覆盖当前周
        const ruleStartDate = scheduleRule.startDate ? dayjs(scheduleRule.startDate) : null;
        const ruleEndDate = scheduleRule.endDate ? dayjs(scheduleRule.endDate) : null;

        // 如果有效期在当前周之前结束，或当前周之后开始，则跳过
        if (ruleEndDate && ruleEndDate.isBefore(weekStart, 'day')) continue;
        if (ruleStartDate && ruleStartDate.isAfter(weekEnd, 'day')) continue;

        // 只计算 active 状态的学员数
        const activeEnrollments = cls.enrollments?.filter((e: any) => e.status === 'active') || [];

        // 为每个上课日生成排课记录
        for (const dayOfWeek of scheduleRule.weekDays) {
          // dayOfWeek: 0=周日, 1=周一, ..., 6=周六
          // 检查该上课日是否在当前周内且在有效期内
          const dayDate = weekStart.add(dayOfWeek === 0 ? 6 : dayOfWeek - 1, 'day');

          // 检查是否在有效期内
          if (ruleStartDate && dayDate.isBefore(ruleStartDate, 'day')) continue;
          if (ruleEndDate && dayDate.isAfter(ruleEndDate, 'day')) continue;

          console.log(`     添加到 grouped[${dayOfWeek}]`);

          // 构建该天的具体时间
          const [startHour, startMinute] = (scheduleRule.startTime || '09:00').split(':').map(Number);
          const [endHour, endMinute] = (scheduleRule.endTime || '10:00').split(':').map(Number);
          const scheduleDateTime = dayDate.hour(startHour).minute(startMinute).second(0);
          const endDateTime = dayDate.hour(endHour).minute(endMinute).second(0);

          // 使用 classId + 日期作为虚拟 ID（用于批量划课)
          const virtualId = `${cls.id}_${dayDate.format('YYYY-MM-DD')}`;

          grouped[dayOfWeek].push({
            id: virtualId,
            classId: cls.id,
            className: cls.name || '-',
            classCode: cls.code || '-',
            teacherId: cls.teacherId,
            teacherName: cls.teacher?.name || '-',
            startTime: scheduleDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
            classroom: '-',
            status: 'scheduled',
            studentCount: activeEnrollments.length,
          });
        }
      }

      // 按开始时间排序
      Object.keys(grouped).forEach(day => {
        grouped[Number(day)].sort((a, b) =>
          dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()
        );
      });

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

  // 打开批量划课模态框
  const handleBatchAttendance = async (schedule: Schedule) => {
    // 检查是否是当天（划课只能当天进行）
    const scheduleDate = dayjs(schedule.startTime).tz('Asia/Shanghai').startOf('day');
    const today = dayjs().tz('Asia/Shanghai').startOf('day');

    if (!scheduleDate.isSame(today, 'day')) {
      message.warning(`该课程日期为 ${scheduleDate.format('YYYY-MM-DD')}，划课只能在当天进行`);
      return;
    }

    // 检查非管理员是否已划过今天的课
    const user = JSON.parse(localStorage.getItem('auth-storage') || '{}').state?.user;
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      try {
        const todayStr = today.format('YYYY-MM-DD');
        const checkResponse = await api.get(`/lesson-deductions/check/${schedule.classId}`, {
          params: { date: todayStr }
        });

        if (checkResponse.data?.hasDeducted) {
          message.warning('您今天已经为该班级划过课了，非管理员每天只能划一次');
          return;
        }
      } catch (error) {
        console.error('检查划课记录失败:', error);
        // 继续执行，但记录错误
      }
    }

    setSelectedSchedule(schedule);
    setBatchAttendanceVisible(true);

    try {
      // 获取班级学员列表
      const response = await api.get(`/classes/${schedule.classId}/students`);
      const students = response.data || [];
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

    // 获取课程日期
    const scheduleDate = dayjs(selectedSchedule.startTime).format('YYYY-MM-DD');

    try {
      setLoading(true);

      // 为每个学员创建考勤记录并扣课时
      const promises = classStudents.map(async (student: any) => {
        const status = studentAttendance[student.id];

        // 先检查是否已存在考勤记录（通过 classId + studentId + date）
        const existingResponse = await api.get('/attendances', {
          params: {
            classId: selectedSchedule.classId,
            studentId: student.id,
            date: scheduleDate,
          }
        });
        const existingAttendances = existingResponse.data || [];

        if (existingAttendances && existingAttendances.length > 0) {
          // 如果已存在，更新考勤记录
          const existingId = existingAttendances[0].id;
          await api.put(`/attendances/${existingId}`, { status });

          // 如果之前不是出勤，现在改为出勤，则需要扣课时
          const wasPresent = existingAttendances[0].status === 'present';
          const isNowPresent = status === 'present';

          if (!wasPresent && isNowPresent && student.remainingLessons > 0) {
            // 从非出勤改为出勤，需要扣课时
            await api.post('/lesson-logs/deduct', {
              studentId: student.id,
              lessons: 1,
              notes: `批量划课 - ${scheduleDate}`,
            });
          }
        } else {
          // 不存在，创建新考勤记录
          await api.post('/attendances', {
            organizationId: user.organizationId,
            classId: selectedSchedule.classId,
            studentId: student.id,
            status: status,
            date: scheduleDate,
          });

          // 只有出勤才扣除课时
          if (status === 'present' && student.remainingLessons > 0) {
            await api.post('/lesson-logs/deduct', {
              studentId: student.id,
              lessons: 1,
              notes: `批量划课 - ${scheduleDate}`,
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
    const scheduleDate = dayjs(schedule.startTime).tz('Asia/Shanghai');
    const today = dayjs().tz('Asia/Shanghai').startOf('day');
    const isToday = scheduleDate.isSame(today, 'day');
    const isPast = scheduleDate.isBefore(today, 'day');

    return (
      <Card
        key={schedule.id}
        size="small"
        style={{
          marginBottom: 8,
          opacity: isPast ? 0.6 : 1,
          borderColor: isToday ? '#1890ff' : undefined,
        }}
        hoverable={isToday}
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
            </Space>
            {isToday && (
              <div style={{ marginTop: 8 }}>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleBatchAttendance(schedule)}
                >
                  批量划课
                </Button>
              </div>
            )}
          </div>
          <Tag color={isPast ? 'default' : (isToday ? 'blue' : 'green')}>
            {isPast ? '已过' : (isToday ? '今天' : '待上课')}
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
        size="small"
        title={
          <div style={{ textAlign: 'center', padding: '4px 0' }}>
            <div style={{
              fontSize: 14,
              fontWeight: isToday ? 'bold' : 'normal',
              color: isToday ? '#1890ff' : 'inherit'
            }}>
              {day.label}
            </div>
            <div style={{
              fontSize: 11,
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
          minWidth: 0,
        }}
        styles={{
          header: {
            backgroundColor: isToday ? '#e6f7ff' : '#fafafa',
            borderBottom: isToday ? '2px solid #1890ff' : '1px solid #f0f0f0',
            padding: '8px 12px',
            minHeight: 'auto',
          },
          body: {
            padding: 8,
            maxHeight: 'calc(100vh - 250px)',
            overflowY: 'auto',
          },
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
        title: '状态',
        key: 'status',
        width: 90,
        render: (_: any, record: Schedule) => {
          const scheduleDate = dayjs(record.startTime).tz('Asia/Shanghai');
          const today = dayjs().tz('Asia/Shanghai').startOf('day');
          const isToday = scheduleDate.isSame(today, 'day');
          const isPast = scheduleDate.isBefore(today, 'day');

          return (
            <Tag color={isPast ? 'default' : (isToday ? 'blue' : 'green')}>
              {isPast ? '已过' : (isToday ? '今天' : '待上课')}
            </Tag>
          );
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 100,
        render: (_: any, record: Schedule) => {
          const scheduleDate = dayjs(record.startTime).tz('Asia/Shanghai');
          const today = dayjs().tz('Asia/Shanghai').startOf('day');
          const isToday = scheduleDate.isSame(today, 'day');

          if (!isToday) {
            return <span style={{ color: '#999' }}>-</span>;
          }

          return (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
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
                  gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))',
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
              <p style={{ margin: 0, fontSize: 12, color: '#666', fontWeight: 'bold' }}>
                划课规则：
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: '#666' }}>
                1. 排课划课只能在当天进行
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: '#666' }}>
                2. 非管理员每天只能为同一班级划课一次
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: '#666' }}>
                3. 提交后将为所有学员创建考勤记录
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: '#666' }}>
                4. 仅出勤会扣除1课时，缺勤不扣课时
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, color: '#666' }}>
                5. 课时不足的学员将跳过扣课时操作
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WeeklySchedule;
