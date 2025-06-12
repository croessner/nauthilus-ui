import React, { useState, useRef } from 'react';
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
  DialogActions,
  Avatar,
  Container
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
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import DescriptionIcon from '@mui/icons-material/Description';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ValidationErrors from './components/common/ValidationErrors';

// Import configuration components
import ServerConfig from './components/ServerConfig';
import AuthConfig from './components/AuthConfig';

// Import pages
import BackendsConfig from './components/BackendsConfig';
import FeaturesConfig from './components/FeaturesConfig';
import RedisConfig from './components/RedisConfig';
import MonitoringConfig from './components/MonitoringConfig';
import LuaConfig from './components/LuaConfig';
import LDAPConfig from './components/LDAPConfig';
import FrontendConfig from './components/FrontendConfig';
import ConfigPreview from './components/ConfigPreview';

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

// Main content component
const MainContent: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [navigationDialogOpen, setNavigationDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { loading, error, hasUnsavedChanges, uploadConfig, downloadConfig, resetConfig, setHasUnsavedChanges, setError } = useConfig();
  const { mode, toggleColorMode } = useTheme();

  // Define menu items
  const menuItems: MenuItem[] = [
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
  ];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadConfig(file);
    }
    // Reset the input value so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    downloadConfig();
  };

  const handleResetClick = () => {
    setResetDialogOpen(true);
  };

  const handleResetConfirm = () => {
    resetConfig();
    setResetDialogOpen(false);
  };

  const handleResetCancel = () => {
    setResetDialogOpen(false);
  };

  const handleNavigation = (path: string) => {
    // Clear any error messages when navigating
    if (error) {
      setError(null);
    }

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

  const drawer = (
    <div>
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
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton onClick={() => handleNavigation(item.path)}>
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Typography variant="h6" noWrap component="div">
              Configuration
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".json,.yml,.yaml"
              onChange={handleFileUpload}
            />
            <Tooltip title="Upload Configuration">
              <Button 
                color="inherit" 
                onClick={() => fileInputRef.current?.click()}
                startIcon={<UploadFileIcon />}
                sx={{ mr: 1 }}
              >
                Upload
              </Button>
            </Tooltip>
            <Tooltip title="Download Configuration">
              <Button 
                color="inherit" 
                onClick={handleDownload}
                startIcon={<DownloadIcon />}
                sx={{ mr: 1 }}
              >
                Download
              </Button>
            </Tooltip>
            <Tooltip title="Reset to Default">
              <Button 
                color="inherit" 
                onClick={handleResetClick}
                startIcon={<RestartAltIcon />}
              >
                Reset
              </Button>
            </Tooltip>
            <Tooltip title={mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
              <IconButton 
                color="inherit" 
                onClick={toggleColorMode}
                sx={{ ml: 1 }}
              >
                {mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Error message display at the top of the screen */}
      {error && (
        <Container 
          sx={{ 
            position: 'fixed', 
            top: { xs: 56, sm: 64 }, // Position right below the AppBar
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
        sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${drawerWidth}px)` } }}
      >
        <Toolbar />
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Routes>
              <Route path="/" element={<ServerConfig />} />
              <Route path="/auth" element={<AuthConfig />} />
              <Route path="/backends" element={<BackendsConfig />} />
              <Route path="/features" element={<FeaturesConfig />} />
              <Route path="/redis" element={<RedisConfig />} />
              <Route path="/frontend" element={<FrontendConfig />} />
              <Route path="/monitoring" element={<MonitoringConfig />} />
              <Route path="/lua" element={<LuaConfig />} />
              <Route path="/ldap" element={<LDAPConfig />} />
              <Route path="/config-preview" element={<ConfigPreview />} />
            </Routes>
          </>
        )}
      </Box>

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
          You have unsaved changes. Do you want to continue without saving? Your changes will be lost.
        </DialogContent>
        <DialogActions>
          <Button onClick={handleNavigationCancel}>Cancel</Button>
          <Button onClick={handleNavigationConfirm} color="primary">Continue Without Saving</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Wrap the main content with the ConfigProvider and ThemeProvider
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <MainContent />
      </ConfigProvider>
    </ThemeProvider>
  );
};

export default App;
