import type { ReactNode } from 'react';
import {
  GraduationCap as BookOutlined,
  CalendarDays as CalendarOutlined,
  Wallet as DollarOutlined,
  UsersRound as UserOutlined,
  Trophy as TeamOutlined,
  SlidersHorizontal as SettingOutlined,
  ClipboardCheck as CheckSquareOutlined,
  Clock3 as FieldTimeOutlined,
  TrendingUp as RiseOutlined,
  WalletCards as WalletOutlined,
  ChartColumnIncreasing as FundOutlined,
  CalendarRange as TableOutlined,
  ListOrdered as OrderedListOutlined,
  BookUser as ProfileOutlined,
  ArrowRightLeft as ExportOutlined,
  Building2 as BankOutlined,
  Wrench as ToolOutlined,
  Gauge as DashboardOutlined,
  Sparkles as HeatMapOutlined,
  Undo2 as RollbackOutlined,
} from 'lucide-react';
import type { UserRole } from '../utils/dataFilter';

/**
 * 信息架构 v2 注册表：一级分类（无二级子菜单）+ 功能卡。
 * - 每个功能卡指向既有生产路由，只换壳不换页。
 * - visible() 沿用旧导航完全相同的权限语义（见 components/Layout.tsx 历史），
 *   权限标志来自 utils/dataFilter.getUserMenuPermissions()。
 */

export interface MenuPermissionFlags {
  canViewAllClasses: boolean;
  canViewSalesData: boolean;
  canViewAllStudents: boolean;
  canViewReports: boolean;
  canViewUsers: boolean;
  canViewOrganizations: boolean;
  canViewSettings: boolean;
}

export interface FuncDef {
  id: string;
  catId: string;
  name: string;
  coachName?: string; // coach（老师）角色看到的替代名
  desc: string;
  path: string;
  icon: ReactNode;
  visible: (p: MenuPermissionFlags, role: UserRole | null) => boolean;
}

export interface CategoryDef {
  id: string;
  name: string;
  coachName?: string;
  desc: string;
  icon: ReactNode;
}

const adminOrManager = (p: MenuPermissionFlags) => p.canViewReports || p.canViewAllClasses;export const CATEGORIES: CategoryDef[] = [
  { id: 'classes', name: '课务中心', desc: '班级、排课与课消收入', icon: <BookOutlined /> },
  { id: 'attendance', name: '考勤中心', desc: '出勤记录、连续请假与低出勤', icon: <CalendarOutlined /> },
  { id: 'cashflow', name: '现金流', desc: '收入汇总、鱼池、成单与续费', icon: <DollarOutlined /> },
  { id: 'students', name: '学员管理', desc: '学员档案与流失库', icon: <UserOutlined /> },
  { id: 'teachers', name: '老师与销售', desc: '老师数据与销售分析', icon: <TeamOutlined /> },
  { id: 'system', name: '系统管理', desc: '人员、机构与数据接口', icon: <SettingOutlined /> },
];

