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
} from '@mui/material';
import { keyframes } from '@mui/system';
import { useAuth } from '../contexts/AuthContext';

const isOIDCEnabled = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window._env_ && typeof window._env_.REACT_APP_OIDC_ENABLED === 'string') {
      return window._env_.REACT_APP_OIDC_ENABLED === 'true';
    }
    // Vite env
    // @ts-ignore
    const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    if (typeof env.REACT_APP_OIDC_ENABLED === 'string') return env.REACT_APP_OIDC_ENABLED === 'true';
    if (typeof env.VITE_OIDC_ENABLED === 'string') return env.VITE_OIDC_ENABLED === 'true';
  } catch {}
  return false;
};
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';

// Subtle floating animation and glow for dark mode
const floatAnim = keyframes`
  0% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
  100% { transform: translateY(0px); }
`;
const glowAnim = keyframes`
  0% { filter: drop-shadow(0 0 4px rgba(0, 200, 255, 0.35)) drop-shadow(0 0 10px rgba(0, 200, 255, 0.15)); }
  100% { filter: drop-shadow(0 0 8px rgba(0, 200, 255, 0.6)) drop-shadow(0 0 18px rgba(0, 200, 255, 0.35)); }
`;

const LoginPage = (): React.JSX.Element => {
  const { auth, login: authLogin, loginWithOIDC } = useAuth();
  const { login: userLogin } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const navigate = useNavigate();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate('/');
    }
  }, [auth.isAuthenticated, navigate]);

  // Redirect to MFA page if MFA is required
  useEffect(() => {
    if (auth.mfaRequired) {
      navigate('/mfa');
    }
  }, [auth.mfaRequired, navigate]);

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
        // Update AuthContext - this will trigger the useEffect hook if MFA is required
        await authLogin(username, password, rememberMe);

        // Also update UserContext to ensure both contexts are in sync
        await userLogin(username, password);

        // If no MFA is required and authentication is successful, navigation will happen via the useEffect hook
        // We don't need to do anything else here
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

        {isOIDCEnabled() && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              color="primary"
              fullWidth
              size="large"
              onClick={() => loginWithOIDC()}
              disabled={auth.loading}
            >
              Login with Single Sign-On (OIDC)
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default LoginPage;
