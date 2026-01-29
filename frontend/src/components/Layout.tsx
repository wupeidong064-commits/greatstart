import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Avatar, Dropdown, message } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  BankOutlined,
  SettingOutlined,
  LogoutOutlined,
  FileTextOutlined,
  DollarOutlined,
  ShopOutlined,
  UserDeleteOutlined,
  UsergroupAddOutlined,
  LineChartOutlined,
  WalletOutlined,
  FileSearchOutlined,
  AppstoreOutlined,
  FundProjectionScreenOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';
import { getUserMenuPermissions } from '../utils/dataFilter';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = AntLayout;

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const [openKeys, setOpenKeys] = useState<string[]>([]);

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
      keys.push('/teachers');
    }
    if (path.startsWith('/finance')) {
      keys.push('/finance');
    }
    if (path.startsWith('/analytics')) {
      keys.push('/analytics');
    }
    if (path.startsWith('/system')) {
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

  // 🔍 临时调试日志 - 查看用户信息和权限
  useEffect(() => {
    console.log('=== 菜单权限调试信息 ===');
    console.log('当前用户:', user);
    console.log('用户角色:', user?.role);
    console.log('菜单权限:', permissions);
    console.log('========================');
  }, [user, permissions]);

  // 构建菜单项，根据权限动态显示
  const buildMenuItems = () => {
    const items = [];

    console.log('🔍 开始构建菜单，权限:', permissions);

    // 课消收入中心 - admin/manager/teacher 可见
    if (permissions.canViewAllClasses || user?.role === 'teacher') {
      console.log('✅ 添加"课消收入中心"菜单');
      items.push({
        key: '/operation',
        icon: <AppstoreOutlined />,
        label: user?.role === 'teacher' ? '我的班级管理' : '课消收入中心',
        children: [
          {
            key: '/classes',
            label: user?.role === 'teacher' ? '我的班级' : '班级管理',
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

    // 现金流中心（销售相关）- admin/manager/teacher 可见
    if (permissions.canViewSalesData) {
      console.log('✅ 添加"现金流中心"菜单');
      items.push({
        key: '/cashflow',
        icon: <DollarOutlined />,
        label: user?.role === 'teacher' ? '我的销售管理' : '现金流中心',
        children: [
          ...(permissions.canViewReports ? [{
            key: '/cashflow/summary',
            label: '现金流收入总结',
          }] : []),
          {
            key: '/cashflow/marketing',
            label: user?.role === 'teacher' ? '我的鱼池' : '营销与销售（鱼池）',
          },
          {
            key: '/cashflow/experience-schedule',
            label: user?.role === 'teacher' ? '我的体验课' : '体验课表',
          },
          {
            key: '/cashflow/order-info',
            label: user?.role === 'teacher' ? '我的成单' : '成单信息表',
          },
          {
            key: '/students/renewal',
            label: user?.role === 'teacher' ? '我的续费学员' : '续费管理',
          },
        ],
      });
    }

    // 学员管理 - admin/manager/teacher 可见
    if (permissions.canViewAllStudents || user?.role === 'teacher') {
      console.log('✅ 添加"学员管理"菜单');
      items.push({
        key: '/students',
        icon: <UserOutlined />,
        label: user?.role === 'teacher' ? '我的学员' : '学员管理',
        children: [
          {
            key: '/students',
            label: user?.role === 'teacher' ? '我的学员列表' : '学员列表/档案',
          },
          ...(permissions.canViewAllStudents ? [{
            key: '/students/lost',
            label: '流失学员库',
          }] : []),
        ],
      });
    }

    // 工作人员管理 - admin/manager 可见，coach 只能看到教练员数据
    if (permissions.canViewReports || user?.role === 'coach') {
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
        key: '/teachers',
        icon: <UsergroupAddOutlined />,
        label: user?.role === 'coach' ? '教练数据' : '工作人员管理',
        children: menuItems,
      });
    }

    // 财务管理 - admin/manager 可见
    if (permissions.canViewReports) {
      items.push({
        key: '/finance',
        icon: <WalletOutlined />,
        label: '财务管理',
        children: [
          {
            key: '/finance/expenses',
            label: '支出与报表',
          },
          {
            key: '/finance/staff-salary',
            label: '人员工资',
          },
        ],
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
          {
            key: '/analytics/special',
            label: '季度总结',
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

    console.log('🔍 菜单构建完成，总共', items.length, '个顶级菜单');
    return items;
  };

  const menuItems = buildMenuItems();

  const userMenuItems: MenuProps['items'] = [
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
    </AntLayout>
  );
};

export default Layout;

