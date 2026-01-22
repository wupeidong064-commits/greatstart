import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, DatePicker, Spin, message, Tabs, Modal, Popconfirm } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, EnvironmentOutlined, UserOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { memfireDB } from '../services/memfireDB';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekday from 'dayjs/plugin/weekday';

dayjs.extend(isoWeek);
dayjs.extend(weekday);

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
      const startDate = currentWeek.startOf('isoWeek').format('YYYY-MM-DD');
      const endDate = currentWeek.endOf('isoWeek').format('YYYY-MM-DD');

      const schedules = await memfireDB.schedules.list({
        startDate,
        endDate,
        includeAll: true, // 包含所有状态，包括已取消的
      });

      // 按星期几分组
      const grouped: Record<number, Schedule[]> = {
        1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: []
      };

      for (const schedule of schedules || []) {
        const dayOfWeek = dayjs(schedule.startTime).day();
        const classInfo = schedule.class as any;
        
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
          studentCount: classInfo?.enrollments?.length || 0,
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
    Modal.confirm({
      title: '确认取消排课',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>确定要取消以下排课吗？</p>
          <p style={{ marginTop: 8 }}>
            <strong>{schedule.className} ({schedule.classCode})</strong>
          </p>
          <p>时间：{dayjs(schedule.startTime).format('YYYY-MM-DD HH:mm')} - {dayjs(schedule.endTime).format('HH:mm')}</p>
          <p>教练：{schedule.teacherName}</p>
          <p style={{ color: '#ff4d4f', marginTop: 12 }}>
            ⚠️ 取消后该排课状态将变为"已取消"，无法恢复
          </p>
        </div>
      ),
      okText: '确认取消',
      okType: 'danger',
      cancelText: '返回',
      onOk: async () => {
        try {
          await memfireDB.schedules.cancel(schedule.id);
          message.success('排课已取消');
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
          <p>时间：{dayjs(schedule.startTime).format('YYYY-MM-DD HH:mm')} - {dayjs(schedule.endTime).format('HH:mm')}</p>
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
                {dayjs(schedule.startTime).format('HH:mm')} - {dayjs(schedule.endTime).format('HH:mm')}
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
            {dayjs(record.startTime).format('HH:mm')} - {dayjs(record.endTime).format('HH:mm')}
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
    </div>
  );
};

export default WeeklySchedule;
