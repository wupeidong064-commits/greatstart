import { useState, useEffect } from 'react';
import { Table, Card, Tag, Statistic, Row, Col, message, Progress, Space, Alert } from 'antd';
import { UserOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { memfireDB } from '../services/memfireDB';
import dayjs from 'dayjs';

const HoneymoonAttendance = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>({
    total: 0,
    avgAttendanceRate: 0,
    highAttendance: 0,
    lowAttendance: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取蜜月期客户出勤数据（报名30天内的学员）
      const result = await memfireDB.honeymoon.getHoneymoonStudents();
      setStudents(result.students || []);
      setStats(result.stats || {});
    } catch (error: any) {
      console.error('获取蜜月期客户出勤失败:', error);
      setStudents([]);
      message.error(error.message || '获取蜜月期客户出勤失败');
    } finally {
      setLoading(false);
    }
  };

  // 根据出勤率获取颜色
  const getAttendanceColor = (rate: number) => {
    if (rate >= 80) return 'green';
    if (rate >= 60) return 'orange';
    return 'red';
  };

  const columns = [
    {
      title: '学员姓名',
      dataIndex: 'studentName',
      key: 'studentName',
      render: (text: string) => (
        <span>
          <UserOutlined style={{ marginRight: 8 }} />
          {text}
        </span>
      ),
    },
    {
      title: '所属班级',
      dataIndex: 'className',
      key: 'className',
      render: (text: string, record: any) => (
        <span>
          {text}
          <span style={{ color: '#999', marginLeft: 8, fontSize: '12px' }}>
            ({record.classCode})
          </span>
        </span>
      ),
    },
    {
      title: '负责教练',
      key: 'teacher',
      render: (_: any, record: any) => record.teacher?.name || '-',
    },
    {
      title: '报名日期',
      dataIndex: 'enrollmentDate',
      key: 'enrollmentDate',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
      sorter: (a: any, b: any) => new Date(a.enrollmentDate).getTime() - new Date(b.enrollmentDate).getTime(),
    },
    {
      title: '应出勤',
      dataIndex: 'expectedAttendance',
      key: 'expectedAttendance',
      align: 'center' as const,
      render: (count: number) => `${count} 次`,
    },
    {
      title: '实际出勤',
      dataIndex: 'actualAttendance',
      key: 'actualAttendance',
      align: 'center' as const,
      render: (count: number, record: any) => (
        <Tag color="green" style={{ fontSize: '14px', padding: '4px 12px' }}>
          {count} / {record.expectedAttendance}
        </Tag>
      ),
    },
    {
      title: '缺勤次数',
      dataIndex: 'absentCount',
      key: 'absentCount',
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="red" style={{ fontSize: '14px', padding: '4px 12px' }}>
          {count} 次
        </Tag>
      ),
    },
    {
      title: '出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      align: 'center' as const,
      sorter: (a: any, b: any) => a.attendanceRate - b.attendanceRate,
      render: (rate: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress 
            percent={rate} 
            size="small" 
            status={rate < 60 ? 'exception' : 'normal'}
            style={{ width: 100, margin: 0 }}
          />
          <Tag color={getAttendanceColor(rate)}>{rate}%</Tag>
        </div>
      ),
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) => phone || '-',
    },
  ];

  return (
    <div>
      <Card>
        <h1 style={{ marginBottom: 24 }}>蜜月期客户出勤</h1>
        
        {/* 说明提示 */}
        <Alert
          message="蜜月期客户说明"
          description={
            <span>
              蜜月期客户是指<strong>报名30天内</strong>的新学员。此页面全面监控新报名学员的出勤情况，
              帮助教练及时跟进新学员的学习状态。学员报名满30天后将自动从此列表移除。
            </span>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card bordered={false} style={{ background: '#f6ffed' }}>
              <Statistic
                title="蜜月期学员总数"
                value={stats.total || 0}
                prefix={<UserOutlined />}
                suffix="人"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card bordered={false} style={{ background: '#e6f7ff' }}>
              <Statistic
                title="平均出勤率"
                value={stats.avgAttendanceRate || 0}
                suffix="%"
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: stats.avgAttendanceRate >= 80 ? '#3f8600' : stats.avgAttendanceRate >= 60 ? '#faad14' : '#cf1322' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card bordered={false} style={{ background: '#f6ffed' }}>
              <Statistic
                title="高出勤学员 (≥80%)"
                value={stats.highAttendance || 0}
                suffix="人"
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card bordered={false} style={{ background: '#fff2e8' }}>
              <Statistic
                title={
                  <span>
                    低出勤学员 (&lt;60%)
                    {(stats.lowAttendance || 0) > 0 && (
                      <WarningOutlined style={{ marginLeft: 8, color: '#ff4d4f' }} />
                    )}
                  </span>
                }
                value={stats.lowAttendance || 0}
                suffix="人"
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 数据表格 */}
        <Table
          columns={columns}
          dataSource={students}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 位蜜月期学员`,
          }}
          locale={{
            emptyText: '暂无蜜月期学员（报名30天内的新学员）',
          }}
        />
      </Card>
    </div>
  );
};

export default HoneymoonAttendance;
