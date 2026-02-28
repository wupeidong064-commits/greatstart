import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import Register from './pages/Register';
import Layout from './components/Layout';
import Students from './pages/Students';
import RenewalStudents from './pages/RenewalStudents';
import LostStudents from './pages/LostStudents';
import Classes from './pages/Classes';
import Schedules from './pages/Schedules';
import WeeklySchedule from './pages/WeeklySchedule';
// Attendances 页面已被 ClassAttendance 替代
import ClassAttendance from './pages/ClassAttendance';
import ContinuousLeaveStudents from './pages/ContinuousLeaveStudents';
import HoneymoonAttendance from './pages/HoneymoonAttendance';
import LowAttendanceClasses from './pages/LowAttendanceClasses';
import ConsumptionAndRevenue from './pages/ConsumptionAndRevenue';
import CashflowSummary from './pages/CashflowSummary';
import MarketingPool from './pages/MarketingPool';
import ExperienceSchedule from './pages/ExperienceSchedule';
import OrderInfo from './pages/OrderInfo';
import Teachers from './pages/Teachers';
import TeacherDashboard from './pages/TeacherDashboard';
import StaffList from './pages/StaffList';
import ResourceTransfer from './pages/ResourceTransfer';
import WeeklySummary from './pages/WeeklySummary';
import MonthlySummary from './pages/MonthlySummary';
import Organizations from './pages/Organizations';
import Settings from './pages/Settings';
// 学员中心页面
import MySchedules from './pages/student/MySchedules';
import MyAttendances from './pages/student/MyAttendances';
import MyPayments from './pages/student/MyPayments';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, _hasHydrated } = useAuthStore();

  // 等待 Zustand 状态从 localStorage 恢复完成
  if (!_hasHydrated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          {/* 登录后默认进入课消收入总结页 */}
          <Route index element={<Navigate to="/operation/consumption" replace />} />
          
          {/* 运营核心 */}
          <Route path="classes" element={<Classes />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="operation/weekly-schedule" element={<WeeklySchedule />} />
          <Route path="attendances" element={<ClassAttendance />} />
          <Route path="attendances/continuous-leave" element={<ContinuousLeaveStudents />} />
          <Route path="attendances/honeymoon" element={<HoneymoonAttendance />} />
          <Route path="attendances/low-attendance-classes" element={<LowAttendanceClasses />} />
          <Route path="operation/consumption" element={<ConsumptionAndRevenue />} />
          
          {/* 现金流中心 */}
          <Route path="cashflow/summary" element={<CashflowSummary />} />
          <Route path="cashflow/marketing" element={<MarketingPool />} />
          <Route path="cashflow/experience-schedule" element={<ExperienceSchedule />} />
          <Route path="cashflow/order-info" element={<OrderInfo />} />
          <Route path="students/renewal" element={<RenewalStudents />} />
          
          {/* 学员管理 */}
          <Route path="students" element={<Students />} />
          <Route path="students/lost" element={<LostStudents />} />
          
          {/* 工作人员管理 */}
          <Route path="teachers" element={<Teachers />} />
          <Route path="teachers/dashboard" element={<TeacherDashboard />} />
          
          {/* 数据统计与分析 */}
          <Route path="summary/weekly" element={<WeeklySummary />} />
          <Route path="summary/monthly" element={<MonthlySummary />} />
          
          {/* 系统管理 */}
          <Route path="system/staff-list" element={<StaffList />} />
          <Route path="system/resource-transfer" element={<ResourceTransfer />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="system/settings" element={<Settings />} />

          {/* 学员中心 - parent 角色专属 */}
          <Route path="student/schedules" element={<MySchedules />} />
          <Route path="student/attendances" element={<MyAttendances />} />
          <Route path="student/payments" element={<MyPayments />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

