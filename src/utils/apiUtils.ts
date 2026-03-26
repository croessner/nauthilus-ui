/**
 * Utility functions for API operations
 */
import { attachCSRFHeader, isMutatingMethod } from './csrf';
import { readCachedSSHPassphrase } from './sshPassphraseCache';

/**
 * Retrieves the proxy origin URL based on the current environment configuration.
 *
 * In Vite development mode we intentionally route proxy calls through the UI
 * origin (`/proxy`) so requests stay on the same backend instance as `/api`.
 *
 * Outside Vite dev mode the function checks the following sources in order of priority:
 * 1. `window._env_?.REACT_APP_PROXY_PORT` - If available, this port value is used.
 * 2. `process.env.REACT_APP_PROXY_PORT` - If running in a Node.js-like environment, this port value is used.
 * 3. Fallback to the default port `3002` if neither of the above are defined.
 *
 * A debug message is logged for each source used.
 *
 * @returns {string} The generated proxy origin URL based on the chosen port.
 */
export const getProxyOrigin = (): string => {
  if (isViteDevelopmentRuntime()) {
    console.debug('[getProxyOrigin] Source: vite-dev same-origin');
    return window.location.origin;
  }

  if (window._env_?.REACT_APP_PROXY_PORT) {
    console.debug('[getProxyOrigin] Source: window._env_, Port:', window._env_.REACT_APP_PROXY_PORT);
    return buildUrl(window._env_.REACT_APP_PROXY_PORT);
  }

  if (typeof process !== 'undefined' && process.env.REACT_APP_PROXY_PORT) {
    console.debug('[getProxyOrigin] Source: process.env, Port:', process.env.REACT_APP_PROXY_PORT);
    return buildUrl(process.env.REACT_APP_PROXY_PORT);
  }

  console.debug('[getProxyOrigin] Source: Fallback, Port: 3002');
  return buildUrl('3002');
};

function isViteDevelopmentRuntime(): boolean {
  return Boolean(import.meta.env?.DEV);
}

/**
 * Constructs a URL based on the provided port and current window location details.
 *
 * @param {string} port - The port to use when building the URL. If the port is "443" and the protocol is "https:", the port is omitted from the URL.
 * @return {string} The constructed URL as a string.
 */
function buildUrl(port: string): string {
  const { protocol, hostname } = window.location;
  const normalizedHostname = protocol === 'http:' && hostname === 'localhost' ? '127.0.0.1' : hostname;
  return port === '443' && protocol === 'https:'
      ? `${protocol}//${normalizedHostname}`
      : `${protocol}//${normalizedHostname}:${port}`;
}

/**
 * Browser authentication is cookie-only. This helper remains for compatibility
 * with components that probe for a token, but it intentionally returns null.
 */
export const getAuthToken = (): string | null => {
  return null;
};

/**
 * Prepares authentication parameters for API requests
 * @param connectionConfig - The connection configuration object containing auth settings
 * @returns An object with authType and authValue properties
 */
export const prepareAuthParams = (connectionConfig: any): { authType: string, authValue: string } => {
  let authType = '';
  let authValue = '';

  // Add Basic Auth if enabled
  if (connectionConfig.basic_auth?.enabled && 
      connectionConfig.basic_auth.username && 
      connectionConfig.basic_auth.password) {
    authType = 'basic';
    authValue = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
  }

  // For OIDC Client Credentials, use existing token if available
  if (connectionConfig.oidc_auth?.enabled && connectionConfig.oidc_auth.token) {
    authType = 'bearer';
    authValue = connectionConfig.oidc_auth.token;
  }

  return { authType, authValue };
};

const OIDC_REFRESH_SKEW_SECONDS = 30;
const oidcRefreshInFlight = new Map<string, Promise<void>>();
const OIDC_DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const oidcDiscoveryCache = new Map<string, { document: OIDCDiscoveryDocument; expiresAt: number }>();
const JWT_BEARER_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

export type RuntimeOIDCAuthMethod = 'client_secret_post' | 'client_secret_basic' | 'private_key_jwt';
export type RuntimeOIDCDiscoveryMode = 'auto' | 'manual' | 'off';
export type RuntimeOIDCIntrospectionMode = 'auto' | 'always' | 'never';
export type RuntimeOIDCPrivateKeyAlgorithm = 'RS256' | 'EDDSA';

interface OIDCDiscoveryDocument {
  issuer?: string;
  token_endpoint?: string;
  introspection_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
  introspection_endpoint_auth_methods_supported?: string[];
}

interface RuntimeOIDCTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface RuntimeOIDCIntrospectionResponse {
  active?: boolean;
  exp?: number;
}

export interface RuntimeOIDCTokenData {
  token: string;
  expires_at: number;
  token_kind: 'jwt' | 'opaque';
}

