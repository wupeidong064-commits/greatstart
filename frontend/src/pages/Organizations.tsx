import { useState, useEffect } from 'react';
import { Table, Button, message, Modal, Form, Input, Popconfirm, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import { memfireDB } from '../services/memfireDB';
import { memfireAuth } from '../services/memfireAuth';

interface Organization {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
  createdAt?: string;
}

const Organizations = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [managerModalVisible, setManagerModalVisible] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [form] = Form.useForm();
  const [managerForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [managerSubmitting, setManagerSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  useEffect(() => {
    fetchOrganizations();
  }, [pagination.current, pagination.pageSize]);

  const fetchOrganizations = async () => {
    setLoading(true);
    try {
      const result = await memfireDB.organizations.list({
        page: pagination.current,
        pageSize: pagination.pageSize,
      });
      setOrganizations(result.data);
      setPagination(prev => ({ ...prev, total: result.total }));
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

      await memfireDB.organizations.create({
        name: values.name,
        code: values.code,
        address: values.address,
        phone: values.phone,
        email: values.email,
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
      await memfireDB.organizations.delete(id);
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

  const columns = [
    { title: '机构名称', dataIndex: 'name', key: 'name' },
    { title: '机构代码', dataIndex: 'code', key: 'code' },
    { title: '地址', dataIndex: 'address', key: 'address' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (isActive ? '启用' : '禁用'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Organization) => (
        <Space>
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
    </div>
  );
};

export default Organizations;

