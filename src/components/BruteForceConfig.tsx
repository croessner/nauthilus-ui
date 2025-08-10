import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { 
  TextField, 
  Button,
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Tabs,
  Tab,
  Paper,
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
  Radio,
  FormControlLabel,
  Alert,
  Snackbar,
  TablePagination,
  Divider
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import SecurityIcon from '@mui/icons-material/Security';
import { useConfig } from '../contexts/ConfigContext';
import { useRuntime, getCurrentUserId } from '../contexts/RuntimeContext';
import { extractErrorMessage, prepareAuthParams, loadSettings as loadSettingsUtil, getProxyOrigin, authenticatedFetch } from '../utils/apiUtils';

// Helper function to convert time period strings (like "1h", "30m") to seconds
const convertPeriodToSeconds = (period: string): number => {
  if (!period) return 0;
  
  const match = period.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value; // seconds
    case 'm': return value * 60; // minutes to seconds
    case 'h': return value * 60 * 60; // hours to seconds
    case 'd': return value * 24 * 60 * 60; // days to seconds
    default: return 0;
  }
};

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

// Response from the API
interface BruteForceApiResponse {
  ip_addresses?: {
    [key: string]: string;
  };
  accounts?: {
    [key: string]: string[];
  };
  error: null | string;
}