const OIDC_AUTH_METHODS: RuntimeOIDCAuthMethod[] = ['client_secret_post', 'client_secret_basic', 'private_key_jwt'];
const OIDC_DISCOVERY_MODES: RuntimeOIDCDiscoveryMode[] = ['auto', 'manual', 'off'];
const OIDC_INTROSPECTION_MODES: RuntimeOIDCIntrospectionMode[] = ['auto', 'always', 'never'];
const OIDC_PRIVATE_KEY_ALGORITHMS: RuntimeOIDCPrivateKeyAlgorithm[] = ['RS256', 'EDDSA'];

export function normalizeRuntimeOIDCAuthMethod(value: unknown): RuntimeOIDCAuthMethod {
  const normalized = String(value || '').trim().toLowerCase();
  if (OIDC_AUTH_METHODS.includes(normalized as RuntimeOIDCAuthMethod)) {
    return normalized as RuntimeOIDCAuthMethod;
  }

  return 'client_secret_post';
}

export function normalizeRuntimeOIDCDiscoveryMode(value: unknown): RuntimeOIDCDiscoveryMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (OIDC_DISCOVERY_MODES.includes(normalized as RuntimeOIDCDiscoveryMode)) {
    return normalized as RuntimeOIDCDiscoveryMode;
  }

  return 'auto';
}

export function normalizeRuntimeOIDCIntrospectionMode(value: unknown): RuntimeOIDCIntrospectionMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (OIDC_INTROSPECTION_MODES.includes(normalized as RuntimeOIDCIntrospectionMode)) {
    return normalized as RuntimeOIDCIntrospectionMode;
  }

  return 'auto';
}

export function normalizeRuntimeOIDCPrivateKeyAlgorithm(value: unknown): RuntimeOIDCPrivateKeyAlgorithm {
  const normalized = String(value || '').trim().toUpperCase();
  if (OIDC_PRIVATE_KEY_ALGORITHMS.includes(normalized as RuntimeOIDCPrivateKeyAlgorithm)) {
    return normalized as RuntimeOIDCPrivateKeyAlgorithm;
  }

  return 'RS256';
}

export function requiresClientSecretForOIDCAuth(method: unknown): boolean {
  const authMethod = normalizeRuntimeOIDCAuthMethod(method);
  return authMethod === 'client_secret_post' || authMethod === 'client_secret_basic';
}

export function requiresPrivateKeyForOIDCAuth(method: unknown): boolean {
  return normalizeRuntimeOIDCAuthMethod(method) === 'private_key_jwt';
}

export function hasOIDCRuntimeAuthMaterial(connectionConfig: any): boolean {
  if (!connectionConfig?.oidc_auth?.enabled) {
    return false;
  }

  if (!String(connectionConfig?.backend_url || '').trim()) {
    return false;
  }

  if (!String(connectionConfig?.oidc_auth?.client_id || '').trim()) {
    return false;
  }

  const authMethod = normalizeRuntimeOIDCAuthMethod(connectionConfig?.oidc_auth?.token_endpoint_auth_method);
  if (requiresClientSecretForOIDCAuth(authMethod)) {
    return String(connectionConfig?.oidc_auth?.client_secret || '') !== '';
  }

  if (requiresPrivateKeyForOIDCAuth(authMethod)) {
    return String(connectionConfig?.oidc_auth?.private_key_pem || '').trim() !== '';
  }

  return false;
}

function looksLikeJWT(value: string): boolean {
  return value.split('.').length === 3;
}

function shouldRefreshOIDCToken(connectionConfig: any): boolean {
  if (!hasOIDCRuntimeAuthMaterial(connectionConfig)) {
    return false;
  }

  const token = String(connectionConfig?.oidc_auth?.token || '').trim();
  const expiresAt = Number(connectionConfig?.oidc_auth?.expires_at || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!token) {
    return true;
  }

  return expiresAt <= (now + OIDC_REFRESH_SKEW_SECONDS);
}

function buildOIDCRefreshKey(connectionConfig: any): string {
  const backendUrl = String(connectionConfig?.backend_url || '');
  const oidcAuth = connectionConfig?.oidc_auth || {};
  const clientId = String(oidcAuth.client_id || '');
  const scope = String(oidcAuth.scope || '');
  const authMethod = normalizeRuntimeOIDCAuthMethod(oidcAuth.token_endpoint_auth_method);
  const discoveryMode = normalizeRuntimeOIDCDiscoveryMode(oidcAuth.discovery_mode);
  const discoveryURL = String(oidcAuth.discovery_url || '');
  return `${backendUrl}|${clientId}|${scope}|${authMethod}|${discoveryMode}|${discoveryURL}`;
}

