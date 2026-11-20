// Uses an isolated browser context and simulated API/password-vault responses.
// No real account, database, or browser-profile credentials are changed.
import { chromium, expect } from '@playwright/test';
const base = process.env.VERIFY_FRONTEND_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const preferenceKey = 'buzzer-login-preference-v1';
const account = 'remember-ui@example.test', password = 'SyntheticUiSecret!17';
const contexts = [], fixtures = [];
async function setup({ preference, saved = null, rejectLogin = false, unsupported = false, rejectStore = false, delayed = false, blockedStorage = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const state = { requests: [], stores: [], gets: 0, saved, release: null };
  await context.exposeBinding('__testGetPassword', async () => {
    state.gets++;
    if (delayed) await new Promise(resolve => { state.release = resolve; });
    return state.saved;
  });
  await context.exposeBinding('__testStorePassword', async (_, credential) => {
    state.stores.push(credential);
    if (rejectStore) throw Error('Test: browser declined saving');
    state.saved = { ...credential, type: 'password' };
    return credential;
  });
  await context.addInitScript(({ preferenceKey, preference, unsupported, blockedStorage, expectedOrigin }) => {
    if (location.origin !== expectedOrigin) return;
    if (!sessionStorage.getItem('__rememberFixtureSeeded')) {
      if (preference) localStorage.setItem(preferenceKey, JSON.stringify(preference));
      sessionStorage.setItem('__rememberFixtureSeeded', 'true');
    }
    if (blockedStorage) {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (key === preferenceKey) throw new DOMException('Test blocked', 'SecurityError'); return get.call(this, key); };
      Storage.prototype.setItem = function(key, value) { if (key === preferenceKey) throw new DOMException('Test blocked', 'SecurityError'); return set.call(this, key, value); };
    }
    Object.defineProperty(window, 'PasswordCredential', { configurable: true, value: unsupported ? undefined : class {
      constructor(data) { Object.assign(this, data, { type: 'password' }); }
    } });
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: {
      get: async () => { const value = await window.__testGetPassword(); window.__testPasswordReadFinished = true; return value; },
      store: credential => window.__testStorePassword({ id: credential.id, password: credential.password, name: credential.name }),
    } });
  }, { preferenceKey, preference, unsupported, blockedStorage, expectedOrigin: new URL(base).origin });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const user = { id: 'remember-ui-parent', name: '测试家长', role: 'parent', organizationId: 'remember-ui-org', campusId: 'remember-ui-campus', email: account };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/api')) {
      if (request.method() !== 'GET') {
        if (!['/api/auth/login', '/api/auth/login-phone'].includes(url.pathname)) throw Error('Unexpected write ' + url.pathname);
        state.requests.push({ path: url.pathname, body: request.postDataJSON() });
        return route.fulfill({ status: rejectLogin ? 401 : 200, json: rejectLogin ? { success: false, message: '测试：账号或密码不正确' } : { success: true, data: { token: 'ui-synthetic-token', user } } });
      }
      return route.fulfill({ json: { success: true, data: url.pathname === '/api/auth/me' ? user : [], pagination: { total: 0, page: 1, pageSize: 10 } } });
    }
    return url.origin === new URL(base).origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#login-form')).toBeVisible();
  const fixture = { page, context, state, errors }; fixtures.push(fixture); return fixture;
}
async function signIn(page, identity = account, secret = password) {
  await page.locator('#account').fill(identity); await page.locator('#secret').fill(secret);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}
