import { Modal } from './overlays';
import BrandMark from './BrandMark';
import { AccountAvatar, AccountAvatarEditor } from './AccountAvatar';
import { useAccountAvatar } from '../hooks/useAccountAvatar';
import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Dropdown, message, Form, Input, Drawer, Tooltip, Result, Button } from 'antd';
import {
  LogOut as LogoutOutlined,
  Wallet as DollarOutlined,
  LockKeyhole as LockOutlined,
  Menu as MenuOutlined,
  Bot as RobotOutlined,
  Star as StarOutlined,
  CalendarDays as CalendarOutlined,
  Sun as SunOutlined,
  Moon as MoonOutlined,
  Scaling,
  PanelLeftClose as DoubleLeftOutlined,
  PanelLeftOpen as DoubleRightOutlined,
  ImagePlus,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { canUseAi, isWorkUser } from '../utils/authNavigation';
import { BriefcaseBusiness, Building2 } from 'lucide-react';
import { INTERFACE_SIZES, useUiStore } from '../store/uiStore';
import { useInterfaceSize } from '../hooks/useInterfaceSize';
import { useCreditRefresh } from '../hooks/useCreditRefresh';
import { useFollowUpRefresh } from '../hooks/useFollowUpRefresh';
import api from '../services/api';
import { readCreditQuota } from '../services/creditRefresh';
import { formatCreditAmount } from '../utils/aiCredits';
import { getUserMenuPermissions, normalizeRole } from '../utils/dataFilter';
import { localAuth } from '../services/localAuth';
import { fetchOrgName } from '../services/orgInfo';
import { CATEGORIES, visibleFuncsOfCategory, getFuncNameByPath, getCategoryById, commonFunctions } from '../config/iaConfig';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';

/** 移动端阈值对齐原型断点（920px 起侧栏变抽屉） */
const MOBILE_BREAKPOINT = 920;

/** 自定义 hook 检测是否为移动端（920px 有效宽度起侧栏变抽屉；家长端页面卡片化复用同一断点） */
export const useIsMobile = () => {
  const size = useUiStore(state => state.interfaceSize);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth / (size / 100) < MOBILE_BREAKPOINT);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, [size]);

  return isMobile;
};

/** 顶栏积分胶囊：机构 AI 已开通时显示可用积分（未开通/停用自动隐藏）。
 *  余额以服务端为准：任务结算/入账后通过 ai-credits-updated 事件即时同步（P2-01）。 */
const QuotaChip: React.FC = () => {
  const [quota, setQuota] = useState<{ available: string } | null>(null);
  const token = useAuthStore(state => state.token), user = useAuthStore(state => state.user);
  const scope = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current, ownScope = scope;
    try {
      const data = await readCreditQuota();
      if (ownScope !== currentScope.current || request !== version.current) return;
      setQuota(data?.enabled && typeof data.available !== 'undefined' ? { available: String(data.available) } : null);
    } catch { if (ownScope === currentScope.current && request === version.current) setQuota(null); }
  }, [scope]);
  useEffect(() => { setQuota(null); void load(); return () => { ++version.current; }; }, [load]);
  useCreditRefresh(load, Boolean(token && user?.organizationId && user?.campusId));
  if (!quota || user?.isPlatformAdmin) return null;
  return (
    <div className="bz-quota-chip" title="机构 AI 积分可用余额（已扣除任务预留，显示保留一位小数）">
      <span className="dot" />
      AI 积分可用 <b>{formatCreditAmount(quota.available)}</b>
    </div>
  );
};

function OrganizationTitle({ name, mobile = false }: { name: string; mobile?: boolean }) {
  const length = Array.from(name).length;
  // Allow a little slack inside the desktop sidebar and the drawer heading.
  const available = mobile ? 118 : 120;
  const fontSize = length <= 6 ? 20 : Math.max(10, Math.floor(available / length));
  return (
    <span className="bz-brand-copy">
      <span className="bz-logo-name" style={{ fontSize }} title={name}>{name}</span>
      <span className="bz-logo-sub">蜂鸣课务</span>
    </span>
  );
}

