import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { Formik, Form, Field, getIn } from 'formik';
import * as Yup from 'yup';
import { TextField, FormControlLabel, Button, Box, Typography, Switch, CircularProgress, Tooltip, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, InputAdornment, Stack } from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import FormSection from './common/FormSection';
import PasswordField from './common/PasswordField';
import { checkConnection as checkConnectionUtil, loadSettings as loadSettingsUtil, resetSettingsState, getProxyOrigin, authenticatedFetch } from '../utils/apiUtils';
import Grid from '@mui/material/Grid';

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

  // OIDC client credentials validation
  oidc_auth: Yup.object().shape({
    enabled: Yup.boolean(),
    client_id: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema
        .required('Client ID is required when OIDC Authentication is enabled')
        .matches(/^\S+$/, 'Client ID cannot contain spaces'),
      otherwise: (schema) => schema,
    }),
    client_secret: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema
        .required('Client secret is required when OIDC Authentication is enabled'),
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

  // Confirmation dialog state for loading configuration
  const [loadConfirmOpen, setLoadConfirmOpen] = useState(false);
  const pendingLoadValuesRef = React.useRef<any>(null);

  const performLoadConfiguration = useCallback((values: any) => {
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
  }, [loadConfigFromBackend, setNotification, setStatusMessage]);

  // Function to check connection to the backend
  const checkConnection = useCallback(async (connectionConfig: any) => {
    await checkConnectionUtil(connectionConfig, setConnectionStatus, setStatusMessage);
  }, [setConnectionStatus, setStatusMessage]);

  // Keep a ref with latest runtimeConnection and provide a stable getter
  const connectionRef = React.useRef(runtimeConnection);
  useEffect(() => { connectionRef.current = runtimeConnection; }, [runtimeConnection]);
  const getRuntimeConnection = useCallback(() => connectionRef.current, []);

  // Reset unsaved changes flag and load runtime settings once per profile change
  const didRunRef = React.useRef<string | null>(null);
  useEffect(() => {
    setHasUnsavedChanges(false);

    if (didRunRef.current === currentProfileName) {
      return; // already executed for this profile
    }
    didRunRef.current = currentProfileName;

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
  }, [setHasUnsavedChanges, currentProfileName, loadRuntimeSettings, checkConnection, getRuntimeConnection]);

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
    oidc_auth: {
      enabled: connectionSource.oidc_auth?.enabled || false,
      client_id: connectionSource.oidc_auth?.client_id || '',
      client_secret: connectionSource.oidc_auth?.client_secret || '',
      scope: connectionSource.oidc_auth?.scope || 'nauthilus:authenticate nauthilus:security',
      token: connectionSource.oidc_auth?.token || '',
      expires_at: connectionSource.oidc_auth?.expires_at || 0,
    },
  };

  // Function to fetch OIDC access token using client_credentials
  const fetchOIDCToken = async (
    backendUrl: string,
    clientId: string,
    clientSecret: string,
    scope?: string
  ): Promise<{ token: string, expires_at: number } | null> => {
    try {
      // Use the proxy endpoint to make the request server-side
      // This avoids CORS issues by making the request through the Go backend
      const proxyUrl = new URL('/proxy/oidc-token', getProxyOrigin());
      proxyUrl.searchParams.append('url', backendUrl);

      const body = new URLSearchParams();
      body.append('grant_type', 'client_credentials');
      body.append('client_id', clientId);
      body.append('client_secret', clientSecret);
      if (scope && scope.trim() !== '') {
        body.append('scope', scope.trim());
      }

      const response = await authenticatedFetch(proxyUrl.toString(), {
        method: 'POST',
        body: body.toString(),
      });

      if (!response.ok) {
        console.error('Error fetching OIDC token:', response.statusText);
        setNotification({
          open: true,
          message: `Failed to fetch OIDC token: ${response.statusText}`,
          severity: 'error'
        });
        return null;
      }

      const data = await response.json();
      const expiresIn = Number(data.expires_in) || 0;
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
      return {
        token: data.access_token,
        expires_at: expiresAt
      };
    } catch (error) {
      console.error('Error fetching OIDC token:', error);
      setNotification({
        open: true,
        message: `Failed to fetch OIDC token: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
      return null;
    }
  };


  const handleSubmit = async (values: any) => {
    try {
      // If OIDC auth is enabled, fetch token when missing or expired.
      if (
        values.oidc_auth?.enabled &&
        values.oidc_auth.client_id &&
        values.oidc_auth.client_secret &&
        (!values.oidc_auth.token || (values.oidc_auth.expires_at || 0) <= Math.floor(Date.now() / 1000))
      ) {
        const tokenData = await fetchOIDCToken(
          values.backend_url,
          values.oidc_auth.client_id,
          values.oidc_auth.client_secret,
          values.oidc_auth.scope
        );

        if (tokenData) {
          // Update the values with the new token data
          values.oidc_auth.token = tokenData.token;
          values.oidc_auth.expires_at = tokenData.expires_at;
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
          oidc_auth: values.oidc_auth,
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

      // Mark form as clean since changes have been saved
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error updating connection configuration:', error);
      setNotification({
        open: true,
        message: `Error updating connection configuration: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    }
  };




  // Function to reset OIDC token
  const resetOIDCToken = async () => {
    try {
      // Get the current connection data
      const connectionData = runtimeConnection || {};

      // Create updated connection data with a reset OIDC token
      const updatedConnection = {
        ...connectionData,
        oidc_auth: {
          ...connectionData.oidc_auth,
          token: '',
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
        message: 'OIDC token has been reset. A new token will be fetched on the next save.',
        severity: 'success'
      });

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error resetting OIDC token:', error);
      setNotification({
        open: true,
        message: `Failed to reset OIDC token: ${error instanceof Error ? error.message : String(error)}`,
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
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>Connection</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Configure connection to the Nauthilus backend.
            </Typography>

            {/* Connection status (unified banner) */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle1" sx={{ mr: 2 }}>Connection Status:</Typography>
              {connectionStatus === 'checking' && <CircularProgress size={20} sx={{ mr: 1 }} />}
              {connectionStatus === 'connected' && <CheckCircleIcon color="success" sx={{ mr: 1 }} />}
              {connectionStatus === 'disconnected' && <ErrorIcon color="error" sx={{ mr: 1 }} />}
              {connectionStatus === 'unknown' && <Typography color="text.secondary">Not checked</Typography>}
              {connectionStatus === 'disconnected' && (
                <Typography color="error.main">
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

            <FormSection>
              <Grid container spacing={3}>


                {/* Backend URL */}
                <Grid size={12}>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Backend Configuration</Typography>
                </Grid>
                <Grid size={12}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="backend_url"
                    label="Nauthilus Backend URL"
                    InputProps={{ endAdornment: (
                      <InputAdornment position="end"><InfoTooltip title="Base URL of your Nauthilus backend API (e.g., https://nauthilus.example.com)." /></InputAdornment>
                    ) }}
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
                <Grid size={12}>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Basic Authentication</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.basic_auth?.enabled || false}
                        onChange={(e) => {
                          setFieldValue('basic_auth.enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                          // If enabling Basic Auth, disable OIDC auth
                          if (e.target.checked && values.oidc_auth?.enabled) {
                            setFieldValue('oidc_auth.enabled', false)
                                .then(() => setHasUnsavedChanges(true));
                          }
                        }}
                        name="basic_auth.enabled"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable Basic Authentication<InfoTooltip title="Enable HTTP Basic Auth for connecting to the backend. Do not use together with OIDC credentials here." /></Box>}
                  />
                </Grid>
                {values.basic_auth?.enabled && (
                  <>
                    <Grid size={12}>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="basic_auth.username"
                            label="Username"
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Username for Basic Auth. No spaces." /></InputAdornment>
                            ) }}
                            variant="outlined"
                            error={getIn(touched, 'basic_auth.username') && Boolean(getIn(errors, 'basic_auth.username'))}
                            helperText={getIn(touched, 'basic_auth.username') && getIn(errors, 'basic_auth.username')}
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Field
                            as={PasswordField}
                            fullWidth
                            name="basic_auth.password"
                            label="Password"
                            infoTitle="Password for Basic Auth. Avoid spaces; keep it secret."
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

                {/* OIDC Client Credentials Authentication */}
                <Grid size={12}>
                  <Typography variant="subtitle1" sx={{ mt: 4, mb: 1 }}>OIDC Authentication (Client Credentials)</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.oidc_auth?.enabled || false}
                        onChange={(e) => {
                          setFieldValue('oidc_auth.enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                          // If enabling OIDC auth, disable Basic Auth
                          if (e.target.checked && values.basic_auth?.enabled) {
                            setFieldValue('basic_auth.enabled', false)
                                .then(() => setHasUnsavedChanges(true));
                          }
                        }}
                        name="oidc_auth.enabled"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable OIDC Authentication<InfoTooltip title="Use OIDC client credentials to obtain a Bearer token from /oidc/token. Do not use together with Basic Auth here." /></Box>}
                  />
                </Grid>
                {values.oidc_auth?.enabled && (
                  <>
                    <Grid size={12}>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="oidc_auth.client_id"
                            label="Client ID"
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="OIDC client_id used for client_credentials token requests." /></InputAdornment>
                            ) }}
                            variant="outlined"
                            error={getIn(touched, 'oidc_auth.client_id') && Boolean(getIn(errors, 'oidc_auth.client_id'))}
                            helperText={
                              (getIn(touched, 'oidc_auth.client_id') && getIn(errors, 'oidc_auth.client_id')) ||
                              "OIDC client ID"
                            }
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Field
                            as={PasswordField}
                            fullWidth
                            name="oidc_auth.client_secret"
                            label="Client Secret"
                            infoTitle="OIDC client_secret used for token retrieval. Keep it secure."
                            variant="outlined"
                            error={getIn(touched, 'oidc_auth.client_secret') && Boolean(getIn(errors, 'oidc_auth.client_secret'))}
                            helperText={
                              (getIn(touched, 'oidc_auth.client_secret') && getIn(errors, 'oidc_auth.client_secret')) ||
                              "OIDC client secret"
                            }
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="oidc_auth.scope"
                            label="Scope"
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Space-separated OIDC scopes, e.g. nauthilus:authenticate nauthilus:security. Add nauthilus:admin when administrative endpoints are needed." /></InputAdornment>
                            ) }}
                            variant="outlined"
                            helperText="Space-separated scopes for the token request"
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                      </Grid>
                    </Grid>

                    {/* Token Status and Reset-Button */}
                    {values.oidc_auth?.token && (
                      <Grid sx={{ mt: 2 }} size={12}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                          <Box>
                            <Typography variant="subtitle2" color="primary">
                              OIDC Access Token Status
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {values.oidc_auth.expires_at > Date.now() / 1000
                                ? `Valid until: ${new Date(values.oidc_auth.expires_at * 1000).toLocaleString()}`
                                : 'Token has expired'}
                            </Typography>
                          </Box>
                          <Button
                            variant="outlined"
                            color="secondary"
                            onClick={resetOIDCToken}
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
                    // Open confirmation dialog before loading configuration
                    pendingLoadValuesRef.current = values;
                    setLoadConfirmOpen(true);
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

      {/* Load Configuration Confirmation Dialog */}
      <Dialog
        open={loadConfirmOpen}
        onClose={() => setLoadConfirmOpen(false)}
      >
        <DialogTitle>Load Configuration</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This action will completely replace your current configuration with the configuration from the backend. Do you want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoadConfirmOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const vals = pendingLoadValuesRef.current;
              setLoadConfirmOpen(false);
              if (vals) {
                performLoadConfiguration(vals);
              }
            }}
            color="primary"
            autoFocus
          >
            Load Configuration
          </Button>
        </DialogActions>
      </Dialog>

    </>
  );
};

export default ConnectionConfig;
