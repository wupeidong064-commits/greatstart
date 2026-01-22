import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/statistics/dashboard');
      // 响应格式: { success: true, data: {...} }
      if (response.success && response.data) {
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

  const columns = [
    {
      title: '学员',
      dataIndex: ['student', 'name'],
      key: 'student',
    },
    {
      title: '班级',
      dataIndex: ['class', 'name'],
      key: 'class',
    },
    {
      title: '报名时间',
      dataIndex: 'enrolledAt',
      key: 'enrolledAt',
    },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>仪表盘</h1>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃学员"
              value={data?.overview?.totalStudents || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃班级"
              value={data?.overview?.totalClasses || 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日课程"
              value={data?.overview?.todaySchedules || 0}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日出勤"
              value={data?.overview?.todayAttendances || 0}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="最近报名" loading={loading}>
            <Table
              dataSource={data?.recentEnrollments || []}
              columns={columns}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="最近缴费" loading={loading}>
            <Table
              dataSource={data?.recentPayments || []}
              columns={[
                {
                  title: '学员',
                  dataIndex: ['student', 'name'],
                  key: 'student',
                },
                {
                  title: '金额',
                  dataIndex: 'amount',
                  key: 'amount',
                  render: (amount: number) => `¥${amount}`,
                },
                {
                  title: '缴费时间',
                  dataIndex: 'paidAt',
                  key: 'paidAt',
                },
              ]}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;

