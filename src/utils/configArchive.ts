import JSZip from 'jszip';
import yaml from 'js-yaml';
import { NauthilusConfig } from '../types/config';
import { formatConfigAsYaml, orderTopLevelConfigKeys } from './yamlUtils';
import { prependYamlExportComment, type YamlExportProfileVersion } from './yamlExportComment';

export type ConfigDownloadFormat = 'yaml' | 'zip';

type ConfigSettings = Record<string, any>;

type PatchOperation = {
  op: string;
  path: string;
  value?: any;
};

type IncludeGroup = {
  required?: string[];
  optional?: string[];
};

type IncludeSpec = IncludeGroup & {
  env?: Record<string, IncludeGroup>;
};

type IncludeFile = {
  path: string;
  required: boolean;
};

type LoadedConfigTree = {
  settings: ConfigSettings;
  patches: PatchOperation[];
};

const CONFIG_ROOT_CANDIDATES = [
  'nauthilus.yml',
  'nauthilus.yaml',
  'main.yml',
  'main.yaml',
  'config.yml',
  'config.yaml',
];

const YAML_EXTENSIONS = ['.yml', '.yaml'];
const JSON_EXTENSIONS = ['.json'];
const CONFIG_EXTENSIONS = [...YAML_EXTENSIONS, ...JSON_EXTENSIONS];
const INCLUDE_KEY = 'includes';
const PATCH_KEY = 'patch';
const ENV_KEY = 'env';

const PATCH_OP_ADD = 'add';
const PATCH_OP_REPLACE = 'replace';
const PATCH_OP_REMOVE = 'remove';

const isRecord = (value: unknown): value is ConfigSettings => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasConfigExtension = (path: string): boolean => {
  const lower = path.toLowerCase();
  return CONFIG_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const normalizeArchivePath = (inputPath: string): string => {
  const normalized = inputPath.replace(/\\/g, '/').trim();
  if (!normalized) {
    throw new Error('Encountered an empty path in the ZIP archive.');
  }
  if (normalized.startsWith('/')) {
    throw new Error(`Absolute paths are not supported in ZIP archives: ${inputPath}`);
  }

  const parts = normalized.split('/');
  const resolved: string[] = [];

  parts.forEach((part) => {
    if (!part || part === '.') {
      return;
    }
    if (part === '..') {
      if (resolved.length === 0) {
        throw new Error(`Path escapes the ZIP archive root: ${inputPath}`);
      }
      resolved.pop();
      return;
    }
    resolved.push(part);
  });

  if (resolved.length === 0) {
    throw new Error(`Invalid path in ZIP archive: ${inputPath}`);
  }

  return resolved.join('/');
};

const dirname = (filePath: string): string => {
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? '' : filePath.slice(0, idx);
};

const joinArchivePath = (baseDir: string, includePath: string): string => {
  const candidate = baseDir ? `${baseDir}/${includePath}` : includePath;
  return normalizeArchivePath(candidate);
};

const parseConfigDocument = (content: string, sourcePath: string): ConfigSettings => {
  let parsed: unknown;
  let parseError: unknown;
  const lowerPath = sourcePath.toLowerCase();

  try {
    if (JSON_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) {
      parsed = JSON.parse(content);
    } else if (YAML_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) {
      parsed = yaml.load(content);
    } else {
      throw new Error(`Unsupported config format for ${sourcePath}`);
    }
  } catch (error) {
    parseError = error;
  }

  if (parseError) {
    throw new Error(`Failed to parse ${sourcePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Configuration file ${sourcePath} must contain a YAML or JSON object at the root.`);
  }

  return parsed;
};

const cloneSettings = (settings: ConfigSettings): ConfigSettings => {
  return JSON.parse(JSON.stringify(settings));
};

const mergeSettings = (target: ConfigSettings, source: ConfigSettings): void => {
  Object.entries(source).forEach(([key, value]) => {
    if (isRecord(value) && isRecord(target[key])) {
      mergeSettings(target[key], value);
      return;
    }
    target[key] = value;
  });
};

const toIncludeFiles = (paths: string[] | undefined, required: boolean): IncludeFile[] => {
  if (!paths || paths.length === 0) {
    return [];
  }

  return paths
    .map((path) => String(path || '').trim())
    .filter(Boolean)
    .map((path) => ({ path, required }));
};

const resolveEnvName = (settings: ConfigSettings, fallbackEnvName = ''): string => {
  const envValue = settings[ENV_KEY];
  if (envValue === undefined || envValue === null || envValue === '') {
    return fallbackEnvName;
  }
  if (typeof envValue !== 'string') {
    throw new Error(`${ENV_KEY} must be a string, got ${typeof envValue}`);
  }

  return envValue.trim();
};

const resolveIncludes = (settings: ConfigSettings, fallbackEnvName = ''): IncludeFile[] => {
  const raw = settings[INCLUDE_KEY];
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!isRecord(raw)) {
    throw new Error(`${INCLUDE_KEY} must be an object.`);
  }

  const spec = raw as IncludeSpec;
  const includeFiles: IncludeFile[] = [
    ...toIncludeFiles(spec.required, true),
    ...toIncludeFiles(spec.optional, false),
  ];

  const envName = resolveEnvName(settings, fallbackEnvName);
  if (envName && spec.env && isRecord(spec.env)) {
    const envSpec = spec.env[envName];
    if (isRecord(envSpec)) {
      includeFiles.push(...toIncludeFiles(envSpec.required, true));
      includeFiles.push(...toIncludeFiles(envSpec.optional, false));
    }
  }

  return includeFiles;
};

