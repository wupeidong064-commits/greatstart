import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import ExpensesAndReports from './pages/ExpensesAndReports';
import StaffSalary from './pages/StaffSalary';
import Statistics from './pages/Statistics';
import WeeklySummary from './pages/WeeklySummary';
import MonthlySummary from './pages/MonthlySummary';
import SpecialAnalysis from './pages/SpecialAnalysis';
import Organizations from './pages/Organizations';
import Users from './pages/Users';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
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
          
          {/* 财务管理 */}
          <Route path="finance/expenses" element={<ExpensesAndReports />} />
          <Route path="finance/staff-salary" element={<StaffSalary />} />
          
          {/* 数据统计与分析 */}
          <Route path="summary/weekly" element={<WeeklySummary />} />
          <Route path="summary/monthly" element={<MonthlySummary />} />
          <Route path="analytics/special" element={<SpecialAnalysis />} />
          
          {/* 系统管理 */}
          <Route path="system/staff-list" element={<StaffList />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="system/settings" element={<Settings />} />
          <Route path="change-password" element={<ChangePassword />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

