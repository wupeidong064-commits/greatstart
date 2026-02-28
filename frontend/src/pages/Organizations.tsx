import { useState, useEffect } from 'react';
import { Table, Button, message, Modal, Form, Input, Popconfirm, Space, DatePicker } from 'antd';
import { PlusOutlined, DeleteOutlined, UserAddOutlined, BankOutlined } from '@ant-design/icons';
import api from '../services/api';
import { memfireAuth } from '../services/memfireAuth';
import dayjs from 'dayjs';

interface Organization {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
  startdate?: string;  // 使用小写，与数据库列名一致
  enddate?: string;    // 使用小写，与数据库列名一致
  createdAt?: string;
}

const Organizations = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [managerModalVisible, setManagerModalVisible] = useState(false);
  const [campusModalVisible, setCampusModalVisible] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [form] = Form.useForm();
  const [managerForm] = Form.useForm();
  const [campusForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [managerSubmitting, setManagerSubmitting] = useState(false);
  const [campusSubmitting, setCampusSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  useEffect(() => {
    fetchOrganizations();
  }, [pagination.current, pagination.pageSize]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const response = await api.get('/organizations', {
        params: {
          page: pagination.current,
          pageSize: pagination.pageSize,
        }
      });
      // api 拦截器已经返回 response.data，所以 response 就是 { success, data, pagination }
      const result = response || {};
      setOrganizations(result.data || []);
      setPagination(prev => ({ ...prev, total: result.pagination?.total || 0 }));
    } catch (error: any) {
      message.error(error.message || '获取机构列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrganization = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      await api.post('/organizations', {
        name: values.name,
        code: values.code,
        address: values.address,
        phone: values.phone,
        email: values.email,
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : undefined,
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
      });

      message.success('机构创建成功');
      setModalVisible(false);
      form.resetFields();
      fetchOrganizations();
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      message.error(error.message || '创建机构失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOrganization = async (id: string) => {
    try {
      await api.delete(`/organizations/${id}`);
      message.success('机构删除成功');
      fetchOrganizations();
    } catch (error: any) {
      message.error(error.message || '删除机构失败');
    }
  };

  const handleAddManager = () => {
    setSelectedOrg(null);
    setManagerModalVisible(true);
    managerForm.resetFields();
  };

  const handleAddManagerForOrg = (org: Organization) => {
    setSelectedOrg(org);
    setManagerModalVisible(true);
    managerForm.resetFields();
  };

  const handleCreateManager = async () => {
    try {
      const values = await managerForm.validateFields();
      setManagerSubmitting(true);

      const orgId = values.organizationId || selectedOrg?.id;
      if (!orgId) {
        message.error('请选择机构');
        return;
      }

      await memfireAuth.createManager(
        values.email,
        values.password,
        values.name,
        orgId
      );

      message.success('管理者创建成功');
      setManagerModalVisible(false);
      managerForm.resetFields();
      setSelectedOrg(null);
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      message.error(error.message || '创建管理者失败');
    } finally {
      setManagerSubmitting(false);
    }
  };

  // 打开校区管理弹窗
  const handleManageCampuses = async (org: Organization) => {
    setSelectedOrg(org);
    setCampusModalVisible(true);
    await fetchCampuses(org.id);
  };

  // 获取机构的校区列表
  const fetchCampuses = async (orgId: string) => {
    setCampusLoading(true);
    try {
      const response = await api.get('/campuses', {
        params: { organizationId: orgId }
      });
      const result = response || {};
      setCampuses(result.data || []);
    } catch (error: any) {
      message.error(error.message || '获取校区列表失败');
    } finally {
      setCampusLoading(false);
    }
  };

  // 添加校区
  const handleAddCampus = async () => {
    try {
      const values = await campusForm.validateFields();
      setCampusSubmitting(true);

      await api.post('/campuses', {
        organizationId: selectedOrg!.id,
        name: values.name,
        code: values.code,
        address: values.address,
        phone: values.phone,
      });

      message.success('校区添加成功');
      campusForm.resetFields();
      await fetchCampuses(selectedOrg!.id);
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      message.error(error.message || '添加校区失败');
    } finally {
      setCampusSubmitting(false);
    }
  };

  // 删除校区
  const handleDeleteCampus = async (campusId: string) => {
    try {
      await api.delete(`/campuses/${campusId}`);
      message.success('校区删除成功');
      await fetchCampuses(selectedOrg!.id);
    } catch (error: any) {
      message.error(error.message || '删除校区失败');
    }
  };

  const columns = [
    { title: '机构名称', dataIndex: 'name', key: 'name' },
    { title: '机构代码', dataIndex: 'code', key: 'code' },
    { title: '地址', dataIndex: 'address', key: 'address' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '开通时间',
      dataIndex: 'startdate',
      key: 'startdate',
      render: (startdate: string) => startdate ? dayjs(startdate).format('YYYY-MM-DD') : '-',
    },
    {
      title: '结束时间',
      dataIndex: 'enddate',
      key: 'enddate',
      render: (enddate: string) => enddate ? dayjs(enddate).format('YYYY-MM-DD') : '-',
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean, record: Organization) => {
        // 如果有结束时间且已过期，显示已过期
        if (record.enddate && dayjs(record.enddate).isBefore(dayjs(), 'day')) {
          return <span style={{ color: 'red' }}>已过期</span>;
        }
        return isActive ? '启用' : '禁用';
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Organization) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<BankOutlined />}
            onClick={() => handleManageCampuses(record)}
          >
            管理校区
          </Button>
          <Button
            type="link"
            size="small"
            icon={<UserAddOutlined />}
            onClick={() => handleAddManagerForOrg(record)}
          >
            添加管理者
          </Button>
          <Popconfirm
            title="删除机构"
            description="确定要删除这个机构吗？删除后无法恢复。"
            onConfirm={() => handleDeleteOrganization(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>机构管理</h1>
        <Space>
          <Button
            icon={<UserAddOutlined />}
            onClick={handleAddManager}
          >
            创建管理者
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalVisible(true)}
          >
            新增机构
          </Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={organizations}
        loading={loading}
        rowKey="id"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize, total: pagination.total });
          },
        }}
      />

      {/* 新增机构模态框 */}
      <Modal
        title="新增机构"
        open={modalVisible}
        onOk={handleAddOrganization}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="机构名称"
            name="name"
            rules={[{ required: true, message: '请输入机构名称' }]}
          >
            <Input placeholder="请输入机构名称" />
          </Form.Item>

          <Form.Item
            label="机构代码"
            name="code"
            rules={[
              { required: true, message: '请输入机构代码' },
              { pattern: /^[a-zA-Z0-9-_]+$/, message: '代码只能包含字母、数字、中划线和下划线' },
            ]}
          >
            <Input placeholder="请输入机构代码（如：org-001）" />
          </Form.Item>

          <Form.Item label="地址" name="address">
            <Input placeholder="请输入机构地址" />
          </Form.Item>

          <Form.Item
            label="电话"
            name="phone"
            rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' }]}
          >
            <Input placeholder="请输入联系电话" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ type: 'email', message: '请输入正确的邮箱地址' }]}
          >
            <Input placeholder="请输入邮箱地址" />
          </Form.Item>

          <Form.Item
            label="开通时间"
            name="startDate"
            tooltip="机构服务开始时间"
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              placeholder="选择开通时间"
            />
          </Form.Item>

          <Form.Item
            label="结束时间"
            name="endDate"
            tooltip="机构服务结束时间，留空表示永久有效"
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              placeholder="选择结束时间（可选）"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 创建管理者模态框 */}
      <Modal
        title={selectedOrg ? `为 ${selectedOrg.name} 创建管理者` : '创建机构管理者'}
        open={managerModalVisible}
        onOk={handleCreateManager}
        onCancel={() => {
          setManagerModalVisible(false);
          managerForm.resetFields();
          setSelectedOrg(null);
        }}
        confirmLoading={managerSubmitting}
        okText="创建"
        cancelText="取消"
      >
        <Form form={managerForm} layout="vertical" initialValues={{ organizationId: selectedOrg?.id }}>
          {!selectedOrg && (
            <Form.Item
              label="选择机构"
              name="organizationId"
              rules={[{ required: true, message: '请选择机构' }]}
            >
              <select style={{ width: '100%', padding: '8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}>
                <option value="">请选择机构</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.code})
                  </option>
                ))}
              </select>
            </Form.Item>
          )}

          <Form.Item
            label="姓名"
            name="name"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入管理者姓名" />
          </Form.Item>

          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入正确的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱（用于登录）" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password placeholder="请输入密码（至少6位）" />
          </Form.Item>

          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入密码" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 校区管理模态框 */}
      <Modal
        title={`${selectedOrg?.name} - 校区管理`}
        open={campusModalVisible}
        onCancel={() => {
          setCampusModalVisible(false);
          setSelectedOrg(null);
          setCampuses([]);
          campusForm.resetFields();
        }}
        footer={null}
        width={800}
      >
        {/* 添加校区表单 */}
        <div style={{ marginBottom: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
          <Form form={campusForm} layout="inline" style={{ width: '100%' }}>
            <Form.Item
              name="name"
              rules={[{ required: true, message: '请输入校区名称' }]}
              style={{ flex: 1, marginRight: 8 }}
            >
              <Input placeholder="校区名称" />
            </Form.Item>
            <Form.Item
              name="code"
              rules={[{ required: true, message: '请输入校区代码' }]}
              style={{ width: 150, marginRight: 8 }}
            >
              <Input placeholder="校区代码" />
            </Form.Item>
            <Form.Item name="address" style={{ flex: 1, marginRight: 8 }}>
              <Input placeholder="校区地址" />
            </Form.Item>
            <Form.Item name="phone" style={{ width: 130, marginRight: 8 }}>
              <Input placeholder="联系电话" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleAddCampus} loading={campusSubmitting}>
                添加校区
              </Button>
            </Form.Item>
          </Form>
        </div>

        {/* 校区列表 */}
        <Table
          columns={[
            { title: '校区名称', dataIndex: 'name', key: 'name' },
            { title: '校区代码', dataIndex: 'code', key: 'code' },
            { title: '地址', dataIndex: 'address', key: 'address', render: (addr: string) => addr || '-' },
            { title: '联系电话', dataIndex: 'phone', key: 'phone', render: (phone: string) => phone || '-' },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              width: 180,
              render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-',
            },
            {
              title: '操作',
              key: 'actions',
              width: 100,
              render: (_: any, record: any) => (
                <Popconfirm
                  title="删除校区"
                  description="确定要删除这个校区吗？"
                  onConfirm={() => handleDeleteCampus(record.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
          dataSource={campuses}
          loading={campusLoading}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  );
};

export default Organizations;

