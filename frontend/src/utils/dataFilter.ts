import { useAuthStore } from '../store/authStore';

/**
 * 用户角色类型
 */
export type UserRole = 'admin' | 'manager' | 'teacher' | 'coach' | 'sales' | 'staff' | 'parent';

/**
 * 角色映射：将旧角色映射到新角色
 */
const roleMapping: Record<string, UserRole> = {
  'teacher': 'coach',
};

/**
 * 规范化角色：将旧角色转换为新角色
 */
export const normalizeRole = (role: string): UserRole => {
  return roleMapping[role] || (role as UserRole);
};

/**
 * 页面类型
 */
export type PageType = 'classes' | 'students' | 'sales' | 'schedules' | 'attendances' | 'leads' | 'experiences';

/**
 * 数据过滤参数类型
 */
export interface DataScopeFilter {
  teacherId?: string;
  salesId?: string;
  assigneeId?: string;
  campusId?: string;
}

/**
 * 获取当前登录用户
 */
export const getCurrentUser = () => {
  return useAuthStore.getState().user;
};

/**
 * 判断用户是否是系统管理员（无校区限制）
 */
export const isSystemAdmin = () => {
  const user = getCurrentUser();
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  return normalizedRole === 'admin' && !user?.campusId;
};

/**
 * 判断用户是否是校区超级管理员（有校区限制）
 */
export const isSuperAdmin = () => {
  const user = getCurrentUser();
  const normalizedRole = user?.role ? normalizeRole(user.role) : null;
  return normalizedRole === 'admin' && !!user?.campusId;
};

/**
 * 判断当前用户是否可以查看所有数据
 */
export const canViewAllData = () => {
  const user = getCurrentUser();
  if (!user) return false;
  
  const normalizedRole = normalizeRole(user.role);
  // admin 和 manager 可以看所有数据（admin 可能受校区限制）
  return normalizedRole === 'admin' || normalizedRole === 'manager';
};

/**
 * 判断当前用户是否需要数据过滤
 */
export const needsDataFiltering = () => {
  const user = getCurrentUser();
  if (!user) return false;
  
  const normalizedRole = normalizeRole(user.role);
  // coach, sales 和 staff 需要过滤
  return normalizedRole === 'coach' || normalizedRole === 'sales' || normalizedRole === 'staff';
};

/**
 * 根据当前用户角色和页面类型，自动添加数据过滤参数
 * 
 * @param pageType - 页面类型
 * @returns 过滤参数对象
 * 
 * @example
 * ```typescript
 * // 在班级列表页面
 * const filter = getDataScopeFilter('classes');
 * // 如果用户是 coach，返回 { teacherId: 'xxx' }
 * // 如果用户是 admin/manager，返回 {}
 * 
 * const result = await memfireDB.classes.list({
 *   page: 1,
 *   pageSize: 10,
 *   ...filter
 * });
 * ```
 */
export const getDataScopeFilter = (pageType: PageType): DataScopeFilter => {
  const user = getCurrentUser();
  
  if (!user) return {};
  
  const normalizedRole = normalizeRole(user.role);
  
  // 所有 admin 角色可以看所有数据
  if (normalizedRole === 'admin') {
    return {};
  }
  
  // manager 可以看所有数据（但可能受校区限制）
  if (normalizedRole === 'manager') {
    if (user.campusId) {
      return { campusId: user.campusId };
    }
    return {};
  }
  
  // coach 角色根据页面类型过滤
  if (normalizedRole === 'coach') {
    // 班级 - 可以查看所有班级（查看权限，无操作权限）
    if (pageType === 'classes') {
      return user.campusId ? { campusId: user.campusId } : {};
    }

    // 学员、排课、出勤相关 - 按教练ID过滤（只看自己的）
    if (['students', 'schedules', 'attendances'].includes(pageType)) {
      return { teacherId: user.id };
    }

    // 销售相关（鱼池、体验课、成单信息）- 按销售ID过滤
    if (['sales', 'leads', 'experiences'].includes(pageType)) {
      return {
        salesId: user.id,
        assigneeId: user.id  // 鱼池和体验课用 assigneeId
      };
    }
  }
  
  // sales 角色根据页面类型过滤
  if (normalizedRole === 'sales') {
    // 销售相关（鱼池、体验课、成单信息）- 按销售ID过滤
    if (['sales', 'leads', 'experiences'].includes(pageType)) {
      return {
        salesId: user.id,
        assigneeId: user.id
      };
    }

    // 班级、学员、排课、出勤相关 - 查看权限，无操作权限
    // 如果有 campusId 则按校区过滤，否则不过滤（查看所有）
    if (['classes', 'students', 'schedules', 'attendances'].includes(pageType)) {
      if (user.campusId) {
        return { campusId: user.campusId };
      }
      return {}; // 无校区则不限制
    }
  }
  
  // staff 角色也可能需要过滤（类似 coach）
  if (normalizedRole === 'staff') {
    if (['classes', 'students', 'schedules', 'attendances'].includes(pageType)) {
      return { teacherId: user.id };
    }
  }
  
  return {};
};

