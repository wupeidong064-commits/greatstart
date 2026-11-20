// Only the account and opt-in preference belong in site storage. Passwords stay
// in the browser's password manager and are never persisted by the application.
const LOGIN_PREFERENCE_KEY = 'buzzer-login-preference-v1';

export interface LoginPreference {
  remember: boolean;
  account: string;
}

interface BrowserPasswordCredential extends Credential {
  password: string;
}

type PasswordCredentialConstructor = new (data: { id: string; password: string; name?: string }) => BrowserPasswordCredential;

function passwordCredentialConstructor(): PasswordCredentialConstructor | undefined {
  if (!window.isSecureContext || !navigator.credentials) return undefined;
  return (window as Window & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
}

export function readLoginPreference(): LoginPreference {
  try {
    const value = JSON.parse(localStorage.getItem(LOGIN_PREFERENCE_KEY) || 'null');
    if (value && typeof value.remember === 'boolean') {
      return { remember: value.remember, account: value.remember && typeof value.account === 'string' ? value.account : '' };
    }
  } catch { /* Login also works when browser storage is unavailable. */ }
  return { remember: true, account: '' };
}

export function setLoginRememberPreference(remember: boolean): void {
  const previous = readLoginPreference();
  try {
    localStorage.setItem(LOGIN_PREFERENCE_KEY, JSON.stringify({ remember, account: remember ? previous.account : '' }));
  } catch { /* A storage failure must not prevent authentication. */ }
}

export function rememberSuccessfulLogin(account: string, password: string, remember: boolean, name?: string): void {
  try {
    localStorage.setItem(LOGIN_PREFERENCE_KEY, JSON.stringify({ remember, account: remember ? account : '' }));
  } catch { /* The browser password manager may still be available. */ }
  if (!remember) return;
  try {
    const PasswordCredential = passwordCredentialConstructor();
    if (!PasswordCredential) return;
    // Saving may require browser confirmation. Never hold up a successful login
    // if saving is declined, unsupported, or disabled by browser policy.
    void navigator.credentials.store(new PasswordCredential({ id: account, password, name })).catch(() => undefined);
  } catch { /* Standard username/current-password autofill remains available. */ }
}

export async function restoreRememberedPassword(account: string, signal: AbortSignal): Promise<string | null> {
  if (!account || !passwordCredentialConstructor()) return null;
  try {
    const credential = await navigator.credentials.get({ password: true, mediation: 'silent', signal } as CredentialRequestOptions & { password: boolean });
    if (signal.aborted || credential?.type !== 'password' || credential.id !== account) return null;
    const password = (credential as BrowserPasswordCredential).password;
    return typeof password === 'string' ? password : null;
  } catch { return null; }
}
