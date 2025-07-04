import React, { useState, useEffect, useCallback } from 'react';
import { Formik, Form, getIn } from 'formik';
import * as Yup from 'yup';
import {
  TextField,
  Grid,
  Button,
  Box,
  Typography,
  Paper,
  FormControlLabel,
  Switch,
  Snackbar,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  InputAdornment,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import { LuaHookConfig, LuaHooksConfig} from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import ValidationErrors from './common/ValidationErrors';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import { extractErrorMessage, prepareAuthParams, checkConnection as checkConnectionUtil, loadSettings as loadSettingsUtil, resetSettingsState } from '../utils/apiUtils';

// Helper functions for path handling
const extractPathParts = (fullPath: string): { apiVersion: string, customPath: string } => {
  // Default values
  let apiVersion = 'v1';
  let customPath: string;

  // Extract the API version and custom path from the full path
  const match = fullPath.match(/^\/api\/(v\d+)\/custom\/(.+)$/); // eslint-disable-line no-useless-escape
  if (match) {
    apiVersion = match[1];
    customPath = match[2];
  } else {
    // If the path doesn't match the expected format, return the full path as customPath
    customPath = fullPath.replace(/^\/api\/v\d+\/custom\//, '');
  }

  return { apiVersion, customPath };
};

const combinePathParts = (apiVersion: string, customPath: string): string => {
  return `/api/${apiVersion}/custom/${customPath}`;
};

// Custom validation function for endpoint paths
const validateEndpointPath = (value: string, enabled: boolean): true | string => {
  if (!enabled) return true; // Skip validation if hook is disabled

  if (!value) return 'Endpoint path is required when hook is enabled';

  // Extract the custom path part
  const { customPath } = extractPathParts(value);

  // Check if the custom path is not empty
  if (!customPath) return 'Custom part of the endpoint path is required';

  // Check if the custom path contains invalid characters
  if (/[^a-zA-Z0-9\-_/]/.test(customPath)) {
    return 'Custom path can only contain letters, numbers, hyphens, underscores, and slashes';
  }

  return true;
};

// Validation schema
const HooksConfigSchema = Yup.object().shape({
  hooks: Yup.object().shape({
    distributed_brute_force_admin: Yup.object().shape({
      enabled: Yup.boolean(),
      endpoint_path: Yup.string().test(
        'valid-endpoint-path',
        'Invalid endpoint path',
        function(value) {
          const result = validateEndpointPath(value || '', this.parent.enabled);
          if (result === true) return true;
          return this.createError({ message: result });
        }
      ),
    }),
    distributed_brute_force_test: Yup.object().shape({
      enabled: Yup.boolean(),
      endpoint_path: Yup.string().test(
        'valid-endpoint-path',
        'Invalid endpoint path',
        function(value) {
          const result = validateEndpointPath(value || '', this.parent.enabled);
          if (result === true) return true;
          return this.createError({ message: result });
        }
      ),
    }),
    learning_mode: Yup.object().shape({
      enabled: Yup.boolean(),
      endpoint_path: Yup.string().test(
        'valid-endpoint-path',
        'Invalid endpoint path',
        function(value) {
          const result = validateEndpointPath(value || '', this.parent.enabled);
          if (result === true) return true;
          return this.createError({ message: result });
        }
      ),
    }),
    neural_feedback: Yup.object().shape({
      enabled: Yup.boolean(),
      endpoint_path: Yup.string().test(
        'valid-endpoint-path',
        'Invalid endpoint path',
        function(value) {
          const result = validateEndpointPath(value || '', this.parent.enabled);
          if (result === true) return true;
          return this.createError({ message: result });
        }
      ),
    }),
    train_neural_network: Yup.object().shape({
      enabled: Yup.boolean(),
      endpoint_path: Yup.string().test(
        'valid-endpoint-path',
        'Invalid endpoint path',
        function(value) {
          const result = validateEndpointPath(value || '', this.parent.enabled);
          if (result === true) return true;
          return this.createError({ message: result });
        }
      ),
    }),
  }),
});

// Hook descriptions
const hookDescriptions: Record<string, string> = {
  distributed_brute_force_admin: "Manage distributed brute force protection settings and view statistics.",
  distributed_brute_force_test: "Test the distributed brute force protection system.",
  learning_mode: "Configure and manage the learning mode for authentication.",
  neural_feedback: "Provide feedback to the neural network for improving authentication decisions.",
  train_neural_network: "Train the neural network with new data to improve its accuracy.",
};

// Hook display names
const hookDisplayNames: Record<string, string> = {
  distributed_brute_force_admin: "Distributed Brute Force Admin",
  distributed_brute_force_test: "Distributed Brute Force Test",
  learning_mode: "Learning Mode",
  neural_feedback: "Neural Feedback",
  train_neural_network: "Train Neural Network",
};

// Interface for hook-specific data
interface HookData {
  [key: string]: any;
}

// Interface for hook operation result
interface HookOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

const HooksConfig: React.FC = () => {
  const { config, setHasUnsavedChanges, error, loadConfigFromBackend, currentProfileName } = useConfig();
  const { saveRuntimeSettings, hooks: runtimeHooks, connection: runtimeConnection, loadRuntimeSettings } = useRuntime();
  const [isFormChanged, setIsFormChanged] = useState(false);
  const [testingHook, setTestingHook] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected' | 'checking'>('unknown');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_statusMessage, setStatusMessage] = useState<string>('');

  // State for API version selection
  const [apiVersion, setApiVersion] = useState<string>('v1');
  const availableApiVersions = ['v1'];

  // State for hook-specific data
  const [hookData, setHookData] = useState<Record<string, HookData>>({
    distributed_brute_force_admin: {},
    distributed_brute_force_test: {},
    learning_mode: {},
    neural_feedback: {},
    train_neural_network: {},
  });

  // State for active hook operations
  const [activeHook, setActiveHook] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // State for dialogs
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    title: string;
    content: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // These functions are now defined outside the component

  // Extract API version from the first hook with a valid path
  useEffect(() => {
    const hooks = config?.lua?.hooks;
    if (hooks) {
      for (const hookName in hooks) {
        const hook = hooks[hookName as keyof LuaHooksConfig];
        if (hook && hook.endpoint_path) {
          const { apiVersion } = extractPathParts(hook.endpoint_path);
          setApiVersion(apiVersion);
          break;
        }
      }
    }
  }, [config]);

  // Initial values - use runtime hooks if available, otherwise use config hooks
  const hooksSource = runtimeHooks || config?.lua?.hooks || {};

  const initialValues = {
    hooks: {
      distributed_brute_force_admin: hooksSource.distributed_brute_force_admin || { enabled: false, endpoint_path: '/api/v1/custom/nauthilus/neural/distributed-brute-force-admin' },
      distributed_brute_force_test: hooksSource.distributed_brute_force_test || { enabled: false, endpoint_path: '/api/v1/custom/nauthilus/neural/distributed-brute-force-test' },
      learning_mode: hooksSource.learning_mode || { enabled: false, endpoint_path: '/api/v1/custom/nauthilus/neural/learning-mode' },
      neural_feedback: hooksSource.neural_feedback || { enabled: false, endpoint_path: '/api/v1/custom/nauthilus/neural/neural-feedback' },
      train_neural_network: hooksSource.train_neural_network || { enabled: false, endpoint_path: '/api/v1/custom/nauthilus/neural/train-neural-network' },
    },
  };

  // Function to check connection to the backend
  const checkConnection = useCallback(async (connectionConfig: any) => {
    await checkConnectionUtil(connectionConfig, setConnectionStatus, setStatusMessage);
  }, [setConnectionStatus, setStatusMessage]);

  // Memoize the function that returns runtimeConnection to avoid infinite loops
  const getRuntimeConnection = useCallback(() => runtimeConnection, [runtimeConnection]);

  // Check connection status and load runtime settings when the component mounts
  useEffect(() => {
    (async () => {
      await loadSettingsUtil(
        getCurrentUserId,
        loadRuntimeSettings,
        currentProfileName,
        checkConnection,
        getRuntimeConnection
      );
    })();
  }, [config, checkConnection, loadRuntimeSettings, currentProfileName, getRuntimeConnection]);

  // Function to test a hook
  const testHook = async (hookName: string, hookConfig: LuaHookConfig) => {
    if (!hookConfig.enabled) {
      setTestResult({
        success: false,
        message: "Hook is not enabled. Please enable it first."
      });
      setSnackbarOpen(true);
      return;
    }

    // Use runtime connection if available, otherwise use config connection
    const connectionConfig = runtimeConnection;

    if (!connectionConfig?.backend_url) {
      setTestResult({
        success: false,
        message: "Backend URL is not configured. Please configure it in the Connection settings."
      });
      setSnackbarOpen(true);
      return;
    }

    setTestingHook(hookName);

    try {
      // Construct the proxy URL based on the hook name
      const proxyEndpoint = `/proxy/hooks/${hookName.replace(/_/g, '-')}`;

      // Add query parameters for the backend URL and endpoint path
      const url = new URL(proxyEndpoint, window.location.origin);
      url.searchParams.append('url', connectionConfig.backend_url);
      url.searchParams.append('endpoint_path', hookConfig.endpoint_path);

      // Add authentication parameters if available
      const { authType, authValue } = prepareAuthParams(connectionConfig);
      if (authType && authValue) {
        url.searchParams.append('authType', authType);
        url.searchParams.append('authValue', authValue);
      }

      // Send the request
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();

        // Update hook-specific data if available
        if (data && data.result) {
          setHookData(prevData => ({
            ...prevData,
            [hookName]: data.result
          }));
        }

        setTestResult({
          success: true,
          message: `Successfully tested ${hookDisplayNames[hookName] || hookName}`
        });
      } else {
        const errorMessage = await extractErrorMessage(response);
        setTestResult({
          success: false,
          message: `Failed to test hook: ${errorMessage}`
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Error testing hook: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setTestingHook(null);
      setSnackbarOpen(true);
    }
  };

  // Function to execute a hook operation
  const executeHookOperation = async (
    hookName: string, 
    hookConfig: LuaHookConfig, 
    operation: string, 
    params: any = {}
  ): Promise<HookOperationResult> => {
    console.log(`Executing hook operation: ${hookName}, operation: ${operation}, params:`, params);

    if (!hookConfig.enabled) {
      return {
        success: false,
        message: "Hook is not enabled. Please enable it first."
      };
    }

    // Use runtime connection if available, otherwise use config connection
    const connectionConfig = runtimeConnection;

    if (!connectionConfig?.backend_url) {
      return {
        success: false,
        message: "Backend URL is not configured. Please configure it in the Connection settings."
      };
    }

    setActiveHook(hookName);
    setIsProcessing(true);

    try {
      // Construct the proxy URL based on the hook name
      const proxyEndpoint = `/proxy/hooks/${hookName.replace(/_/g, '-')}`;
      console.log(`Proxy endpoint: ${proxyEndpoint}`);

      // Add query parameters for the backend URL and endpoint path
      const url = new URL(proxyEndpoint, window.location.origin);
      url.searchParams.append('url', connectionConfig.backend_url);
      url.searchParams.append('endpoint_path', hookConfig.endpoint_path);

      // Add operation to the endpoint path if provided
      if (operation) {
        url.searchParams.append('operation', operation);
        console.log(`Added operation parameter: ${operation}`);
      }

      // Add authentication parameters if available
      const { authType, authValue } = prepareAuthParams(connectionConfig);
      if (authType && authValue) {
        url.searchParams.append('authType', authType);
        url.searchParams.append('authValue', authValue);
      }

      console.log(`Final URL: ${url.toString()}`);

      // Send the request
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`Response data:`, data);

        // Update hook-specific data if available
        if (data && data.result) {
          console.log(`Setting hook data for ${hookName}:`, data.result);
          setHookData(prevData => {
            const newData = {
              ...prevData,
              [hookName]: data.result
            };
            console.log(`New hook data:`, newData);
            return newData;
          });
        } else {
          console.log(`No result data found in response for ${hookName}`);
        }

        return {
          success: true,
          message: `Operation completed successfully`,
          data: data.result
        };
      } else {
        const errorMessage = await extractErrorMessage(response);
        return {
          success: false,
          message: `Operation failed: ${errorMessage}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error executing operation: ${error instanceof Error ? error.message : String(error)}`
      };
    } finally {
      setActiveHook(null);
      setIsProcessing(false);
    }
  };

  // Function to show a confirmation dialog
  const showConfirmationDialog = (
    title: string, 
    content: React.ReactNode, 
    confirmLabel: string, 
    onConfirm: () => void
  ) => {
    setDialogConfig({
      title,
      content,
      confirmLabel,
      onConfirm
    });
    setOpenDialog(true);
  };

  const handleSubmit = async (values: { hooks: LuaHooksConfig }) => {
    if (!config) return;

    try {
      // Save hooks data to theruntime collection
      const userId = await getCurrentUserId();
      await saveRuntimeSettings(
        userId,
        currentProfileName,
        runtimeConnection || {},
        values.hooks
      );

      // Reset settings state to force a reload on the next component mount
      // This is necessary because the "hooks" settings have changed
      resetSettingsState();

      // Reset unsaved changes flag after saving
      setHasUnsavedChanges(false);
      setIsFormChanged(false);

      setTestResult({
        success: true,
        message: 'Hooks settings saved successfully'
      });
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Failed to save hooks settings:', error);
      setTestResult({
        success: false,
        message: `Failed to save hooks settings: ${error instanceof Error ? error.message : String(error)}`
      });
      setSnackbarOpen(true);
    }
  };

  // Function to check if form values have changed from initial values
  const checkFormChanged = (currentValues: any, initialVals: any): boolean => {
    return JSON.stringify(currentValues) !== JSON.stringify(initialVals);
  };

  // Function to render hook-specific UI based on hook name
  const renderHookUI = (hookName: string, hookConfig: LuaHookConfig) => {
    if (!hookConfig.enabled) {
      return (
        <Typography variant="body2" color="text.secondary">
          This hook is disabled. Enable it to access its functionality.
        </Typography>
      );
    }

    if (connectionStatus !== 'connected') {
      return (
        <Typography variant="body2" color="text.secondary">
          Connection to backend is required to use this hook.
        </Typography>
      );
    }

    switch (hookName) {
      case 'distributed_brute_force_admin':
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Distributed Brute Force Administration
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  color="primary"
                  fullWidth
                  startIcon={<RefreshIcon />}
                  onClick={async () => {
                    console.log("Getting statistics for distributed brute force admin");
                    const result = await executeHookOperation(
                      hookName,
                      hookConfig,
                      'stats',
                      {}
                    );
                    console.log("Result from executeHookOperation:", result);
                    setTestResult(result);
                    setSnackbarOpen(true);
                  }}
                  disabled={isProcessing || activeHook === hookName}
                >
                  {isProcessing && activeHook === hookName ? (
                    <CircularProgress size={24} />
                  ) : (
                    'Get Statistics'
                  )}
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  color="secondary"
                  fullWidth
                  startIcon={<DeleteIcon />}
                  onClick={() => {
                    showConfirmationDialog(
                      'Clear Brute Force Data',
                      <Typography>
                        Are you sure you want to clear all distributed brute force data? This action cannot be undone.
                      </Typography>,
                      'Clear Data',
                      async () => {
                        const result = await executeHookOperation(
                          hookName,
                          hookConfig,
                          'clear',
                          {}
                        );
                        setTestResult(result);
                        setSnackbarOpen(true);
                        setOpenDialog(false);
                      }
                    );
                  }}
                  disabled={isProcessing || activeHook === hookName}
                >
                  Clear Data
                </Button>
              </Grid>
            </Grid>

            {/* Display statistics if available */}
            {hookData[hookName] && (
              <Paper sx={{ mt: 2, p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Brute Force Statistics
                </Typography>
                {hookData[hookName].stats ? (
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="subtitle2">Total Blocked IPs</Typography>
                      <Typography variant="body1">{hookData[hookName].stats.total_blocked_ips || 0}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="subtitle2">Total Blocked Accounts</Typography>
                      <Typography variant="body1">{hookData[hookName].stats.total_blocked_accounts || 0}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                      <Typography variant="subtitle2">Last Update</Typography>
                      <Typography variant="body1">
                        {hookData[hookName].stats.last_update 
                          ? new Date(hookData[hookName].stats.last_update).toLocaleString() 
                          : 'N/A'}
                      </Typography>
                    </Grid>
                  </Grid>
                ) : (
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Typography variant="body1">
                        {Object.keys(hookData[hookName]).length === 0 ? (
                          <Typography color="text.secondary">No statistics available. Click "Get Statistics" to retrieve the latest data.</Typography>
                        ) : (
                          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {JSON.stringify(hookData[hookName], null, 2)}
                          </pre>
                        )}
                      </Typography>
                    </Grid>
                  </Grid>
                )}
              </Paper>
            )}
          </Box>
        );

      case 'distributed_brute_force_test':
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Test Distributed Brute Force Protection
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="IP Address"
                  value={hookData[hookName]?.ip_address || ''}
                  onChange={(e) => {
                    setHookData(prevData => ({
                      ...prevData,
                      [hookName]: {
                        ...prevData[hookName],
                        ip_address: e.target.value
                      }
                    }));
                  }}
                  placeholder="Enter an IP address to test"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={async () => {
                    if (!hookData[hookName]?.ip_address) {
                      setTestResult({
                        success: false,
                        message: "Please enter an IP address to test"
                      });
                      setSnackbarOpen(true);
                      return;
                    }

                    const result = await executeHookOperation(
                      hookName,
                      hookConfig,
                      'test',
                      { ip_address: hookData[hookName].ip_address }
                    );
                    setTestResult(result);
                    setSnackbarOpen(true);
                  }}
                  disabled={isProcessing || activeHook === hookName || !hookData[hookName]?.ip_address}
                  startIcon={isProcessing && activeHook === hookName ? <CircularProgress size={20} /> : null}
                >
                  Test IP
                </Button>
              </Grid>
            </Grid>

            {/* Display test results if available */}
            {hookData[hookName] && hookData[hookName].result && (
              <Paper sx={{ mt: 2, p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Test Results
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2">IP Status</Typography>
                    <Typography 
                      variant="body1" 
                      color={hookData[hookName].result.is_blocked ? 'error.main' : 'success.main'}
                    >
                      {hookData[hookName].result.is_blocked ? 'Blocked' : 'Not Blocked'}
                    </Typography>
                  </Grid>
                  {hookData[hookName].result.details && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2">Details</Typography>
                      <Typography variant="body1">{hookData[hookName].result.details}</Typography>
                    </Grid>
                  )}
                </Grid>
              </Paper>
            )}
          </Box>
        );

      case 'learning_mode':
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Learning Mode Configuration
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  color="primary"
                  fullWidth
                  startIcon={<RefreshIcon />}
                  onClick={async () => {
                    const result = await executeHookOperation(
                      hookName,
                      hookConfig,
                      'status',
                      {}
                    );
                    setTestResult(result);
                    setSnackbarOpen(true);
                  }}
                  disabled={isProcessing || activeHook === hookName}
                >
                  {isProcessing && activeHook === hookName ? (
                    <CircularProgress size={24} />
                  ) : (
                    'Get Status'
                  )}
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={() => {
                    showConfirmationDialog(
                      'Enable Learning Mode',
                      <Typography>
                        Are you sure you want to enable learning mode? This will put the system in a state where it learns from authentication attempts.
                      </Typography>,
                      'Enable',
                      async () => {
                        const result = await executeHookOperation(
                          hookName,
                          hookConfig,
                          'enable',
                          {}
                        );
                        setTestResult(result);
                        setSnackbarOpen(true);
                        setOpenDialog(false);
                      }
                    );
                  }}
                  disabled={isProcessing || activeHook === hookName || (hookData[hookName]?.status?.enabled === true)}
                >
                  Enable Learning Mode
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  color="secondary"
                  fullWidth
                  onClick={() => {
                    showConfirmationDialog(
                      'Disable Learning Mode',
                      <Typography>
                        Are you sure you want to disable learning mode? This will stop the system from learning from authentication attempts.
                      </Typography>,
                      'Disable',
                      async () => {
                        const result = await executeHookOperation(
                          hookName,
                          hookConfig,
                          'disable',
                          {}
                        );
                        setTestResult(result);
                        setSnackbarOpen(true);
                        setOpenDialog(false);
                      }
                    );
                  }}
                  disabled={isProcessing || activeHook === hookName || (hookData[hookName]?.status?.enabled === false)}
                >
                  Disable Learning Mode
                </Button>
              </Grid>
            </Grid>

            {/* Display learning mode status if available */}
            {hookData[hookName] && hookData[hookName].status && (
              <Paper sx={{ mt: 2, p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Learning Mode Status
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="subtitle2">Status</Typography>
                    <Typography 
                      variant="body1" 
                      color={hookData[hookName].status.enabled ? 'success.main' : 'text.secondary'}
                    >
                      {hookData[hookName].status.enabled ? 'Enabled' : 'Disabled'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="subtitle2">Records Collected</Typography>
                    <Typography variant="body1">{hookData[hookName].status.records_collected || 0}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="subtitle2">Last Update</Typography>
                    <Typography variant="body1">
                      {hookData[hookName].status.last_update 
                        ? new Date(hookData[hookName].status.last_update).toLocaleString() 
                        : 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            )}
          </Box>
        );

      case 'neural_feedback':
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Neural Network Feedback
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="IP Address"
                  value={hookData[hookName]?.ip_address || ''}
                  onChange={(e) => {
                    setHookData(prevData => ({
                      ...prevData,
                      [hookName]: {
                        ...prevData[hookName],
                        ip_address: e.target.value
                      }
                    }));
                  }}
                  placeholder="Enter an IP address"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Username"
                  value={hookData[hookName]?.username || ''}
                  onChange={(e) => {
                    setHookData(prevData => ({
                      ...prevData,
                      [hookName]: {
                        ...prevData[hookName],
                        username: e.target.value
                      }
                    }));
                  }}
                  placeholder="Enter a username"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={async () => {
                    if (!hookData[hookName]?.ip_address || !hookData[hookName]?.username) {
                      setTestResult({
                        success: false,
                        message: "Please enter both IP address and username"
                      });
                      setSnackbarOpen(true);
                      return;
                    }

                    const result = await executeHookOperation(
                      hookName,
                      hookConfig,
                      'positive',
                      { 
                        ip_address: hookData[hookName].ip_address,
                        username: hookData[hookName].username
                      }
                    );
                    setTestResult(result);
                    setSnackbarOpen(true);
                  }}
                  disabled={isProcessing || activeHook === hookName || !hookData[hookName]?.ip_address || !hookData[hookName]?.username}
                  startIcon={isProcessing && activeHook === hookName ? <CircularProgress size={20} /> : null}
                >
                  Submit Positive Feedback
                </Button>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Button
                  variant="outlined"
                  color="secondary"
                  fullWidth
                  onClick={async () => {
                    if (!hookData[hookName]?.ip_address || !hookData[hookName]?.username) {
                      setTestResult({
                        success: false,
                        message: "Please enter both IP address and username"
                      });
                      setSnackbarOpen(true);
                      return;
                    }

                    const result = await executeHookOperation(
                      hookName,
                      hookConfig,
                      'negative',
                      { 
                        ip_address: hookData[hookName].ip_address,
                        username: hookData[hookName].username
                      }
                    );
                    setTestResult(result);
                    setSnackbarOpen(true);
                  }}
                  disabled={isProcessing || activeHook === hookName || !hookData[hookName]?.ip_address || !hookData[hookName]?.username}
                  startIcon={isProcessing && activeHook === hookName ? <CircularProgress size={20} /> : null}
                >
                  Submit Negative Feedback
                </Button>
              </Grid>
            </Grid>
          </Box>
        );

      case 'train_neural_network':
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Train Neural Network
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="outlined"
                  color="primary"
                  fullWidth
                  startIcon={<RefreshIcon />}
                  onClick={async () => {
                    const result = await executeHookOperation(
                      hookName,
                      hookConfig,
                      'status',
                      {}
                    );
                    setTestResult(result);
                    setSnackbarOpen(true);
                  }}
                  disabled={isProcessing || activeHook === hookName}
                >
                  {isProcessing && activeHook === hookName ? (
                    <CircularProgress size={24} />
                  ) : (
                    'Get Training Status'
                  )}
                </Button>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={() => {
                    showConfirmationDialog(
                      'Start Training',
                      <Typography>
                        Are you sure you want to start training the neural network? This process may take some time.
                      </Typography>,
                      'Start Training',
                      async () => {
                        const result = await executeHookOperation(
                          hookName,
                          hookConfig,
                          'train',
                          {}
                        );
                        setTestResult(result);
                        setSnackbarOpen(true);
                        setOpenDialog(false);
                      }
                    );
                  }}
                  disabled={isProcessing || activeHook === hookName || (hookData[hookName]?.status?.training === true)}
                >
                  Start Training
                </Button>
              </Grid>
            </Grid>

            {/* Display training status if available */}
            {hookData[hookName] && hookData[hookName].status && (
              <Paper sx={{ mt: 2, p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Training Status
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="subtitle2">Status</Typography>
                    <Typography 
                      variant="body1" 
                      color={hookData[hookName].status.training ? 'info.main' : 'text.secondary'}
                    >
                      {hookData[hookName].status.training ? 'Training in Progress' : 'Not Training'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="subtitle2">Available Records</Typography>
                    <Typography variant="body1">{hookData[hookName].status.available_records || 0}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="subtitle2">Last Training</Typography>
                    <Typography variant="body1">
                      {hookData[hookName].status.last_training 
                        ? new Date(hookData[hookName].status.last_training).toLocaleString() 
                        : 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            )}
          </Box>
        );

      default:
        return (
          <Typography variant="body2" color="text.secondary">
            No specific UI available for this hook. Use the Test button to interact with it.
          </Typography>
        );
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Hooks Configuration
      </Typography>

      {/* Display validation errors at the top of the form */}
      <ValidationErrors error={error} />

      {!runtimeConnection?.backend_url && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Hook functionality is not available because there is no valid connection configured. 
          Please configure a connection in the Connection menu first.
        </Alert>
      )}

      <Formik
        initialValues={initialValues}
        validationSchema={HooksConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
        validate={(values) => {
          // Check if current values differ from initial values
          const hasChanged = checkFormChanged(values, initialValues);
          setIsFormChanged(hasChanged);
          setHasUnsavedChanges(hasChanged);
          return {}; // Return an empty object (no validation errors)
        }}
      >
        {({ values, errors, touched, setFieldValue }) => (
          <Form>
            <FormSection title="Lua Hooks Configuration">
              <Typography variant="body1" gutterBottom>
                Configure hooks for Lua scripts. These hooks allow you to interact with the Lua scripts through HTTP endpoints.
              </Typography>
              <Typography variant="body2" gutterBottom>
                For each hook, you can enable or disable it and configure the endpoint path. The full URL will be constructed using the backend URL from the connection configuration.
              </Typography>

              {/* API Version Selection */}
              <Box sx={{ mt: 2, mb: 3 }}>
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel id="api-version-label">API Version</InputLabel>
                  <Select
                    labelId="api-version-label"
                    id="api-version-select"
                    value={apiVersion}
                    label="API Version"
                    onChange={(e) => {
                      setApiVersion(e.target.value);
                      // Update all endpoint paths with the new API version
                      Object.keys(values.hooks).forEach(hookName => {
                        const hook = values.hooks[hookName as keyof LuaHooksConfig];
                        if (hook && hook.enabled) {
                          const { customPath } = extractPathParts(hook.endpoint_path);
                          setFieldValue(
                            `hooks.${hookName}.endpoint_path`,
                            combinePathParts(e.target.value, customPath)
                          )
                              .then(() => setHasUnsavedChanges(true));
                        }
                      });
                      setHasUnsavedChanges(true);
                      setIsFormChanged(true);
                    }}
                  >
                    {availableApiVersions.map((version) => (
                      <MenuItem key={version} value={version}>
                        {version}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  This setting applies to all hooks. The common prefix "/api/{apiVersion}/custom/" will be automatically added to all endpoint paths.
                </Typography>
              </Box>

              {Object.entries(values.hooks).map(([hookName, hookConfig]) => (
                <CollapsibleFormSection
                  key={hookName}
                  title={hookDisplayNames[hookName] || hookName}
                  description={hookDescriptions[hookName] || ""}
                  defaultExpanded={false}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={testingHook === hookName ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                      onClick={() => testHook(hookName, hookConfig)}
                      disabled={testingHook !== null || !hookConfig.enabled || connectionStatus !== 'connected'}
                    >
                      Test
                    </Button>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={hookConfig.enabled}
                            onChange={(e) => {
                              setFieldValue(`hooks.${hookName}.enabled`, e.target.checked)
                                  .then(() => setHasUnsavedChanges(true));
                            }}
                            name={`hooks.${hookName}.enabled`}
                          />
                        }
                        label={`Enable ${hookDisplayNames[hookName] || hookName}`}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Endpoint Path"
                        // We don't use the name prop here because we're handling the value manually
                        value={extractPathParts(hookConfig.endpoint_path).customPath}
                        onChange={(e) => {
                          // Combine the API version with the custom path entered by the user
                          const newEndpointPath = combinePathParts(apiVersion, e.target.value);
                          setFieldValue(`hooks.${hookName}.endpoint_path`, newEndpointPath)
                              .then(() => {
                                setHasUnsavedChanges(true)
                                setIsFormChanged(true);
                              });
                        }}
                        disabled={!hookConfig.enabled}
                        error={Boolean(
                          getIn(touched, `hooks.${hookName}.endpoint_path`) &&
                          getIn(errors, `hooks.${hookName}.endpoint_path`)
                        )}
                        helperText={
                          (getIn(touched, `hooks.${hookName}.endpoint_path`) &&
                          getIn(errors, `hooks.${hookName}.endpoint_path`)) ||
                          "Enter only the custom part of the path (e.g., nauthilus/neural/my-hook)"
                        }
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Typography color="textSecondary">{`/api/${apiVersion}/custom/`}</Typography>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Grid>

                    {/* Hook-specific UI */}
                    <Grid item xs={12}>
                      {renderHookUI(hookName, hookConfig)}
                    </Grid>
                  </Grid>
                </CollapsibleFormSection>
              ))}
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
                    setSnackbarOpen(true);
                    setTestResult({
                      success: true,
                      message: 'Loading configuration from backend...'
                    });
                    setStatusMessage('Loading configuration from backend...');

                    // Reset settings state to force a reload after the configuration is loaded
                    resetSettingsState();

                    // Log the current hooks configuration before loading
                    console.log('Hooks configuration before loading:', config?.lua?.hooks);
                    console.log('Custom hooks configuration before loading:', config?.lua?.custom_hooks);

                    loadConfigFromBackend(runtimeConnection)
                      .then(() => {
                        // Log the hooks-configuration after loading
                        console.log('Hooks configuration after loading:', config?.lua?.hooks);
                        console.log('Custom hooks configuration after loading:', config?.lua?.custom_hooks);

                        setTestResult({
                          success: true,
                          message: 'Configuration loaded successfully from backend'
                        });
                        setSnackbarOpen(true);
                        setStatusMessage('Connected to Nauthilus backend (ping successful)');
                      })
                      .catch((error) => {
                        // Display the error in the status message area
                        setStatusMessage(`Failed to load configuration: ${error.message}`);
                        setTestResult({
                          success: false,
                          message: `Failed to load configuration: ${error.message}`
                        });
                        setSnackbarOpen(true);
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
                disabled={!isFormChanged}
              >
                Save Changes
              </Button>
            </Box>
          </Form>
        )}
      </Formik>

      {/* Snackbar for displaying test results */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {testResult ? (
          <Alert
            onClose={() => setSnackbarOpen(false)}
            severity={testResult.success ? 'success' : 'error'}
            sx={{ width: '100%' }}
          >
            {testResult.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      {/* Confirmation Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => !isProcessing && setOpenDialog(false)}
      >
        {dialogConfig && (
          <>
            <DialogTitle>{dialogConfig.title}</DialogTitle>
            <DialogContent>
              <DialogContentText component="div">
                {dialogConfig.content}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button 
                onClick={() => setOpenDialog(false)} 
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button 
                onClick={dialogConfig.onConfirm} 
                color="primary" 
                variant="contained"
                disabled={isProcessing}
                startIcon={isProcessing ? <CircularProgress size={20} /> : null}
              >
                {dialogConfig.confirmLabel}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default HooksConfig;
