import { useOverlaySubmit, Modal } from '../components/overlays';
import { useState, useEffect, useRef } from 'react';
import { Table, Button, Space, Tag, message, Form, Input, Radio, Card } from 'antd';
import { UserPlus, Pencil, Trash2, KeyRound, ClipboardCopy } from 'lucide-react';
import api from '../services/api';
import { normalizePhone } from '../utils/phone';
import { useAuthStore } from '../store/authStore';
import './StaffList.css';

const StaffList = () => {
  const { user } = useAuthStore();
  const canAppoint = user?.managementLevel === 'super';
  const managementBusy = useRef(false);
  const [managementSaving, setManagementSaving] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitStaffForm, staffFormSubmitting] = useOverlaySubmit((values: any) => handleSubmit(values));
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [form] = Form.useForm();
  const [checkingDeleteId, setCheckingDeleteId] = useState<string | null>(null);
  const checkingDelete = useRef(false);
  const passwordResetDialogOpen = useRef(false);
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);
  useEffect(() => {
    fetchStaffList();
  }, []);

  const fetchStaffList = async () => {
    setLoading(true);
    try {
      // The delete endpoint retains an inactive account for historical associations.
      // Read all API pages before filtering so inactive accounts do not hide later staff.
      const users: any[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await api.get('/users', { params: { page, pageSize: 1000 } });
        users.push(...(response.data || []));
        totalPages = Math.max(1, Math.ceil((response.pagination?.total || 0) / 1000));
        page += 1;
      } while (page <= totalPages);
      setStaffList(users.filter((staff: any) => staff.role !== 'parent' && staff.isActive !== false));
    } catch (error: any) {
      // Axios errors include request headers; keep login credentials out of logs.
      console.error('获取工作人员列表失败');
      message.error('获取工作人员列表失败');
    } finally {
      setLoading(false);
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
      phone: record.phone,
      email: record.email || '',
      role: record.jobRole === null ? undefined : (record.jobRole ?? (['admin','manager','super_admin'].includes(record.role) ? undefined : record.role)),
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    const owner = useAuthStore.getState().token;
    const isCurrent = () => owner === useAuthStore.getState().token;
    try {
      if (editingStaff) {
        const phone = normalizePhone(values.phone || '');
        const phoneChanged = canAppoint && phone !== normalizePhone(editingStaff.phone || '');
        const email = values.email?.trim().toLowerCase() || '';
        const emailChanged = canAppoint && values.email !== undefined && email !== (editingStaff.email?.trim().toLowerCase() || '');
        const originalRole = editingStaff.jobRole === null ? undefined : (editingStaff.jobRole ?? (['admin','manager','super_admin'].includes(editingStaff.role) ? undefined : editingStaff.role));
        await api.put(`/users/${editingStaff.id}`, {
          expectedUpdatedAt: editingStaff.updatedAt,
          ...(values.name !== editingStaff.name ? { name: values.name } : {}),
          ...(values.role !== originalRole ? { role: values.role } : {}),
          ...(phoneChanged ? { phone: phone || null } : {}),
          ...(emailChanged ? { email: email || null } : {}),
        });
        if (!isCurrent()) return;
        message.success('更新成功');
      } else {
        const email = values.email?.trim();
        const response = await api.post('/auth/create-staff', {
          name: values.name,
          phone: normalizePhone(values.phone),
          role: values.role,
          ...(email ? { email } : {}),
          ...(values.password ? { password: values.password } : {}),
        });
        if (!isCurrent()) return;
        const { defaultPassword } = response.data || {};
        if (defaultPassword) {
          Modal.info({ title: '工作人员账号已创建', content: <div><p>登录手机号：<strong>{response.data?.phone || values.phone}</strong></p><p>初始密码仅本次展示，请妥善交付给本人，并提醒登录后修改密码。</p><p style={{ overflowWrap: 'anywhere' }}><strong>{defaultPassword}</strong></p></div>, okText: '已记录', maskClosable: false });
        } else message.success('工作人员账号已创建');
      }
      setModalVisible(false);
      form.resetFields();
      fetchStaffList();
    } catch (error: any) {
      if (!isCurrent()) return;
      console.error('工作人员保存失败');
      message.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || '操作失败');
    }
  };

  const canEditStaff = (record: any) => {
    if (record.isPlatformAdmin) return false;
    if (record.managementLevel === 'super') return record.id === user?.id;
    return record.managementLevel !== 'manager' || canAppoint || record.id === user?.id;
  };
  const canDeleteUser = (record: any) => record.id !== user?.id && record.managementLevel !== 'super' &&
    !record.isPlatformAdmin && (record.managementLevel !== 'manager' || canAppoint);
  const canResetPassword = (record: any) => canAppoint && record.id !== user?.id &&
    record.managementLevel !== 'super' && !record.isPlatformAdmin && record.role !== 'parent' && record.isActive !== false;

  const handleResetPassword = (record: any) => {
    if (!canResetPassword(record) || passwordResetDialogOpen.current) return;
    passwordResetDialogOpen.current = true;
    let saving = false;
    const confirmation = Modal.confirm({
      title: '重置工作人员密码',
      content: <p>确定重置“{record.name}”的密码吗？系统将生成新密码，原密码和已有登录状态会失效。</p>,
      okText: '确认重置', cancelText: '取消',
      afterClose: () => { passwordResetDialogOpen.current = false; },
      onOk: (close: () => void) => {
        if (saving) return;
        saving = true; setResettingPasswordId(record.id);
        confirmation.update({ okButtonProps: { loading: true }, cancelButtonProps: { disabled: true }, keyboard: false, closable: false });
        void (async () => {
          try {
            const response = await api.post(`/users/${record.id}/reset-password`, { expectedUpdatedAt: record.updatedAt });
            const account = response.data;
            if (!account?.newPassword) throw new Error('未收到新密码，请刷新列表后重新发起重置');
            close();
            Modal.info({
              title: '密码已重置', okText: '已记录', maskClosable: false,
              content: <div>
                <p>{account.name} · {account.phone || account.email}</p>
                <p>新密码仅本次显示，请交付本人，并提醒登录后修改密码。</p>
                <p className="staff-reset-password"><strong>{account.newPassword}</strong></p>
                <Button icon={<ClipboardCopy size={16} />} onClick={async () => {
                  try { await navigator.clipboard.writeText(account.newPassword); message.success('新密码已复制'); }
                  catch { message.error('复制失败，请手动复制上方密码'); }
                }}>复制新密码</Button>
              </div>,
            });
            void fetchStaffList();
          } catch (error: any) {
            message.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || '重置失败');
            if (!error.response || error.response.status === 409) {
              close(); void fetchStaffList();
            } else {
              confirmation.update({ okButtonProps: { loading: false }, cancelButtonProps: { disabled: false }, keyboard: true });
            }
          } finally { saving = false; setResettingPasswordId(null); }
        })();
      },
    });
  };

  const handleSetAdmin = (record: any) => {
    const current = record.managementLevel || 'none';
    const next = current === 'manager' ? 'none' : 'manager';
    let busy = false;
    const confirmation = Modal.confirm({
      title: next === 'manager' ? '设为机构管理员' : '取消机构管理员',
      content: <p>确定{next === 'manager' ? '授予' : '取消'}“{record.name}”的机构管理权限吗？原岗位、负责班级及学员关系保留。</p>,
      okText: '确认', cancelText: '取消',
      onOk: (close: () => void) => {
        if (busy || managementBusy.current) return;
        busy = true; managementBusy.current = true; setManagementSaving(record.id);
        confirmation.update({ okButtonProps: { loading: true }, cancelButtonProps: { disabled: true }, keyboard: false });
        void (async () => {
          try {
            await api.put(`/users/${record.id}/management`, { managementLevel: next, expectedLevel: current });
            const result = await api.get(`/users/${record.id}`);
            if (result.data?.managementLevel !== next) throw new Error('管理身份未更新，请刷新核实');
            message.success(next === 'manager' ? '已设为机构管理员' : '已取消机构管理员，原岗位保留');
            await fetchStaffList(); close();
          } catch (error: any) {
            message.error(error.response?.data?.error?.message || error.message || '管理身份更新失败');
            confirmation.update({ okButtonProps: { loading: false }, cancelButtonProps: { disabled: false }, keyboard: true });
          } finally { busy = false; managementBusy.current = false; setManagementSaving(null); }
        })();
      },
    });
  };

  const showDeletionBlocked = (reason: string) => {
    Modal.info({
      title: '暂不能删除该工作人员',
      content: <div><p style={{ overflowWrap: 'anywhere' }}>{reason}</p><p>请前往“系统管理 → 资源交接”，完成班级及学员移交后，再回来删除。</p></div>,
      okText: '知道了',
    });
  };

  const handleDelete = async (record: any) => {
    if (checkingDelete.current) return;
    if (['coach', 'teacher'].includes(record.jobRole || record.role)) {
      checkingDelete.current = true;
      setCheckingDeleteId(record.id);
      try {
        const response = await api.get(`/resource-transfers/teacher-resources/${record.id}`);
        const resources = response.data;
        if (!resources?.summary || !Array.isArray(resources.classes)) throw new Error('未能核验教师负责的班级，请刷新后重试');
        if (resources.summary.classCount > 0 || resources.classes.length > 0) {
          showDeletionBlocked(`该教师仍负责 ${resources.summary.classCount || resources.classes.length} 个班级${resources.summary.studentCount > 0 ? '及班内在读学员' : ''}，尚未完成移交，暂不能删除。`);
          return;
        }
      } catch (error: any) {
        message.error(error.response?.data?.error?.message || error.message || '未能核验教师负责的班级，请稍后重试');
        return;
      } finally {
        checkingDelete.current = false;
        setCheckingDeleteId(null);
      }
    }
    let deleting = false;
    const confirmation = Modal.confirm({
      title: '确认删除',
      content: `确定要删除工作人员“${record.name || record.email}”吗？账号将停用并从工作人员列表移除，历史课务和账务记录会保留。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: (close: () => void) => {
        if (deleting) return;
        deleting = true;
        confirmation.update({ okButtonProps: { loading: true }, cancelButtonProps: { disabled: true }, keyboard: false });
        // Use manual close so a handled request error keeps the dialog open without
        // creating an unhandled rejection in Ant's static confirm promise handler.
        void (async () => {
          try {
            const response = await api.delete(`/users/${record.id}`);
            if (response.success === false) throw new Error('删除失败');
            // Only report success after a fresh read confirms the account was disabled/removed.
            let deleted = false;
            try {
              const result = await api.get(`/users/${record.id}`);
              deleted = result.data?.isActive === false;
            } catch (error: any) {
              if (error.response?.status === 404) deleted = true;
              else throw new Error('已提交删除，但未能核验结果，请刷新确认');
            }
            if (!deleted) throw new Error('账号仍处于启用状态，删除未生效，请重试');
            setStaffList(current => current.filter(staff => staff.id !== record.id));
            message.success('工作人员已删除，历史业务记录已保留');
            await fetchStaffList();
            close();
          } catch (error: any) {
            if (error.response?.data?.error?.code === 'STAFF_HAS_RESPONSIBILITIES') {
              close();
              showDeletionBlocked(error.response.data.error.message);
              return;
            }
            console.error('工作人员删除失败');
            message.error(error.response?.data?.message || error.response?.data?.error?.message || error.message || '删除失败');
            confirmation.update({ okButtonProps: { loading: false }, cancelButtonProps: { disabled: false }, keyboard: true });
          } finally {
            deleting = false;
          }
        })();
      },
    });
  };

  const getRoleTag = (role: string, isPlatformAdmin = false) => {
    const roleNames: Record<string, string> = {
      super_admin: '机构管理员',
      admin: '机构管理员',
      manager: '机构管理员',
      finance: '财务',
      sales: '销售',
      coach: '老师',
      teacher: '老师',
      staff: '工作人员',
    };
    return <Tag color="purple">{isPlatformAdmin ? '系统管理员' : roleNames[role] || role}</Tag>;
  };

  // Give every column a share of the available width. Leaving email unbounded
  // makes it absorb the entire surplus on wide screens and separates related fields.
  const columnWidths = canAppoint
    ? ['12%', '14%', '24%', '11%', '15%', '24%']
    : ['14%', '16%', '27%', '12%', '15%', '16%'];
  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: columnWidths[0],
    },
    {
      title: '登录手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: columnWidths[1],
      render: (phone: string) => phone || '—',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: columnWidths[2],
      render: (email: string | null) => email || '—',
    },
    {
      title: '岗位',
      dataIndex: 'role',
      key: 'role',
      width: columnWidths[3],
      render: (role: string, record: any) => record.jobRole === null ? <Tag color="purple">岗位待确认</Tag> : getRoleTag(record.jobRole || role, record.isPlatformAdmin === true),
    },
    {
      title: '管理身份', key: 'management', width: columnWidths[4],
      render: (_: any, record: any) => <Tag color="purple">{record.managementLevel === 'super' ? '超级机构管理员' : record.managementLevel === 'manager' ? '机构管理员' : '普通员工'}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: columnWidths[5],
      render: (_: any, record: any) => (
        <Space size="small" wrap className="staff-list-actions">
          {canEditStaff(record) && <Button
            type="link"
            size="small"
            icon={<Pencil size={14} />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>}
          {canResetPassword(record) && <Button
            type="link"
            size="small"
            icon={<KeyRound size={14} />}
            loading={resettingPasswordId === record.id}
            onClick={() => handleResetPassword(record)}
          >重置密码</Button>}
          {canAppoint && record.managementLevel !== 'super' && !record.isPlatformAdmin && (
            <Button
              type="link"
              size="small"
              loading={managementSaving === record.id}
              onClick={() => handleSetAdmin(record)}
            >
              {record.managementLevel === 'manager' ? '取消机构管理员' : '设为机构管理员'}
            </Button>
          )}
          {canDeleteUser(record) && (
            <Button
              type="link"
              size="small"
              danger
              icon={<Trash2 size={14} />}
              loading={checkingDeleteId === record.id}
              onClick={() => handleDelete(record)}
            >
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="staff-list-page">
      <div className="staff-list-heading">
        <h2 style={{ margin: 0 }}>工作人员列表</h2>
        <Space>
          <Button
            type="primary"
            icon={<UserPlus size={16} />}
            onClick={handleAdd}
          >
            添加人员
          </Button>
        </Space>
      </div>

      <Card className="staff-list-panel">
        <Table
          className="staff-list-table"
          tableLayout="fixed"
          columns={columns}
          dataSource={staffList}
          loading={loading}
          rowKey="id"
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 人`,
          }}
          scroll={{ x: canAppoint ? 1100 : 980 }}
        />
      </Card>

      {/* 添加/编辑人员 Modal */}
      <Modal
        title={editingStaff ? '编辑人员' : '添加人员'}
        open={modalVisible}
        confirmLoading={staffFormSubmitting}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} onFinish={submitStaffForm} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <Form.Item
            name="phone"
            normalize={normalizePhone}
            label="登录手机号"
            extra={editingStaff ? (canAppoint ? '修改后可使用新手机号和原密码登录。' : '仅超级机构管理员可修改登录手机号。') : undefined}
            rules={[
              { required: !editingStaff || (canAppoint && !!editingStaff.phone), message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
            ]}
          >
            <Input placeholder="请输入手机号（用于登录）" disabled={!!editingStaff && !canAppoint} />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱（选填）"
            normalize={value => value?.trim()}
            dependencies={['phone']}
            extra={editingStaff ? (canAppoint ? '修改后可使用新邮箱和原密码登录；有手机号时可留空。' : '仅超级机构管理员可修改登录邮箱。') : undefined}
            rules={[
              { type: 'email', message: '请输入有效的邮箱，或留空' },
              ({ getFieldValue }) => ({ validator: (_, value) => {
                if (editingStaff && canAppoint && !value?.trim() && !normalizePhone(getFieldValue('phone') || '')) {
                  return Promise.reject(new Error('手机号和邮箱至少保留一项'));
                }
                return Promise.resolve();
              } }),
            ]}
          >
            <Input placeholder="可不填写，使用手机号登录" autoComplete="email" disabled={!!editingStaff && !canAppoint} />
          </Form.Item>

          <Form.Item
            name="role"
            label="岗位"
            extra={editingStaff?.jobRole === null ? '未选择时保留原岗位，不影响管理身份。' : undefined}
            rules={[{ required: !editingStaff || editingStaff.jobRole !== null, message: '请选择岗位' }]}
          >
            <Radio.Group optionType="button" buttonStyle="solid" options={[
              { label: '销售', value: 'sales' },
              { label: '老师', value: 'coach' },
              { label: '工作人员', value: 'staff' },
            ]} />
          </Form.Item>

          {!editingStaff && (
            <Form.Item
              name="password"
              label="初始密码"
              extra="留空自动生成随机初始密码，仅在创建成功后展示一次"
              rules={[{
                validator: (_, value) => !value || (value.length >= 8 && new TextEncoder().encode(value).length <= 72)
                  ? Promise.resolve()
                  : Promise.reject(new Error('密码至少8位，且不得超过72字节')),
              }]}
            >
              <Input.Password placeholder="留空自动生成随机密码" />
            </Form.Item>
          )}
        </Form>
      </Modal>

    </div>
  );
};

export default StaffList;

