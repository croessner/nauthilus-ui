import type { EndpointConfig } from '../types/config';

const DISABLED_ENDPOINT_KEYS = [
  'auth_header',
  'auth_json',
  'auth_basic',
  'auth_nginx',
  'auth_jwt',
  'custom_hooks',
  'configuration',
] as const;

type DisabledEndpointKey = (typeof DISABLED_ENDPOINT_KEYS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Retains only backend-supported server.disabled_endpoints keys.
 */
export const sanitizeDisabledEndpoints = (value: unknown): EndpointConfig | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const sanitized: Partial<Record<DisabledEndpointKey, boolean>> = {};

  DISABLED_ENDPOINT_KEYS.forEach((key) => {
    const endpointValue = value[key];
    if (typeof endpointValue === 'boolean') {
      sanitized[key] = endpointValue;
    }
  });

  if (Object.keys(sanitized).length === 0) {
    return undefined;
  }

  return sanitized as EndpointConfig;
};
