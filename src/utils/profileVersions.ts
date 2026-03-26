import { authenticatedFetch } from './apiUtils';
import { getCurrentUserId } from './currentUser';
import type { YamlExportProfileVersion } from './yamlExportComment';

export interface ProfileVersionItem {
  profileName: string;
  version: number;
  createdAt: string;
  createdBy: string;
  source: string;
  comment?: string;
  metadata?: Record<string, unknown>;
}

const toPositiveInteger = (value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    return 1;
  }

  return value;
};

export const fetchProfileVersions = async (profileName: string, limit = 200): Promise<ProfileVersionItem[]> => {
  const userId = await getCurrentUserId();
  const normalizedProfileName = String(profileName || '').trim();
  const normalizedLimit = toPositiveInteger(limit);
  const endpoint = `/api/profiles/${encodeURIComponent(userId)}/${encodeURIComponent(normalizedProfileName)}/versions?limit=${normalizedLimit}`;
  const response = await authenticatedFetch(endpoint);

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || 'Failed to load profile versions');
  }

  const payload = await response.json().catch(() => ({ items: [] as ProfileVersionItem[] }));
  if (!Array.isArray(payload?.items)) {
    return [];
  }

  return payload.items as ProfileVersionItem[];
};

export const toYamlExportProfileVersion = (item: ProfileVersionItem | null | undefined): YamlExportProfileVersion | null => {
  if (!item) {
    return null;
  }

  return {
    version: item.version,
    source: item.source,
    createdAt: item.createdAt,
    createdBy: item.createdBy,
    comment: item.comment,
    metadata: item.metadata,
  };
};

export const fetchLatestYamlExportProfileVersion = async (profileName: string): Promise<YamlExportProfileVersion | null> => {
  const items = await fetchProfileVersions(profileName, 1);
  if (items.length === 0) {
    return null;
  }

  return toYamlExportProfileVersion(items[0]);
};
