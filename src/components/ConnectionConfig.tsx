import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { Formik, Form, Field, getIn } from 'formik';
import * as Yup from 'yup';
import { 
  TextField, 
  FormControlLabel, 
  Grid, 
  Button, 
  Box,
  Typography,
  Switch,
  CircularProgress,
  Tooltip,
  IconButton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import FormSection from './common/FormSection';
import PasswordField from './common/PasswordField';
import { checkConnection as checkConnectionUtil, loadSettings as loadSettingsUtil, resetSettingsState } from '../utils/apiUtils';

// Validation schema
const ConnectionConfigSchema = Yup.object().shape({
  backend_url: Yup.string()
    .required('Backend URL is required')
    .url('Must be a valid URL'),

  // Basic Auth validation
  basic_auth: Yup.object().shape({
    enabled: Yup.boolean(),
    username: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema.required('Username is required when Basic Auth is enabled').matches(/^\S+$/, 'Username cannot contain spaces'),
      otherwise: (schema) => schema,
    }),
    password: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema
        .required('Password is required when Basic Auth is enabled')
        .matches(/^\S+$/, 'Password cannot contain spaces'),
      otherwise: (schema) => schema,
    }),
  }),

  // JWT Auth validation
  jwt_auth: Yup.object().shape({
    enabled: Yup.boolean(),
    username: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema
        .required('Username is required when JWT Auth is enabled')
        .matches(/^\S+$/, 'Username cannot contain spaces'),
      otherwise: (schema) => schema,
    }),
    password: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema
        .required('Password is required when JWT Auth is enabled')
        .matches(/^\S+$/, 'Password cannot contain spaces'),
      otherwise: (schema) => schema,
    }),
  }),
});

// Connection status type
type ConnectionStatus = 'unknown' | 'connected' | 'disconnected' | 'checking';

