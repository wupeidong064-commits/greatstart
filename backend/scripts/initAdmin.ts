// Run once from the server CLI. Never create a default login or promote an existing customer.
import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma=new PrismaClient();
async function main() {
  const email=process.env.BOOTSTRAP_PLATFORM_EMAIL?.trim().toLowerCase(), password=process.env.BOOTSTRAP_PLATFORM_PASSWORD;
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length<16 || Buffer.byteLength(password)>72) throw Error('请以独立环境变量提供平台邮箱和至少16位随机密码');
  const hash=await bcrypt.hash(password,12);
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('buzzer-platform-bootstrap'))`;
    if(await tx.user.count({where:{isPlatformAdmin:true}})) throw Error('已有平台账号；不会自动提升或覆盖任何账号');
    if(await tx.user.findUnique({where:{email}}))throw Error('邮箱已被占用');
    await tx.user.create({data:{email,password:hash,name:'平台运营',role:'admin',isActive:true,isPlatformAdmin:true}});
  });
  console.log('首个平台运营账号已建立。请移除引导用的环境变量。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
