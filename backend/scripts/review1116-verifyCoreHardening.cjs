'use strict';
// All database/server operations are confined to a freshly-created loopback test database.
// Never imports project .env or uses DATABASE_URL from the invoking shell.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const backend = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'greatstart-core-'));
const database = 'core_regression_' + randomBytes(8).toString('hex');
assert.match(database, /^core_regression_[0-9a-f]{16}$/);
const pguser = process.env.CORE_TEST_PGUSER || os.userInfo().username;
const pgpassword = process.env.CORE_TEST_PGPASSWORD || '';
const pgport = String(Number(process.env.CORE_TEST_PGPORT || 5432));
assert.match(pgport, /^\d+$/);
const url = `postgresql://${encodeURIComponent(pguser)}${pgpassword ? ':' + encodeURIComponent(pgpassword) : ''}@127.0.0.1:${pgport}/${database}`;
const env = {
  PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(),
  PGHOST: '127.0.0.1', PGPORT: pgport, PGUSER: pguser, PGPASSWORD: pgpassword,
  DATABASE_URL: url, DATABASE_DIRECT_URL: url, JWT_SECRET: randomBytes(48).toString('hex'),
  NODE_ENV: 'test', AI_PROVIDER: 'mock', ENABLE_MCP: 'false', ENABLE_SWAGGER: 'false',
  DOTENV_CONFIG_PATH: path.join(scratch, 'no-business-env'),
  ARK_API_KEY: '', GLM_API_KEY: '', };
