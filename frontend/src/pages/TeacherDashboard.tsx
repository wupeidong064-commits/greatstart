import { Card, Table, Tag, message, Button, Space, Modal, Form, Input, DatePicker, Select } from 'antd';
import { UserAddOutlined, FileExcelOutlined, DeleteOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import api from '../services/api';
import { dataService } from '../services/dataService';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

const TeacherDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [managementModalVisible, setManagementModalVisible] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [addForm] = Form.useForm();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 人员筛选
  const [selectedSalesId, setSelectedSalesId] = useState<string | undefined>(undefined);
  const [salesOptions, setSalesOptions] = useState<any[]>([]);

  // 权限检查
  const user = useAuthStore((state) => state.user);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const canManageStaff = normalizedRole === 'admin' || normalizedRole === 'manager';

  useEffect(() => {
    fetchSalesData();
  }, [selectedSalesId]);

  useEffect(() => {
    if (managementModalVisible) {
      fetchTeachers();
    }
  }, [managementModalVisible]);

  // 获取销售选项列表（用于筛选）
  const fetchSalesOptions = async () => {
    try {
      // 使用 /users/teachers 端点，它已经正确过滤了销售相关角色
      const response = await api.get('/users/teachers');
      // axios 拦截器已返回 response.data，所以这里 response 就是后端的 { success, data }
      const data = response.data || [];
      // 只保留销售相关角色的用户用于筛选
      const filteredData = data.filter((user: any) =>
        ['sales', 'coach', 'teacher', 'manager'].includes(user.role)
      );
      setSalesOptions(filteredData);
    } catch (error: any) {
      console.error('获取销售列表失败:', error);
    }
  };

  useEffect(() => {
    fetchSalesOptions();
  }, []);

  const fetchSalesData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      if (selectedSalesId) {
        params.salesId = selectedSalesId;
      }
      const response = await api.get('/users/sales-statistics', { params });
      const data = response.data || [];

      // 对于 coach 角色，只显示自己的数据
      if (normalizedRole === 'coach' && user?.id) {
        const ownData = data.filter((item: any) => item.teacherId === user.id);
        setSalesData(ownData || []);
      } else {
        setSalesData(data || []);
      }
    } catch (error: any) {
      console.error('获取销售数据失败:', error);
      message.error('获取销售数据失败');
      setSalesData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    setTeachersLoading(true);
    try {
      const data = await dataService.getTeachers();
      // 过滤只显示销售人员（teacher、sales 或 coach 角色）
      const salesStaff = data.filter((user: any) =>
        user.role === 'teacher' || user.role === 'sales' || user.role === 'coach'
      );
      setTeachers(salesStaff || []);
    } catch (error: any) {
      console.error('获取销售列表失败:', error);
      message.error('获取销售列表失败');
      setTeachers([]);
    } finally {
      setTeachersLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      // 将销售数据导出为 CSV
      const csvHeader = '销售姓名,添加数,邀约数,到场数,成单数,成单金额,新签成单数,新签金额,续费成单数,续费金额\n';
      const csvContent = salesData.map((item: any) =>
        `${item.teacherName},${item.addedCount},${item.invitationCount},${item.attendanceCount || 0},${item.orderCount},${item.orderAmount.toFixed(2)},${item.newOrderCount || 0},${(item.newOrderAmount || 0).toFixed(2)},${item.renewalOrderCount || 0},${(item.renewalOrderAmount || 0).toFixed(2)}`
      ).join('\n');
      
      const csv = csvHeader + csvContent;
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); // 添加 BOM 以支持中文
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `销售数据_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      message.success('导出成功');
    } catch (error: any) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  const handleAddSales = async (values: any) => {
    try {
      const response = await api.post('/auth/create-staff', {
        ...values,
        role: 'sales', // 销售角色
      });
      const { defaultPassword } = response.data || {};
      message.success(
        `添加销售成功${defaultPassword ? `，默认密码：${defaultPassword}` : ''}`
      );
      addForm.resetFields();
      fetchTeachers();
      fetchSalesData(); // 刷新销售数据
    } catch (error: any) {
      console.error('添加销售失败:', error);
      message.error(error.message || '添加失败');
    }
  };

  const handleDeleteSales = (teacherId: string, teacherName: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除销售"${teacherName}"吗？此操作不可恢复。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/users/${teacherId}`);
          message.success('删除成功');
          fetchTeachers();
          fetchSalesData(); // 刷新销售数据
        } catch (error: any) {
          console.error('删除销售失败:', error);
          message.error(error.message || '删除失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '销售姓名',
      dataIndex: 'teacherName',
      key: 'teacherName',
      width: 120,
    },
    {
      title: '添加数',
      dataIndex: 'addedCount',
      key: 'addedCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="blue">{count} 人</Tag>
      ),
    },
    {
      title: '邀约数',
      dataIndex: 'invitationCount',
      key: 'invitationCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="cyan">{count} 人</Tag>
      ),
    },
    {
      title: '到场数',
      dataIndex: 'attendanceCount',
      key: 'attendanceCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="green">{count} 次</Tag>
      ),
    },
    {
      title: '成单数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 100,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="orange">{count} 单</Tag>
      ),
    },
    {
      title: '成单金额',
      dataIndex: 'orderAmount',
      key: 'orderAmount',
      width: 120,
      align: 'center' as const,
      render: (amount: number) => (
        <Tag color="red">¥{amount.toFixed(2)}</Tag>
      ),
    },
    {
      title: '新签成单数',
      dataIndex: 'newOrderCount',
      key: 'newOrderCount',
      width: 110,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="blue">{count} 单</Tag>
      ),
    },
    {
      title: '新签金额',
      dataIndex: 'newOrderAmount',
      key: 'newOrderAmount',
      width: 120,
      align: 'center' as const,
      render: (amount: number) => (
        <Tag color="geekblue">¥{amount.toFixed(2)}</Tag>
      ),
    },
    {
      title: '续费成单数',
      dataIndex: 'renewalOrderCount',
      key: 'renewalOrderCount',
      width: 110,
      align: 'center' as const,
      render: (count: number) => (
        <Tag color="purple">{count} 单</Tag>
      ),
    },
    {
      title: '续费金额',
      dataIndex: 'renewalOrderAmount',
      key: 'renewalOrderAmount',
      width: 120,
      align: 'center' as const,
      render: (amount: number) => (
        <Tag color="magenta">¥{amount.toFixed(2)}</Tag>
      ),
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
          onClick={() => handleDeleteSales(record.id, record.name)}
        >
          删除
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>销售数据</h1>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={handleExport}>
            销售数据导出
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
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            format="YYYY-MM-DD"
            allowClear
            placeholder={['开始日期', '结束日期']}
          />
          <span style={{ marginLeft: 16 }}>人员筛选：</span>
          <Select
            style={{ width: 150 }}
            placeholder="选择销售人员"
            allowClear
            showSearch
            optionFilterProp="children"
            value={selectedSalesId}
            onChange={(value) => setSelectedSalesId(value)}
          >
            {salesOptions.map((sales: any) => (
              <Option key={sales.id} value={sales.id}>
                {sales.name}
              </Option>
            ))}
          </Select>
          <Button type="primary" onClick={fetchSalesData} loading={loading}>
            查询
          </Button>
          {(dateRange || selectedSalesId) && (
            <Button onClick={() => {
              setDateRange(null);
              setSelectedSalesId(undefined);
            }}>
              重置
            </Button>
          )}
        </Space>
      }>
        <Table
          columns={columns}
          dataSource={salesData}
          loading={loading}
          rowKey="teacherId"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 位销售`,
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
          <h3>添加销售</h3>
          <Form
            form={addForm}
            layout="inline"
            onFinish={handleAddSales}
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
          <h3>销售列表</h3>
          <Table
            columns={managementColumns}
            dataSource={teachers}
            loading={teachersLoading}
            rowKey="id"
            pagination={{
              pageSize: 5,
              showSizeChanger: false,
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default TeacherDashboard;

