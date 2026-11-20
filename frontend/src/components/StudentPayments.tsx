import { useEffect, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, message } from 'antd';
import dayjs from 'dayjs';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function StudentPayments({studentId,onChanged}:{studentId:string;onChanged:()=>void}) {
  const user=useAuthStore(s=>s.user);
  const key=`payment-draft:${user?.id}:${studentId}`;
  const [payments,setPayments]=useState<any[]>([]),[enrollments,setEnrollments]=useState<any[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [form]=Form.useForm();const pending=useRef<{requestId:string;[key:string]:any}|null>(null);
  const load=async()=>{try{const [p,e]:any[]=await Promise.all([api.get('/payments',{params:{studentId,pageSize:100}}),api.get('/enrollments',{params:{studentId,pageSize:100}})]);setPayments(p.data||[]);setEnrollments(e.data||[]);setError('');}catch{setError('收款记录或报名信息加载失败，请刷新');}};
  useEffect(()=>{pending.current=null;try{const saved=sessionStorage.getItem(key);if(saved)pending.current=JSON.parse(saved);}catch{}setPayments([]);setEnrollments([]);setOpen(false);void load();},[key,studentId]);
  const submit=async()=>{
    if(busy)return;setBusy(true);
    try{if(!pending.current){const values=await form.validateFields();pending.current={...values,paidAt:values.paidAt.toISOString(),studentId,requestId:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(pending.current));}
      await api.post('/payments',pending.current);sessionStorage.removeItem(key);pending.current=null;setOpen(false);message.success('收款已登记');await load();onChanged();
    }catch(e:any){message.error(e.response?.data?.message||'提交未确认，可重试原请求');}finally{setBusy(false);}
  };
  return <section className="student-profile__section"><Space><h3>收款记录</h3><Button size="small" onClick={()=>{form.resetFields();form.setFieldsValue(pending.current?{...pending.current,paidAt:dayjs(pending.current.paidAt)}:{paymentType:'tuition',paymentMethod:'transfer',paidAt:dayjs()});setOpen(true);}}>登记收款</Button><Button size="small" onClick={()=>void load()}>刷新</Button></Space>
    {error&&<Alert type="error" message={error}/>}
    {payments.map(row=><div key={row.id} style={{padding:'8px 0'}}><strong>¥{row.amount}</strong> · {dayjs(row.paidAt).format('YYYY-MM-DD HH:mm')} · {({cash:'现金',card:'银行卡',transfer:'转账',alipay:'支付宝',wechat:'微信'} as any)[row.paymentMethod]||row.paymentMethod}<div>{row.notes}</div></div>)}
    <Modal title="登记已收到的款项" open={open} onOk={submit} confirmLoading={busy} onCancel={()=>{if(!busy)setOpen(false);}} okText={pending.current?'重试登记':'确认登记'}>
      <Alert type="info" message="仅登记真实已收款，不会自动增加课时。金额入账后不可改删，请核对凭据。" style={{marginBottom:16}}/>
      <Form form={form} layout="vertical" disabled={busy||!!pending.current}>
        <Form.Item name="enrollmentId" label="关联报名" rules={[{required:true}]}><Select options={enrollments.map(e=>({value:e.id,label:`${e.class?.name||'班级报名'} · ${dayjs(e.enrolledAt).format('YYYY-MM-DD')} · ${e.id.slice(0,8)}`}))}/></Form.Item>
        <Form.Item name="amount" label="实收金额（元）" rules={[{required:true}]}><InputNumber min={0.01} max={99999999.99} precision={2}/></Form.Item>
        <Form.Item name="paymentType" label="款项类型" rules={[{required:true}]}><Select options={[{value:'tuition',label:'学费'},{value:'material',label:'材料费'},{value:'other',label:'其他'}]}/></Form.Item>
        <Form.Item name="paymentMethod" label="收款方式" rules={[{required:true}]}><Select options={[{value:'cash',label:'现金'},{value:'card',label:'银行卡'},{value:'transfer',label:'转账'},{value:'alipay',label:'支付宝'},{value:'wechat',label:'微信'}]}/></Form.Item>
        <Form.Item name="paidAt" label="实际收款时间" rules={[{required:true}]}><DatePicker showTime/></Form.Item>
        <Form.Item name="notes" label="收款凭据说明"><Input.TextArea maxLength={2000}/></Form.Item>
      </Form>
    </Modal>
  </section>;
}
