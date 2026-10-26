export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let refreshing: Promise<Response> | null = null;
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).finally(
      () => {
        refreshing = null;
      },
    );
    if ((await refreshing).ok) return api(path, options, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      Array.isArray(body.message)
        ? body.message.join('. ')
        : (body.message ?? 'Something went wrong. Please try again.'),
    );
  }
  return response.json();
}
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