const Layout = () => {
  useInterfaceSize();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();
  const token = useAuthStore(state => state.token);
  const avatar = useAccountAvatar();
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const avatarAfterDrawer = useRef(false);
  useEffect(() => { avatarAfterDrawer.current = false; setAvatarEditorOpen(false); }, [user?.id]);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordForm] = Form.useForm();
  const [passwordLoading, setPasswordLoading] = useState(false);
  const signingOut = useRef(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  const workScope = JSON.stringify([token, user?.id, user?.organizationId, user?.campusId, user?.role, user?.jobRole]);
  const workScopeRef = useRef(workScope); workScopeRef.current = workScope;
  const workRequest = useRef(0);
  const [workAvailability, setWorkAvailability] = useState<{ scope: string; hasTasks: boolean } | null>(null);
  const refreshWorkAvailability = useCallback(async () => {
    if (!isWorkUser(user)) return;
    const version = ++workRequest.current;
    try {
      const response = await api.get<unknown, { success: boolean; data: { tasks: unknown[] } }>('/staff-work');
      if (!response.success || !Array.isArray(response.data?.tasks)) throw new Error('工作数据格式无效');
      if (version === workRequest.current && workScopeRef.current === workScope) {
        setWorkAvailability({ scope: workScope, hasTasks: response.data.tasks.length > 0 });
      }
    } catch { /* 未能确认时保留入口，不能将加载失败当作没有事项。 */ }
  }, [workScope]);
  useEffect(() => {
    setWorkAvailability(null);
    void refreshWorkAvailability();
    return () => { ++workRequest.current; };
  }, [refreshWorkAvailability]);
  useFollowUpRefresh(refreshWorkAvailability);
  const noWorkTasks = workAvailability?.scope === workScope && !workAvailability.hasTasks;
  useEffect(() => {
    if (noWorkTasks && location.pathname === '/my-work') navigate(canUseAi(user) ? '/ai' : '/favorites', { replace: true });
  }, [noWorkTasks, location.pathname, navigate, user]);

  const siderCollapsed = useUiStore((s) => s.siderCollapsed);
  const toggleSiderCollapsed = useUiStore((s) => s.toggleSiderCollapsed);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const interfaceSize = useUiStore(s => s.interfaceSize);
  const setInterfaceSize = useUiStore(s => s.setInterfaceSize);
  const changeTheme = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      toggleTheme();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => {
      flushSync(() => toggleTheme());
      document.documentElement.setAttribute('data-theme', useUiStore.getState().theme);
    });
    transition.ready.then(() => {
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => { /* Browser may skip a transition during navigation. Theme is already applied. */ });
  };
  const favorites = useUiStore((s) => s.favorites);

  const permissions = useMemo(() => getUserMenuPermissions(), [user?.id, user?.role, user?.isPlatformAdmin, user?.jobRole, user?.managementLevel]);

  // 侧栏「常用功能」徽标 = 该角色实际可见的收藏数（与常用功能页同一套可见性过滤）。
  // 原来直接用 favorites.length，收藏里含角色不可见项时会显示 9 却进页空列表。
  const visibleFavoritesCount = useMemo(() => {
    if (!user) return 0;
    return commonFunctions(favorites, permissions, normalizedRole, user.jobRole ?? user.role).length;
  }, [favorites, permissions, normalizedRole, user]);

  useEffect(() => {
    let cancelled = false;
    fetchOrgName(user?.organizationId).then((name) => {
      if (!cancelled) setOrgName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.organizationId]);

  /* ---------------- 导航（一级 + 计数徽标，原型样式） ---------------- */

  const categoryNav = CATEGORIES.filter(
    (c) => (!isWorkUser(user) || c.id !== 'teachers') && (normalizedRole !== 'sales' || !['classes', 'attendance'].includes(c.id)) && visibleFuncsOfCategory(c.id, permissions, normalizedRole).length > 0
  ).map((c) => ({
    id: c.id,
    label: normalizedRole === 'coach' && c.coachName ? c.coachName : c.name,
    icon: c.icon,
    count: visibleFuncsOfCategory(c.id, permissions, normalizedRole).length,
  }));

  const isActive = (path: string) => {
    if (path === '/ai') return location.pathname === '/ai' || location.pathname === '/';
    return location.pathname === path;
  };

  const go = (path: string) => {
    navigate(path);
    if (isMobile) setDrawerVisible(false);
  };

  const renderNavItem = (
    key: string,
    path: string,
    icon: ReactNode,
    label: string,
    count?: number,
    active?: boolean
  ) => (
    <div
      key={key}
      role="button"
      tabIndex={0}
      className={`bz-nav-item${active ? ' is-active' : ''}`}
      onClick={() => go(path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go(path);
        }
      }}
      title={siderCollapsed && !isMobile ? label : undefined}
    >
      <span className="bz-nav-icon">{icon}</span>
      {(!siderCollapsed || isMobile) && (
        <>
          <span className="bz-nav-label">{label}</span>
          {typeof count === 'number' && count > 0 && <span className="bz-nav-count">{count}</span>}
        </>
      )}
    </div>
  );

  /* ---------------- 顶栏标题（面包屑式） ---------------- */

  const currentTitle = (() => {
    const path = location.pathname;
    if (path === '/' || path === '/ai') return 'AI 助理';
    if (path === '/my-work') return '我的工作';
    if (path === '/favorites') return '常用功能';
    if (path.startsWith('/cat/')) {
      const cat = getCategoryById(path.replace('/cat/', ''));
      if (cat) return normalizedRole === 'coach' && cat.coachName ? cat.coachName : cat.name;
    }
    return getFuncNameByPath(path) || '蜂鸣课务';
  })();

  /* ---------------- 修改密码 / 用户菜单（挂在侧栏底部用户条上） ---------------- */

  const handlePasswordChange = async () => {
    try {
      const values = await passwordForm.validateFields();
      setPasswordLoading(true);
      const result = await localAuth.changePassword(values.oldPassword, values.newPassword);
      if (result.success) {
        message.success('密码修改成功，请重新登录');
        setPasswordModalVisible(false);
        passwordForm.resetFields();
        clearAuth();
        navigate('/login', { replace: true });
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

  const roleLabels: Record<string, string> = {
    admin: '超级机构管理员',
    manager: '机构管理员',
    coach: '老师',
    teacher: '老师',
    sales: '销售',
    staff: '员工',
    parent: '家长',
  };

  const userMenuItems: MenuProps['items'] = [
    { key: 'avatar', icon: <ImagePlus />, label: '修改头像', onClick: () => {
      if (isMobile && drawerVisible) { avatarAfterDrawer.current = true; setDrawerVisible(false); }
      else setAvatarEditorOpen(true);
    } },
    {
      key: 'changePassword',
      icon: <LockOutlined />,
      label: '修改密码',
      onClick: () => setPasswordModalVisible(true),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: async () => {
        const currentToken = useAuthStore.getState().token;
        if (!currentToken || signingOut.current) return;
        signingOut.current = true;
        try {
          await api.post('/auth/logout');
          if (useAuthStore.getState().token !== currentToken) return;
          clearAuth();
          message.success('已退出登录');
          navigate('/login', { replace: true });
        } catch (error: any) {
          if (useAuthStore.getState().token === currentToken) {
            message.error(error.response?.data?.error?.message || '未能退出，请重试');
          }
        } finally {
          signingOut.current = false;
        }
      },
    },
  ];

  const sideUserBlock = (
    <Dropdown menu={{ items: userMenuItems }} placement="topRight" trigger={['click']}>
      <div className="bz-side-user" role="button" tabIndex={0} aria-label="用户菜单">
        <AccountAvatar user={user} imageData={avatar.imageData} />
        {(!siderCollapsed || isMobile) && (
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="u" style={{ display: 'block' }}>{user?.name || user?.email}</span>
            <span className="o" style={{ display: 'block' }}>
              {user?.isPlatformAdmin ? '系统管理员' : user?.managementLevel === 'super' ? '超级机构管理员' : normalizedRole ? roleLabels[normalizedRole] || normalizedRole : ''}
            </span>
          </span>
        )}
      </div>
    </Dropdown>
  );

  const navList = (
    <nav className="bz-nav" aria-label="主导航">
      {normalizedRole === 'parent' ? (
        <>
          {renderNavItem('schedules', '/student/schedules', <CalendarOutlined />, '我的课表', undefined, location.pathname === '/student/schedules')}
          {renderNavItem('attendances', '/student/attendances', <CalendarOutlined />, '出勤记录', undefined, location.pathname === '/student/attendances')}
          {renderNavItem('payments', '/student/payments', <DollarOutlined />, '报名缴费', undefined, location.pathname === '/student/payments')}
        </>
      ) : (
        <>
          {user?.isPlatformAdmin && renderNavItem('platform', '/organizations', <Building2 />, '机构与开通审批', undefined, isActive('/organizations'))}
          {canUseAi(user) && renderNavItem('home', '/ai', <RobotOutlined />, 'AI 助理', undefined, isActive('/ai'))}
          {isWorkUser(user) && !noWorkTasks && renderNavItem('work', '/my-work', <BriefcaseBusiness />, '我的工作', undefined, isActive('/my-work'))}
          {renderNavItem('fav', '/favorites', <StarOutlined />, '常用功能', visibleFavoritesCount, location.pathname === '/favorites')}
          {(!siderCollapsed || isMobile) && (
            <>
              <div className="bz-nav-divider" />
              <div className="bz-nav-section-title">功能分类</div>
            </>
          )}
          {categoryNav.map((c) =>
            renderNavItem(c.id, `/cat/${c.id}`, c.icon, c.label, c.count, location.pathname === `/cat/${c.id}`)
          )}
        </>
      )}
    </nav>
  );

  const siderWidth = siderCollapsed ? 64 : 236;

  /* ---------------- 家长路由守卫（P0-02） ----------------
   * 家长角色仅可访问 /student/* 专属页面；直达 /ai 及其他业务页时拒绝展示
   * （后端已同步收口：parent 角色的通用业务接口一律 403，此处是前端第一道拦截） */
  if (normalizedRole === 'parent' && !location.pathname.startsWith('/student/')) {
    return (
      <div style={{ alignItems: 'center', justifyContent: 'center', display: 'flex', minHeight: 'calc(var(--ui-vh, 1vh) * 100)' }}>
        <Result
          status="403"
          title="权限受限"
          subTitle="家长账号仅可访问我的课表、出勤记录与缴费信息。"
          extra={
            <Button type="primary" onClick={() => navigate('/student/schedules')}>
              回到我的课表
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="bz-shell" style={{ display: 'flex' }}>
      {/* 桌面端侧栏：机构名为主标题，产品名为辅助标识 */}
      {!isMobile && (
        <aside
          className={`bz-sider${siderCollapsed ? ' is-collapsed' : ''}`}
          style={{ width: siderWidth, transition: 'width 200ms ease' }}
          aria-label="侧边导航"
        >
          <div className="bz-side-head">
            <BrandMark alt={siderCollapsed ? '蜂鸣课务' : ''} className="bz-logo-img" />
            {!siderCollapsed && <OrganizationTitle name={orgName || '我的机构'} />}
            <button
              type="button"
              className="bz-collapse-btn"
              onClick={toggleSiderCollapsed}
              aria-label={siderCollapsed ? '展开侧栏' : '收起侧栏'}
              title="收起 / 展开侧栏"
            >
              {siderCollapsed ? <DoubleRightOutlined /> : <DoubleLeftOutlined />}
            </button>
          </div>
          {navList}
          {sideUserBlock}
        </aside>
      )}

      {/* 移动端抽屉导航 */}
      {isMobile && (
        <Drawer
          rootClassName="bz-navigation-drawer"
          title={
            <span className="bz-mobile-brand">
              <BrandMark alt="" />
              <OrganizationTitle name={orgName || '我的机构'} mobile />
            </span>
          }
          placement="left"
          onClose={() => setDrawerVisible(false)}
          afterOpenChange={open => { if (!open && avatarAfterDrawer.current) { avatarAfterDrawer.current = false; setAvatarEditorOpen(true); } }}
          open={drawerVisible}
          width={250}
          styles={{ body: { padding: 0, background: 'var(--bg2)', display: 'flex', flexDirection: 'column' } }}
        >
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {navList}
          </div>
          {sideUserBlock}
        </Drawer>
      )}

      {/* 主列：顶栏 + 内容 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="bz-topbar">
          {isMobile && (
            <button
              type="button"
              className="bz-icon-btn"
              onClick={() => setDrawerVisible(true)}
              aria-label="打开导航"
            >
              <MenuOutlined />
            </button>
          )}
          <div className="bz-crumb">
            <b>{currentTitle}</b>
          </div>
          <div style={{ flex: 1 }} />
          {canUseAi(user) && <QuotaChip />}
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="bz-size-menu"
            menu={{
              selectable: true,
              selectedKeys: [String(interfaceSize)],
              items: INTERFACE_SIZES.map(option => ({ key: String(option.value), label: option.label })),
              onClick: ({ key }) => setInterfaceSize(Number(key) as 100 | 125 | 150),
            }}
          >
            <button type="button" className="bz-size-button" aria-label={`界面大小：${interfaceSize}%`} title="界面大小">
              <Scaling size={16} aria-hidden="true" /><span>{interfaceSize}%</span>
            </button>
          </Dropdown>
          <Tooltip title={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}>
            <button
              type="button"
              className="bz-icon-btn"
              aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
              aria-pressed={theme === 'dark'}
              onClick={changeTheme}
            >
              {theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            </button>
          </Tooltip>
        </header>

        {/* 首页（工作台）自带内边距；其余页面沿用内容区容器 */}
        {location.pathname === '/ai' || location.pathname === '/' ? (
          <Outlet />
        ) : (
          <div className="bz-main">
            <div className="bz-content">
              <Outlet />
            </div>
          </div>
        )}
      </div>

      {/* 修改密码弹窗（保留既有实现） */}
      <AccountAvatarEditor user={user} avatar={avatar} open={avatarEditorOpen} onClose={() => setAvatarEditorOpen(false)} />
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
              // 原密码不做强度校验：历史密码可能短于当前 8 位规则，强校验会挡住合法的旧密码
            ]}
          >
            <Input.Password placeholder="请输入原密码" />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码至少8位' },
            ]}
            hasFeedback
          >
            <Input.Password placeholder="请输入新密码（至少8位）" />
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
    </div>
  );
};

export default Layout;
