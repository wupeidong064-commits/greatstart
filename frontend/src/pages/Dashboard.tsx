import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import api from '../services/api';

// 后端 /statistics/dashboard 真实返回形状（扁平结构）：
// { totalStudents, todaySchedules, todayAttendance, monthChange, monthNewEnrollments,
//   monthRecalled, monthNonRenewals, monthDeletedRoster, monthRevenue, attendanceRate,
//   attendanceTrend, recentLeads, recentConversions }
const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response: any = await api.get('/statistics/dashboard');
      if (response?.success && response?.data) {
        setData(response.data);
      } else {
        setData(null);
      }
    } catch (error) {
      console.error('获取仪表盘数据失败:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const leadColumns = [
    {
      title: '线索',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (name: string) => name || '-',
    },
    {
      title: '联系方式',
      dataIndex: 'contact',
      key: 'contact',
      render: (text: string) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag>{status || '-'}</Tag>,
    },
  ];

  const conversionColumns = [
    {
      title: '学员',
      dataIndex: ['student', 'name'],
      key: 'student',
      render: (name: string) => name || '-',
    },
    {
      title: '课程类型',
      dataIndex: 'courseType',
      key: 'courseType',
      render: (text: string) => text || '-',
    },
    {
      title: '金额',
      dataIndex: 'price',
      key: 'price',
      render: (amount: any) =>
        amount === null || amount === undefined ? '-' : `¥${Number(amount).toFixed(2)}`,
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>仪表盘</h1>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="活跃学员"
              value={data?.totalStudents || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="今日课程"
              value={data?.todaySchedules || 0}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="今日出勤"
              value={data?.todayAttendance || 0}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="本月现金流"
              value={Number(data?.monthRevenue || 0)}
              precision={2}
              prefix={<DollarOutlined />}
              valueStyle={{ color: 'var(--ok)' }}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="本月净变化"
              value={data?.monthChange || 0}
              prefix={<RiseOutlined />}
              valueStyle={{ color: (data?.monthChange || 0) >= 0 ? 'var(--ok)' : 'var(--bad)' }}
              suffix={
                <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
                  （新增{data?.monthNewEnrollments || 0} / 回流{data?.monthRecalled || 0} / 不续费
                  {data?.monthNonRenewals || 0} / 删册{data?.monthDeletedRoster || 0}）
                </span>
              }
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={loading}>
            <Statistic
              title="本月出勤率"
              value={data?.attendanceRate || 0}
              suffix="%"
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="最近线索" loading={loading}>
            <Table
              dataSource={data?.recentLeads || []}
              columns={leadColumns}
              pagination={false}
              size="small"
              rowKey="id"
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="最近成单" loading={loading}>
            <Table
              dataSource={data?.recentConversions || []}
              columns={conversionColumns}
              pagination={false}
              size="small"
              rowKey="id"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
