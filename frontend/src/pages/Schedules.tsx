import { useState, useEffect } from 'react';
import { Table, Button, Space, message } from 'antd';
import { CalendarOutlined, StarOutlined } from '@ant-design/icons';
import api from '../services/api';

const Schedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const response = await api.get('/schedules');
      setSchedules(response.data || []);
    } catch (error) {
      message.error('获取排课列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExcellentExperienceSchedule = () => {
    // TODO: 实现优秀安排体验课功能
    message.info('优秀安排体验课功能开发中...');
  };

  const columns = [
    { title: '班级', dataIndex: ['class', 'name'], key: 'class' },
    { title: '开始时间', dataIndex: 'startTime', key: 'startTime' },
    { title: '结束时间', dataIndex: 'endTime', key: 'endTime' },
    { title: '教室', dataIndex: 'classroom', key: 'classroom' },
    { title: '状态', dataIndex: 'status', key: 'status' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>排课管理</h1>
        <Space>
          <Button type="primary" icon={<StarOutlined />} onClick={handleExcellentExperienceSchedule}>
            优秀安排体验课
          </Button>
          <Button type="primary" icon={<CalendarOutlined />}>
            新增排课
          </Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={schedules} loading={loading} rowKey="id" />
    </div>
  );
};

export default Schedules;

