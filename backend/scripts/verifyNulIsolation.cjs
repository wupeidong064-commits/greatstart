'use strict';
// Uses a newly created, uniquely named disposable local database and synthetic records only.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {execFileSync,spawn}=require('node:child_process');const {randomBytes,createHmac}=require('node:crypto');const {PrismaClient}=require('@prisma/client');const jwt=require('jsonwebtoken');const XLSX=require('xlsx');const AdmZip=require('adm-zip');
const mode=process.argv[2]||'after';
const backend=path.resolve(__dirname,'..'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'greatstart-nul-'));
const database='nulcheck_'+randomBytes(8).toString('hex'),username=os.userInfo().username;
const url=`postgresql://${encodeURIComponent(username)}@127.0.0.1:5432/${database}`;
const env={PATH:process.env.PATH,HOME:os.homedir(),TMPDIR:os.tmpdir(),PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:username,DATABASE_URL:url,DATABASE_DIRECT_URL:url,JWT_SECRET:randomBytes(48).toString('hex'),NODE_ENV:'test',AI_PROVIDER:'mock',ENABLE_MCP:'false',ENABLE_SWAGGER:'false',DOTENV_CONFIG_PATH:path.join(scratch,'no-env'),AI_UPLOADS_DIR:path.join(scratch,'uploads'),ARK_API_KEY:'',GLM_API_KEY:''};
const db=new PrismaClient({datasources:{db:{url}}});let server,created=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
async function main(){
 execFileSync('createdb',[database],{cwd:scratch,env,stdio:'pipe'});created=true;
 execFileSync(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),'db','push','--skip-generate','--schema',path.join(backend,'prisma/schema.prisma')],{cwd:scratch,env,stdio:'pipe',timeout:120000});
 const org=await db.organization.create({data:{code:database,name:'隔离机构'}}), campus=await db.campus.create({data:{organizationId:org.id,code:'LOCAL',name:'隔离校区'}});
 const user=await db.user.create({data:{name:'隔离管理员',email:'admin@nul.invalid',password:'test-only-hash',role:'admin',managementLevel:'super',organizationId:org.id,campusId:campus.id}});
 const student=await db.student.create({data:{name:'隔离学员',notes:'保留备注',organizationId:org.id,campusId:campus.id}});
 const token=jwt.sign({userId:user.id,sessionTag:createHmac('sha256',env.JWT_SECRET).update(user.password).digest('base64url')},env.JWT_SECRET,{expiresIn:'10m'});
 const port=await freePort();const startArgs=mode==='before' ? ['/Users/wupeidong/.local/share/greatstart-human-acceptance/20261107T132700-1279cc/backend/dist/index.js'] : ['--import',path.join(backend,'node_modules/tsx/dist/loader.mjs'),path.join(backend,'src/index.ts')];server=spawn(process.execPath,startArgs,{cwd:scratch,env:{...env,PORT:String(port)},stdio:'ignore'});
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok){ready=true;break}}catch{}if(server.exitCode!==null)break;await wait(100)}assert(ready,'isolated server did not start');
 const base=`http://127.0.0.1:${port}/api`,results=[];
 async function send(label,url,options){const r=await fetch(base+url,{...options,headers:{authorization:'Bearer '+token,...options?.headers}});let body=await r.json();results.push({label,status:r.status,code:body.error?.code||null});return {r,body}}
 await send('正常学员搜索','/students?search='+encodeURIComponent('隔离'),{});
 await send('学员搜索含NUL','/students?search='+encodeURIComponent('隔离\0学员'),{});
 await send('班级搜索含NUL','/classes?search='+encodeURIComponent('隔离\0班级'),{});
 await send('学员备注含NUL','/students/'+student.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({notes:'备注\0内容'})});
 await send('班级名称含NUL','/classes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'班级\0名称',courseType:'篮球'})});
 await send('路径含NUL','/students/'+encodeURIComponent('missing\0id'),{});
 await send('嵌套数据含NUL','/ai/report-imports/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mappings:[{column:'异常\0字段'}]})});
 await send('表单含NUL','/students',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'name=abc%00def'});
 let fd=new FormData();fd.append('file',new Blob([Buffer.from('姓名,备注\n小明,内容\0异常\n')],{type:'text/csv'}),'test.csv');await send('AI资料CSV含NUL','/ai/uploads',{method:'POST',body:fd});
 const upload=async(label,name,buffer)=>{const form=new FormData();form.append('file',new Blob([buffer]),name);return send(label,'/ai/uploads',{method:'POST',body:form})};
 await upload('正常CSV','normal.csv',Buffer.from('姓名,备注\n小明,正常\n'));
 const workbook=(value)=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['姓名','备注'],['小明',value]]),'数据');return XLSX.write(book,{type:'buffer',bookType:'xlsx'})};
 await upload('正常XLSX','normal.xlsx',workbook('正常'));
 await upload('XLSX内容含NUL','invalid.xlsx',workbook('异常\0数据'));
 const zip=new AdmZip();zip.addFile('word/document.xml',Buffer.from('<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>正常内容</w:t></w:r></w:p></w:body></w:document>'));
 await upload('正常DOCX','normal.docx',zip.toBuffer());
 const unchanged=await db.student.findUniqueOrThrow({where:{id:student.id}});assert.equal(unchanged.notes,'保留备注');assert.equal(await db.class.count(),0);
 if(mode==='before'){assert(results.some(x=>x.status===500),'baseline did not reproduce 500');}else {for(const x of results){const normal=x.label.startsWith('正常');assert.equal(x.status,normal?200:400,JSON.stringify(x));if(!normal)assert.equal(x.code,'INVALID_NUL_CHARACTER',JSON.stringify(x));}}
 console.log(JSON.stringify({mode,syntheticDatabase:true,existingDataTouched:false,modelCalls:0,results},null,2));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(async()=>{if(server){server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),wait(3000)]);}await db.$disconnect();if(created)try{execFileSync('dropdb',[database],{cwd:scratch,env,stdio:'pipe'});}catch(e){console.error('isolated database cleanup failed:',database);process.exitCode=1;}});