try {
  const happy = await setup();
  await expect(happy.page.getByRole('checkbox', { name: '记住账号与密码' })).toBeChecked();
  await signIn(happy.page); await expect(happy.page).toHaveURL(/\/student\/schedules$/);
  await expect.poll(() => happy.state.stores.length).toBe(1);
  expect(happy.state.stores[0]).toMatchObject({ id: account, password });
  const storage = await happy.page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.parse(storage.local[preferenceKey])).toEqual({ remember: true, account });
  expect(JSON.stringify(storage)).not.toContain(password);
  await happy.page.goto(base + '/login'); await expect(happy.page.locator('#account')).toHaveValue(account); await expect(happy.page.locator('#secret')).toHaveValue(password);
  await happy.page.reload(); await expect(happy.page.locator('#secret')).toHaveValue(password);
  await happy.page.getByRole('checkbox', { name: '记住账号与密码' }).uncheck(); await happy.page.reload();
  await expect(happy.page.locator('#account')).toHaveValue(''); await expect(happy.page.locator('#secret')).toHaveValue('');
  await expect(happy.page.getByRole('checkbox', { name: '记住账号与密码' })).not.toBeChecked();
  const stores = happy.state.stores.length;
  await signIn(happy.page, '13800000000'); await expect(happy.page).toHaveURL(/\/student\/schedules$/);
  expect(happy.state.requests.at(-1)).toEqual({ path: '/api/auth/login-phone', body: { phone: '13800000000', password } });
  expect(happy.state.stores).toHaveLength(stores);
  expect(await happy.page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey)).toEqual({ remember: false, account: '' });
  const failed = await setup({ preference: { remember: true, account }, rejectLogin: true });
  await signIn(failed.page, 'other@example.test', 'SyntheticWrongSecret!'); await expect(failed.page.locator('.form-status')).toHaveText('测试：账号或密码不正确');
  expect(failed.state.stores).toHaveLength(0);
  expect(await failed.page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey)).toEqual({ remember: true, account });
  const nativeFill = await setup({ unsupported: true });
  await nativeFill.page.evaluate(({ account, password }) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(document.getElementById('account'), account); setter.call(document.getElementById('secret'), password);
  }, { account, password });
  await nativeFill.page.getByRole('button', { name: '登录', exact: true }).click(); await expect(nativeFill.page).toHaveURL(/\/student\/schedules$/);
  expect(nativeFill.state.requests[0].body).toEqual({ email: account, password }); expect(nativeFill.state.stores).toHaveLength(0);
  await nativeFill.page.goto(base + '/login'); await expect(nativeFill.page.locator('#account')).toHaveValue(account);
  const denied = await setup({ rejectStore: true }); await signIn(denied.page); await expect(denied.page).toHaveURL(/\/student\/schedules$/);
  const blocked = await setup({ blockedStorage: true }); await signIn(blocked.page); await expect(blocked.page).toHaveURL(/\/student\/schedules$/);
  const mismatch = await setup({ preference: { remember: true, account }, saved: { id: 'different@example.test', password, type: 'password' } });
  await mismatch.page.waitForFunction(() => window.__testPasswordReadFinished === true); await expect(mismatch.page.locator('#secret')).toHaveValue('');
  const late = await setup({ preference: { remember: true, account }, saved: { id: account, password, type: 'password' }, delayed: true });
  await expect.poll(() => Boolean(late.state.release)).toBe(true);
  await late.page.locator('#account').fill('new@example.test'); await late.page.locator('#secret').fill('SyntheticNewTypedSecret!');
  late.state.release(); await late.page.waitForFunction(() => window.__testPasswordReadFinished === true);
  await expect(late.page.locator('#account')).toHaveValue('new@example.test'); await expect(late.page.locator('#secret')).toHaveValue('SyntheticNewTypedSecret!');
  const visual = await setup({ unsupported: true });
  for (const [width,height] of [[1440,900],[1280,720],[390,844],[375,667]]) {
    await visual.page.setViewportSize({width,height});
    await expect.poll(() => visual.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const positions = await visual.page.locator('.login-panel,.login-options').evaluateAll(elements => elements.map(element => { const b=element.getBoundingClientRect(); return {top:b.top,bottom:b.bottom}; }));
    for(const position of positions){expect(position.top).toBeGreaterThanOrEqual(0);expect(position.bottom).toBeLessThanOrEqual(height);}
  }
  await visual.page.setViewportSize({width:1440,height:900}); await visual.page.screenshot({path:'/tmp/buzzer-login-remember-desktop.png'});
  await visual.page.setViewportSize({width:390,height:844}); await visual.page.screenshot({path:'/tmp/buzzer-login-remember-mobile.png'});
  for(const fixture of fixtures)expect(fixture.errors).toEqual([]);
  console.log('PASS remember-login UI: email/phone, account persistence, browser-vault save/restore, opt-out, failed-login protection, native autofill, unsupported/declined/blocked storage, account matching, delayed-result protection, desktop/mobile layout. APIs and vault simulated; no real credentials/database changed.');
} finally { await Promise.allSettled(contexts.map(context => context.close())); await browser.close(); }
