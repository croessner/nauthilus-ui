import type {
  ContentSecurityPolicyConfig,
  FrontendSecurityHeadersConfig,
  PermissionsPolicyConfig,
  StrictTransportSecurityConfig,
  StringOrStringList,
} from '../types/config';

export const CspDirectiveNames = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'object-src',
  'base-uri',
  'frame-ancestors',
  'form-action',
] as const;

export type CspDirectiveName = typeof CspDirectiveNames[number];
export type CspDirectiveMap = Record<CspDirectiveName, string[]>;

export interface NormalizedContentSecurityPolicyConfig {
  directives: CspDirectiveMap;
  form_action_optional_uris: string[];
}

export interface NormalizedStrictTransportSecurityConfig {
  max_age: string;
  include_subdomains: boolean;
  preload: boolean;
  extra_tokens: string[];
}

export interface NormalizedPermissionsPolicyConfig {
  features: Record<string, string>;
}

export interface NormalizedFrontendSecurityHeadersConfig {
  enabled: boolean;
  content_security_policy: NormalizedContentSecurityPolicyConfig;
  content_security_policy_report_only: boolean;
  strict_transport_security: NormalizedStrictTransportSecurityConfig;
  x_content_type_options: string;
  x_frame_options: string;
  referrer_policy: string;
  permissions_policy: NormalizedPermissionsPolicyConfig;
  cross_origin_opener_policy: string;
  cross_origin_resource_policy: string;
  cross_origin_embedder_policy: string;
  x_permitted_cross_domain_policies: string;
  x_dns_prefetch_control: string;
}

export const DefaultContentSecurityPolicyDirectives: CspDirectiveMap = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'nonce-{{nonce}}'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'frame-src': ["'self'", 'https:'],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'", 'https:'],
};

export const DefaultStrictTransportSecurity: NormalizedStrictTransportSecurityConfig = {
  max_age: '31536000',
  include_subdomains: true,
  preload: false,
  extra_tokens: [],
};

export const DefaultPermissionsPolicyFeatures: Record<string, string> = {
  geolocation: '()',
  microphone: '()',
  camera: '()',
  payment: '()',
  usb: '()',
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const compactStringList = (values: string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }

    seen.add(trimmed);
    result.push(trimmed);
  });

  return result;
};

const toCompactStringList = (value: StringOrStringList | unknown): string[] => {
  if (typeof value === 'string') {
    return compactStringList([value]);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return compactStringList(value.filter((entry): entry is string => typeof entry === 'string'));
};

const parseCspDirectiveSources = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return compactStringList(value.split(/\s+/));
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return compactStringList(value.filter((entry): entry is string => typeof entry === 'string'));
};

const normalizeObjectConfigKey = (key: string): string => {
  return key.trim().toLowerCase().replaceAll('-', '_');
};

const normalizeCspDirectiveName = (name: string): string => {
  const normalized = name.trim().toLowerCase().replaceAll('_', '-');
  if (normalized === 'form-actions') {
    return 'form-action';
  }

  return normalized;
};

const isKnownCspDirective = (value: string): value is CspDirectiveName => {
  return (CspDirectiveNames as readonly string[]).includes(value);
};

const cloneDefaultCspDirectives = (): CspDirectiveMap => {
  const cloned = {} as CspDirectiveMap;

  CspDirectiveNames.forEach((directiveName) => {
    cloned[directiveName] = [...DefaultContentSecurityPolicyDirectives[directiveName]];
  });

  return cloned;
};

const applyOptionalFormActionUris = (
  directives: CspDirectiveMap,
  formActionOverridden: boolean,
  optionalUris: string[],
): void => {
  if (optionalUris.length === 0) {
    return;
  }

  const current = [...(directives['form-action'] || [])];
  let next = current;

  if (!formActionOverridden) {
    next = next.filter((value) => value !== 'https:');
  }

  optionalUris.forEach((uri) => {
    if (!next.includes(uri)) {
      next.push(uri);
    }
  });

  directives['form-action'] = compactStringList(next);
};

const normalizeContentSecurityPolicyFromObject = (raw: Record<string, unknown>): NormalizedContentSecurityPolicyConfig => {
  const directives = cloneDefaultCspDirectives();
  let formActionOverridden = false;
  let optionalUris: string[] = [];

  Object.entries(raw).forEach(([key, value]) => {
    const normalizedKey = normalizeObjectConfigKey(key);

    if (normalizedKey === 'directives' && isRecord(value)) {
      Object.entries(value).forEach(([directiveName, directiveValue]) => {
        const normalizedDirective = normalizeCspDirectiveName(directiveName);
        if (!isKnownCspDirective(normalizedDirective)) {
          return;
        }

        if (normalizedDirective === 'form-action') {
          formActionOverridden = true;
        }

        directives[normalizedDirective] = parseCspDirectiveSources(directiveValue);
      });

      return;
    }

    if (normalizedKey === 'form_action_optional_uris') {
      optionalUris = toCompactStringList(value);
      return;
    }

    const normalizedDirective = normalizeCspDirectiveName(key);
    if (!isKnownCspDirective(normalizedDirective)) {
      return;
    }

    if (normalizedDirective === 'form-action') {
      formActionOverridden = true;
    }

    directives[normalizedDirective] = parseCspDirectiveSources(value);
  });

  applyOptionalFormActionUris(directives, formActionOverridden, optionalUris);

  return {
    directives,
    form_action_optional_uris: optionalUris,
  };
};

