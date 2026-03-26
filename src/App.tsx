import React, { lazy, Suspense, useState, useRef, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { 
  AppBar, 
  Box, 
  CssBaseline, 
  Divider, 
  Drawer, 
  IconButton, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText, 
  Toolbar, 
  Typography,
  CircularProgress,
  Button,
  Tooltip,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Avatar,
  Container,
  Menu,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  TextField,
  SelectChangeEvent
} from '@mui/material';
import { keyframes } from '@mui/system';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import SecurityIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import FeaturedPlayListIcon from '@mui/icons-material/FeaturedPlayList';
import DnsIcon from '@mui/icons-material/Dns';
import WebIcon from '@mui/icons-material/Web';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import CodeIcon from '@mui/icons-material/Code';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import DescriptionIcon from '@mui/icons-material/Description';
import GavelIcon from '@mui/icons-material/Gavel';
import BuildIcon from '@mui/icons-material/Build';
import LinkIcon from '@mui/icons-material/Link';
import SourceIcon from '@mui/icons-material/Source';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ViewHeadlineIcon from '@mui/icons-material/ViewHeadline';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import PeopleIcon from '@mui/icons-material/People';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import HistoryIcon from '@mui/icons-material/History';
import { ConfigProvider, useConfig, type ProfileVersionContextPayload } from './contexts/ConfigContext';
import { RuntimeProvider, useRuntime, getCurrentUserId } from './contexts/RuntimeContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { UserProvider, useUser } from './contexts/UserContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ValidationErrors from './components/common/ValidationErrors';
import LoginPage from './components/LoginPage';
import MFAPage from './components/MFAPage';
import OIDCCallback from './components/OIDCCallback';
import { authenticatedFetch, resetSettingsState, loadSettings as loadSettingsUtil } from './utils/apiUtils';
import { validateConfigForExport } from './utils/configPreviewValidation';
import {
  fetchLatestYamlExportProfileVersion,
  fetchProfileVersions,
  type ProfileVersionItem,
} from './utils/profileVersions';
import { cacheSSHPassphrase, clearCachedSSHPassphrase, readCachedSSHPassphrase } from './utils/sshPassphraseCache';
import { prependYamlExportComment } from './utils/yamlExportComment';
import CookieBanner from './components/CookieBanner';
import { NotifyEvents, SessionExpiredDetail } from './utils/notify';

// Define drawer widths for different modes
const fullDrawerWidth = 260;
const iconOnlyDrawerWidth = 72;

// Animations for dark mode logo glow/float
const floatAnim = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
  100% { transform: translateY(0px); }
`;
const glowAnim = keyframes`
  0% { filter: drop-shadow(0 0 2px rgba(0, 200, 255, 0.35)) drop-shadow(0 0 6px rgba(0, 200, 255, 0.15)); }
  100% { filter: drop-shadow(0 0 5px rgba(0, 200, 255, 0.6)) drop-shadow(0 0 12px rgba(0, 200, 255, 0.35)); }
`;

interface NavigationMenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

interface GitCapabilities {
  enabled: boolean;
  sshAvailable: boolean;
  passphraseCacheSeconds: number;
  defaultBranch: string;
  defaultFilePath: string;
}

const ServerConfig = lazy(() => import('./components/ServerConfig'));
const AuthConfig = lazy(() => import('./components/AuthConfig'));
const BackendsConfig = lazy(() => import('./components/BackendsConfig'));
const FeaturesConfig = lazy(() => import('./components/FeaturesConfig'));
const RedisConfig = lazy(() => import('./components/RedisConfig'));
const MonitoringConfig = lazy(() => import('./components/MonitoringConfig'));
const SystemPage = lazy(() => import('./components/SystemPage'));
const SecurityPage = lazy(() => import('./components/SecurityPage'));
const LuaConfig = lazy(() => import('./components/LuaConfig'));
const LDAPConfig = lazy(() => import('./components/LDAPConfig'));
const FrontendConfig = lazy(() => import('./components/FrontendConfig'));
const ConnectionConfig = lazy(() => import('./components/ConnectionConfig'));
const ConfigPreview = lazy(() => import('./components/ConfigPreview'));
const LicensesPage = lazy(() => import('./components/LicensesPage'));
const AuditLog = lazy(() => import('./components/AuditLog'));
const ConfigWizard = lazy(() => import('./components/ConfigWizard'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const UserProfile = lazy(() => import('./components/UserProfile'));
const BruteForceConfig = lazy(() => import('./components/BruteForceConfig'));
const DistributedBruteForceTools = lazy(() => import('./components/DistributedBruteForceTools'));
const HookTester = lazy(() => import('./components/HookTester'));
const ClickhouseRuntime = lazy(() => import('./components/ClickhouseRuntime'));
const MFASettings = lazy(() => import('./components/MFASettings'));
const LegalPage = lazy(() => import('./components/LegalPage'));

const RouteLoading = (): React.JSX.Element => (
  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
    <CircularProgress />
  </Box>
);

// Main content component
const MainContent = (): React.JSX.Element => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [navigationDialogOpen, setNavigationDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [profileMenuAnchorEl, setProfileMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [createProfileDialogOpen, setCreateProfileDialogOpen] = useState(false);
  const [renameProfileDialogOpen, setRenameProfileDialogOpen] = useState(false);
  const [deleteProfileDialogOpen, setDeleteProfileDialogOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [profileToRename, setProfileToRename] = useState('');
  const [newProfileNameForRename, setNewProfileNameForRename] = useState('');
  const [profileToDelete, setProfileToDelete] = useState('');
  const [uploadProfileDialogOpen, setUploadProfileDialogOpen] = useState(false);
  const [uploadProfileName, setUploadProfileName] = useState('');
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [gitDialogOpen, setGitDialogOpen] = useState(false);
  const [gitBusy, setGitBusy] = useState(false);
  const [gitCapabilities, setGitCapabilities] = useState<GitCapabilities | null>(null);
  const [gitRepositoryUrl, setGitRepositoryUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [gitFilePath, setGitFilePath] = useState('');
  const [gitTagName, setGitTagName] = useState('');
  const [gitUseSSH, setGitUseSSH] = useState(false);
  const [gitHttpsUsername, setGitHttpsUsername] = useState('');
  const [gitHttpsPassword, setGitHttpsPassword] = useState('');
  const [gitPassphraseDialogOpen, setGitPassphraseDialogOpen] = useState(false);
  const [gitPassphraseInput, setGitPassphraseInput] = useState('');
  const [pendingGitAction, setPendingGitAction] = useState<'pull' | 'push' | null>(null);
  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [profileVersionsDialogOpen, setProfileVersionsDialogOpen] = useState(false);
  const [profileVersions, setProfileVersions] = useState<ProfileVersionItem[]>([]);
  const [profileVersionsLoading, setProfileVersionsLoading] = useState(false);
  const [profileVersionActionBusy, setProfileVersionActionBusy] = useState(false);
  const [manualSnapshotComment, setManualSnapshotComment] = useState('');
  const [restoreVersionDialogOpen, setRestoreVersionDialogOpen] = useState(false);
  const [restoreVersionTarget, setRestoreVersionTarget] = useState<number | null>(null);
  const [restoreVersionComment, setRestoreVersionComment] = useState('');
  // Profile state variables removed as we now use a dedicated page

  // Global session-expired dialog state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionDialogMessage, setSessionDialogMessage] = useState<string>('Your session has expired. Please sign in again.');

  // State to track AppBar height
  const [appBarHeight, setAppBarHeight] = useState(64); // Default height

  // User context needed for per-user persistence keys
  const { user, logout: userLogout } = useUser();

  // Menu display states with per-user persistence
  const username = useMemo(() => user?.username || 'anon', [user]);
  const configMenuKey = useMemo(() => `ui:menu:${username}:configExpanded`, [username]);
  const runtimeMenuKey = useMemo(() => `ui:menu:${username}:runtimeExpanded`, [username]);
  const iconOnlyKey = useMemo(() => `ui:menu:${username}:iconOnly`, [username]);

  const [configMenuExpanded, setConfigMenuExpanded] = useState<boolean>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem(configMenuKey) : null;
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });
  const [runtimeMenuExpanded, setRuntimeMenuExpanded] = useState<boolean>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem(runtimeMenuKey) : null;
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });
  const [iconOnly, setIconOnly] = useState<boolean>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem(iconOnlyKey) : null;
      return v === 'true';
    } catch {
      return false;
    }
  });

  // When username changes (login/logout), load stored preferences for that user
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const v1 = window.localStorage.getItem(configMenuKey);
        setConfigMenuExpanded(v1 === null ? true : v1 === 'true');
        const v2 = window.localStorage.getItem(runtimeMenuKey);
        setRuntimeMenuExpanded(v2 === null ? true : v2 === 'true');
        const v3 = window.localStorage.getItem(iconOnlyKey);
        setIconOnly(v3 === 'true');
      }
    } catch {
      // ignore
    }
  }, [configMenuKey, runtimeMenuKey, iconOnlyKey]);

  // Persist when values change
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(configMenuKey, configMenuExpanded ? 'true' : 'false');
      }
    } catch {}
  }, [configMenuExpanded, configMenuKey]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(runtimeMenuKey, runtimeMenuExpanded ? 'true' : 'false');
      }
    } catch {}
  }, [runtimeMenuExpanded, runtimeMenuKey]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(iconOnlyKey, iconOnly ? 'true' : 'false');
      }
    } catch {}
  }, [iconOnly, iconOnlyKey]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadWithProfileRef = useRef<HTMLInputElement>(null);
  const appBarRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();

  // Listen for global session-expired notifications
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<SessionExpiredDetail>;
      setSessionDialogMessage(ce.detail?.message || 'Your session has expired. Please sign in again.');
      setSessionDialogOpen(true);
    };
    window.addEventListener(NotifyEvents.SESSION_EXPIRED as unknown as string, handler as EventListener);
    return () => {
      window.removeEventListener(NotifyEvents.SESSION_EXPIRED as unknown as string, handler as EventListener);
    };
  }, []);

  const handleSessionDialogClose = async () => {
    setSessionDialogOpen(false);
    try {
      await Promise.allSettled([
        authLogout(),
        userLogout(),
      ]);
    } catch {}
    navigate('/login', { replace: true });
  };
  const { 
    config,
    loading, 
    error, 
    hasUnsavedChanges, 
    profiles, 
    currentProfileName, 
    refreshConfig,
    uploadConfig, 
    downloadConfig, 
    resetConfig, 
    setHasUnsavedChanges, 
    setError,
    createProfile,
    switchProfile,
    renameProfile,
    deleteProfile
  } = useConfig();
  const { mode, toggleColorMode } = useTheme();
  const { connection: runtimeConnection, loadRuntimeSettings } = useRuntime();

  // Effect to measure and update AppBar height
  useEffect(() => {
    const updateAppBarHeight = () => {
      if (appBarRef.current) {
        setAppBarHeight(appBarRef.current.clientHeight);
      }
    };

    // Initial measurement
    updateAppBarHeight();

    // Update on window resize
    window.addEventListener('resize', updateAppBarHeight);

    // Cleanup
    return () => {
      window.removeEventListener('resize', updateAppBarHeight);
    };
  }, []);


  // Compute current drawer width based on display mode
  const drawerWidth = iconOnly ? iconOnlyDrawerWidth : fullDrawerWidth;

  // Define menu items by category
  const configMenuItems: NavigationMenuItem[] = [
    { text: 'Server', icon: <SettingsIcon />, path: '/' },
    { text: 'Authentication', icon: <SecurityIcon />, path: '/auth' },
    { text: 'Backends', icon: <StorageIcon />, path: '/backends' },
    { text: 'Features', icon: <FeaturedPlayListIcon />, path: '/features' },
    { text: 'Redis', icon: <DnsIcon />, path: '/redis' },
    { text: 'Frontend', icon: <WebIcon />, path: '/frontend' },
    { text: 'Monitoring', icon: <MonitorHeartIcon />, path: '/monitoring' },
    { text: 'LDAP', icon: <SecurityIcon />, path: '/ldap' },
    { text: 'Lua', icon: <CodeIcon />, path: '/lua' },
    { text: 'Config Preview', icon: <DescriptionIcon />, path: '/config-preview' },
    { text: 'Wizard', icon: <BuildIcon />, path: '/config-wizard' },
  ];

  // Define other menu items
  const runtimeMenuItems: NavigationMenuItem[] = [
    { text: 'Connection', icon: <LinkIcon />, path: '/connection' },
    { text: 'System', icon: <MonitorHeartIcon />, path: '/system' },
    { text: 'Security', icon: <SecurityIcon />, path: '/security' },
    { text: 'Brute-Force', icon: <SecurityIcon />, path: '/bruteforce' },
    { text: 'Distributed BF', icon: <SecurityIcon />, path: '/distributed-bf' },
    { text: 'ClickHouse', icon: <StorageIcon />, path: '/runtime-clickhouse' },
    { text: 'Hook Tester', icon: <CodeIcon />, path: '/hook-tester' },
  ];

  // Paths that should force a fresh Runtime settings reload on each click (load on enter)
  const runtimeReloadPaths = new Set<string>([
    '/runtime-clickhouse',
    '/distributed-bf',
    '/hook-tester',
  ]);

  // Helper to force runtime settings reload on menu click (DRY)
  const triggerRuntimeReload = async (): Promise<void> => {
    try {
      // Invalidate previous load status and trigger immediate reload
      resetSettingsState();
      await loadSettingsUtil(
        getCurrentUserId,
        loadRuntimeSettings,
        currentProfileName,
        async () => { /* no-op connection check in navigation */ },
        () => runtimeConnection
      );
    } catch {
      // ignore navigation-triggered reload errors
    }
  };

  // Define application menu items
  const applicationMenuItems: NavigationMenuItem[] = [
    { text: 'User Management', icon: <PeopleIcon />, path: '/users' },
    { text: 'Audit Log', icon: <FeaturedPlayListIcon />, path: '/audit-log' },
  ];

  // Legal titles (dynamic)
  const [legalTitles, setLegalTitles] = useState<{ imprint: string; privacy: string }>(() => ({
    imprint: 'Imprint',
    privacy: 'Privacy Policy'
  }));

  useEffect(() => {
    // Load legal titles once user is authenticated and listen for updates
    const load = async () => {
      try {
        const resp = await authenticatedFetch('/api/legal');
        if (!resp.ok) return;
        const json = await resp.json();
        if (json && Array.isArray(json.pages)) {
          const t: any = { imprint: 'Imprint', privacy: 'Privacy Policy' };
          for (const p of json.pages) {
            if (p.key === 'imprint' && p.title) t.imprint = p.title;
            if (p.key === 'privacy' && p.title) t.privacy = p.title;
          }
          setLegalTitles(t);
        }
      } catch {
        // ignore
      }
    };
    load().catch(() => { /* intentionally ignored */ });

    const onUpdated = (e: any) => {
      const { key, title } = e.detail || {};
      if (key === 'imprint') setLegalTitles((prev) => ({ ...prev, imprint: title || prev.imprint }));
      if (key === 'privacy') setLegalTitles((prev) => ({ ...prev, privacy: title || prev.privacy }));
    };
    window.addEventListener('legal:updated' as any, onUpdated);
    return () => {
      window.removeEventListener('legal:updated' as any, onUpdated);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadGitCapabilities = async () => {
      if (!user) {
        if (isMounted) {
          setGitCapabilities(null);
        }
        return;
      }

      try {
        const response = await authenticatedFetch('/api/git/capabilities');
        if (!response.ok) {
          if (isMounted) {
            setGitCapabilities(null);
          }
          return;
        }

        const payload = await response.json() as GitCapabilities;
        if (!isMounted) {
          return;
        }

        const next: GitCapabilities = {
          enabled: Boolean(payload?.enabled),
          sshAvailable: Boolean(payload?.sshAvailable),
          passphraseCacheSeconds: Number(payload?.passphraseCacheSeconds ?? -1),
          defaultBranch: String(payload?.defaultBranch || 'main'),
          defaultFilePath: String(payload?.defaultFilePath || 'nauthilus.yml'),
        };
        setGitCapabilities(next);
        setGitBranch((prev) => prev || next.defaultBranch);
        setGitFilePath((prev) => prev || next.defaultFilePath);
      } catch {
        if (isMounted) {
          setGitCapabilities(null);
        }
      }
    };

    loadGitCapabilities().catch(() => { /* intentionally ignored */ });

    return () => {
      isMounted = false;
    };
  }, [user]);

  // Define MFA menu items (available to all users)
  const mfaMenuItems: NavigationMenuItem[] = [
    { text: 'Two-Factor Authentication', icon: <SecurityIcon />, path: '/mfa-settings' },
  ];

  // Define licenses menu item separately to place it at the bottom
  const licensesMenuItem: NavigationMenuItem = { text: 'Licenses', icon: <GavelIcon />, path: '/licenses' };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const toggleConfigMenu = () => {
    setConfigMenuExpanded(!configMenuExpanded);
  };

  const toggleRuntimeMenu = () => {
    setRuntimeMenuExpanded(!runtimeMenuExpanded);
  };

  const toggleIconOnly = () => {
    setIconOnly(!iconOnly);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await uploadConfig(file);
      } catch {
        // ignore upload errors for now
      }
    }
    // Reset the input value so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    setDownloadDialogOpen(true);
  };

  const handleDownloadConfirm = async (format: 'yaml' | 'zip') => {
    try {
      await downloadConfig(format);
    } catch {
      // ignore download errors for now
    }
    setDownloadDialogOpen(false);
  };

  const openGitDialog = () => {
    setGitBranch((prev) => prev || gitCapabilities?.defaultBranch || 'main');
    setGitFilePath((prev) => prev || gitCapabilities?.defaultFilePath || 'nauthilus.yml');
    setGitDialogOpen(true);
  };

  const handleGitDialogClose = () => {
    if (gitBusy) {
      return;
    }
    setGitDialogOpen(false);
  };

  const buildGitAuthPayload = (passphraseOverride?: string): any => {
    const passphrase = passphraseOverride !== undefined ? passphraseOverride : readCachedSSHPassphrase('git');
    return {
      useSsh: gitUseSSH,
      username: gitUseSSH ? '' : gitHttpsUsername.trim(),
      password: gitUseSSH ? '' : gitHttpsPassword,
      passphrase: gitUseSSH ? passphrase : '',
    };
  };

  const executeGitAction = async (action: 'pull' | 'push', passphraseOverride?: string): Promise<void> => {
    if (!gitCapabilities?.enabled) {
      setError('Git integration is disabled on the server.');
      return;
    }

    const repositoryUrl = gitRepositoryUrl.trim();
    if (!repositoryUrl) {
      setError('Repository URL is required for Git operations.');
      return;
    }

    const branch = (gitBranch || gitCapabilities.defaultBranch || 'main').trim();
    const filePath = (gitFilePath || gitCapabilities.defaultFilePath || 'nauthilus.yml').trim();
    if (!branch || !filePath) {
      setError('Branch and file path are required for Git operations.');
      return;
    }

    if (!gitUseSSH && (!gitHttpsUsername.trim() || !gitHttpsPassword)) {
      setError('Username and password are required when HTTPS auth is selected.');
      return;
    }

    if (gitUseSSH && !gitCapabilities.sshAvailable) {
      setError('No server-side SSH key mapping is configured for the current user.');
      return;
    }

    setGitBusy(true);
    setError(null);
    setGitNotice(null);

    try {
      const endpoint = action === 'pull' ? '/api/git/pull' : '/api/git/push';
      const body: any = {
        repositoryUrl,
        branch,
        filePath,
        tagName: action === 'push' ? gitTagName.trim() : '',
        auth: buildGitAuthPayload(passphraseOverride),
      };

      if (action === 'push') {
        if (!config) {
          throw new Error('No configuration available for Git export.');
        }

        const exportValidation = validateConfigForExport(config);
        if (!exportValidation.isValid) {
          const details = exportValidation.blockingFindings.map((finding) => `${finding.path}: ${finding.message}`);
          const summary = details.slice(0, 5).join(', ');
          const suffix = details.length > 5 ? ` (+${details.length - 5} more)` : '';
          setError(`Cannot push configuration: ${summary}${suffix}`);
          return;
        }

        const latestProfileVersion = await fetchLatestYamlExportProfileVersion(currentProfileName).catch(() => null);
        body.content = prependYamlExportComment(exportValidation.yamlContent, {
          profileName: currentProfileName,
          profileVersion: latestProfileVersion,
        });
        body.commitMessage = `nauthilus-ui: update profile ${currentProfileName}`;
      }

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({} as any));
        const errorCode = String(errorPayload?.code || '');
        if (gitUseSSH && (errorCode === 'ssh_passphrase_required' || errorCode === 'ssh_invalid_passphrase')) {
          setPendingGitAction(action);
          setGitPassphraseInput('');
          setGitPassphraseDialogOpen(true);
          if (errorCode === 'ssh_invalid_passphrase') {
            clearCachedSSHPassphrase('git');
          }
          return;
        }

        const backendError = String(errorPayload?.error || response.statusText || 'Git operation failed');
        const message = `[${response.status} ${response.statusText}] ${backendError}`;
        setError(message);
        return;
      }

      if (action === 'pull') {
        const payload = await response.json() as {
          content?: string;
          branch?: string;
          filePath?: string;
          commitHash?: string;
        };
        const content = String(payload?.content || '');
        const uploadedFile = new File([content], 'nauthilus.yml', { type: 'text/yaml' });
        const resolvedBranch = String(payload?.branch || branch);
        const resolvedFilePath = String(payload?.filePath || filePath);
        const resolvedCommitHash = String(payload?.commitHash || '');
        const versionContext: ProfileVersionContextPayload = {
          source: 'git_pull',
          comment: resolvedCommitHash
            ? `Git pull ${resolvedBranch}:${resolvedFilePath}@${resolvedCommitHash}`
            : `Git pull ${resolvedBranch}:${resolvedFilePath}`,
          metadata: {
            repositoryUrl,
            branch: resolvedBranch,
            filePath: resolvedFilePath,
            commitHash: resolvedCommitHash,
          },
        };
        await uploadConfig(uploadedFile, currentProfileName, versionContext);
      } else {
        const payload = await response.json().catch(() => ({} as { tagName?: string; tagAlreadyExists?: boolean }));
        if (payload?.tagAlreadyExists && payload?.tagName) {
          setGitNotice(`Tag "${payload.tagName}" already existed and was left unchanged.`);
        }
      }

      setGitDialogOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setGitBusy(false);
    }
  };

  const handleGitPassphraseConfirm = async () => {
    if (!pendingGitAction) {
      setGitPassphraseDialogOpen(false);
      return;
    }

    if (!gitPassphraseInput) {
      setError('SSH key passphrase is required.');
      return;
    }

    cacheSSHPassphrase(gitPassphraseInput, Number(gitCapabilities?.passphraseCacheSeconds ?? -1), 'git');
    setGitPassphraseDialogOpen(false);

    try {
      await executeGitAction(pendingGitAction, gitPassphraseInput);
    } finally {
      setPendingGitAction(null);
      setGitPassphraseInput('');
    }
  };

  const handleResetClick = () => {
    setResetDialogOpen(true);
  };

  const handleResetConfirm = async () => {
    try {
      await resetConfig();
    } catch {
      // ignore reset errors for now
    }
    setResetDialogOpen(false);
    navigate('/config-wizard'); // Navigate to Config Wizard page
  };

  const handleResetCancel = () => {
    setResetDialogOpen(false);
  };

  const handleNavigation = (path: string) => {
    // Clear any error messages when navigating
    if (error) {
      setError(null);
    }

    // Close the mobile menu when navigating
    setMobileOpen(false);

    if (hasUnsavedChanges) {
      // If there are unsaved changes, store the pending navigation and show the dialog
      setPendingNavigation(path);
      setNavigationDialogOpen(true);
    } else {
      // If no unsaved changes, navigate directly
      if (runtimeReloadPaths.has(path)) {
        void triggerRuntimeReload();
      }
      navigate(path);
    }
  };

  const handleNavigationConfirm = () => {
    // User confirmed navigation despite unsaved changes
    if (pendingNavigation) {
      // Reset the unsaved changes flag since the user chose to proceed without saving
      setHasUnsavedChanges(false);
      const path = pendingNavigation;
      if (runtimeReloadPaths.has(path)) {
        void triggerRuntimeReload();
      }
      navigate(path);
      setNavigationDialogOpen(false);
      setPendingNavigation(null);
    }
  };

  const handleNavigationCancel = () => {
    // User canceled navigation
    setNavigationDialogOpen(false);
    setPendingNavigation(null);
  };

  // Profile management handlers
  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setProfileMenuAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setProfileMenuAnchorEl(null);
  };

  const handleProfileChange = async (event: SelectChangeEvent) => {
    const profileName = event.target.value;
    try {
      await switchProfile(profileName);
    } catch {
      // ignore switch errors for now
    }
  };

  const handleCreateProfileClick = () => {
    setNewProfileName('');
    setCreateProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleCreateProfileConfirm = async () => {
    if (newProfileName.trim()) {
      try {
        await createProfile(newProfileName.trim());
      } catch {
        // ignore create errors for now
      }
      setCreateProfileDialogOpen(false);
    }
  };

  const handleRenameProfileClick = () => {
    setProfileToRename(currentProfileName);
    setNewProfileNameForRename(currentProfileName);
    setRenameProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleRenameProfileConfirm = async () => {
    if (newProfileNameForRename.trim() && profileToRename) {
      try {
        await renameProfile(profileToRename, newProfileNameForRename.trim());
      } catch {
        // ignore rename errors for now
      }
      setRenameProfileDialogOpen(false);
    }
  };

  const handleDeleteProfileClick = () => {
    setProfileToDelete(currentProfileName);
    setDeleteProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleDeleteProfileConfirm = async () => {
    if (profileToDelete) {
      try {
        await deleteProfile(profileToDelete);
      } catch {
        // ignore delete errors for now
      }
      setDeleteProfileDialogOpen(false);
    }
  };

  const loadProfileVersions = async (): Promise<void> => {
    setProfileVersionsLoading(true);
    try {
      const items = await fetchProfileVersions(currentProfileName, 200);
      setProfileVersions(items);
    } finally {
      setProfileVersionsLoading(false);
    }
  };

  const handleProfileVersionsClick = () => {
    setProfileVersionsDialogOpen(true);
    setManualSnapshotComment('');
    handleProfileMenuClose();
    void loadProfileVersions().catch((error) => {
      setError(error instanceof Error ? error.message : String(error));
    });
  };

  const closeRestoreProfileVersionDialog = () => {
    if (profileVersionActionBusy) {
      return;
    }
    setRestoreVersionDialogOpen(false);
    setRestoreVersionTarget(null);
    setRestoreVersionComment('');
  };

  const openRestoreProfileVersionDialog = (version: number): void => {
    if (profileVersionActionBusy) {
      return;
    }
    setRestoreVersionTarget(version);
    setRestoreVersionComment('');
    setRestoreVersionDialogOpen(true);
  };

  const handleCreateManualSnapshot = async (): Promise<void> => {
    setProfileVersionActionBusy(true);
    try {
      const userId = await getCurrentUserId();
      const response = await authenticatedFetch(
        `/api/profiles/${encodeURIComponent(userId)}/${encodeURIComponent(currentProfileName)}/versions/snapshots`,
        {
          method: 'POST',
          body: JSON.stringify({ comment: manualSnapshotComment.trim() }),
        },
      );
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(message || 'Failed to create profile snapshot');
      }

      setManualSnapshotComment('');
      await loadProfileVersions();
      setGitNotice(`Snapshot for profile "${currentProfileName}" created.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileVersionActionBusy(false);
    }
  };

  const handleRestoreProfileVersion = async (): Promise<void> => {
    if (restoreVersionTarget === null) {
      return;
    }

    const version = restoreVersionTarget;
    setProfileVersionActionBusy(true);
    try {
      const userId = await getCurrentUserId();
      const response = await authenticatedFetch(
        `/api/profiles/${encodeURIComponent(userId)}/${encodeURIComponent(currentProfileName)}/versions/${version}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ comment: restoreVersionComment.trim() }),
        },
      );
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(message || 'Failed to restore profile version');
      }

      setRestoreVersionDialogOpen(false);
      setRestoreVersionTarget(null);
      setRestoreVersionComment('');
      await refreshConfig();
      await loadProfileVersions();
      setGitNotice(`Profile "${currentProfileName}" restored from version ${version}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileVersionActionBusy(false);
    }
  };

  const handleDeleteProfileVersion = async (version: number): Promise<void> => {
    const confirmDelete = window.confirm(`Delete version ${version} for profile "${currentProfileName}" permanently?`);
    if (!confirmDelete) {
      return;
    }

    setProfileVersionActionBusy(true);
    try {
      const userId = await getCurrentUserId();
      const response = await authenticatedFetch(
        `/api/profiles/${encodeURIComponent(userId)}/${encodeURIComponent(currentProfileName)}/versions/${version}`,
        {
          method: 'DELETE',
        },
      );
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(message || 'Failed to delete profile version');
      }

      await loadProfileVersions();
      setGitNotice(`Version ${version} deleted.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setProfileVersionActionBusy(false);
    }
  };

  const handleUploadWithProfileClick = () => {
    setUploadProfileName('');
    setUploadProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleUploadWithProfileConfirm = async () => {
    if (uploadWithProfileRef.current?.files?.[0]) {
      try {
        await uploadConfig(
          uploadWithProfileRef.current.files[0],
          uploadProfileName.trim() || undefined
        );
      } catch {
        // ignore upload errors for now
      }
      setUploadProfileDialogOpen(false);
      // Reset the input value so the same file can be uploaded again if needed
      if (uploadWithProfileRef.current) {
        uploadWithProfileRef.current.value = '';
      }
    }
  };

  // User profile handler - now navigates to the profile page
  const handleUserProfileClick = () => {
    navigate('/profile');
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          component="img"
          src="/img/logo.png"
          alt="Nauthilus Logo"
          sx={{
            height: 30,
            width: 'auto',
            display: 'block',
            ...(mode === 'dark' ? {
              animation: `${floatAnim} 6s ease-in-out infinite, ${glowAnim} 3s ease-in-out infinite alternate`,
              willChange: 'transform, filter',
            } : {})
          }}
        />
        <Typography variant="h6" noWrap component="div">
          Nauthilus
        </Typography>
      </Toolbar>
      <Divider />

      {/* Menu Display Options */}
      <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton 
          onClick={toggleIconOnly} 
          size="small"
          sx={{ mr: 0 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <MenuIcon fontSize="small" />
            {iconOnly ? <KeyboardDoubleArrowRightIcon fontSize="small" /> : <KeyboardDoubleArrowLeftIcon fontSize="small" />}
          </Box>
        </IconButton>
      </Box>
      <Divider />

      {/* Configuration Section */}
      <List
        subheader={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
            {!iconOnly && (
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.85)' }}>
                Configuration
              </Typography>
            )}
            <IconButton size="small" onClick={toggleConfigMenu} sx={{ ml: iconOnly ? 'auto' : 0, mr: iconOnly ? 'auto' : 0 }}>
              {configMenuExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Box>
        }
      >
        {configMenuExpanded && configMenuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            {iconOnly ? (
              <Tooltip title={item.text} placement="right">
                <ListItemButton 
                  onClick={() => handleNavigation(item.path)}
                  sx={{ 
                    justifyContent: 'center',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      borderRadius: 1
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: 0 }}>
                    {item.icon}
                  </ListItemIcon>
                </ListItemButton>
              </Tooltip>
            ) : (
              <ListItemButton onClick={() => handleNavigation(item.path)}>
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            )}
          </ListItem>
        ))}
      </List>
      <Divider />

      {/* Runtime Section */}
      <List
        subheader={
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
            {!iconOnly && (
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.85)' }}>
                Runtime
              </Typography>
            )}
            <IconButton size="small" onClick={toggleRuntimeMenu} sx={{ ml: iconOnly ? 'auto' : 0, mr: iconOnly ? 'auto' : 0 }}>
              {runtimeMenuExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Box>
        }
      >
        {runtimeMenuExpanded && runtimeMenuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            {iconOnly ? (
              <Tooltip title={item.text} placement="right">
                <ListItemButton 
                  onClick={() => handleNavigation(item.path)}
                  sx={{ 
                    justifyContent: 'center',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      borderRadius: 1
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: 0 }}>
                    {item.icon}
                  </ListItemIcon>
                </ListItemButton>
              </Tooltip>
            ) : (
              <ListItemButton onClick={() => handleNavigation(item.path)}>
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            )}
          </ListItem>
        ))}
      </List>

      <Divider />

      {/* Application Section - Only visible to admin users */}
      {user && user.roles.includes('admin') && (
        <List
          subheader={
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
              {!iconOnly && (
                <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                  Application
                </Typography>
              )}
            </Box>
          }
        >
          {applicationMenuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              {iconOnly ? (
                <Tooltip title={item.text} placement="right">
                  <ListItemButton 
                    onClick={() => handleNavigation(item.path)}
                    sx={{ 
                      justifyContent: 'center',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        borderRadius: 1
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 0 }}>
                      {item.icon}
                    </ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              ) : (
                <ListItemButton onClick={() => handleNavigation(item.path)}>
                  <ListItemIcon>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              )}
            </ListItem>
          ))}
        </List>
      )}

      {/* MFA Section - Visible to all authenticated users */}
      {user && (
        <List
          subheader={
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
              {!iconOnly && (
                <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                  Security
                </Typography>
              )}
            </Box>
          }
        >
          {mfaMenuItems.map((item) => (
            <ListItem key={item.text} disablePadding>
              {iconOnly ? (
                <Tooltip title={item.text} placement="right">
                  <ListItemButton 
                    onClick={() => handleNavigation(item.path)}
                    sx={{ 
                      justifyContent: 'center',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        borderRadius: 1
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 0 }}>
                      {item.icon}
                    </ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              ) : (
                <ListItemButton onClick={() => handleNavigation(item.path)}>
                  <ListItemIcon>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              )}
            </ListItem>
          ))}
        </List>
      )}

      {/* Legal Section */}
      {user && (
        <List
          subheader={
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1 }}>
              {!iconOnly && (
                <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                  Legal
                </Typography>
              )}
            </Box>
          }
        >
          {[
            { text: legalTitles.imprint, icon: <DescriptionIcon />, path: '/legal/imprint' },
            { text: legalTitles.privacy, icon: <DescriptionIcon />, path: '/legal/privacy' },
          ].map((item) => (
            <ListItem key={item.path} disablePadding>
              {iconOnly ? (
                <Tooltip title={item.text} placement="right">
                  <ListItemButton 
                    onClick={() => handleNavigation(item.path)}
                    sx={{ 
                      justifyContent: 'center',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        borderRadius: 1
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 0 }}>
                      {item.icon}
                    </ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              ) : (
                <ListItemButton onClick={() => handleNavigation(item.path)}>
                  <ListItemIcon>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              )}
            </ListItem>
          ))}
        </List>
      )}

      <Box sx={{ flexGrow: 1 }} />
      <Divider />
      <List>
        <ListItem disablePadding>
          {iconOnly ? (
            <Tooltip title={licensesMenuItem.text} placement="right">
              <ListItemButton 
                onClick={() => handleNavigation(licensesMenuItem.path)}
                sx={{ 
                  justifyContent: 'center',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    borderRadius: 1
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 0 }}>
                  {licensesMenuItem.icon}
                </ListItemIcon>
              </ListItemButton>
            </Tooltip>
          ) : (
            <ListItemButton onClick={() => handleNavigation(licensesMenuItem.path)}>
              <ListItemIcon>
                {licensesMenuItem.icon}
              </ListItemIcon>
              <ListItemText primary={licensesMenuItem.text} />
            </ListItemButton>
          )}
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar
        ref={appBarRef}
        position="sticky"
        sx={{
          top: 0,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: 'primary.main',
          color: '#fff',
          '& .MuiButton-root': { color: '#fff' },
          '& .MuiIconButton-root': { color: '#fff' },
          '& .MuiTypography-root': { color: '#fff' },
          '& .MuiSvgIcon-root': { color: '#fff' }
        }}
      >
        <Toolbar sx={{ flexWrap: 'wrap', py: { xs: 1 } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            flexGrow: 1,
            flexWrap: 'wrap',
            gap: 1
          }}>

            {/* Profile selector */}
            <FormControl 
              variant="outlined" 
              size="small" 
              sx={{ 
                minWidth: { xs: 150, sm: 200 }, 
                mr: { xs: 1, sm: 2 },
                flexGrow: { xs: 1, sm: 0 },
                '& .MuiInputLabel-root': { color: '#fff' },
                '& .MuiInputBase-input': { color: '#fff' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.35)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.6)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#fff' },
                '& .MuiSvgIcon-root': { color: '#fff' }
              }}
            >
              <InputLabel id="profile-select-label">Profile</InputLabel>
              <Select
                labelId="profile-select-label"
                id="profile-select"
                value={profiles.some(p => p.name === currentProfileName) ? currentProfileName : ''}
                onChange={handleProfileChange}
                label="Profile"
                sx={{ color: 'inherit' }}
              >
                <MenuItem value="">
                  <em>Select a profile</em>
                </MenuItem>
                {profiles.map((profile) => (
                  <MenuItem key={profile.name} value={profile.name}>
                    {profile.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Profile management button */}
            <Button 
              color="inherit"
              onClick={handleProfileMenuOpen}
              sx={{ 
                mr: { xs: 1, sm: 2 },
                display: { xs: 'none', md: 'block' }
              }}
            >
              Manage Profiles
            </Button>

            {/* Small screen profile management icon button */}
            <Tooltip title="Manage Profiles">
              <IconButton
                color="inherit"
                onClick={handleProfileMenuOpen}
                sx={{ 
                  display: { xs: 'flex', md: 'none' },
                  mr: { xs: 1, sm: 2 }
                }}
              >
                <ViewHeadlineIcon />
              </IconButton>
            </Tooltip>

            {/* Profile management menu */}
            <Menu
              anchorEl={profileMenuAnchorEl}
              open={Boolean(profileMenuAnchorEl)}
              onClose={handleProfileMenuClose}
            >
              <MenuItem onClick={handleCreateProfileClick}>Create New Profile</MenuItem>
              <MenuItem onClick={handleRenameProfileClick}>Rename Current Profile</MenuItem>
              <MenuItem onClick={handleDeleteProfileClick}>Delete Current Profile</MenuItem>
              <MenuItem onClick={handleProfileVersionsClick}>
                <HistoryIcon fontSize="small" sx={{ mr: 1 }} />
                Profile Versions
              </MenuItem>
              <MenuItem onClick={handleUploadWithProfileClick}>Upload to New Profile</MenuItem>
            </Menu>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1
          }}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".json,.yml,.yaml,.zip"
              onChange={handleFileUpload}
            />
            <input
              type="file"
              ref={uploadWithProfileRef}
              style={{ display: 'none' }}
              accept=".json,.yml,.yaml,.zip"
            />
            <Tooltip title="Upload Configuration">
              <Button 
                color="inherit" 
                onClick={() => fileInputRef.current?.click()}
                startIcon={<UploadFileIcon />}
                sx={{ 
                  mr: { xs: 0.5, sm: 1 },
                  display: { xs: 'none', sm: 'flex' }
                }}
              >
                Upload
              </Button>
            </Tooltip>
            <Tooltip title="Upload Configuration">
              <IconButton
                color="inherit"
                onClick={() => fileInputRef.current?.click()}
                sx={{ display: { xs: 'flex', sm: 'none' } }}
              >
                <UploadFileIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Download Configuration">
              <Button 
                color="inherit" 
                onClick={handleDownload}
                startIcon={<DownloadIcon />}
                sx={{ 
                  mr: { xs: 0.5, sm: 1 },
                  display: { xs: 'none', sm: 'flex' }
                }}
              >
                Download
              </Button>
            </Tooltip>
            <Tooltip title="Download Configuration">
              <IconButton
                color="inherit"
                onClick={handleDownload}
                sx={{ display: { xs: 'flex', sm: 'none' } }}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            {gitCapabilities?.enabled && (
              <Tooltip title="Git Integration">
                <Button
                  color="inherit"
                  onClick={openGitDialog}
                  startIcon={<SourceIcon />}
                  sx={{
                    mr: { xs: 0.5, sm: 1 },
                    display: { xs: 'none', sm: 'flex' }
                  }}
                >
                  Git
                </Button>
              </Tooltip>
            )}
            {gitCapabilities?.enabled && (
              <Tooltip title="Git Integration">
                <IconButton
                  color="inherit"
                  onClick={openGitDialog}
                  sx={{ display: { xs: 'flex', sm: 'none' } }}
                >
                  <SourceIcon />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Reset to Default">
              <Button 
                color="inherit" 
                onClick={handleResetClick}
                startIcon={<RestartAltIcon />}
                sx={{ display: { xs: 'none', sm: 'flex' } }}
              >
                Reset
              </Button>
            </Tooltip>
            <Tooltip title="Reset to Default">
              <IconButton
                color="inherit"
                onClick={handleResetClick}
                sx={{ display: { xs: 'flex', sm: 'none' } }}
              >
                <RestartAltIcon />
              </IconButton>
            </Tooltip>
            {user && (
              <Tooltip title="Edit Profile">
                <Button
                  color="inherit"
                  onClick={handleUserProfileClick}
                  startIcon={user.avatar ? 
                    <Avatar 
                      src={user.avatar} 
                      sx={{ width: 24, height: 24 }} 
                    /> : 
                    <AccountCircleIcon />
                  }
                  sx={{ 
                    mr: { xs: 0.5, sm: 1 },
                    display: { xs: 'none', sm: 'flex' }
                  }}
                >
                  {user.displayName || user.username}
                </Button>
              </Tooltip>
            )}
            {user && (
              <Tooltip title={user.displayName || user.username}>
                <IconButton
                  color="inherit"
                  onClick={handleUserProfileClick}
                  sx={{ display: { xs: 'flex', sm: 'none' } }}
                >
                  {user.avatar ? 
                    <Avatar 
                      src={user.avatar} 
                      sx={{ width: 24, height: 24 }} 
                    /> : 
                    <AccountCircleIcon />
                  }
                </IconButton>
              </Tooltip>
            )}
            {user && (
              <Tooltip title="Logout">
                <Button
                  color="inherit"
                  onClick={userLogout}
                  startIcon={<LogoutIcon />}
                  sx={{ 
                    mr: { xs: 0.5, sm: 1 },
                    display: { xs: 'none', sm: 'flex' }
                  }}
                >
                  Logout
                </Button>
              </Tooltip>
            )}
            {user && (
              <Tooltip title="Logout">
                <IconButton
                  color="inherit"
                  onClick={userLogout}
                  sx={{ display: { xs: 'flex', sm: 'none' } }}
                >
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
              <IconButton 
                color="inherit" 
                onClick={toggleColorMode}
                sx={{ ml: { xs: 0, sm: 1 } }}
              >
                {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Error message display at the top of the screen */}
      {error && (
        <Container 
          sx={{ 
            position: 'sticky', 
            top: `${appBarHeight}px`, // Stick right below the AppBar
            left: { sm: drawerWidth }, 
            right: 0,
            zIndex: 1100,
            p: 2,
            width: { sm: `calc(100% - ${drawerWidth}px)` }
          }}
        >
          <ValidationErrors error={error} />
        </Container>
      )}
      <Box sx={{ display: 'flex', flex: 1, width: '100%' }}>
        <Box
          component="nav"
          sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
          aria-label="configuration sections"
        >
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{
              keepMounted: true, // Better open performance on mobile.
            }}
            sx={{
              display: { xs: 'block', sm: 'none' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
                backgroundColor: 'primary.main',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                color: '#fff',
                borderRight: '1px solid rgba(255,255,255,0.2)',
                '& .MuiDivider-root': { borderColor: 'rgba(255,255,255,0.2)' },
                '& .MuiListItemButton-root:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
                '& .MuiListItemIcon-root': { color: '#fff' },
                '& .MuiListItemText-root .MuiTypography-root': { color: '#fff' },
                '& .MuiTypography-root': { color: '#fff' },
                '& .MuiIconButton-root': { color: '#fff' },
                '& .MuiSvgIcon-root': { color: '#fff' }
              },
            }}
          >
            {drawer}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
                backgroundColor: 'primary.main',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                color: '#fff',
                borderRight: '1px solid rgba(255,255,255,0.2)',
                '& .MuiDivider-root': { borderColor: 'rgba(255,255,255,0.2)' },
                '& .MuiListItemButton-root:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
                '& .MuiListItemIcon-root': { color: '#fff' },
                '& .MuiListItemText-root .MuiTypography-root': { color: '#fff' },
                '& .MuiTypography-root': { color: '#fff' },
                '& .MuiIconButton-root': { color: '#fff' },
                '& .MuiSvgIcon-root': { color: '#fff' }
              },
            }}
            open
          >
            {drawer}
          </Drawer>
        </Box>
        <Box
          component="main"
          sx={{ 
            flexGrow: 1, 
            p: { xs: 2, sm: 3 }, 
            width: { sm: `calc(100% - ${drawerWidth}px)` },
            // With sticky AppBar, no extra top padding is needed
            // Ensure content doesn't overflow on small screens
            overflowX: 'auto',
            maxWidth: '100%',
            minWidth: 0
          }}
        >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<ServerConfig />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/mfa" element={<Navigate to="/" replace />} />
              <Route path="/auth" element={<AuthConfig />} />
              <Route path="/connection" element={<ConnectionConfig />} />
              <Route path="/bruteforce" element={<BruteForceConfig />} />
              <Route path="/distributed-bf" element={<DistributedBruteForceTools />} />
              <Route path="/backends" element={<BackendsConfig />} />
              <Route path="/features" element={<FeaturesConfig />} />
              <Route path="/redis" element={<RedisConfig />} />
              <Route path="/frontend" element={<FrontendConfig />} />
              <Route path="/monitoring" element={<MonitoringConfig />} />
              <Route path="/system" element={<SystemPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/lua" element={<LuaConfig />} />
              <Route path="/hook-tester" element={<HookTester />} />
              <Route path="/runtime-clickhouse" element={<ClickhouseRuntime />} />
              <Route path="/ldap" element={<LDAPConfig />} />
              <Route path="/config-preview" element={<ConfigPreview />} />
              <Route path="/licenses" element={<LicensesPage />} />
              <Route path="/config-wizard" element={<ConfigWizard autoOpen={true} />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/profile" element={<UserProfile />} />
              <Route path="/mfa-settings" element={<MFASettings />} />
              <Route path="/legal/:key" element={<LegalPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        )}
      </Box>
    </Box>

    {/* Cookie Consent Banner */}
    <CookieBanner />

      {/* Session Expired Dialog */}
      <Dialog open={sessionDialogOpen} onClose={handleSessionDialogClose}>
        <DialogTitle>Session expired</DialogTitle>
        <DialogContent>
          {sessionDialogMessage}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSessionDialogClose} color="primary">Sign in</Button>
        </DialogActions>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetDialogOpen}
        onClose={handleResetCancel}
      >
        <DialogTitle>Reset Configuration</DialogTitle>
        <DialogContent>
          Are you sure you want to reset the configuration to default values? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={handleResetCancel}>Cancel</Button>
          <Button onClick={handleResetConfirm} color="error">Reset</Button>
        </DialogActions>
      </Dialog>

      {/* Navigation Confirmation Dialog */}
      <Dialog
        open={navigationDialogOpen}
        onClose={handleNavigationCancel}
      >
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Do you want to continue without saving? Your changes will be lost.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleNavigationCancel}>Cancel</Button>
          <Button onClick={handleNavigationConfirm} color="primary">Continue Without Saving</Button>
        </DialogActions>
      </Dialog>

      {/* Create Profile Dialog */}
      <Dialog
        open={createProfileDialogOpen}
        onClose={() => setCreateProfileDialogOpen(false)}
      >
        <DialogTitle>Create New Profile</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter a name for the new configuration profile.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="profile-name"
            label="Profile Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateProfileDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateProfileConfirm} color="primary">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Rename Profile Dialog */}
      <Dialog
        open={renameProfileDialogOpen}
        onClose={() => setRenameProfileDialogOpen(false)}
      >
        <DialogTitle>Rename Profile</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter a new name for the profile "{profileToRename}".
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="new-profile-name"
            label="New Profile Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newProfileNameForRename}
            onChange={(e) => setNewProfileNameForRename(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameProfileDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRenameProfileConfirm} color="primary">Rename</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Profile Dialog */}
      <Dialog
        open={deleteProfileDialogOpen}
        onClose={() => setDeleteProfileDialogOpen(false)}
      >
        <DialogTitle>Delete Profile</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the profile "{profileToDelete}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteProfileDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteProfileConfirm} color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={profileVersionsDialogOpen}
        onClose={() => {
          if (profileVersionActionBusy) {
            return;
          }
          setProfileVersionsDialogOpen(false);
          closeRestoreProfileVersionDialog();
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Profile Versions: {currentProfileName}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Create manual snapshots, restore older versions, or hard-delete versions.
          </DialogContentText>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              label="Snapshot Comment (optional)"
              value={manualSnapshotComment}
              onChange={(event) => setManualSnapshotComment(event.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => void handleCreateManualSnapshot()}
              disabled={profileVersionActionBusy || profileVersionsLoading}
            >
              Snapshot
            </Button>
          </Box>
          {profileVersionsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 420, overflowY: 'auto', pr: 0.5 }}>
              {profileVersions.length === 0 && (
                <Alert severity="info">No versions available for this profile yet.</Alert>
              )}
              {profileVersions.map((profileVersion) => {
                const metadata = profileVersion.metadata || {};
                const branch = String((metadata as any).branch || '');
                const filePath = String((metadata as any).filePath || (metadata as any).file_path || '');
                const commitHash = String((metadata as any).commitHash || (metadata as any).commit_hash || '');
                const repositoryUrl = String((metadata as any).repositoryUrl || (metadata as any).repository_url || '');
                const renderedDate = profileVersion.createdAt
                  ? new Date(profileVersion.createdAt).toLocaleString()
                  : 'n/a';

                return (
                  <Box
                    key={profileVersion.version}
                    sx={{
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                      p: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                    }}
                  >
                    <Typography variant="subtitle2">
                      Version {profileVersion.version} • {profileVersion.source || 'auto'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Created: {renderedDate} by {profileVersion.createdBy || 'system'}
                    </Typography>
                    {profileVersion.comment && (
                      <Typography variant="body2" color="text.secondary">
                        Comment: {profileVersion.comment}
                      </Typography>
                    )}
                    {(branch || filePath || commitHash || repositoryUrl) && (
                      <Typography variant="body2" color="text.secondary">
                        Git: {branch || '-'} {filePath ? `• ${filePath}` : ''} {commitHash ? `• ${commitHash}` : ''} {repositoryUrl ? `• ${repositoryUrl}` : ''}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => openRestoreProfileVersionDialog(profileVersion.version)}
                        disabled={profileVersionActionBusy}
                      >
                        Restore
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => void handleDeleteProfileVersion(profileVersion.version)}
                        disabled={profileVersionActionBusy}
                      >
                        Delete
                      </Button>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            if (profileVersionActionBusy) {
              return;
            }
            setProfileVersionsDialogOpen(false);
            closeRestoreProfileVersionDialog();
          }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={restoreVersionDialogOpen}
        onClose={closeRestoreProfileVersionDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Restore Profile Version</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {restoreVersionTarget === null
              ? `Restore profile "${currentProfileName}"?`
              : `Restore profile "${currentProfileName}" from version ${restoreVersionTarget}?`}
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Restore Comment (optional)"
            fullWidth
            multiline
            minRows={2}
            variant="outlined"
            value={restoreVersionComment}
            onChange={(event) => setRestoreVersionComment(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRestoreProfileVersionDialog} disabled={profileVersionActionBusy}>Cancel</Button>
          <Button
            onClick={() => void handleRestoreProfileVersion()}
            color="primary"
            variant="contained"
            disabled={profileVersionActionBusy || restoreVersionTarget === null}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload to New Profile Dialog */}
      <Dialog
        open={uploadProfileDialogOpen}
        onClose={() => setUploadProfileDialogOpen(false)}
      >
        <DialogTitle>Upload to New Profile</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Select a monolithic YAML/JSON file or a ZIP bundle with relative includes and enter a name for the new profile. If you leave the profile name empty, the configuration will be uploaded to the current profile.
          </DialogContentText>
          <TextField
            margin="dense"
            id="upload-profile-name"
            label="Profile Name (optional)"
            type="text"
            fullWidth
            variant="outlined"
            value={uploadProfileName}
            onChange={(e) => setUploadProfileName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Button
            variant="outlined"
            component="label"
            fullWidth
          >
            Select File
            <input
              type="file"
              hidden
              ref={uploadWithProfileRef}
              accept=".json,.yml,.yaml,.zip"
            />
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadProfileDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUploadWithProfileConfirm} color="primary">Upload</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={downloadDialogOpen}
        onClose={() => setDownloadDialogOpen(false)}
      >
        <DialogTitle>Download Configuration</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Choose whether to export the current configuration as a single YAML file or as a ZIP bundle with a generated include structure.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleDownloadConfirm('yaml')}>Monolithic YAML</Button>
          <Button onClick={() => void handleDownloadConfirm('zip')} color="primary" variant="contained">ZIP with Includes</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={gitDialogOpen}
        onClose={handleGitDialogClose}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Git Integration</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Pull the current profile from Git or push the current profile to Git.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Repository URL"
            fullWidth
            variant="outlined"
            value={gitRepositoryUrl}
            onChange={(e) => setGitRepositoryUrl(e.target.value)}
            placeholder={gitUseSSH ? 'git@github.com:org/repo.git' : 'https://github.com/org/repo.git'}
          />
          <TextField
            margin="dense"
            label="Branch"
            fullWidth
            variant="outlined"
            value={gitBranch}
            onChange={(e) => setGitBranch(e.target.value)}
          />
          <TextField
            margin="dense"
            label="File Path"
            fullWidth
            variant="outlined"
            value={gitFilePath}
            onChange={(e) => setGitFilePath(e.target.value)}
            placeholder="nauthilus.yml"
          />
          <TextField
            margin="dense"
            label="Tag (optional)"
            fullWidth
            variant="outlined"
            value={gitTagName}
            onChange={(e) => setGitTagName(e.target.value)}
            placeholder="v1.2.3"
            helperText="Optional lightweight tag set on the pushed commit."
          />
          <FormControl fullWidth margin="dense">
            <InputLabel id="git-auth-mode-label">Auth Mode</InputLabel>
            <Select
              labelId="git-auth-mode-label"
              label="Auth Mode"
              value={gitUseSSH ? 'ssh' : 'https'}
              onChange={(event) => setGitUseSSH(event.target.value === 'ssh')}
            >
              <MenuItem value="https">HTTPS (Username/Password)</MenuItem>
              <MenuItem value="ssh" disabled={!gitCapabilities?.sshAvailable}>SSH Key (Server Mapping)</MenuItem>
            </Select>
          </FormControl>
          {!gitUseSSH && (
            <>
              <TextField
                margin="dense"
                label="Git Username"
                fullWidth
                variant="outlined"
                value={gitHttpsUsername}
                onChange={(e) => setGitHttpsUsername(e.target.value)}
              />
              <TextField
                margin="dense"
                label="Git Password"
                type="password"
                fullWidth
                variant="outlined"
                value={gitHttpsPassword}
                onChange={(e) => setGitHttpsPassword(e.target.value)}
              />
            </>
          )}
          {gitUseSSH && (
            <DialogContentText sx={{ mt: 2 }}>
              SSH is enabled for this operation. A passphrase dialog is shown only when required by the configured SSH key.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          {gitUseSSH && (
            <Button
              onClick={() => clearCachedSSHPassphrase('git')}
              disabled={gitBusy}
            >
              Clear Cached Passphrase
            </Button>
          )}
          <Button onClick={handleGitDialogClose} disabled={gitBusy}>Cancel</Button>
          <Button onClick={() => void executeGitAction('pull')} disabled={gitBusy}>
            {gitBusy ? 'Working...' : 'Pull from Git'}
          </Button>
          <Button onClick={() => void executeGitAction('push')} color="primary" variant="contained" disabled={gitBusy}>
            {gitBusy ? 'Working...' : 'Push to Git'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={gitPassphraseDialogOpen}
        onClose={() => {
          setGitPassphraseDialogOpen(false);
          setPendingGitAction(null);
          setGitPassphraseInput('');
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>SSH Passphrase Required</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter the passphrase for your configured SSH key.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Passphrase"
            type="password"
            fullWidth
            variant="outlined"
            value={gitPassphraseInput}
            onChange={(e) => setGitPassphraseInput(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setGitPassphraseDialogOpen(false);
            setPendingGitAction(null);
            setGitPassphraseInput('');
          }}>
            Cancel
          </Button>
          <Button onClick={() => void handleGitPassphraseConfirm()} color="primary" variant="contained">
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(gitNotice)}
        autoHideDuration={4000}
        onClose={() => setGitNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setGitNotice(null)} severity="info" sx={{ width: '100%' }}>
          {gitNotice}
        </Alert>
      </Snackbar>

      {/* User Profile Dialog removed - now using a dedicated page */}
    </Box>
  );
};

// AppContent component to handle conditional rendering based on authentication
const AppContent = (): React.JSX.Element => {
  const { isAuthenticated, loading: userLoading } = useUser();
  const { auth } = useAuth();
  const waitingForUserSession = auth.isAuthenticated && !isAuthenticated && userLoading;

  if (auth.loading || waitingForUserSession) {
    return (
      <Box sx={{ height: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // If the user is authenticated, show the main content
  // If MFA is required, show the MFA page
  // Otherwise, show the login page
  return (
    <>
      {isAuthenticated && auth.isAuthenticated && !auth.mfaRequired ? (
        <MainContent />
      ) : (
        <Routes>
          <Route path="/mfa" element={
            <Box sx={{ height: '100vh', bgcolor: 'background.default' }}>
              <MFAPage />
            </Box>
          } />
          <Route path="/oidc/callback" element={
            <Box sx={{ height: '100vh', bgcolor: 'background.default' }}>
              <OIDCCallback />
            </Box>
          } />
          <Route path="*" element={
            <Box sx={{ height: '100vh', bgcolor: 'background.default' }}>
              {auth.mfaRequired ? <MFAPage /> : <LoginPage />}
            </Box>
          } />
        </Routes>
      )}
    </>
  );
};

// Wrap the app content with providers; defer heavy data providers until after authentication
const AppInner = (): React.JSX.Element => {
  const { auth } = useAuth();
  // ConfigProvider and RuntimeProvider perform authenticated API calls; mount them only when authenticated.
  return auth.isAuthenticated && !auth.mfaRequired ? (
    <ConfigProvider>
      <RuntimeProvider>
        <AppContent />
      </RuntimeProvider>
    </ConfigProvider>
  ) : (
    <AppContent />
  );
};

const App = (): React.JSX.Element => {
  // Note: We need UserProvider and AuthProvider available for the login/MFA flows.
  return (
    <ThemeProvider>
      <CssBaseline />
      <UserProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </UserProvider>
    </ThemeProvider>
  );
};

export default App;
