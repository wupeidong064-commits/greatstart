import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Avatar, Dropdown, message, Modal, Form, Input } from 'antd';
import {
  UserOutlined,
  BarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
  DollarOutlined,
  UsergroupAddOutlined,
  AppstoreOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';
import { getUserMenuPermissions, normalizeRole } from '../utils/dataFilter';
import { memfireAuth } from '../services/memfireAuth';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = AntLayout;

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordForm] = Form.useForm();
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;

  // 根据当前路径自动展开相应的父菜单
  useEffect(() => {
    const path = location.pathname;
    const keys: string[] = [];

    if (path.startsWith('/operation') || path.startsWith('/attendances') || path.startsWith('/classes')) {
      keys.push('/operation');
      // 如果是出勤相关页面，也展开出勤管理子菜单
      if (path.startsWith('/attendances')) {
        keys.push('/attendances');
      }
    }
    if (path.startsWith('/cashflow')) {
      keys.push('/cashflow');
    }
    // 特殊处理：续费管理在cashflow菜单下，但路径是/students/renewal
    if (path === '/students/renewal') {
      keys.push('/cashflow');
    } else if (path.startsWith('/students')) {
      keys.push('/students');
    }
    if (path.startsWith('/teachers')) {
      keys.push('/staff-management');
      if (path === '/teachers') {
        keys.push('/teachers');
      } else if (path.startsWith('/teachers/dashboard')) {
        keys.push('/teachers/dashboard');
      }
    }
    if (path.startsWith('/analytics')) {
      keys.push('/analytics');
    }
    // 系统管理相关页面（包括机构管理、工作人员列表、基础设置）
    if (path.startsWith('/system') || path === '/organizations') {
      keys.push('/system');
    }

    setOpenKeys(keys);
  }, [location.pathname]);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    // 点击菜单项后，保持当前展开的菜单状态，不自动折叠
  };

  const handleOpenChange = (keys: string[]) => {
    // 只允许手动点击父菜单标题时折叠/展开
    // 合并新展开的菜单，不自动折叠已展开的菜单
    const latestOpenKey = keys.find(key => openKeys.indexOf(key) === -1);
    
    if (latestOpenKey) {
      // 展开新菜单时，保留已展开的菜单
      setOpenKeys([...openKeys, latestOpenKey]);
    } else {
      // 用户点击已展开的菜单标题，允许折叠
      setOpenKeys(keys);
    }
  };

  // 获取当前用户的菜单权限
  const permissions = getUserMenuPermissions();

  // 构建菜单项，根据权限动态显示
  const buildMenuItems = () => {
    const items = [];

    // 学员中心 - parent 角色专属
    if (normalizedRole === 'parent') {
      items.push({
        key: '/student',
        icon: <UserOutlined />,
        label: '学员中心',
        children: [
          {
            key: '/student/schedules',
            label: '我的课表',
          },
          {
            key: '/student/attendances',
            label: '出勤记录',
          },
          {
            key: '/student/payments',
            label: '缴费信息',
          },
        ],
      });
    }

    // 课消收入中心 - admin/manager/coach 可见
    if (permissions.canViewAllClasses || normalizedRole === 'coach') {
      items.push({
        key: '/operation',
        icon: <AppstoreOutlined />,
        label: normalizedRole === 'coach' ? '我的班级管理' : '课消收入中心',
        children: [
          {
            key: '/classes',
            label: normalizedRole === 'coach' ? '我的班级' : '班级管理',
          },
          ...(permissions.canViewAllClasses ? [{
            key: '/operation/weekly-schedule',
            label: '每周排课',
          }] : []),
          {
            key: '/attendances',
            label: '出勤管理',
            children: [
              {
                key: '/attendances',
                label: '班级出勤',
              },
              {
                key: '/attendances/continuous-leave',
                label: '低出勤学员',
              },
              {
                key: '/attendances/honeymoon',
                label: '蜜月期客户出勤',
              },
            ],
          },
          ...(permissions.canViewAllClasses ? [{
            key: '/operation/consumption',
            label: '课消收入总结',
          }] : []),
        ],
      });
    }

    // 现金流中心（销售相关）- admin/manager/coach 可见
    if (permissions.canViewSalesData) {
      items.push({
        key: '/cashflow',
        icon: <DollarOutlined />,
        label: normalizedRole === 'coach' ? '我的销售管理' : '现金流中心',
        children: [
          ...(permissions.canViewReports ? [{
            key: '/cashflow/summary',
            label: '现金流收入总结',
          }] : []),
          {
            key: '/cashflow/marketing',
            label: normalizedRole === 'coach' ? '我的鱼池' : '营销与销售（鱼池）',
          },
          {
            key: '/cashflow/experience-schedule',
            label: normalizedRole === 'coach' ? '我的体验课' : '体验课表',
          },
          {
            key: '/cashflow/order-info',
            label: normalizedRole === 'coach' ? '我的成单' : '成单信息表',
          },
          {
            key: '/students/renewal',
            label: normalizedRole === 'coach' ? '我的续费学员' : '续费管理',
          },
        ],
      });
    }

    // 学员管理 - admin/manager/coach 可见
    if (permissions.canViewAllStudents || normalizedRole === 'coach') {
      items.push({
        key: '/students',
        icon: <UserOutlined />,
        label: normalizedRole === 'coach' ? '我的学员' : '学员管理',
        children: [
          {
            key: '/students',
            label: normalizedRole === 'coach' ? '我的学员列表' : '学员列表/档案',
          },
          ...(permissions.canViewAllStudents ? [{
            key: '/students/lost',
            label: '流失学员库',
          }] : []),
        ],
      });
    }

    // 工作人员管理 - admin/manager 可见，coach 只能看到教练员数据
    if (permissions.canViewReports || normalizedRole === 'coach') {
      const menuItems = [];
      // 教练员数据 - admin/manager/coach 都可见
      menuItems.push({
        key: '/teachers',
        label: '教练员数据',
      });
      // 销售数据 - 只有 admin/manager 可见
      if (permissions.canViewReports) {
        menuItems.push({
          key: '/teachers/dashboard',
          label: '销售数据',
        });
      }
      items.push({
        key: '/staff-management',
        icon: <UsergroupAddOutlined />,
        label: normalizedRole === 'coach' ? '教练数据' : '工作人员管理',
        children: menuItems,
      });
    }

// 数据统计与分析 - admin/manager 可见
    if (permissions.canViewReports) {
      items.push({
        key: '/analytics',
        icon: <BarChartOutlined />,
        label: '数据统计与分析',
        children: [
          {
            key: '/summary/weekly',
            label: '周总结',
          },
        ],
      });
    }

    // 系统管理 - admin 可见
    if (permissions.canViewUsers || permissions.canViewOrganizations || permissions.canViewSettings) {
      const systemChildren = [];
      
      if (permissions.canViewUsers) {
        systemChildren.push({
          key: '/system/staff-list',
          label: '工作人员列表',
        });
        systemChildren.push({
          key: '/system/resource-transfer',
          label: '资源交接',
        });
      }
      
      if (permissions.canViewOrganizations) {
        systemChildren.push({
          key: '/organizations',
          label: '机构管理',
        });
      }
      
      if (permissions.canViewSettings) {
        systemChildren.push({
          key: '/system/settings',
          label: '基础设置',
        });
      }
      
      if (systemChildren.length > 0) {
        items.push({
          key: '/system',
          icon: <SettingOutlined />,
          label: '系统管理',
          children: systemChildren,
        });
      }
    }

    return items;
  };

  const menuItems = buildMenuItems();

  // 修改密码处理
  const handlePasswordChange = async () => {
    try {
      const values = await passwordForm.validateFields();
      setPasswordLoading(true);

      const result = await memfireAuth.changePassword(
        values.oldPassword,
        values.newPassword
      );

      if (result.success) {
        message.success('密码修改成功');
        setPasswordModalVisible(false);
        passwordForm.resetFields();
      } else {
        message.error(result.error || '密码修改失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      message.error(error.message || '密码修改失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'changePassword',
      icon: <LockOutlined />,
      label: '修改密码',
      onClick: () => {
        setPasswordModalVisible(true);
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        clearAuth();
        message.success('已退出登录');
        navigate('/login');
      },
    },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={200}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 'bold',
            fontSize: '18px',
          }}
        >
          智能服务系统
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          openKeys={openKeys}
          onOpenChange={handleOpenChange}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ height: 'calc(100vh - 64px)', borderRight: 0 }}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user?.name}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px', background: '#fff', padding: '24px' }}>
          <Outlet />
        </Content>
      </AntLayout>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密码"
        open={passwordModalVisible}
        onCancel={() => {
          setPasswordModalVisible(false);
          passwordForm.resetFields();
        }}
        onOk={handlePasswordChange}
        confirmLoading={passwordLoading}
        okText="确认修改"
        cancelText="取消"
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            label="原密码"
            name="oldPassword"
            rules={[
              { required: true, message: '请输入原密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password placeholder="请输入原密码" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6位' },
            ]}
            hasFeedback
          >
            <Input.Password placeholder="请输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </AntLayout>
  );
};

export default Layout;

