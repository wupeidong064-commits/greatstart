import { useState, useEffect } from 'react';
import {
  Row, Col, Card, Select, Button, Table, message, Modal, Spin,
  Tag, Descriptions, Divider, Alert, Statistic, Empty, Input
} from 'antd';
import {
  SwapOutlined, UserOutlined, TeamOutlined, CalendarOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, HistoryOutlined
} from '@ant-design/icons';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';

const { Option } = Select;
const { TextArea } = Input;

interface Teacher {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface TeacherResources {
  teacher: Teacher;
  summary: {
    classCount: number;
    studentCount: number;
    totalScheduleCount: number;
    upcomingScheduleCount: number;
    completedScheduleCount: number;
  };
  classes: any[];
  schedules: any[];
}

interface TransferHistory {
  id: string;
  from_teacher_name: string;
  to_teacher_name: string;
  transfer_details: {
    classCount: number;
    scheduleCount: number;
    studentCount: number;
  };
  operated_by_name: string;
  notes: string;
  created_at: string;
}

const ResourceTransfer = () => {
  const { user } = useAuthStore();
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canOperate = normalizedRole === 'admin' || normalizedRole === 'manager';

  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [fromTeacherId, setFromTeacherId] = useState<string | undefined>();
  const [toTeacherId, setToTeacherId] = useState<string | undefined>();
  const [fromTeacherResources, setFromTeacherResources] = useState<TeacherResources | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [transferNotes, setTransferNotes] = useState('');
  const [transferring, setTransferring] = useState(false);

  // 交接历史
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [transferHistory, setTransferHistory] = useState<TransferHistory[]>([]);

  // 获取教练列表
  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      const response = await api.get('/users');
      // 只保留 coach/teacher 角色的用户
      const coaches = (response.data || []).filter(
        (u: Teacher) => u.role === 'coach' || u.role === 'teacher'
      );
      setTeachers(coaches);
    } catch (error) {
      console.error('获取教练列表失败:', error);
      message.error('获取教练列表失败');
    }
  };

  // 获取离职教练的资源
  const fetchTeacherResources = async (teacherId: string) => {
    setLoading(true);
    try {
      const response = await api.get(`/resource-transfers/teacher-resources/${teacherId}`);
      setFromTeacherResources(response.data);
      // 默认全选班级
      setSelectedClassIds(response.data.classes.map((c: any) => c.id));
    } catch (error) {
      console.error('获取教练资源失败:', error);
      message.error('获取教练资源失败');
      setFromTeacherResources(null);
    } finally {
      setLoading(false);
    }
  };

  // 选择离职教练时触发
  const handleFromTeacherChange = (teacherId: string) => {
    setFromTeacherId(teacherId);
    if (teacherId === toTeacherId) {
      setToTeacherId(undefined);
    }
    fetchTeacherResources(teacherId);
  };

  // 执行交接
  const executeTransfer = async () => {
    if (!fromTeacherId || !toTeacherId) {
      message.error('请选择离职教练和接手教练');
      return;
    }

    if (fromTeacherId === toTeacherId) {
      message.error('不能将资源交接给自己');
      return;
    }

    setTransferring(true);
    try {
      const response = await api.post('/resource-transfers/execute', {
        fromTeacherId,
        toTeacherId,
        classIds: selectedClassIds,
        notes: transferNotes,
      });

      message.success(`交接成功！已转移 ${response.data.details.classCount} 个班级`);
      setConfirmModalVisible(false);
      setTransferNotes('');

      // 刷新数据
      setFromTeacherId(undefined);
      setToTeacherId(undefined);
      setFromTeacherResources(null);
      setSelectedClassIds([]);
      fetchTeachers();
    } catch (error: any) {
      console.error('交接失败:', error);
      message.error(error.response?.data?.message || '交接失败');
    } finally {
      setTransferring(false);
    }
  };

  // 获取交接历史
  const fetchTransferHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await api.get('/resource-transfers/history');
      setTransferHistory(response.data || []);
    } catch (error) {
      console.error('获取交接历史失败:', error);
      message.error('获取交接历史失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  // 班级表格列定义
  const classColumns = [
    {
      title: '班级名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '班级代码',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: '课程类型',
      dataIndex: 'courseType',
      key: 'courseType',
    },
    {
      title: '学员数',
      dataIndex: 'studentCount',
      key: 'studentCount',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'default'}>
          {status === 'active' ? '活跃' : status}
        </Tag>
      ),
    },
  ];

  // 排课表格列定义
  const scheduleColumns = [
    {
      title: '班级',
      dataIndex: ['class', 'name'],
      key: 'className',
      render: (text: string) => text || '-',
    },
    {
      title: '上课时间',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (time: string) => time ? new Date(time).toLocaleString('zh-CN') : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          scheduled: 'blue',
          completed: 'green',
          cancelled: 'red',
        };
        const textMap: Record<string, string> = {
          scheduled: '待上课',
          completed: '已完成',
          cancelled: '已取消',
        };
        return <Tag color={colorMap[status] || 'default'}>{textMap[status] || status}</Tag>;
      },
    },
  ];

  // 交接历史表格列定义
  const historyColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => time ? new Date(time).toLocaleString('zh-CN') : '-',
    },
    {
      title: '离职教练',
      dataIndex: 'from_teacher_name',
      key: 'from_teacher_name',
    },
    {
      title: '接手教练',
      dataIndex: 'to_teacher_name',
      key: 'to_teacher_name',
    },
    {
      title: '交接班级',
      dataIndex: ['transfer_details', 'classCount'],
      key: 'classCount',
    },
    {
      title: '涉及学员',
      dataIndex: ['transfer_details', 'studentCount'],
      key: 'studentCount',
    },
    {
      title: '操作人',
      dataIndex: 'operated_by_name',
      key: 'operated_by_name',
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      render: (text: string) => text || '-',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>教练离职资源交接</h2>
        <Button
          icon={<HistoryOutlined />}
          onClick={() => {
            setHistoryVisible(true);
            fetchTransferHistory();
          }}
        >
          交接历史
        </Button>
      </div>

      <Row gutter={24}>
        {/* 左侧：选择教练 */}
        <Col span={8}>
          <Card title="选择教练" style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
                离职教练：
              </label>
              <Select
                style={{ width: '100%' }}
                placeholder="选择离职教练"
                value={fromTeacherId}
                onChange={handleFromTeacherChange}
                showSearch
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toString().toLowerCase().includes(input.toLowerCase())
                }
              >
                {teachers.map(t => (
                  <Option key={t.id} value={t.id}>
                    {t.name} ({t.email})
                    {!t.isActive && <Tag color="red" style={{ marginLeft: 8 }}>已停用</Tag>}
                  </Option>
                ))}
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />
                接手教练：
              </label>
              <Select
                style={{ width: '100%' }}
                placeholder="选择接手教练"
                value={toTeacherId}
                onChange={setToTeacherId}
                disabled={!fromTeacherId}
                showSearch
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toString().toLowerCase().includes(input.toLowerCase())
                }
              >
                {teachers
                  .filter(t => t.id !== fromTeacherId)
                  .map(t => (
                    <Option key={t.id} value={t.id}>
                      {t.name} ({t.email})
                    </Option>
                  ))}
              </Select>
            </div>
          </Card>
        </Col>

        {/* 右侧：资源详情 */}
        <Col span={16}>
          <Card title="待交接资源">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large" />
              </div>
            ) : fromTeacherResources ? (
              <>
                {/* 资源统计 */}
                <Row gutter={16} style={{ marginBottom: 24 }}>
                  <Col span={6}>
                    <Statistic
                      title="班级数量"
                      value={fromTeacherResources.summary.classCount}
                      prefix={<TeamOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="学员总数"
                      value={fromTeacherResources.summary.studentCount}
                      prefix={<UserOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="排课记录"
                      value={fromTeacherResources.summary.totalScheduleCount}
                      prefix={<CalendarOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="待上课"
                      value={fromTeacherResources.summary.upcomingScheduleCount}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                </Row>

                <Divider>班级列表（勾选需要交接的班级）</Divider>

                {/* 班级选择表格 */}
                <Table
                  rowSelection={{
                    selectedRowKeys: selectedClassIds,
                    onChange: (keys) => setSelectedClassIds(keys as string[]),
                  }}
                  columns={classColumns}
                  dataSource={fromTeacherResources.classes}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  style={{ marginBottom: 24 }}
                />

                <Divider>最近排课记录（最多显示50条）</Divider>

                <Table
                  columns={scheduleColumns}
                  dataSource={fromTeacherResources.schedules}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  size="small"
                />

                {/* 操作按钮 */}
                {canOperate && (
                  <div style={{ marginTop: 24, textAlign: 'right' }}>
                    <Alert
                      message={`已选择 ${selectedClassIds.length} 个班级进行交接`}
                      type="info"
                      showIcon
                      style={{ marginBottom: 16 }}
                    />
                    <Button
                      type="primary"
                      size="large"
                      icon={<SwapOutlined />}
                      disabled={!fromTeacherId || !toTeacherId || selectedClassIds.length === 0}
                      onClick={() => setConfirmModalVisible(true)}
                    >
                      执行交接
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <Empty description="请先选择离职教练" />
            )}
          </Card>
        </Col>
      </Row>

      {/* 确认交接 Modal */}
      <Modal
        title="确认资源交接"
        open={confirmModalVisible}
        onCancel={() => setConfirmModalVisible(false)}
        onOk={executeTransfer}
        confirmLoading={transferring}
        okText="确认交接"
        cancelText="取消"
      >
        <Alert
          message="此操作将永久转移资源，请仔细核对"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="离职教练">
            {teachers.find(t => t.id === fromTeacherId)?.name}
          </Descriptions.Item>
          <Descriptions.Item label="接手教练">
            {teachers.find(t => t.id === toTeacherId)?.name}
          </Descriptions.Item>
          <Descriptions.Item label="交接班级数">
            {selectedClassIds.length} 个
          </Descriptions.Item>
          <Descriptions.Item label="涉及学员">
            {fromTeacherResources?.classes
              ?.filter(c => selectedClassIds.includes(c.id))
              ?.reduce((sum, c) => sum + (c.studentCount || 0), 0) || 0} 人
          </Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>备注：</label>
          <TextArea
            rows={3}
            value={transferNotes}
            onChange={(e) => setTransferNotes(e.target.value)}
            placeholder="可选：输入交接备注"
          />
        </div>
      </Modal>

      {/* 交接历史 Modal */}
      <Modal
        title="交接历史记录"
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={null}
        width={900}
      >
        <Table
          columns={historyColumns}
          dataSource={transferHistory}
          rowKey="id"
          loading={historyLoading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Modal>
    </div>
  );
};

export default ResourceTransfer;
