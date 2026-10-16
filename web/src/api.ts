// Calls to our own server, with the optional app password attached.
const PW_KEY = 'autodj.appPassword';

export function getAppPassword(): string {
  try {
    return localStorage.getItem(PW_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAppPassword(pw: string) {
  try {
    localStorage.setItem(PW_KEY, pw);
  } catch {
    /* not persisted */
  }
}

export class PasswordError extends Error {}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const pw = getAppPassword();
  if (pw) headers.set('x-app-password', pw);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) throw new PasswordError('Wrong or missing app password');
  return res;
}

export async function passwordRequired(): Promise<boolean> {
  try {
    const r = await fetch('/api/config');
    return r.ok ? !!(await r.json()).passwordRequired : false;
  } catch {
    return false;
  }
}

export async function checkPassword(pw: string): Promise<boolean> {
  const r = await fetch('/api/check-password', { headers: { 'x-app-password': pw } });
  return r.ok;
}