const BruteForceConfig: React.FC = () => {
  const { config, currentProfileName } = useConfig();
  const { connection: runtimeConnection, loadRuntimeSettings } = useRuntime();
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected' | 'checking'>('unknown');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [notification, setNotification] = useState<{ open: boolean, message: ReactNode, severity: 'success' | 'error' | 'info' | 'warning' }>({
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
  
  // Pagination state - controls how many items are displayed per page
  // and which page is currently being viewed
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const rowsPerPageOptions = [10, 25, 50, 100]; // Options for items per page

  // Function to fetch the brute force list
  const fetchBruteForceList = useCallback(async (connectionConfig: any) => {
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
      const { authType, authValue } = prepareAuthParams(connectionConfig);

      // Use the proxy endpoint to make the request server-side
      const proxyUrl = new URL('/proxy/bruteforce/list', getProxyOrigin());
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      const response = await authenticatedFetch(proxyUrl.toString(), {
        method: 'GET',
      });

      if (!response.ok) {
        const errorMessage = await extractErrorMessage(response);
        console.error('Error fetching brute force list:', errorMessage);

        // Update the connection status message to show the error
        setStatusMessage(`Failed to fetch brute force list: ${errorMessage}`);

        setBruteForceList(null);
        return;
      }

      const data = await response.json();

      // Transform the API response to the expected format
      const transformedData: BruteForceListResponse = {
        blocked_ips: [],
        affected_accounts: []
      };
      
      // Process the result array
      if (data.result && Array.isArray(data.result)) {
        // Process IP addresses (first item in the result array)
        const ipAddressesResult = data.result[0];
        if (ipAddressesResult && ipAddressesResult.ip_addresses) {
          // Convert the ip_addresses object to an array of BruteForceListItem
          Object.entries(ipAddressesResult.ip_addresses).forEach(([ip, rule]) => {
            // Find the matching bucket configuration for this rule
            const ruleName = rule as string;
            let ttl = 0;
            let attempts = 0;
            
            // Try to find the matching bucket in the configuration
            if (config?.brute_force?.buckets && config.brute_force.buckets.length > 0) {
              const matchingBucket = config.brute_force.buckets.find(bucket => bucket.name === ruleName);
              if (matchingBucket) {
                // Extract TTL from period (e.g., "1h" -> 3600 seconds)
                const periodStr = matchingBucket.period || '';
                ttl = convertPeriodToSeconds(periodStr);
                
                // Get the failed_requests value as attempts
                attempts = matchingBucket.failed_requests || 0;
              }
            }
            
            transformedData.blocked_ips.push({
              ip_address: ip,
              rule_name: ruleName,
              ttl: ttl,
              attempts: attempts
            });
          });
        }
        
        // Process accounts (second item in the result array)
        const accountsResult = data.result[1];
        if (accountsResult && accountsResult.accounts) {
          // Convert the accounts object to an array of AffectedAccount
          Object.entries(accountsResult.accounts).forEach(([username, ips]) => {
            transformedData.affected_accounts.push({
              username,
              ip_addresses: Array.isArray(ips) ? ips : []
            });
          });
        }
      }
      
      setBruteForceList(transformedData);

      // Extract unique rule names from the transformed blocked IPs
      if (transformedData.blocked_ips && transformedData.blocked_ips.length > 0) {
        const apiRuleNames = Array.from(
          new Set(
            transformedData.blocked_ips
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

      // Update the connection status message to show the error
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed to fetch brute force list: ${errorMessage}`);

      setBruteForceList(null);
    } finally {
      setIsLoadingBruteForceList(false);
    }
  }, [config, setNotification, setBruteForceList, setRuleNames, setIsLoadingBruteForceList, setStatusMessage]);

  // Function to check connection to the backend
  const checkConnection = useCallback(async (connectionConfig: any) => {
    if (!connectionConfig.backend_url) {
      setConnectionStatus('unknown');
      setStatusMessage('No backend URL configured');
      return;
    }

    setConnectionStatus('checking');
    setStatusMessage('Checking connection...');

    try {
      // Use the proxy endpoint to make the request server-side
      // This avoids CORS issues by making the request through Node.js
      const proxyUrl = new URL('/proxy/ping', getProxyOrigin());
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      const response = await authenticatedFetch(proxyUrl.toString(), {
        method: 'GET',
      });

      if (response.ok) {
        setConnectionStatus('connected');
        setStatusMessage('Connected to Nauthilus backend (ping successful)');

        // Fetch the brute force list if the connection is successful
        await fetchBruteForceList(connectionConfig);
      } else {
        setConnectionStatus('disconnected');
        const errorMessage = await extractErrorMessage(response);
        setStatusMessage(`Failed to connect: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      setConnectionStatus('disconnected');
      setStatusMessage(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [setConnectionStatus, setStatusMessage, fetchBruteForceList]);

  // Keep a ref with latest runtimeConnection and provide a stable getter
  const connectionRef = React.useRef(runtimeConnection);
  useEffect(() => { connectionRef.current = runtimeConnection; }, [runtimeConnection]);
  const getRuntimeConnection = useCallback(() => connectionRef.current, []);

  // Load runtime settings once per profile and then handle local setup
  const didRunRef = React.useRef<string | null>(null);
  useEffect(() => {
    (async () => {
      if (didRunRef.current !== currentProfileName) {
        didRunRef.current = currentProfileName;
        await loadSettingsUtil(
          getCurrentUserId,
          loadRuntimeSettings,
          currentProfileName,
          checkConnection,
          getRuntimeConnection
        );
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
    })();
  }, [config, currentProfileName, loadRuntimeSettings, checkConnection, getRuntimeConnection]);

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
      const { authType, authValue } = prepareAuthParams(connectionConfig);

      // Use the proxy endpoint to make the request server-side
      const proxyUrl = new URL('/proxy/cache/flush', getProxyOrigin());
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      const response = await authenticatedFetch(proxyUrl.toString(), {
        method: 'POST',
        body: JSON.stringify({ user: username }),
      });

      if (!response.ok) {
        const errorMessage = await extractErrorMessage(response);
        console.error('Error freeing user by account:', errorMessage);
        setNotification({
          open: true,
          message: `Failed to free user ${username}: ${errorMessage}`,
          severity: 'error'
        });
        return;
      }

      await response.json(); // Response processed but not needed

      setNotification({
        open: true,
        message: `User ${username} freed from brute force protection successfully`,
        severity: 'success'
      });

      // Refresh the brute force list
      await fetchBruteForceList(connectionConfig);
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
      const { authType, authValue } = prepareAuthParams(connectionConfig);

      // Use the proxy endpoint to make the request server-side
      const proxyUrl = new URL('/proxy/bruteforce/flush', getProxyOrigin());
      proxyUrl.searchParams.append('url', connectionConfig.backend_url);

      if (authType && authValue) {
        proxyUrl.searchParams.append('authType', authType);
        proxyUrl.searchParams.append('authValue', authValue);
      }

      // Prepare the request body
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

      const response = await authenticatedFetch(proxyUrl.toString(), {
        method: 'DELETE',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorMessage = await extractErrorMessage(response);
        console.error('Error freeing user by IP address:', errorMessage);
        setNotification({
          open: true,
          message: `Failed to free IP ${ipAddress}: ${errorMessage}`,
          severity: 'error'
        });
        return;
      }

      await response.json(); // Response processed but not needed

      setNotification({
        open: true,
        message: `IP address ${ipAddress} freed from brute force protection successfully`,
        severity: 'success'
      });

      // Refresh the brute force list
      await fetchBruteForceList(connectionConfig);
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
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setPage(0); // Reset to first page when changing tabs
  };
  
  // Pagination handlers
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };
  
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  // Helper function to filter blocked IPs based on search term
  const filterBlockedIps = (items: BruteForceListItem[]) => {
    return items.filter(item => 
      !searchTerm || 
      item.ip_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.rule_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.protocol && item.protocol.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.oidc_cid && item.oidc_cid.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };
  
  // Helper function to filter affected accounts based on search term
  const filterAffectedAccounts = (accounts: AffectedAccount[]) => {
    return accounts.filter(account => 
      !searchTerm || 
      account.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.ip_addresses.some(ip => ip.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };
  
  // Reusable loading indicator component
  const LoadingIndicator = () => (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
      <CircularProgress />
    </Box>
  );
  
  // Reusable empty state component
  const EmptyState = ({ message }: { message: string }) => (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography variant="body1" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );

  // Function to open a user dialog
  const handleOpenUserDialog = (username: string) => {
    setSelectedUser(username);
    setOpenUserDialog(true);
  };

  // Function to open an IP dialog
  const handleOpenIpDialog = (ipAddress: string, ruleName: string = '*', protocol: string = '', oidcCid: string = '') => {
    setSelectedIp(ipAddress);
    setSelectedRule(ruleName);
    setSelectedProtocol(protocol);
    setSelectedOidcCid(oidcCid);
    setOpenIpDialog(true);
  };

  // Check if we have a valid connection configuration
  const hasValidConnection = runtimeConnection?.backend_url;

  return (
    <>
      {!hasValidConnection && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Brute-Force Management is not available because there is no valid connection configured. 
          Please configure a connection in the Connection menu first.
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SecurityIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6">Brute Force Protection Management</Typography>
        </Box>

        {connectionStatus === 'connected' ? (
          <>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, gap: 1, mb: 2 }}>
              <Typography variant="body1">
                Manage brute force protection for users and IP addresses.
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                <Button 
                  variant="outlined" 
                  color="secondary"
                  onClick={() => setOpenSearchDialog(true)}
                  size="small"
                >
                  Search & Free
                </Button>
                <Button 
                  variant="outlined" 
                  color="primary"
                  onClick={() => fetchBruteForceList(runtimeConnection)}
                  disabled={isLoadingBruteForceList}
                  startIcon={isLoadingBruteForceList ? <CircularProgress size={20} /> : <RefreshIcon />}
                  size="small"
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

            <Tabs 
              value={tabValue} 
              onChange={handleTabChange} 
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Blocked IP Addresses" />
              <Tab label="Affected Accounts" />
            </Tabs>

            {/* Blocked IP Addresses Tab */}
            {tabValue === 0 && (
              <Box sx={{ mt: 2 }}>
                {isLoadingBruteForceList ? (
                  <LoadingIndicator />
                ) : bruteForceList && bruteForceList.blocked_ips && bruteForceList.blocked_ips.length > 0 ? (
                  <>
                    <List>
                      {filterBlockedIps(bruteForceList.blocked_ips)
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((item, index) => (
                        <React.Fragment key={index}>
                          <ListItem>
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
                            <ListItemSecondaryAction sx={{ position: { xs: 'static', sm: 'absolute' }, mt: { xs: 1, sm: 0 } }}>
                              <Button
                                variant="outlined"
                                color="secondary"
                                onClick={() => handleOpenIpDialog(item.ip_address, item.rule_name, item.protocol, item.oidc_cid)}
                                startIcon={<DeleteIcon />}
                                size="small"
                              >
                                Free
                              </Button>
                            </ListItemSecondaryAction>
                          </ListItem>
                          <Divider />
                        </React.Fragment>
                      ))}
                    </List>
                    <TablePagination
                      component="div"
                      count={filterBlockedIps(bruteForceList.blocked_ips).length}
                      page={page}
                      onPageChange={handleChangePage}
                      rowsPerPage={rowsPerPage}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      rowsPerPageOptions={rowsPerPageOptions}
                      labelRowsPerPage="IPs per page:"
                    />
                  </>
                ) : (
                  <EmptyState 
                    message={bruteForceList === null 
                      ? 'Click "Refresh List" to load blocked IP addresses' 
                      : 'No blocked IP addresses found'} 
                  />
                )}
              </Box>
            )}

            {/* Affected Accounts Tab */}
            {tabValue === 1 && (
              <Box sx={{ mt: 2 }}>
                {isLoadingBruteForceList ? (
                  <LoadingIndicator />
                ) : bruteForceList && bruteForceList.affected_accounts && bruteForceList.affected_accounts.length > 0 ? (
                  <>
                    <List>
                      {filterAffectedAccounts(bruteForceList.affected_accounts)
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((account, index) => (
                        <React.Fragment key={index}>
                          <ListItem>
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
                            <ListItemSecondaryAction sx={{ position: { xs: 'static', sm: 'absolute' }, mt: { xs: 1, sm: 0 } }}>
                              <Button
                                variant="outlined"
                                color="secondary"
                                onClick={() => handleOpenUserDialog(account.username)}
                                startIcon={<DeleteIcon />}
                                size="small"
                              >
                                Free
                              </Button>
                            </ListItemSecondaryAction>
                          </ListItem>
                          <Divider />
                        </React.Fragment>
                      ))}
                    </List>
                    <TablePagination
                      component="div"
                      count={filterAffectedAccounts(bruteForceList.affected_accounts).length}
                      page={page}
                      onPageChange={handleChangePage}
                      rowsPerPage={rowsPerPage}
                      onRowsPerPageChange={handleChangeRowsPerPage}
                      rowsPerPageOptions={rowsPerPageOptions}
                      labelRowsPerPage="Accounts per page:"
                    />
                  </>
                ) : (
                  <EmptyState 
                    message={bruteForceList === null 
                      ? 'Click "Refresh List" to load affected accounts' 
                      : 'No affected accounts found'} 
                  />
                )}
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              {connectionStatus === 'checking' ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Checking connection...
                </>
              ) : connectionStatus === 'disconnected' ? (
                <>
                  Connection to backend failed: {statusMessage}
                </>
              ) : (
                <>
                  Not connected to backend. Please check your connection settings.
                </>
              )}
            </Typography>
            {connectionStatus !== 'checking' && hasValidConnection && (
              <Button 
                variant="outlined" 
                color="primary"
                onClick={() => checkConnection(runtimeConnection)}
                sx={{ mt: 2 }}
                startIcon={<RefreshIcon />}
              >
                Check Connection
              </Button>
            )}
          </Box>
        )}
      </Paper>

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
            onClick={() => freeUserByAccount(runtimeConnection, selectedUser)}
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
            onClick={() => freeUserByIp(runtimeConnection, selectedIp, selectedRule, selectedProtocol || undefined, selectedOidcCid || undefined)}
            color="secondary" 
            variant="contained"
            disabled={isProcessing}
            startIcon={isProcessing ? <CircularProgress size={20} /> : null}
          >
            {isProcessing ? 'Processing...' : 'Free IP Address'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for displaying notifications */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setNotification({ ...notification, open: false })}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default BruteForceConfig;
