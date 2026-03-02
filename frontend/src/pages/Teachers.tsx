import { Card, Table, Button, Space, Tag, message, Progress, Modal, Form, Input, DatePicker, Select } from 'antd';
import { UsergroupAddOutlined, FileExcelOutlined, DeleteOutlined, UserAddOutlined, BarChartOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

const Teachers = () => {
  // 获取当前用户和权限
  const user = useAuthStore((state) => state.user);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageStaff = normalizedRole === 'admin' || normalizedRole === 'manager';

  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [managementModalVisible, setManagementModalVisible] = useState(false);
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [teachersListLoading, setTeachersListLoading] = useState(false);
  const [addForm] = Form.useForm();
  const [changeHistoryModalVisible, setChangeHistoryModalVisible] = useState(false);
  const [changeHistoryData, setChangeHistoryData] = useState<any[]>([]);
  const [changeHistoryLoading, setChangeHistoryLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(7, 'day'),
    dayjs(),
  ]);
  // 默认显示当前月份的数据
  const [mainDateRange, setMainDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('month'),
    dayjs(),
  ]);

  // 人员筛选
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | undefined>(undefined);
  const [teacherOptions, setTeacherOptions] = useState<any[]>([]);

  useEffect(() => {
    fetchTeachers();
  }, [mainDateRange, selectedTeacherId]);

  // 获取教练员选项列表（用于筛选）
  const fetchTeacherOptions = async () => {
    try {
      // 使用 /users/teachers 端点，它已经正确过滤了教练、教师和管理员
      const response = await api.get('/users/teachers');
      console.log('教练员选项响应:', response);
      // axios 拦截器已返回 response.data，所以这里 response 就是后端的 { success, data }
      const data = response.data || [];
      console.log('教练员选项数据:', data);
      // 只保留 coach, teacher, manager 角色的用户用于筛选
      const filteredData = data.filter((user: any) =>
        ['coach', 'teacher', 'manager'].includes(user.role)
      );
      setTeacherOptions(filteredData);
    } catch (error: any) {
      console.error('获取教练员列表失败:', error);
    }
  };

  useEffect(() => {
    fetchTeacherOptions();
  }, []);

  useEffect(() => {
    if (managementModalVisible) {
      fetchTeachersList();
    }
  }, [managementModalVisible]);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (mainDateRange && mainDateRange[0] && mainDateRange[1]) {
        params.startDate = mainDateRange[0].format('YYYY-MM-DD');
        params.endDate = mainDateRange[1].format('YYYY-MM-DD');
      }
      if (selectedTeacherId) {
        params.teacherId = selectedTeacherId;
      }
      const response = await api.get('/users/coach-statistics', { params });
      setTeachers(response.data || []);
    } catch (error: any) {
      console.error('获取教练统计数据失败:', error);
      message.error(error.message || '获取教练统计数据失败');
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      message.info('导出功能开发中...');
      // TODO: 实现导出功能
      // 可以使用 xlsx 库将 teachers 数据导出为 Excel
    } catch (error: any) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  const fetchTeachersList = async () => {
    setTeachersListLoading(true);
    try {
      const response = await api.get('/users');
      const data = response.data || [];
      // 只显示角色为 coach 的用户
      const coachesList = data.filter((user: any) => user.role === 'coach');
      setTeachersList(coachesList || []);
    } catch (error: any) {
      console.error('获取教练列表失败:', error);
      message.error(error.message || '获取教练列表失败');
      setTeachersList([]);
    } finally {
      setTeachersListLoading(false);
    }
  };

  const handleAddTeacher = async (values: any) => {
    try {
      const response = await api.post('/auth/create-staff', {
        ...values,
        role: 'coach',
      });
      const { defaultPassword } = response.data || {};
      message.success(
        `添加教练成功${defaultPassword ? `，默认密码：${defaultPassword}` : ''}`
      );
      addForm.resetFields();
      fetchTeachersList();
      fetchTeachers(); // 刷新统计数据
    } catch (error: any) {
      console.error('添加教练失败:', error);
      message.error(error.message || '添加失败');
    }
  };

  const fetchChangeHistory = async () => {
    setChangeHistoryLoading(true);
    try {
      // TODO: 实现后端API调用
      // const params: any = {};
      // if (dateRange && dateRange[0] && dateRange[1]) {
      //   params.startDate = dateRange[0].format('YYYY-MM-DD');
      //   params.endDate = dateRange[1].format('YYYY-MM-DD');
      // }
      // const response = await api.get('/users/teachers/statistics/changes', { params });
      // if (response.success && response.data) {
      //   setChangeHistoryData(response.data || []);
      // } else {
      //   setChangeHistoryData([]);
      // }

      // 模拟数据（仅前端展示）
      const mockData = teachers.map((teacher: any) => ({
        teacherId: teacher.teacherId,
        teacherName: teacher.teacherName,
        date: dayjs().subtract(Math.floor(Math.random() * 7), 'day').format('YYYY-MM-DD'),
        classCount: teacher.classCount,
        classCountChange: Math.floor(Math.random() * 5) - 2,
        studentCount: teacher.studentCount,
        studentCountChange: Math.floor(Math.random() * 10) - 5,
        attendanceRate: teacher.attendanceRate,
        attendanceRateChange: (Math.random() * 10 - 5).toFixed(1),
        baseCount: teacher.baseCount,
        baseCountChange: teacher.baseCountChange || Math.floor(Math.random() * 5) - 2,
        newRecruits: teacher.newRecruits,
        newRecruitsChange: Math.floor(Math.random() * 3),
        renewalRate: teacher.renewalRate,
        renewalRateChange: (Math.random() * 5 - 2.5).toFixed(1),
        totalOrderAmount: teacher.totalOrderAmount,
        totalOrderAmountChange: Math.floor(Math.random() * 5000) - 2500,
        consumptionAmount: teacher.consumptionAmount,
        consumptionAmountChange: Math.floor(Math.random() * 3000) - 1500,
      }));
      setChangeHistoryData(mockData);
    } catch (error: any) {
      console.error('获取数据变化历史失败:', error);
      message.error('获取数据变化历史失败');
      setChangeHistoryData([]);
    } finally {
      setChangeHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (changeHistoryModalVisible && teachers.length > 0) {
      fetchChangeHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeHistoryModalVisible, dateRange]);

  const handleDelete = (teacherId: string, teacherName: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除教练员"${teacherName}"吗？此操作不可恢复。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/users/${teacherId}`);
          message.success('删除成功');
          fetchTeachersList();
          fetchTeachers(); // 刷新统计数据
        } catch (error: any) {
          console.error('删除教练员失败:', error);
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '教练员姓名',
      dataIndex: 'teacherName',
      key: 'teacherName',
      width: 120,
    },
    {
      title: '负责班级数',
      dataIndex: 'classCount',
      key: 'classCount',
      width: 120,
      align: 'center' as const,
      render: (count: number) => `${count} 个`,
    },
    {
      title: '负责学员数',
      dataIndex: 'studentCount',
      key: 'studentCount',
      width: 120,
      align: 'center' as const,
      render: (count: number) => `${count} 人`,
    },
    {
      title: '学员出勤率',
      dataIndex: 'attendanceRate',
      key: 'attendanceRate',
      width: 150,
      align: 'center' as const,
      render: (rate: number) => (
        <>
          <Progress
            percent={rate}
            status={rate < 50 ? 'exception' : rate < 70 ? 'active' : 'success'}
            size="small"
            style={{ width: 100, display: 'inline-block', marginRight: 8 }}
          />
          <Tag color={rate >= 80 ? 'green' : rate >= 60 ? 'orange' : 'red'}>
            {rate}%
          </Tag>
        </>
      ),
    },
    {
      title: '课消金额',
      dataIndex: 'consumptionAmount',
      key: 'consumptionAmount',
      width: 120,
      align: 'center' as const,
      render: (amount: number) => `¥${amount.toFixed(2)}`,
    },
    {
      title: '基本盘人数变化',
      dataIndex: 'baseCountChange',
      key: 'baseCountChange',
      width: 150,
      align: 'center' as const,
      render: (change: number) => {
        if (change === 0) return '-';
        const color = change > 0 ? 'green' : 'red';
        const prefix = change > 0 ? '+' : '';
        return <Tag color={color}>{prefix}{change}</Tag>;
      },
    },
    {
      title: '个人新招数',
      dataIndex: 'newRecruits',
      key: 'newRecruits',
      width: 120,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="blue">{count} 人</Tag>
      ),
    },
    {
      title: '续费率',
      dataIndex: 'renewalRate',
      key: 'renewalRate',
      width: 120,
      align: 'center' as const,
      render: (rate: number) => (
        <Tag color={rate >= 50 ? 'green' : rate >= 30 ? 'orange' : 'red'}>
          {rate}%
        </Tag>
      ),
    },
    {
      title: '成单金额',
      dataIndex: 'totalOrderAmount',
      key: 'totalOrderAmount',
      width: 120,
      align: 'center' as const,
      render: (amount: number) => `¥${amount.toFixed(2)}`,
    },
    {
      title: '学员使用率',
      key: 'studentUsageRate',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: any) => {
        const rate = record.studentCount > 0 
          ? (record.consumptionAmount / record.studentCount).toFixed(2)
          : '0.00';
        return `¥${rate}`;
      },
    },
  ];

  const managementColumns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(record.id, record.name)}
        >
          删除
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>教练员数据</h1>
        <Space>
          <Button icon={<BarChartOutlined />} onClick={() => setChangeHistoryModalVisible(true)}>
            教练员数据变化查看
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={handleExport}>
            教练员数据导出
          </Button>
          {canManageStaff && (
            <Button type="primary" icon={<UsergroupAddOutlined />} onClick={() => setManagementModalVisible(true)}>
              人员管理
            </Button>
          )}
        </Space>
      </div>
      <Card title={
        <Space wrap>
          <span>时间筛选：</span>
          <RangePicker
            value={mainDateRange}
            onChange={(dates) => setMainDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            format="YYYY-MM-DD"
            allowClear
            placeholder={['开始日期', '结束日期']}
          />
          <span style={{ marginLeft: 16 }}>人员筛选：</span>
          <Select
            style={{ width: 150 }}
            placeholder="选择教练员"
            allowClear
            showSearch
            optionFilterProp="children"
            value={selectedTeacherId}
            onChange={(value) => setSelectedTeacherId(value)}
          >
            {teacherOptions.map((teacher: any) => (
              <Option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </Option>
            ))}
          </Select>
          <Button type="primary" onClick={fetchTeachers} loading={loading}>
            查询
          </Button>
          {(mainDateRange || selectedTeacherId) && (
            <Button onClick={() => {
              setMainDateRange([dayjs().startOf('month'), dayjs()]);
              setSelectedTeacherId(undefined);
            }}>
              重置
            </Button>
          )}
        </Space>
      }>
        <Table
          columns={columns}
          dataSource={teachers}
          loading={loading}
          rowKey="teacherId"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 位教练`,
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      <Modal
        title="人员管理"
        open={managementModalVisible}
        onCancel={() => {
          setManagementModalVisible(false);
          addForm.resetFields();
        }}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <h3>添加教练</h3>
          <Form
            form={addForm}
            layout="inline"
            onFinish={handleAddTeacher}
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              name="name"
              label="姓名"
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input placeholder="姓名" />
            </Form.Item>
            <Form.Item
              name="email"
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}
            >
              <Input placeholder="邮箱" />
            </Form.Item>
            <Form.Item
              name="phone"
              label="电话"
            >
              <Input placeholder="电话" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<UserAddOutlined />}>
                添加
              </Button>
            </Form.Item>
          </Form>
        </div>
        <div>
          <h3>教练列表</h3>
          <Table
            columns={managementColumns}
            dataSource={teachersList}
            loading={teachersListLoading}
            rowKey="id"
            pagination={{
              pageSize: 5,
              showSizeChanger: false,
            }}
          />
        </div>
      </Modal>

      {/* 教练员数据变化查看模态框 */}
      <Modal
        title="教练员数据变化查看"
        open={changeHistoryModalVisible}
        onCancel={() => {
          setChangeHistoryModalVisible(false);
        }}
        footer={null}
        width={1400}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <span>选择时间范围：</span>
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              format="YYYY-MM-DD"
              allowClear
            />
            <Button type="primary" onClick={fetchChangeHistory} loading={changeHistoryLoading}>
              查询
            </Button>
          </Space>
        </div>
        <Table
          columns={[
            {
              title: '教练员姓名',
              dataIndex: 'teacherName',
              key: 'teacherName',
              width: 120,
              fixed: 'left' as const,
            },
            {
              title: '日期',
              dataIndex: 'date',
              key: 'date',
              width: 120,
            },
            {
              title: '负责班级数',
              key: 'classCount',
              width: 150,
              children: [
                {
                  title: '当前值',
                  dataIndex: 'classCount',
                  key: 'classCount',
                  width: 80,
                  align: 'center' as const,
                  render: (count: number) => `${count} 个`,
                },
                {
                  title: '变化',
                  dataIndex: 'classCountChange',
                  key: 'classCountChange',
                  width: 70,
                  align: 'center' as const,
                  render: (change: number) => {
                    if (change === 0) return '-';
                    const color = change > 0 ? 'green' : 'red';
                    const prefix = change > 0 ? '+' : '';
                    return <Tag color={color}>{prefix}{change}</Tag>;
                  },
                },
              ],
            },
            {
              title: '负责学员数',
              key: 'studentCount',
              width: 150,
              children: [
                {
                  title: '当前值',
                  dataIndex: 'studentCount',
                  key: 'studentCount',
                  width: 80,
                  align: 'center' as const,
                  render: (count: number) => `${count} 人`,
                },
                {
                  title: '变化',
                  dataIndex: 'studentCountChange',
                  key: 'studentCountChange',
                  width: 70,
                  align: 'center' as const,
                  render: (change: number) => {
                    if (change === 0) return '-';
                    const color = change > 0 ? 'green' : 'red';
                    const prefix = change > 0 ? '+' : '';
                    return <Tag color={color}>{prefix}{change}</Tag>;
                  },
                },
              ],
            },
            {
              title: '学员出勤率',
              key: 'attendanceRate',
              width: 150,
              children: [
                {
                  title: '当前值',
                  dataIndex: 'attendanceRate',
                  key: 'attendanceRate',
                  width: 80,
                  align: 'center' as const,
                  render: (rate: number) => `${rate}%`,
                },
                {
                  title: '变化',
                  dataIndex: 'attendanceRateChange',
                  key: 'attendanceRateChange',
                  width: 70,
                  align: 'center' as const,
                  render: (change: string) => {
                    const numChange = parseFloat(change);
                    if (numChange === 0) return '-';
                    const color = numChange > 0 ? 'green' : 'red';
                    const prefix = numChange > 0 ? '+' : '';
                    return <Tag color={color}>{prefix}{numChange}%</Tag>;
                  },
                },
              ],
            },
            {
              title: '课消金额',
              key: 'consumptionAmount',
              width: 150,
              children: [
                {
                  title: '当前值',
                  dataIndex: 'consumptionAmount',
                  key: 'consumptionAmount',
                  width: 80,
                  align: 'center' as const,
                  render: (amount: number) => `¥${amount.toFixed(2)}`,
                },
                {
                  title: '变化',
                  dataIndex: 'consumptionAmountChange',
                  key: 'consumptionAmountChange',
                  width: 70,
                  align: 'center' as const,
                  render: (change: number) => {
                    if (change === 0) return '-';
                    const color = change > 0 ? 'green' : 'red';
                    const prefix = change > 0 ? '+' : '';
                    return <Tag color={color}>{prefix}¥{Math.abs(change).toFixed(2)}</Tag>;
                  },
                },
              ],
            },
            {
              title: '基本盘人数变化',
              dataIndex: 'baseCountChange',
              key: 'baseCountChange',
              width: 120,
              align: 'center' as const,
              render: (change: number) => {
                if (change === 0) return '-';
                const color = change > 0 ? 'green' : 'red';
                const prefix = change > 0 ? '+' : '';
                return <Tag color={color}>{prefix}{change}</Tag>;
              },
            },
            {
              title: '个人新招数',
              key: 'newRecruits',
              width: 150,
              children: [
                {
                  title: '当前值',
                  dataIndex: 'newRecruits',
                  key: 'newRecruits',
                  width: 80,
                  align: 'center' as const,
                  render: (count: number) => `${count} 人`,
                },
                {
                  title: '变化',
                  dataIndex: 'newRecruitsChange',
                  key: 'newRecruitsChange',
                  width: 70,
                  align: 'center' as const,
                  render: (change: number) => {
                    if (change === 0) return '-';
                    const color = change > 0 ? 'green' : 'red';
                    const prefix = change > 0 ? '+' : '';
                    return <Tag color={color}>{prefix}{change}</Tag>;
                  },
                },
              ],
            },
            {
              title: '续费率',
              key: 'renewalRate',
              width: 150,
              children: [
                {
                  title: '当前值',
                  dataIndex: 'renewalRate',
                  key: 'renewalRate',
                  width: 80,
                  align: 'center' as const,
                  render: (rate: number) => `${rate}%`,
                },
                {
                  title: '变化',
                  dataIndex: 'renewalRateChange',
                  key: 'renewalRateChange',
                  width: 70,
                  align: 'center' as const,
                  render: (change: string) => {
                    const numChange = parseFloat(change);
                    if (numChange === 0) return '-';
                    const color = numChange > 0 ? 'green' : 'red';
                    const prefix = numChange > 0 ? '+' : '';
                    return <Tag color={color}>{prefix}{numChange}%</Tag>;
                  },
                },
              ],
            },
            {
              title: '成单金额',
              key: 'totalOrderAmount',
              width: 150,
              children: [
                {
                  title: '当前值',
                  dataIndex: 'totalOrderAmount',
                  key: 'totalOrderAmount',
                  width: 80,
                  align: 'center' as const,
                  render: (amount: number) => `¥${amount.toFixed(2)}`,
                },
                {
                  title: '变化',
                  dataIndex: 'totalOrderAmountChange',
                  key: 'totalOrderAmountChange',
                  width: 70,
                  align: 'center' as const,
                  render: (change: number) => {
                    if (change === 0) return '-';
                    const color = change > 0 ? 'green' : 'red';
                    const prefix = change > 0 ? '+' : '';
                    return <Tag color={color}>{prefix}¥{Math.abs(change).toFixed(2)}</Tag>;
                  },
                },
              ],
            },
            {
              title: '学员使用率',
              key: 'studentUsageRate',
              width: 120,
              align: 'center' as const,
              render: (_: any, record: any) => {
                const rate = record.studentCount > 0 
                  ? (record.consumptionAmount / record.studentCount).toFixed(2)
                  : '0.00';
                return `¥${rate}`;
              },
            },
          ]}
          dataSource={changeHistoryData}
          loading={changeHistoryLoading}
          rowKey={(record) => `${record.teacherId}-${record.date}`}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          scroll={{ x: 1400 }}
        />
      </Modal>
    </div>
  );
};

export default Teachers;