const db = new PrismaClient({ datasources: { db: { url } } });
const checks = [];
let server, port, created = false, cleanupComplete = false, serverOutput = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = name => { checks.push(name); console.log(`PASS ${checks.length}: ${name}`); };
const run = (command, args) => execFileSync(command, args, { cwd: scratch, env, stdio: 'pipe', timeout: 120000 });
const migrate = () => run(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(scratch, 'prisma/schema.prisma')]);
const tokenFor = u => jwt.sign({ userId: u.id, sessionTag: createHmac('sha256', env.JWT_SECRET).update(u.password).digest('base64url') }, env.JWT_SECRET, { expiresIn: '1h' });
async function request(method, route, token, body, expected = 200) {
  const response = await fetch(`http://127.0.0.1:${port}/api${route}`, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const json = await response.json();
  assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(json).slice(0,700)}`);
  return expected >= 400 ? json : json.data;
}
async function freePort() { const socket = net.createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const p = socket.address().port; await new Promise(r => socket.close(r)); return p; }

async function main() {
  run('createdb', [database]); created = true;
  // Materialize links: later migration-removal checks must never resolve back to source.
  fs.cpSync(path.join(backend, 'prisma'), path.join(scratch, 'prisma'), { recursive: true, dereference: true });
  assert.ok(fs.realpathSync(path.join(scratch, 'prisma')).startsWith(fs.realpathSync(scratch) + path.sep));
  const late = fs.readdirSync(path.join(scratch, 'prisma/migrations')).filter(name => {
    const sql = path.join(scratch, 'prisma/migrations', name, 'migration.sql');
    return fs.existsSync(sql) && fs.readFileSync(sql, 'utf8').includes('lesson_add_requests');
  });
  assert.equal(late.length, 1, 'Expected one additive lesson idempotency migration');
  const latePath = path.join(scratch, 'prisma/migrations', late[0]);
  assert.ok(fs.realpathSync(latePath).startsWith(fs.realpathSync(scratch) + path.sep));
  fs.rmSync(latePath, { recursive: true });
  migrate();
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  const org = await db.organization.create({ data: { code: database, name: '核心回归机构' } });
  const campus = await db.campus.create({ data: { organizationId: org.id, code: 'MAIN', name: '默认范围' } });
  const otherOrg = await db.organization.create({ data: { code: database + '_other', name: '外部回归机构' } });
  const otherCampus = await db.campus.create({ data: { organizationId: otherOrg.id, code: 'MAIN', name: '默认范围' } });
  const makeUser = (name, role = 'coach', foreign = false) => db.user.create({ data: { name, email: name + '@core.test', password: 'test-only-hash', role, managementLevel: ['admin','manager'].includes(role) ? 'super' : 'none', organizationId: foreign ? otherOrg.id : org.id, campusId: foreign ? otherCampus.id : campus.id } });
  const admin = await makeUser('admin', 'admin'), teacher = await makeUser('teacher'), teacher2 = await makeUser('teacher2'), teacher3 = await makeUser('teacher3'), foreign = await makeUser('foreign', 'admin', true);
  const at = tokenFor(admin), tt = tokenFor(teacher), ft = tokenFor(foreign);
  const student = (name, balance = 10, external = false) => db.student.create({ data: { name, organizationId: external ? otherOrg.id : org.id, campusId: external ? otherCampus.id : campus.id, remainingLessons: balance, purchasedLessons: balance } });
  const sentinel = await student('迁移前保留学员', 23);
  const sentinelLog = await db.lessonLog.create({ data: { organizationId: org.id, studentId: sentinel.id, studentName: sentinel.name, type: 'add', lessons: 23, notes: '迁移前历史' } });
  fs.cpSync(path.join(backend, 'prisma/migrations', late[0]), path.join(scratch, 'prisma/migrations', late[0]), { recursive: true });
  migrate(); migrate();
  assert.deepEqual(await db.student.findUnique({ where: { id: sentinel.id } }), sentinel);
  assert.deepEqual(await db.lessonLog.findUnique({ where: { id: sentinelLog.id } }), sentinelLog);
  check('独立库升级及重复migrate通过，历史余额与流水逐字段不变');

  port = await freePort();
  const uiPort = process.env.CORE_TEST_BROWSER === '1' ? await freePort() : null;
  if (uiPort) env.ALLOWED_ORIGINS = `http://127.0.0.1:${uiPort}`;
  // CWD is a sterile temporary directory: dotenv.config() cannot load business credentials.
  server = spawn(process.execPath, ['--import', path.join(backend, 'node_modules/tsx/dist/loader.mjs'), path.join(backend, 'src/index.ts')], { cwd: scratch, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const pipe of [server.stdout, server.stderr]) pipe.on('data', b => { serverOutput = (serverOutput + b).slice(-14000); });
  let ready = false;
  for (let n = 0; n < 150; n++) { try { const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(300) }); if (r.ok) { ready = true; break; } } catch {} if (server.exitCode !== null) break; await pause(100); }
  assert.ok(ready, 'Isolated server did not start: ' + serverOutput.slice(-3000));
  let serial = 0;
  const klass = (who = teacher, external = false) => db.class.create({ data: { organizationId: external ? otherOrg.id : org.id, campusId: external ? otherCampus.id : campus.id, code: 'C' + (++serial), name: '回归班' + serial, courseType: '篮球', capacity: 20, teacherId: who.id } });
  const c1 = await klass(), c2 = await klass(), c3 = await klass(teacher2);
  const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0,10);
  const slot = (classId, date, start = '09:00', end = '11:00', classroom = 'A馆') => ({ classId, startTime: date + 'T' + start + ':00+08:00', endTime: date + 'T' + end + ':00+08:00', classroom });
  const create = body => request('POST', '/schedules', at, body, 201);
  const conflict = async (method, route, body) => { const e = await request(method, route, at, body, 409); assert.equal(e.error.code, 'SCHEDULE_CONFLICT'); };
  const first = await create(slot(c1.id, day(10)));
  for (const times of [['09:00','10:00'],['08:00','12:00'],['10:00','12:00'],['08:00','10:00'],['10:00','11:00']]) await conflict('POST', '/schedules', slot(c2.id, day(10), ...times, 'B馆'));
  await conflict('POST', '/schedules', slot(c3.id, day(10), '09:30', '10:00', '  A馆  '));
  await conflict('POST', '/schedules', slot(c1.id, day(10), '09:00', '10:00', 'A馆'));
  const exact = await request('POST', '/schedules', at, slot(c1.id, day(10)), 200); assert.equal(exact.id, first.id);
  await create(slot(c2.id, day(10), '11:00', '12:00', 'A馆'));
  await create(slot(c3.id, day(10), '09:00', '11:00', 'B馆'));
  check('教师/教室/班级相交与包含拒绝，首尾相接允许，精确重试复用原场次');
  await request('POST', '/schedules', tt, slot(c1.id, day(11)), 403);
  await request('POST', '/schedules', ft, slot(c1.id, day(11)), 403);
  await request('POST', '/schedules', at, slot(c1.id, day(11), '11:00', '10:00'), 400);
  check('排课权限及非法时间拒绝');
  const race = await Promise.all([c1,c2].map(c => fetch(`http://127.0.0.1:${port}/api/schedules`, { method: 'POST', headers: { 'content-type':'application/json', authorization:'Bearer '+at }, body: JSON.stringify(slot(c.id,day(12),'09:00','10:00','并发馆')) }).then(async r=>({status:r.status,json:await r.json()}))));
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  assert.equal(await db.schedule.count({where:{startTime:new Date(slot(c1.id,day(12)).startTime),teacherId:teacher.id}}),1);
  check('两班同教师同时抢课仅一个成功，无并发穿透');
  const movable = await create(slot(c2.id,day(13),'09:00','10:00','B馆'));
  await conflict('PUT','/schedules/'+movable.id,{startTime:first.startTime,endTime:first.endTime});
  assert.equal((await db.schedule.findUniqueOrThrow({where:{id:movable.id}})).startTime.toISOString(),new Date(movable.startTime).toISOString());
  await conflict('POST','/schedules/'+movable.id+'/reschedule',{newStartTime:first.startTime,newEndTime:first.endTime});
  assert.equal(await db.schedule.count({where:{originalScheduleId:movable.id}}),0);
  assert.equal((await db.schedule.findUniqueOrThrow({where:{id:movable.id}})).status,'scheduled');
  const moved=await request('POST','/schedules/'+movable.id+'/reschedule',at,{newStartTime:slot(c2.id,day(14),'09:00','10:00').startTime,newEndTime:slot(c2.id,day(14),'09:00','10:00').endTime},201);
  assert.equal(moved.originalScheduleId,movable.id);
  await create(slot(c2.id,day(13),'09:00','10:00','B馆'));
  await request('DELETE','/schedules/'+moved.id,at);
  await create(slot(c2.id,day(14),'09:00','10:00','B馆'));
  check('修改/调课冲突原子拒绝，成功调课保留关联，取消和调走释放时间');
  const swap=await create(slot(c3.id,day(15),'09:00','10:00','第二馆'));
  await create(slot(c1.id,day(15),'09:00','10:00','第一馆'));
  await conflict('PUT','/schedules/'+swap.id,{teacherId:teacher.id});
  const transferCount=await db.resourceTransfer.count();
  await conflict('POST','/resource-transfers/execute',{fromTeacherId:teacher2.id,toTeacherId:teacher.id,classIds:[c3.id]});
  assert.equal((await db.class.findUniqueOrThrow({where:{id:c3.id}})).teacherId,teacher2.id);
  assert.equal(await db.resourceTransfer.count(),transferCount);
  check('代课和整班教练交接同样检查冲突，失败不改班级教师或交接记录');
  await create(slot(c1.id,day(21),'10:00','11:00','固定馆'));
  const recurring={classId:c2.id,recurrenceType:'daily',startDate:day(20),endDate:day(22),startTime:'10:00',endTime:'11:00',location:'批量馆'};
  await conflict('POST','/schedules/recurring',recurring);
  assert.equal(await db.schedule.count({where:{classId:c2.id,startTime:{gte:new Date(day(20)),lt:new Date(day(23))}}}),0);
  const c4=await klass(teacher3),good={...recurring,classId:c4.id};
  const batch=await request('POST','/schedules/recurring',at,good,201);assert.equal(batch.count,3);
  const retry=await request('POST','/schedules/recurring',at,good,201);assert.equal(retry.count,3);
  assert.equal(await db.schedule.count({where:{classId:c4.id}}),3);
  check('循环排课中途冲突整批回滚，含结束日，完整重试不重复生成');

  const past=new Date(Date.now()-86400000),pastEnd=new Date(+past+3600000);
  const enrollmentStudent=await student('结束报名学员');
  const ec=await klass(teacher3);
  const enrollment=await db.enrollment.create({data:{organizationId:org.id,studentId:enrollmentStudent.id,classId:ec.id,enrolledAt:new Date(+past-86400000)}});
  const historical=await db.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:ec.id,teacherId:teacher3.id,startTime:past,endTime:pastEnd}});
  const future=await db.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:ec.id,teacherId:teacher3.id,startTime:new Date(Date.now()+86400000),endTime:new Date(Date.now()+90000000)}});
  const attend=(id,entries,t=at,expected=200)=>request('POST','/attendances/batch',t,{scheduleId:id,entries},expected);
  await attend(historical.id,[{studentId:enrollmentStudent.id,status:'present'}]);
  const stopped=await request('PUT','/enrollments/'+enrollment.id,at,{status:'completed'});
  assert.ok(stopped.endedAt);assert.ok(new Date(stopped.endedAt)>pastEnd);
  const repeated=await request('PUT','/enrollments/'+enrollment.id,at,{status:'completed'});assert.equal(repeated.endedAt,stopped.endedAt);
  assert.ok((await request('GET','/schedules/'+historical.id+'/roster',at)).students.some(s=>s.id===enrollmentStudent.id));
  assert.ok(!(await request('GET','/schedules/'+future.id+'/roster',at)).students.some(s=>s.id===enrollmentStudent.id));
  await attend(historical.id,[{studentId:enrollmentStudent.id,status:'leave'}]);
  assert.equal((await db.student.findUniqueOrThrow({where:{id:enrollmentStudent.id}})).remainingLessons,10);
  await attend(historical.id,[{studentId:enrollmentStudent.id,status:'present'}]);
  await request('PUT','/enrollments/'+enrollment.id,at,{status:'active'},409);
  await request('PUT','/enrollments/'+enrollment.id,ft,{status:'completed'},404);
  await request('PUT','/enrollments/'+enrollment.id,at,{endedAt:new Date().toISOString()},400);
  const endedStat=await request('GET','/consumption/statistics?startDate='+past.toISOString().slice(0,10)+'&endDate='+new Date().toISOString().slice(0,10),at);
  assert.equal(endedStat.totalAttendanceCount,1);assert.equal(endedStat.present,1);
  check('完成报名写真实结束时间且重试稳定，历史名单/补签/返还/统计一致，未来移出，越权与伪造日期拒绝');
  const cancelledStudent=await student('取消学员');
  const cancelEnrollment=await db.enrollment.create({data:{organizationId:org.id,studentId:cancelledStudent.id,classId:ec.id,enrolledAt:new Date(+past-86400000)}});
  const cancellation=await request('PUT','/enrollments/'+cancelEnrollment.id,at,{status:'cancelled'});assert.ok(cancellation.endedAt);
  const legacy=await db.enrollment.create({data:{organizationId:org.id,studentId:cancelledStudent.id,classId:ec.id,status:'completed',enrolledAt:past,endedAt:null}});
  const legacyRetry=await request('PUT','/enrollments/'+legacy.id,at,{status:'completed'});assert.equal(legacyRetry.endedAt,null);
  const invalid=await db.enrollment.create({data:{organizationId:org.id,studentId:cancelledStudent.id,classId:ec.id,enrolledAt:new Date(Date.now()+7*86400000)}});
  await request('PUT','/enrollments/'+invalid.id,at,{status:'cancelled'},409);
  assert.equal((await db.enrollment.findUniqueOrThrow({where:{id:invalid.id}})).status,'active');
  check('取消报名有结束时间；历史未知日期不猜补；未来入班不能写出反向区间');
  const racedStudent=await student('并发结束学员'),dest=await klass(teacher3);
  const racedEnrollment=await db.enrollment.create({data:{organizationId:org.id,studentId:racedStudent.id,classId:ec.id,enrolledAt:past}});
  const raceResponses=await Promise.all([
    ['PUT','/enrollments/'+racedEnrollment.id,{status:'cancelled'}],
    ['POST','/enrollments/transfer',{studentId:racedStudent.id,fromEnrollmentId:racedEnrollment.id,fromClassId:ec.id,toClassId:dest.id}]
  ].map(async([method,route,body])=>{const r=await fetch(`http://127.0.0.1:${port}/api${route}`,{method,headers:{'content-type':'application/json',authorization:'Bearer '+at},body:JSON.stringify(body)});return {status:r.status,json:await r.json()};}));
  assert.equal(raceResponses.filter(r=>r.status===200).length,1);
  assert.ok(raceResponses.every(r=>[200,404,409].includes(r.status)));
  const racedOld=await db.enrollment.findUniqueOrThrow({where:{id:racedEnrollment.id}});assert.ok(racedOld.endedAt);
  assert.equal(await db.enrollment.count({where:{studentId:racedStudent.id,status:'active'}}),racedOld.status==='transferred'?1:0);
  check('取消与转班并发只能一条成功，无双重结束或幽灵报名');
  const boundary=await db.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:ec.id,teacherId:teacher3.id,startTime:new Date(new Date(stopped.endedAt).getTime()-60000),endTime:new Date(stopped.endedAt)}});
  assert.ok(!(await request('GET','/schedules/'+boundary.id+'/roster',at)).students.some(s=>s.id===enrollmentStudent.id));
  check('报名结束边界为半开区间，结束瞬间场次不计入');
  const futureStudent=await student('未来考勤保护'),futureEnrollment=await db.enrollment.create({data:{organizationId:org.id,studentId:futureStudent.id,classId:ec.id,enrolledAt:past}});
  await attend(future.id,[{studentId:futureStudent.id,status:'leave'}]);
  const futureBlocked=await request('PUT','/enrollments/'+futureEnrollment.id,at,{status:'completed'},409);assert.equal(futureBlocked.error.code,'ENROLLMENT_HAS_FUTURE_ATTENDANCE');
  assert.equal((await db.enrollment.findUniqueOrThrow({where:{id:futureEnrollment.id}})).endedAt,null);
  check('结束报名遇未来正式考勤明确拒绝，原历史与区间不变');
  for(const via of ['renewal','conversion']){
    const s=await student('转换期间'+via),source=await klass(teacher3),target=await klass(teacher3);
    const old=await db.enrollment.create({data:{organizationId:org.id,studentId:s.id,classId:source.id,enrolledAt:past}});
    if(via==='conversion') {
      const rejected=await request('POST','/conversions',at,{existingStudentId:s.id,studentName:s.name,contact:'13800000000',classId:target.id,courseType:'renewal',totalLessons:0,price:0},409);
      assert.equal(rejected.error.code,'USE_RENEWAL_OR_LESSON_ADD');
      assert.equal((await db.enrollment.findUniqueOrThrow({where:{id:old.id}})).status,'active');
      assert.equal(await db.conversion.count({where:{studentId:s.id}}),0);
      continue;
    }
    await request('POST','/conversions/renewal',at,{requestId:randomUUID(),existingStudentId:s.id,contact:'13800000000',classId:target.id,totalLessons:1,price:0,conversionDate:day(0)},201);
    const closed=await db.enrollment.findUniqueOrThrow({where:{id:old.id}}),opened=await db.enrollment.findFirstOrThrow({where:{studentId:s.id,classId:target.id,status:'active'}});
    assert.equal(closed.status,'completed');assert.ok(closed.endedAt);assert.equal(closed.endedAt.toISOString(),opened.enrolledAt.toISOString());
  }
  check('续费换班期间无缝衔接；普通成单接口拒绝续费且无半成单');

  const creditStudent=await student('增课幂等学员',10),rid=randomUUID();
  const payload={studentId:creditStudent.id,lessons:3,notes:' 测试增课 ',requestId:rid};
  const credited=await request('POST','/lesson-logs/add',at,payload);
  const replays=await Promise.all(Array.from({length:8},()=>request('POST','/lesson-logs/add',at,payload)));
  for(const r of replays)assert.deepEqual(r,credited);
  assert.equal((await db.student.findUniqueOrThrow({where:{id:creditStudent.id}})).remainingLessons,13);
  assert.equal(await db.lessonLog.count({where:{studentId:creditStudent.id,type:'add'}}),1);
  const duplicateError=await request('POST','/lesson-logs/add',at,{...payload,lessons:4},409);assert.equal(duplicateError.error.code,'IDEMPOTENCY_CONFLICT');
  await request('POST','/lesson-logs/add',at,{studentId:creditStudent.id,lessons:3},400);
  await request('POST','/lesson-logs/add',at,{...payload,requestId:'bad'},400);
  await request('POST','/lesson-logs/add',tt,payload,403);
  await request('POST','/lesson-logs/add',ft,payload,403);
  check('增课首次及8并发重放仅一条流水，原响应一致；异参/缺键/非法键/越权拒绝');
  await request('POST','/lesson-logs/add',at,{...payload,requestId:randomUUID()});
  assert.deepEqual(await request('POST','/lesson-logs/add',at,payload),credited);
  assert.equal((await db.student.findUniqueOrThrow({where:{id:creditStudent.id}})).remainingLessons,16);
  const otherStudent=await student('另一机构同键',4,true);
  await request('POST','/lesson-logs/add',ft,{...payload,studentId:otherStudent.id});
  assert.equal((await db.student.findUniqueOrThrow({where:{id:otherStudent.id}})).remainingLessons,7);
  check('不同合法操作可分别增课；旧键始终返回原结果；相同键跨机构独立');
  const failureKey=randomUUID();
  await request('POST','/lesson-logs/add',at,{...payload,requestId:failureKey,lessons:0},400);
  await request('POST','/lesson-logs/add',at,{...payload,requestId:failureKey,lessons:2});
  assert.equal((await db.student.findUniqueOrThrow({where:{id:creditStudent.id}})).remainingLessons,18);
  check('失败操作不占成功幂等键，修正后同键可执行一次');
  const fresh=await student('首次并发增课',2),freshKey=randomUUID(),freshBody={studentId:fresh.id,requestId:freshKey,lessons:2,notes:'并发'};
  const freshResults=await Promise.all(Array.from({length:8},()=>request('POST','/lesson-logs/add',at,freshBody)));
  for(const result of freshResults)assert.deepEqual(result,freshResults[0]);
  assert.equal((await db.student.findUniqueOrThrow({where:{id:fresh.id}})).remainingLessons,4);
  assert.equal(await db.lessonLog.count({where:{studentId:fresh.id}}),1);
  assert.deepEqual(await request('POST','/lesson-logs/add',at,{...freshBody,requestId:freshKey.toUpperCase(),notes:'  并发  '}),freshResults[0]);
  await request('POST','/lesson-logs/add',at,{...freshBody,studentId:creditStudent.id},409);
  await request('POST','/lesson-logs/add',at,{...freshBody,notes:'其他用途'},409);
  check('首次8并发仅一次写入，键大小写/备注空白归一，换学生或备注拒绝');
  const atomic=await student('写回执失败回滚',6),atomicKey=randomUUID();
  await db.$executeRawUnsafe(`CREATE FUNCTION core_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."requestId" = '${atomicKey}' THEN RAISE EXCEPTION 'core injected failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER core_fail_receipt BEFORE INSERT ON lesson_add_requests FOR EACH ROW EXECUTE FUNCTION core_fail_receipt()');
  await request('POST','/lesson-logs/add',at,{studentId:atomic.id,requestId:atomicKey,lessons:2,notes:'回执故障回滚验收'},500);
  assert.equal((await db.student.findUniqueOrThrow({where:{id:atomic.id}})).remainingLessons,6);assert.equal(await db.lessonLog.count({where:{studentId:atomic.id}}),0);
  await db.$executeRawUnsafe('DROP TRIGGER core_fail_receipt ON lesson_add_requests');await db.$executeRawUnsafe('DROP FUNCTION core_fail_receipt()');
  await request('POST','/lesson-logs/add',at,{studentId:atomic.id,requestId:atomicKey,lessons:2,notes:'回执故障回滚验收'});
  assert.equal((await db.student.findUniqueOrThrow({where:{id:atomic.id}})).remainingLessons,8);
  check('故障注入：余额更新后回执失败整笔回滚，同键恢复后可成功');
  const last=await student('只余一次',1),lastClass=await klass(teacher3);
  await db.enrollment.create({data:{organizationId:org.id,studentId:last.id,classId:lastClass.id,enrolledAt:new Date(+past-86400000)}});
  const occurrences=[];for(let n=0;n<2;n++)occurrences.push(await db.schedule.create({data:{organizationId:org.id,campusId:campus.id,classId:lastClass.id,teacherId:teacher3.id,startTime:new Date(+past+n*7200000),endTime:new Date(+pastEnd+n*7200000)}}));
  const results=await Promise.all(occurrences.map(async s=>{const r=await fetch(`http://127.0.0.1:${port}/api/attendances/batch`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+at},body:JSON.stringify({scheduleId:s.id,entries:[{studentId:last.id,status:'present'}]})});return r.status;}));
  assert.deepEqual([...results].sort(),[200,409]);assert.equal((await db.student.findUniqueOrThrow({where:{id:last.id}})).remainingLessons,0);assert.equal(await db.lessonLog.count({where:{studentId:last.id,type:'deduct'}}),1);
  check('原签到保护回归：两场并发最后一次只一笔成功，不透支');
  const healthy=await student('批量回滚正常',5),empty=await student('批量回滚不足',0);
  for(const s of [healthy,empty])await db.enrollment.create({data:{organizationId:org.id,studentId:s.id,classId:lastClass.id,enrolledAt:new Date(+past-86400000)}});
  const unposted=occurrences[results[0]===409?0:1];
  await attend(unposted.id,[{studentId:healthy.id,status:'present'},{studentId:empty.id,status:'present'}],at,409);
  assert.equal((await db.student.findUniqueOrThrow({where:{id:healthy.id}})).remainingLessons,5);assert.equal(await db.attendance.count({where:{studentId:{in:[healthy.id,empty.id]}}}),0);
  check('原签到保护回归：余额不足整批回滚，不留半条考勤或流水');
  const typeA = await request('POST','/courses',at,{name:'篮球基础'},201);
  const typeB = await request('POST','/courses',at,{name:'篮球进阶'},201);
  const alienType = await request('POST','/courses',ft,{name:'外部课程'},201);
  assert.ok(typeA.id && typeB.id && alienType.id);
  await request('POST','/courses',tt,{name:'越权课程'},403);
  await request('POST','/courses',at,{name:'篮球基础'},400);
  await request('POST','/courses',at,{name:'越权',organizationId:otherOrg.id},403);
  await request('PUT','/courses/'+typeA.id,ft,{name:'越权改名'},403);
  const updatedType=await request('PUT','/courses/'+typeA.id,at,{name:'基础篮球'});assert.equal(updatedType.name,'基础篮球');
  check('课程类型可创建及改名，重复名称和跨机构操作被拒');
  assert.equal((await request('GET','/courses?capability=schedule_course_selection',at)).scheduleCourseSelection,true);
  for(const [courseId,status] of [['',400],['missing-course',404],[alienType.id,403]]) await request('POST','/schedules',at,{...slot(c1.id,day(35),'09:00','10:00','课程馆'),courseId},status);
  const typedPayload={...slot(c1.id,day(35),'09:00','10:00','课程馆'),courseId:typeA.id,teacherId:teacher.id};
  const typed=await create(typedPayload);assert.equal((await db.schedule.findUniqueOrThrow({where:{id:typed.id}})).courseId,typeA.id);
  assert.equal((await request('POST','/schedules',at,typedPayload,200)).id,typed.id);
  await conflict('POST','/schedules',{...typedPayload,courseId:typeB.id});
  const typedList=await request('GET','/schedules?startDate='+day(35)+'&endDate='+day(35),at);assert.equal(typedList.find(s=>s.id===typed.id).course?.id,typeA.id);
  const replacement=await request('POST','/schedules/'+typed.id+'/reschedule',at,{newStartTime:slot(c1.id,day(36),'09:00','10:00').startTime,newEndTime:slot(c1.id,day(36),'09:00','10:00').endTime},201);
  assert.equal((await db.schedule.findUniqueOrThrow({where:{id:replacement.id}})).courseId,typeA.id);
  check('单次排课真实保存课程及老师；非法/跨机构课程拒绝；重试与不同课程冲突、调课保留');
  const weeklyStart=day(40),weeklyEnd=day(54),weekday=(new Date(weeklyStart+'T00:00:00+08:00').getUTCDay()+1)%7;
  const recurringTyped={classId:c3.id,courseId:typeB.id,teacherId:teacher2.id,recurrenceType:'weekly',startDate:weeklyStart,endDate:weeklyEnd,weekDays:[weekday],startTime:'14:00',endTime:'15:30',location:'每周训练馆'};
  const typedBatch=await request('POST','/schedules/recurring',at,recurringTyped,201);
  const actualWeekday=new Date(weeklyStart+'T00:00:00+08:00').getUTCDay();
  assert.ok(typedBatch.count>=2);assert.ok(typedBatch.schedules.every(s=>s.courseId===typeB.id && s.teacherId===teacher2.id));
  const typedRows=await db.schedule.findMany({where:{classId:c3.id,courseId:typeB.id}});assert.equal(typedRows.length,typedBatch.count);
  assert.ok(typedRows.every(s=>new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',weekday:'short'}).format(s.startTime)===['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][weekday]));
  assert.ok(typedRows.every(s=>+s.endTime-+s.startTime===90*60000));
  await request('PUT','/courses/'+typeB.id,at,{isActive:false});
  await request('POST','/schedules/recurring',at,{...recurringTyped,startDate:day(60),endDate:day(75)},400);
  assert.equal((await db.schedule.findUniqueOrThrow({where:{id:typedRows[0].id}})).courseId,typeB.id);
  check('指定日期范围每周按所选星期与时长生成，停用课程不抹历史且阻止新排');
  if (process.env.CORE_TEST_BROWSER === '1') {
    const frontend=path.resolve(backend,'../frontend');
    const {pathToFileURL}=require('node:url');
    const viteModule=await import(pathToFileURL(require.resolve('vite',{paths:[frontend]})).href);
    const vite=viteModule.createServer ? viteModule : viteModule.default;
    const reactModule=await import(pathToFileURL(require.resolve('@vitejs/plugin-react',{paths:[frontend]})).href);
    const react=typeof reactModule.default === 'function' ? reactModule.default : reactModule.default.default;
    const {chromium,expect}=require(require.resolve('@playwright/test',{paths:[frontend]}));
    assert.ok(uiPort && ![3000,5173].includes(uiPort));
    const ui=await vite.createServer({root:frontend,cacheDir:path.join(scratch,'vite-cache'),configFile:false,envFile:false,plugins:[react()],define:{'import.meta.env.VITE_API_BASE':JSON.stringify('/api')},server:{host:'127.0.0.1',port:uiPort,strictPort:true,hmr:false,proxy:{'/api':`http://127.0.0.1:${port}`}},logLevel:'error'});
    let browser;
    try {
      await ui.listen();browser=await chromium.launch({channel:'chrome',headless:true});
      const context=await browser.newContext({serviceWorkers:'block',timezoneId:'Asia/Shanghai',viewport:{width:1440,height:1000}});
      const base=`http://127.0.0.1:${uiPort}`;
      await context.addInitScript(state=>localStorage.setItem('auth-storage',JSON.stringify({state,version:0})),{user:{id:admin.id,name:admin.name,email:admin.email,role:'admin',organizationId:org.id,campusId:campus.id},token:at,isAuthenticated:true,_hasHydrated:true});
      const unexpected=[];
      await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():(unexpected.push(route.request().url()),route.abort()));
      const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(base+'/classes',{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'课程类型设置',exact:true}).click();
      const settings=page.getByRole('dialog',{name:'课程类型设置',exact:true});await expect(settings).toBeVisible();
      await settings.getByRole('button',{name:'新建课程类型'}).click();
      const createType=page.getByRole('dialog',{name:'新建课程类型'});await createType.getByLabel('课程类型名称').fill('浏览器实测课程');
      await createType.getByRole('button',{name:/保\s*存/}).click();await expect(createType).not.toBeVisible();
      const savedType=await db.course.findFirstOrThrow({where:{organizationId:org.id,name:'浏览器实测课程'}});
      console.log('UI: created course type in isolated database');
      await settings.getByRole('button',{name:'Close'}).click();await expect(settings).not.toBeVisible();
      const classRow=page.getByRole('row').filter({hasText:lastClass.name});
      await classRow.getByRole('button',{name:/编辑/}).click();
      const classEditor=page.getByRole('dialog',{name:'编辑班级',exact:true});
      await classEditor.locator('.ant-select').filter({has:page.locator('#courseType')}).locator('.ant-select-selector').click();
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(savedType.name,{exact:true}).click();
      await classEditor.getByRole('button',{name:/^确\s*定$/}).click();await expect(classEditor).not.toBeVisible();
      assert.equal((await db.class.findUniqueOrThrow({where:{id:lastClass.id}})).courseType,savedType.name);
      await page.goto(base+'/operation/weekly-schedule',{waitUntil:'networkidle'});
      await page.getByRole('button',{name:'新增排课',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'新增排课'});await expect(dialog).toBeVisible();
      await expect(dialog.locator('#courseId')).toHaveCount(0);
      await expect(dialog.getByRole('button',{name:'课程类型设置',exact:true})).toHaveCount(0);
      const choose=async(field,name)=>{await dialog.locator('.ant-select').filter({has:page.locator('#'+field)}).locator('.ant-select-selector').click();const option=page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(name,{exact:true});await option.waitFor({state:'attached'});await option.evaluate(el=>el.click());};
      await choose('classId',lastClass.name);await choose('teacherId',teacher2.name);
      console.log('UI: selected class and substitute teacher; course inherited from class');
      await dialog.getByLabel('每周重复',{exact:true}).check();
      const fillRange=async(id,start,end)=>{const inputs=dialog.locator('.ant-picker').filter({has:page.locator('#'+id)}).locator('input');await inputs.nth(0).fill(start);await inputs.nth(0).press('Enter');await inputs.nth(1).fill(end);await inputs.nth(1).press('Enter');await dialog.getByLabel('教室').click();};
      await fillRange('dateRange','2027-03-03','2027-03-17');await dialog.getByLabel('周三',{exact:true}).focus();await dialog.getByLabel('周三',{exact:true}).press('Space');await expect(dialog.getByLabel('周三',{exact:true})).toBeChecked();await fillRange('lessonTime','18:00','19:30');await dialog.getByLabel('教室').fill('浏览器隔离馆');
      console.log('UI: entered recurring schedule');
      const saved=page.waitForResponse(r=>r.url().endsWith('/api/schedules/recurring')&&r.request().method()==='POST');
      await dialog.getByRole('button',{name:/^确\s*定$/}).click();const response=await saved;assert.equal(response.status(),201,JSON.stringify(await response.json()));assert.equal(Object.hasOwn(response.request().postDataJSON(),'courseId'),false);await expect(dialog).not.toBeVisible();
      const persisted=await db.schedule.findMany({where:{classId:lastClass.id,courseId:savedType.id},orderBy:{startTime:'asc'}});
      assert.equal(persisted.length,3);assert.ok(persisted.every(s=>s.teacherId===teacher2.id && s.classroom==='浏览器隔离馆' && +s.endTime-+s.startTime===90*60000));
      assert.deepEqual(persisted.map(s=>s.startTime.toISOString()),['2027-03-03T10:00:00.000Z','2027-03-10T10:00:00.000Z','2027-03-17T10:00:00.000Z']);
      assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);await context.close();
      check('真实浏览器→隔离HTTP→数据库：班级页设类型，排课沿用并生成三次周三课，老师、日期、场地与时段全部对上');
    } finally { await browser?.close();ui.httpServer?.closeAllConnections?.();await Promise.race([ui.close(),pause(3000)]); }
  }
  assert.deepEqual(await db.student.findUnique({where:{id:sentinel.id}}),sentinel);
  assert.deepEqual(await db.lessonLog.findUnique({where:{id:sentinelLog.id}}),sentinelLog);
  check('整轮回归后未参与操作的历史样本逐字段不变');
}