function buildProxyURLForAbsoluteEndpoint(proxyPath: string, endpointURL: string): string {
  const parsedEndpoint = new URL(endpointURL);
  const proxyUrl = new URL(proxyPath, getProxyOrigin());
  proxyUrl.searchParams.set('url', `${parsedEndpoint.protocol}//${parsedEndpoint.host}`);
  proxyUrl.searchParams.set('endpoint_path', parsedEndpoint.pathname || '/');
  parsedEndpoint.searchParams.forEach((value, key) => {
    proxyUrl.searchParams.append(key, value);
  });

  return proxyUrl.toString();
}

function parsePKCS8FromPEM(pem: string): Uint8Array {
  const normalized = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

  if (!normalized) {
    throw new Error('Private key is empty');
  }

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlEncodeJSON(value: Record<string, unknown>): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function generateAssertionID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function buildPrivateKeyClientAssertion(connectionConfig: any, audience: string): Promise<string> {
  const oidcAuth = connectionConfig?.oidc_auth || {};
  const privateKeyPem = String(oidcAuth.private_key_pem || '').trim();
  if (!privateKeyPem) {
    throw new Error('OIDC private key is required for private_key_jwt');
  }

  const clientID = String(oidcAuth.client_id || '').trim();
  if (!clientID) {
    throw new Error('OIDC client_id is required for private_key_jwt');
  }

  const algorithm = normalizeRuntimeOIDCPrivateKeyAlgorithm(oidcAuth.private_key_algorithm);
  const keyData = parsePKCS8FromPEM(privateKeyPem);

  const importAlgorithm: any = algorithm === 'EDDSA'
    ? { name: 'Ed25519' }
    : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('pkcs8', keyData, importAlgorithm, false, ['sign']);

  const now = Math.floor(Date.now() / 1000);
  const configuredTTL = Number(oidcAuth.client_assertion_ttl_seconds || 300);
  const assertionTTL = Number.isFinite(configuredTTL)
    ? Math.min(600, Math.max(30, Math.floor(configuredTTL)))
    : 300;

  const header: Record<string, unknown> = {
    alg: algorithm === 'EDDSA' ? 'EdDSA' : 'RS256',
    typ: 'JWT',
  };
  const keyID = String(oidcAuth.private_key_id || '').trim();
  if (keyID) {
    header.kid = keyID;
  }

  const claims: Record<string, unknown> = {
    iss: clientID,
    sub: clientID,
    aud: audience,
    iat: now,
    exp: now + assertionTTL,
    jti: generateAssertionID(),
  };

  const payload = `${base64UrlEncodeJSON(header)}.${base64UrlEncodeJSON(claims)}`;

  const signAlgorithm: any = algorithm === 'EDDSA'
    ? { name: 'Ed25519' }
    : { name: 'RSASSA-PKCS1-v1_5' };
  const signature = await crypto.subtle.sign(signAlgorithm, key, new TextEncoder().encode(payload));
  const signaturePart = base64UrlEncodeBytes(new Uint8Array(signature));

  return `${payload}.${signaturePart}`;
}

function extractDiscoveryCacheKey(connectionConfig: any, discoveryURL: string): string {
  const oidcAuth = connectionConfig?.oidc_auth || {};
  const mode = normalizeRuntimeOIDCDiscoveryMode(oidcAuth.discovery_mode);
  return `${mode}|${String(discoveryURL || '').trim()}`;
}

function resolveDefaultDiscoveryURL(connectionConfig: any): string | null {
  const backendURL = String(connectionConfig?.backend_url || '').trim();
  if (!backendURL) {
    return null;
  }

  try {
    const parsed = new URL(backendURL);
    return `${parsed.protocol}//${parsed.host}/.well-known/openid-configuration`;
  } catch {
    return null;
  }
}

function resolveDiscoveryURL(connectionConfig: any): string | null {
  const oidcAuth = connectionConfig?.oidc_auth || {};
  const mode = normalizeRuntimeOIDCDiscoveryMode(oidcAuth.discovery_mode);
  if (mode === 'off') {
    return null;
  }

  const configuredURL = String(oidcAuth.discovery_url || '').trim();
  if (mode === 'manual') {
    return configuredURL || null;
  }

  if (configuredURL) {
    return configuredURL;
  }

  return resolveDefaultDiscoveryURL(connectionConfig);
}

async function fetchOIDCDiscoveryDocument(connectionConfig: any): Promise<OIDCDiscoveryDocument | null> {
  const discoveryURL = resolveDiscoveryURL(connectionConfig);
  if (!discoveryURL) {
    return null;
  }

  let parsedDiscoveryURL: URL;
  try {
    parsedDiscoveryURL = new URL(discoveryURL);
  } catch (error) {
    console.error('OIDC discovery URL is invalid:', error);
    return null;
  }

  const cacheKey = extractDiscoveryCacheKey(connectionConfig, parsedDiscoveryURL.toString());
  const cached = oidcDiscoveryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.document;
  }

  const proxyURL = buildProxyURLForAbsoluteEndpoint('/proxy/oidc-discovery', parsedDiscoveryURL.toString());
  const response = await authenticatedFetch(proxyURL, { method: 'GET' });
  if (!response.ok) {
    console.error('OIDC discovery failed:', response.status, response.statusText);
    return null;
  }

  const document = await response.json().catch(() => null) as OIDCDiscoveryDocument | null;
  if (!document || typeof document !== 'object') {
    console.error('OIDC discovery failed: response was not a valid JSON object');
    return null;
  }

  oidcDiscoveryCache.set(cacheKey, {
    document,
    expiresAt: Date.now() + OIDC_DISCOVERY_CACHE_TTL_MS,
  });

  return document;
}

