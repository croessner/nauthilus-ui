import React, { useState, useEffect, useCallback } from 'react';
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
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useUser } from '../contexts/UserContext';

const UserManagement: React.FC = () => {
  const { getUsers, addUser, removeUser, updatePassword, loading, error, clearError, user: currentUser } = useUser();
  const [users, setUsers] = useState<{ username: string; roles: string[] }[]>([]);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roles, setRoles] = useState<string[]>(['user']);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
                    <TableCell>Username</TableCell>
                    <TableCell>Roles</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.username}>
                      <TableCell>{user.username}</TableCell>
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
                      <TableCell align="right">
                        <IconButton 
                          color="primary" 
                          onClick={() => openEdit(user.username)}
                          size="small"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton 
                          color="error" 
                          onClick={() => openDelete(user.username)}
                          size="small"
                          disabled={currentUser?.username === user.username || !isAdmin}
                        >
                          <DeleteIcon />
                        </IconButton>
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
