import { API_CONFIG, API_ENDPOINTS } from './config';
import { ApiError } from '../errors/api-error';
import {
  getToken,
  getRefreshToken,
  getDeveloperId,
  setSession,
  clearSession,
} from '../auth/session';
import { ROUTES } from '../constants/routes';

interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  params?: Record<string, unknown>;
}

async function fetchWithRetry(
  url: string,
  options: RequestOptions = {},
  attempt: number = 0
): Promise<Response> {
  const {
    timeout = API_CONFIG.timeout,
    retries = API_CONFIG.retryAttempts,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Retry on 5xx errors
    if (response.status >= 500 && attempt < retries) {
      await delay(API_CONFIG.retryDelay * (attempt + 1));
      return fetchWithRetry(url, options, attempt + 1);
    }

    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw ApiError.timeout();
    }

    const message = error instanceof Error ? error.message : 'Network error';
    throw ApiError.networkError(message);
  }
}

// Mutex to prevent concurrent refresh attempts
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  // If a refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.baseUrl}${API_ENDPOINTS.tokenRefresh}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        }
      );

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      const developerId = getDeveloperId();
      if (developerId && data.access_token) {
        setSession(
          data.access_token,
          developerId,
          data.expires_in,
          data.refresh_token
        );
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function handleUnauthorized(): never {
  clearSession();
  if (typeof window !== 'undefined') {
    window.location.href = ROUTES.login;
  }
  throw ApiError.fromResponse(new Response(null, { status: 401 }));
}

export const apiClient = {
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    let url = `${API_CONFIG.baseUrl}${endpoint}`;
    const token = getToken();

    if (options.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((item) => searchParams.append(key, String(item)));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Remove params from options passed to fetch
    const { params: _params, ...fetchOptions } = options;

    try {
      let response = await fetchWithRetry(url, {
        ...fetchOptions,
        headers,
      });

      // On 401, try to refresh the token and retry the request once
      if (response.status === 401) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          const newToken = getToken();
          if (newToken) {
            headers['Authorization'] = `Bearer ${newToken}`;
          }
          response = await fetchWithRetry(url, {
            ...fetchOptions,
            headers,
          });
        }

        if (response.status === 401) {
          handleUnauthorized();
        }
      }

      let data: unknown;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw ApiError.fromResponse(response, data);
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.networkError((error as Error).message);
    }
  },

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  async postForm<T>(
    endpoint: string,
    body: Record<string, string>,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${API_CONFIG.baseUrl}${endpoint}`;
    const token = getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options?.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetchWithRetry(url, {
      ...options,
      method: 'POST',
      headers,
      body: new URLSearchParams(body).toString(),
    });

    // On 401, try to refresh the token and retry
    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        const newToken = getToken();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
        }
        response = await fetchWithRetry(url, {
          ...options,
          method: 'POST',
          headers,
          body: new URLSearchParams(body).toString(),
        });
      }

      if (response.status === 401) {
        handleUnauthorized();
      }
    }

    let data: unknown;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw ApiError.fromResponse(response, data);
    }

    return data as T;
  },

  patch<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  },

  async postMultipart<T>(
    endpoint: string,
    formData: FormData,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${API_CONFIG.baseUrl}${endpoint}`;
    const token = getToken();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options?.headers as Record<string, string>),
    };
    // Don't set Content-Type for multipart/form-data - browser sets it with boundary

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetchWithRetry(url, {
      ...options,
      method: 'POST',
      headers,
      body: formData,
    });

    // On 401, try to refresh the token and retry
    if (response.status === 401) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        const newToken = getToken();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
        }
        response = await fetchWithRetry(url, {
          ...options,
          method: 'POST',
          headers,
          body: formData,
        });
      }

      if (response.status === 401) {
        handleUnauthorized();
      }
    }

    let data: unknown;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw ApiError.fromResponse(response, data);
    }

    return data as T;
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { ApiError };