function resolveTokenEndpoint(connectionConfig: any, discoveryDocument: OIDCDiscoveryDocument | null): string | null {
  const configuredEndpoint = String(connectionConfig?.oidc_auth?.token_endpoint || '').trim();
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  const discoveredEndpoint = String(discoveryDocument?.token_endpoint || '').trim();
  if (discoveredEndpoint) {
    return discoveredEndpoint;
  }

  const backendURL = String(connectionConfig?.backend_url || '').trim();
  if (!backendURL) {
    return null;
  }

  try {
    const parsed = new URL(backendURL);
    return `${parsed.protocol}//${parsed.host}/oidc/token`;
  } catch {
    return null;
  }
}

function resolveIntrospectionEndpoint(connectionConfig: any, discoveryDocument: OIDCDiscoveryDocument | null): string {
  const configuredEndpoint = String(connectionConfig?.oidc_auth?.introspection_endpoint || '').trim();
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  const discoveredEndpoint = String(discoveryDocument?.introspection_endpoint || '').trim();
  if (discoveredEndpoint) {
    return discoveredEndpoint;
  }

  return '';
}

function resolveIntrospectionAuthMethod(
  connectionConfig: any,
  discoveryDocument: OIDCDiscoveryDocument | null,
): RuntimeOIDCAuthMethod | '' {
  const configured = String(connectionConfig?.oidc_auth?.introspection_auth_method || '').trim().toLowerCase();
  if (configured === 'client_secret_post' || configured === 'client_secret_basic' || configured === 'private_key_jwt') {
    return configured;
  }

  const preferred = normalizeRuntimeOIDCAuthMethod(connectionConfig?.oidc_auth?.token_endpoint_auth_method);
  const supported = Array.isArray(discoveryDocument?.introspection_endpoint_auth_methods_supported)
    ? discoveryDocument?.introspection_endpoint_auth_methods_supported || []
    : [];

  if (supported.length === 0 || supported.includes(preferred)) {
    return preferred;
  }

  if (supported.includes('client_secret_post') && String(connectionConfig?.oidc_auth?.client_secret || '') !== '') {
    return 'client_secret_post';
  }

  if (supported.includes('client_secret_basic') && String(connectionConfig?.oidc_auth?.client_secret || '') !== '') {
    return 'client_secret_basic';
  }

  if (supported.includes('private_key_jwt') && String(connectionConfig?.oidc_auth?.private_key_pem || '').trim() !== '') {
    return 'private_key_jwt';
  }

  return '';
}

async function runOIDCIntrospection(
  connectionConfig: any,
  endpointURL: string,
  token: string,
  method: RuntimeOIDCAuthMethod,
): Promise<RuntimeOIDCIntrospectionResponse | null> {
  const body = new URLSearchParams();
  body.set('token', token);

  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  });

  const clientID = String(connectionConfig?.oidc_auth?.client_id || '').trim();
  const clientSecret = String(connectionConfig?.oidc_auth?.client_secret || '');
  if (method === 'client_secret_post') {
    body.set('client_id', clientID);
    body.set('client_secret', clientSecret);
  } else if (method === 'client_secret_basic') {
    headers.set('Authorization', `Basic ${btoa(`${clientID}:${clientSecret}`)}`);
  } else if (method === 'private_key_jwt') {
    const assertion = await buildPrivateKeyClientAssertion(connectionConfig, endpointURL);
    body.set('client_id', clientID);
    body.set('client_assertion_type', JWT_BEARER_ASSERTION_TYPE);
    body.set('client_assertion', assertion);
  }

  const proxyURL = buildProxyURLForAbsoluteEndpoint('/proxy/oidc-introspect', endpointURL);
  const response = await authenticatedFetch(proxyURL, {
    method: 'POST',
    headers,
    body: body.toString(),
  });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null) as RuntimeOIDCIntrospectionResponse | null;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload;
}

function resolveIntrospectionRequirement(
  mode: RuntimeOIDCIntrospectionMode,
  tokenKind: 'jwt' | 'opaque',
): { shouldTry: boolean; mustSucceed: boolean } {
  if (mode === 'never') {
    return { shouldTry: false, mustSucceed: false };
  }

  if (mode === 'always') {
    return { shouldTry: true, mustSucceed: true };
  }

  // "auto": always try when available; opaque tokens must pass introspection.
  return {
    shouldTry: true,
    mustSucceed: tokenKind === 'opaque',
  };
}

