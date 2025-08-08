import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  CircularProgress,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import * as mfaUtils from '../utils/mfaUtils';

const MFAPage = (): React.JSX.Element => {
  const { auth, completeMfaLogin } = useAuth();
  const { loginAfterMfa } = useUser();
  const navigate = useNavigate();
  const [rememberMe] = useState(false);

  // MFA states
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'webauthn'>('totp');
  const [totpToken, setTotpToken] = useState('');
  const [totpError, setTotpError] = useState('');
  const [webAuthnError, setWebAuthnError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Redirect to login if MFA is not required
  useEffect(() => {
    if (!auth.mfaRequired) {
      navigate('/login');
    }
  }, [auth.mfaRequired, navigate]);

  // Redirect to home if already authenticated
  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate('/');
    }
  }, [auth.isAuthenticated, navigate]);

  // Handle WebAuthn login
  const handleWebAuthnLogin = useCallback(async () => {
    if (!currentUser) {
      console.log('Missing currentUser for WebAuthn login');
      return;
    }

    console.log('Starting WebAuthn login for user:', currentUser.username);
    setMfaLoading(true);
    setWebAuthnError('');

    try {
      // Start WebAuthn login
      console.log('Calling beginWebAuthnLogin');
      const options = await mfaUtils.beginWebAuthnLogin(currentUser.username);
      console.log('WebAuthn options received:', options);

      // Get credential
      console.log('Requesting credential from browser');
      const credential = await navigator.credentials.get({
        publicKey: options
      }) as PublicKeyCredential;
      console.log('Credential received from browser');

      // Finish WebAuthn login
      console.log('Calling finishWebAuthnLogin');
      const success = await mfaUtils.finishWebAuthnLogin(credential);
      console.log('WebAuthn login result:', success);

      if (success) {
        console.log('WebAuthn verification successful, completing MFA login');
        // Complete the login process using the completeMfaLogin method
        const result = await completeMfaLogin(currentUser.username, rememberMe);
        console.log('completeMfaLogin result:', result);

        // Only navigate if we got a valid result
        if (result) {
          // Also update UserContext to ensure both contexts are in sync
          await loginAfterMfa(currentUser.username);
          console.log('Valid result from completeMfaLogin, navigating to home page');
          navigate('/');
        } else {
          console.error('Invalid result from completeMfaLogin, not navigating');
          setWebAuthnError('Failed to complete authentication. Please try again.');
        }
      } else {
        console.log('WebAuthn verification failed');
        setWebAuthnError('Authentication failed. Please try again.');
      }
    } catch (error) {
      console.error('WebAuthn login error:', error);
      setWebAuthnError('Authentication failed. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  }, [currentUser, completeMfaLogin, rememberMe, loginAfterMfa, navigate]);

  // Initialize MFA when component mounts
  useEffect(() => {
    if (auth.mfaRequired) {
      // Create a minimal user object for MFA verification
      const mfaUser = {
        username: auth.username,
        mfaType: auth.mfaType
      };

      // Store the user for MFA verification
      setCurrentUser(mfaUser);

      // Determine which MFA method to show based on the auth state
      if (auth.mfaType === 'webauthn') {
        setMfaMethod('webauthn');

        // If WebAuthn is enabled, trigger it automatically
        setTimeout(() => {
          handleWebAuthnLogin();
        }, 500);
      } else if (auth.mfaType === 'totp') {
        setMfaMethod('totp');
      }
    }
  }, [auth.mfaRequired, auth.mfaType, auth.username, handleWebAuthnLogin]);

  // Handle TOTP verification
  const handleTotpVerify = useCallback(async () => {
    if (!currentUser || !totpToken) {
      console.log('Missing currentUser or totpToken', { currentUser, totpToken });
      return;
    }

    console.log('Starting TOTP verification for user:', currentUser.username);
    setMfaLoading(true);
    setTotpError('');

    try {
      console.log('Calling verifyTOTP with:', currentUser.username, totpToken);
      const success = await mfaUtils.verifyTOTP(currentUser.username, totpToken);
      console.log('TOTP verification result:', success);

      if (success) {
        console.log('TOTP verification successful, completing MFA login');
        // Complete the login process using the completeMfaLogin method
        const result = await completeMfaLogin(currentUser.username, rememberMe);
        console.log('completeMfaLogin result:', result);

        // Only navigate if we got a valid result
        if (result) {
          // Also update UserContext to ensure both contexts are in sync
          await loginAfterMfa(currentUser.username);
          console.log('Valid result from completeMfaLogin, navigating to home page');
          navigate('/');
        } else {
          console.error('Invalid result from completeMfaLogin, not navigating');
          setTotpError('Failed to complete authentication. Please try again.');
        }
      } else {
        console.log('TOTP verification failed');
        setTotpError('Invalid verification code. Please try again.');
      }
    } catch (error) {
      console.error('TOTP verification error:', error);
      setTotpError('Failed to verify code. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  }, [currentUser, totpToken, completeMfaLogin, rememberMe, loginAfterMfa, navigate]);

  // Handle TOTP input change
  const handleTotpInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow up to 6 digits
    if (value && !/^\d+$/.test(value)) {
      return;
    }
    
    // Limit to 6 digits
    const sanitizedValue = value.slice(0, 6);
    setTotpToken(sanitizedValue);
  };

  // Handle keydown events for TOTP input
  const handleTotpKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Submit the form when Enter/Return is pressed and all digits are filled
    if ((e.key === 'Enter' || e.key === 'Return') && totpToken.length === 6 && !mfaLoading) {
      handleTotpVerify();
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
          Two-Factor Authentication
        </Typography>

        <Tabs
          value={mfaMethod}
          onChange={(e, newValue) => setMfaMethod(newValue)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2 }}
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
            <Typography variant="body1" paragraph align="center">
              Enter the verification code from your authenticator app:
            </Typography>

            {/* Single input field for TOTP code */}
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'center',
                mb: 3
              }}
            >
              <TextField
                id="totp-input"
                variant="outlined"
                placeholder="Enter code"
                inputProps={{ 
                  maxLength: 6,
                  inputMode: 'numeric',
                  style: { 
                    textAlign: 'center',
                    fontSize: '1.5rem',
                    padding: '10px'
                  }
                }}
                value={totpToken}
                onChange={handleTotpInputChange}
                onKeyDown={handleTotpKeyDown}
                disabled={mfaLoading}
                autoFocus
                sx={{ width: '200px' }}
              />
            </Box>

            {totpError && (
              <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                {totpError}
              </Alert>
            )}

            <Button
              onClick={handleTotpVerify}
              color="primary"
              variant="contained"
              fullWidth
              size="large"
              disabled={totpToken.length !== 6 || mfaLoading}
              sx={{ mt: 2 }}
            >
              {mfaLoading ? <CircularProgress size={24} /> : 'Verify'}
            </Button>
          </Box>
        )}

        {/* WebAuthn */}
        {mfaMethod === 'webauthn' && (
          <Box sx={{ p: 2 }}>
            <Typography variant="body1" paragraph align="center">
              Please insert your security key and follow your browser's instructions.
            </Typography>
            {webAuthnError && (
              <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                {webAuthnError}
              </Alert>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 2 }}>
              {mfaLoading && <CircularProgress />}
            </Box>

            <Button
              onClick={handleWebAuthnLogin}
              color="primary"
              variant="contained"
              fullWidth
              size="large"
              disabled={mfaLoading}
              sx={{ mt: 2 }}
            >
              Try Again
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default MFAPage;
