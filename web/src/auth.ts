// Spotify Authorization Code + PKCE, entirely in the browser (no client secret).
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = 'playlist-read-private playlist-read-collaborative user-read-private';
const TOKEN_KEY = 'autodj.spotify.token';
const VERIFIER_KEY = 'autodj.spotify.verifier';

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export const hasClientId = !!CLIENT_ID;
const redirectUri = () => `${location.origin}/callback`;

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function readToken(): StoredToken | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveToken(r: { access_token: string; refresh_token?: string; expires_in: number }) {
  const prev = readToken();
  const t: StoredToken = {
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? prev?.refresh_token ?? '',
    expires_at: Date.now() + r.expires_in * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }),
  });
  if (!res.ok) throw new Error(`Spotify token error ${res.status}: ${await res.text()}`);
  saveToken(await res.json());
}

export async function login() {
  const verifier = randomString(64);
  localStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/** Finish the redirect from Spotify if we're on /callback. */
export async function completeLogin(): Promise<void> {
  if (location.pathname !== '/callback') return;
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const verifier = localStorage.getItem(VERIFIER_KEY);
  history.replaceState(null, '', '/');
  if (params.get('error')) throw new Error(`Spotify login failed: ${params.get('error')}`);
  if (!code || !verifier) return;
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
  localStorage.removeItem(VERIFIER_KEY);
}

export async function getAccessToken(): Promise<string | null> {
  const t = readToken();
  if (!t) return null;
  if (Date.now() < t.expires_at - 60_000) return t.access_token;
  if (!t.refresh_token) return null;
  try {
    await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    return readToken()!.access_token;
  } catch {
    logout();
    return null;
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export const isLoggedIn = () => !!readToken();