export const FUNCS: FuncDef[] = [
  // ---------- 课务中心 ----------
  {
    id: 'classes',
    catId: 'classes',
    name: '班级管理',
    coachName: '我的班级',
    desc: '班级档案、花名册与课时设置',
    path: '/classes',
    icon: <ProfileOutlined />,
    visible: (p) => p.canViewAllClasses,
  },
  {
    id: 'weeklySchedule',
    catId: 'classes',
    name: '每周排课',
    desc: '按周视图安排课表与冲突检查',
    path: '/operation/weekly-schedule',
    icon: <CalendarOutlined />,
    visible: (p) => p.canViewAllClasses,
  },
  {
    id: 'consumption',
    catId: 'classes',
    name: '课消收入总结',
    desc: '基本盘人数、课消、出勤率与整体收入',
    path: '/operation/consumption',
    icon: <RiseOutlined />,
    visible: (p) => p.canViewReports,
  },

  // ---------- 考勤中心 ----------
  {
    id: 'attendance',
    catId: 'attendance',
    name: '班级出勤',
    desc: '按班级点名与出勤统计',
    path: '/attendances',
    icon: <CheckSquareOutlined />,
    visible: (p) => p.canViewReports,
  },
  {
    id: 'conleave',
    catId: 'attendance',
    name: '连续请假学员',
    desc: '按时间与老师筛查低出勤、连续请假或缺勤学员',
    path: '/attendances/continuous-leave',
    icon: <FieldTimeOutlined />,
    visible: (p) => p.canViewReports,
  },
  {
    id: 'honeymoon',
    catId: 'attendance',
    name: '蜜月期客户出勤',
    desc: '新报名蜜月期客户的出勤保护监测',
    path: '/attendances/honeymoon',
    icon: <HeatMapOutlined />,
    visible: (p) => p.canViewReports,
  },
  // ---------- 现金流 ----------
  {
    id: 'cashsummary',
    catId: 'cashflow',
    name: '现金流收入总结',
    desc: '收入结构、成单率与退费概览',
    path: '/cashflow/summary',
    icon: <WalletOutlined />,
    visible: (p) => p.canViewSalesData && p.canViewReports,
  },
  {
    id: 'pool',
    catId: 'cashflow',
    name: '营销与销售（鱼池）',
    coachName: '我的鱼池',
    desc: '线索鱼池、跟进状态与转化漏斗',
    path: '/cashflow/marketing',
    icon: <FundOutlined />,
    visible: (p) => p.canViewSalesData,
  },
  {
    id: 'experience',
    catId: 'cashflow',
    name: '体验课表',
    coachName: '我的体验课',
    desc: '体验课排期、到场与转化跟进',
    path: '/cashflow/experience-schedule',
    icon: <FieldTimeOutlined />,
    visible: (p) => p.canViewSalesData,
  },
  {
    id: 'orderinfo',
    catId: 'cashflow',
    name: '成单信息表',
    coachName: '我的成单',
    desc: '全部成单记录、金额与归属',
    path: '/cashflow/order-info',
    icon: <TableOutlined />,
    visible: (p) => p.canViewSalesData,
  },
  {
    id: 'renewal',
    catId: 'cashflow',
    name: '续费管理',
    coachName: '我的续费学员',
    desc: '负责班级的待续费名单与不续费回访安排',
    path: '/students/renewal',
    icon: <OrderedListOutlined />,
    visible: (p, role) => adminOrManager(p) || role === 'coach' || role === 'teacher',
  },

  // ---------- 学员管理 ----------
  {
    id: 'students',
    catId: 'students',
    name: '学员列表/档案',
    coachName: '我的学员列表',
    desc: '学员档案、课时与班级调整',
    path: '/students',
    icon: <UserOutlined />,
    visible: (p, role) => p.canViewAllStudents || role === 'coach',
  },
  {
    id: 'lost',
    catId: 'students',
    name: '流失学员库',
    desc: '已标记流失学员与召回线索',
    path: '/students/lost',
    icon: <ExportOutlined />,
    visible: (p) => p.canViewAllStudents,
  },

  {
    id: 'archived-students', catId: 'students', name: '已归档学员',
    desc: '查看与恢复已归档的学员档案', path: '/students/archived',
    icon: <ProfileOutlined />, visible: (_p, role) => role === 'admin' || role === 'manager',
  },

  {
    // 2026-11-08 用户拍板：退费记录入口放学员管理子菜单（原现金流页内卡片太隐蔽）
    id: 'refund-records', catId: 'students', name: '退费记录',
    desc: '退费登记（确认即通过）与取消回滚', path: '/students/refunds',
    icon: <RollbackOutlined />, visible: (_p, role) => ['admin','manager','teacher','coach'].includes(role || ''),
  },

  // ---------- 老师与销售 ----------
  {
    id: 'teachers',
    catId: 'teachers',
    name: '老师数据',
    desc: '老师维度的班级、学员与出勤统计（含本月销售）',
    path: '/teachers',
    icon: <TeamOutlined />,
    visible: (p) => p.canViewAllClasses || adminOrManager(p),
  },
  {
    id: 'sales',
    catId: 'teachers',
    name: '销售数据分析',
    desc: '线索→邀约→到场→成单的漏斗与金额',
    path: '/teachers/dashboard',
    icon: <DashboardOutlined />,
    visible: (p) => p.canViewReports,
  },

  // ---------- 系统管理 ----------
  {
    id: 'stafflist',
    catId: 'system',
    name: '工作人员列表',
    desc: '机构成员账号与角色管理',
    path: '/system/staff-list',
    icon: <TeamOutlined />,
    visible: (p) => p.canViewUsers,
  },
  {
    id: 'transfer',
    catId: 'system',
    name: '资源交接',
    desc: '学员/班级负责人变更交接',
    path: '/system/resource-transfer',
    icon: <ToolOutlined />,
    visible: (p) => p.canViewUsers,
  },
  {
    id: 'organizations',
    catId: 'system',
    name: '机构管理',
    desc: '机构档案与开通审批',
    path: '/organizations',
    icon: <BankOutlined />,
    visible: (p) => p.canViewOrganizations,
  },
  {
    id: 'settings',
    catId: 'system',
    name: '数据接口说明',
    desc: '接口说明书、MCP 接入与 API Key',
    path: '/system/settings',
    icon: <SettingOutlined />,
    visible: (p) => p.canViewSettings,
  },
  {
    id: 'aiCredits',
    catId: 'system',
    name: 'AI 积分',
    desc: '机构积分余额、套餐与消费明细',
    path: '/ai-credits',
    icon: <WalletOutlined />,
    visible: (_p, role) => role === 'manager' || role === 'admin',
  },
  {
    id: 'adminAiCampuses',
    catId: 'system',
    name: '机构 AI 管理',
    desc: '平台开通机构 AI、人工入账与流水（平台管理员）',
    path: '/admin/ai-organizations',
    icon: <BankOutlined />,
    visible: (p) => p.canViewOrganizations,
  },
];

