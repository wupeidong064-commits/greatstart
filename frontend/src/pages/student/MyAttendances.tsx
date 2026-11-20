import { useState, useEffect, useRef } from 'react';
import { Table, Card, Tag, DatePicker, Select, Statistic, Row, Col, Space, Alert, Button, Empty, Pagination, Spin } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { useIsMobile } from '../../components/Layout';
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
  attendanceRate: number | null;
}

const MyAttendances = () => {
  const isMobile = useIsMobile();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const requestSequence = useRef(0);
  const mounted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(90, 'day'),
    dayjs(),
  ]);

  // 获取关联的学员列表
  useEffect(() => {
    mounted.current = true;
    fetchStudents();
    return () => {
      mounted.current = false;
    };
  }, []);

  // 当选择学员或日期范围变化时，获取出勤记录
  useEffect(() => {
    if (selectedStudentId) {
      fetchAttendances();
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

  const fetchAttendances = async () => {
    if (!selectedStudentId) return;
    const request = ++requestSequence.current;
    setLoading(true);
    setError('');
    setAttendances([]);
    setStats(null);
    try {
      const params: any = { page: pagination.current, pageSize: pagination.pageSize };

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      const response = await api.get(`/parent/attendances/${selectedStudentId}`, { params });
      if (request !== requestSequence.current) return;
      const result = response.data;
      if (!Array.isArray(result?.data) || !result.stats || !result.pagination)
        throw new Error('出勤记录格式异常，请重试');
      setAttendances(result.data);
      setStats(result.stats);
      setPagination((previous) => ({ ...previous, total: result.pagination.total }));
    } catch (error: any) {
      if (request !== requestSequence.current) return;
      setError(error.response?.data?.error?.message || error.message || '获取出勤记录失败');
      setPagination((previous) => ({ ...previous, total: 0 }));
    } finally {
      if (request === requestSequence.current) setLoading(false);
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

  // 手机宽度：表格换卡片列表（2026-11-15 用户拍板，与缴费页同模式）
  const attendanceCards = (
    <div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin />
        </div>
      ) : attendances.length === 0 ? (
        <Empty description={error ? '记录加载失败，请重试' : '所选时间内暂无出勤记录'} />
      ) : (
        <>
          {attendances.map((rec) => (
            <div
              key={rec.id}
              style={{ background: 'var(--card2)', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>
                  <CalendarOutlined style={{ marginRight: 8 }} />
                  {dayjs(rec.schedule.startTime).format('YYYY-MM-DD')}
                </span>
                {getStatusTag(rec.status)}
              </div>
              <div style={{ color: 'var(--tx2)', fontSize: 12, marginTop: 4 }}>
                {dayjs(rec.schedule.startTime).format('HH:mm')} - {dayjs(rec.schedule.endTime).format('HH:mm')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                <span style={{ fontWeight: 500 }}>{rec.class.name}</span>
                <span style={{ color: 'var(--tx3)', fontSize: 12 }}>
                  {[rec.schedule.classroom, rec.class.code].filter(Boolean).join(' · ') || '-'}
                </span>
              </div>
              {rec.notes && (
                <div style={{ marginTop: 6, color: 'var(--tx3)', fontSize: 12 }}>备注：{rec.notes}</div>
              )}
            </div>
          ))}
          <Pagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            showTotal={(total) => `共 ${total} 条记录`}
            onChange={(current, pageSize) =>
              setPagination((previous) => ({
                ...previous,
                current: pageSize !== previous.pageSize ? 1 : current,
                pageSize,
              }))
            }
            showSizeChanger={false}
            style={{ marginTop: 16, textAlign: 'center' }}
          />
        </>
      )}
    </div>
  );

  const columns = [
    {
      title: '上课日期',
      key: 'date',
      render: (_: any, record: Attendance) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            <CalendarOutlined style={{ marginRight: 8 }} />
            {dayjs(record.schedule.startTime).format('YYYY-MM-DD')}
          </div>
          <div style={{ color: 'var(--tx2)', fontSize: '12px', marginTop: 4 }}>
            {dayjs(record.schedule.startTime).format('HH:mm')} -{' '}
            {dayjs(record.schedule.endTime).format('HH:mm')}
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
          <div style={{ color: 'var(--tx3)', fontSize: '12px', marginTop: 4 }}>{record.class.code}</div>
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
                aria-label="选择学员"
                style={{ width: 200 }}
                value={selectedStudentId}
                onChange={(id) => {
                  setAttendances([]);
                  setStats(null);
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
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} md={6}>
              <Statistic
                title="出勤"
                value={stats?.present ?? '—'}
                valueStyle={{ color: 'var(--tx)' }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="迟到"
                value={stats?.late ?? '—'}
                valueStyle={{ color: 'var(--tx)' }}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="缺勤"
                value={stats?.absent ?? '—'}
                valueStyle={{ color: 'var(--tx)' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title="出勤率"
                value={stats?.attendanceRate ?? '—'}
                suffix={stats?.attendanceRate == null ? undefined : '%'}
                precision={1}
                valueStyle={{
                  color:
                    stats?.attendanceRate == null
                      ? 'var(--tx2)'
                      : stats.attendanceRate >= 80
                        ? 'var(--ok)'
                        : stats.attendanceRate >= 60
                          ? 'var(--warn)'
                          : 'var(--bad)',
                }}
              />
            </Col>
          </Row>
        )}

        {/* 出勤记录列表 */}
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
            action={
              <Button onClick={() => (selectedStudentId ? fetchAttendances() : fetchStudents())}>重试</Button>
            }
          />
        )}
        {!loading && !error && students.length === 0 ? (
          <Empty description="暂无关联学员" />
        ) : isMobile ? (
          attendanceCards
        ) : (
          <Table
            columns={columns}
            dataSource={attendances}
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
              showTotal: (total) => `共 ${total} 条记录`,
            }}
            locale={{ emptyText: error ? '记录加载失败，请重试' : '所选时间内暂无出勤记录' }}
          />
        )}
      </Card>
    </div>
  );
};

export default MyAttendances;
