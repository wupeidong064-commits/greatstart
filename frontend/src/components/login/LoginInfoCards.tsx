import { forwardRef, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Bot, CalendarDays, ChartNoAxesCombined, Check, ClipboardCheck,
  FileSpreadsheet, LayoutGrid, MessageCircle, ReceiptText, RotateCcw,
  School, Sparkles, UserRoundPlus, UsersRound, Wallet, X,
} from 'lucide-react';
import './LoginInfoCards.css';

export interface LoginInfoHandle { showHelp: () => void }
type CardId = 'features' | 'ai' | 'start';
const cards: { id: CardId; label: string }[] = [
  { id: 'features', label: '课务功能' },
  { id: 'ai', label: 'AI 助理' },
  { id: 'start', label: '免费开通' },
];
const features = [
  { Icon: UsersRound, label: '学员管理', text: '档案、入班与调班，学员信息一处管理。' },
  { Icon: School, label: '班级管理', text: '老师、名单与常规上课时间，清楚安排。' },
  { Icon: CalendarDays, label: '每周排课', text: '按班级安排课次，周课表一目了然。' },
  { Icon: ClipboardCheck, label: '签到划课', text: '记录出勤，同步课时余额与课消金额。' },
  { Icon: RotateCcw, label: '续费跟进', text: '及时关注剩余课时，跟进学员续费。' },
  { Icon: ChartNoAxesCombined, label: '出勤预警', text: '关注低出勤与连续缺课，及时联系家长。' },
  { Icon: UserRoundPlus, label: '体验课', text: '从邀约、到场到成单，串起每一次跟进。' },
  { Icon: Wallet, label: '现金流', text: '新签、续费与退费，收支变化看得清。' },
  { Icon: ReceiptText, label: '实际课消', text: '按购课批次核算，看到每次划课的实际金额。' },
];
const abilities = [
  { Icon: MessageCircle, label: 'AI 对话', prompt: '帮我找出本周需要跟进的学员。', detail: '直接提问，少翻几张表。' },
  { Icon: ChartNoAxesCombined, label: '经营分析', prompt: '上周经营有哪些变化？重点看什么？', detail: '看懂变化，再决定下一步。' },
  { Icon: FileSpreadsheet, label: '生成文件', prompt: '把低出勤学员整理成 Excel 名单。', detail: '整理好数据，直接下载使用。' },
];
const tools = [
  { name: 'Codex', image: 'codex.svg' },
  { name: 'Claude Code', image: 'claudecode-color.svg' },
  { name: 'ZCode', image: 'zcode.png' },
  { name: '豆包', image: 'doubao-color.svg' },
  { name: 'WorkBuddy', image: 'workbuddy-color.svg' },
];
export const segmentStyle = (count: number, selected: number) => ({ '--count': count, '--selected': selected }) as CSSProperties;

