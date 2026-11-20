import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowRight, CircleHelp, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound, X } from 'lucide-react';
import { authService, type AuthResponse } from '../services/authService';
import { useAuthStore } from '../store/authStore';
import { homeForUser } from '../utils/authNavigation';
import BrandMark from '../components/BrandMark';
import LoginInfoCards, { segmentStyle, type LoginInfoHandle } from '../components/login/LoginInfoCards';
import './login.css';
import { normalizePhone, isValidPhone } from '../utils/phone';
import { readLoginPreference, rememberSuccessfulLogin, restoreRememberedPassword, setLoginRememberPreference } from '../utils/loginPreference';

const LoginBackground = lazy(() => import('../components/login/LoginBackground'));
function errorText(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    const text = error.response?.data?.message ?? error.response?.data?.error?.message ?? error.response?.data?.error;
    return typeof text === 'string' ? text : error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [initialLoginPreference] = useState(readLoginPreference);
  const [account, setAccount] = useState(initialLoginPreference.account);
  const [secret, setSecret] = useState('');
  const [rememberLogin, setRememberLogin] = useState(initialLoginPreference.remember);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [pageHidden, setPageHidden] = useState(document.hidden);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const active = useRef(true);
  const loginBusy = useRef(false);
  const info = useRef<LoginInfoHandle>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const accountInput = useRef<HTMLInputElement>(null);
  const secretInput = useRef<HTMLInputElement>(null);
  const loginEdited = useRef(false);

  useEffect(() => {
    if (!initialLoginPreference.remember || !initialLoginPreference.account) return;
    const abort = new AbortController();
    void restoreRememberedPassword(initialLoginPreference.account, abort.signal).then(password => {
      if (!password || abort.signal.aborted || loginEdited.current || loginBusy.current) return;
      // A delayed password-manager result must never replace typing or native autofill.
      if (secretInput.current?.value || accountInput.current?.value !== initialLoginPreference.account) return;
      setSecret(password);
    });
    return () => abort.abort();
  }, [initialLoginPreference]);

  useEffect(() => {
    active.current = true;
    document.body.classList.add('bz-login-active');
    const visibility = () => setPageHidden(document.hidden);
    const keyboard = () => setKeyboardOpen(Boolean(window.visualViewport && innerWidth <= 680 &&
      document.activeElement?.tagName === 'INPUT' && innerHeight - window.visualViewport.height > 120));
    const blur = () => setKeyboardOpen(false);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('focusin', keyboard);
    document.addEventListener('focusout', blur);
    window.visualViewport?.addEventListener('resize', keyboard);
    return () => {
      active.current = false;
      document.body.classList.remove('bz-login-active');
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusin', keyboard);
      document.removeEventListener('focusout', blur);
      window.visualViewport?.removeEventListener('resize', keyboard);
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (forgotOpen && !element.open) element.showModal();
    else if (!forgotOpen && element.open) element.close();
  }, [forgotOpen]);

  const completeLogin = (response: AuthResponse, identity: string, password: string) => {
    if (!response.success || !response.data?.token || !response.data.user) {
      setNotice(response.message || '登录失败，请重试');
      return;
    }
    const { token, user } = response.data;
    rememberSuccessfulLogin(identity, password, rememberLogin, user.name);
    setAuth(token, { ...user, email: user.email || '', phone: user.phone || '' });
    navigate(homeForUser(user), { replace: true });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginBusy.current) return;
    // Read the form values too: some password managers fill without a React change event.
    const fields = new FormData(event.currentTarget);
    const enteredAccount = String(fields.get('username') ?? account);
    const password = String(fields.get('password') ?? secret);
    const identity = enteredAccount.includes('@') ? enteredAccount.trim() : normalizePhone(enteredAccount);
    if (!identity) { setNotice('请输入手机号或邮箱'); accountInput.current?.focus(); return; }
    if (!identity.includes('@')) {
      if (!isValidPhone(identity)) { setNotice('请输入有效的手机号'); accountInput.current?.focus(); return; }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) {
      setNotice('请输入有效的邮箱地址'); accountInput.current?.focus(); return;
    }
    if (!password.trim()) { setNotice('请输入密码'); secretInput.current?.focus(); return; }
    loginBusy.current = true;
    setLoading(true);
    setNotice('');
    try {
      const response = identity.includes('@')
          ? await authService.login({ email: identity, password })
          : await authService.loginByPhone({ phone: identity, password });
      if (active.current) completeLogin(response, identity, password);
    } catch (error) {
      if (active.current) setNotice(errorText(error, '登录失败，请稍后重试'));
    } finally {
      loginBusy.current = false;
      if (active.current) setLoading(false);
    }
  };
  const closeReset = () => setForgotOpen(false);
  return <div className={`bz-login bz-login-product${pageHidden ? ' page-hidden' : ''}${keyboardOpen ? ' keyboard-open' : ''}`}>
    <div className="page">
      <header className="masthead"><Link className="brand" to="/" aria-label="蜂鸣课务首页"><BrandMark /><span>蜂鸣课务</span></Link><button className="help-button" type="button" onClick={() => info.current?.showHelp()}><CircleHelp className="icon" /><span>使用帮助</span></button></header>
      <main className="scene">
        <section className="auth-stage" aria-labelledby="slogan">
          <div id="login-imprint" className="login-imprint" aria-hidden="true" {...{ inert: '' }}><Suspense fallback={null}><LoginBackground /></Suspense></div>
          <h1 id="slogan">把时间，<span>留给好课。</span></h1>
          <div className="login-panel surface">
            <div className="segmented" style={segmentStyle(1, 0)}><span className="login-mode-label">账号密码登录</span></div>
            <form id="login-form" method="post" autoComplete="on" onSubmit={submit} noValidate aria-busy={loading}>
              <label className="field"><span className="sr-only">手机号或邮箱</span><UserRound className="icon" /><input id="account" aria-label="手机号或邮箱" ref={accountInput} name="username" placeholder="手机号或邮箱" value={account} onChange={(event) => { loginEdited.current = true; setAccount(event.target.value); setNotice(''); }} autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={loading} /></label>
              <label className="field"><span className="sr-only">密码</span><LockKeyhole className="icon" /><input id="secret" aria-label="密码" ref={secretInput} name="password" type={showPassword ? 'text' : 'password'} placeholder="密码" value={secret} onChange={(event) => { loginEdited.current = true; setSecret(event.target.value); setNotice(''); }} autoComplete="current-password" disabled={loading} /><button type="button" className="field-action" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff className="icon" /> : <Eye className="icon" />}</button></label>
              <div className="login-options"><label className="remember-login"><input type="checkbox" checked={rememberLogin} disabled={loading} aria-describedby="remember-note" onChange={event => { loginEdited.current = true; setRememberLogin(event.target.checked); setLoginRememberPreference(event.target.checked); }} /><span>记住账号与密码</span></label><span className="remember-note" id="remember-note">密码由浏览器保存</span></div>
              <button className={`primary-button${loading ? ' is-loading' : ''}`} type="submit" disabled={loading}>{loading ? '登录中…' : '登录'}{loading ? <LoaderCircle className="icon" /> : <ArrowRight className="icon" />}</button>
            </form>
            <div className="login-links"><button type="button" onClick={() => setForgotOpen(true)}>忘记密码？</button><span>还没有机构账号？ <Link to="/apply">申请开通</Link></span></div>
            <p className="form-status" role="status" aria-live="polite" title={notice}>{notice}</p>
          </div>
        </section>
        <LoginInfoCards ref={info} />
      </main>
    </div>
    <dialog ref={dialog} aria-labelledby="reset-title" onClose={closeReset} onClick={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeReset();
    }}>
      <div className="dialog-head"><h2 id="reset-title">重置密码</h2><button type="button" className="icon-button" onClick={closeReset} aria-label="关闭"><X className="icon" /></button></div>
      <div className="reset-form"><p>请联系您所在机构的管理员核实身份并重置密码。机构管理员请联系平台处理。</p><p>本系统使用手机号或邮箱加密码登录。</p><button className="primary-button" type="button" onClick={closeReset}>我知道了</button></div>
    </dialog>
  </div>;
}
