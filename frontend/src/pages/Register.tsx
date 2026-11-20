import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CheckCircle2,
  ClipboardCheck, Layers3, LoaderCircle, Phone, ReceiptText, RotateCcw,
  ShieldCheck, UserRound, UsersRound,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { authService } from '../services/authService';
import BrandMark from '../components/BrandMark';
import { normalizePhone, isValidPhone } from '../utils/phone';
import './login.css';
import './Register.css';

const tasks = ['回访新学员', '确认上课安排', '跟进续费意向'];
const roster = [
  { Icon: UsersRound, name: '学员档案', detail: '报名与联系方式，一处管理' },
  { Icon: ReceiptText, name: '课时余额', detail: '购课、赠课分别记录' },
  { Icon: RotateCcw, name: '续费跟进', detail: '及时关注学员剩余课时' },
];

function WorkPreview() {
  const [checked, setChecked] = useState([true, false, false]);
  return <aside className="apply-preview apply-preview-left" aria-label="课务与待办功能示意">
    <section className="apply-mini-panel apply-calendar" aria-labelledby="apply-calendar-title">
      <div className="apply-mini-head"><h2 id="apply-calendar-title"><CalendarDays size={18} />课表更清楚</h2><span>每周排课</span></div>
      <div className="apply-week-grid" aria-label="周课表示意">
        {['周一', '周三', '周五'].map(day => <span className="apply-week-day" key={day}>{day}</span>)}
        <span className="apply-course">阅读表达</span><span className="apply-slot" /><span className="apply-course apply-course-soft">美术启蒙</span>
        <span className="apply-slot" /><span className="apply-course apply-course-soft">阅读表达</span><span className="apply-slot" />
        <span className="apply-course apply-course-soft">美术启蒙</span><span className="apply-slot" /><span className="apply-course">阅读表达</span>
      </div>
      <div className="apply-mini-note"><CheckCircle2 size={15} />班级、老师与时间，一眼看清。</div>
    </section>
    <section className="apply-mini-panel apply-tasks" aria-labelledby="apply-tasks-title">
      <div className="apply-mini-head"><h2 id="apply-tasks-title"><ClipboardCheck size={18} />每天少漏一件事</h2><span>点选体验</span></div>
      <div className="apply-demo-tasks">
        {tasks.map((task, index) => <label key={task} className={checked[index] ? 'is-checked' : ''}>
          <input type="checkbox" checked={checked[index]} aria-label={`体验待办：${task}`} onChange={() => setChecked(previous => previous.map((value, i) => i === index ? !value : value))} />
          <span className="apply-demo-check" aria-hidden="true"><Check size={14} strokeWidth={2} /></span><span>{task}</span>
        </label>)}
      </div>
      <div className="apply-task-progress"><span>示意待办</span><span aria-live="polite">已完成 {checked.filter(Boolean).length} / 3</span></div>
    </section>
  </aside>;
}

function DataPreview() {
  return <aside className="apply-preview apply-preview-right" aria-label="学员与课时功能示意">
    <section className="apply-mini-panel apply-roster" aria-labelledby="apply-roster-title">
      <div className="apply-mini-head"><h2 id="apply-roster-title"><UsersRound size={18} />学员有序管理</h2><span>一处查看</span></div>
      <div className="apply-roster-list">{roster.map(({ Icon, name, detail }) => <div key={name}><span className="apply-roster-icon"><Icon size={19} strokeWidth={1.8} /></span><div><h3>{name}</h3><p>{detail}</p></div><Check size={15} className="apply-roster-check" /></div>)}</div>
    </section>
    <section className="apply-mini-panel apply-flow" aria-labelledby="apply-flow-title">
      <div className="apply-mini-head"><h2 id="apply-flow-title"><Layers3 size={18} />记录自然联动</h2></div>
      <div className="apply-flow-steps">
        {[
          { Icon: ClipboardCheck, title: '签到划课' },
          { Icon: RotateCcw, title: '课时更新' },
          { Icon: ReceiptText, title: '记录留存' },
        ].map(({ Icon, title }) => <div key={title}><span><Icon size={20} strokeWidth={1.8} /></span><b>{title}</b></div>)}
      </div>
      <p className="apply-flow-copy">少一些重复登记，<br />多一些清楚、准确的记录。</p>
    </section>
  </aside>;
}

