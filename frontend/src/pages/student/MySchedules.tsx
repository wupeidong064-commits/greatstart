import { useState, useEffect, useRef } from 'react';
import { Table, Card, Tag, DatePicker, Alert, Button, Select, Space, Empty } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, EnvironmentOutlined, TeamOutlined } from '@ant-design/icons';
import api from '../../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface Student {
  id: string;
  name: string;
  enrollments: Array<{
    class: {
      id: string;
      name: string;
      code: string;
    };
  }>;
}

interface Schedule {
  id: string;
  startTime: string;
  endTime: string;
  classroom: string | null;
  status: string;
  class: {
    id: string;
    name: string;
    code: string;
    courseType: string;
  };
  teacher: {
    id: string;
    name: string;
  } | null;
  campus: {
    id: string;
    name: string;
  } | null;
}

const MySchedules = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const requestSequence = useRef(0);
  const mounted = useRef(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs(),
    dayjs().add(30, 'day'),
  ]);
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const enrolledClassNames = [
    ...new Set(selectedStudent?.enrollments.map((enrollment) => enrollment.class.name) || []),
  ];

  // 获取关联的学员列表
  useEffect(() => {
    mounted.current = true;
    fetchStudents();
    return () => {
      mounted.current = false;
    };
  }, []);

  // 当选择学员或日期范围变化时，获取课表
  useEffect(() => {
    if (selectedStudentId) {
      fetchSchedules();
    }
    return () => {
      requestSequence.current++;
    };
  }, [selectedStudentId, dateRange, pagination.current, pagination.pageSize]);

  const fetchStudents = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/parent/students');
      if (!mounted.current) return;
      if (!Array.isArray(response.data)) throw new Error('学员列表格式异常，请重试');
      setStudents(response.data || []);

      // 如果有学员，默认选择第一个
      if (response.data && response.data.length > 0) {
        setSelectedStudentId(response.data[0].id);
      }
    } catch (error: any) {
      if (mounted.current)
        setError(error.response?.data?.error?.message || error.message || '获取学员列表失败');
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    if (!selectedStudentId) return;
    const request = ++requestSequence.current;
    setLoading(true);
    setError('');
    setSchedules([]);
    try {
      const params: any = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      const response = await api.get(`/parent/schedules/${selectedStudentId}`, { params });
      if (request !== requestSequence.current) return;
      if (!Array.isArray(response.data)) throw new Error('课表格式异常，请重试');
      setSchedules(response.data);
      setPagination((previous) => ({
        ...previous,
        total: (response as any).pagination?.total ?? response.data.length,
      }));
    } catch (error: any) {
      if (request !== requestSequence.current) return;
      setError(error.response?.data?.error?.message || error.message || '获取课表失败');
      setPagination((previous) => ({ ...previous, total: 0 }));
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      scheduled: { text: '已排课', color: 'blue' },
      completed: { text: '已完成', color: 'green' },
      cancelled: { text: '已取消', color: 'red' },
      rescheduled: { text: '已调课', color: 'orange' },
    };
    const info = statusMap[status] || { text: status, color: 'default' };
    return <Tag color={info.color}>{info.text}</Tag>;
  };

  const columns = [
    {
      title: '上课时间',
      key: 'time',
      render: (_: any, record: Schedule) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            <CalendarOutlined style={{ marginRight: 8 }} />
            {dayjs(record.startTime).format('YYYY-MM-DD')}
          </div>
          <div style={{ color: 'var(--tx2)', marginTop: 4 }}>
            <ClockCircleOutlined style={{ marginRight: 8 }} />
            {dayjs(record.startTime).format('HH:mm')} - {dayjs(record.endTime).format('HH:mm')}
          </div>
        </div>
      ),
    },
    {
      title: '课程信息',
      key: 'course',
      render: (_: any, record: Schedule) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.class.name}</div>
          <div style={{ color: 'var(--tx3)', fontSize: '12px', marginTop: 4 }}>
            {record.class.code} · {record.class.courseType}
          </div>
        </div>
      ),
    },
    {
      title: '老师',
      dataIndex: ['teacher', 'name'],
      key: 'teacher',
      render: (name: string) => (
        <span>
          <TeamOutlined style={{ marginRight: 8 }} />
          {name || '-'}
        </span>
      ),
    },
    {
      title: '教室',
      key: 'classroom',
      render: (_: any, record: Schedule) => (
        <span>
          <EnvironmentOutlined style={{ marginRight: 8 }} />
          {record.classroom || '-'}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
  ];

  return (
    <div>
      <Card>
        <h1 style={{ marginBottom: 16 }}>我的课表</h1>

        {selectedStudentId && (
          <p style={{ color: 'var(--tx2)' }}>
            {enrolledClassNames.length
              ? `已加入：${enrolledClassNames.join('、')}`
              : '暂未加入班级，请联系老师安排。'}
          </p>
        )}

        {/* 学员选择 */}
        {students.length > 1 && (
          <div style={{ marginBottom: 24 }}>
            <Space>
              <span>选择学员：</span>
              <Select
                aria-label="选择学员"
                style={{ width: 200 }}
                value={selectedStudentId}
                onChange={(id) => {
                  setSchedules([]);
                  setSelectedStudentId(id);
                  setPagination((previous) => ({ ...previous, current: 1, total: 0 }));
                }}
                options={students.map((s) => ({ label: s.name, value: s.id }))}
              />
            </Space>
          </div>
        )}

        {/* 筛选区域 */}
        <div style={{ marginBottom: 24, padding: '16px', background: 'var(--card2)', borderRadius: '8px' }}>
          <Space wrap size="middle">
            <div>
              <span style={{ marginRight: 8 }}>时间范围：</span>
              <RangePicker
                value={dateRange}
                onChange={(dates) => {
                  setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null);
                  setPagination((previous) => ({ ...previous, current: 1 }));
                }}
                allowClear
                presets={[
                  { label: '今天', value: [dayjs(), dayjs()] },
                  { label: '未来7天', value: [dayjs(), dayjs().add(7, 'day')] },
                  { label: '未来30天', value: [dayjs(), dayjs().add(30, 'day')] },
                  { label: '未来90天', value: [dayjs(), dayjs().add(90, 'day')] },
                ]}
              />
            </div>
          </Space>
        </div>

        {/* 课表列表 */}
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
            action={
              <Button onClick={() => (selectedStudentId ? fetchSchedules() : fetchStudents())}>重试</Button>
            }
          />
        )}
        {!loading && !error && students.length === 0 ? (
          <Empty description="暂无关联学员" />
        ) : (
          <Table
            columns={columns}
            dataSource={schedules}
            loading={loading}
            rowKey="id"
            pagination={{
              ...pagination,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              onChange: (current, pageSize) =>
                setPagination((previous) => ({
                  ...previous,
                  current: pageSize !== previous.pageSize ? 1 : current,
                  pageSize,
                })),
              showTotal: (total) => `共 ${total} 节课`,
            }}
            locale={{
              emptyText: error ? '课表加载失败，请重试' : '所选时间内暂无排课，请联系老师确认上课时间',
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default MySchedules;
