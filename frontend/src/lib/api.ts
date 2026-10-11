import type { ApiResponse } from '@lms/shared';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** zod field errors from a 400 VALIDATION_ERROR, as { field: firstMessage }. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !this.details || typeof this.details !== 'object') return {};
    return Object.fromEntries(
      Object.entries(this.details as Record<string, string[]>).map(([k, v]) => [k, v?.[0] ?? 'Invalid value']),
    );
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(0, 'NETWORK', 'Cannot reach the server. Please check your internet and try again.');
  }

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  // Non-JSON reply = the Next.js proxy couldn't reach the API server (it's down or restarting).
  if (!json) throw new ApiClientError(res.status, 'SERVER_UNREACHABLE', 'Our server is not responding right now. Please try again in a minute.');
  if (!json.success) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiClientError(res.status, json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
};

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';
