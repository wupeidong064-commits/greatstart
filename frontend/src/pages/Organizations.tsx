import { Modal, Popconfirm } from '../components/overlays';
import { useState, useEffect } from 'react';
import { Table, Button, message, Form, Input, Space, DatePicker, Alert, Typography } from 'antd';
import { authService, type OrganizationApplication } from '../services/authService';
import api from '../services/api';
import dayjs from 'dayjs';
import { Copy, Mail, Plus, Trash2, UserPlus } from 'lucide-react';
import OrganizationAdmins from '../components/OrganizationAdmins';
import { normalizePhone, isValidPhone } from '../utils/phone';

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
  const [applications, setApplications] = useState<OrganizationApplication[]>([]);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email?: string | null; phone?: string | null; defaultPassword: string; organizationName: string; contactName: string } | null>(null);
  const [loginAddress, setLoginAddress] = useState(() => new URL('/login', window.location.origin).href);
  const [copyingNotice, setCopyingNotice] = useState(false);
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

  const fetchApplications = async () => {
    setApplicationLoading(true);
    try {
      const response = await authService.applications();
      setApplications(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message || '获取开通申请失败');
    } finally { setApplicationLoading(false); }
  };
  useEffect(() => { fetchApplications(); }, []);
  const review = async (application: OrganizationApplication, action: 'approve' | 'reject') => {
    if (reviewing) return;
    setReviewing(application.id);
    try {
      const response = await authService.reviewApplication(application.id, action);
      if (action === 'approve' && response.data?.defaultPassword) {
        setLoginAddress(new URL('/login', window.location.origin).href);
        setCredentials({ ...response.data, organizationName: application.organizationName, contactName: application.contactName });
      }
      message.success(action === 'approve' ? '审核通过，机构与首位超级机构管理员已开通' : '申请已拒绝');
      await Promise.all([fetchApplications(), fetchOrganizations()]);
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message || '审核失败，请刷新列表核实');
    } finally { setReviewing(null); }
  };

  const parsedLoginAddress = (() => {
    try {
      const url = new URL(loginAddress.trim());
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch { return null; }
  })();
  const localLoginAddress = parsedLoginAddress && ['localhost', '127.0.0.1', '[::1]'].includes(parsedLoginAddress.hostname);
  const openingNotice = credentials && parsedLoginAddress ? [
    `${credentials.contactName}，您好！`,
    `${credentials.organizationName}已开通蜂鸣课务。`,
    '',
    `登录地址：${parsedLoginAddress.href}`,
    `登录账号：${credentials.phone || credentials.email}`,
    `初始密码：${credentials.defaultPassword}`,
    '',
    '登录后，请点击左下角个人菜单中的「修改密码」，设置您自己的密码。',
    '请妥善保管登录信息。',
  ].join('\n') : '';
  const emailNoticeUrl = credentials?.email && openingNotice
    ? `mailto:${encodeURIComponent(credentials.email)}?subject=${encodeURIComponent(`${credentials.organizationName}｜蜂鸣课务开通通知`)}&body=${encodeURIComponent(openingNotice)}`
    : undefined;

  const copyOpeningNotice = async () => {
    if (!openingNotice || copyingNotice) return;
    setCopyingNotice(true);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(openingNotice);
      } else {
        const text = document.createElement('textarea');
        text.value = openingNotice;
        text.style.position = 'fixed';
        text.style.opacity = '0';
        // Keep the copy target inside the active modal's focus boundary.
        const focused = document.activeElement as HTMLElement | null;
        const host = focused?.closest('.ant-modal-content') || document.body;
        host.appendChild(text);
        try {
          text.select();
          if (!document.execCommand('copy')) throw new Error('Copy failed');
        } finally {
          text.remove();
          focused?.focus();
        }
      }
      message.success('开通通知已复制，可直接粘贴发送给申请人');
    } catch {
      message.error('复制失败，请重试或使用「用邮件发送」');
    } finally { setCopyingNotice(false); }
  };

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

      const response: any = await api.post('/organizations', {
        name: values.name,
        code: values.code,
        address: values.address,
        phone: values.phone,
        email: values.email,
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : undefined,
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
      });

      message.success('机构创建成功，请继续新增超级机构管理员');
      setModalVisible(false);
      form.resetFields();
      await fetchOrganizations();
      if (response.data?.id) {
        setSelectedOrg(response.data);
        managerForm.resetFields();
        setManagerModalVisible(true);
      }
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

      const response: any = await api.post('/auth/create-manager', {
        phone: normalizePhone(values.phone),
        email: values.email?.trim() || undefined,
        name: values.name,
        organizationId: orgId,
      });
      const organization = selectedOrg || organizations.find(org => org.id === orgId);
      if (response.data?.defaultPassword) {
        setLoginAddress(new URL('/login', window.location.origin).href);
        setCredentials({ email: response.data.email, phone: response.data.phone, defaultPassword: response.data.defaultPassword,
          organizationName: organization?.name || '您的机构', contactName: values.name });
      }

      message.success('超级机构管理员已创建');
      setManagerModalVisible(false);
      managerForm.resetFields();
      setSelectedOrg(null);
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      message.error(error.message || '创建超级机构管理员失败');
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
            icon={<UserPlus size={16} aria-hidden="true" />}
            onClick={() => handleAddManagerForOrg(record)}
          >
            新增超级机构管理员
          </Button>
          <OrganizationAdmins organization={record} />
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
              icon={<Trash2 size={16} aria-hidden="true" />}
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
      <div className="responsive-page-heading" style={{ marginBottom: 16 }}>
        <h1>机构管理</h1>
        <Space>
          <Button
            icon={<UserPlus size={16} aria-hidden="true" />}
            onClick={handleAddManager}
          >
            创建超级机构管理员
          </Button>
          <Button
            type="primary"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setModalVisible(true)}
          >
            新增机构
          </Button>
        </Space>
      </div>
      <section style={{ marginBottom: 28 }} aria-labelledby="applications-title">
        <Space style={{ marginBottom: 12 }}><h2 id="applications-title" style={{ margin: 0, fontSize: 20 }}>待审核开通申请</h2><Button onClick={fetchApplications} loading={applicationLoading}>刷新申请</Button></Space>
        <Alert style={{ marginBottom: 12 }} type="info" message="通过后将创建独立机构及首位超级机构管理员。登录信息仅展示一次，可复制通知或用邮件交付。" />
        <Table rowKey="id" loading={applicationLoading} dataSource={applications} pagination={{ pageSize: 5 }} scroll={{ x: 720 }} columns={[
          { title: '机构名称', dataIndex: 'organizationName' },
          { title: '联系人', dataIndex: 'contactName' },
          { title: '联系方式', key: 'contact', render: (_: unknown, application: OrganizationApplication) => application.phone || application.email || '—' },
          { title: '申请时间', dataIndex: 'createdAt', render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
          { title: '操作', key: 'review', render: (_: unknown, application: OrganizationApplication) => <Space>
            <Popconfirm title="通过并开通机构？" description="将创建首位超级机构管理员，初始密码仅展示一次。" onConfirm={() => review(application, 'approve')} disabled={Boolean(reviewing)} okText="通过并开通" cancelText="取消"><Button type="primary" size="small" disabled={Boolean(reviewing)} loading={reviewing === application.id}>通过</Button></Popconfirm>
            <Popconfirm title="拒绝此开通申请？" onConfirm={() => review(application, 'reject')} disabled={Boolean(reviewing)} okText="拒绝" cancelText="取消"><Button size="small" danger disabled={Boolean(reviewing)}>拒绝</Button></Popconfirm>
          </Space> },
        ]} locale={{ emptyText: '暂无待审核申请' }} />
      </section>
      <Modal title="管理员登录信息（仅本次展示）" open={Boolean(credentials)} onCancel={() => setCredentials(null)} width={620} footer={[
        <Button key="close" onClick={() => setCredentials(null)}>已妥善记录</Button>,
        credentials?.email && <Button key="email" href={emailNoticeUrl} disabled={!openingNotice} icon={<Mail size={16} aria-hidden="true" />}>用邮件发送</Button>,
        <Button key="copy" type="primary" onClick={copyOpeningNotice} loading={copyingNotice} disabled={!openingNotice} icon={<Copy size={16} aria-hidden="true" />}>复制开通通知</Button>,
      ]} maskClosable={false} destroyOnClose>
        <p>请将以下信息安全交付给申请联系人，并提醒其登录后修改密码。关闭后无法重新查看此密码。</p>
        <p>登录账号：<Typography.Text copyable>{credentials?.phone || credentials?.email}</Typography.Text></p>
        <p>初始密码：<Typography.Text copyable style={{ overflowWrap: 'anywhere' }}>{credentials?.defaultPassword}</Typography.Text></p>
        <Form.Item label="登录地址" validateStatus={parsedLoginAddress ? undefined : 'error'} help={!parsedLoginAddress ? '请输入完整的 http:// 或 https:// 登录地址' : undefined}>
          <Input aria-label="登录地址" value={loginAddress} onChange={event => setLoginAddress(event.target.value)} />
        </Form.Item>
        {localLoginAddress && <Alert type="warning" showIcon message="当前为本机地址。向申请人发送前，请填写对方可以访问的登录地址。" style={{ marginBottom: 12 }} />}
        {credentials?.email && <p style={{ color: 'var(--tx3)', marginBottom: 0 }}>「用邮件发送」会打开默认邮箱，请在邮件编辑窗口中确认发送。</p>}
      </Modal>
      <Table
        columns={columns}
        dataSource={organizations}
        scroll={{ x: 'max-content' }}
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
        <Form name="organization-create" form={form} layout="vertical">
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

      {/* 创建超级机构管理员模态框 */}
      <Modal
        title={selectedOrg ? `为 ${selectedOrg.name} 创建超级机构管理员` : '创建超级机构管理员'}
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
        <Form name="organization-manager" form={managerForm} layout="vertical" initialValues={{ organizationId: selectedOrg?.id }}>
          {!selectedOrg && (
            <Form.Item
              label="选择机构"
              name="organizationId"
              rules={[{ required: true, message: '请选择机构' }]}
            >
              <select style={{ width: '100%', padding: '8px', border: '1px solid var(--line)', borderRadius: '4px' }}>
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
            <Input placeholder="请输入管理员姓名" />
          </Form.Item>

          <Form.Item
            label="登录手机号"
            name="phone"
            rules={[
              { required: true, message: '请输入手机号' },
              { validator: (_, value) => !value || isValidPhone(value) ? Promise.resolve() : Promise.reject(new Error('请输入有效的手机号')) },
            ]}
          >
            <Input type="tel" autoComplete="tel" placeholder="请输入手机号（用于登录）" maxLength={20} />
          </Form.Item>

          <Form.Item
            label="联系邮箱（选填）"
            name="email"
            rules={[
              { type: 'email', message: '请输入正确的邮箱地址' },
            ]}
          >
            <Input placeholder="用于接收邮件通知（选填）" />
          </Form.Item>

          <p style={{ color: 'var(--tx3)' }}>初始密码由系统生成，创建后可复制开通通知交付给本人。</p>
        </Form>
      </Modal>

    </div>
  );
};

export default Organizations;

