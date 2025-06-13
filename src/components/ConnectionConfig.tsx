import React, { useState, useEffect } from 'react';
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
  Alert,
  Tooltip,
  IconButton,
  Snackbar
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import PasswordField from './common/PasswordField';

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
  const { config, updateConfigSection, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [notification, setNotification] = useState<{ open: boolean, message: string, severity: 'success' | 'error' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Reset unsaved changes flag when component mounts
  useEffect(() => {
    setHasUnsavedChanges(false);

    // Check connection status when component mounts
    if (config?.connection?.backend_url) {
      checkConnection(config.connection);
    }
  }, [setHasUnsavedChanges, config]);

  if (!config) {
    return null;
  }

  // Initialize connection configuration
  const initialValues = {
    backend_url: config.connection?.backend_url || '',
    basic_auth: {
      enabled: config.connection?.basic_auth?.enabled || false,
      username: config.connection?.basic_auth?.username || '',
      password: config.connection?.basic_auth?.password || '',
    },
    jwt_auth: {
      enabled: config.connection?.jwt_auth?.enabled || false,
      username: config.connection?.jwt_auth?.username || '',
      password: config.connection?.jwt_auth?.password || '',
      token: config.connection?.jwt_auth?.token || '',
      refresh_token: config.connection?.jwt_auth?.refresh_token || '',
      expires_at: config.connection?.jwt_auth?.expires_at || 0,
    },
  };

  // Function to fetch JWT token
  const fetchJWTToken = async (backendUrl: string, username: string, password: string): Promise<{ token: string, refresh_token: string, expires_at: number } | null> => {
    try {
      const response = await fetch(`${backendUrl}/api/v1/jwt/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.statusText}`);
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

  // Function to check connection to the backend
  const checkConnection = async (connectionConfig: any) => {
    if (!connectionConfig.backend_url) {
      setConnectionStatus('unknown');
      setStatusMessage('No backend URL configured');
      return;
    }

    setConnectionStatus('checking');
    setStatusMessage('Checking connection...');

    try {
      // Prepare headers for authentication
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // Add Basic Auth if enabled
      if (connectionConfig.basic_auth?.enabled && 
          connectionConfig.basic_auth.username && 
          connectionConfig.basic_auth.password) {
        const base64Credentials = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
        headers['Authorization'] = `Basic ${base64Credentials}`;
      }

      // For JWT Auth, try to fetch a token if username/password are provided but no token exists
      if (connectionConfig.jwt_auth?.enabled) {
        if (connectionConfig.jwt_auth.username && 
            connectionConfig.jwt_auth.password && 
            !connectionConfig.jwt_auth.token) {
          const tokenData = await fetchJWTToken(
            connectionConfig.backend_url,
            connectionConfig.jwt_auth.username,
            connectionConfig.jwt_auth.password
          );

          if (tokenData) {
            // Update the connection config with the new token
            await updateConfigSection('connection', {
              ...connectionConfig,
              jwt_auth: {
                ...connectionConfig.jwt_auth,
                token: tokenData.token,
                refresh_token: tokenData.refresh_token,
                expires_at: tokenData.expires_at
              }
            });

            // Use the new token for the current request
            headers['Authorization'] = `Bearer ${tokenData.token}`;

            setNotification({
              open: true,
              message: 'JWT token fetched successfully',
              severity: 'success'
            });
          }
        } else if (connectionConfig.jwt_auth.token) {
          // Use existing token if available
          headers['Authorization'] = `Bearer ${connectionConfig.jwt_auth.token}`;
        }
      }

      // Make request to health check endpoint
      const response = await fetch(`${connectionConfig.backend_url}/health`, {
        method: 'GET',
        headers,
      });

      if (response.ok) {
        setConnectionStatus('connected');
        setStatusMessage('Connected to Nauthilus backend');
      } else {
        setConnectionStatus('disconnected');
        setStatusMessage(`Failed to connect: ${response.statusText}`);
      }
    } catch (error) {
      setConnectionStatus('disconnected');
      setStatusMessage(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      // If JWT Auth is enabled and we have username/password but no token, fetch a token
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

      // Update the connection configuration
      await updateConfigSection('connection', {
        backend_url: values.backend_url,
        basic_auth: values.basic_auth,
        jwt_auth: values.jwt_auth,
      });

      // Check connection after saving
      checkConnection(values);
    } catch (error) {
      console.error('Error updating connection configuration:', error);
      setNotification({
        open: true,
        message: `Error updating connection configuration: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }
  };

  // Function to close the notification
  const handleCloseNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
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
                      <IconButton 
                        onClick={() => checkConnection(values)} 
                        disabled={connectionStatus === 'checking' || !values.backend_url}
                        sx={{ ml: 1 }}
                      >
                        <RefreshIcon />
                      </IconButton>
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
                          setFieldValue('basic_auth.enabled', e.target.checked);
                          // If enabling Basic Auth, disable JWT Auth
                          if (e.target.checked && values.jwt_auth?.enabled) {
                            setFieldValue('jwt_auth.enabled', false);
                          }
                          setHasUnsavedChanges(true);
                        }}
                        name="basic_auth.enabled"
                      />
                    }
                    label="Enable Basic Authentication"
                  />
                </Grid>
                {values.basic_auth?.enabled && (
                  <>
                    <Grid item xs={12} md={6}>
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
                    <Grid item xs={12} md={6}>
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
                          setFieldValue('jwt_auth.enabled', e.target.checked);
                          // If enabling JWT Auth, disable Basic Auth
                          if (e.target.checked && values.basic_auth?.enabled) {
                            setFieldValue('basic_auth.enabled', false);
                          }
                          setHasUnsavedChanges(true);
                        }}
                        name="jwt_auth.enabled"
                      />
                    }
                    label="Enable JWT Authentication"
                  />
                </Grid>
                {values.jwt_auth?.enabled && (
                  <>
                    <Grid item xs={12} md={6}>
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
                    <Grid item xs={12} md={6}>
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
                  </>
                )}
              </Grid>
            </FormSection>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                variant="outlined" 
                color="primary" 
                sx={{ mr: 2 }}
                onClick={() => checkConnection(values)}
                disabled={!values.backend_url}
              >
                Test Connection
              </Button>
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

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        message={notification.message}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ConnectionConfig;
