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
  IconButton,
  Tooltip,
} from '@mui/material';
import { keyframes } from '@mui/system';
import { alpha, useTheme as useMuiTheme } from '@mui/material/styles';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme as useAppTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';
import { ensureCSRFToken } from '../utils/csrf';

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
  const { mode, toggleColorMode } = useAppTheme();
  const theme = useMuiTheme();
  const { syncSession } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Warm the CSRF cookie on the login screen so the submit path stays synchronous.
    void ensureCSRFToken();
  }, []);

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
        // Establish the authenticated session first.
        await authLogin(username, password, rememberMe);

        // Then hydrate the current user from the session cookie without re-authenticating.
        await syncSession();
      } catch (error) {
        console.error('Login error:', error);
      }
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        px: 2,
        py: 6,
        background: mode === 'dark'
          ? 'radial-gradient(circle at top, rgba(93, 111, 163, 0.35), rgba(15, 23, 42, 0.98) 52%, #020617 100%)'
          : 'linear-gradient(160deg, #6f81b4 0%, #516291 45%, #dbe3f2 100%)',
        transition: 'background 0.3s ease',
      }}
    >
      <Tooltip title={mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
        <IconButton
          onClick={toggleColorMode}
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            color: theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.primary.contrastText,
            backgroundColor: alpha(
              theme.palette.mode === 'dark' ? theme.palette.background.paper : theme.palette.primary.main,
              theme.palette.mode === 'dark' ? 0.72 : 0.28
            ),
            border: `1px solid ${alpha(theme.palette.common.white, theme.palette.mode === 'dark' ? 0.14 : 0.32)}`,
            backdropFilter: 'blur(10px)',
            '&:hover': {
              backgroundColor: alpha(
                theme.palette.mode === 'dark' ? theme.palette.background.paper : theme.palette.primary.main,
                theme.palette.mode === 'dark' ? 0.9 : 0.4
              ),
            },
          }}
          aria-label={mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
        </IconButton>
      </Tooltip>

      <Box
        component="img"
        src="/img/logo.png"
        alt="Nauthilus Logo"
        sx={{
          width: 200,
          mb: 4,
          filter: mode === 'dark'
            ? 'drop-shadow(0 0 10px rgba(0, 200, 255, 0.35)) drop-shadow(0 0 28px rgba(0, 200, 255, 0.25))'
            : 'drop-shadow(0 10px 20px rgba(127, 127, 127, 0.5)) drop-shadow(0 0 35px rgba(255, 255, 255, 0.7))',
          transition: 'filter 0.3s ease-in-out, transform 0.3s ease-in-out',
          animation: mode === 'dark' ? `${floatAnim} 4s ease-in-out infinite, ${glowAnim} 2.4s ease-in-out infinite alternate` : 'none',
          '&:hover': {
            filter: mode === 'dark'
              ? 'drop-shadow(0 0 14px rgba(0, 200, 255, 0.55)) drop-shadow(0 0 42px rgba(0, 200, 255, 0.35))'
              : 'drop-shadow(0 15px 25px rgba(127, 127, 127, 0.8)) drop-shadow(0 0 50px rgba(255, 255, 255, 1))',
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
          borderRadius: 3,
          backgroundColor: alpha(theme.palette.background.paper, mode === 'dark' ? 0.9 : 0.96),
          boxShadow: mode === 'dark'
            ? '0 24px 60px rgba(2, 6, 23, 0.45)'
            : '0 20px 50px rgba(15, 23, 42, 0.16)',
          backdropFilter: 'blur(12px)',
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
