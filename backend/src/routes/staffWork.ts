import { hiddenTimetableOccurrence } from '../services/scheduleConflicts';
import { Router } from 'express';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireOrganizationAccess, requireMinRole } from '../middleware/rbac';
import { experienceScopeWhere } from '../utils/experienceScope';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { computeSessionAttendance, computeStudentSessions, SESSION_ATTENDANCE_CALIBER } from '../services/attendanceStatsService';
import { responsibilityEnrollmentWhere } from '../services/studentResponsibility';
import { experienceWorkSelect, experienceWorkWhere, todayExperience, type TodayExperience } from '../services/experienceWork';

export const staffWorkRoutes = Router();
staffWorkRoutes.use(authenticate, requireOrganizationAccess());
export const isEmployeeWorkRole = (role?: string) => ['teacher', 'coach', 'sales', 'staff'].includes(role || '');
export const workDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
export interface WorkActor { userId: string; organizationId: string; campusId: string; role: string }
export function employeeActor(req: AuthRequest): WorkActor {
  const user = req.user;
  if (!user?.id || !user.organizationId || !user.campusId || user.isPlatformAdmin || !isEmployeeWorkRole(user.jobRole || user.role)) throw new ApiError('当前账号未配置员工校区权限', 403, 'FORBIDDEN');
  return { userId: user.id, organizationId: user.organizationId, campusId: user.campusId, role: (user.jobRole || user.role)! };
}
const revisionOf = (facts: unknown) => createHash('sha256').update(JSON.stringify(facts)).digest('hex');
export interface WorkTask { key: string; category: 'lowClasses' | 'lowStudents' | 'renewal' | 'lead' | 'experience'; name: string; detail: string; revision: string; path: string; done: boolean; completedAt: string | null; experience?: TodayExperience }
const capped = <T>(rows: T[]) => { if (rows.length > 5000) throw new ApiError('工作事项超过 5000 条，请联系管理员处理数据范围', 422, 'WORK_LIMIT'); return rows; };

