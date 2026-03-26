import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGitDialogSettings } from '../../src/utils/gitDialogSettings.ts';

test('normalizes missing input to an empty settings payload', () => {
  assert.deepEqual(normalizeGitDialogSettings(undefined), {
    repositoryUrl: '',
    branch: '',
    filePath: '',
    tagName: '',
    useSsh: false,
    httpsUsername: '',
  });
});

test('trims and truncates settings fields to safe limits', () => {
  const long = (char, size) => Array.from({ length: size }).fill(char).join('');
  const normalized = normalizeGitDialogSettings({
    repositoryUrl: `  ${long('r', 2200)}  `,
    branch: `  ${long('b', 400)}  `,
    filePath: `  ${long('f', 1400)}  `,
    tagName: `  ${long('t', 400)}  `,
    useSsh: true,
    httpsUsername: `  ${long('u', 400)}  `,
  });

  assert.equal(normalized.repositoryUrl.length, 2048);
  assert.equal(normalized.branch.length, 255);
  assert.equal(normalized.filePath.length, 1024);
  assert.equal(normalized.tagName.length, 255);
  assert.equal(normalized.httpsUsername.length, 255);
  assert.equal(normalized.useSsh, true);
});