const parsePatchOperations = (settings: ConfigSettings): PatchOperation[] => {
  const raw = settings[PATCH_KEY];
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`${PATCH_KEY} must be an array.`);
  }

  return raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Patch operation ${index + 1} must be an object.`);
    }

    const op = String(entry.op || '').trim();
    const path = String(entry.path || '').trim();
    if (!op || !path) {
      throw new Error(`Patch operation ${index + 1} requires both op and path.`);
    }

    return { op, path, value: entry.value };
  });
};

const stripLoaderKeys = (settings: ConfigSettings): void => {
  delete settings[INCLUDE_KEY];
  delete settings[PATCH_KEY];
  delete settings[ENV_KEY];
};

const deepEqual = (left: any, right: any): boolean => {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => deepEqual(value, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every((key) => rightKeys.includes(key) && deepEqual(left[key], right[key]));
  }

  return false;
};

const resolveParentMap = (root: ConfigSettings, parts: string[], create: boolean): { parent: ConfigSettings; key: string } => {
  if (parts.length === 0) {
    throw new Error('Patch path must not be empty.');
  }

  let current = root;
  parts.slice(0, -1).forEach((part) => {
    if (!part) {
      throw new Error('Patch path contains an empty segment.');
    }

    const next = current[part];
    if (next === undefined) {
      if (!create) {
        throw new Error(`Patch path ${parts.join('.')} not found.`);
      }
      current[part] = {};
      current = current[part] as ConfigSettings;
      return;
    }

    if (!isRecord(next)) {
      throw new Error(`Patch path ${parts.join('.')} is not a map.`);
    }

    current = next;
  });

  const key = parts[parts.length - 1];
  if (!key) {
    throw new Error('Patch path contains an empty segment.');
  }

  return { parent: current, key };
};

const applyAdd = (parent: ConfigSettings, key: string, value: any, fullPath: string): void => {
  const current = parent[key];
  if (current === undefined) {
    parent[key] = [value];
    return;
  }

  if (Array.isArray(current)) {
    parent[key] = [...current, value];
    return;
  }

  if (isRecord(current)) {
    if (!isRecord(value)) {
      throw new Error(`Add operation at ${fullPath} requires an object value.`);
    }
    Object.assign(current, value);
    return;
  }

  throw new Error(`Add operation at ${fullPath} expects an array or object, got ${typeof current}.`);
};

const removeMapKeys = (target: ConfigSettings, value: any, fullPath: string): void => {
  if (typeof value === 'string') {
    delete target[value];
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (typeof entry !== 'string') {
        throw new Error(`Remove operation at ${fullPath} expects string keys.`);
      }
      delete target[entry];
    });
    return;
  }

  throw new Error(`Remove operation at ${fullPath} expects a string or string array.`);
};

const applyRemove = (parent: ConfigSettings, key: string, value: any, fullPath: string): void => {
  const current = parent[key];
  if (current === undefined) {
    throw new Error(`Remove operation at ${fullPath} failed: path not found.`);
  }

  if (Array.isArray(current)) {
    parent[key] = current.filter((item) => !deepEqual(item, value));
    return;
  }

  if (isRecord(current)) {
    removeMapKeys(current, value, fullPath);
    return;
  }

  throw new Error(`Remove operation at ${fullPath} expects an array or object.`);
};

const applyPatchOperation = (target: ConfigSettings, patch: PatchOperation): void => {
  const path = patch.path.trim();
  if (!path) {
    throw new Error('Patch path must not be empty.');
  }

  const parts = path.split('.');
  const { parent, key } = resolveParentMap(target, parts, patch.op !== PATCH_OP_REMOVE);

  switch (patch.op) {
    case PATCH_OP_ADD:
      applyAdd(parent, key, patch.value, path);
      return;
    case PATCH_OP_REPLACE:
      parent[key] = patch.value;
      return;
    case PATCH_OP_REMOVE:
      applyRemove(parent, key, patch.value, path);
      return;
    default:
      throw new Error(`Unsupported patch operation ${patch.op}.`);
  }
};

const applyPatches = (target: ConfigSettings, patches: PatchOperation[]): void => {
  patches.forEach((patch) => applyPatchOperation(target, patch));
};

const detectArchiveRootConfig = (files: string[]): string => {
  const normalizedFiles = files.filter((filePath) => hasConfigExtension(filePath));
  if (normalizedFiles.length === 0) {
    throw new Error('No YAML or JSON configuration files were found in the ZIP archive.');
  }

  const exactCandidates = normalizedFiles.filter((filePath) => CONFIG_ROOT_CANDIDATES.includes(filePath));
  if (exactCandidates.length === 1) {
    return exactCandidates[0];
  }

  const basenameCandidates = normalizedFiles.filter((filePath) => CONFIG_ROOT_CANDIDATES.includes(filePath.split('/').pop() || ''));
  if (basenameCandidates.length === 1) {
    return basenameCandidates[0];
  }

  const topLevelConfigFiles = normalizedFiles.filter((filePath) => !filePath.includes('/'));
  if (topLevelConfigFiles.length === 1) {
    return topLevelConfigFiles[0];
  }

  if (normalizedFiles.length === 1) {
    return normalizedFiles[0];
  }

  throw new Error(`Could not determine the root configuration file in the ZIP archive. Expected one of ${CONFIG_ROOT_CANDIDATES.join(', ')} or a single top-level YAML/JSON file. Found: ${normalizedFiles.join(', ')}`);
};

const loadArchiveConfig = async (file: File): Promise<ConfigSettings> => {
  const zip = await JSZip.loadAsync(file);
  const archiveFiles = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => !entry.name.startsWith('__MACOSX/'));

  const fileMap = new Map<string, string>();

  await Promise.all(archiveFiles.map(async (entry) => {
    const normalizedPath = normalizeArchivePath(entry.name);
    if (fileMap.has(normalizedPath)) {
      throw new Error(`ZIP archive contains duplicate paths after normalization: ${normalizedPath}`);
    }
    const content = await entry.async('string');
    fileMap.set(normalizedPath, content);
  }));

  const rootPath = detectArchiveRootConfig(Array.from(fileMap.keys()));
  const rootContent = fileMap.get(rootPath);
  if (rootContent === undefined) {
    throw new Error(`Failed to read root configuration file ${rootPath} from ZIP archive.`);
  }

  const rootSettings = parseConfigDocument(rootContent, rootPath);
  const loadedTree = loadSettingsTree(rootPath, rootSettings, fileMap, new Set<string>());
  applyPatches(loadedTree.settings, loadedTree.patches);

  return loadedTree.settings;
};

const loadSettingsTree = (
  currentPath: string,
  currentSettings: ConfigSettings,
  fileMap: Map<string, string>,
  visited: Set<string>,
  inheritedEnvName = '',
): LoadedConfigTree => {
  const normalizedPath = normalizeArchivePath(currentPath);
  if (visited.has(normalizedPath)) {
    throw new Error(`Include cycle detected at ${normalizedPath}`);
  }

  visited.add(normalizedPath);

  try {
    const settingsCopy = cloneSettings(currentSettings);
    const merged: ConfigSettings = {};
    const patches: PatchOperation[] = [];
    const baseDir = dirname(normalizedPath);
    const effectiveEnvName = resolveEnvName(settingsCopy, inheritedEnvName);

    resolveIncludes(settingsCopy, inheritedEnvName).forEach((includeFile) => {
      if (includeFile.path.startsWith('/')) {
        throw new Error(`Absolute include paths are not supported in ZIP archives: ${includeFile.path}`);
      }

      const includePath = joinArchivePath(baseDir, includeFile.path);
      const includeContent = fileMap.get(includePath);
      if (includeContent === undefined) {
        if (includeFile.required) {
          throw new Error(`Required include ${includePath} was not found in the ZIP archive.`);
        }
        return;
      }

      const includeSettings = parseConfigDocument(includeContent, includePath);
      const loadedInclude = loadSettingsTree(includePath, includeSettings, fileMap, visited, effectiveEnvName);
      patches.push(...loadedInclude.patches);
      mergeSettings(merged, loadedInclude.settings);
    });

    patches.push(...parsePatchOperations(settingsCopy));
    stripLoaderKeys(settingsCopy);
    mergeSettings(merged, settingsCopy);

    return { settings: merged, patches };
  } finally {
    visited.delete(normalizedPath);
  }
};

const addTextFile = (zip: JSZip, path: string, content: string): void => {
  zip.file(path, content.endsWith('\n') ? content : `${content}\n`);
};

const buildRootManifestYaml = (
  sectionFiles: string[],
  profileName?: string,
  profileVersion?: YamlExportProfileVersion | null,
): string => {
  const manifest = yaml.dump({
    includes: {
      required: sectionFiles,
    },
  }, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });

  return prependYamlExportComment(manifest, { profileName, profileVersion });
};

const buildSectionFileName = (sectionKey: string): string => `${sectionKey}.yml`;

export const parseUploadedConfigFile = async (file: File): Promise<ConfigSettings> => {
  if (file.name.toLowerCase().endsWith('.zip')) {
    return loadArchiveConfig(file);
  }

  const fileContent = await file.text();
  const normalizedPath = normalizeArchivePath(file.name || 'nauthilus.yml');
  const settings = parseConfigDocument(fileContent, normalizedPath);
  const fileMap = new Map<string, string>([[normalizedPath, fileContent]]);
  const loadedTree = loadSettingsTree(normalizedPath, settings, fileMap, new Set<string>());
  applyPatches(loadedTree.settings, loadedTree.patches);

  return loadedTree.settings;
};

export const buildConfigBundleZip = async (
  config: NauthilusConfig,
  profileName?: string,
  profileVersion?: YamlExportProfileVersion | null,
): Promise<Blob> => {
  const configCopy = JSON.parse(JSON.stringify(config)) as ConfigSettings;
  const orderedSections = orderTopLevelConfigKeys(configCopy)
    .filter((sectionKey) => configCopy[sectionKey] !== undefined);

  const zip = new JSZip();
  const sectionFiles = orderedSections.map(buildSectionFileName);

  addTextFile(zip, 'nauthilus.yml', buildRootManifestYaml(sectionFiles, profileName, profileVersion));

  orderedSections.forEach((sectionKey) => {
    const partialConfig = { [sectionKey]: configCopy[sectionKey] } as NauthilusConfig;
    addTextFile(zip, buildSectionFileName(sectionKey), formatConfigAsYaml(partialConfig));
  });

  return zip.generateAsync({ type: 'blob' });
};