export async function fetchRuntimeOIDCToken(connectionConfig: any): Promise<RuntimeOIDCTokenData | null> {
  try {
    if (!hasOIDCRuntimeAuthMaterial(connectionConfig)) {
      console.error('Failed to refresh runtime OIDC token: missing OIDC auth material');
      return null;
    }

    const oidcAuth = connectionConfig?.oidc_auth || {};
    const clientID = String(oidcAuth.client_id || '').trim();
    const scope = String(oidcAuth.scope || '').trim();
    const authMethod = normalizeRuntimeOIDCAuthMethod(oidcAuth.token_endpoint_auth_method);

    const discovery = await fetchOIDCDiscoveryDocument(connectionConfig);
    const tokenEndpoint = resolveTokenEndpoint(connectionConfig, discovery);
    if (!tokenEndpoint) {
      console.error('Failed to refresh runtime OIDC token: token endpoint could not be resolved');
      return null;
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    if (scope) {
      body.set('scope', scope);
    }

    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    });

    if (authMethod === 'client_secret_post') {
      body.set('client_id', clientID);
      body.set('client_secret', String(oidcAuth.client_secret || ''));
    } else if (authMethod === 'client_secret_basic') {
      headers.set('Authorization', `Basic ${btoa(`${clientID}:${String(oidcAuth.client_secret || '')}`)}`);
      body.set('client_id', clientID);
    } else if (authMethod === 'private_key_jwt') {
      const assertion = await buildPrivateKeyClientAssertion(connectionConfig, tokenEndpoint);
      body.set('client_id', clientID);
      body.set('client_assertion_type', JWT_BEARER_ASSERTION_TYPE);
      body.set('client_assertion', assertion);
    }

    const tokenProxyURL = buildProxyURLForAbsoluteEndpoint('/proxy/oidc-token', tokenEndpoint);
    const tokenResponse = await authenticatedFetch(tokenProxyURL, {
      method: 'POST',
      headers,
      body: body.toString(),
    });
    if (!tokenResponse.ok) {
      console.error('Failed to refresh runtime OIDC token:', tokenResponse.status, tokenResponse.statusText);
      return null;
    }

    const payload = await tokenResponse.json().catch(() => null) as RuntimeOIDCTokenResponse | null;
    const token = typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
    if (!token) {
      console.error('Failed to refresh runtime OIDC token: response did not include access_token');
      return null;
    }

    const tokenKind: 'jwt' | 'opaque' = looksLikeJWT(token) ? 'jwt' : 'opaque';
    const expiresIn = Number(payload?.expires_in || 0);
    let expiresAt = Math.floor(Date.now() / 1000) + Math.max(expiresIn, 0);

    const introspectionMode = normalizeRuntimeOIDCIntrospectionMode(oidcAuth.introspection_mode);
    const introspectionRequirement = resolveIntrospectionRequirement(introspectionMode, tokenKind);
    if (introspectionRequirement.shouldTry) {
      const introspectionEndpoint = resolveIntrospectionEndpoint(connectionConfig, discovery);
      if (!introspectionEndpoint) {
        if (introspectionMode === 'always') {
          console.error('Failed to refresh runtime OIDC token: introspection endpoint is required but unavailable');
          return null;
        }
      } else {
        const introspectionMethod = resolveIntrospectionAuthMethod(connectionConfig, discovery);
        if (!introspectionMethod) {
          if (introspectionMode === 'always' || introspectionRequirement.mustSucceed) {
            console.error('Failed to refresh runtime OIDC token: no supported introspection auth method could be resolved');
            return null;
          }
        } else {
          const introspection = await runOIDCIntrospection(connectionConfig, introspectionEndpoint, token, introspectionMethod);
          if (!introspection || introspection.active !== true) {
            if (introspectionMode === 'always' || introspectionRequirement.mustSucceed) {
              console.error('Failed to refresh runtime OIDC token: token introspection did not return active=true');
              return null;
            }
          } else if (Number.isFinite(Number(introspection.exp)) && Number(introspection.exp) > 0) {
            expiresAt = Number(introspection.exp);
          }
        }
      }
    }

    return {
      token,
      expires_at: expiresAt,
      token_kind: tokenKind,
    };
  } catch (error) {
    console.error('Failed to refresh runtime OIDC token:', error);
    return null;
  }
}

/**
 * Ensures the runtime OIDC token is valid before proxy requests use it.
 * Uses a single-flight guard to avoid duplicate token refresh calls.
 */