/** Each query is constrained by server identity. Query-string teacher/assignee/campus never grants scope. */
export async function buildStaffWork(actor: WorkActor, db: Prisma.TransactionClient, day = workDay(), unassignedTeacherIds?: string[]) {
  const teacher = ['teacher', 'coach'].includes(actor.role), sales = actor.role === 'sales', staff = actor.role === 'staff';
  const scope = { organizationId: actor.organizationId, campusId: actor.campusId };
  const fromToday = new Date(day + 'T00:00:00+08:00');
  const until = new Date(fromToday.getTime() + 86400000);
  const start30 = new Date(fromToday.getTime() - 29 * 86400000);
  const start14 = new Date(fromToday.getTime() - 13 * 86400000);
  const tasks: WorkTask[] = [];
  const add = (task: Omit<WorkTask, 'done' | 'completedAt'>) => tasks.push({ ...task, done: false, completedAt: null });
  const classOwner = unassignedTeacherIds ? { OR: [{ teacherId: null }, { teacherId: { notIn: unassignedTeacherIds } }] } : { teacherId: actor.userId };
  const classes = teacher ? capped(await db.class.findMany({ where: { ...scope, ...classOwner, status: 'active' }, select: { id: true, name: true }, take: 5001, orderBy: { id: 'asc' } })) : [];
  const classIds = classes.map(row => row.id);
  const classesWhere = { organizationId: actor.organizationId, campusId: actor.campusId };
  const todaySchedules = teacher ? capped(await db.schedule.findMany({ where: { organizationId: actor.organizationId, class: classesWhere, NOT: hiddenTimetableOccurrence(), startTime: { gte: fromToday, lt: until }, status: { in: ['scheduled', 'completed'] }, teacherId: actor.userId }, select: { id: true, classId: true, startTime: true, endTime: true, status: true, classroom: true, class: { select: { name: true } } }, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], take: 5001 })) : [];
  if (teacher && classIds.length) {
    const [sessions, enrollmentRows, attendanceRows] = await Promise.all([
      db.schedule.findMany({ where: { organizationId: actor.organizationId, classId: { in: classIds }, status: 'completed', startTime: { gte: start30, lt: until } }, select: { id: true, classId: true, startTime: true, endTime: true }, orderBy: { id: 'asc' }, take: 5001 }),
      db.enrollment.findMany({ where: { organizationId: actor.organizationId, classId: { in: classIds }, student: scope }, select: { classId: true, studentId: true, status: true, endedAt:true, enrolledAt: true, student: { select: { name: true } } }, orderBy: { id: 'asc' }, take: 5001 }),
      db.attendance.findMany({ where: { organizationId: actor.organizationId, classId: { in: classIds }, schedule: { organizationId: actor.organizationId, classId: { in: classIds }, status: 'completed', startTime: { gte: start30, lt: until } } }, select: { scheduleId: true, classId: true, studentId: true, status: true, isTemporary:true,student:{select:{name:true}} }, orderBy: { id: 'asc' }, take: 5001 }),
    ]);
    capped(sessions); capped(enrollmentRows); capped(attendanceRows);
    for (const cls of classes) {
      const roster = enrollmentRows.filter(row => row.classId === cls.id);
      const recent = sessions.filter(row => row.classId === cls.id);
      // The shared service applies enrollment windows and saved occurrence-only guests.
      const sessionById = new Map(recent.map(session => [session.id, session]));
      const arrivals = attendanceRows.filter(row => row.classId===cls.id && sessionById.has(row.scheduleId));
      const recent14 = recent.filter(row => row.startTime >= start14);
      const ids14 = new Set(recent14.map(row => row.id));
      const rate14 = computeSessionAttendance({ schedules: recent14, enrollments: roster, attendances: arrivals.filter(row => ids14.has(row.scheduleId)) });
      if (rate14.rate !== null && rate14.rate < 60) add({ key: `lowClasses:${cls.id}`, category: 'lowClasses', name: cls.name, detail: `近14天出勤 ${rate14.present}/${rate14.expected}（${rate14.rate}%），请核对缺课与回访`, revision: revisionOf([rate14.expected, rate14.present, recent14, roster, arrivals.filter(row => ids14.has(row.scheduleId))]), path: '/attendances/low-attendance-classes' });
      // Keep separate student+class facts, including the same student enrolled in multiple classes.
      const names=new Map([...roster,...arrivals].map(row=>[row.studentId,row.student.name]));
      for(const metric of computeStudentSessions({schedules:recent,enrollments:roster,attendances:arrivals})){
        if(metric.rate!==null && metric.rate<60)add({key:`lowStudents:${metric.studentId}:${cls.id}`,category:'lowStudents',name:names.get(metric.studentId) || '学员',detail:`${cls.name} · 近30天出勤 ${metric.present}/${metric.expected}（${metric.rate}%）`,revision:revisionOf(metric),path:'/students/low-attendance'});
      }
    }
  }
  if (teacher) {
    const responsibility = { ...responsibilityEnrollmentWhere(scope), class: { ...scope, status: { not: 'deleted' }, ...classOwner } };
    const students = capped(await db.student.findMany({ where: { ...scope, status: 'active', remainingLessons: { lte: 10 }, AND: [{ OR: [{ renewalStatus: null }, { renewalStatus: { not: 'no_renewal' } }] }, { enrollments: { some: responsibility } }] }, select: { id: true, name: true, remainingLessons: true, renewalStatus: true, enrollments: { where: responsibility, orderBy: { id: 'asc' }, select: { id: true, class: { select: { id: true, teacherId: true, updatedAt: true } } } } }, orderBy: [{ remainingLessons: 'asc' }, { id: 'asc' }], take: 5001 }));
    for (const row of students) add({ key: `renewal:${row.id}`, category: 'renewal', name: row.name, detail: `剩余 ${row.remainingLessons} 课时 · 联系家长确认续费意向`, revision: revisionOf([row.id, row.remainingLessons, row.renewalStatus, row.enrollments]), path: '/students/renewal' });
  }
  if (teacher || sales || staff) {
    const [leadRows, experienceRows] = await Promise.all([
      db.lead.findMany({ where: { organizationId: actor.organizationId, assigneeId: actor.userId, assignee: scope, status: { in: ['new', 'contacted', 'visited'] } }, select: { id: true, customerName: true, status: true, lastContactAt: true, updatedAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 5001 }),
      db.experienceLesson.findMany({ where: experienceWorkWhere(actor, day), select: experienceWorkSelect, orderBy: [{ scheduleDate: 'desc' }, { startTime: 'asc' }, { id: 'asc' }], take: 5001 }),
    ]);
    const labels: Record<string, string> = { new: '待联系', contacted: '已联系', visited: '已到访', pending: '待体验', completed: '已到场未成单', unconverted: '未成单', noshow: '未到场', 'no-show': '未到场' };
    for (const row of capped(leadRows)) add({ key: `lead:${row.id}`, category: 'lead', name: row.customerName, detail: `${labels[row.status]} · ${row.lastContactAt ? `最近联系 ${new Date(row.lastContactAt.getTime() + 8 * 3600000).toISOString().slice(0, 10)}` : '尚无联系记录'}`, revision: revisionOf([row.status, row.lastContactAt, row.updatedAt]), path: '/cashflow/marketing' });
    for (const row of capped(experienceRows)) {
      const experience = todayExperience(row, actor, day);
      if (row.scheduleDate === day && (!experience || (!experience.teaching && !experience.sales))) continue;
      const detail = experience ? `今日体验 · ${experience.startTime ? `${experience.startTime}${experience.endTime ? '–' + experience.endTime : ''}` : '时间待安排'} · ${experience.className} · ${labels[row.status]} · ${[experience.teaching && '本人授课', experience.sales && '本人跟进'].filter(Boolean).join('／')}`
        : `${row.scheduleDate} · ${labels[row.status]} · 跟进体验与报名意向`;
      add({ key: `experience:${row.id}`, category: 'experience', name: row.studentName, detail,
        revision: revisionOf([row.scheduleDate, row.status, row.updatedAt, ...(experience ? [experience] : [])]),
        path: '/cashflow/experience-schedule', ...(experience ? { experience } : {}) });
    }
  }
  capped(tasks);
  const completions = await db.followUpCompletion.findMany({ where: { ...scope, userId: actor.userId, day, done: true, taskKey: { in: tasks.map(task => task.key) } }, select: { taskKey: true, revision: true, updatedAt: true } });
  const done = new Map(completions.map(row => [row.taskKey + '|' + row.revision, row.updatedAt]));
  for (const task of tasks) { const completedAt = done.get(task.key + '|' + task.revision); if (completedAt) { task.done = true; task.completedAt = completedAt.toISOString(); } }
  return { day, role: actor.role, tasks, todaySchedules, progress: { total: tasks.length, completed: tasks.filter(task => task.done).length }, caliber: { attendance: SESSION_ATTENDANCE_CALIBER, windows: '班级近14个上海自然日、学员近30个上海自然日（均含今日）；完成场次按课程日期归集；出勤率低于60%；无有效场次不生成低出勤待办。', renewal: '在读、剩余课时≤10、未标记不续费；仅当前负责班级老师承接，停课班仍保留续费责任；不按历史销售归属分配。', completion: '完成仅记录上海日期当天的个人跟进行动；不代表出勤风险解除、已经续费或客户已成单。事实变化会生成新版本待办；次日重新开始。' }, capabilityNote: staff ? '普通工作人员暂未开放业务页面，请联系管理员确认岗位后处理业务。' : null };
}
/** Manager and staff use exactly the same occurrence, revision and day semantics. */
staffWorkRoutes.get('/manager-followups', requireMinRole('manager'), async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    if (!user.organizationId || !user.campusId || user.isPlatformAdmin) throw new ApiError('需要机构管理员权限', 403, 'FORBIDDEN');
    const organizationId = user.organizationId, campusId = user.campusId, day = workDay();
    const result = await prisma.$transaction(async db => {
      const staff = await db.user.findMany({where:{organizationId,campusId,isActive:true,isPlatformAdmin:false,role:{not:'parent'}},select:{id:true,name:true,role:true},orderBy:[{name:'asc'},{id:'asc'}],take:201});
      if (staff.length > 200) throw new ApiError('工作人员超过200人，请联系管理员处理统计范围', 422, 'WORK_LIMIT');
      const people = [];
      let taskCount = 0;
      for (const person of staff) {
        const role = ['teacher','coach','sales','staff'].includes(person.role) ? person.role : 'staff';
        const work = await buildStaffWork({userId:person.id,organizationId,campusId,role},db,day);
        taskCount += work.tasks.length;
        if (taskCount > 5000) throw new ApiError('工作事项超过 5000 条，请联系管理员处理数据范围', 422, 'WORK_LIMIT');
        people.push({id:person.id,name:person.name,jobRole:person.role,isActive:true,tasks:work.tasks});
      }
      const activeTeachers = staff.filter(p=>['teacher','coach'].includes(p.role)).map(p=>p.id);
      // Unassigned, disabled and non-teaching class owners are evaluated using the same teacher computation.
      const missing = await buildStaffWork({userId:'__unassigned__',organizationId,campusId,role:'teacher'},db,day,activeTeachers);
      const unassigned = missing.tasks.filter(t=>t.category==='lowClasses'||t.category==='lowStudents');
      const owned = new Set(people.flatMap(person=>person.tasks.map(t=>t.key)));
      const students = capped(await db.student.findMany({where:{organizationId,campusId,status:'active',remainingLessons:{lte:10},OR:[{renewalStatus:null},{renewalStatus:{not:'no_renewal'}}]},select:{id:true,name:true,remainingLessons:true,renewalStatus:true},take:5001,orderBy:{id:'asc'}}));
      for(const s of students) if(!owned.has(`renewal:${s.id}`)) unassigned.push({key:`renewal:${s.id}`,category:'renewal',name:s.name,detail:`剩余 ${s.remainingLessons} 课时 · 尚无在职负责老师，请安排班级`,revision:revisionOf([s.id,s.remainingLessons,s.renewalStatus]),path:'/students/renewal',done:false,completedAt:null});
      const activeIds=staff.map(p=>p.id);
      const campusUsers=await db.user.findMany({where:{organizationId,campusId},select:{id:true},take:5001});
      capped(campusUsers);
      const campusIds=campusUsers.map(p=>p.id);
      const leads = capped(await db.lead.findMany({where:{organizationId,status:{in:['new','contacted','visited']},AND:[{OR:[{assignee:{organizationId,campusId}},{assigneeId:null,createdById:{in:campusIds}}]},{OR:[{assigneeId:null},{assigneeId:{notIn:activeIds}}]}]},select:{id:true,customerName:true,status:true,lastContactAt:true,updatedAt:true},orderBy:{id:'asc'},take:5001}));
      for(const row of leads) unassigned.push({key:`lead:${row.id}`,category:'lead',name:row.customerName,detail:'线索尚无在职工作人员跟进',revision:revisionOf([row.status,row.lastContactAt,row.updatedAt]),path:'/cashflow/marketing',done:false,completedAt:null});
      const experiences=capped(await db.experienceLesson.findMany({where:{AND:[experienceScopeWhere(organizationId,campusId),{OR:[{assigneeId:null},{assigneeId:{notIn:activeIds}}]}],status:{in:['pending','completed','unconverted','noshow','no-show']},scheduleDate:{lte:day}},select:{id:true,studentName:true,scheduleDate:true,status:true,updatedAt:true},orderBy:{id:'asc'},take:5001}));
      for(const row of experiences) unassigned.push({key:`experience:${row.id}`,category:'experience',name:row.studentName,detail:`${row.scheduleDate} · 体验课尚无在职工作人员跟进`,revision:revisionOf([row.scheduleDate,row.status,row.updatedAt]),path:'/cashflow/experience-schedule',done:false,completedAt:null});
      capped(unassigned);
      if (taskCount + unassigned.length > 5000) throw new ApiError('工作事项超过 5000 条，请联系管理员处理数据范围', 422, 'WORK_LIMIT');
      return {day,people,unassigned,caliber:{...missing.caliber,scope:'未分班且无负责人的体验课，以及无负责人且无校区创建人线索，无法确定所属校区，不计入当前校区；请先明确归属。'}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:2000,timeout:15000});
    res.set('Cache-Control','no-store'); sendSuccess(res,result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2028' || error.code === 'P2024')) return next(new ApiError('待办统计繁忙或数据量过大，请稍后重试', 503, 'WORK_QUERY_TIMEOUT'));
    next(error);
  }
});

staffWorkRoutes.get('/', async (req: AuthRequest, res, next) => { try { const actor = employeeActor(req); res.set('Cache-Control', 'no-store'); sendSuccess(res, await prisma.$transaction(tx => buildStaffWork(actor, tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })); } catch (error) { next(error); } });
