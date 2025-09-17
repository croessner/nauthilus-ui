import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { keyframes } from '@mui/system';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import * as mfaUtils from '../utils/mfaUtils';

// Animations for dark mode logo
const floatAnim = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
  100% { transform: translateY(0px); }
`;
const glowAnim = keyframes`
  0% { filter: drop-shadow(0 0 4px rgba(0, 200, 255, 0.35)) drop-shadow(0 0 10px rgba(0, 200, 255, 0.15)); }
  100% { filter: drop-shadow(0 0 8px rgba(0, 200, 255, 0.6)) drop-shadow(0 0 18px rgba(0, 200, 255, 0.35)); }
`;

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
  const currentUserRef = useRef<any>(null);
  // Ref to prevent concurrent WebAuthn attempts
  const webAuthnInProgressRef = useRef<boolean>(false);
  // Ref to track a scheduled automatic WebAuthn timeout to avoid double-scheduling
  const autoTriggerTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

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
    // Prevent concurrent WebAuthn requests which can break the browser API and server challenge
    if (webAuthnInProgressRef.current) {
      console.log('WebAuthn login already in progress, ignoring new request');
      return;
    }

    const user = currentUserRef.current;
    if (!user) {
      console.log('Missing currentUser for WebAuthn login');
      return;
    }

    console.log('Starting WebAuthn login for user:', user.username);
    webAuthnInProgressRef.current = true;
    setMfaLoading(true);
    setWebAuthnError('');

    try {
      // Start WebAuthn login
      console.log('Calling beginWebAuthnLogin');
      const options = await mfaUtils.beginWebAuthnLogin(user.username);
      console.log('WebAuthn options received:', options);

      // Get credential - wrap in a try/catch to handle user cancellation better
      console.log('Requesting credential from browser');
      let credential;
      try {
        credential = await navigator.credentials.get({
          publicKey: options
        }) as PublicKeyCredential;
        console.log('Credential received from browser');
      } catch (credentialError) {
        console.error('Error getting credential:', credentialError);
        // Handle user cancellation or browser issues specifically
        if (credentialError instanceof Error) {
          if (credentialError.name === 'NotAllowedError') {
            return Promise.reject(new Error('Authentication was cancelled. Please try again.'));
          } else if (credentialError.name === 'AbortError') {
            return Promise.reject(new Error('Authentication was aborted. Please try again.'));
          } else {
            return Promise.reject(credentialError); // Propagate to outer catch block
          }
        }
        return Promise.reject(new Error('Failed to get credential from browser'));
      }

      if (!credential) {
        return Promise.reject(new Error('No credential returned from browser'));
      }

      // Finish WebAuthn login
      console.log('Calling finishWebAuthnLogin');
      const success = await mfaUtils.finishWebAuthnLogin(credential);
      console.log('WebAuthn login result:', success);

      if (success) {
        console.log('WebAuthn verification successful, completing MFA login');
        // Clear the attempted flag on successful verification
        sessionStorage.removeItem('webauthn_attempted');
        
        // Complete the login process using the completeMfaLogin method
        const result = await completeMfaLogin(user.username, rememberMe);
        console.log('completeMfaLogin result:', result);

        // Only navigate if we got a valid result
        if (result) {
          // Also update UserContext to ensure both contexts are in sync
          await loginAfterMfa(user.username);
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
      if (error instanceof Error) {
        if (error.message.includes('Missing challenge')) {
          setWebAuthnError('Server configuration issue: Missing challenge in response. Please contact your administrator.');
        } else if (error.message.includes('challenge')) {
          setWebAuthnError('Server configuration issue: Invalid challenge. Please contact your administrator.');
        } else if (error.message.includes('abort') || error.message.includes('aborted')) {
          setWebAuthnError('Authentication was aborted. Please try again.');
        } else if (error.message.includes('cancel') || error.message.includes('cancelled')) {
          setWebAuthnError('Authentication was cancelled. Please try again.');
        } else {
          setWebAuthnError(`Authentication failed: ${error.message}`);
        }
      } else {
        setWebAuthnError('Authentication failed. Please try again.');
      }
    } finally {
      setMfaLoading(false);
      webAuthnInProgressRef.current = false;
    }
  }, [completeMfaLogin, rememberMe, loginAfterMfa, navigate]);

  // Initialize MFA when component mounts
  useEffect(() => {
    if (auth.mfaRequired) {
      // Create a minimal user object for MFA verification
      const mfaUser = {
        username: auth.username,
        mfaType: auth.mfaType,
        totpEnabled: auth.totpEnabled,
        webAuthnEnabled: auth.webAuthnEnabled,
      };

      // Store the user for MFA verification only if it changed
      if (!currentUserRef.current || currentUserRef.current.username !== mfaUser.username || currentUserRef.current.mfaType !== mfaUser.mfaType) {
        currentUserRef.current = mfaUser;
        setCurrentUser(mfaUser);
      }

      // Determine which MFA method to show based on the auth state
      if (auth.mfaType === 'webauthn' && auth.webAuthnEnabled && !auth.totpEnabled) {
        // Only WebAuthn available: select and auto-trigger
        setMfaMethod('webauthn');

        // Store a flag in sessionStorage to track if we've already attempted WebAuthn
        // This prevents repeated automatic attempts if the page reloads or re-renders
        const hasAttemptedWebAuthn = sessionStorage.getItem('webauthn_attempted') === 'true';

        // Schedule automatic WebAuthn only once, and only if not already attempted and no timeout pending
        if (!hasAttemptedWebAuthn && autoTriggerTimeoutRef.current === undefined) {
          console.log('Setting up automatic WebAuthn login with delay');
          // Mark as attempted immediately to avoid rescheduling on re-renders
          sessionStorage.setItem('webauthn_attempted', 'true');
          autoTriggerTimeoutRef.current = window.setTimeout(() => {
            // Clear our timeout ref since it has fired
            autoTriggerTimeoutRef.current = undefined;
            console.log('Automatically triggering WebAuthn login');
            handleWebAuthnLogin().catch(error => {
              console.error('Error in automatic WebAuthn login:', error);
              setWebAuthnError('Authentication failed. Please try again manually.');
            });
          }, 2000);
        } else if (hasAttemptedWebAuthn) {
          console.log('WebAuthn was already attempted, waiting for manual trigger');
        }

        // Cleanup function to clear timeout and sessionStorage when component unmounts
        return () => {
          if (autoTriggerTimeoutRef.current !== undefined) {
            window.clearTimeout(autoTriggerTimeoutRef.current);
            autoTriggerTimeoutRef.current = undefined;
          }
          // Only clear the flag if we're navigating away from the MFA page
          // (e.g., successful login or user manually navigating away)
          if (auth.isAuthenticated) {
            sessionStorage.removeItem('webauthn_attempted');
          }
        };
      } else if (auth.mfaType === 'totp' || auth.mfaType === 'choice') {
        // Default to TOTP when specified or when user should choose
        setMfaMethod('totp');
      }
    }
    
    // Cleanup function for non-WebAuthn cases
    return () => {
      if (auth.isAuthenticated) {
        sessionStorage.removeItem('webauthn_attempted');
      }
    };
  }, [auth.mfaRequired, auth.mfaType, auth.username, auth.isAuthenticated, auth.totpEnabled, auth.webAuthnEnabled, handleWebAuthnLogin]);

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
        backgroundColor: '#516291',
      }}
    >
      <Box
        component="img"
        src="/img/logo.png"
        alt="Nauthilus Logo"
        sx={{
          width: 200,
          mb: 4,
          filter: 'drop-shadow(0 10px 20px rgba(127, 127, 127, 0.5)) drop-shadow(0 0 35px rgba(255, 255, 255, 0.7))',
          transition: 'filter 0.3s ease-in-out, transform 0.3s ease-in-out',
          '&:hover': {
            filter: 'drop-shadow(0 15px 25px rgba(127, 127, 127, 0.8)) drop-shadow(0 0 50px rgba(255, 255, 255, 1))',
            transform: 'scale(1.1)',
          },
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

            {!mfaLoading && (
              <Typography variant="body2" color="textSecondary" align="center" sx={{ mb: 2 }}>
                If the authentication dialog doesn't appear automatically or was dismissed,
                click the button below to try again.
              </Typography>
            )}

            <Button
              onClick={() => {
                // Prevent re-entrancy if a WebAuthn flow is already running
                if (webAuthnInProgressRef.current) {
                  console.log('Manual WebAuthn trigger ignored: already in progress');
                  return;
                }
                // Clear the attempted flag when manually triggering to allow retry scheduling if needed
                sessionStorage.removeItem('webauthn_attempted');
                handleWebAuthnLogin().catch(error => {
                  console.error('Error in manual WebAuthn login:', error);
                  setWebAuthnError('Authentication failed. Please try again.');
                });
              }}
              color="primary"
              variant="contained"
              fullWidth
              size="large"
              disabled={mfaLoading}
              sx={{ mt: 2 }}
            >
              {mfaLoading ? <CircularProgress size={24} /> : 'Authenticate with Security Key'}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default MFAPage;
