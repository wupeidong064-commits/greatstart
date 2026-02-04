import { useState, useEffect } from 'react';
import { Table, Card, Tag, DatePicker, Select, Statistic, Row, Col, Space, message, Empty } from 'antd';
import { DollarOutlined, WalletOutlined, CalendarOutlined, FileTextOutlined } from '@ant-design/icons';
import api from '../../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface Student {
  id: string;
  name: string;
}

interface Payment {
  id: string;
  amount: number;
  paymentType: string;
  paymentMethod: string;
  paidAt: string;
  notes: string | null;
  enrollment: {
    class: {
      id: string;
      name: string;
      code: string;
    };
  };
}

interface PaymentSummary {
  totalAmount: number;
  paymentByType: Record<string, number>;
}

const MyPayments = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({
    totalAmount: 0,
    paymentByType: {},
  });
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(365, 'day'),
    dayjs(),
  ]);

  // 获取关联的学员列表
  useEffect(() => {
    fetchStudents();
  }, []);

  // 当选择学员或日期范围变化时，获取缴费记录
  useEffect(() => {
    if (selectedStudentId) {
      fetchPayments();
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

  const fetchPayments = async () => {
    if (!selectedStudentId) return;

    setLoading(true);
    try {
      const params: any = {};

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').toISOString();
        params.endDate = dateRange[1].endOf('day').toISOString();
      }

      const response = await api.get(`/parent/payments/${selectedStudentId}`, { params });
      setPayments(response.data.data || []);
      setSummary(response.data.summary || {
        totalAmount: 0,
        paymentByType: {},
      });
    } catch (error: any) {
      console.error('获取缴费记录失败:', error);
      message.error('获取缴费记录失败');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentTypeTag = (type: string) => {
    const typeMap: Record<string, { text: string; color: string }> = {
      tuition: { text: '学费', color: 'blue' },
      material: { text: '教材费', color: 'green' },
      other: { text: '其他', color: 'default' },
    };
    const info = typeMap[type] || { text: type, color: 'default' };
    return <Tag color={info.color}>{info.text}</Tag>;
  };

  const getPaymentMethodTag = (method: string) => {
    const methodMap: Record<string, { text: string; color: string }> = {
      cash: { text: '现金', color: 'default' },
      card: { text: '刷卡', color: 'blue' },
      transfer: { text: '转账', color: 'green' },
      alipay: { text: '支付宝', color: 'cyan' },
      wechat: { text: '微信', color: 'lime' },
    };
    const info = methodMap[method] || { text: method, color: 'default' };
    return <Tag color={info.color}>{info.text}</Tag>;
  };

  const columns = [
    {
      title: '缴费日期',
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (date: string) => (
        <span>
          <CalendarOutlined style={{ marginRight: 8 }} />
          {dayjs(date).format('YYYY-MM-DD')}
        </span>
      ),
    },
    {
      title: '缴费金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <span style={{ fontWeight: 500, color: '#52c41a' }}>
          ¥{Number(amount).toLocaleString()}
        </span>
      ),
    },
    {
      title: '缴费类型',
      dataIndex: 'paymentType',
      key: 'paymentType',
      render: (type: string) => getPaymentTypeTag(type),
    },
    {
      title: '缴费方式',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      render: (method: string) => getPaymentMethodTag(method),
    },
    {
      title: '关联班级',
      key: 'class',
      render: (_: any, record: Payment) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.enrollment?.class?.name || '-'}</div>
          <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
            {record.enrollment?.class?.code || '-'}
          </div>
        </div>
      ),
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
        <h1 style={{ marginBottom: 16 }}>缴费信息</h1>

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
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={12}>
              <Statistic
                title="总缴费金额"
                value={summary.totalAmount}
                prefix={<DollarOutlined />}
                precision={2}
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col span={12}>
              <Card size="small" title="按类型统计">
                <Space direction="vertical" style={{ width: '100%' }}>
                  {Object.entries(summary.paymentByType).length > 0 ? (
                    Object.entries(summary.paymentByType).map(([type, amount]) => (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{getPaymentTypeTag(type)}</span>
                        <span style={{ fontWeight: 500 }}>¥{Number(amount).toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <span style={{ color: '#999' }}>暂无数据</span>
                  )}
                </Space>
              </Card>
            </Col>
          </Row>
        )}

        {/* 缴费记录列表 */}
        {students.length === 0 ? (
          <Empty description="暂无关联学员" />
        ) : (
          <Table
            columns={columns}
            dataSource={payments}
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

export default MyPayments;
