import { useState, useEffect } from 'react';
import { Table, Button, Space, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CheckCircleOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import api from '../services/api';

const Attendances = () => {
  const [attendances, setAttendances] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAttendances();
  }, []);

  const fetchAttendances = async () => {
    setLoading(true);
    try {
      const response = await api.get('/attendances');
      // 响应格式: { success: true, data: [...], pagination: {...} }
      if (response.success && response.data) {
        setAttendances(response.data || []);
      } else {
        setAttendances([]);
      }
    } catch (error: any) {
      console.error('获取出勤列表失败:', error);
      message.error('获取出勤列表失败');
      setAttendances([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClassAttendance = () => {
    navigate('/attendances/classes');
  };

  const handleLowAttendanceStudents = () => {
    navigate('/students?lowAttendanceOnly=true');
  };

  const columns = [
    { title: '学员', dataIndex: ['student', 'name'], key: 'student' },
    { title: '班级', dataIndex: ['class', 'name'], key: 'class' },
    { title: '签到时间', dataIndex: 'checkInTime', key: 'checkInTime' },
    { title: '状态', dataIndex: 'status', key: 'status' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>出勤管理</h1>
        <Space>
          <Button type="primary" icon={<TeamOutlined />} onClick={handleClassAttendance}>
            班级出勤
          </Button>
          <Button type="primary" icon={<UserOutlined />} onClick={handleLowAttendanceStudents}>
            低出勤学员
          </Button>
          <Button type="primary" icon={<CheckCircleOutlined />}>
            批量签到
          </Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={attendances} loading={loading} rowKey="id" />
    </div>
  );
};

export default Attendances;