const LoginInfoCards = forwardRef<LoginInfoHandle>(function LoginInfoCards(_, ref) {
  const [card, setCard] = useState<CardId>('features');
  const [featureIndex, setFeatureIndex] = useState(0);
  const [abilityIndex, setAbilityIndex] = useState(0);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const toolDialog = useRef<HTMLDialogElement>(null);
  useImperativeHandle(ref, () => ({ showHelp: () => {
    if (!helpDialog.current?.open) helpDialog.current?.showModal();
  } }), []);
  const ability = abilities[abilityIndex];

  return <section className="login-product" aria-label="了解蜂鸣课务">
    <nav className="login-product-tabs segmented" style={segmentStyle(3, cards.findIndex(item => item.id === card))} aria-label="产品介绍">
      {cards.map(item => <button key={item.id} type="button" aria-pressed={card === item.id} aria-controls={`login-card-${item.id}`} onClick={() => setCard(item.id)}>{item.label}</button>)}
    </nav>
    <div className="login-product-grid">
      <article id="login-card-features" className={`login-product-card login-features${card === 'features' ? ' is-current' : ''}`} aria-labelledby="login-features-title">
        <div className="login-product-heading"><h2 id="login-features-title"><LayoutGrid size={18} />课务，一处安排</h2><span>九项功能</span></div>
        <div className="login-feature-grid" role="group" aria-label="选择课务功能" style={{ '--feature-col': featureIndex % 3, '--feature-row': Math.floor(featureIndex / 3) } as CSSProperties}>
          <span className="login-feature-selection" aria-hidden="true" />
          {features.map(({ Icon, label }, index) => <button type="button" key={label} aria-pressed={featureIndex === index} aria-controls="login-feature-description" onClick={() => setFeatureIndex(index)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></button>)}
        </div>
        <div id="login-feature-description" className="login-feature-description" aria-live="polite" aria-atomic="true"><p key={featureIndex}><span className="login-description-dot" />{features[featureIndex].text}</p></div>
      </article>

      <article id="login-card-ai" className={`login-product-card login-ai${card === 'ai' ? ' is-current' : ''}`} aria-labelledby="login-ai-title">
        <div className="login-ai-heading"><span className="login-bot"><Bot size={30} strokeWidth={1.6} /></span><div><h2 id="login-ai-title">让 AI 帮你处理</h2><p>数据与报表，一句话。</p></div><Sparkles className="login-ai-spark" size={17} strokeWidth={1.5} /></div>
        <div className="login-ai-abilities" role="group" aria-label="选择 AI 能力">
          {abilities.map(({ Icon, label }, index) => <button key={label} type="button" aria-pressed={abilityIndex === index} aria-controls="login-ai-example" onClick={() => setAbilityIndex(index)}><Icon size={15} />{label}</button>)}
        </div>
        <div id="login-ai-example" className="login-ai-example" aria-live="polite" aria-atomic="true"><div key={abilityIndex}><p>{ability.prompt}</p><span><Sparkles size={13} />{ability.detail}</span></div></div>
        <div className="login-tool-heading"><span>AI 工具协作</span><span className="login-api-note">API 筹备中</span></div>
        <div className="login-ai-tools" aria-label="AI 协作工具">
          {tools.map(tool => <button type="button" key={tool.name} title={tool.name} aria-label={`了解 ${tool.name} 协作方式`} onClick={() => { setSelectedTool(tool.name); toolDialog.current?.showModal(); }}><img src={`/brands/${tool.image}`} alt="" width={22} height={22} /></button>)}
        </div>
      </article>

      <article id="login-card-start" className={`login-product-card login-start${card === 'start' ? ' is-current' : ''}`} aria-labelledby="login-start-title">
        <div className="login-product-heading"><h2 id="login-start-title">基础课务</h2><span className="login-free-badge"><Check size={13} />免费使用</span></div>
        <div className="login-free-title">日常课务，<br /><span>免费开始。</span></div>
        <p className="login-free-copy">基础功能免费，AI 按需使用。</p>
        <Link className="login-contact-button" to="/apply">联系开通<ArrowRight size={18} /></Link>
      </article>
    </div>

    <dialog ref={helpDialog} aria-labelledby="login-help-title" className="login-product-dialog">
      <div className="dialog-head"><h2 id="login-help-title">使用帮助</h2><button type="button" className="icon-button" aria-label="关闭使用帮助" onClick={() => helpDialog.current?.close()}><X className="icon" /></button></div>
      <dl className="login-help-list"><dt>还没有机构账号？</dt><dd>提交机构开通申请，平台联系核实后交付管理员账号。老师、销售与家长账号由机构创建。</dd><dt>账号怎么登录？</dt><dd>使用手机号或邮箱与密码登录，各角色进入自己的工作页面。</dd><dt>忘记密码怎么办？</dt><dd>请联系机构管理员重置；机构管理员请联系平台处理。</dd></dl>
      <Link to="/apply" className="login-contact-button" onClick={() => helpDialog.current?.close()}>联系开通<ArrowRight size={18} /></Link>
    </dialog>
    <dialog ref={toolDialog} aria-labelledby="login-tool-title" className="login-product-dialog" onClose={() => setSelectedTool(null)}>
      <div className="dialog-head"><h2 id="login-tool-title">与 {selectedTool} 协作</h2><button type="button" className="icon-button" aria-label="关闭协作说明" onClick={() => toolDialog.current?.close()}><X className="icon" /></button></div>
      <p>管理员可在系统的「数据说明」中复制或下载机构概况，交给 {selectedTool} 参考。</p><p>当前使用资料协作，API 直接接入尚未开放。</p>
    </dialog>
  </section>;
});
export default LoginInfoCards;