const normalizeContentSecurityPolicyFromText = (raw: StringOrStringList): NormalizedContentSecurityPolicyConfig => {
  const directives = cloneDefaultCspDirectives();
  let formActionOverridden = false;

  const rawValues = typeof raw === 'string' ? [raw] : raw;
  rawValues.forEach((value) => {
    value.split(';').forEach((directivePart) => {
      const fields = directivePart.trim().split(/\s+/).filter(Boolean);
      if (fields.length === 0) {
        return;
      }

      const normalizedDirective = normalizeCspDirectiveName(fields[0]);
      if (!isKnownCspDirective(normalizedDirective)) {
        return;
      }

      if (normalizedDirective === 'form-action') {
        formActionOverridden = true;
      }

      directives[normalizedDirective] = compactStringList(fields.slice(1));
    });
  });

  applyOptionalFormActionUris(directives, formActionOverridden, []);

  return {
    directives,
    form_action_optional_uris: [],
  };
};

export const normalizeContentSecurityPolicy = (
  raw: ContentSecurityPolicyConfig | undefined,
): NormalizedContentSecurityPolicyConfig => {
  if (raw === undefined || raw === null) {
    return {
      directives: cloneDefaultCspDirectives(),
      form_action_optional_uris: [],
    };
  }

  if (typeof raw === 'string' || Array.isArray(raw)) {
    return normalizeContentSecurityPolicyFromText(raw);
  }

  if (isRecord(raw)) {
    return normalizeContentSecurityPolicyFromObject(raw);
  }

  return {
    directives: cloneDefaultCspDirectives(),
    form_action_optional_uris: [],
  };
};

const parsePermissionsFeatureValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const normalizePermissionsPolicyFromObject = (raw: Record<string, unknown>): NormalizedPermissionsPolicyConfig => {
  const features: Record<string, string> = { ...DefaultPermissionsPolicyFeatures };

  Object.entries(raw).forEach(([key, value]) => {
    const normalizedKey = normalizeObjectConfigKey(key);

    if (normalizedKey === 'features' && isRecord(value)) {
      Object.entries(value).forEach(([featureName, featureValue]) => {
        const normalizedFeatureName = featureName.trim().toLowerCase();
        const parsedValue = parsePermissionsFeatureValue(featureValue);
        if (!normalizedFeatureName || !parsedValue) {
          return;
        }

        features[normalizedFeatureName] = parsedValue;
      });

      return;
    }

    const normalizedFeatureName = key.trim().toLowerCase();
    const parsedValue = parsePermissionsFeatureValue(value);
    if (!normalizedFeatureName || !parsedValue) {
      return;
    }

    features[normalizedFeatureName] = parsedValue;
  });

  return { features };
};

const normalizePermissionsPolicyFromText = (raw: StringOrStringList): NormalizedPermissionsPolicyConfig => {
  const features: Record<string, string> = { ...DefaultPermissionsPolicyFeatures };
  const rawValues = typeof raw === 'string' ? [raw] : raw;

  rawValues.forEach((value) => {
    value.split(',').forEach((directivePart) => {
      const trimmed = directivePart.trim();
      if (!trimmed) {
        return;
      }

      const parts = trimmed.split('=');
      if (parts.length < 2) {
        return;
      }

      const feature = parts.shift()?.trim().toLowerCase() || '';
      const featureValue = parts.join('=').trim();
      if (!feature || !featureValue) {
        return;
      }

      features[feature] = featureValue;
    });
  });

  return { features };
};

export const normalizePermissionsPolicy = (
  raw: PermissionsPolicyConfig | undefined,
): NormalizedPermissionsPolicyConfig => {
  if (raw === undefined || raw === null) {
    return { features: { ...DefaultPermissionsPolicyFeatures } };
  }

  if (typeof raw === 'string' || Array.isArray(raw)) {
    return normalizePermissionsPolicyFromText(raw);
  }

  if (isRecord(raw)) {
    return normalizePermissionsPolicyFromObject(raw);
  }

  return { features: { ...DefaultPermissionsPolicyFeatures } };
};

const normalizeStrictTransportSecurityFromObject = (raw: Record<string, unknown>): NormalizedStrictTransportSecurityConfig => {
  const result: NormalizedStrictTransportSecurityConfig = { ...DefaultStrictTransportSecurity };

  Object.entries(raw).forEach(([key, value]) => {
    const normalizedKey = normalizeObjectConfigKey(key);

    switch (normalizedKey) {
      case 'max_age':
        if (typeof value === 'string' && value.trim()) {
          result.max_age = value.trim();
        } else if (typeof value === 'number' && Number.isFinite(value)) {
          result.max_age = String(Math.trunc(value));
        }
        break;
      case 'include_subdomains':
        if (typeof value === 'boolean') {
          result.include_subdomains = value;
        }
        break;
      case 'preload':
        if (typeof value === 'boolean') {
          result.preload = value;
        }
        break;
      case 'extra_tokens':
        result.extra_tokens = toCompactStringList(value);
        break;
      default:
        break;
    }
  });

  return result;
};