const FUNC_BY_ID = new Map(FUNCS.map((f) => [f.id, f]));
const CAT_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export const getFuncById = (id: string): FuncDef | undefined => FUNC_BY_ID.get(id);
export const getCategoryById = (id: string): CategoryDef | undefined => CAT_BY_ID.get(id);

export const visibleFuncsOfCategory = (
  catId: string,
  p: MenuPermissionFlags,
  role: UserRole | null
): FuncDef[] =>
  FUNCS.filter((f) => f.catId === catId && f.visible(p, role));

export const visibleCategories = (p: MenuPermissionFlags, role: UserRole | null): CategoryDef[] =>
  CATEGORIES.filter((c) => visibleFuncsOfCategory(c.id, p, role).length > 0);

/** 顶栏标题：按路径反查功能名 */
export const getFuncNameByPath = (path: string): string | undefined => {
  const exact = FUNCS.find((f) => f.path === path);
  if (exact) return exact.name;
  const prefix = FUNCS.find((f) => path.startsWith(f.path) && f.path !== '/');
  return prefix?.name;
};

/** Same ordered, path-deduplicated collection for the page and navigation badge. */
export function commonFunctions(favorites:string[], permissions:Parameters<FuncDef['visible']>[0], role:UserRole|null, job?:string) {
  const teacher=job==='teacher'||job==='coach', sales=job==='sales';
  const ids=[...(teacher?['classes','weeklySchedule']:[]),...(teacher||sales?['pool','experience','orderinfo','renewal']:[]),...favorites];
  const paths=new Set<string>();
  return ids.map(getFuncById).filter((f):f is FuncDef=>{
    if(!f||!f.visible(permissions,role)||paths.has(f.path))return false;
    paths.add(f.path);return true;
  });
}
