import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Space, Tag, message } from 'antd';
import api from '../services/api';
import RefundPayout from './RefundPayout';
import { useAuthStore } from '../store/authStore';

export default function StudentRefunds({ studentId, onChanged }: {studentId:string;onChanged:()=>void}) {
  const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [form]=Form.useForm();const request=useRef<{id:string;body:any}|null>(null);
  const user=useAuthStore(s=>s.user);
  const storageKey='refund-draft:'+user?.id+':'+studentId;
  const load=async()=>{try{const r=await api.get('/refunds',{params:{studentId}});setRows(r.data||[]);setError('');}catch{setError('退费记录加载失败，请重试');}};
  useEffect(()=>{setRows([]);setOpen(false);request.current=null;try{const saved=sessionStorage.getItem(storageKey);if(saved)request.current=JSON.parse(saved);}catch{}void load();},[studentId,storageKey]);
  const submit=async()=>{
    if(busy)return;setBusy(true);
    try{
      if(!request.current){const body=await form.validateFields();request.current={id:crypto.randomUUID(),body:{...body,studentId}};sessionStorage.setItem(storageKey,JSON.stringify(request.current));}
      await api.post('/refunds',{...request.current.body,requestId:request.current.id});
      sessionStorage.removeItem(storageKey);request.current=null;setOpen(false);form.resetFields();message.success('退费申请已提交');await load();
    }catch(e:any){message.error(e.response?.data?.message||'提交未确认，可点击重试；请求编号保持不变');}finally{setBusy(false);}
  };
  const review=async(id:string,status:string)=>{
    if(busy)return;setBusy(true);try{await api.post(`/refunds/${id}/review`,{status,...(status==='rejected'?{rejectReason:'审核未通过'}:{})});message.success('审批已记录');await load();onChanged();}catch(e:any){message.error(e.response?.data?.message||'审批未确认，可重试');}finally{setBusy(false);}
  };
  return <section className="student-profile__section">
    <Space><h3>退费申请</h3><Button size="small" onClick={()=>{form.resetFields();if(request.current)form.setFieldsValue(request.current.body);setOpen(true);}}>申请退费</Button><Button size="small" onClick={()=>void load()}>刷新</Button></Space>
    {error&&<Alert type="error" message={error}/>}
    {rows.map(row=><div key={row.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
      <Space wrap><strong>¥{row.amountToRefund}</strong><span>{row.lessonsToRefund} 节</span><Tag>{({pending:'待审批',approved:'已审批',rejected:'已驳回'} as any)[row.status]||row.status}</Tag></Space>
      <p>{row.reason}</p>
      <RefundPayout refund={row} onChanged={() => { void load(); onChanged(); }} />
      {row.status==='pending'&&['admin','manager'].includes(user?.role||'')&&row.submittedById!==user?.id&&<Space><Button size="small" loading={busy} onClick={()=>Modal.confirm({title:'确认批准退费？',content:'批准后扣减课时并占用已收款可退余额；请按机构流程办理实际退款。',onOk:()=>review(row.id,'approved')})}>批准</Button><Button size="small" disabled={busy} onClick={()=>review(row.id,'rejected')}>驳回</Button></Space>}
    </div>)}
    <Modal title="申请退费" open={open} confirmLoading={busy} onOk={submit} onCancel={()=>{if(!busy)setOpen(false);}} okText={request.current?'重试提交':'提交申请'}>
      <Alert type="info" message="审批后扣减课时；实际退款须按机构支付流程办理。" style={{marginBottom:16}}/>
      <Form form={form} layout="vertical" disabled={busy||!!request.current}>
        <Form.Item name="amountToRefund" label="退费金额（元）" rules={[{required:true}]}><InputNumber min={0.01} max={99999999.99} precision={2}/></Form.Item>
        <Form.Item name="lessonsToRefund" label="退回课时" initialValue={0} rules={[{required:true}]}><InputNumber min={0} precision={0}/></Form.Item>
        <Form.Item name="reason" label="退费原因" rules={[{required:true,whitespace:true}]}><Input.TextArea maxLength={2000}/></Form.Item>
      </Form>
    </Modal>
  </section>;
}
