export interface GitDialogSettings {
  repositoryUrl: string;
  branch: string;
  filePath: string;
  tagName: string;
  useSsh: boolean;
  httpsUsername: string;
}

const MAX_REPOSITORY_URL_LENGTH = 2048;
const MAX_BRANCH_LENGTH = 255;
const MAX_FILE_PATH_LENGTH = 1024;
const MAX_TAG_LENGTH = 255;
const MAX_USERNAME_LENGTH = 255;

function trimToMax(raw: string, maxLen: number): string {
  const trimmed = String(raw || '').trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }

  return trimmed.slice(0, maxLen);
}

/**
 * Normalizes Git dialog settings to a safe payload shape before sending them to the backend.
 * Secrets like password/passphrase are intentionally not part of this contract.
 */
export function normalizeGitDialogSettings(input: Partial<GitDialogSettings> | null | undefined): GitDialogSettings {
  return {
    repositoryUrl: trimToMax(String(input?.repositoryUrl || ''), MAX_REPOSITORY_URL_LENGTH),
    branch: trimToMax(String(input?.branch || ''), MAX_BRANCH_LENGTH),
    filePath: trimToMax(String(input?.filePath || ''), MAX_FILE_PATH_LENGTH),
    tagName: trimToMax(String(input?.tagName || ''), MAX_TAG_LENGTH),
    useSsh: Boolean(input?.useSsh),
    httpsUsername: trimToMax(String(input?.httpsUsername || ''), MAX_USERNAME_LENGTH),
  };
}
