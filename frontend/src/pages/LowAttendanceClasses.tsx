import { useState, useEffect } from 'react';
import { Table, Card, Tag, Progress, message } from 'antd';
import { TeamOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../services/api';

const LowAttendanceClasses = () => {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取低出勤班级数据
      const response = await api.get('/attendances/low-attendance-classes');
      if (response.success && response.data) {
        setClasses(response.data);
      } else {
        setClasses([]);
      }
    } catch (error: any) {
      console.error('获取低出勤班级失败:', error);
      setClasses([]);
      if (error.response?.status !== 404) {
        message.error('获取低出勤班级失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '班级名称',
      dataIndex: ['class', 'name'],
      key: 'className',
      render: (text: string) => (
        <span>
          <TeamOutlined style={{ marginRight: 8 }} />
          {text}
        </span>
      ),
    },
    {
      title: '班级代码',
      dataIndex: ['class', 'code'],
      key: 'classCode',
    },
    {
      title: '课程类型',
      dataIndex: ['class', 'courseType'],
      key: 'courseType',
    },
    {
      title: '学员总数',
      dataIndex: 'totalStudents',
      key: 'totalStudents',
    },
    {
      title: '平均出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      render: (rate: number) => (
        <>
          <Progress
            percent={rate}
            status={rate < 50 ? 'exception' : rate < 70 ? 'active' : 'success'}
            size="small"
            style={{ width: 100, display: 'inline-block', marginRight: 8 }}
          />
          <Tag color={rate >= 70 ? 'green' : rate >= 50 ? 'orange' : 'red'}>
            {rate}%
          </Tag>
        </>
      ),
    },
    {
      title: '低出勤学员数',
      dataIndex: 'lowAttendanceCount',
      key: 'lowAttendanceCount',
      render: (count: number) => (
        <Tag color="red">
          <WarningOutlined /> {count} 人
        </Tag>
      ),
    },
    {
      title: '教练',
      dataIndex: ['class', 'teacher', 'name'],
      key: 'teacher',
    },
  ];

  return (
    <div>
      <Card>
        <h1 style={{ marginBottom: 24 }}>低出勤班级</h1>
        <Table
          columns={columns}
          dataSource={classes}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个低出勤班级`,
          }}
        />
      </Card>
    </div>
  );
};

export default LowAttendanceClasses;

