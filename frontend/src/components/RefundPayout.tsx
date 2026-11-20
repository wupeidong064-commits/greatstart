import { useRef, useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, message } from 'antd';
import dayjs from 'dayjs';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function RefundPayout({refund,onChanged}:{refund:any;onChanged:()=>void}) {
  const user=useAuthStore(s=>s.user),key=`refund-payout-draft:${user?.id}:${refund.id}`;
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);const [form]=Form.useForm();const pending=useRef<any>(null);
  const begin=()=>{pending.current=null;try{const saved=sessionStorage.getItem(key);if(saved)pending.current=JSON.parse(saved);}catch{}form.resetFields();form.setFieldsValue(pending.current?{...pending.current,paidAt:dayjs(pending.current.paidAt)}:{amount:Number(refund.amountToRefund),paymentMethod:'transfer',paidAt:dayjs()});setOpen(true);};
  const submit=async()=>{if(busy)return;setBusy(true);try{if(!pending.current){const v=await form.validateFields();pending.current={...v,paidAt:v.paidAt.toISOString(),requestId:crypto.randomUUID()};sessionStorage.setItem(key,JSON.stringify(pending.current));}await api.post(`/refunds/${refund.id}/payout`,pending.current);sessionStorage.removeItem(key);pending.current=null;setOpen(false);message.success('线下退款凭据已登记');onChanged();}catch(e:any){message.error(e.response?.data?.message||'登记结果未确认，可重试原请求');}finally{setBusy(false);}};
  if(refund.payout)return <Alert type="success" style={{marginTop:8}} message={`已登记线下出款 ¥${refund.payout.amount} · ${dayjs(refund.payout.paidAt).format('YYYY-MM-DD HH:mm')}`} description={<><div>凭据：{refund.payout.proofReference}；收款人：{refund.payout.recipientName}</div><div>登记人：{refund.payout.recordedByName}；登记时间：{dayjs(refund.payout.createdAt).format('YYYY-MM-DD HH:mm')}</div></>}/>;
  if(refund.status!=='approved'||!['admin','manager'].includes(user?.role||''))return null;
  return <><Button size="small" onClick={begin}>登记线下退款付款</Button><Modal title="登记已完成的线下退款" open={open} onOk={submit} onCancel={()=>{if(!busy)setOpen(false);}} confirmLoading={busy} okText={pending.current?'重试登记':'确认凭据登记'}>
    <Alert type="warning" message="请先在线下完成付款，再登记真实付款凭据。此操作不会发起转账；登记后不可改删，同一申请仅支持全额一次登记。" style={{marginBottom:16}}/>
    <Form form={form} layout="vertical" disabled={busy||!!pending.current}>
      <Form.Item name="amount" label="实付金额（应与批准金额一致）" rules={[{required:true}]}><InputNumber precision={2} min={0.01}/></Form.Item>
      <Form.Item name="paymentMethod" label="付款方式" rules={[{required:true}]}><Select options={[{value:'cash',label:'现金'},{value:'card',label:'银行卡'},{value:'transfer',label:'转账'},{value:'alipay',label:'支付宝'},{value:'wechat',label:'微信'}]}/></Form.Item>
      <Form.Item name="paidAt" label="实际付款时间" rules={[{required:true}]}><DatePicker showTime/></Form.Item>
      <Form.Item name="proofReference" label="交易流水号 / 签收凭据编号" rules={[{required:true,min:4,whitespace:true}]}><Input maxLength={200}/></Form.Item>
      <Form.Item name="recipientName" label="实际收款人" rules={[{required:true,whitespace:true}]}><Input maxLength={100}/></Form.Item>
    </Form>
  </Modal></>;
}
