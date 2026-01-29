import { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Modal, Form, Input, Select, Card } from 'antd';
import { UserAddOutlined, EditOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import memfireDB from '../services/memfireDB';

const { Option } = Select;

const StaffList = () => {
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [form] = Form.useForm();
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    fetchStaffList();
    fetchGroups();
  }, []);

  const fetchStaffList = async () => {
    setLoading(true);
    try {
      const data = await memfireDB.users.listAll();
      setStaffList(data || []);
    } catch (error: any) {
      console.error('获取工作人员列表失败:', error);
      message.error('获取工作人员列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      // 从用户数据中提取所有分组
      const data = await memfireDB.users.listAll();
      const groupSet = new Set<string>();
      (data || []).forEach((user: any) => {
        if (user.group) {
          groupSet.add(user.group);
        }
      });
      setGroups(Array.from(groupSet));
    } catch (error) {
      console.error('获取分组列表失败:', error);
    }
  };

  const handleAdd = () => {
    setEditingStaff(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingStaff(record);
    form.setFieldsValue({
      name: record.name,
      email: record.email,
      phone: record.phone,
      role: record.role,
      group: record.group,
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingStaff) {
        await memfireDB.users.update(editingStaff.id, values);
        message.success('更新成功');
      } else {
        const result = await memfireDB.users.create(values);
        const { defaultPassword } = result.data || {};
        message.success(
          `添加成功${defaultPassword ? `，默认密码：${defaultPassword}` : ''}`
        );
      }
      setModalVisible(false);
      form.resetFields();
      fetchStaffList();
      fetchGroups();
    } catch (error: any) {
      console.error('操作失败:', error);
      message.error(error.message || '操作失败');
    }
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) {
      message.error('请输入分组名称');
      return;
    }
    if (groups.includes(newGroupName.trim())) {
      message.error('分组已存在');
      return;
    }
    setGroups([...groups, newGroupName.trim()]);
    setNewGroupName('');
    message.success('分组添加成功');
  };

  const handleSetAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      const newRole = isAdmin ? 'admin' : 'coach';
      await memfireDB.users.update(userId, { role: newRole });
      message.success(isAdmin ? '已设为管理' : '已取消管理');
      fetchStaffList();
    } catch (error: any) {
      console.error('设置管理失败:', error);
      message.error('操作失败');
    }
  };

  const getRoleTag = (role: string) => {
    const roleMap: Record<string, { text: string; color: string }> = {
      super_admin: { text: '超级管理', color: 'red' },
      admin: { text: '管理', color: 'orange' },
      finance: { text: '财务', color: 'blue' },
      sales: { text: '销售', color: 'green' },
      coach: { text: '教练', color: 'cyan' },
    };
    const info = roleMap[role] || { text: role, color: 'default' };
    return <Tag color={info.color}>{info.text}</Tag>;
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '联系方式',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (phone: string, record: any) => phone || record.email || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 180,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: string) => getRoleTag(role),
    },
    {
      title: '分组',
      dataIndex: 'group',
      key: 'group',
      width: 120,
      render: (group: string) => group ? <Tag color="purple">{group}</Tag> : '-',
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? '活跃' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.role !== 'super_admin' && (
            <Button
              type="link"
              size="small"
              onClick={() => handleSetAdmin(record.id, record.role !== 'admin')}
            >
              {record.role === 'admin' ? '取消管理' : '设为管理'}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>工作人员列表</h2>
        <Space>
          <Button
            icon={<TeamOutlined />}
            onClick={() => setGroupModalVisible(true)}
          >
            管理分组
          </Button>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={handleAdd}
          >
            添加人员
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={staffList}
          loading={loading}
          rowKey="id"
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 人`,
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* 添加/编辑人员 Modal */}
      <Modal
        title={editingStaff ? '编辑人员' : '添加人员'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="email"
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱' },
              ]}
            >
              <Input placeholder="请输入邮箱" />
            </Form.Item>

            <Form.Item name="phone" label="联系方式">
              <Input placeholder="请输入联系方式" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="role"
              label="角色"
              rules={[{ required: true, message: '请选择角色' }]}
            >
              <Select placeholder="请选择角色">
                <Option value="coach">教练</Option>
                <Option value="sales">销售</Option>
                <Option value="admin">管理</Option>
                <Option value="finance">财务</Option>
                <Option value="super_admin">超级管理</Option>
              </Select>
            </Form.Item>

            <Form.Item name="group" label="分组">
              <Select placeholder="请选择分组" allowClear>
                {groups.map(group => (
                  <Option key={group} value={group}>
                    {group}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          {!editingStaff && (
            <Form.Item
              name="password"
              label="初始密码"
              rules={[{ required: true, message: '请输入初始密码' }]}
            >
              <Input.Password placeholder="请输入初始密码" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 管理分组 Modal */}
      <Modal
        title="管理分组"
        open={groupModalVisible}
        onCancel={() => setGroupModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setGroupModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="输入新分组名称"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onPressEnter={handleAddGroup}
            />
            <Button type="primary" onClick={handleAddGroup}>
              添加
            </Button>
          </Space.Compact>
        </div>

        <div>
          <h4>现有分组：</h4>
          <Space wrap>
            {groups.map(group => (
              <Tag key={group} color="purple">
                {group}
              </Tag>
            ))}
            {groups.length === 0 && <span style={{ color: '#999' }}>暂无分组</span>}
          </Space>
        </div>
      </Modal>
    </div>
  );
};

export default StaffList;

