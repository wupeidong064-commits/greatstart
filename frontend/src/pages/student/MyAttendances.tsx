import { useState, useEffect } from 'react';
import { Table, Card, Tag, DatePicker, Select, Statistic, Row, Col, Space, message, Empty } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, FileTextOutlined, CalendarOutlined } from '@ant-design/icons';
import api from '../../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface Student {
  id: string;
  name: string;
}

interface Attendance {
  id: string;
  checkInTime: string;
  status: string;
  notes: string | null;
  schedule: {
    startTime: string;
    endTime: string;
    classroom: string | null;
  };
  class: {
    id: string;
    name: string;
    code: string;
  };
}

interface AttendanceStats {
  present: number;
  absent: number;
  late: number;
  leave: number;
  attendanceRate: number;
}

const MyAttendances = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [stats, setStats] = useState<AttendanceStats>({
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    attendanceRate: 0,
  });
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(90, 'day'),
    dayjs(),
  ]);

  // 获取关联的学员列表
  useEffect(() => {
    fetchStudents();
  }, []);

  // 当选择学员或日期范围变化时，获取出勤记录
  useEffect(() => {
    if (selectedStudentId) {
      fetchAttendances();
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
      message.error('获取学员列表失败');
    }
  };

  const fetchAttendances = async () => {
    if (!selectedStudentId) return;

    setLoading(true);
    try {
      const params: any = {};

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      const response = await api.get(`/parent/attendances/${selectedStudentId}`, { params });
      setAttendances(response.data.data || []);
      setStats(response.data.stats || {
        present: 0,
        absent: 0,
        late: 0,
        leave: 0,
        attendanceRate: 0,
      });
    } catch (error: any) {
      console.error('获取出勤记录失败:', error);
      message.error('获取出勤记录失败');
      setAttendances([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
      present: { text: '出勤', color: 'success', icon: <CheckCircleOutlined /> },
      absent: { text: '缺勤', color: 'error', icon: <CloseCircleOutlined /> },
      late: { text: '迟到', color: 'warning', icon: <ClockCircleOutlined /> },
      leave: { text: '请假', color: 'default', icon: <FileTextOutlined /> },
    };
    const info = statusMap[status] || { text: status, color: 'default', icon: null };
    return (
      <Tag color={info.color} icon={info.icon}>
        {info.text}
      </Tag>
    );
  };

  const columns = [
    {
      title: '上课日期',
      key: 'date',
      render: (_: any, record: Attendance) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            <CalendarOutlined style={{ marginRight: 8 }} />
            {dayjs(record.checkInTime).format('YYYY-MM-DD')}
          </div>
          <div style={{ color: '#666', fontSize: '12px', marginTop: 4 }}>
            {dayjs(record.schedule.startTime).format('HH:mm')} - {dayjs(record.schedule.endTime).format('HH:mm')}
          </div>
        </div>
      ),
    },
    {
      title: '课程',
      key: 'course',
      render: (_: any, record: Attendance) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.class.name}</div>
          <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>{record.class.code}</div>
        </div>
      ),
    },
    {
      title: '教室',
      key: 'classroom',
      render: (_: any, record: Attendance) => record.schedule.classroom || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      render: (notes: string | null) => notes || '-',
    },
  ];

  return (
    <div>
      <Card>
        <h1 style={{ marginBottom: 16 }}>出勤记录</h1>

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
                  { label: '最近7天', value: [dayjs().subtract(7, 'day'), dayjs()] },
                  { label: '最近30天', value: [dayjs().subtract(30, 'day'), dayjs()] },
                  { label: '最近90天', value: [dayjs().subtract(90, 'day'), dayjs()] },
                  { label: '本月', value: [dayjs().startOf('month'), dayjs()] },
                ]}
              />
            </div>
          </Space>
        </div>

        {/* 统计信息 */}
        {selectedStudentId && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Statistic
                title="出勤"
                value={stats.present}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="迟到"
                value={stats.late}
                valueStyle={{ color: '#faad14' }}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="缺勤"
                value={stats.absent}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="出勤率"
                value={stats.attendanceRate}
                suffix="%"
                precision={1}
                valueStyle={{ color: stats.attendanceRate >= 80 ? '#52c41a' : stats.attendanceRate >= 60 ? '#faad14' : '#ff4d4f' }}
              />
            </Col>
          </Row>
        )}

        {/* 出勤记录列表 */}
        {students.length === 0 ? (
          <Empty description="暂无关联学员" />
        ) : (
          <Table
            columns={columns}
            dataSource={attendances}
            loading={loading}
            rowKey="id"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条记录`,
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default MyAttendances;
