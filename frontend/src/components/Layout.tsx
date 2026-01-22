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

  const menuItems = [
    {
      key: '/operation',
      icon: <AppstoreOutlined />,
      label: '课消收入中心',
      children: [
        {
          key: '/classes',
          label: '班级管理',
        },
        {
          key: '/operation/weekly-schedule',
          label: '每周排课',
        },
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
        {
          key: '/operation/consumption',
          label: '课消收入总结',
        },
      ],
    },
    {
      key: '/cashflow',
      icon: <DollarOutlined />,
      label: '现金流中心',
      children: [
        {
          key: '/cashflow/summary',
          label: '现金流收入总结',
        },
        {
          key: '/cashflow/marketing',
          label: '营销与销售（鱼池）',
        },
        {
          key: '/cashflow/experience-schedule',
          label: '体验课表',
        },
        {
          key: '/cashflow/order-info',
          label: '成单信息表',
        },
        {
          key: '/students/renewal',
          label: '续费管理',
        },
      ],
    },
    {
      key: '/students',
      icon: <UserOutlined />,
      label: '学员管理',
      children: [
        {
          key: '/students',
          label: '学员列表/档案',
        },
        {
          key: '/students/lost',
          label: '流失学员库',
        },
      ],
    },
    {
      key: '/teachers',
      icon: <UsergroupAddOutlined />,
      label: '工作人员管理',
      children: [
        {
          key: '/teachers',
          label: '教练员数据',
        },
        {
          key: '/teachers/dashboard',
          label: '销售数据',
        },
      ],
    },
    {
      key: '/finance',
      icon: <WalletOutlined />,
      label: '财务管理',
      children: [
        {
          key: '/finance/payments',
          label: '收款记录',
        },
        {
          key: '/finance/expenses',
          label: '支出与报表',
        },
        {
          key: '/finance/staff-salary',
          label: '人员工资',
        },
      ],
    },
    {
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
    },
  ];

  // 管理员和超级管理员可见的菜单
  if (user?.role === 'admin' || user?.role === 'super_admin') {
    menuItems.push({
      key: '/system',
      icon: <SettingOutlined />,
      label: '系统管理',
      children: [
        {
          key: '/system/staff-list',
          label: '工作人员列表',
        },
        {
          key: '/organizations',
          label: '机构管理',
        },
        {
          key: '/system/settings',
          label: '基础设置',
        },
      ],
    });
  }

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

