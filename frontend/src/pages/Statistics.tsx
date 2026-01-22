import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { UserOutlined, CheckCircleOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons';
import api from '../services/api';

const Statistics = () => {
  const [stats, setStats] = useState<any>({});

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const [students, attendance, courses, finance] = await Promise.all([
        api.get('/statistics/students'),
        api.get('/statistics/attendance'),
        api.get('/statistics/courses'),
        api.get('/statistics/finance'),
      ]);
      setStats({
        students: students.data,
        attendance: attendance.data,
        courses: courses.data,
        finance: finance.data,
      });
    } catch (error) {
      console.error('获取统计数据失败:', error);
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>数据统计</h1>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="学员总数"
              value={stats.students?.total || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="出勤率"
              value={stats.attendance?.attendanceRate || 0}
              suffix="%"
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="班级总数"
              value={stats.courses?.totalClasses || 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总收入"
              value={stats.finance?.totalAmount || 0}
              prefix={<DollarOutlined />}
              precision={2}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Statistics;

