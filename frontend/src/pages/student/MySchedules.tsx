import { useState, useEffect } from 'react';
import { Table, Card, Tag, DatePicker, message, Select, Space, Empty } from 'antd';
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
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs(),
    dayjs().add(30, 'day'),
  ]);

  // 获取关联的学员列表
  useEffect(() => {
    fetchStudents();
  }, []);

  // 当选择学员或日期范围变化时，获取课表
  useEffect(() => {
    if (selectedStudentId) {
      fetchSchedules();
    }
  }, [selectedStudentId, dateRange]);

  const fetchStudents = async () => {
    try {
      const response = await api.get('/parent/students');
      setStudents(response.data || []);

      // 如果有学员，默认选择第一个
      if (response.data && response.data.length > 0) {
        setSelectedStudentId(response.data[0].id);
      }
    } catch (error: any) {
      console.error('获取学员列表失败:', error);
      if (error.response?.data?.error?.message) {
        message.error(error.response.data.error.message);
      } else {
        message.error('获取学员列表失败');
      }
    }
  };

  const fetchSchedules = async () => {
    if (!selectedStudentId) return;

    setLoading(true);
    try {
      const params: any = {
        studentId: selectedStudentId,
      };

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      const response = await api.get(`/parent/schedules/${selectedStudentId}`, { params });
      setSchedules(response.data || []);
    } catch (error: any) {
      console.error('获取课表失败:', error);
      if (error.response?.data?.error?.message) {
        message.error(error.response.data.error.message);
      } else {
        message.error('获取课表失败');
      }
      setSchedules([]);
    } finally {
      setLoading(false);
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
          <div style={{ color: '#666', marginTop: 4 }}>
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
          <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
            {record.class.code} · {record.class.courseType}
          </div>
        </div>
      ),
    },
    {
      title: '教练',
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
      title: '校区',
      dataIndex: ['campus', 'name'],
      key: 'campus',
      render: (name: string) => name || '-',
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

        {/* 学员选择 */}
        {students.length > 1 && (
          <div style={{ marginBottom: 24 }}>
            <Space>
              <span>选择学员：</span>
              <Select
                style={{ width: 200 }}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                options={students.map((s) => ({ label: s.name, value: s.id }))}
              />
            </Space>
          </div>
        )}

        {/* 筛选区域 */}
        <div style={{ marginBottom: 24, padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
          <Space wrap size="middle">
            <div>
              <span style={{ marginRight: 8 }}>时间范围：</span>
              <RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
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
        {students.length === 0 ? (
          <Empty description="暂无关联学员" />
        ) : (
          <Table
            columns={columns}
            dataSource={schedules}
            loading={loading}
            rowKey="id"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 节课`,
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default MySchedules;
