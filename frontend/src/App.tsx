import React, { useEffect, useState } from 'react';
import { authService } from './services/authService';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin, Result, Button } from 'antd';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import MyWork from './pages/MyWork';
import { canUseAi, homeForUser, isWorkUser, managesCampus } from './utils/authNavigation';
import Layout from './components/Layout';
import Students from './pages/Students';
import RenewalStudents from './pages/RenewalStudents';
import LostStudents from './pages/LostStudents';
import ArchivedStudents from './pages/ArchivedStudents';
import RefundRecords from './pages/RefundRecords';
import AiWorkspace from './pages/AiWorkspace';
import FavoritesPage from './pages/FavoritesPage';
import CategoryWall from './components/CategoryWall';
import Classes from './pages/Classes';
import Schedules from './pages/Schedules';
import WeeklySchedule from './pages/WeeklySchedule';
// Attendances 页面已被 ClassAttendance 替代
import ClassAttendance from './pages/ClassAttendance';
import ContinuousLeaveStudents from './pages/ContinuousLeaveStudents';
import HoneymoonAttendance from './pages/HoneymoonAttendance';
import ConsumptionAndRevenue from './pages/ConsumptionAndRevenue';
import CashflowSummary from './pages/CashflowSummary';
import MarketingPool from './pages/MarketingPool';
import ExperienceSchedule from './pages/ExperienceSchedule';
import OrderInfo from './pages/OrderInfo';
import Teachers from './pages/Teachers';
import TeacherDashboard from './pages/TeacherDashboard';
import StaffList from './pages/StaffList';
import ResourceTransfer from './pages/ResourceTransfer';
import Organizations from './pages/Organizations';
import Settings from './pages/Settings';
import AiCredits from './pages/AiCredits';
import AdminAiCampuses from './pages/AdminAiCampuses';
// 学员中心页面
import MySchedules from './pages/student/MySchedules';
import MyAttendances from './pages/student/MyAttendances';
import MyPayments from './pages/student/MyPayments';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hasHydrated, token } = useAuthStore();
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState(false);
  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated || !token) return;
    let active = true;
    setVerificationError(false);
    let verified = false;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const response = await authService.getMe();
        if (!active || useAuthStore.getState().token !== token) return;
        const profile = response.data;
        if (!profile?.id) throw new Error('无法验证当前账号');
        useAuthStore.getState().refreshUser(token, { ...profile, email: profile.email || '' });
        verified = true;
        setVerifiedToken(token);
        setVerificationError(false);
      } catch { if (active && !verified) setVerificationError(true); }
      finally { pending = false; }
    };
    void refresh();
    const storage = (event: StorageEvent) => { if (event.key === 'buzzer-permission-notice') void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('permissions-changed', refresh);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      active = false; window.clearInterval(interval);
      window.removeEventListener('focus', refresh); window.removeEventListener('permissions-changed', refresh);
      window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', visible);
    };
  }, [_hasHydrated, isAuthenticated, token]);
  if (verificationError) return <Result status="warning" title="无法验证登录状态" subTitle="请检查网络后重试。" extra={<Button onClick={() => window.location.reload()}>重新加载</Button>} />;

  // 等待 Zustand 状态从 localStorage 恢复完成
  if (!_hasHydrated || (isAuthenticated && token !== verifiedToken)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(var(--ui-vh, 1vh) * 100)' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function CapabilityRoute({ children, kind }: { children: React.ReactNode; kind: 'ai' | 'work' | 'tenant' | 'platform' | 'reports' | 'management' | 'renewal' | 'classes' | 'students' | 'parent' }) {
  const user = useAuthStore(state => state.user);
  const tenantUser = !user?.isPlatformAdmin && ['admin', 'manager', 'teacher', 'coach', 'sales', 'staff'].includes(user?.role || '');
  const allowed = kind === 'tenant' ? tenantUser : kind === 'renewal' ? managesCampus(user) || (!user?.isPlatformAdmin && ['teacher', 'coach'].includes(user?.role || '')) : (kind === 'reports' || kind === 'management') ? managesCampus(user) : kind === 'ai' ? canUseAi(user) : kind === 'work' ? isWorkUser(user) : kind === 'classes' ? (managesCampus(user) || (!user?.isPlatformAdmin && ['teacher', 'coach'].includes(user?.role || ''))) : kind === 'students' ? (managesCampus(user) || (!user?.isPlatformAdmin && ['teacher', 'coach'].includes(user?.role || ''))) : kind === 'parent' ? (!user?.isPlatformAdmin && user?.role === 'parent') : Boolean(user?.isPlatformAdmin);
  return allowed ? <>{children}</> : <Navigate to={homeForUser(user)} replace />;
}

/** Z1（2026-11-14）：未知地址兜底页——原 38 条路由无 catch-all，旧链接或手误渲染空白内容区。 */
function NotFoundPage() {
  const user = useAuthStore((state) => state.user);
  return (
    <Result
      status="404"
      title="页面不存在或已下线"
      subTitle="您访问的地址没有对应功能。可返回自己的工作首页，或使用左侧菜单导航。"
      extra={
        <Button type="primary" onClick={() => { window.location.assign(homeForUser(user)); }}>
          返回我的首页
        </Button>
      }
    />
  );
}

function HomeRedirect() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={homeForUser(user)} replace />;
}

/**
 * 全局错误边界：任何页面级渲染错误（如接口返回畸形数据）在此兜底，
 * 展示可恢复的错误页而不是整树卸载成空白/黑屏。
 */