const normalizeStrictTransportSecurityFromText = (raw: StringOrStringList): NormalizedStrictTransportSecurityConfig => {
  const result: NormalizedStrictTransportSecurityConfig = { ...DefaultStrictTransportSecurity };
  const rawValues = typeof raw === 'string' ? [raw] : raw;
  const extraTokens: string[] = [];

  rawValues.forEach((value) => {
    value.split(';').forEach((token) => {
      const trimmedToken = token.trim();
      if (!trimmedToken) {
        return;
      }

      const lowerToken = trimmedToken.toLowerCase();

      if (lowerToken.startsWith('max-age=')) {
        const maxAgeValue = trimmedToken.slice('max-age='.length).trim();
        if (maxAgeValue) {
          result.max_age = maxAgeValue;
        }
        return;
      }

      if (lowerToken === 'includesubdomains') {
        result.include_subdomains = true;
        return;
      }

      if (lowerToken === 'preload') {
        result.preload = true;
        return;
      }

      extraTokens.push(trimmedToken);
    });
  });

  result.extra_tokens = compactStringList(extraTokens);

  return result;
};

export const normalizeStrictTransportSecurity = (
  raw: StrictTransportSecurityConfig | undefined,
): NormalizedStrictTransportSecurityConfig => {
  if (raw === undefined || raw === null) {
    return { ...DefaultStrictTransportSecurity };
  }

  if (typeof raw === 'string' || Array.isArray(raw)) {
    return normalizeStrictTransportSecurityFromText(raw);
  }

  if (isRecord(raw)) {
    return normalizeStrictTransportSecurityFromObject(raw);
  }

  return { ...DefaultStrictTransportSecurity };
};

const normalizeStringWithDefault = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
};

export const normalizeFrontendSecurityHeaders = (
  raw: FrontendSecurityHeadersConfig | undefined | null,
): NormalizedFrontendSecurityHeadersConfig => {
  const input = raw || {};

  return {
    enabled: input.enabled ?? true,
    content_security_policy: normalizeContentSecurityPolicy(input.content_security_policy),
    content_security_policy_report_only: input.content_security_policy_report_only ?? false,
    strict_transport_security: normalizeStrictTransportSecurity(input.strict_transport_security),
    x_content_type_options: normalizeStringWithDefault(input.x_content_type_options, 'nosniff'),
    x_frame_options: normalizeStringWithDefault(input.x_frame_options, 'DENY'),
    referrer_policy: normalizeStringWithDefault(input.referrer_policy, 'no-referrer'),
    permissions_policy: normalizePermissionsPolicy(input.permissions_policy),
    cross_origin_opener_policy: normalizeStringWithDefault(input.cross_origin_opener_policy, 'same-origin'),
    cross_origin_resource_policy: normalizeStringWithDefault(input.cross_origin_resource_policy, 'same-origin'),
    cross_origin_embedder_policy: normalizeStringWithDefault(input.cross_origin_embedder_policy, 'unsafe-none'),
    x_permitted_cross_domain_policies: normalizeStringWithDefault(input.x_permitted_cross_domain_policies, 'none'),
    x_dns_prefetch_control: normalizeStringWithDefault(input.x_dns_prefetch_control, 'off'),
  };
};

export const toObjectBasedFrontendSecurityHeaders = (
  raw: FrontendSecurityHeadersConfig | NormalizedFrontendSecurityHeadersConfig | undefined | null,
): FrontendSecurityHeadersConfig => {
  const normalized = normalizeFrontendSecurityHeaders(raw as FrontendSecurityHeadersConfig | undefined);

  return {
    enabled: normalized.enabled,
    content_security_policy: {
      directives: Object.fromEntries(
        CspDirectiveNames.map((directiveName) => [directiveName, [...normalized.content_security_policy.directives[directiveName]]]),
      ),
      form_action_optional_uris: [...normalized.content_security_policy.form_action_optional_uris],
    },
    content_security_policy_report_only: normalized.content_security_policy_report_only,
    strict_transport_security: {
      max_age: normalized.strict_transport_security.max_age,
      include_subdomains: normalized.strict_transport_security.include_subdomains,
      preload: normalized.strict_transport_security.preload,
      extra_tokens: [...normalized.strict_transport_security.extra_tokens],
    },
    x_content_type_options: normalized.x_content_type_options,
    x_frame_options: normalized.x_frame_options,
    referrer_policy: normalized.referrer_policy,
    permissions_policy: {
      features: { ...normalized.permissions_policy.features },
    },
    cross_origin_opener_policy: normalized.cross_origin_opener_policy,
    cross_origin_resource_policy: normalized.cross_origin_resource_policy,
    cross_origin_embedder_policy: normalized.cross_origin_embedder_policy,
    x_permitted_cross_domain_policies: normalized.x_permitted_cross_domain_policies,
    x_dns_prefetch_control: normalized.x_dns_prefetch_control,
  };
};