export const ensureRuntimeOIDCToken = async (connectionConfig: any): Promise<void> => {
  if (!shouldRefreshOIDCToken(connectionConfig)) {
    return;
  }

  const refreshKey = buildOIDCRefreshKey(connectionConfig);
  const existingRefresh = oidcRefreshInFlight.get(refreshKey);
  if (existingRefresh) {
    await existingRefresh;
    return;
  }

  const refreshPromise = (async () => {
    const tokenData = await fetchRuntimeOIDCToken(connectionConfig);
    if (!tokenData) {
      return;
    }

    if (!connectionConfig.oidc_auth || typeof connectionConfig.oidc_auth !== 'object') {
      connectionConfig.oidc_auth = {};
    }

    connectionConfig.oidc_auth.token = tokenData.token;
    connectionConfig.oidc_auth.expires_at = tokenData.expires_at;
  })();

  oidcRefreshInFlight.set(refreshKey, refreshPromise);

  try {
    await refreshPromise;
  } finally {
    if (oidcRefreshInFlight.get(refreshKey) === refreshPromise) {
      oidcRefreshInFlight.delete(refreshKey);
    }
  }
};

/**
 * Builds backend authentication headers for proxy requests.
 * These headers are consumed by the Go proxy and must never be sent via query params.
 */
export const buildBackendAuthHeaders = async (connectionConfig: any, init?: HeadersInit): Promise<Headers> => {
  await ensureRuntimeOIDCToken(connectionConfig);

  const headers = new Headers(init || {});
  const { authType, authValue } = prepareAuthParams(connectionConfig);

  if (authType && authValue) {
    headers.set('x-auth-type', authType);
    headers.set('x-auth-value', authValue);
  }

  if (connectionConfig?.ssh_tunnel?.enabled) {
    const remoteTarget = String(connectionConfig?.ssh_tunnel?.remote_target || '').trim();
    const remotePort = Number(connectionConfig?.ssh_tunnel?.remote_port || 0);
    if (remoteTarget && Number.isFinite(remotePort) && remotePort > 0 && remotePort <= 65535) {
      headers.set('x-ssh-tunnel-enabled', 'true');
      headers.set('x-ssh-remote-target', remoteTarget);
      headers.set('x-ssh-remote-port', String(Math.floor(remotePort)));

      const cachedPassphrase = readCachedSSHPassphrase('runtime');
      if (cachedPassphrase) {
        headers.set('x-ssh-passphrase', cachedPassphrase);
      }
    }
  }

  return headers;
};

/**
 * Extracts a detailed error message from an API response
 * @param response - The Response object from a fetch request
 * @returns A formatted error message string
 */
export const extractErrorMessage = async (response: Response): Promise<string> => {
  const errorData = await response.json().catch(() => ({ error: response.statusText }));

  // Extract more detailed error information if available
  let errorMessage = errorData.error || response.statusText;

  // Add HTTP status code to the error message
  errorMessage = `[${response.status} ${response.statusText}] ${errorMessage}`;

  // Check if there are detailed error information fields
  if (errorData.details) {
    errorMessage = `${errorMessage}: ${errorData.details}`;
  } else if (errorData.code) {
    errorMessage = `${errorMessage} (Code: ${errorData.code})`;
  }

  // Check if there's a more detailed error message in the result field
  if (errorData.result && typeof errorData.result === 'object') {
    if (errorData.result.error) {
      errorMessage = `${errorMessage}: ${errorData.result.error}`;
    } else if (typeof errorData.result === 'string') {
      errorMessage = `${errorMessage}: ${errorData.result}`;
    } else if (JSON.stringify(errorData.result) !== '{}') {
      errorMessage = `${errorMessage}: ${JSON.stringify(errorData.result)}`;
    }
  }

  return errorMessage;
};

/**
 * Checks connection to the backend
 * @param connectionConfig - The connection configuration object
 * @param setConnectionStatus - Function to set the connection status
 * @param setStatusMessage - Function to set the status message
 */
