import type { FeatureConfig } from '../types/config';

export type ServerFeature = string | FeatureConfig;

export interface FeatureExecutionFlags {
  when_authenticated: boolean;
  when_unauthenticated: boolean;
  when_no_auth: boolean;
}

export const defaultFeatureExecutionFlags: FeatureExecutionFlags = {
  when_authenticated: true,
  when_unauthenticated: true,
  when_no_auth: false,
};

export const getServerFeatureName = (feature: ServerFeature): string => {
  return typeof feature === 'string' ? feature : feature.name;
};

export const getFeatureExecutionFlags = (feature: ServerFeature): FeatureExecutionFlags => {
  if (typeof feature === 'string') {
    return { ...defaultFeatureExecutionFlags };
  }

  const whenAuthenticated = feature.when_authenticated;
  const whenUnauthenticated = feature.when_unauthenticated;
  const whenNoAuth = feature.when_no_auth;

  if (
    whenAuthenticated === undefined &&
    whenUnauthenticated === undefined &&
    whenNoAuth === undefined
  ) {
    return { ...defaultFeatureExecutionFlags };
  }

  return {
    when_authenticated: whenAuthenticated ?? defaultFeatureExecutionFlags.when_authenticated,
    when_unauthenticated: whenUnauthenticated ?? defaultFeatureExecutionFlags.when_unauthenticated,
    when_no_auth: whenNoAuth ?? defaultFeatureExecutionFlags.when_no_auth,
  };
};

export const hasServerFeature = (
  features: ServerFeature[] | undefined,
  featureName: string
): boolean => {
  return Array.isArray(features) && features.some((feature) => getServerFeatureName(feature) === featureName);
};

export const shouldPersistFeatureExecutionFlags = (flags: FeatureExecutionFlags): boolean => {
  return (
    flags.when_authenticated !== defaultFeatureExecutionFlags.when_authenticated ||
    flags.when_unauthenticated !== defaultFeatureExecutionFlags.when_unauthenticated ||
    flags.when_no_auth !== defaultFeatureExecutionFlags.when_no_auth
  );
};

export const createServerFeatureEntry = (
  featureName: string,
  flags: FeatureExecutionFlags,
  ignoreExecutionFlags = false
): ServerFeature => {
  if (ignoreExecutionFlags || !shouldPersistFeatureExecutionFlags(flags)) {
    return featureName;
  }

  return {
    name: featureName,
    when_authenticated: flags.when_authenticated,
    when_unauthenticated: flags.when_unauthenticated,
    when_no_auth: flags.when_no_auth,
  };
};
