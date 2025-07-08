import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  CircularProgress,
  Alert,
  Checkbox,
  FormControlLabel,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import * as mfaUtils from '../utils/mfaUtils';

const LoginPage = (): React.JSX.Element => {
  const { auth, login: authLogin } = useAuth();
  const { login: userLogin } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const navigate = useNavigate();

  // MFA states
  const [showMfaDialog, setShowMfaDialog] = useState(false);
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'webauthn'>('totp');
  const [totpToken, setTotpToken] = useState('');
  const [totpError, setTotpError] = useState('');
  const [webAuthnError, setWebAuthnError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Redirect to home if already authenticated
  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate('/');
    }
  }, [auth.isAuthenticated, navigate]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    if (e.target.value) {
      setUsernameError('');
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (e.target.value) {
      setPasswordError('');
    }
  };

  const handleRememberMeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRememberMe(e.target.checked);
  };

  // Handle TOTP verification
  const handleTotpVerify = async () => {
    if (!currentUser || !totpToken) return;

    setMfaLoading(true);
    setTotpError('');

    try {
      const success = await mfaUtils.verifyTOTP(currentUser.username, totpToken);

      if (success) {
        // Complete the login process
        setShowMfaDialog(false);

        // If login was successful, navigate to the server menu page
        navigate('/');
      } else {
        setTotpError('Invalid verification code. Please try again.');
      }
    } catch (error) {
      setTotpError('Failed to verify code. Please try again.');
      console.error('TOTP verification error:', error);
    } finally {
      setMfaLoading(false);
    }
  };

  // Handle WebAuthn login
  const handleWebAuthnLogin = async () => {
    if (!currentUser) return;

    setMfaLoading(true);
    setWebAuthnError('');

    try {
      // Start WebAuthn login
      const options = await mfaUtils.beginWebAuthnLogin(currentUser.username);

      // Get credential
      const credential = await navigator.credentials.get({
        publicKey: options
      }) as PublicKeyCredential;

      // Finish WebAuthn login
      const success = await mfaUtils.finishWebAuthnLogin(credential);

      if (success) {
        // Complete the login process
        setShowMfaDialog(false);

        // If login was successful, navigate to the server menu page
        navigate('/');
      } else {
        setWebAuthnError('Authentication failed. Please try again.');
      }
    } catch (error) {
      setWebAuthnError('Authentication failed. Please try again.');
      console.error('WebAuthn login error:', error);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Simple validation
    let isValid = true;

    if (!username) {
      setUsernameError('Username is required');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      isValid = false;
    }

    if (isValid) {
      try {
        // Update AuthContext first
        await authLogin(username, password, rememberMe);

        // Then update UserContext
        const userResult = await userLogin(username, password);

        // If login was successful
        if (userResult) {
          // Check if user has MFA enabled
          if (userResult.totpEnabled || userResult.webAuthnEnabled) {
            // Store the user for MFA verification
            setCurrentUser(userResult);

            // Determine which MFA method to show first
            if (userResult.webAuthnEnabled) {
              setMfaMethod('webauthn');
            } else {
              setMfaMethod('totp');
            }

            // Show MFA dialog
            setShowMfaDialog(true);

            // If WebAuthn is enabled, trigger it automatically
            if (userResult.webAuthnEnabled) {
              setTimeout(() => {
                handleWebAuthnLogin();
              }, 500);
            }
          } else {
            // No MFA required, navigate to the server menu page
            navigate('/');
          }
        }
      } catch (error) {
        console.error('Login error:', error);
      }
    }
  };


  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Box
        component="img"
        src="/img/logo.png"
        alt="Nauthilus Logo"
        sx={{
          width: 200,
          mb: 4
        }}
      />
      <Paper
        elevation={3}
        sx={{
          p: 4,
          maxWidth: 400,
          width: '100%',
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Login
        </Typography>

        {auth.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {auth.error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            label="Username"
            variant="outlined"
            fullWidth
            margin="normal"
            value={username}
            onChange={handleUsernameChange}
            error={!!usernameError}
            helperText={usernameError}
            disabled={auth.loading}
          />

          <TextField
            label="Password"
            type="password"
            variant="outlined"
            fullWidth
            margin="normal"
            value={password}
            onChange={handlePasswordChange}
            error={!!passwordError}
            helperText={passwordError}
            disabled={auth.loading}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={handleRememberMeChange}
                disabled={auth.loading}
              />
            }
            label="Remember me"
            sx={{ mt: 1 }}
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            sx={{ mt: 2 }}
            disabled={auth.loading}
          >
            {auth.loading ? <CircularProgress size={24} /> : 'Login'}
          </Button>
        </form>
      </Paper>

      {/* MFA Dialog */}
      <Dialog open={showMfaDialog} onClose={() => {}} maxWidth="sm" fullWidth>
        <DialogTitle>Two-Factor Authentication</DialogTitle>
        <DialogContent>
          <Tabs
            value={mfaMethod}
            onChange={(e, newValue) => setMfaMethod(newValue)}
            indicatorColor="primary"
            textColor="primary"
            centered
          >
            {currentUser?.totpEnabled && (
              <Tab label="Authenticator App" value="totp" />
            )}
            {currentUser?.webAuthnEnabled && (
              <Tab label="Security Key" value="webauthn" />
            )}
          </Tabs>

          {/* TOTP Verification */}
          {mfaMethod === 'totp' && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body1" paragraph>
                Enter the verification code from your authenticator app:
              </Typography>
              <TextField
                label="Verification Code"
                variant="outlined"
                fullWidth
                margin="normal"
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value)}
                disabled={mfaLoading}
                placeholder="Enter the 6-digit code"
                autoFocus
              />
              {totpError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {totpError}
                </Alert>
              )}
            </Box>
          )}

          {/* WebAuthn */}
          {mfaMethod === 'webauthn' && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body1" paragraph>
                Please insert your security key and follow your browser's instructions.
              </Typography>
              {webAuthnError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {webAuthnError}
                </Alert>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                {mfaLoading && <CircularProgress />}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {mfaMethod === 'totp' && (
            <Button
              onClick={handleTotpVerify}
              color="primary"
              variant="contained"
              disabled={!totpToken || mfaLoading}
            >
              {mfaLoading ? <CircularProgress size={24} /> : 'Verify'}
            </Button>
          )}
          {mfaMethod === 'webauthn' && (
            <Button
              onClick={handleWebAuthnLogin}
              color="primary"
              variant="contained"
              disabled={mfaLoading}
            >
              Try Again
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LoginPage;
