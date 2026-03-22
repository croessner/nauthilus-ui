import Cookies from 'js-cookie';

const CSRF_COOKIE_NAME = 'nauthilus_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

let inFlightCSRFRequest: Promise<string | null> | null = null;

export const isMutatingMethod = (method?: string): boolean => {
  switch ((method || 'GET').toUpperCase()) {
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
      return true;
    default:
      return false;
  }
};

export const getCSRFToken = (): string | null => {
  const token = Cookies.get(CSRF_COOKIE_NAME);
  return token || null;
};

export const ensureCSRFToken = async (): Promise<string | null> => {
  const existing = getCSRFToken();
  if (existing) {
    return existing;
  }

  if (!inFlightCSRFRequest) {
    inFlightCSRFRequest = fetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? getCSRFToken() : null))
      .catch(() => null)
      .finally(() => {
        inFlightCSRFRequest = null;
      });
  }

  return inFlightCSRFRequest;
};

export const attachCSRFHeader = async (headersInit?: HeadersInit): Promise<Headers> => {
  const headers = new Headers(headersInit || {});
  if (headers.has(CSRF_HEADER_NAME)) {
    return headers;
  }

  const token = await ensureCSRFToken();
  if (token) {
    headers.set(CSRF_HEADER_NAME, token);
  }

  return headers;
};
