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
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import DescriptionIcon from '@mui/icons-material/Description';
import GavelIcon from '@mui/icons-material/Gavel';
import BuildIcon from '@mui/icons-material/Build';
import LinkIcon from '@mui/icons-material/Link';
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
import ConnectionConfig from './components/ConnectionConfig';
import ConfigPreview from './components/ConfigPreview';
import LicensesPage from './components/LicensesPage';
import ConfigWizard from './components/ConfigWizard';

const drawerWidth = 240;

interface NavigationMenuItem {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadWithProfileRef = useRef<HTMLInputElement>(null);
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

  // Define menu items
  const menuItems: NavigationMenuItem[] = [
    { text: 'Server', icon: <SettingsIcon />, path: '/' },
    { text: 'Authentication', icon: <SecurityIcon />, path: '/auth' },
    { text: 'Connection', icon: <LinkIcon />, path: '/connection' },
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

  // Define licenses menu item separately to place it at the bottom
  const licensesMenuItem: NavigationMenuItem = { text: 'Licenses', icon: <GavelIcon />, path: '/licenses' };

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

  const handleProfileChange = (event: SelectChangeEvent<string>) => {
    const profileName = event.target.value;
    switchProfile(profileName);
  };

  const handleCreateProfileClick = () => {
    setNewProfileName('');
    setCreateProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleCreateProfileConfirm = () => {
    if (newProfileName.trim()) {
      createProfile(newProfileName.trim());
      setCreateProfileDialogOpen(false);
    }
  };

  const handleRenameProfileClick = () => {
    setProfileToRename(currentProfileName);
    setNewProfileNameForRename(currentProfileName);
    setRenameProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleRenameProfileConfirm = () => {
    if (newProfileNameForRename.trim() && profileToRename) {
      renameProfile(profileToRename, newProfileNameForRename.trim());
      setRenameProfileDialogOpen(false);
    }
  };

  const handleDeleteProfileClick = () => {
    setProfileToDelete(currentProfileName);
    setDeleteProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleDeleteProfileConfirm = () => {
    if (profileToDelete) {
      deleteProfile(profileToDelete);
      setDeleteProfileDialogOpen(false);
    }
  };

  const handleUploadWithProfileClick = () => {
    setUploadProfileName('');
    setUploadProfileDialogOpen(true);
    handleProfileMenuClose();
  };

  const handleUploadWithProfileConfirm = () => {
    if (uploadWithProfileRef.current?.files?.[0]) {
      uploadConfig(uploadWithProfileRef.current.files[0], uploadProfileName.trim() || undefined);
      setUploadProfileDialogOpen(false);
      // Reset the input value so the same file can be uploaded again if needed
      if (uploadWithProfileRef.current) {
        uploadWithProfileRef.current.value = '';
      }
    }
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
      <Box sx={{ flexGrow: 1 }} />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={() => handleNavigation(licensesMenuItem.path)}>
            <ListItemIcon>
              {licensesMenuItem.icon}
            </ListItemIcon>
            <ListItemText primary={licensesMenuItem.text} />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
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
            <Typography variant="h6" noWrap component="div" sx={{ mr: 2 }}>
              Configuration
            </Typography>

            {/* Profile selector */}
            <FormControl variant="outlined" size="small" sx={{ minWidth: 200, mr: 2 }}>
              <InputLabel id="profile-select-label">Profile</InputLabel>
              <Select
                labelId="profile-select-label"
                id="profile-select"
                value={currentProfileName}
                onChange={handleProfileChange}
                label="Profile"
                sx={{ color: 'inherit' }}
              >
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
              sx={{ mr: 2 }}
            >
              Manage Profiles
            </Button>

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
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
              <Route path="/connection" element={<ConnectionConfig />} />
              <Route path="/backends" element={<BackendsConfig />} />
              <Route path="/features" element={<FeaturesConfig />} />
              <Route path="/redis" element={<RedisConfig />} />
              <Route path="/frontend" element={<FrontendConfig />} />
              <Route path="/monitoring" element={<MonitoringConfig />} />
              <Route path="/lua" element={<LuaConfig />} />
              <Route path="/ldap" element={<LDAPConfig />} />
              <Route path="/config-preview" element={<ConfigPreview />} />
              <Route path="/licenses" element={<LicensesPage />} />
              <Route path="/config-wizard" element={<ConfigWizard autoOpen={true} />} />
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
