import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  SelectChangeEvent,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import * as ConfigContext from '../contexts/ConfigContext';
import { NauthilusConfig, BackendConfig } from '../types/config';
import PasswordField from './common/PasswordField';
const { useConfig } = ConfigContext;

// Define the steps for the wizard
const steps = ['Server Configuration', 'Redis Setup', 'Backend Selection'];

interface ConfigWizardProps {
  autoOpen?: boolean;
}

const ConfigWizard = ({ autoOpen = false }: ConfigWizardProps): JSX.Element => {
  const { config, updateConfig, setHasUnsavedChanges } = useConfig();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [open, setOpen] = useState(autoOpen);

  // Server configuration state - using default values instead of existing config
  const [serverAddress, setServerAddress] = useState('127.0.0.1:8080');
  const [instanceName, setInstanceName] = useState('nauthilus');

  // Redis configuration state - using default values
  const [redisSetupType, setRedisSetupType] = useState('master');
  const [redisMasterAddress, setRedisMasterAddress] = useState('localhost:6379');
  const [redisUsername, setRedisUsername] = useState('');
  const [redisPassword, setRedisPassword] = useState('');
  const [redisDatabaseNumber, setRedisDatabaseNumber] = useState(0);

  // Redis replica configuration - using default values
  const [redisReplicaAddresses, setRedisReplicaAddresses] = useState<string[]>(
    ['localhost:6380']
  );

  // Redis sentinel configuration - using default values
  const [redisSentinelMaster, setRedisSentinelMaster] = useState(
    'mymaster'
  );
  const [redisSentinelAddresses, setRedisSentinelAddresses] = useState<string[]>(
    ['localhost:26379']
  );
  const [redisSentinelUsername, setRedisSentinelUsername] = useState(
    ''
  );
  const [redisSentinelPassword, setRedisSentinelPassword] = useState(
    ''
  );

  // Redis cluster configuration - using default values
  const [redisClusterAddresses, setRedisClusterAddresses] = useState<string[]>(
    ['localhost:7000', 'localhost:7001', 'localhost:7002']
  );

  // Backend configuration state - using default values
  const [backendType, setBackendType] = useState('');

  // LDAP configuration state - using default values
  const [ldapServerUri, setLdapServerUri] = useState('');
  const [ldapBindDn, setLdapBindDn] = useState('');
  const [ldapBindPw, setLdapBindPw] = useState('');
  const [ldapBaseDn, setLdapBaseDn] = useState('');
  const [ldapUserFilter, setLdapUserFilter] = useState('(uid=%s)');
  const [ldapLookupPoolSize, setLdapLookupPoolSize] = useState(10);

  // Lua configuration state
  const [luaScriptPath, setLuaScriptPath] = useState('');
  const [luaPackagePath, setLuaPackagePath] = useState('');

  // Handle closing the wizard dialog
  const handleClose = () => {
    setOpen(false);
    setActiveStep(0);
    navigate('/'); // Navigate to Server Configuration page
  };

  // Handle moving to the next step
  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  // Handle moving to the previous step
  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  // Handle applying the configuration
  const handleApply = () => {
    // Create a new configuration object based on the current state
    const newConfig: NauthilusConfig = config ? { ...config } : {
      server: {
        redis: {}
      }
    };

    // Update server configuration
    if (!newConfig.server) {
      newConfig.server = { redis: {} };
    }
    newConfig.server.address = serverAddress;
    newConfig.server.instance_name = instanceName;

    // Update Redis configuration
    if (!newConfig.server.redis) {
      newConfig.server.redis = {};
    }
    newConfig.server.redis.database_number = redisDatabaseNumber;

    // Clear any existing Redis configuration
    newConfig.server.redis.master = undefined;
    newConfig.server.redis.replica = undefined;
    newConfig.server.redis.sentinels = undefined;
    newConfig.server.redis.cluster = undefined;

    // Set up the selected Redis configuration
    if (redisSetupType === 'master') {
      newConfig.server.redis.master = {
        address: redisMasterAddress
      };
      if (redisUsername) {
        newConfig.server.redis.master.username = redisUsername;
      }
      if (redisPassword) {
        newConfig.server.redis.master.password = redisPassword;
      }
    } else if (redisSetupType === 'replica') {
      newConfig.server.redis.master = {
        address: redisMasterAddress
      };
      if (redisUsername) {
        newConfig.server.redis.master.username = redisUsername;
      }
      if (redisPassword) {
        newConfig.server.redis.master.password = redisPassword;
      }
      newConfig.server.redis.replica = {
        addresses: redisReplicaAddresses
      };
    } else if (redisSetupType === 'sentinel') {
      newConfig.server.redis.sentinels = {
        master: redisSentinelMaster,
        addresses: redisSentinelAddresses
      };
      if (redisSentinelUsername) {
        newConfig.server.redis.sentinels.username = redisSentinelUsername;
      }
      if (redisSentinelPassword) {
        newConfig.server.redis.sentinels.password = redisSentinelPassword;
      }
    } else if (redisSetupType === 'cluster') {
      newConfig.server.redis.cluster = {
        addresses: redisClusterAddresses
      };
      if (redisUsername) {
        newConfig.server.redis.cluster.username = redisUsername;
      }
      if (redisPassword) {
        newConfig.server.redis.cluster.password = redisPassword;
      }
    }

    // Update backend configuration
    if (!newConfig.server.backends) {
      newConfig.server.backends = [];
    }

    // If no backends exist, create one based on the selected type
    if (newConfig.server.backends.length === 0 && backendType) {
      const backendConfig: BackendConfig = backendType;
      newConfig.server.backends.push(backendConfig);

      // If LDAP is selected, configure LDAP settings
      if (backendType === 'ldap' && ldapServerUri) {
        if (!newConfig.ldap) {
          newConfig.ldap = { 
            config: {
              lookup_pool_size: ldapLookupPoolSize,
              server_uri: []
            },
            search: []
          };
        }
        if (!newConfig.ldap.config) {
          newConfig.ldap.config = {
            lookup_pool_size: ldapLookupPoolSize,
            server_uri: []
          };
        }
        newConfig.ldap.config.server_uri = [ldapServerUri];

        // Add bind DN and password if provided
        if (ldapBindDn) {
          newConfig.ldap.config.bind_dn = ldapBindDn;
        }
        if (ldapBindPw) {
          newConfig.ldap.config.bind_pw = ldapBindPw;
        }

        // Add search configuration if base DN is provided
        if (ldapBaseDn && !newConfig.ldap.search) {
          newConfig.ldap.search = [];
        }

        if (ldapBaseDn && newConfig.ldap.search) {
          // Check if a search configuration already exists
          let searchConfig = null;
          for (let i = 0; i < newConfig.ldap.search.length; i++) {
            const s = newConfig.ldap.search[i];
            if (Array.isArray(s.protocol) && s.protocol.includes('imap')) {
              searchConfig = s;
              break;
            }
          }

          if (!searchConfig) {
            // Create a new search configuration
            searchConfig = {
              protocol: ['imap', 'smtp'],
              cache_name: 'ldap_auth',
              base_dn: ldapBaseDn,
              filter: {
                user: ldapUserFilter
              },
              mapping: {
                account_field: 'uid'
              },
              attribute: ['uid']
            };
            newConfig.ldap.search.push(searchConfig);
          } else {
            // Update existing search configuration
            searchConfig.base_dn = ldapBaseDn;
            if (!searchConfig.filter) {
              searchConfig.filter = {};
            }
            searchConfig.filter.user = ldapUserFilter;
          }
        }
      }

      // If Lua is selected, configure Lua settings
      if (backendType === 'lua' && luaScriptPath) {
        if (!newConfig.lua) {
          newConfig.lua = { search: [], config: {} };
        }
        if (!newConfig.lua.search) {
          newConfig.lua.search = [];
        }
        if (newConfig.lua.search.length === 0) {
          newConfig.lua.search.push({
            protocol: ['imap', 'smtp'],
            cache_name: 'lua_auth',
            backend_name: ''
          });
        }
        if (!newConfig.lua.config) {
          newConfig.lua.config = {};
        }
        newConfig.lua.config.backend_script_path = luaScriptPath;

        // Add package path if provided
        if (luaPackagePath) {
          newConfig.lua.config.package_path = luaPackagePath;
        }
      }
    }

    // Force update the configuration even if validation fails
    // This is intentional as per requirements - we want to save partial configuration
    updateConfig(newConfig);
    setHasUnsavedChanges(true);

    // Close the wizard
    handleClose();
  };

  // Render the current step content
  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Server Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Enter the basic server configuration settings.
            </Typography>
            <TextField
              fullWidth
              label="Server Address"
              value={serverAddress}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setServerAddress(e.target.value)}
              margin="normal"
              helperText="Format: hostname:port (e.g., localhost:8443)"
            />
            <TextField
              fullWidth
              label="Instance Name"
              value={instanceName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInstanceName(e.target.value)}
              margin="normal"
              helperText="A unique name for this Nauthilus instance"
            />
          </Box>
        );
      case 1:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Redis Setup
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Configure the Redis connection for caching and session management.
            </Typography>
            <FormControl component="fieldset" margin="normal">
              <FormLabel component="legend">Redis Setup Type</FormLabel>
              <RadioGroup
                value={redisSetupType}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisSetupType(e.target.value)}
              >
                <FormControlLabel value="master" control={<Radio />} label="Single Redis Server" />
                <FormControlLabel value="replica" control={<Radio />} label="Master-Replica" />
                <FormControlLabel value="sentinel" control={<Radio />} label="Sentinel" />
                <FormControlLabel value="cluster" control={<Radio />} label="Cluster" />
              </RadioGroup>
            </FormControl>

            <TextField
              fullWidth
              label="Database Number"
              type="number"
              value={redisDatabaseNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisDatabaseNumber(Number(e.target.value))}
              margin="normal"
              inputProps={{ min: 0, max: 15 }}
              helperText="Redis database number (0-15)"
            />

            {redisSetupType === 'master' && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Single Redis Server Configuration</Typography>
                <TextField
                  fullWidth
                  label="Redis Address"
                  value={redisMasterAddress}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisMasterAddress(e.target.value)}
                  margin="normal"
                  helperText="Format: hostname:port (e.g., localhost:6379)"
                />
                <TextField
                  fullWidth
                  label="Username (optional)"
                  value={redisUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisUsername(e.target.value)}
                  margin="normal"
                />
                <PasswordField
                  fullWidth
                  name="redisPassword"
                  label="Password (optional)"
                  value={redisPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisPassword(e.target.value)}
                  margin="normal"
                />
              </>
            )}

            {redisSetupType === 'replica' && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Master-Replica Configuration</Typography>
                <TextField
                  fullWidth
                  label="Master Address"
                  value={redisMasterAddress}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisMasterAddress(e.target.value)}
                  margin="normal"
                  helperText="Format: hostname:port (e.g., localhost:6379)"
                />
                <TextField
                  fullWidth
                  label="Username (optional)"
                  value={redisUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisUsername(e.target.value)}
                  margin="normal"
                />
                <PasswordField
                  fullWidth
                  name="redisPassword"
                  label="Password (optional)"
                  value={redisPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisPassword(e.target.value)}
                  margin="normal"
                />
                <Typography variant="subtitle2" sx={{ mt: 2 }}>Replica Addresses</Typography>
                <TextField
                  fullWidth
                  label="Replica Addresses"
                  value={redisReplicaAddresses.join(',')}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    setRedisReplicaAddresses(e.target.value.split(',').map(addr => addr.trim()).filter(addr => addr))
                  }
                  margin="normal"
                  helperText="Comma-separated list of replica addresses (e.g., localhost:6380,localhost:6381)"
                />
              </>
            )}

            {redisSetupType === 'sentinel' && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Sentinel Configuration</Typography>
                <TextField
                  fullWidth
                  label="Master Name"
                  value={redisSentinelMaster}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisSentinelMaster(e.target.value)}
                  margin="normal"
                  helperText="Name of the master in the sentinel configuration"
                />
                <TextField
                  fullWidth
                  label="Sentinel Addresses"
                  value={redisSentinelAddresses.join(',')}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    setRedisSentinelAddresses(e.target.value.split(',').map(addr => addr.trim()).filter(addr => addr))
                  }
                  margin="normal"
                  helperText="Comma-separated list of sentinel addresses (e.g., localhost:26379,localhost:26380)"
                />
                <TextField
                  fullWidth
                  label="Username (optional)"
                  value={redisSentinelUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisSentinelUsername(e.target.value)}
                  margin="normal"
                />
                <PasswordField
                  fullWidth
                  name="redisSentinelPassword"
                  label="Password (optional)"
                  value={redisSentinelPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisSentinelPassword(e.target.value)}
                  margin="normal"
                />
              </>
            )}

            {redisSetupType === 'cluster' && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Cluster Configuration</Typography>
                <TextField
                  fullWidth
                  label="Cluster Addresses"
                  value={redisClusterAddresses.join(',')}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    setRedisClusterAddresses(e.target.value.split(',').map(addr => addr.trim()).filter(addr => addr))
                  }
                  margin="normal"
                  helperText="Comma-separated list of cluster addresses (e.g., localhost:7000,localhost:7001,localhost:7002)"
                />
                <TextField
                  fullWidth
                  label="Username (optional)"
                  value={redisUsername}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisUsername(e.target.value)}
                  margin="normal"
                />
                <PasswordField
                  fullWidth
                  name="redisPassword"
                  label="Password (optional)"
                  value={redisPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedisPassword(e.target.value)}
                  margin="normal"
                />
              </>
            )}
          </Box>
        );
      case 2:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Backend Selection
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Choose and configure the authentication backend.
            </Typography>
            <FormControl fullWidth margin="normal">
              <InputLabel>Backend Type</InputLabel>
              <Select
                value={backendType}
                onChange={(e: SelectChangeEvent) => setBackendType(e.target.value)}
                label="Backend Type"
              >
                <MenuItem value="">None</MenuItem>
                <MenuItem value="cache">Cache</MenuItem>
                <MenuItem value="ldap">LDAP</MenuItem>
                <MenuItem value="lua">Lua</MenuItem>
              </Select>
            </FormControl>

            {backendType === 'ldap' && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>LDAP Configuration</Typography>
                <TextField
                  fullWidth
                  label="LDAP Server URI"
                  value={ldapServerUri}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLdapServerUri(e.target.value)}
                  margin="normal"
                  helperText="Format: ldap://hostname:port or ldaps://hostname:port"
                />
                <TextField
                  fullWidth
                  label="Bind DN"
                  value={ldapBindDn}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLdapBindDn(e.target.value)}
                  margin="normal"
                  helperText="DN to bind with for LDAP operations (e.g., cn=admin,dc=example,dc=com)"
                />
                <PasswordField
                  fullWidth
                  name="ldapBindPw"
                  label="Bind Password"
                  value={ldapBindPw}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLdapBindPw(e.target.value)}
                  margin="normal"
                  helperText="Password for the bind DN"
                />
                <TextField
                  fullWidth
                  label="Base DN"
                  value={ldapBaseDn}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLdapBaseDn(e.target.value)}
                  margin="normal"
                  helperText="Base DN for LDAP searches (e.g., dc=example,dc=com)"
                />
                <TextField
                  fullWidth
                  label="User Filter"
                  value={ldapUserFilter}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLdapUserFilter(e.target.value)}
                  margin="normal"
                  helperText="LDAP filter to find users (e.g., (uid=%s))"
                />
                <TextField
                  fullWidth
                  label="Lookup Pool Size"
                  type="number"
                  value={ldapLookupPoolSize}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLdapLookupPoolSize(Number(e.target.value))}
                  margin="normal"
                  inputProps={{ min: 1 }}
                  helperText="Number of connections in the LDAP lookup pool"
                />
              </>
            )}

            {backendType === 'lua' && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2 }}>Lua Configuration</Typography>
                <TextField
                  fullWidth
                  label="Backend Script Path"
                  value={luaScriptPath}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLuaScriptPath(e.target.value)}
                  margin="normal"
                  helperText="Path to the Lua backend script"
                />
                <TextField
                  fullWidth
                  label="Package Path"
                  value={luaPackagePath}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLuaPackagePath(e.target.value)}
                  margin="normal"
                  helperText="Lua package path (e.g., /usr/local/share/lua/5.1/?.lua)"
                />
              </>
            )}
          </Box>
        );
      default:
        return 'Unknown step';
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Configuration Wizard
        </DialogTitle>
        <DialogContent>
          <Box sx={{ width: '100%' }}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <Box sx={{ mt: 2, mb: 2 }}>
              {getStepContent(activeStep)}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Box sx={{ flex: '1 1 auto' }} />
          <Button
            disabled={activeStep === 0}
            onClick={handleBack}
          >
            Back
          </Button>
          {activeStep === steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleApply}
            >
              Apply
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
            >
              Next
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ConfigWizard;
