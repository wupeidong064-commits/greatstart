import { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Modal, Form, Input, Select, Card } from 'antd';
import { UserAddOutlined, EditOutlined, TeamOutlined } from '@ant-design/icons';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { normalizeRole } from '../utils/dataFilter';

const { Option } = Select;

const StaffList = () => {
  const { user } = useAuthStore();
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const isAdmin = normalizedRole === 'admin';
  const userOrgId = user?.organizationId;

  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [filteredStaffList, setFilteredStaffList] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [form] = Form.useForm();
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  const [selectedCampusId, setSelectedCampusId] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchStaffList();
    fetchGroups();
    if (isAdmin) {
      fetchOrganizations();
      fetchCampuses();
    }
  }, []);

  useEffect(() => {
    // admin：根据选择的机构和校区筛选（可组合使用）
    // 非admin：只显示自己机构的工作人员
    if (isAdmin) {
      let filtered = staffList;
      // 按机构筛选
      if (selectedOrgId) {
        filtered = filtered.filter((staff: any) => staff.organizationId === selectedOrgId);
      }
      // 按校区筛选（可以和机构筛选组合使用）
      if (selectedCampusId) {
        filtered = filtered.filter((staff: any) => staff.campusId === selectedCampusId);
      }
      setFilteredStaffList(filtered);
    } else {
      // 非admin（manager等）：只显示自己机构的工作人员
      if (userOrgId) {
        const filtered = staffList.filter((staff: any) => staff.organizationId === userOrgId);
        setFilteredStaffList(filtered);
      } else {
        setFilteredStaffList(staffList);
      }
    }
  }, [selectedOrgId, selectedCampusId, staffList, isAdmin, userOrgId]);

  const fetchOrganizations = async () => {
    try {
      const response = await api.get('/organizations');
      setOrganizations(response.data || []);
    } catch (error) {
      console.error('获取机构列表失败:', error);
    }
  };

  const fetchCampuses = async () => {
    try {
      const response = await api.get('/campuses');
      setCampuses(response.data || []);
    } catch (error) {
      console.error('获取校区列表失败:', error);
    }
  };

  const fetchStaffList = async () => {
    setLoading(true);
    try {
      const response = await api.get('/users');
      const data = response.data || [];
      // 过滤掉家长角色
      const staffOnly = data.filter((user: any) => user.role !== 'parent');
      setStaffList(staffOnly);
      setFilteredStaffList(staffOnly);
    } catch (error: any) {
      console.error('获取工作人员列表失败:', error);
      message.error('获取工作人员列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      // 从用户数据中提取所有分组（排除家长角色）
      const response = await api.get('/users');
      const data = response.data || [];
      const groupSet = new Set<string>();
      data.forEach((user: any) => {
        if (user.group && user.role !== 'parent') {
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
        await api.put(`/users/${editingStaff.id}`, values);
        message.success('更新成功');
      } else {
        const response = await api.post('/auth/create-staff', values);
        const { defaultPassword } = response.data || {};
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

  const handleSetAdmin = async (userId: string, currentRole: string) => {
    try {
      // 如果当前是管理员角色（admin 或 manager），取消管理员身份，恢复为 coach
      // 如果不是管理员角色，设为 manager（校区管理员）
      const newRole = (currentRole === 'admin' || currentRole === 'manager') ? 'coach' : 'manager';
      await api.put(`/users/${userId}`, { role: newRole });
      message.success(newRole === 'manager' ? '已设为校区管理员' : '已取消管理员身份');
      fetchStaffList();
    } catch (error: any) {
      console.error('设置管理失败:', error);
      message.error('操作失败');
    }
  };

  const getRoleTag = (role: string) => {
    const roleMap: Record<string, { text: string; color: string }> = {
      super_admin: { text: '超级管理', color: 'red' },
      admin: { text: '系统管理', color: 'orange' },
      manager: { text: '校区管理', color: 'purple' },
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
              onClick={() => handleSetAdmin(record.id, record.role)}
            >
              {record.role === 'admin' || record.role === 'manager' ? '取消管理' : '设为管理'}
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
        {/* 筛选器 - 仅系统管理员可见 */}
        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <Space wrap>
              <span>筛选：</span>

              {/* 机构筛选 */}
              <Select
                style={{ width: 200 }}
                placeholder="全部机构"
                allowClear
                value={selectedOrgId}
                onChange={setSelectedOrgId}
              >
                {organizations.map((org: any) => (
                  <Option key={org.id} value={org.id}>
                    {org.name}
                  </Option>
                ))}
              </Select>

              {/* 校区筛选 */}
              <Select
                style={{ width: 200 }}
                placeholder="全部校区"
                allowClear
                value={selectedCampusId}
                onChange={setSelectedCampusId}
              >
                {campuses.map((campus: any) => (
                  <Option key={campus.id} value={campus.id}>
                    {campus.name}
                  </Option>
                ))}
              </Select>

              <span style={{ color: '#999' }}>
                {selectedOrgId
                  ? `机构：${organizations.find((o: any) => o.id === selectedOrgId)?.name}`
                  : ''}
                {selectedCampusId
                  ? ` ${selectedOrgId ? '|' : ''} 校区：${campuses.find((c: any) => c.id === selectedCampusId)?.name}`
                  : ''}
                {!selectedOrgId && !selectedCampusId
                  ? `显示全部 (${staffList.length} 人)`
                  : ''}
              </span>
            </Space>
          </div>
        )}

        <Table
          columns={columns}
          dataSource={filteredStaffList}
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
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
              ]}
            >
              <Input placeholder="请输入手机号" />
            </Form.Item>

            <Form.Item
              name="email"
              label="邮箱（可选）"
              rules={[
                { type: 'email', message: '请输入有效的邮箱' },
              ]}
            >
              <Input placeholder="请输入邮箱（可选）" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="role"
              label="角色"
              rules={[{ required: true, message: '请选择角色' }]}
            >
              <Select placeholder="请选择角色">
                <Option value="manager">经理</Option>
                <Option value="sales">销售</Option>
                <Option value="coach">教练</Option>
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
              extra="留空则使用默认密码 123456"
            >
              <Input.Password placeholder="留空使用默认密码 123456" />
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

