'use client';

const TOKEN_KEY = 'metis.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Demo de presentación (NEXT_PUBLIC_DEMO=1): las llamadas las responde un backend simulado en el navegador (demo/servidor.ts).
// Sin la variable, todo va a la API real a través de /api.
const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return DEMO ? import('@/demo/servidor').then((m) => m.responder(url, init)) : fetch(url, init);
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }

  const res = await apiFetch(`/api${path}`, { ...init, headers, body, cache: 'no-store' });

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    setToken(null);
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'Sesión expirada');
  }
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const problem = await res.json();
      message = problem.detail ?? problem.title ?? message;
    } catch {
      /* sin cuerpo */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
