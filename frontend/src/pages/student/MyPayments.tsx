import { useState, useEffect, useRef } from 'react';
import { Table, Card, Tag, DatePicker, Select, Statistic, Row, Col, Space, Alert, Button, Empty, Pagination, Spin } from 'antd';
import { DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useIsMobile } from '../../components/Layout';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface Student {
  id: string;
  name: string;
}

// 2026-11-08 用户拍板：家长端缴费记录改读成单表（新签+续费成交记录），与经营侧口径一致
interface ConversionRecord {
  id: string;
  price: number | string;
  totalLessons: number;
  courseType: string | null;
  conversionDate: string | null;
  className: string | null;
}

interface PaymentSummary {
  totalAmount: number;
  totalLessons: number;
  paymentByType: Record<string, number>;
  countByType: Record<string, number>;
}

const MyPayments = () => {
  const isMobile = useIsMobile();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [payments, setPayments] = useState<ConversionRecord[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const requestSequence = useRef(0);
  const mounted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(365, 'day'),
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

  // 当选择学员或日期范围变化时，获取缴费记录
  useEffect(() => {
    if (selectedStudentId) {
      fetchPayments();
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

  const fetchPayments = async () => {
    if (!selectedStudentId) return;
    const request = ++requestSequence.current;
    setLoading(true);
    setError('');
    setPayments([]);
    setSummary(null);
    try {
      const params: any = { page: pagination.current, pageSize: pagination.pageSize };

      if (dateRange && dateRange[0] && dateRange[1]) {
        // 成单日期为 YYYY-MM-DD 业务日字符串，直接传日期串（后端按字符串窗口比较）
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await api.get(`/parent/payments/${selectedStudentId}`, { params });
      if (request !== requestSequence.current) return;
      const result = response.data;
      if (!Array.isArray(result?.data) || !result.summary || !result.pagination)
        throw new Error('缴费记录格式异常，请重试');
      setPayments(result.data);
      setSummary(result.summary);
      setPagination((previous) => ({ ...previous, total: result.pagination.total }));
    } catch (error: any) {
      if (request !== requestSequence.current) return;
      setError(error.response?.data?.error?.message || error.message || '获取缴费记录失败');
      setPagination((previous) => ({ ...previous, total: 0 }));
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  };

  const RENEWAL_TYPES = ['续费', 'renewal', '续报'];
  const getDealTypeTag = (courseType: string | null) => {
    if (courseType && RENEWAL_TYPES.includes(courseType)) return <Tag color="green">续费</Tag>;
    return <Tag color="blue">{courseType || '新签'}</Tag>;
  };

  const columns = [
    {
      title: '成单日期',
      dataIndex: 'conversionDate',
      key: 'conversionDate',
      render: (date: string | null) => (
        <span>
          <CalendarOutlined style={{ marginRight: 8 }} />
          {date || '-'}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'courseType',
      key: 'courseType',
      width: 90,
      render: (courseType: string | null) => getDealTypeTag(courseType),
    },
    {
      title: '课时',
      dataIndex: 'totalLessons',
      key: 'totalLessons',
      width: 90,
      render: (lessons: number) => <span>{lessons ? `${lessons} 节` : '—'}</span>,
    },
    {
      title: '金额',
      dataIndex: 'price',
      key: 'price',
      render: (price: number | string) => (
        <span style={{ fontWeight: 500, color: 'var(--ok)' }}>¥{Number(price).toLocaleString()}</span>
      ),
    },
    {
      title: '班级',
      dataIndex: 'className',
      key: 'className',
      render: (name: string | null) => name || '-',
    },
  ];

  return (
    <div>
      <Card>
        <h1 style={{ marginBottom: 16 }}>报名缴费记录</h1>

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
                  setPayments([]);
                  setSummary(null);
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
                  { label: '最近30天', value: [dayjs().subtract(30, 'day'), dayjs()] },
                  { label: '最近90天', value: [dayjs().subtract(90, 'day'), dayjs()] },
                  { label: '最近半年', value: [dayjs().subtract(180, 'day'), dayjs()] },
                  { label: '最近一年', value: [dayjs().subtract(365, 'day'), dayjs()] },
                ]}
              />
            </div>
          </Space>
        </div>

        {/* 统计信息 */}
        {selectedStudentId && (
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={8}>
              <Statistic
                title="累计成交金额"
                value={summary?.totalAmount ?? '—'}
                prefix={<DollarOutlined />}
                precision={2}
                valueStyle={{ color: 'var(--ok)' }}
              />
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title="累计成交课时"
                value={summary?.totalLessons ?? '—'}
                suffix="节"
              />
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" title="按类型统计">
                <Space direction="vertical" style={{ width: '100%' }}>
                  {summary && Object.entries(summary.paymentByType).length > 0 ? (
                    Object.entries(summary.paymentByType).map(([type, amount]) => (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{getDealTypeTag(type)}</span>
                        <span style={{ fontWeight: 500 }}>¥{Number(amount).toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <span style={{ color: 'var(--tx3)' }}>{summary ? '暂无数据' : '—'}</span>
                  )}
                </Space>
              </Card>
            </Col>
          </Row>
        )}

        {/* 缴费记录列表 */}
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
            action={
              <Button onClick={() => (selectedStudentId ? fetchPayments() : fetchStudents())}>重试</Button>
            }
          />
        )}
        {!loading && !error && students.length === 0 ? (
          <Empty description="暂无关联学员" />
        ) : isMobile ? (
          /* 手机宽度：表格换卡片列表，金额/课时/班级不再被裁列（2026-11-15 用户拍板修正） */
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <Spin />
              </div>
            ) : payments.length === 0 ? (
              <Empty description={error ? '记录加载失败，请重试' : '所选时间内暂无缴费记录'} />
            ) : (
              <>
                {payments.map((rec) => (
                  <div
                    key={rec.id}
                    style={{ background: 'var(--card2)', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span>
                        <CalendarOutlined style={{ marginRight: 8 }} />
                        {rec.conversionDate || '-'}
                      </span>
                      {getDealTypeTag(rec.courseType)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 500, color: 'var(--ok)' }}>¥{Number(rec.price).toLocaleString()}</span>
                      <span style={{ color: 'var(--tx3)' }}>{rec.totalLessons ? `${rec.totalLessons} 节` : '—'}</span>
                    </div>
                    {rec.className && (
                      <div style={{ marginTop: 6, color: 'var(--tx3)', fontSize: 12 }}>班级：{rec.className}</div>
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
        ) : (
          <Table
            columns={columns}
            dataSource={payments}
            loading={loading}
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
            locale={{ emptyText: error ? '记录加载失败，请重试' : '所选时间内暂无缴费记录' }}
          />
        )}
      </Card>
    </div>
  );
};

export default MyPayments;
