import {describe,it,expect,vi,beforeEach} from 'vitest';
const {db}=vi.hoisted(()=>({db:{class:{findMany:vi.fn()},conversion:{findMany:vi.fn()}}}));
vi.mock('../src/config/database',()=>({default:db}));
import {buildOrgSnapshot,invalidateSnapshotCache} from '../src/services/aiService';
import {orderScope} from '../src/services/cashflowSummaryService';
beforeEach(()=>{vi.clearAllMocks();invalidateSnapshotCache();});
describe('概览成单使用成单表归属，不依赖是否分班',()=>{
 it('无班级仍统计本机构未分班订单并保持机构过滤',async()=>{
  db.class.findMany.mockResolvedValue([]);
  db.conversion.findMany.mockResolvedValue([{courseType:'新签',price:'2400'},{courseType:'续费',price:'1800'}]);
  const result=await buildOrgSnapshot('org',{campusId:'scope',force:true});
  expect(result.monthOrderCount).toBe(2);expect(result.monthOrderAmount).toBe(4200);
  expect(result.monthNewOrderCount).toBe(1);expect(result.monthRenewalOrderCount).toBe(1);
  expect(db.conversion.findMany.mock.calls[0][0].where).toMatchObject({...orderScope({organizationId:'org',campusId:'scope'}),approvalStatus:'confirmed'});
 });
 it('班级查询失败不将订单假设为零，刷新查询不复用旧快照',async()=>{
  db.class.findMany.mockRejectedValue(new Error('class unavailable'));
  db.conversion.findMany.mockResolvedValueOnce([{courseType:'新签',price:'2400'}]).mockResolvedValueOnce([{courseType:'新签',price:'2400'},{courseType:'新签',price:'1200'}]);
  const first=await buildOrgSnapshot('org',{campusId:'scope',force:true});
  const second=await buildOrgSnapshot('org',{campusId:'scope',force:true});
  expect(first.monthOrderCount).toBe(1);expect(second.monthOrderCount).toBe(2);expect(second.monthOrderAmount).toBe(3600);
  expect(second.activeClasses).toBeNull();expect(second.errors.length).toBeGreaterThan(0);
 });
});