/**
 * 获取用户可见的菜单权限
 * 
 * @returns 权限对象
 */
export const getUserMenuPermissions = () => {
  const user = getCurrentUser();

  if (!user) {
    return {
      canViewOrganizations: false,
      canViewUsers: false,
      canViewAllClasses: false,
      canViewAllStudents: false,
      canViewSalesData: false,
      canViewReports: false,
      canViewSettings: false,
      canViewStudentPortal: false,
    };
  }

  const normalizedRole = normalizeRole(user.role);

  // 系统管理员 - 只能看系统管理，不看运营数据
  if (normalizedRole === 'admin') {
    return {
      canViewOrganizations: true,
      canViewUsers: true,
      canViewAllClasses: false,  // 不看运营数据
      canViewAllStudents: false,
      canViewSalesData: false,
      canViewReports: false,
      canViewSettings: true,
    };
  }

  // 管理者 - 有运营数据查看权限，但无用户和机构管理权限
  if (normalizedRole === 'manager') {
    return {
      canViewOrganizations: false,
      canViewUsers: true,  // 可以查看工作人员列表
      canViewAllClasses: true,  // 可以看运营数据
      canViewAllStudents: true,
      canViewSalesData: true,
      canViewReports: true,
      canViewSettings: false,
    };
  }

  // 教练 - 可查看班级、学员、销售数据，但只能看到自己的数据（通过数据过滤实现）
  if (normalizedRole === 'coach') {
    return {
      canViewOrganizations: false,
      canViewUsers: false,
      canViewAllClasses: true,   // 可以查看班级管理（数据会被过滤，只显示自己的）
      canViewAllStudents: true,  // 可以查看学员管理（数据会被过滤，只显示自己的）
      canViewSalesData: true,    // 可以查看销售数据（数据会被过滤，只显示自己的）
      canViewReports: false,
      canViewSettings: false,
    };
  }

  // 销售 - 可以查看班级、销售数据和报表，但不能查看学员管理
  if (normalizedRole === 'sales') {
    return {
      canViewOrganizations: false,
      canViewUsers: false,
      canViewAllClasses: true,  // 可以查看所有班级信息
      canViewAllStudents: false,  // 不查看学员管理界面
      canViewSalesData: true,  // 可以看销售数据
      canViewReports: true,  // 可以查看报表
      canViewSettings: false,
    };
  }

  // 工作人员 - 有限权限
  if (normalizedRole === 'staff') {
    return {
      canViewOrganizations: false,
      canViewUsers: false,
      canViewAllClasses: false,
      canViewAllStudents: false,
      canViewSalesData: false,
      canViewReports: false,
      canViewSettings: false,
    };
  }

  // 家长 - 学员专属功能
  if (normalizedRole === 'parent') {
    return {
      canViewOrganizations: false,
      canViewUsers: false,
      canViewAllClasses: false,
      canViewAllStudents: false,
      canViewSalesData: false,
      canViewReports: false,
      canViewSettings: false,
      // 学员专属功能
      canViewStudentPortal: true,  // 学员中心
    };
  }

  return {
    canViewOrganizations: false,
    canViewUsers: false,
    canViewAllClasses: false,
    canViewAllStudents: false,
    canViewSalesData: false,
    canViewReports: false,
    canViewSettings: false,
    canViewStudentPortal: false,
  };
};

/**
 * 检查用户是否有权限执行某个操作
 * 
 * @param action - 操作类型
 * @returns 是否有权限
 */
export const hasPermission = (action: string): boolean => {
  const user = getCurrentUser();
  if (!user) return false;
  
  const normalizedRole = normalizeRole(user.role);
  
  // admin 和 manager 有所有权限
  if (normalizedRole === 'admin' || normalizedRole === 'manager') {
    return true;
  }
  
  // coach 有班级和学员相关的编辑权限
  if (normalizedRole === 'coach') {
    const coachActions = [
      'edit:class',
      'edit:student',
      'create:attendance',
      'edit:attendance',
      'create:schedule',
      'edit:schedule',
      'edit:lead',
      'create:conversion',
    ];
    return coachActions.includes(action);
  }
  
  // sales 只有查看权限，没有编辑权限
  if (normalizedRole === 'sales') {
    return false;
  }
  
  return false;
};