async function cleanup() {
  if(server && server.exitCode===null && server.signalCode===null){
    const exited=new Promise(r=>server.once('exit',r));
    server.kill('SIGTERM');await Promise.race([exited,pause(3000)]);
    if(server.exitCode===null && server.signalCode===null){server.kill('SIGKILL');await exited;}
  }
  await db.$disconnect();
  if(created){run('dropdb',[database]);created=false;}
  fs.rmSync(scratch,{recursive:true,force:true});cleanupComplete=true;
}
(async()=>{
  let failure;
  try{await main();}catch(e){failure=e;console.error(e.stack || String(e));}
  try{await cleanup();}catch(e){failure ||= e;console.error('Cleanup failed:',e.message);}
  const output=process.env.CORE_TEST_OUTPUT_DIR ? path.resolve(process.env.CORE_TEST_OUTPUT_DIR) : path.join(backend,'../docs/acceptance/2026-11-06-core-hardening');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'core-http.json'),JSON.stringify({passed:!failure,checkCount:checks.length,checks,database,serverPort:port,cleanupComplete,businessDatabaseUsed:false,businessEnvironmentLoaded:false,realModelRequests:0,failure:failure?.message},null,2)+'\n');
  if(!failure)console.log(`PASS ${checks.length} groups; isolated server/database removed`);
  process.exit(failure?1:0);
})();
