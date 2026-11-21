export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 12000;

export async function apiRequest<T>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const msg =
        typeof data === 'object' && data && 'message' in data
          ? String((data as { message: unknown }).message)
          : `Request failed with status ${response.status}`;
      const code =
        typeof data === 'object' && data && 'code' in data
          ? String((data as { code: unknown }).code)
          : undefined;
      throw new ApiClientError(msg, response.status, code, data);
    }

    return data as T;
  } catch (err: unknown) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError('Request timed out while contacting the server.', 408, 'TIMEOUT');
    }
    throw new ApiClientError(
      err instanceof Error ? err.message : 'Network error communicating with backend API',
      0,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timer);
  }
}

export const apiClient = {
  get: <T>(url: string, timeoutMs?: number) => apiRequest<T>(url, { method: 'GET', timeoutMs }),
  post: <T>(url: string, body?: unknown, timeoutMs?: number) =>
    apiRequest<T>(url, { method: 'POST', body, timeoutMs }),
  put: <T>(url: string, body?: unknown, timeoutMs?: number) =>
    apiRequest<T>(url, { method: 'PUT', body, timeoutMs }),
  patch: <T>(url: string, body?: unknown, timeoutMs?: number) =>
    apiRequest<T>(url, { method: 'PATCH', body, timeoutMs }),
  delete: <T>(url: string, timeoutMs?: number) =>
    apiRequest<T>(url, { method: 'DELETE', timeoutMs }),
};
