import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Avatar,
  Grid,
  Container,
  Alert,
  CircularProgress,
  IconButton,
  Divider
} from '@mui/material';
import { useUser } from '../contexts/UserContext';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const UserProfile: React.FC = () => {
  const { user, updateUserProfile, updatePassword, loading, error, clearError } = useUser();

  // Profile section state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');

  // File upload reference
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password section state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status messages
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Initialize form with current user data
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
      setAvatar(user.avatar || '');
    }
  }, [user]);

  // Handle profile update
  const handleUpdateProfile = async () => {
    if (!user) return;

    setProfileError(null);
    setProfileSuccess(null);

    try {
      await updateUserProfile(user.username, {
        displayName: displayName || undefined,
        email: email || undefined,
        avatar: avatar || undefined
      });
      setProfileSuccess('Profile updated successfully');
    } catch (err) {
      console.error('Error updating profile:', err);
      setProfileError('Failed to update profile');
    }
  };

  // Handle password update
  const handleUpdatePassword = async () => {
    if (!user) return;

    setPasswordError(null);
    setPasswordSuccess(null);

    // Validate passwords
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }

    if (!oldPassword) {
      setPasswordError("Current password is required");
      return;
    }

    if (!newPassword) {
      setPasswordError("New password is required");
      return;
    }

    try {
      // Note: This is a simplified implementation. In a real app, you would verify the old password first.
      await updatePassword(user.username, newPassword);
      setPasswordSuccess('Password updated successfully');

      // Clear password fields
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Error updating password:', err);
      setPasswordError('Failed to update password');
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.match('image.*')) {
      setProfileError('Please select an image file');
      return;
    }

    // Check file size (limit to 1MB)
    if (file.size > 1024 * 1024) {
      setProfileError('Image size should be less than 1MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target?.result as string;
      setAvatar(base64String);
    };
    reader.onerror = () => {
      setProfileError('Failed to read the image file');
    };
    reader.readAsDataURL(file);
  };

  // Trigger file input click
  const handleAvatarUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Clear all messages
  const clearMessages = () => {
    setProfileError(null);
    setPasswordError(null);
    setProfileSuccess(null);
    setPasswordSuccess(null);
    clearError();
  };

  if (!user) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">You must be logged in to view this page.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Your Profile
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {/* Profile Information Section */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" component="h2" gutterBottom>
                Profile Information
              </Typography>

              {profileSuccess && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setProfileSuccess(null)}>
                  {profileSuccess}
                </Alert>
              )}

              {profileError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setProfileError(null)}>
                  {profileError}
                </Alert>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                <Box sx={{ position: 'relative' }}>
                  {avatar ? (
                    <Avatar 
                      src={avatar} 
                      alt={displayName || user.username}
                      sx={{ width: 120, height: 120 }}
                    />
                  ) : (
                    <AccountCircleIcon sx={{ width: 120, height: 120, color: 'action.active' }} />
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
                Upload an image file (JPG, PNG) for your avatar.
                Maximum size: 1MB.
              </Typography>

              <TextField
                margin="dense"
                id="displayName"
                label="Display Name"
                type="text"
                fullWidth
                variant="outlined"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                sx={{ mb: 2 }}
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
                sx={{ mb: 3 }}
              />

              <Button 
                variant="contained" 
                color="primary" 
                onClick={handleUpdateProfile}
                fullWidth
              >
                Update Profile
              </Button>
            </Paper>
          </Grid>

          {/* Password Change Section */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" component="h2" gutterBottom>
                Change Password
              </Typography>

              {passwordSuccess && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPasswordSuccess(null)}>
                  {passwordSuccess}
                </Alert>
              )}

              {passwordError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPasswordError(null)}>
                  {passwordError}
                </Alert>
              )}

              <TextField
                margin="dense"
                id="oldPassword"
                label="Current Password"
                type="password"
                fullWidth
                variant="outlined"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                sx={{ mb: 2 }}
              />

              <TextField
                margin="dense"
                id="newPassword"
                label="New Password"
                type="password"
                fullWidth
                variant="outlined"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                sx={{ mb: 2 }}
              />

              <TextField
                margin="dense"
                id="confirmPassword"
                label="Confirm New Password"
                type="password"
                fullWidth
                variant="outlined"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                sx={{ mb: 3 }}
              />

              <Button 
                variant="contained" 
                color="primary" 
                onClick={handleUpdatePassword}
                fullWidth
                disabled={!oldPassword || !newPassword || !confirmPassword}
              >
                Update Password
              </Button>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Container>
  );
};

export default UserProfile;
