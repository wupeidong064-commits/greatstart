import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, DatePicker, Button, message, Progress } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  CalendarOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../services/api';

const { MonthPicker } = DatePicker;

const MonthlySummary = () => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs>(dayjs());

  useEffect(() => {
    fetchMonthlySummary();
  }, []);

  const fetchMonthlySummary = async () => {
    setLoading(true);
    try {
      const month = selectedMonth.format('YYYY-MM');
      const response = await api.get('/statistics/monthly-summary', {
        params: { month },
      });
      if (response.success && response.data) {
        setSummary(response.data);
      } else {
        setSummary({});
      }
    } catch (error: any) {
      console.error('获取月运营数据失败:', error);
      setSummary({});
      if (error.response?.status !== 404) {
        message.error('获取月运营数据失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (date: any) => {
    if (date) {
      setSelectedMonth(date);
    }
  };

  const weeklyColumns = [
    {
      title: '周次',
      dataIndex: 'week',
      key: 'week',
    },
    {
      title: '新增学员',
      dataIndex: 'newStudents',
      key: 'newStudents',
    },
    {
      title: '新增报名',
      dataIndex: 'newEnrollments',
      key: 'newEnrollments',
    },
    {
      title: '出勤人次',
      dataIndex: 'attendanceCount',
      key: 'attendanceCount',
    },
    {
      title: '出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      render: (rate: number) => (
        <Progress percent={rate} size="small" style={{ width: 100 }} />
      ),
    },
    {
      title: '收入',
      dataIndex: 'revenue',
      key: 'revenue',
      render: (amount: number) => `¥${amount?.toFixed(2) || '0.00'}`,
    },
  ];

  const trendColumns = [
    {
      title: '指标',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '本月',
      dataIndex: 'current',
      key: 'current',
    },
    {
      title: '上月',
      dataIndex: 'last',
      key: 'last',
    },
    {
      title: '变化',
      dataIndex: 'change',
      key: 'change',
      render: (change: number) => (
        <span style={{ color: change >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {change >= 0 ? <RiseOutlined /> : <FallOutlined />}
          {Math.abs(change)}%
        </span>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>月运营数据总结分析</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <MonthPicker
              value={selectedMonth}
              onChange={handleMonthChange}
              format="YYYY-MM"
            />
            <Button type="primary" onClick={fetchMonthlySummary}>
              查询
            </Button>
          </div>
        </div>

        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="新增学员"
                value={summary.totalNewStudents || 0}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="新增报名"
                value={summary.totalNewEnrollments || 0}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="总出勤人次"
                value={summary.totalAttendance || 0}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平均出勤率"
                value={summary.avgAttendanceRate || 0}
                suffix="%"
                prefix={<CalendarOutlined />}
                valueStyle={{ color: '#eb2f96' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总收入"
                value={summary.totalRevenue || 0}
                prefix={<DollarOutlined />}
                precision={2}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="新增班级"
                value={summary.newClasses || 0}
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="活跃学员数"
                value={summary.activeStudents || 0}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="续费率"
                value={summary.renewalRate || 0}
                suffix="%"
                prefix={<RiseOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card title="每周数据明细" loading={loading}>
              <Table
                columns={weeklyColumns}
                dataSource={summary.weeklyData || []}
                rowKey="week"
                pagination={false}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="同比分析" loading={loading}>
              <Table
                columns={trendColumns}
                dataSource={summary.trends || []}
                rowKey="name"
                pagination={false}
              />
            </Card>
          </Col>
        </Row>

        {summary.analysis && (
          <Card title="运营分析总结" loading={loading}>
            <div style={{ lineHeight: 1.8 }}>
              {summary.analysis.split('\n').map((line: string, index: number) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </Card>
        )}
      </Card>
    </div>
  );
};

export default MonthlySummary;