class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[UI] 页面渲染错误:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面出了点问题"
          subTitle={this.state.error.message || '渲染时发生未知错误，请刷新重试'}
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              刷新页面
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<Register />} />
        <Route path="/register" element={<Navigate to="/apply" replace />} />
        <Route path="/" element={<PrivateRoute><HomeRedirect /></PrivateRoute>} />
        <Route
          element={
            <PrivateRoute>
              <GlobalErrorBoundary>
                <Layout />
              </GlobalErrorBoundary>
            </PrivateRoute>
          }
        >
          {/* AI 工作台 / 功能墙 / 常用功能 */}
          <Route path="ai" element={<CapabilityRoute kind="ai"><AiWorkspace /></CapabilityRoute>} />
          <Route path="my-work" element={<CapabilityRoute kind="work"><MyWork /></CapabilityRoute>} />
          <Route path="cat/:catId" element={<CategoryWall />} />
          <Route path="favorites" element={<FavoritesPage />} />
          
          {/* 运营核心 */}
          <Route path="classes" element={<CapabilityRoute kind="tenant"><Classes /></CapabilityRoute>} />
          <Route path="schedules" element={<CapabilityRoute kind="classes"><Schedules /></CapabilityRoute>} />
          <Route path="operation/weekly-schedule" element={<CapabilityRoute kind="classes"><WeeklySchedule /></CapabilityRoute>} />
          <Route path="attendances" element={<CapabilityRoute kind="reports"><ClassAttendance /></CapabilityRoute>} />
          <Route path="attendances/continuous-leave" element={<CapabilityRoute kind="reports"><ContinuousLeaveStudents /></CapabilityRoute>} />
          <Route path="attendances/honeymoon" element={<CapabilityRoute kind="reports"><HoneymoonAttendance /></CapabilityRoute>} />
          <Route path="attendances/low-attendance-classes" element={<CapabilityRoute kind="reports"><Navigate to="/attendances" replace /></CapabilityRoute>} />
          <Route path="operation/consumption" element={<CapabilityRoute kind="reports"><ConsumptionAndRevenue /></CapabilityRoute>} />
          
          {/* 现金流中心 */}
          <Route path="cashflow/summary" element={<CapabilityRoute kind="reports"><CashflowSummary /></CapabilityRoute>} />
          <Route path="cashflow/marketing" element={<CapabilityRoute kind="tenant"><MarketingPool /></CapabilityRoute>} />
          <Route path="cashflow/experience-schedule" element={<CapabilityRoute kind="tenant"><ExperienceSchedule /></CapabilityRoute>} />
          <Route path="cashflow/order-info" element={<CapabilityRoute kind="tenant"><OrderInfo /></CapabilityRoute>} />
          <Route path="students/renewal" element={<CapabilityRoute kind="renewal"><RenewalStudents /></CapabilityRoute>} />
          
          {/* 学员管理（教练与管理可看；销售按 11-13 口径无学员管理入口） */}
          <Route path="students" element={<CapabilityRoute kind="students"><Students /></CapabilityRoute>} />
          <Route path="students/lost" element={<CapabilityRoute kind="students"><LostStudents /></CapabilityRoute>} />
          {/* 2026-11-08：退费记录独立页（用户拍板从现金流卡片迁至学员管理子菜单） */}
          <Route path="students/refunds" element={<CapabilityRoute kind="renewal"><RefundRecords /></CapabilityRoute>} />
          <Route path="students/archived" element={<CapabilityRoute kind="reports"><ArchivedStudents /></CapabilityRoute>} />
          <Route path="students/low-attendance" element={<CapabilityRoute kind="reports"><Navigate to="/attendances/continuous-leave" replace /></CapabilityRoute>} />
          
          {/* 工作人员管理（老师数据/销售数据：教练与管理可看，销售菜单无此项） */}
          <Route path="teachers" element={<CapabilityRoute kind="classes"><Teachers /></CapabilityRoute>} />
          <Route path="teachers/dashboard" element={<CapabilityRoute kind="classes"><TeacherDashboard /></CapabilityRoute>} />

          {/* 系统管理 */}
          <Route path="system/staff-list" element={<CapabilityRoute kind="management"><StaffList /></CapabilityRoute>} />
          <Route path="system/resource-transfer" element={<CapabilityRoute kind="management"><ResourceTransfer /></CapabilityRoute>} />
          <Route path="organizations" element={<CapabilityRoute kind="platform"><Organizations /></CapabilityRoute>} />
          <Route path="system/settings" element={<CapabilityRoute kind="management"><Settings /></CapabilityRoute>} />

          {/* 校区 AI 积分服务（第一轮：钱包/入账/授权；manager+ 与 admin 专属） */}
          <Route path="ai-credits" element={<CapabilityRoute kind="management"><AiCredits /></CapabilityRoute>} />
          <Route path="admin/ai-organizations" element={<CapabilityRoute kind="platform"><AdminAiCampuses /></CapabilityRoute>} />
          <Route path="admin/ai-campuses" element={<Navigate to="/admin/ai-organizations" replace />} />

          {/* 学员中心 - parent 角色专属（员工直达弹回各自首页） */}
          <Route path="student/schedules" element={<CapabilityRoute kind="parent"><MySchedules /></CapabilityRoute>} />
          <Route path="student/attendances" element={<CapabilityRoute kind="parent"><MyAttendances /></CapabilityRoute>} />
          <Route path="student/payments" element={<CapabilityRoute kind="parent"><MyPayments /></CapabilityRoute>} />

          {/* Z1（2026-11-14）：未知地址兜底——旧链接/手误不再渲染空白内容区 */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