const ConnectionConfig: React.FC = () => {
  const { config, hasUnsavedChanges, setHasUnsavedChanges, loadConfigFromBackend, currentProfileName } = useConfig();
  const { saveRuntimeSettings, connection: runtimeConnection, hooks: runtimeHooks, loadRuntimeSettings } = useRuntime();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [, setNotification] = useState<{ open: boolean, message: ReactNode, severity: 'success' | 'error' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Function to check connection to the backend
  const checkConnection = useCallback(async (connectionConfig: any) => {
    await checkConnectionUtil(connectionConfig, setConnectionStatus, setStatusMessage);
  }, [setConnectionStatus, setStatusMessage]);

  // Memoize the function that returns runtimeConnection to avoid infinite loops
  const getRuntimeConnection = useCallback(() => runtimeConnection, [runtimeConnection]);

  // Reset unsaved changes flag and load runtime settings when the component mounts
  useEffect(() => {
    setHasUnsavedChanges(false);

    // Load runtime settings using a utility function
    (async () => {
      await loadSettingsUtil(
          getCurrentUserId,
          loadRuntimeSettings,
          currentProfileName,
          checkConnection,
          getRuntimeConnection
      );
    })();
  }, [setHasUnsavedChanges, config, checkConnection, loadRuntimeSettings, currentProfileName, getRuntimeConnection]);

  if (!config) {
    return null;
  }

  // Initialize connection configuration
  // Use runtime connection if available, otherwise use config connection
  const connectionSource = runtimeConnection || {};

  const initialValues = {
    backend_url: connectionSource.backend_url || '',
    basic_auth: {
      enabled: connectionSource.basic_auth?.enabled || false,
      username: connectionSource.basic_auth?.username || '',
      password: connectionSource.basic_auth?.password || '',
    },
    jwt_auth: {
      enabled: connectionSource.jwt_auth?.enabled || false,
      username: connectionSource.jwt_auth?.username || '',
      password: connectionSource.jwt_auth?.password || '',
      token: connectionSource.jwt_auth?.token || '',
      refresh_token: connectionSource.jwt_auth?.refresh_token || '',
      expires_at: connectionSource.jwt_auth?.expires_at || 0,
    },
  };

  // Function to fetch JWT token
  const fetchJWTToken = async (backendUrl: string, username: string, password: string): Promise<{ token: string, refresh_token: string, expires_at: number } | null> => {
    try {
      // Use the proxy endpoint to make the request server-side
      // This avoids CORS issues by making the request through Node.js
      const proxyUrl = new URL('/proxy/jwt-token', window.location.origin);
      proxyUrl.searchParams.append('url', backendUrl);

      const response = await fetch(proxyUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        console.error('Error fetching JWT token:', response.statusText);
        setNotification({
          open: true,
          message: `Failed to fetch JWT token: ${response.statusText}`,
          severity: 'error'
        });
        return null;
      }

      const data = await response.json();
      return {
        token: data.token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at
      };
    } catch (error) {
      console.error('Error fetching JWT token:', error);
      setNotification({
        open: true,
        message: `Failed to fetch JWT token: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
      return null;
    }
  };


  const handleSubmit = async (values: any) => {
    try {
      // If JWT Auth is enabled, and we have a username/password but no token, fetch a token
      if (values.jwt_auth?.enabled && 
          values.jwt_auth.username && 
          values.jwt_auth.password && 
          !values.jwt_auth.token) {
        const tokenData = await fetchJWTToken(
          values.backend_url,
          values.jwt_auth.username,
          values.jwt_auth.password
        );

        if (tokenData) {
          // Update the values with the new token data
          values.jwt_auth.token = tokenData.token;
          values.jwt_auth.refresh_token = tokenData.refresh_token;
          values.jwt_auth.expires_at = tokenData.expires_at;
        }
      }

      // Save the full connection data to the runtime collection
      const userId = await getCurrentUserId();
      await saveRuntimeSettings(
        userId,
        currentProfileName,
        {
          backend_url: values.backend_url,
          basic_auth: values.basic_auth,
          jwt_auth: values.jwt_auth,
        },
        runtimeHooks || {}
      );

      // Reset settings state to force a reload on next component mount
      // This is necessary because the connection settings have changed
      resetSettingsState();

      // Check connection after saving
      await checkConnection(values);

      setNotification({
        open: true,
        message: 'Connection settings saved successfully',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error updating connection configuration:', error);
      setNotification({
        open: true,
        message: `Error updating connection configuration: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }
  };




  // Function to reset JWT token
  const resetJwtToken = async () => {
    try {
      // Get the current connection data
      const connectionData = runtimeConnection || {};

      // Create updated connection data with a reset JWT token
      const updatedConnection = {
        ...connectionData,
        jwt_auth: {
          ...connectionData.jwt_auth,
          token: '',
          refresh_token: '',
          expires_at: 0
        }
      };

      // Save the full updated connection data to the runtime collection
      const userId = await getCurrentUserId();
      await saveRuntimeSettings(
        userId,
        currentProfileName,
        updatedConnection,
        runtimeHooks || {}
      );

      // Reset settings state to force a reload on next component mount
      // This is necessary because the connection settings have changed
      resetSettingsState();

      setNotification({
        open: true,
        message: 'JWT token has been reset. A new token will be fetched on the next request.',
        severity: 'success'
      });

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error resetting JWT token:', error);
      setNotification({
        open: true,
        message: `Failed to reset JWT token: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }
  };


  return (
    <>
      <Formik
        initialValues={initialValues}
        validationSchema={ConnectionConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize={true}
      >
        {({ errors, touched, values, handleChange, setFieldValue }) => (
          <Form>
            <FormSection
              title="Connection Configuration"
              description="Configure connection to the Nauthilus backend."
            >
              <Grid container spacing={3}>
                {/* Connection Status */}
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ mr: 2 }}>Connection Status:</Typography>
                    {connectionStatus === 'checking' && <CircularProgress size={20} sx={{ mr: 1 }} />}
                    {connectionStatus === 'connected' && <CheckCircleIcon color="success" sx={{ mr: 1 }} />}
                    {connectionStatus === 'disconnected' && <ErrorIcon color="error" sx={{ mr: 1 }} />}
                    {connectionStatus === 'unknown' && <Typography color="text.secondary">Not checked</Typography>}
                    {(connectionStatus === 'connected' || connectionStatus === 'disconnected') && (
                      <Typography color={connectionStatus === 'connected' ? 'success.main' : 'error.main'}>
                        {statusMessage}
                      </Typography>
                    )}
                    <Tooltip title="Check connection">
                      <span>
                        <IconButton 
                          onClick={() => checkConnection(values)} 
                          disabled={connectionStatus === 'checking' || !values.backend_url}
                          sx={{ ml: 1 }}
                        >
                          <RefreshIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>

                </Grid>


                {/* Backend URL */}
                <Grid item xs={12}>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Backend Configuration</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="backend_url"
                    label="Nauthilus Backend URL"
                    variant="outlined"
                    placeholder="https://nauthilus.example.com"
                    error={getIn(touched, 'backend_url') && Boolean(getIn(errors, 'backend_url'))}
                    helperText={
                      (getIn(touched, 'backend_url') && getIn(errors, 'backend_url')) ||
                      "The URL of your Nauthilus backend server"
                    }
                    onChange={(e: React.ChangeEvent<any>) => {
                      handleChange(e);
                      setHasUnsavedChanges(true);
                    }}
                  />
                </Grid>

                {/* Basic Authentication */}
                <Grid item xs={12}>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Basic Authentication</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.basic_auth?.enabled || false}
                        onChange={(e) => {
                          setFieldValue('basic_auth.enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                          // If enabling Basic Auth, disable JWT Auth
                          if (e.target.checked && values.jwt_auth?.enabled) {
                            setFieldValue('jwt_auth.enabled', false)
                                .then(() => setHasUnsavedChanges(true));
                          }
                        }}
                        name="basic_auth.enabled"
                      />
                    }
                    label="Enable Basic Authentication"
                  />
                </Grid>
                {values.basic_auth?.enabled && (
                  <>
                    <Grid item xs={12}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="basic_auth.username"
                            label="Username"
                            variant="outlined"
                            error={getIn(touched, 'basic_auth.username') && Boolean(getIn(errors, 'basic_auth.username'))}
                            helperText={getIn(touched, 'basic_auth.username') && getIn(errors, 'basic_auth.username')}
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Field
                            as={PasswordField}
                            fullWidth
                            name="basic_auth.password"
                            label="Password"
                            variant="outlined"
                            error={getIn(touched, 'basic_auth.password') && Boolean(getIn(errors, 'basic_auth.password'))}
                            helperText={
                              (getIn(touched, 'basic_auth.password') && getIn(errors, 'basic_auth.password')) ||
                              "Password for Basic Authentication"
                            }
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                      </Grid>
                    </Grid>
                  </>
                )}

                {/* JWT Authentication */}
                <Grid item xs={12}>
                  <Typography variant="subtitle1" sx={{ mt: 4, mb: 1 }}>JWT Authentication</Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.jwt_auth?.enabled || false}
                        onChange={(e) => {
                          setFieldValue('jwt_auth.enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                          // If enabling JWT Auth, disable Basic Auth
                          if (e.target.checked && values.basic_auth?.enabled) {
                            setFieldValue('basic_auth.enabled', false)
                                .then(() => setHasUnsavedChanges(true));
                          }
                        }}
                        name="jwt_auth.enabled"
                      />
                    }
                    label="Enable JWT Authentication"
                  />
                </Grid>
                {values.jwt_auth?.enabled && (
                  <>
                    <Grid item xs={12}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="jwt_auth.username"
                            label="Username"
                            variant="outlined"
                            error={getIn(touched, 'jwt_auth.username') && Boolean(getIn(errors, 'jwt_auth.username'))}
                            helperText={
                              (getIn(touched, 'jwt_auth.username') && getIn(errors, 'jwt_auth.username')) ||
                              "Username for JWT authentication"
                            }
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Field
                            as={PasswordField}
                            fullWidth
                            name="jwt_auth.password"
                            label="Password"
                            variant="outlined"
                            error={getIn(touched, 'jwt_auth.password') && Boolean(getIn(errors, 'jwt_auth.password'))}
                            helperText={
                              (getIn(touched, 'jwt_auth.password') && getIn(errors, 'jwt_auth.password')) ||
                              "Password for JWT authentication"
                            }
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                      </Grid>
                    </Grid>

                    {/* Token Status and Reset-Button */}
                    {values.jwt_auth?.token && (
                      <Grid item xs={12} sx={{ mt: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                          <Box>
                            <Typography variant="subtitle2" color="primary">
                              JWT Token Status
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {values.jwt_auth.expires_at > Date.now() / 1000 
                                ? `Valid until: ${new Date(values.jwt_auth.expires_at * 1000).toLocaleString()}`
                                : 'Token has expired'}
                            </Typography>
                          </Box>
                          <Button
                            variant="outlined"
                            color="secondary"
                            onClick={resetJwtToken}
                            startIcon={<RefreshIcon />}
                          >
                            Reset Token
                          </Button>
                        </Box>
                      </Grid>
                    )}
                  </>
                )}
              </Grid>
            </FormSection>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              {connectionStatus === 'connected' && (
                <Button 
                  variant="contained" 
                  color="secondary" 
                  sx={{ 
                    mr: 2,
                    fontWeight: 'bold',
                    boxShadow: 3,
                    '&:hover': {
                      boxShadow: 5,
                    }
                  }}
                  onClick={() => {
                    setNotification({
                      open: true,
                      message: 'Loading configuration from backend...',
                      severity: 'info'
                    });
                    setStatusMessage('Loading configuration from backend...');

                    // Reset settings state to force a reload after configuration is loaded
                    resetSettingsState();

                    loadConfigFromBackend(values)
                      .then(() => {
                        setNotification({
                          open: true,
                          message: 'Configuration loaded successfully from backend',
                          severity: 'success'
                        });
                        setStatusMessage('Connected to Nauthilus backend (ping successful)');
                      })
                      .catch((error) => {
                        // Display the error in the status message area
                        setStatusMessage(`Failed to load configuration: ${error.message}`);
                        console.error('Configuration loading failed:', error.message);
                      });
                  }}
                  startIcon={<RefreshIcon />}
                >
                  Load Configuration
                </Button>
              )}
              <Button 
                type="submit" 
                variant="contained" 
                color="primary" 
                disabled={!hasUnsavedChanges}
              >
                Save Changes
              </Button>
            </Box>
          </Form>
        )}
      </Formik>


    </>
  );
};

export default ConnectionConfig;
