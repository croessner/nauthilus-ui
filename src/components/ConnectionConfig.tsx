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
  Snackbar,
  Tabs,
  Tab,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormHelperText,
  Radio
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import SecurityIcon from '@mui/icons-material/Security';
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

// Brute force protection types
interface BruteForceListItem {
  ip_address: string;
  rule_name: string;
  protocol?: string;
  oidc_cid?: string;
  ttl: number;
  attempts: number;
}

interface AffectedAccount {
  username: string;
  ip_addresses: string[];
}

interface BruteForceListResponse {
  blocked_ips: BruteForceListItem[];
  affected_accounts: AffectedAccount[];
}

const ConnectionConfig: React.FC = () => {
  const { config, updateConfigSection, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [notification, setNotification] = useState<{ open: boolean, message: string, severity: 'success' | 'error' | 'info' | 'warning' }>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Brute force protection state
  const [tabValue, setTabValue] = useState<number>(0);
  const [bruteForceList, setBruteForceList] = useState<BruteForceListResponse | null>(null);
  const [isLoadingBruteForceList, setIsLoadingBruteForceList] = useState<boolean>(false);
  const [openUserDialog, setOpenUserDialog] = useState<boolean>(false);
  const [openIpDialog, setOpenIpDialog] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [selectedRule, setSelectedRule] = useState<string>('*');
  const [selectedProtocol, setSelectedProtocol] = useState<string>('');
  const [selectedOidcCid, setSelectedOidcCid] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [openSearchDialog, setOpenSearchDialog] = useState<boolean>(false);
  const [searchType, setSearchType] = useState<'ip' | 'user'>('ip');
  const [ruleNames, setRuleNames] = useState<string[]>([]);

  // Reset unsaved changes flag when component mounts
  useEffect(() => {
    setHasUnsavedChanges(false);

    // Check connection status when component mounts
    if (config?.connection?.backend_url) {
      checkConnection(config.connection);
    }

    // Extract rule names from brute force buckets in the configuration
    if (config?.brute_force?.buckets && config.brute_force.buckets.length > 0) {
      const configRuleNames = config.brute_force.buckets
        .map(bucket => bucket.name)
        .filter(name => name && name.trim() !== '');

      if (configRuleNames.length > 0) {
        setRuleNames(configRuleNames);
      }
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
      // Prepare authentication parameters for the proxy
      let authType = '';
      let authValue = '';

      // Add Basic Auth if enabled
      if (connectionConfig.basic_auth?.enabled && 
          connectionConfig.basic_auth.username && 
          connectionConfig.basic_auth.password) {
        authType = 'basic';
        authValue = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
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
            authType = 'bearer';
            authValue = tokenData.token;

            setNotification({
              open: true,
              message: 'JWT token fetched successfully',
              severity: 'success'
            });
          }
        } else if (connectionConfig.jwt_auth.token) {
          // Use existing token if available
          authType = 'bearer';
          authValue = connectionConfig.jwt_auth.token;
        }
      }

      // Use the proxy endpoint to make the request server-side
      // This avoids CORS issues by making the request through Node.js
      const proxyUrl = new URL('/proxy/ping', window.location.origin);
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      const response = await fetch(proxyUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setConnectionStatus('connected');
        setStatusMessage('Connected to Nauthilus backend (ping successful)');
      } else {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        setConnectionStatus('disconnected');
        setStatusMessage(`Failed to connect: ${errorData.error || response.statusText}`);
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

  // Function to fetch brute force list
  const fetchBruteForceList = async (connectionConfig: any) => {
    if (!connectionConfig.backend_url) {
      setNotification({
        open: true,
        message: 'No backend URL configured',
        severity: 'error'
      });
      return;
    }

    setIsLoadingBruteForceList(true);

    try {
      // Prepare authentication parameters for the proxy
      let authType = '';
      let authValue = '';

      // Add Basic Auth if enabled
      if (connectionConfig.basic_auth?.enabled && 
          connectionConfig.basic_auth.username && 
          connectionConfig.basic_auth.password) {
        authType = 'basic';
        authValue = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
      }

      // For JWT Auth, use existing token if available
      if (connectionConfig.jwt_auth?.enabled && connectionConfig.jwt_auth.token) {
        authType = 'bearer';
        authValue = connectionConfig.jwt_auth.token;
      }

      // Use the proxy endpoint to make the request server-side
      const proxyUrl = new URL('/proxy/bruteforce/list', window.location.origin);
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      const response = await fetch(proxyUrl.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || response.statusText);
      }

      const data = await response.json();
      setBruteForceList(data.result);

      // Extract unique rule names from the blocked IPs
      if (data.result && data.result.blocked_ips && data.result.blocked_ips.length > 0) {
        const apiRuleNames = Array.from(
          new Set(
            data.result.blocked_ips
              .map((item: BruteForceListItem) => item.rule_name)
              .filter((ruleName: string) => ruleName && ruleName !== '*')
          )
        ) as string[];

        // Get rule names from configuration
        const configRuleNames: string[] = [];
        if (config?.brute_force?.buckets && config.brute_force.buckets.length > 0) {
          config.brute_force.buckets.forEach(bucket => {
            if (bucket.name && bucket.name.trim() !== '') {
              configRuleNames.push(bucket.name);
            }
          });
        }

        // Merge rule names from API and configuration, removing duplicates
        const mergedRuleNames = Array.from(new Set([...apiRuleNames, ...configRuleNames]));
        setRuleNames(mergedRuleNames);
      } else if (config?.brute_force?.buckets && config.brute_force.buckets.length > 0) {
        // If no API data, still use configuration rule names
        const configRuleNames = config.brute_force.buckets
          .map(bucket => bucket.name)
          .filter(name => name && name.trim() !== '');

        if (configRuleNames.length > 0) {
          setRuleNames(configRuleNames);
        }
      }

      setNotification({
        open: true,
        message: 'Brute force list fetched successfully',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error fetching brute force list:', error);
      setNotification({
        open: true,
        message: `Failed to fetch brute force list: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
      setBruteForceList(null);
    } finally {
      setIsLoadingBruteForceList(false);
    }
  };

  // Function to free user by account
  const freeUserByAccount = async (connectionConfig: any, username: string) => {
    if (!connectionConfig.backend_url) {
      setNotification({
        open: true,
        message: 'No backend URL configured',
        severity: 'error'
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare authentication parameters for the proxy
      let authType = '';
      let authValue = '';

      // Add Basic Auth if enabled
      if (connectionConfig.basic_auth?.enabled && 
          connectionConfig.basic_auth.username && 
          connectionConfig.basic_auth.password) {
        authType = 'basic';
        authValue = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
      }

      // For JWT Auth, use existing token if available
      if (connectionConfig.jwt_auth?.enabled && connectionConfig.jwt_auth.token) {
        authType = 'bearer';
        authValue = connectionConfig.jwt_auth.token;
      }

      // Use the proxy endpoint to make the request server-side
      const proxyUrl = new URL('/proxy/cache/flush', window.location.origin);
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      const response = await fetch(proxyUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: username }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || response.statusText);
      }

      const data = await response.json();

      setNotification({
        open: true,
        message: `User ${username} freed from brute force protection successfully`,
        severity: 'success'
      });

      // Refresh the brute force list
      fetchBruteForceList(connectionConfig);
    } catch (error) {
      console.error('Error freeing user by account:', error);
      setNotification({
        open: true,
        message: `Failed to free user ${username}: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    } finally {
      setIsProcessing(false);
      setOpenUserDialog(false);
    }
  };

  // Function to free user by IP address
  const freeUserByIp = async (connectionConfig: any, ipAddress: string, ruleName: string, protocol?: string, oidcCid?: string) => {
    if (!connectionConfig.backend_url) {
      setNotification({
        open: true,
        message: 'No backend URL configured',
        severity: 'error'
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare authentication parameters for the proxy
      let authType = '';
      let authValue = '';

      // Add Basic Auth if enabled
      if (connectionConfig.basic_auth?.enabled && 
          connectionConfig.basic_auth.username && 
          connectionConfig.basic_auth.password) {
        authType = 'basic';
        authValue = btoa(`${connectionConfig.basic_auth.username}:${connectionConfig.basic_auth.password}`);
      }

      // For JWT Auth, use existing token if available
      if (connectionConfig.jwt_auth?.enabled && connectionConfig.jwt_auth.token) {
        authType = 'bearer';
        authValue = connectionConfig.jwt_auth.token;
      }

      // Use the proxy endpoint to make the request server-side
      const proxyUrl = new URL('/proxy/bruteforce/flush', window.location.origin);
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      // Prepare request body
      const requestBody: any = {
        ip_address: ipAddress,
        rule_name: ruleName
      };

      // Add optional parameters if provided
      if (protocol) {
        requestBody.protocol = protocol;
      }

      if (oidcCid) {
        requestBody.oidc_cid = oidcCid;
      }

      const response = await fetch(proxyUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || response.statusText);
      }

      const data = await response.json();

      setNotification({
        open: true,
        message: `IP address ${ipAddress} freed from brute force protection successfully`,
        severity: 'success'
      });

      // Refresh the brute force list
      fetchBruteForceList(connectionConfig);
    } catch (error) {
      console.error('Error freeing user by IP address:', error);
      setNotification({
        open: true,
        message: `Failed to free IP ${ipAddress}: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error'
      });
    } finally {
      setIsProcessing(false);
      setOpenIpDialog(false);
    }
  };

  // Function to handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Function to open user dialog
  const handleOpenUserDialog = (username: string) => {
    setSelectedUser(username);
    setOpenUserDialog(true);
  };

  // Function to open IP dialog
  const handleOpenIpDialog = (ipAddress: string, ruleName: string = '*', protocol: string = '', oidcCid: string = '') => {
    setSelectedIp(ipAddress);
    setSelectedRule(ruleName);
    setSelectedProtocol(protocol);
    setSelectedOidcCid(oidcCid);
    setOpenIpDialog(true);
  };

  // Function to reset JWT token
  const resetJwtToken = async () => {
    try {
      // Update the connection configuration with empty token
      await updateConfigSection('connection', {
        ...config.connection,
        jwt_auth: {
          ...config.connection?.jwt_auth,
          token: '',
          refresh_token: '',
          expires_at: 0
        }
      });

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

                {/* Brute Force Protection Section - Only show when connected */}
                {connectionStatus === 'connected' && (
                  <Grid item xs={12}>
                    <Paper sx={{ mt: 3, p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <SecurityIcon sx={{ mr: 1, color: 'primary.main' }} />
                        <Typography variant="h6">Brute Force Protection Management</Typography>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="body1">
                          Manage brute force protection for users and IP addresses.
                        </Typography>
                        <Box>
                          <Button 
                            variant="outlined" 
                            color="secondary"
                            onClick={() => setOpenSearchDialog(true)}
                            sx={{ mr: 1 }}
                          >
                            Search & Free
                          </Button>
                          <Button 
                            variant="outlined" 
                            color="primary"
                            onClick={() => fetchBruteForceList(values)}
                            disabled={isLoadingBruteForceList}
                            startIcon={isLoadingBruteForceList ? <CircularProgress size={20} /> : <RefreshIcon />}
                          >
                            {isLoadingBruteForceList ? 'Loading...' : 'Refresh List'}
                          </Button>
                        </Box>
                      </Box>

                      {/* Search Box */}
                      <Box sx={{ mb: 2 }}>
                        <TextField
                          fullWidth
                          variant="outlined"
                          size="small"
                          placeholder="Search by IP address or username..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          InputProps={{
                            endAdornment: searchTerm && (
                              <IconButton size="small" onClick={() => setSearchTerm('')}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            ),
                          }}
                        />
                      </Box>

                      <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Tab label="Blocked IP Addresses" />
                        <Tab label="Affected Accounts" />
                      </Tabs>

                      {/* Blocked IP Addresses Tab */}
                      {tabValue === 0 && (
                        <Box sx={{ mt: 2 }}>
                          {isLoadingBruteForceList ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                              <CircularProgress />
                            </Box>
                          ) : bruteForceList && bruteForceList.blocked_ips && bruteForceList.blocked_ips.length > 0 ? (
                            <List>
                              {bruteForceList.blocked_ips
                                .filter(item => 
                                  !searchTerm || 
                                  item.ip_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  item.rule_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  (item.protocol && item.protocol.toLowerCase().includes(searchTerm.toLowerCase())) ||
                                  (item.oidc_cid && item.oidc_cid.toLowerCase().includes(searchTerm.toLowerCase()))
                                )
                                .map((item, index) => (
                                <ListItem key={index} divider>
                                  <ListItemText
                                    primary={item.ip_address}
                                    secondary={
                                      <>
                                        <Typography component="span" variant="body2">
                                          Rule: {item.rule_name}
                                          {item.protocol && ` | Protocol: ${item.protocol}`}
                                          {item.oidc_cid && ` | OIDC Client ID: ${item.oidc_cid}`}
                                        </Typography>
                                        <br />
                                        <Typography component="span" variant="body2">
                                          TTL: {item.ttl} seconds | Attempts: {item.attempts}
                                        </Typography>
                                      </>
                                    }
                                  />
                                  <ListItemSecondaryAction>
                                    <Button
                                      variant="outlined"
                                      color="secondary"
                                      onClick={() => handleOpenIpDialog(item.ip_address, item.rule_name, item.protocol, item.oidc_cid)}
                                      startIcon={<DeleteIcon />}
                                    >
                                      Free
                                    </Button>
                                  </ListItemSecondaryAction>
                                </ListItem>
                              ))}
                            </List>
                          ) : (
                            <Box sx={{ p: 3, textAlign: 'center' }}>
                              <Typography variant="body1" color="text.secondary">
                                {bruteForceList === null 
                                  ? 'Click "Refresh List" to load blocked IP addresses' 
                                  : 'No blocked IP addresses found'}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      )}

                      {/* Affected Accounts Tab */}
                      {tabValue === 1 && (
                        <Box sx={{ mt: 2 }}>
                          {isLoadingBruteForceList ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                              <CircularProgress />
                            </Box>
                          ) : bruteForceList && bruteForceList.affected_accounts && bruteForceList.affected_accounts.length > 0 ? (
                            <List>
                              {bruteForceList.affected_accounts
                                .filter(account => 
                                  !searchTerm || 
                                  account.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  account.ip_addresses.some(ip => ip.toLowerCase().includes(searchTerm.toLowerCase()))
                                )
                                .map((account, index) => (
                                <ListItem key={index} divider>
                                  <ListItemText
                                    primary={account.username}
                                    secondary={
                                      <>
                                        <Typography component="span" variant="body2">
                                          Associated IP Addresses: {account.ip_addresses.join(', ')}
                                        </Typography>
                                      </>
                                    }
                                  />
                                  <ListItemSecondaryAction>
                                    <Button
                                      variant="outlined"
                                      color="secondary"
                                      onClick={() => handleOpenUserDialog(account.username)}
                                      startIcon={<DeleteIcon />}
                                    >
                                      Free
                                    </Button>
                                  </ListItemSecondaryAction>
                                </ListItem>
                              ))}
                            </List>
                          ) : (
                            <Box sx={{ p: 3, textAlign: 'center' }}>
                              <Typography variant="body1" color="text.secondary">
                                {bruteForceList === null 
                                  ? 'Click "Refresh List" to load affected accounts' 
                                  : 'No affected accounts found'}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      )}
                    </Paper>
                  </Grid>
                )}

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

                    {/* Token Status and Reset Button */}
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

      {/* User Free Dialog */}
      <Dialog
        open={openUserDialog}
        onClose={() => !isProcessing && setOpenUserDialog(false)}
        aria-labelledby="user-dialog-title"
      >
        <DialogTitle id="user-dialog-title">Free User from Brute Force Protection</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to free the user <strong>{selectedUser}</strong> from brute force protection?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This will remove all brute force protection for this user, including all IP addresses associated with the user.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => !isProcessing && setOpenUserDialog(false)} 
            color="primary"
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => freeUserByAccount(config.connection, selectedUser)} 
            color="secondary" 
            variant="contained"
            disabled={isProcessing}
            startIcon={isProcessing ? <CircularProgress size={20} /> : null}
          >
            {isProcessing ? 'Processing...' : 'Free User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Search and Free Dialog */}
      <Dialog
        open={openSearchDialog}
        onClose={() => setOpenSearchDialog(false)}
        aria-labelledby="search-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="search-dialog-title">Search and Free from Brute Force Protection</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Search for a specific user or IP address and free them from brute force protection.
          </Typography>

          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <Typography variant="subtitle2">Search Type</Typography>
            <Box sx={{ display: 'flex', mt: 1 }}>
              <FormControlLabel
                control={
                  <Radio
                    checked={searchType === 'user'}
                    onChange={() => setSearchType('user')}
                    value="user"
                  />
                }
                label="User Account"
              />
              <FormControlLabel
                control={
                  <Radio
                    checked={searchType === 'ip'}
                    onChange={() => setSearchType('ip')}
                    value="ip"
                  />
                }
                label="IP Address"
              />
            </Box>
          </FormControl>

          {searchType === 'user' ? (
            <TextField
              fullWidth
              label="Username"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              margin="normal"
              helperText="Enter the username to free from brute force protection"
            />
          ) : (
            <>
              <TextField
                fullWidth
                label="IP Address"
                value={selectedIp}
                onChange={(e) => setSelectedIp(e.target.value)}
                margin="normal"
                helperText="Enter the IP address to free from brute force protection"
              />

              <FormControl fullWidth sx={{ mt: 2, mb: 1 }}>
                <InputLabel id="rule-name-label">Rule Name</InputLabel>
                <Select
                  labelId="rule-name-label"
                  value={selectedRule}
                  onChange={(e) => setSelectedRule(e.target.value)}
                  label="Rule Name"
                >
                  <MenuItem value="*">All Rules (*)</MenuItem>
                  {ruleNames.map((ruleName) => (
                    <MenuItem key={ruleName} value={ruleName}>
                      {ruleName}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>Select "*" to free the IP from all rules</FormHelperText>
              </FormControl>

              <TextField
                fullWidth
                label="Protocol (Optional)"
                value={selectedProtocol}
                onChange={(e) => setSelectedProtocol(e.target.value)}
                margin="normal"
                helperText="Leave empty to free the IP regardless of protocol"
              />

              <TextField
                fullWidth
                label="OIDC Client ID (Optional)"
                value={selectedOidcCid}
                onChange={(e) => setSelectedOidcCid(e.target.value)}
                margin="normal"
                helperText="Leave empty to free the IP regardless of OIDC Client ID"
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setOpenSearchDialog(false)} 
            color="primary"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => {
              setOpenSearchDialog(false);
              if (searchType === 'user' && selectedUser) {
                setOpenUserDialog(true);
              } else if (searchType === 'ip' && selectedIp) {
                setOpenIpDialog(true);
              }
            }} 
            color="secondary" 
            variant="contained"
            disabled={searchType === 'user' ? !selectedUser : !selectedIp}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* IP Free Dialog */}
      <Dialog
        open={openIpDialog}
        onClose={() => !isProcessing && setOpenIpDialog(false)}
        aria-labelledby="ip-dialog-title"
      >
        <DialogTitle id="ip-dialog-title">Free IP Address from Brute Force Protection</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to free the IP address <strong>{selectedIp}</strong> from brute force protection?
          </Typography>

          <FormControl fullWidth sx={{ mt: 2, mb: 1 }}>
            <InputLabel id="rule-name-label">Rule Name</InputLabel>
            <Select
              labelId="rule-name-label"
              value={selectedRule}
              onChange={(e) => setSelectedRule(e.target.value)}
              label="Rule Name"
              disabled={isProcessing}
            >
              <MenuItem value="*">All Rules (*)</MenuItem>
              {ruleNames.map((ruleName) => (
                <MenuItem key={ruleName} value={ruleName}>
                  {ruleName}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>Select "*" to free the IP from all rules</FormHelperText>
          </FormControl>

          <TextField
            fullWidth
            label="Protocol (Optional)"
            value={selectedProtocol}
            onChange={(e) => setSelectedProtocol(e.target.value)}
            margin="normal"
            disabled={isProcessing}
            helperText="Leave empty to free the IP regardless of protocol"
          />

          <TextField
            fullWidth
            label="OIDC Client ID (Optional)"
            value={selectedOidcCid}
            onChange={(e) => setSelectedOidcCid(e.target.value)}
            margin="normal"
            disabled={isProcessing}
            helperText="Leave empty to free the IP regardless of OIDC Client ID"
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => !isProcessing && setOpenIpDialog(false)} 
            color="primary"
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => freeUserByIp(config.connection, selectedIp, selectedRule, selectedProtocol || undefined, selectedOidcCid || undefined)} 
            color="secondary" 
            variant="contained"
            disabled={isProcessing}
            startIcon={isProcessing ? <CircularProgress size={20} /> : null}
          >
            {isProcessing ? 'Processing...' : 'Free IP Address'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ConnectionConfig;
