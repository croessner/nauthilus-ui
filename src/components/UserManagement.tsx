import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Avatar,
  Tooltip,
  Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useUser } from '../contexts/UserContext';

const UserManagement: React.FC = () => {
  const { getUsers, addUser, removeUser, updatePassword, updateUserProfile, loading, error, clearError, user: currentUser } = useUser();
  const [users, setUsers] = useState<{
    username: string;
    roles: string[];
    displayName?: string;
    email?: string;
    avatar?: string;
    lastLogin?: string | null;
    lastModified?: string;
  }[]>([]);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [openProfileDialog, setOpenProfileDialog] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [roles, setRoles] = useState<string[]>(['user']);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // File upload reference
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if user has admin role
  const isAdmin = currentUser?.roles.includes('admin');

  // Define loadUsers function with useCallback to memoize it
  const loadUsers = useCallback(async () => {
    const usersList = await getUsers();
    setUsers(usersList);
  }, [getUsers, setUsers]);

  // Load users on component mount
  useEffect(() => {
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddUser = async () => {
    setLocalError(null);

    // Validate input
    if (password !== confirmPassword) {
      setLocalError("Passwords don't match");
      return;
    }

    try {
      await addUser(username, password, roles);
      setOpenAddDialog(false);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setRoles(['user']);
      setSuccessMessage('User added successfully');
      loadUsers();
    } catch (err) {
      console.error('Error adding user:', err);
    }
  };

  const handleEditUser = async () => {
    setLocalError(null);

    // Validate input
    if (password !== confirmPassword) {
      setLocalError("Passwords don't match");
      return;
    }

    try {
      await updatePassword(selectedUser, password);
      setOpenEditDialog(false);
      setPassword('');
      setConfirmPassword('');
      setSuccessMessage('Password updated successfully');
    } catch (err) {
      console.error('Error updating password:', err);
    }
  };

  const handleDeleteUser = async () => {
    // Additional validation to prevent self-deletion and ensure only admins can delete
    if (currentUser?.username === selectedUser) {
      setLocalError("You cannot delete your own account");
      setOpenDeleteDialog(false);
      return;
    }

    if (!isAdmin) {
      setLocalError("Only administrators can delete users");
      setOpenDeleteDialog(false);
      return;
    }

    try {
      await removeUser(selectedUser);
      setOpenDeleteDialog(false);
      setSuccessMessage('User deleted successfully');
      loadUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  const handleRoleChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setRoles(typeof value === 'string' ? value.split(',') : value);
  };

  const openEdit = (username: string) => {
    setSelectedUser(username);
    setPassword('');
    setConfirmPassword('');
    setOpenEditDialog(true);
  };

  const openDelete = (username: string) => {
    setSelectedUser(username);
    setOpenDeleteDialog(true);
  };

  const openProfile = (username: string) => {
    const user = users.find(u => u.username === username);
    if (user) {
      setSelectedUser(username);
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
      setAvatar(user.avatar || '');
      setOpenProfileDialog(true);
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.match('image.*')) {
      setLocalError('Please select an image file');
      return;
    }

    // Check file size (limit to 1MB)
    if (file.size > 1024 * 1024) {
      setLocalError('Image size should be less than 1MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      setAvatar(base64String);
    };
    reader.onerror = () => {
      setLocalError('Failed to read the image file');
    };
    reader.readAsDataURL(file);
  };

  // Trigger file input click
  const handleAvatarUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpdateProfile = async () => {
    setLocalError(null);

    try {
      await updateUserProfile(selectedUser, {
        displayName: displayName || undefined,
        email: email || undefined,
        avatar: avatar || undefined
      });
      setOpenProfileDialog(false);
      setSuccessMessage('Profile updated successfully');
      loadUsers();
    } catch (err) {
      console.error('Error updating profile:', err);
    }
  };

  const clearMessages = () => {
    setLocalError(null);
    clearError();
    setSuccessMessage(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      {!isAdmin ? (
        // Access denied message for non-admin users
        <Alert severity="error" sx={{ mb: 2 }}>
          Access Denied: You need administrator privileges to access this page.
        </Alert>
      ) : (
        // Content only visible to admin users
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" component="h1">
              User Management
            </Typography>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<PersonAddIcon />}
              onClick={() => setOpenAddDialog(true)}
            >
              Add User
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
              {error}
            </Alert>
          )}

          {localError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError(null)}>
              {localError}
            </Alert>
          )}

          {successMessage && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
              {successMessage}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Display Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Roles</TableCell>
                    <TableCell>Last Login</TableCell>
                    <TableCell>Last Modified</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.username}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {user.avatar ? (
                            <Avatar 
                              src={user.avatar} 
                              alt={user.displayName || user.username}
                              sx={{ width: 32, height: 32, mr: 1 }}
                            />
                          ) : (
                            <AccountCircleIcon sx={{ width: 32, height: 32, mr: 1 }} />
                          )}
                          {user.username}
                        </Box>
                      </TableCell>
                      <TableCell>{user.displayName || '-'}</TableCell>
                      <TableCell>{user.email || '-'}</TableCell>
                      <TableCell>
                        {user.roles.map(role => (
                          <Chip 
                            key={role} 
                            label={role} 
                            color={role === 'admin' ? 'primary' : 'default'} 
                            size="small" 
                            sx={{ mr: 0.5 }} 
                          />
                        ))}
                      </TableCell>
                      <TableCell>
                        {user.lastLogin !== null && user.lastLogin !== undefined ? new Date(user.lastLogin).toLocaleString() : 'Never logged in'}
                      </TableCell>
                      <TableCell>
                        {user.lastModified ? new Date(user.lastModified).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit Password">
                          <IconButton 
                            color="primary" 
                            onClick={() => openEdit(user.username)}
                            size="small"
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Profile">
                          <IconButton 
                            color="primary" 
                            onClick={() => openProfile(user.username)}
                            size="small"
                          >
                            <AccountCircleIcon />
                          </IconButton>
                        </Tooltip>
                        {/* Wrap disabled button in span to allow tooltip to work */}
                        <Tooltip title="Delete User">
                          <span>
                            <IconButton 
                              color="error" 
                              onClick={() => openDelete(user.username)}
                              size="small"
                              disabled={currentUser?.username === user.username || !isAdmin}
                            >
                              <DeleteIcon sx={{ color: (currentUser?.username === user.username || !isAdmin) ? 'action.disabled' : 'inherit' }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Only render dialogs if user is admin */}
      {isAdmin && (
        <>
          {/* Add User Dialog */}
          <Dialog 
            open={openAddDialog} 
            onClose={() => setOpenAddDialog(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Add New User</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                margin="dense"
                id="username"
                label="Username"
                type="text"
                fullWidth
                variant="outlined"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                sx={{ mb: 2, mt: 1 }}
              />

              <TextField
                margin="dense"
                id="password"
                label="Password"
                type="password"
                fullWidth
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                sx={{ mb: 2 }}
              />

              <TextField
                margin="dense"
                id="confirmPassword"
                label="Confirm Password"
                type="password"
                fullWidth
                variant="outlined"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                sx={{ mb: 2 }}
              />

              <FormControl fullWidth>
                <InputLabel id="roles-label">Roles</InputLabel>
                <Select
                  labelId="roles-label"
                  id="roles"
                  multiple
                  value={roles}
                  onChange={handleRoleChange}
                  label="Roles"
                >
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="user">User</MenuItem>
                </Select>
              </FormControl>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => {
                setOpenAddDialog(false);
                clearMessages();
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddUser} 
                variant="contained" 
                color="primary"
                disabled={!username || !password || !confirmPassword || roles.length === 0}
              >
                Add User
              </Button>
            </DialogActions>
          </Dialog>

          {/* Edit User Dialog */}
          <Dialog 
            open={openEditDialog} 
            onClose={() => setOpenEditDialog(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Change Password for {selectedUser}</DialogTitle>
            <DialogContent>
              <TextField
                margin="dense"
                id="newPassword"
                label="New Password"
                type="password"
                fullWidth
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                sx={{ mb: 2, mt: 1 }}
              />

              <TextField
                margin="dense"
                id="confirmNewPassword"
                label="Confirm New Password"
                type="password"
                fullWidth
                variant="outlined"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => {
                setOpenEditDialog(false);
                clearMessages();
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleEditUser} 
                variant="contained" 
                color="primary"
                disabled={!password || !confirmPassword}
              >
                Update Password
              </Button>
            </DialogActions>
          </Dialog>

          {/* Edit Profile Dialog */}
          <Dialog 
            open={openProfileDialog} 
            onClose={() => setOpenProfileDialog(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Edit Profile for {selectedUser}</DialogTitle>
            <DialogContent>
              <TextField
                margin="dense"
                id="displayName"
                label="Display Name"
                type="text"
                fullWidth
                variant="outlined"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                sx={{ mb: 2, mt: 1 }}
              />

              <TextField
                margin="dense"
                id="email"
                label="Email"
                type="email"
                fullWidth
                variant="outlined"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                <Box sx={{ position: 'relative' }}>
                  {avatar ? (
                    <Avatar 
                      src={avatar} 
                      alt={displayName || selectedUser}
                      sx={{ width: 100, height: 100 }}
                    />
                  ) : (
                    <AccountCircleIcon sx={{ width: 100, height: 100, color: 'action.active' }} />
                  )}
                  <IconButton
                    color="primary"
                    aria-label="upload avatar"
                    component="span"
                    onClick={handleAvatarUploadClick}
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      backgroundColor: 'background.paper',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <PhotoCameraIcon />
                  </IconButton>
                </Box>

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileUpload}
                />

                <Button
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  onClick={handleAvatarUploadClick}
                  sx={{ mt: 2 }}
                >
                  Upload Avatar
                </Button>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                Upload an image file (JPG, PNG) for the user's avatar.
                Maximum size: 1MB.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => {
                setOpenProfileDialog(false);
                clearMessages();
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateProfile} 
                variant="contained" 
                color="primary"
              >
                Update Profile
              </Button>
            </DialogActions>
          </Dialog>

          {/* Delete User Dialog */}
          <Dialog 
            open={openDeleteDialog} 
            onClose={() => setOpenDeleteDialog(false)}
          >
            <DialogTitle>Delete User</DialogTitle>
            <DialogContent>
              <Typography>
                Are you sure you want to delete the user "{selectedUser}"? This action cannot be undone.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenDeleteDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleDeleteUser} 
                variant="contained" 
                color="error"
                disabled={currentUser?.username === selectedUser || !isAdmin}
              >
                Delete
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  );
};

export default UserManagement;