export default function Register() {
  const [fields, setFields] = useState({ organizationName: '', contactName: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const active = useRef(true);
  const organizationInput = useRef<HTMLInputElement>(null);
  const contactInput = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (submitted) successHeading.current?.focus(); }, [submitted]);

  const change = (key: keyof typeof fields, value: string) => {
    setFields(previous => ({ ...previous, [key]: value }));
    if (notice) setNotice('');
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current) return;
    const data = new FormData(event.currentTarget);
    const values = {
      organizationName: String(data.get('organizationName') || '').trim(),
      contactName: String(data.get('contactName') || '').trim(),
      phone: normalizePhone(String(data.get('phone') || '')),
    };
    if (!values.organizationName) { setNotice('请填写机构名称'); organizationInput.current?.focus(); return; }
    if (!values.contactName) { setNotice('请填写联系人姓名'); contactInput.current?.focus(); return; }
    if (!isValidPhone(values.phone)) { setNotice('请填写有效的手机号'); phoneInput.current?.focus(); return; }
    busy.current = true; setLoading(true); setNotice('');
    try {
      const response = await authService.apply(values);
      if (!response.success) throw new Error(response.message || '申请提交失败');
      if (active.current) setSubmitted(true);
    } catch (error) {
      const detail = isAxiosError(error) ? error.response?.data?.message || error.response?.data?.error?.message || error.response?.data?.error : null;
      if (active.current) setNotice(typeof detail === 'string' ? detail : error instanceof Error ? error.message : '申请提交失败，请稍后重试');
    } finally {
      busy.current = false;
      if (active.current) setLoading(false);
    }
  };

  return <div className="bz-login bz-apply"><div className="page apply-page">
    <header className="masthead apply-masthead"><Link className="brand" to="/login" aria-label="蜂鸣课务登录页"><BrandMark /><span>蜂鸣课务</span></Link><Link className="apply-back" to="/login"><ArrowLeft size={16} /><span>已有账号，去登录</span></Link></header>
    <main className="apply-main">
      <div className="apply-stage">
        <div className="apply-connectors" aria-hidden="true"><i /><i /><i /><i /></div>
        <WorkPreview />
        <div className="apply-center">
          <div className="apply-intro"><span className="apply-eyebrow"><ShieldCheck size={16} />基础课务，免费开通</span><h1>把课务理顺，<span>从这里开始。</span></h1><p>学员、排课、签到与跟进，一个工作台就够。</p></div>
          <section className={`apply-form-card${submitted ? ' is-submitted' : ''}`} aria-labelledby={submitted ? 'apply-success-title' : 'apply-form-title'}>
            {submitted ? <div className="apply-success">
              <span className="apply-success-mark"><CheckCircle2 size={36} strokeWidth={1.5} /></span>
              <h2 id="apply-success-title" ref={successHeading} tabIndex={-1}>申请已收到</h2>
              <p>我们会联系你，核实机构信息后，<br />为你开通专属课务工作台。</p>
              <ol className="apply-next-steps"><li className="is-complete"><span><Check size={14} /></span><div><b>提交申请</b><small>已完成</small></div></li><li><span /><div><b>平台联系</b><small>等待核实机构信息</small></div></li><li><span /><div><b>账号开通</b><small>审核通过后交付登录信息</small></div></li></ol>
              <Link className="apply-return" to="/login">返回登录<ArrowRight size={17} /></Link>
            </div> : <>
              <div className="apply-form-heading"><h2 id="apply-form-title">申请你的课务工作台</h2><span><Building2 size={16} />机构开通</span></div>
              <form onSubmit={submit} aria-busy={loading} noValidate>
                <div className="apply-fields">
                  <label className="apply-field"><span>机构名称</span><span className="apply-input"><Building2 size={18} /><input ref={organizationInput} name="organizationName" aria-label="机构名称" placeholder="例如：向阳艺术中心" required maxLength={120} autoComplete="organization" value={fields.organizationName} onChange={e => change('organizationName', e.target.value)} disabled={loading} /></span></label>
                  <label className="apply-field"><span>联系人</span><span className="apply-input"><UserRound size={18} /><input ref={contactInput} name="contactName" aria-label="联系人" placeholder="怎么称呼你" required maxLength={120} autoComplete="name" value={fields.contactName} onChange={e => change('contactName', e.target.value)} disabled={loading} /></span></label>
                  <label className="apply-field"><span>联系手机号</span><span className="apply-input"><Phone size={18} /><input ref={phoneInput} name="phone" aria-label="联系手机号" placeholder="用于联系与管理员登录" required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={fields.phone} onChange={e => change('phone', e.target.value)} disabled={loading} /></span></label>
                </div>
                <button className="apply-submit" type="submit" disabled={loading}>{loading ? '正在提交…' : '免费申请开通'}{loading ? <LoaderCircle size={18} className="apply-spinner" /> : <ArrowRight size={18} />}</button>
                <p className="apply-notice" role="alert" aria-live="polite">{notice}</p>
                <p className="apply-form-note"><ShieldCheck size={15} />提交后平台联系开通，无需填写密码。</p>
              </form>
            </>}
          </section>
          <div className="apply-mobile-benefits"><span><CalendarDays size={16} />排课更清楚</span><span><UsersRound size={16} />学员有序管理</span><span><ClipboardCheck size={16} />跟进不遗漏</span></div>
        </div>
        <DataPreview />
      </div>
    </main>
    <footer className="apply-footer"><span>让日常课务有条不紊，把更多时间留给好课。</span><span>周边面板为功能示意</span></footer>
  </div></div>;
}
