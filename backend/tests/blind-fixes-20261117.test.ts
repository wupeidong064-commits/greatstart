import {describe,it,expect,vi} from 'vitest';
import fs from 'fs';import path from 'path';import {randomUUID,createHash} from 'crypto';
vi.mock('../src/config/database',()=>({default:{}}));
import {requireFullRefund} from '../src/services/refundQuote';
import {reportRequest} from '../src/services/operatingReportService';
import {orderMetricIntent} from '../src/services/aiWorkbenchPolicy';
import {verifiedReportFileBuffer,REPORT_FILE_DIR} from '../src/services/reportFileService';
describe('11/17 blind regression rules',()=>{
 it.each([[22,6],[22,0],[22,23]])('refuses partial lesson refund %s / %s',(remaining,lessons)=>{expect(()=>requireFullRefund(remaining,lessons)).toThrow('不允许部分退费')});
 it.each([0,1,22])('allows all remaining lessons %s',n=>expect(()=>requireFullRefund(n,n)).not.toThrow());
 it.each(['生成2026年10月经营分析报告','生成2026年10月月报','请生成2026年10月运营分析报告'])('binds named month %s',q=>expect(reportRequest(q,'2026-11-17')).toMatchObject({kind:'monthly',start:'2026-10-01',end:'2026-10-31'}));
 it.each(['2026年11月16日本校区续费总金额是多少元？','2026年11月16日本校区续费总金额是多少元？请列出每一笔续费的学员、课时和金额。'])('routes the original renewal question stably %s',q=>expect(orderMetricIntent(q,'2026-11-17')?.tools?.[0]).toMatchObject({name:'signup_renewal',params:{startDate:'2026-11-16',endDate:'2026-11-16'}}));
 it('does not silently discard a named person',()=>expect(orderMetricIntent('张三本月续费总金额是多少元？','2026-11-17')).toBeUndefined());
 it('keeps explicitly all confirmed orders independent of the current month',()=>{
   expect(orderMetricIntent('本机构全部有效成单一共多少单？成交总额多少元？','2026-11-17')?.tools).toEqual([{name:'all_confirmed_orders',params:{}}]);
 });
 it('rejects tampered report bytes and foreign paths',()=>{
  fs.mkdirSync(REPORT_FILE_DIR,{recursive:true});const id=randomUUID(),file=path.join(REPORT_FILE_DIR,id+'.xlsx'),bytes=Buffer.from('immutable snapshot');
  fs.writeFileSync(file,bytes);const row={id,filePath:file,fileHash:createHash('sha256').update(bytes).digest('hex')};
  try{expect(verifiedReportFileBuffer(row)).toEqual(bytes);fs.writeFileSync(file,'wrong file');expect(()=>verifiedReportFileBuffer(row)).toThrow('校验失败');expect(()=>verifiedReportFileBuffer({...row,filePath:'/tmp/'+id+'.xlsx'})).toThrow('路径不符');}finally{fs.unlinkSync(file)}
 });
});
