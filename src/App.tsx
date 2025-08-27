import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ViewHeadlineIcon from '@mui/icons-material/ViewHeadline';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import PeopleIcon from '@mui/icons-material/People';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { RuntimeProvider } from './contexts/RuntimeContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { UserProvider, useUser } from './contexts/UserContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ValidationErrors from './components/common/ValidationErrors';
import LoginPage from './components/LoginPage';
import MFAPage from './components/MFAPage';
import OIDCCallback from './components/OIDCCallback';

// Import configuration components
import ServerConfig from './components/ServerConfig';
import AuthConfig from './components/AuthConfig';

// Import pages
import BackendsConfig from './components/BackendsConfig';
import FeaturesConfig from './components/FeaturesConfig';
import RedisConfig from './components/RedisConfig';
import MonitoringConfig from './components/MonitoringConfig';
import SystemPage from './components/SystemPage';
import SecurityPage from './components/SecurityPage';
import LuaConfig from './components/LuaConfig';
import LDAPConfig from './components/LDAPConfig';
import FrontendConfig from './components/FrontendConfig';
import ConnectionConfig from './components/ConnectionConfig';
import ConfigPreview from './components/ConfigPreview';
import LicensesPage from './components/LicensesPage';
import ConfigWizard from './components/ConfigWizard';
import UserManagement from './components/UserManagement';
import UserProfile from './components/UserProfile';
import BruteForceConfig from './components/BruteForceConfig';
import DistributedBruteForceTools from './components/DistributedBruteForceTools';
import HookTester from './components/HookTester';
import ClickhouseRuntime from './components/ClickhouseRuntime';
import MFASettings from './components/MFASettings';
import LegalPage from './components/LegalPage';
import { authenticatedFetch } from './utils/apiUtils';
import CookieBanner from './components/CookieBanner';

// Define drawer widths for different modes
const fullDrawerWidth = 260;
const iconOnlyDrawerWidth = 72;

interface NavigationMenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

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
  // Profile state variables removed as we now use a dedicated page

  // State to track AppBar height
  const [appBarHeight, setAppBarHeight] = useState(64); // Default height

  // User context needed for per-user persistence keys
  const { user, logout } = useUser();

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
  const { 
    loading, 
    error, 
    hasUnsavedChanges, 
    profiles, 
    currentProfileName, 
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

  // Define application menu items
  const applicationMenuItems: NavigationMenuItem[] = [
    { text: 'User Management', icon: <PeopleIcon />, path: '/users' },
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
    // downloadConfig is synchronous and handles its own errors
    downloadConfig();
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
      navigate(path);
    }
  };

  const handleNavigationConfirm = () => {
    // User confirmed navigation despite unsaved changes
    if (pendingNavigation) {
      // Reset the unsaved changes flag since the user chose to proceed without saving
      setHasUnsavedChanges(false);
      navigate(pendingNavigation);
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
        <Avatar 
          src="/img/logo.png" 
          alt="Nauthilus Logo"
          variant="square"
          sx={{ 
            width: 42, 
            height: 30,
            bgcolor: mode === 'dark' ? 'background.paper' : 'white',
            objectFit: 'cover',
            objectPosition: '0 0',
            overflow: 'hidden'
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
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
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
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
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
                flexGrow: { xs: 1, sm: 0 }
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
              accept=".json,.yml,.yaml"
              onChange={handleFileUpload}
            />
            <input
              type="file"
              ref={uploadWithProfileRef}
              style={{ display: 'none' }}
              accept=".json,.yml,.yaml"
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
                  onClick={logout}
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
                  onClick={logout}
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
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
            }}
          >
            {drawer}
          </Drawer>
          <Drawer
            variant="permanent"
            sx={{
              display: { xs: 'none', sm: 'block' },
              '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
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
          <>
            <Routes>
              <Route path="/" element={<ServerConfig />} />
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
              <Route path="/profile" element={<UserProfile />} />
              <Route path="/mfa-settings" element={<MFASettings />} />
              <Route path="/legal/:key" element={<LegalPage />} />
            </Routes>
          </>
        )}
      </Box>
    </Box>

    {/* Cookie Consent Banner */}
    <CookieBanner />

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

      {/* Upload to New Profile Dialog */}
      <Dialog
        open={uploadProfileDialogOpen}
        onClose={() => setUploadProfileDialogOpen(false)}
      >
        <DialogTitle>Upload to New Profile</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Select a configuration file to upload and enter a name for the new profile. If you leave the profile name empty, the configuration will be uploaded to the current profile.
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
              accept=".json,.yml,.yaml"
            />
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadProfileDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUploadWithProfileConfirm} color="primary">Upload</Button>
        </DialogActions>
      </Dialog>

      {/* User Profile Dialog removed - now using a dedicated page */}
    </Box>
  );
};

// AppContent component to handle conditional rendering based on authentication
const AppContent = (): React.JSX.Element => {
  const { isAuthenticated } = useUser();
  const { auth } = useAuth();

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

// Wrap the app content with the ThemeProvider, ConfigProvider, RuntimeProvider, UserProvider, and AuthProvider
const App = (): React.JSX.Element => {
  return (
    <ThemeProvider>
      <CssBaseline />
      <ConfigProvider>
        <RuntimeProvider>
          <UserProvider>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </UserProvider>
        </RuntimeProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
};

export default App;