export const checkConnection = async (
  connectionConfig: any,
  setConnectionStatus: (status: 'unknown' | 'connected' | 'disconnected' | 'checking') => void,
  setStatusMessage: (message: string) => void
) => {
  if (!connectionConfig.backend_url) {
    // Treat missing URL as a disconnected state to avoid lingering "Not checked"
    setConnectionStatus('disconnected');
    setStatusMessage('No backend URL configured');
    return;
  }

  setConnectionStatus('checking');
  setStatusMessage('Checking connection...');

  try {
    // Use the proxy endpoint to make the request server-side
    const proxyUrl = new URL('/proxy/ping', getProxyOrigin());
    proxyUrl.searchParams.append('url', connectionConfig.backend_url);

    // Use the authenticatedFetch helper
    const response = await authenticatedFetch(proxyUrl.toString(), {
      method: 'GET',
      headers: await buildBackendAuthHeaders(connectionConfig),
    });

    if (response.ok) {
      setConnectionStatus('connected');
      setStatusMessage('Connected to Nauthilus backend (ping successful)');
    } else {
      setConnectionStatus('disconnected');
      const errorMessage = await extractErrorMessage(response);
      setStatusMessage(`Failed to connect: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error checking connection:', error);
    setConnectionStatus('disconnected');
    setStatusMessage(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Helper function to wrap operations with error handling
 * @param setLoading - Function to set loading state
 * @param setError - Function to set error state
 * @param operation - The operation to execute
 * @param errorMessage - Error message to display if operation fails
 * @returns The result of the operation or undefined if it fails
 */
export const withErrorHandling = async <T,>(
  setLoading: (loading: boolean) => void,
  setError: (error: string | null) => void,
  operation: () => Promise<T> | T,
  errorMessage: string
): Promise<T | undefined> => {
  try {
    setLoading(true);
    setError(null);
    return await operation();
  } catch (err) {
    setError(errorMessage);
    console.error(`${errorMessage}:`, err);
    return undefined;
  } finally {
    setLoading(false);
  }
};

/**
 * Resets the settings state to force a reload on the next call to loadSettings
 */
export const resetSettingsState = () => {
  if (window.__settingsState) {
    window.__settingsState.loaded = false;
  }
  console.log('Settings state reset, next call to loadSettings will reload settings');
};

/**
 * Performs an authenticated fetch request with robust 401 handling.
 * - Sends credentials to proxy
 * - On 401, performs a single-flight refresh and retries the request once
 */

// Single-flight refresh state for fetch-based requests
let isRefreshingFetch = false;
let waitersFetch: Array<(ok: boolean) => void> = [];

async function refreshSessionFetch(): Promise<boolean> {
  try {
    const headers = await attachCSRFHeader();
    const resp = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers,
      credentials: 'include'
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function waitForRefresh(): Promise<boolean> {
  return new Promise((resolve) => waitersFetch.push(resolve));
}

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/logout') ||
    url.includes('/api/auth/me') ||
    url.includes('/api/auth/webauthn/') ||
    url.includes('/api/auth/totp/')
  );
}

function getRequestPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function isProxyEndpoint(url: string): boolean {
  return getRequestPath(url).startsWith('/proxy/');
}

function hasSessionAuthRequiredHeader(response: Response): boolean {
  const marker = response.headers.get('x-nauthilus-auth-required');
  if (!marker) {
    return false;
  }

  return marker === '1' || marker.toLowerCase() === 'true';
}

function shouldNotifySessionExpired(url: string, response: Response): boolean {
  if (!isProxyEndpoint(url)) {
    return true;
  }

  // Proxy endpoints can return upstream 401 (backend auth failure) that are
  // unrelated to UI session state. Only treat them as session expiry when the
  // API explicitly marks the response as UI-auth-required.
  return hasSessionAuthRequiredHeader(response);
}

async function notifySessionExpiredDialog(): Promise<void> {
  try {
    const { notifySessionExpired } = await import('./notify');
    notifySessionExpired('Your session has expired. Please sign in again.');
  } catch {
    // eslint-disable-next-line no-alert
    window.alert('Your session has expired. Please sign in again.');
  }
}

export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const method = (options.method || 'GET').toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && hasBody && (options.body as any) instanceof FormData;

  const buildFetchOptions = async (): Promise<RequestInit> => {
    let headers = new Headers(options.headers || {});

    // Decide whether to set a default Content-Type
    if (hasBody && !isFormData && !headers.has('Content-Type') && method !== 'GET' && method !== 'HEAD') {
      headers.set('Content-Type', 'application/json');
    }

    // Build CSRF header per attempt so retries use the latest rotated CSRF cookie.
    if (!url.includes('/api/auth/csrf') && isMutatingMethod(method)) {
      headers = await attachCSRFHeader(headers);
    }

    return {
      ...options,
      headers,
      credentials: 'include'
    };
  };

  async function doFetchOnce(): Promise<Response> {
    const fetchOptions = await buildFetchOptions();
    return fetch(url, fetchOptions);
  }

  let response = await doFetchOnce();
  if (response.status !== 401) {
    return response;
  }

  // Don't attempt refresh for auth endpoints themselves
  if (isAuthEndpoint(url)) {
    return response;
  }

  if (!isRefreshingFetch) {
    isRefreshingFetch = true;
    try {
      const ok = await refreshSessionFetch();
      // Wake up waiters
      waitersFetch.forEach((fn) => fn(ok));
      waitersFetch = [];

      if (ok) {
        // Retry once
        response = await doFetchOnce();
        if (response.status === 401 && shouldNotifySessionExpired(url, response)) {
          await notifySessionExpiredDialog();
        }
        return response;
      }

      // Refresh failed
      if (shouldNotifySessionExpired(url, response)) {
        await notifySessionExpiredDialog();
      }
      return response;
    } finally {
      isRefreshingFetch = false;
    }
  }

  // Another refresh is in progress – wait and retry once if it succeeded
  const ok = await waitForRefresh();
  if (ok) {
    const retried = await doFetchOnce();
    if (retried.status === 401 && shouldNotifySessionExpired(url, retried)) {
      await notifySessionExpiredDialog();
    }
    return retried;
  }
  return response;
};

/**
 * Sends HTML to the backend to generate a server-side PDF and returns the Blob.
 */
export const generatePDFServerSide = async (html: string, filename?: string): Promise<Blob> => {
  const res = await authenticatedFetch('/api/report/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename })
  });
  if (!res.ok) {
    const msg = await extractErrorMessage(res).catch(async () => `${res.status} ${res.statusText}`);
    throw new Error(msg);
  }
  return await res.blob();
};

/**
 * Loads runtime settings and checks connection status
 * @param getCurrentUserId - Function to get the current user ID
 * @param loadRuntimeSettings - Function to load runtime settings
 * @param currentProfileName - Current profile name
 * @param checkConnection - Function to check connection status
 * @param getConnection - Function to get the current connection configuration
 */
export const loadSettings = async (
  getCurrentUserId: () => Promise<string>,
  loadRuntimeSettings: (userId: string, profileName: string) => Promise<any>,
  currentProfileName: string,
  checkConnection: (connectionConfig: any) => Promise<void>,
  getConnection: () => any
) => {
  try {
    // Get current connection data (may be empty on first render)
    const currentConnection = getConnection();
    const currentConnectionUrl = currentConnection?.backend_url || '';

    // Initialize settings state singleton on window
    if (!window.__settingsState) {
      window.__settingsState = {
        loaded: false,
        profileName: '',
        connectionUrl: '',
        lastCheckedUrl: '',
        lastCheckedAt: 0,
        inFlightKey: '',
        inFlightPromise: undefined as Promise<void> | undefined,
      } as any;
    }

    const state: any = window.__settingsState!;

    // Helper: decide whether we should run a connection check right now
    const shouldCheckNow = (url: string): boolean => {
      if (!url) return false; // nothing to check
      // Avoid immediate repeats (e.g., React StrictMode double effects in DEV)
      const now = Date.now();
      const lastUrl = state.lastCheckedUrl || '';
      const lastAt = state.lastCheckedAt || 0;
      const isSameUrl = lastUrl === url;
      const withinDebounce = now - lastAt < 1500; // 1.5s debounce window
      return !(isSameUrl && withinDebounce);
    };

    // Compute a key for the current desired load
    const desiredKey = `${currentProfileName}|${currentConnectionUrl}`;

    // If a matching load is already in-flight, await it instead of starting another
    if (state.inFlightPromise && state.inFlightKey === desiredKey) {
      await state.inFlightPromise;
      // After in-flight finishes, do a debounced ping if needed and exit
      if (shouldCheckNow(currentConnectionUrl)) {
        await checkConnection(getConnection());
        state.lastCheckedUrl = currentConnectionUrl;
        state.lastCheckedAt = Date.now();
      }
      return;
    }

    // Check if we actually need to reload
    const needsReload = !state.loaded ||
      state.profileName !== currentProfileName ||
      state.connectionUrl !== currentConnectionUrl;

    if (!needsReload) {
      // Already up-to-date, just do a debounced connection check
      if (shouldCheckNow(currentConnectionUrl)) {
        await checkConnection(currentConnection);
        state.lastCheckedUrl = currentConnectionUrl;
        state.lastCheckedAt = Date.now();
      }
      return;
    }

    // Start a new in-flight load for this key
    state.inFlightKey = desiredKey;
    state.inFlightPromise = (async () => {
      console.log(`Loading settings for profile: ${currentProfileName}, preload connection: ${currentConnectionUrl || '(none)'}`);
      const userId = await getCurrentUserId();
      const loadedConnection = await loadRuntimeSettings(userId, currentProfileName);

      // Prefer the freshly loaded runtime data over the asynchronously updated React state.
      const connectionToCheck = loadedConnection || getConnection();
      const urlToCheck = connectionToCheck?.backend_url || '';
      console.log(`Runtime settings loaded for profile: ${currentProfileName}, effective connection: ${urlToCheck || '(none)'}`);
      if (shouldCheckNow(urlToCheck)) {
        await checkConnection(connectionToCheck);
        state.lastCheckedUrl = urlToCheck;
        state.lastCheckedAt = Date.now();
      }

      // Mark as loaded
      state.loaded = true;
      state.profileName = currentProfileName;
      state.connectionUrl = urlToCheck;
    })();

    try {
      await state.inFlightPromise;
    } finally {
      // Clear in-flight markers only if they correspond to this key
      if (state.inFlightKey === desiredKey) {
        state.inFlightPromise = undefined;
        state.inFlightKey = '';
      }
    }
  } catch (error) {
    console.error('Failed to load runtime settings:', error);
  }
};
