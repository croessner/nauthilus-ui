import React, { useMemo, useState } from 'react';
import { Formik, Form, Field, getIn, FieldArray } from 'formik';
import * as Yup from 'yup';
import { Button, Box, Typography, FormHelperText, FormControl, InputLabel, Select, MenuItem, Paper, Tabs, Tab, TextField, FormControlLabel, IconButton, Radio, RadioGroup, Switch } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { 
  NauthilusConfig, 
  ServerConfig, 
  BackendServerConfig
} from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import PasswordField from './common/PasswordField';
import InfoTooltip from './common/InfoTooltip';
import Grid from '@mui/material/Grid';

// Interface for tab panel props
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

// Tab Panel component
const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`feature-tabpanel-${index}`}
      aria-labelledby={`feature-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
};

// Helper function for tab accessibility
const a11yProps = (index: number) => {
  return {
    id: `feature-tab-${index}`,
    'aria-controls': `feature-tabpanel-${index}`,
  };
};

// Built-in feature types
const builtInFeatureTypes = [
  { value: 'tls_encryption', label: 'TLS Encryption' },
  { value: 'rbl', label: 'RBL' },
  { value: 'relay_domains', label: 'Relay Domains' },
  { value: 'backend_server_monitoring', label: 'Backend Server Monitoring' },
  { value: 'brute_force', label: 'Brute Force' },
  { value: 'lua', label: 'Lua' }
];

// Validation schema
const FeaturesConfigSchema = Yup.object().shape({
  selectedFeatures: Yup.array().of(
    Yup.string().required('Feature is required')
  ),
  cleartext_networks: Yup.array().when('selectedFeatures', (selectedFeatures: string[], schema) => {
    return selectedFeatures && selectedFeatures.includes('tls_encryption')
      ? schema.of(Yup.string())
      : schema;
  }),
  rbl: Yup.object().when('selectedFeatures', (selectedFeatures: string[], schema) => {
    return selectedFeatures && selectedFeatures.includes('rbl')
      ? schema.shape({
          lists: Yup.array().of(
            Yup.object().shape({
              name: Yup.string().required('Name is required'),
              rbl: Yup.string().required('RBL server is required'),
              return_codes: Yup.array().of(
                  Yup.string().required('Return code is required'),
              )
            })
          ),
          threshold: Yup.number().min(0).max(100),
          ip_whitelist: Yup.array().of(
            Yup.string()
          ),
          soft_whitelist: Yup.object(),
        })
      : schema;
  }),
  relay_domains: Yup.object().when('selectedFeatures', (selectedFeatures: string[], schema) => {
    return selectedFeatures && selectedFeatures.includes('relay_domains')
      ? schema.shape({
          static: Yup.array().of(
            Yup.string().required('Domain is required')
          ),
        })
      : schema;
  }),
  backend_server_monitoring: Yup.object().when('selectedFeatures', (selectedFeatures: string[], schema) => {
    return selectedFeatures && selectedFeatures.includes('backend_server_monitoring')
      ? schema.shape({
          backend_servers: Yup.array().of(
            Yup.object().shape({
              protocol: Yup.string().required('Protocol is required'),
              host: Yup.string().required('Host is required'),
              port: Yup.number().min(1).max(65535),
            })
          ),
        })
      : schema;
  }),
  brute_force: Yup.object().when('selectedFeatures', (selectedFeatures: string[], schema) => {
    return selectedFeatures && selectedFeatures.includes('brute_force')
      ? schema.shape({
          ip_whitelist: Yup.array().of(
            Yup.string()
          ),
          soft_whitelist: Yup.object(),
          buckets: Yup.array().of(
            Yup.object().shape({
              name: Yup.string().required('Name is required'),
              period: Yup.string().required('Period is required'),
              cidr: Yup.number().required('CIDR is required').min(1).max(128),
              ipv4: Yup.boolean()
                .test('ipv4-xor-ipv6', 'Either IPv4 or IPv6 must be selected, but not both', function(value) {
                  const { ipv6 } = this.parent;
                  // Either ipv4 or ipv6 must be true, but not both
                  return (value === true && ipv6 !== true) || (value !== true && ipv6 === true);
                }),
              ipv6: Yup.boolean()
                .test('ipv6-xor-ipv4', 'Either IPv4 or IPv6 must be selected, but not both', function(value) {
                  const { ipv4 } = this.parent;
                  // Either ipv4 or ipv6 must be true, but not both
                  return (value === true && ipv4 !== true) || (value !== true && ipv4 === true);
                }),
              failed_requests: Yup.number().required('Failed requests is required').min(1),
              filter_by_protocol: Yup.array().of(Yup.string()),
              filter_by_oidc_cid: Yup.array().of(Yup.string()),
            })
          ),
          tolerate_percent: Yup.number().min(0).max(100),
          custom_tolerations: Yup.array().of(
            Yup.object().shape({
              ip_address: Yup.string().required('IP address is required'),
              tolerate_percent: Yup.number().required('Tolerate percent is required').min(0).max(100),
              tolerate_ttl: Yup.string().required('Tolerate TTL is required'),
              adaptive_toleration: Yup.boolean(),
              min_tolerate_percent: Yup.number().min(0).max(100),
              max_tolerate_percent: Yup.number().min(0).max(100),
              scale_factor: Yup.number().min(0.1).max(10),
            })
          ),
          tolerate_ttl: Yup.string(),
          adaptive_toleration: Yup.boolean(),
          min_tolerate_percent: Yup.number().min(0).max(100),
          max_tolerate_percent: Yup.number().min(0).max(100),
          scale_factor: Yup.number().min(0.1).max(10),
          pw_history_for_known_accounts: Yup.boolean(),
          cold_start_grace_enabled: Yup.boolean(),
          cold_start_grace_ttl: Yup.string(),
          ip_scoping: Yup.object().shape({
            rwp_ipv6_cidr: Yup.number().min(0).max(128),
            tolerations_ipv6_cidr: Yup.number().min(0).max(128)
          }),
          rwp_allowed_unique_hashes: Yup.number().min(0),
          rwp_window: Yup.string(),
        })
      : schema;
  }),
});

const FeaturesConfig: React.FC = () => {
  const { config, updateConfig, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();
  const [tabValue, setTabValue] = useState(0);

  // Get existing features (already as strings)
  const existingFeatureNames = config?.server?.features || [];

  // Filter feature types based on Lua configuration
  const filteredFeatureTypes = useMemo(() => {
    // Check if Lua features are configured
    const hasLuaFeatures = config?.lua?.features && config.lua.features.length > 0;

    // If Lua features are not configured, filter out the 'lua' option
    if (!hasLuaFeatures) {
      return builtInFeatureTypes.filter(feature => feature.value !== 'lua');
    }

    // Otherwise, return all feature types
    return builtInFeatureTypes;
  }, [config?.lua?.features]);

  // Handle tab change
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Initial values
  const initialValues = {
    selectedFeatures: existingFeatureNames,
    cleartext_networks: config?.cleartext_networks || [],
    realtime_blackhole_lists: {
      soft_whitelist: config?.realtime_blackhole_lists?.soft_whitelist || {},
      lists: config?.realtime_blackhole_lists?.lists || [{ name: '', rbl: '', return_codes: [''], allow_failure: false, weight: 0, ipv4: true, ipv6: true }],
      threshold: config?.realtime_blackhole_lists?.threshold || 0,
      ip_whitelist: config?.realtime_blackhole_lists?.ip_whitelist || [],
    },
    relay_domains: {
      soft_whitelist: config?.relay_domains?.soft_whitelist || {},
      static: config?.relay_domains?.static || [''],
    },
    backend_server_monitoring: {
      backend_servers: config?.backend_server_monitoring?.backend_servers || [{
        protocol: 'http',
        host: '',
        deep_check: false,
        request_uri: '',
        test_username: '',
        test_password: '',
        port: 80,
        tls: false,
        tls_skip_verify: false,
        haproxy_v2: false,
      }],
    },
    brute_force: {
      soft_whitelist: config?.brute_force?.soft_whitelist || {},
      ip_whitelist: config?.brute_force?.ip_whitelist || [],
      buckets: config?.brute_force?.buckets || [{
        name: '',
        period: '1h',
        cidr: 32,
        ipv4: true,
        ipv6: false,
        failed_requests: 5,
        filter_by_protocol: [],
        filter_by_oidc_cid: [],
      }],
      tolerate_percent: config?.brute_force?.tolerate_percent || 0,
      custom_tolerations: config?.brute_force?.custom_tolerations || [],
      tolerate_ttl: config?.brute_force?.tolerate_ttl || '1h',
      adaptive_toleration: config?.brute_force?.adaptive_toleration || false,
      min_tolerate_percent: config?.brute_force?.min_tolerate_percent || 10,
      max_tolerate_percent: config?.brute_force?.max_tolerate_percent || 50,
      scale_factor: config?.brute_force?.scale_factor || 1.0,
      pw_history_for_known_accounts: config?.brute_force?.pw_history_for_known_accounts || false,
      cold_start_grace_enabled: config?.brute_force?.cold_start_grace_enabled || false,
      cold_start_grace_ttl: config?.brute_force?.cold_start_grace_ttl || '1m',
      ip_scoping: {
        rwp_ipv6_cidr: config?.brute_force?.ip_scoping?.rwp_ipv6_cidr ?? 128,
        tolerations_ipv6_cidr: config?.brute_force?.ip_scoping?.tolerations_ipv6_cidr ?? 128,
      },
      rwp_allowed_unique_hashes: config?.brute_force?.rwp_allowed_unique_hashes ?? 0,
      rwp_window: config?.brute_force?.rwp_window || '5m',
    },
    newSoftWhitelistUsername: '',
    newBruteForceWhitelistUsername: '',
  };

  const handleSubmit = async (values: any) => {
    if (!config) return;

    try {
      // Create a properly typed copy of the config
      const updatedConfig: NauthilusConfig = { 
        ...config as NauthilusConfig,
        // Ensure the server is properly initialized
        server: {
          ...(config?.server || {}) as ServerConfig,
          features: values.selectedFeatures,
        }
      };

      // Add cleartext_networks if TLS encryption is enabled
      if (values.selectedFeatures.includes('tls_encryption')) {
        updatedConfig.cleartext_networks = values.cleartext_networks;
      }

      // Add feature-specific configurations
      if (values.selectedFeatures.includes('rbl')) {
        // Ensure rbl is properly structured
        updatedConfig.realtime_blackhole_lists = {
          ...values.realtime_blackhole_lists,
          // Ensure soft_whitelist is properly structured as a direct property
          soft_whitelist: values.realtime_blackhole_lists.soft_whitelist || {},
        };
      }

      if (values.selectedFeatures.includes('relay_domains')) {
        // Ensure relay_domains is properly structured
        updatedConfig.relay_domains = {
          ...values.relay_domains,
          // Ensure soft_whitelist is properly structured as a direct property
          soft_whitelist: values.relay_domains.soft_whitelist || {},
        };
      }

      if (values.selectedFeatures.includes('backend_server_monitoring')) {
        updatedConfig.backend_server_monitoring = values.backend_server_monitoring;
      }

      if (values.selectedFeatures.includes('brute_force')) {
        // Ensure brute_force is properly structured
        updatedConfig.brute_force = {
          ...values.brute_force,
          // Ensure soft_whitelist is properly structured as a direct property
          // rather than a nested object
          soft_whitelist: values.brute_force.soft_whitelist || {},
        };
      }

      // Wait for the update to complete before proceeding
      await updateConfig(updatedConfig);
    } catch (error) {
      console.error("Error saving configuration:", error);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Features Configuration
      </Typography>

      <Formik
        initialValues={initialValues}
        validationSchema={FeaturesConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ values, errors, touched, handleChange, setFieldValue }) => (
          <Form>
            <Paper sx={{ mb: 3 }}>
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange} 
                variant="scrollable"
                scrollButtons="auto"
                aria-label="feature configuration tabs"
              >
                <Tab label="Feature Selection" {...a11yProps(0)} />
                <Tab 
                  label="TLS Encryption" 
                  {...a11yProps(1)} 
                  disabled={!values.selectedFeatures.includes('tls_encryption')}
                />
                <Tab 
                  label="RBL" 
                  {...a11yProps(2)} 
                  disabled={!values.selectedFeatures.includes('rbl')}
                />
                <Tab 
                  label="Relay Domains" 
                  {...a11yProps(3)} 
                  disabled={!values.selectedFeatures.includes('relay_domains')}
                />
                <Tab 
                  label="Backend Server Monitoring" 
                  {...a11yProps(4)} 
                  disabled={!values.selectedFeatures.includes('backend_server_monitoring')}
                />
                <Tab 
                  label="Brute Force" 
                  {...a11yProps(5)} 
                  disabled={!values.selectedFeatures.includes('brute_force')}
                />
              </Tabs>
            </Paper>

            {/* Feature Selection Tab */}
            <TabPanel value={tabValue} index={0}>
              <FormSection title="Standard Features">
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <Typography variant="body1" gutterBottom>
                      Configure standard features for the server. Select multiple features from the dropdown.
                    </Typography>

                    <Paper sx={{ p: 2, mb: 2 }}>
                      <FormControl 
                        fullWidth 
                        error={Boolean(
                          getIn(touched, 'selectedFeatures') &&
                          getIn(errors, 'selectedFeatures')
                        )}
                      >
                        <InputLabel id="features-select-label">Features <InfoTooltip title="Enable built-in feature modules for the server. Select one or more." /></InputLabel>
                        <Select
                          labelId="features-select-label"
                          id="features-select"
                          multiple
                          value={values.selectedFeatures}
                          onChange={(e) => {
                            setFieldValue('selectedFeatures', e.target.value)
                                .then(() => setHasUnsavedChanges(true));
                          }}
                          renderValue={(selected) => {
                            // Convert feature values to labels for display
                            return (selected as string[])
                              .map(value => {
                                // Always use builtInFeatureTypes for rendering, even if the option is filtered out
                                // This ensures we still show the correct label for any selected feature
                                const feature = builtInFeatureTypes.find(type => type.value === value);
                                return feature ? feature.label : value;
                              })
                              .join(', ');
                          }}
                        >
                          {filteredFeatureTypes.map((type) => (
                            <MenuItem key={type.value} value={type.value}>
                              {type.label}
                            </MenuItem>
                          ))}
                        </Select>
                        {Boolean(
                          getIn(touched, 'selectedFeatures') &&
                          getIn(errors, 'selectedFeatures')
                        ) && (
                          <FormHelperText>
                            {getIn(errors, 'selectedFeatures')}
                          </FormHelperText>
                        )}
                      </FormControl>
                    </Paper>
                  </Grid>
                </Grid>
              </FormSection>
            </TabPanel>

            {/* TLS Encryption Tab */}
            <TabPanel value={tabValue} index={1}>
              <FormSection title="TLS Encryption Configuration">
                <Grid container spacing={3}>
                  <Grid size={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Cleartext Networks</Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      Networks that are allowed to connect without TLS encryption. IP addresses or CIDR notation (e.g., 192.168.1.0/24).
                    </Typography>
                    <FieldArray name="cleartext_networks">
                      {({ push, remove }) => (
                        <div>
                          {values.cleartext_networks && values.cleartext_networks.length > 0 ? (
                            values.cleartext_networks.map((_network: string, index: number) => (
                              <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <Field
                                  as={TextField}
                                  fullWidth
                                  name={`cleartext_networks[${index}]`}
                                  label={`Network ${index + 1}`}
                                  variant="outlined"
                                  error={getIn(touched, `cleartext_networks[${index}]`) && Boolean(getIn(errors, `cleartext_networks[${index}]`))}
                                  helperText={(getIn(touched, `cleartext_networks[${index}]`) && getIn(errors, `cleartext_networks[${index}]`)) || "IP address or CIDR notation (e.g., 192.168.1.0/24)"}
                                  onChange={(e: React.ChangeEvent<any>) => {
                                    handleChange(e);
                                    setHasUnsavedChanges(true);
                                  }}
                                />
                                <IconButton 
                                  onClick={() => {
                                    remove(index);
                                    setHasUnsavedChanges(true);
                                  }}
                                  sx={{ ml: 1 }}
                                  color="error"
                                  aria-label="Remove network"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Box>
                            ))
                          ) : (
                            <Typography color="textSecondary" sx={{ mb: 2 }}>No cleartext networks added yet.</Typography>
                          )}
                          <Button
                            startIcon={<AddIcon />}
                            variant="outlined"
                            color="primary"
                            onClick={() => {
                              push('');
                              setHasUnsavedChanges(true);
                            }}
                          >
                            Add Network
                          </Button>
                        </div>
                      )}
                    </FieldArray>
                  </Grid>
                </Grid>
              </FormSection>
            </TabPanel>

            {/* RBL Tab */}
            <TabPanel value={tabValue} index={2}>
              <FormSection title="RBL Configuration">
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="realtime_blackhole_lists.threshold"
                      label="Threshold"
                      variant="outlined"
                      type="number"
                      InputProps={{ inputProps: { min: 0, max: 100 } }}
                      error={getIn(touched, 'realtime_blackhole_lists.threshold') && Boolean(getIn(errors, 'realtime_blackhole_lists.threshold'))}
                      helperText={(getIn(touched, 'realtime_blackhole_lists.threshold') && getIn(errors, 'realtime_blackhole_lists.threshold')) || "Threshold value (0-100)"}
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <CollapsibleFormSection title="IP Whitelist" defaultExpanded>
                      <FieldArray name="realtime_blackhole_lists.ip_whitelist">
                        {({ push, remove }) => (
                          <div>
                            {values.realtime_blackhole_lists?.ip_whitelist && values.realtime_blackhole_lists.ip_whitelist.length > 0 ? (
                              values.realtime_blackhole_lists.ip_whitelist.map((_ip: string, index: number) => (
                                <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                  <Field
                                    as={TextField}
                                    fullWidth
                                    name={`realtime_blackhole_lists.ip_whitelist[${index}]`}
                                    label={`IP Address/CIDR ${index + 1}`}
                                    variant="outlined"
                                    error={getIn(touched, `realtime_blackhole_lists.ip_whitelist[${index}]`) && Boolean(getIn(errors, `realtime_blackhole_lists.ip_whitelist[${index}]`))}
                                    helperText={(getIn(touched, `realtime_blackhole_lists.ip_whitelist[${index}]`) && getIn(errors, `realtime_blackhole_lists.ip_whitelist[${index}]`)) || "IP address or CIDR notation (e.g., 192.168.1.0/24)"}
                                    onChange={(e: React.ChangeEvent<any>) => {
                                      handleChange(e);
                                      setHasUnsavedChanges(true);
                                    }}
                                  />
                                  <IconButton 
                                    onClick={() => {
                                      remove(index);
                                      setHasUnsavedChanges(true);
                                    }}
                                    sx={{ ml: 1 }}
                                    color="error"
                                    aria-label="Remove IP"
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Box>
                              ))
                            ) : (
                              <Typography color="textSecondary" sx={{ mb: 2 }}>No IP addresses added yet.</Typography>
                            )}
                            <Button
                              startIcon={<AddIcon />}
                              variant="outlined"
                              color="primary"
                              onClick={() => {
                                push('');
                                setHasUnsavedChanges(true);
                              }}
                            >
                              Add IP Address
                            </Button>
                          </div>
                        )}
                      </FieldArray>
                    </CollapsibleFormSection>
                  </Grid>
                  <Grid size={12}>
                    <CollapsibleFormSection title="Soft Whitelist">
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        The soft whitelist allows you to specify which usernames are allowed to bypass RBL checks from specific IP addresses or networks.
                      </Typography>
                      <FieldArray name="realtime_blackhole_lists.soft_whitelist">
                        {() => (
                          <div>
                            {Object.keys(values.realtime_blackhole_lists?.soft_whitelist || {}).length > 0 ? (
                              Object.entries(values.realtime_blackhole_lists?.soft_whitelist || {}).map(([username, networks], index) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                  <Grid container spacing={2}>
                                    <Grid size={12}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`realtime_blackhole_lists.soft_whitelist.${username}.username`}
                                        label="Username"
                                        variant="outlined"
                                        value={username}
                                        disabled
                                      />
                                    </Grid>
                                    <Grid size={12}>
                                      <Typography variant="subtitle2">Networks</Typography>
                                      {Array.isArray(networks) && networks.map((network: string, netIndex: number) => (
                                        <Box key={netIndex} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                          <Field
                                            as={TextField}
                                            fullWidth
                                            name={`realtime_blackhole_lists.soft_whitelist.${username}[${netIndex}]`}
                                            label={`Network ${netIndex + 1}`}
                                            variant="outlined"
                                            value={network}
                                            onChange={(e: React.ChangeEvent<any>) => {
                                              // Create a new array with the updated value
                                              const updatedNetworks = [...networks];
                                              updatedNetworks[netIndex] = e.target.value;

                                              // Update the soft_whitelist object
                                              const updatedSoftWhitelist = { ...values.realtime_blackhole_lists?.soft_whitelist };
                                              updatedSoftWhitelist[username] = updatedNetworks;

                                              setFieldValue('realtime_blackhole_lists.soft_whitelist', updatedSoftWhitelist)
                                                  .then(() => setHasUnsavedChanges(true));
                                            }}
                                          />
                                          <IconButton
                                            onClick={() => {
                                              // Create a new array without the removed network
                                              const updatedNetworks = networks.filter((_, i) => i !== netIndex);

                                              // Update the soft_whitelist object
                                              const updatedSoftWhitelist = { ...values.realtime_blackhole_lists?.soft_whitelist };

                                              if (updatedNetworks.length === 0) {
                                                // Remove the username entry if no networks remain
                                                delete updatedSoftWhitelist[username];
                                              } else {
                                                updatedSoftWhitelist[username] = updatedNetworks;
                                              }

                                              setFieldValue('realtime_blackhole_lists.soft_whitelist', updatedSoftWhitelist)
                                                  .then(() => setHasUnsavedChanges(true));
                                            }}
                                            sx={{ ml: 1 }}
                                            color="error"
                                          >
                                            <DeleteIcon />
                                          </IconButton>
                                        </Box>
                                      ))}
                                      <Button
                                        startIcon={<AddIcon />}
                                        variant="outlined"
                                        size="small"
                                        onClick={() => {
                                          // Add a new network to the existing username
                                          const updatedSoftWhitelist = { ...values.realtime_blackhole_lists?.soft_whitelist };
                                          updatedSoftWhitelist[username] = [...(networks as string[]), ''];

                                          setFieldValue('realtime_blackhole_lists.soft_whitelist', updatedSoftWhitelist)
                                              .then(() => setHasUnsavedChanges(true));
                                        }}
                                      >
                                        Add Network
                                      </Button>
                                    </Grid>
                                    <Grid display="flex" justifyContent="flex-end" size={12}>
                                      <Button
                                        variant="outlined"
                                        color="error"
                                        startIcon={<DeleteIcon />}
                                        onClick={() => {
                                          // Remove the entire username entry
                                          const updatedSoftWhitelist = { ...values.realtime_blackhole_lists?.soft_whitelist };
                                          delete updatedSoftWhitelist[username];

                                          setFieldValue('realtime_blackhole_lists.soft_whitelist', updatedSoftWhitelist)
                                              .then(() => setHasUnsavedChanges(true));
                                        }}
                                      >
                                        Remove User
                                      </Button>
                                    </Grid>
                                  </Grid>
                                </Paper>
                              ))
                            ) : (
                              <Typography color="textSecondary" sx={{ mb: 2 }}>No soft whitelist entries added yet.</Typography>
                            )}
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name="newSoftWhitelistUsername"
                                label="New Username"
                                variant="outlined"
                                value={values.newSoftWhitelistUsername || ''}
                                onChange={(e: React.ChangeEvent<any>) => {
                                  setFieldValue('newSoftWhitelistUsername', e.target.value)
                                      .then(() => setHasUnsavedChanges(true));
                                }}
                              />
                              <Button
                                variant="contained"
                                color="primary"
                                sx={{ ml: 1, height: 56 }}
                                onClick={() => {
                                  if (values.newSoftWhitelistUsername) {
                                    // Add a new username with an empty network array
                                    const updatedSoftWhitelist = { ...values.realtime_blackhole_lists?.soft_whitelist };
                                    updatedSoftWhitelist[values.newSoftWhitelistUsername] = [''];

                                    setFieldValue('realtime_blackhole_lists.soft_whitelist', updatedSoftWhitelist)
                                        .then(() => setHasUnsavedChanges(true));
                                    setFieldValue('newSoftWhitelistUsername', '')
                                        .then(() => setHasUnsavedChanges(true));
                                  }
                                }}
                              >
                                Add User
                              </Button>
                            </Box>
                          </div>
                        )}
                      </FieldArray>
                    </CollapsibleFormSection>
                  </Grid>
                  <Grid size={12}>
                    <CollapsibleFormSection title="RBL Lists">
                      <FieldArray name="realtime_blackhole_lists.lists">
                      {({ push, remove }) => (
                        <div>
                          {values.realtime_blackhole_lists?.lists && values.realtime_blackhole_lists.lists.length > 0 ? (
                            values.realtime_blackhole_lists.lists.map((_list, index) => (
                              <Paper key={index} sx={{ p: 2, mb: 2 }}>
                                <Grid container spacing={2}>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Field
                                      as={TextField}
                                      fullWidth
                                      name={`realtime_blackhole_lists.lists[${index}].name`}
                                      label="Name"
                                      variant="outlined"
                                      error={getIn(touched, `realtime_blackhole_lists.lists[${index}].name`) && Boolean(getIn(errors, `realtime_blackhole_lists.lists[${index}].name`))}
                                      helperText={(getIn(touched, `realtime_blackhole_lists.lists[${index}].name`) && getIn(errors, `realtime_blackhole_lists.lists[${index}].name`)) || "Name of the RBL"}
                                      onChange={(e: React.ChangeEvent<any>) => {
                                        handleChange(e);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Field
                                      as={TextField}
                                      fullWidth
                                      name={`realtime_blackhole_lists.lists[${index}].rbl`}
                                      label="RBL Server"
                                      variant="outlined"
                                      error={getIn(touched, `realtime_blackhole_lists.lists[${index}].rbl`) && Boolean(getIn(errors, `realtime_blackhole_lists.lists[${index}].rbl`))}
                                      helperText={(getIn(touched, `realtime_blackhole_lists.lists[${index}].rbl`) && getIn(errors, `realtime_blackhole_lists.lists[${index}].rbl`)) || "RBL server hostname"}
                                      onChange={(e: React.ChangeEvent<any>) => {
                                        handleChange(e);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Return codes</Typography>
                                    <FieldArray name={`realtime_blackhole_lists.lists[${index}].return_codes`}>
                                      {({ push, remove}) => (
                                        <div>
                                          {values.realtime_blackhole_lists?.lists[index]?.return_codes && values.realtime_blackhole_lists.lists[index].return_codes.length > 0 ? (
                                            values.realtime_blackhole_lists.lists[index].return_codes.map((_code, codeIndex) => (
                                              <Box key={codeIndex} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <Field
                                                  as={TextField}
                                                  fullWidth
                                                  name={`realtime_blackhole_lists.lists[${index}].return_codes[${codeIndex}]`}
                                                  label={`Return code ${codeIndex + 1}`}
                                                  variant="outlined"
                                                  error={getIn(touched, `realtime_blackhole_lists.lists[${index}].return_codes[${codeIndex}]`) && Boolean(getIn(errors, `realtime_blackhole_lists.lists[${index}].return_codes[${codeIndex}]`))}
                                                  helperText={(getIn(touched, `realtime_blackhole_lists.lists[${index}].return_codes[${codeIndex}]`) && getIn(errors, `realtime_blackhole_lists.lists[${index}].return_codes[${codeIndex}]`)) || "Return code"}
                                                  onChange={(e: React.ChangeEvent<any>) => {
                                                    handleChange(e);
                                                    setHasUnsavedChanges(true);
                                                  }}
                                                />
                                                <IconButton
                                                  onClick={() => {
                                                    remove(index);
                                                    setHasUnsavedChanges(true);
                                                  }}
                                                  sx={{ ml: 1 }}
                                                  color="error"
                                                  aria-label="Remove domain"
                                                >
                                                <DeleteIcon />
                                                </IconButton>
                                              </Box>
                                            ))
                                          ) : (
                                            <Typography color="textSecondary" sx={{ mb: 2 }}>No return codes added yet.</Typography>
                                          )}
                                          <Button
                                            startIcon={<AddIcon />}
                                            variant="outlined"
                                            color="primary"
                                            onClick={() => {
                                              push('');
                                              setHasUnsavedChanges(true);
                                            }}
                                          >
                                            Add Return Code
                                          </Button>
                                        </div>
                                      )}
                                    </FieldArray>
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Field
                                      as={TextField}
                                      fullWidth
                                      name={`realtime_blackhole_lists.lists[${index}].weight`}
                                      label="Weight"
                                      variant="outlined"
                                      type="number"
                                      InputProps={{ inputProps: { min: -100, max: 100 } }}
                                      error={getIn(touched, `realtime_blackhole_lists.lists[${index}].weight`) && Boolean(getIn(errors, `realtime_blackhole_lists.lists[${index}].weight`))}
                                      helperText={(getIn(touched, `realtime_blackhole_lists.lists[${index}].weight`) && getIn(errors, `realtime_blackhole_lists.lists[${index}].weight`)) || "Weight (-100 to 100)"}
                                      onChange={(e: React.ChangeEvent<any>) => {
                                        handleChange(e);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={values.realtime_blackhole_lists?.lists[index]?.allow_failure || false}
                                          onChange={(e) => {
                                            setFieldValue(`realtime_blackhole_lists.lists[${index}].allow_failure`, e.target.checked)
                                                .then(() => setHasUnsavedChanges(true));
                                          }}
                                          name={`realtime_blackhole_lists.lists[${index}].allow_failure`}
                                        />
                                      }
                                      label="Allow Failure"
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={values.realtime_blackhole_lists?.lists[index]?.ipv4 || false}
                                          onChange={(e) => {
                                            setFieldValue(`realtime_blackhole_lists.lists[${index}].ipv4`, e.target.checked)
                                                .then(() => setHasUnsavedChanges(true));
                                          }}
                                          name={`realtime_blackhole_lists.lists[${index}].ipv4`}
                                        />
                                      }
                                      label="IPv4"
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={values.realtime_blackhole_lists?.lists[index]?.ipv6 || false}
                                          onChange={(e) => {
                                            setFieldValue(`realtime_blackhole_lists.lists[${index}].ipv6`, e.target.checked)
                                                .then(() => setHasUnsavedChanges(true));
                                          }}
                                          name={`realtime_blackhole_lists.lists[${index}].ipv6`}
                                        />
                                      }
                                      label="IPv6"
                                    />
                                  </Grid>
                                  <Grid display="flex" justifyContent="flex-end" size={12}>
                                    <IconButton 
                                      onClick={() => {
                                        remove(index);
                                        setHasUnsavedChanges(true);
                                      }}
                                      color="error"
                                      aria-label="Remove RBL"
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Grid>
                                </Grid>
                              </Paper>
                            ))
                          ) : (
                            <Typography color="textSecondary" sx={{ mb: 2 }}>No RBL lists added yet.</Typography>
                          )}
                          <Button
                            startIcon={<AddIcon />}
                            variant="outlined"
                            color="primary"
                            onClick={() => {
                              push({ name: '', rbl: '', return_codes: [''], allow_failure: false, weight: 0, ipv4: true, ipv6: true });
                              setHasUnsavedChanges(true);
                            }}
                          >
                            Add RBL List
                          </Button>
                        </div>
                      )}
                    </FieldArray>
                    </CollapsibleFormSection>
                  </Grid>
                </Grid>
              </FormSection>
            </TabPanel>

            {/* Relay Domains Tab */}
            <TabPanel value={tabValue} index={3}>
              <FormSection title="Relay Domains Configuration">
                <Grid container spacing={3}>
                  <Grid size={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Static Domains</Typography>
                    <FieldArray name="relay_domains.static">
                      {({ push, remove }) => (
                        <div>
                          {values.relay_domains?.static && values.relay_domains.static.length > 0 ? (
                            values.relay_domains.static.map((_domain: string, index: number) => (
                              <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <Field
                                  as={TextField}
                                  fullWidth
                                  name={`relay_domains.static[${index}]`}
                                  label={`Domain ${index + 1}`}
                                  variant="outlined"
                                  error={getIn(touched, `relay_domains.static[${index}]`) && Boolean(getIn(errors, `relay_domains.static[${index}]`))}
                                  helperText={(getIn(touched, `relay_domains.static[${index}]`) && getIn(errors, `relay_domains.static[${index}]`)) || "Domain name"}
                                  onChange={(e: React.ChangeEvent<any>) => {
                                    handleChange(e);
                                    setHasUnsavedChanges(true);
                                  }}
                                />
                                <IconButton 
                                  onClick={() => {
                                    remove(index);
                                    setHasUnsavedChanges(true);
                                  }}
                                  sx={{ ml: 1 }}
                                  color="error"
                                  aria-label="Remove domain"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Box>
                            ))
                          ) : (
                            <Typography color="textSecondary" sx={{ mb: 2 }}>No static domains added yet.</Typography>
                          )}
                          <Button
                            startIcon={<AddIcon />}
                            variant="outlined"
                            color="primary"
                            onClick={() => {
                              push('');
                              setHasUnsavedChanges(true);
                            }}
                          >
                            Add Domain
                          </Button>
                        </div>
                      )}
                    </FieldArray>
                  </Grid>
                </Grid>
              </FormSection>
            </TabPanel>

            {/* Backend Server Monitoring Tab */}
            <TabPanel value={tabValue} index={4}>
              <FormSection title="Backend Server Monitoring Configuration">
                <Grid container spacing={3}>
                  <Grid size={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Backend Servers</Typography>
                    <FieldArray name="backend_server_monitoring.backend_servers">
                      {({ push, remove }) => (
                        <div>
                          {values.backend_server_monitoring?.backend_servers && values.backend_server_monitoring.backend_servers.length > 0 ? (
                            values.backend_server_monitoring.backend_servers.map((_server: BackendServerConfig, index: number) => (
                              <Paper key={index} sx={{ p: 2, mb: 2 }}>
                                <Grid container spacing={2}>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <FormControl fullWidth>
                                      <InputLabel id={`protocol-select-label-${index}`}>Protocol</InputLabel>
                                      <Select
                                        labelId={`protocol-select-label-${index}`}
                                        id={`protocol-select-${index}`}
                                        value={values.backend_server_monitoring.backend_servers[index].protocol}
                                        name={`backend_server_monitoring.backend_servers[${index}].protocol`}
                                        label="Protocol"
                                        onChange={(e) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      >
                                        <MenuItem value="imap">IMAP</MenuItem>
                                        <MenuItem value="pop3">POP3</MenuItem>
                                        <MenuItem value="lmtp">LMTP</MenuItem>
                                        <MenuItem value="smtp">SMTP</MenuItem>
                                        <MenuItem value="sieve">SIEVE</MenuItem>
                                        <MenuItem value="http">HTTP</MenuItem>
                                      </Select>
                                    </FormControl>
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Field
                                      as={TextField}
                                      fullWidth
                                      name={`backend_server_monitoring.backend_servers[${index}].host`}
                                      label="Host"
                                      variant="outlined"
                                      error={getIn(touched, `backend_server_monitoring.backend_servers[${index}].host`) && Boolean(getIn(errors, `backend_server_monitoring.backend_servers[${index}].host`))}
                                      helperText={(getIn(touched, `backend_server_monitoring.backend_servers[${index}].host`) && getIn(errors, `backend_server_monitoring.backend_servers[${index}].host`)) || "Hostname or IP address"}
                                      onChange={(e: React.ChangeEvent<any>) => {
                                        handleChange(e);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Field
                                      as={TextField}
                                      fullWidth
                                      name={`backend_server_monitoring.backend_servers[${index}].port`}
                                      label="Port"
                                      variant="outlined"
                                      type="number"
                                      InputProps={{ inputProps: { min: 1, max: 65535 } }}
                                      error={getIn(touched, `backend_server_monitoring.backend_servers[${index}].port`) && Boolean(getIn(errors, `backend_server_monitoring.backend_servers[${index}].port`))}
                                      helperText={(getIn(touched, `backend_server_monitoring.backend_servers[${index}].port`) && getIn(errors, `backend_server_monitoring.backend_servers[${index}].port`)) || "Port number (1-65535)"}
                                      onChange={(e: React.ChangeEvent<any>) => {
                                        handleChange(e);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={values.backend_server_monitoring?.backend_servers[index]?.deep_check || false}
                                          onChange={(e) => {
                                            setFieldValue(`backend_server_monitoring.backend_servers[${index}].deep_check`, e.target.checked)
                                                .then(() => setHasUnsavedChanges(true));
                                          }}
                                          name={`backend_server_monitoring.backend_servers[${index}].deep_check`}
                                        />
                                      }
                                      label="Deep Check"
                                    />
                                  </Grid>
                                  {values.backend_server_monitoring.backend_servers[index].protocol === 'http' && (
                                    <Grid size={{ xs: 12, md: 12 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`backend_server_monitoring.backend_servers[${index}].request_uri`}
                                        label="Request URI"
                                        variant="outlined"
                                        error={getIn(touched, `backend_server_monitoring.backend_servers[${index}].request_uri`) && Boolean(getIn(errors, `backend_server_monitoring.backend_servers[${index}].request_uri`))}
                                        helperText={(getIn(touched, `backend_server_monitoring.backend_servers[${index}].request_uri`) && getIn(errors, `backend_server_monitoring.backend_servers[${index}].request_uri`)) || "URI path for HTTP requests"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                  )}
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Field
                                      as={TextField}
                                      fullWidth
                                      name={`backend_server_monitoring.backend_servers[${index}].test_username`}
                                      label="Test Username"
                                      variant="outlined"
                                      error={getIn(touched, `backend_server_monitoring.backend_servers[${index}].test_username`) && Boolean(getIn(errors, `backend_server_monitoring.backend_servers[${index}].test_username`))}
                                      helperText={(getIn(touched, `backend_server_monitoring.backend_servers[${index}].test_username`) && getIn(errors, `backend_server_monitoring.backend_servers[${index}].test_username`)) || "Username for testing connection"}
                                      onChange={(e: React.ChangeEvent<any>) => {
                                        handleChange(e);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 6 }}>
                                    <Field
                                      as={PasswordField}
                                      fullWidth
                                      name={`backend_server_monitoring.backend_servers[${index}].test_password`}
                                      label="Test Password"
                                      variant="outlined"
                                      error={getIn(touched, `backend_server_monitoring.backend_servers[${index}].test_password`) && Boolean(getIn(errors, `backend_server_monitoring.backend_servers[${index}].test_password`))}
                                      helperText={(getIn(touched, `backend_server_monitoring.backend_servers[${index}].test_password`) && getIn(errors, `backend_server_monitoring.backend_servers[${index}].test_password`)) || "Password for testing connection"}
                                      onChange={(e: React.ChangeEvent<any>) => {
                                        handleChange(e);
                                        setHasUnsavedChanges(true);
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 4 }}>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={values.backend_server_monitoring?.backend_servers[index]?.tls || false}
                                          onChange={(e) => {
                                            setFieldValue(`backend_server_monitoring.backend_servers[${index}].tls`, e.target.checked)
                                                .then(() => setHasUnsavedChanges(true));
                                          }}
                                          name={`backend_server_monitoring.backend_servers[${index}].tls`}
                                        />
                                      }
                                      label="TLS"
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 4 }}>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={values.backend_server_monitoring?.backend_servers[index]?.tls_skip_verify || false}
                                          onChange={(e) => {
                                            setFieldValue(`backend_server_monitoring.backend_servers[${index}].tls_skip_verify`, e.target.checked)
                                                .then(() => setHasUnsavedChanges(true));
                                          }}
                                          name={`backend_server_monitoring.backend_servers[${index}].tls_skip_verify`}
                                        />
                                      }
                                      label="Skip TLS Verify"
                                    />
                                  </Grid>
                                  <Grid size={{ xs: 12, md: 4 }}>
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          checked={values.backend_server_monitoring?.backend_servers[index]?.haproxy_v2 || false}
                                          onChange={(e) => {
                                            setFieldValue(`backend_server_monitoring.backend_servers[${index}].haproxy_v2`, e.target.checked)
                                                .then(() => setHasUnsavedChanges(true));
                                          }}
                                          name={`backend_server_monitoring.backend_servers[${index}].haproxy_v2`}
                                        />
                                      }
                                      label="HAProxy v2"
                                    />
                                  </Grid>
                                  <Grid display="flex" justifyContent="flex-end" size={12}>
                                    <IconButton 
                                      onClick={() => {
                                        remove(index);
                                        setHasUnsavedChanges(true);
                                      }}
                                      color="error"
                                      aria-label="Remove server"
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Grid>
                                </Grid>
                              </Paper>
                            ))
                          ) : (
                            <Typography color="textSecondary" sx={{ mb: 2 }}>No backend servers added yet.</Typography>
                          )}
                          <Button
                            startIcon={<AddIcon />}
                            variant="outlined"
                            color="primary"
                            onClick={() => {
                              push({
                                protocol: 'http',
                                host: '',
                                deep_check: false,
                                request_uri: '',
                                test_username: '',
                                test_password: '',
                                port: 80,
                                tls: false,
                                tls_skip_verify: false,
                                haproxy_v2: false,
                              });
                              setHasUnsavedChanges(true);
                            }}
                          >
                            Add Backend Server
                          </Button>
                        </div>
                      )}
                    </FieldArray>
                  </Grid>
                </Grid>
              </FormSection>
            </TabPanel>

            {/* Brute Force Tab */}
            <TabPanel value={tabValue} index={5}>
              <FormSection title="Brute Force Configuration">
                <Grid container spacing={3}>
                  <Grid size={12}>
                    <CollapsibleFormSection title="IP Whitelist" defaultExpanded>
                      <FieldArray name="brute_force.ip_whitelist">
                      {({ push, remove }) => (
                        <div>
                          {values.brute_force?.ip_whitelist && values.brute_force.ip_whitelist.length > 0 ? (
                            values.brute_force.ip_whitelist.map((_ip: string, index: number) => (
                              <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <Field
                                  as={TextField}
                                  fullWidth
                                  name={`brute_force.ip_whitelist[${index}]`}
                                  label={`IP Address/CIDR ${index + 1}`}
                                  variant="outlined"
                                  error={getIn(touched, `brute_force.ip_whitelist[${index}]`) && Boolean(getIn(errors, `brute_force.ip_whitelist[${index}]`))}
                                  helperText={(getIn(touched, `brute_force.ip_whitelist[${index}]`) && getIn(errors, `brute_force.ip_whitelist[${index}]`)) || "IP address or CIDR notation (e.g., 192.168.1.0/24)"}
                                  onChange={(e: React.ChangeEvent<any>) => {
                                    handleChange(e);
                                    setHasUnsavedChanges(true);
                                  }}
                                />
                                <IconButton 
                                  onClick={() => {
                                    remove(index);
                                    setHasUnsavedChanges(true);
                                  }}
                                  sx={{ ml: 1 }}
                                  color="error"
                                  aria-label="Remove IP"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Box>
                            ))
                          ) : (
                            <Typography color="textSecondary" sx={{ mb: 2 }}>No IP addresses added yet.</Typography>
                          )}
                          <Button
                            startIcon={<AddIcon />}
                            variant="outlined"
                            color="primary"
                            onClick={() => {
                              push('');
                              setHasUnsavedChanges(true);
                            }}
                          >
                            Add IP Address
                          </Button>
                        </div>
                      )}
                    </FieldArray>
                    </CollapsibleFormSection>
                  </Grid>
                  <Grid size={12}>
                    <CollapsibleFormSection title="Soft Whitelist">
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        The soft whitelist allows you to specify which usernames are allowed to bypass brute force checks from specific IP addresses or networks.
                      </Typography>
                      <FieldArray name="brute_force.soft_whitelist">
                        {() => (
                          <div>
                            {Object.keys(values.brute_force?.soft_whitelist || {}).length > 0 ? (
                              Object.entries(values.brute_force?.soft_whitelist || {}).map(([username, networks], index) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                  <Grid container spacing={2}>
                                    <Grid size={12}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.soft_whitelist.${username}.username`}
                                        label="Username"
                                        variant="outlined"
                                        value={username}
                                        disabled
                                      />
                                    </Grid>
                                    <Grid size={12}>
                                      <Typography variant="subtitle2">Networks</Typography>
                                      {Array.isArray(networks) && networks.map((network: string, netIndex: number) => (
                                        <Box key={netIndex} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                          <Field
                                            as={TextField}
                                            fullWidth
                                            name={`brute_force.soft_whitelist.${username}[${netIndex}]`}
                                            label={`Network ${netIndex + 1}`}
                                            variant="outlined"
                                            value={network}
                                            onChange={(e: React.ChangeEvent<any>) => {
                                              // Create a new array with the updated value
                                              const updatedNetworks = [...networks];
                                              updatedNetworks[netIndex] = e.target.value;

                                              // Update the soft_whitelist object
                                              const updatedSoftWhitelist = { ...values.brute_force?.soft_whitelist };
                                              updatedSoftWhitelist[username] = updatedNetworks;

                                              setFieldValue('brute_force.soft_whitelist', updatedSoftWhitelist)
                                                  .then(() => setHasUnsavedChanges(true));
                                            }}
                                          />
                                          <IconButton
                                            onClick={() => {
                                              // Create a new array without the removed network
                                              const updatedNetworks = networks.filter((_, i) => i !== netIndex);

                                              // Update the soft_whitelist object
                                              const updatedSoftWhitelist = { ...values.brute_force?.soft_whitelist };

                                              if (updatedNetworks.length === 0) {
                                                // Remove the username entry if no networks remain
                                                delete updatedSoftWhitelist[username];
                                              } else {
                                                updatedSoftWhitelist[username] = updatedNetworks;
                                              }

                                              setFieldValue('brute_force.soft_whitelist', updatedSoftWhitelist)
                                                  .then(() => setHasUnsavedChanges(true));
                                            }}
                                            sx={{ ml: 1 }}
                                            color="error"
                                          >
                                            <DeleteIcon />
                                          </IconButton>
                                        </Box>
                                      ))}
                                      <Button
                                        startIcon={<AddIcon />}
                                        variant="outlined"
                                        size="small"
                                        onClick={() => {
                                          // Add a new network to the existing username
                                          const updatedSoftWhitelist = { ...values.brute_force?.soft_whitelist };
                                          updatedSoftWhitelist[username] = [...(networks as string[]), ''];

                                          setFieldValue('brute_force.soft_whitelist', updatedSoftWhitelist)
                                              .then(() => setHasUnsavedChanges(true));
                                        }}
                                      >
                                        Add Network
                                      </Button>
                                    </Grid>
                                    <Grid display="flex" justifyContent="flex-end" size={12}>
                                      <Button
                                        variant="outlined"
                                        color="error"
                                        startIcon={<DeleteIcon />}
                                        onClick={() => {
                                          // Remove the entire username entry
                                          const updatedSoftWhitelist = { ...values.brute_force?.soft_whitelist };
                                          delete updatedSoftWhitelist[username];

                                          setFieldValue('brute_force.soft_whitelist', updatedSoftWhitelist)
                                              .then(() => setHasUnsavedChanges(true));
                                        }}
                                      >
                                        Remove User
                                      </Button>
                                    </Grid>
                                  </Grid>
                                </Paper>
                              ))
                            ) : (
                              <Typography color="textSecondary" sx={{ mb: 2 }}>No soft whitelist entries added yet.</Typography>
                            )}
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name="newBruteForceWhitelistUsername"
                                label="New Username"
                                variant="outlined"
                                value={values.newBruteForceWhitelistUsername || ''}
                                onChange={(e: React.ChangeEvent<any>) => {
                                  setFieldValue('newBruteForceWhitelistUsername', e.target.value)
                                      .then(() => setHasUnsavedChanges(true));
                                }}
                              />
                              <Button
                                variant="contained"
                                color="primary"
                                sx={{ ml: 1, height: 56 }}
                                onClick={() => {
                                  if (values.newBruteForceWhitelistUsername) {
                                    // Add a new username with an empty network array
                                    const updatedSoftWhitelist = { ...values.brute_force?.soft_whitelist };
                                    updatedSoftWhitelist[values.newBruteForceWhitelistUsername] = [''];

                                    setFieldValue('brute_force.soft_whitelist', updatedSoftWhitelist)
                                        .then(() => setHasUnsavedChanges(true));
                                    setFieldValue('newBruteForceWhitelistUsername', '')
                                        .then(() => setHasUnsavedChanges(true));
                                  }
                                }}
                              >
                                Add User
                              </Button>
                            </Box>
                          </div>
                        )}
                      </FieldArray>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="Password History for Known Accounts">
                      <FormControlLabel
                        control={
                          <Switch
                            checked={values.brute_force?.pw_history_for_known_accounts || false}
                            onChange={(e) => {
                              setFieldValue('brute_force.pw_history_for_known_accounts', e.target.checked)
                                .then(() => setHasUnsavedChanges(true));
                            }}
                            name="brute_force.pw_history_for_known_accounts"
                          />
                        }
                        label="Store password history for known accounts"
                      />
                      <Typography variant="body2" color="textSecondary">
                        Records password history for existing accounts only. Failed attempts against unknown usernames won't create history entries, preventing Redis key explosion when attackers probe non-existent accounts. This applies only after the source has already been identified as a brute-forcer.
                      </Typography>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="Cold Start Grace">
                      <FormControlLabel
                        control={
                          <Switch
                            checked={values.brute_force?.cold_start_grace_enabled || false}
                            onChange={(e) => {
                              setFieldValue('brute_force.cold_start_grace_enabled', e.target.checked)
                                .then(() => setHasUnsavedChanges(true));
                            }}
                            name="brute_force.cold_start_grace_enabled"
                          />
                        }
                        label="Enable cold start grace period"
                      />
                      <Box sx={{ mt: 2 }}>
                        <Field
                          as={TextField}
                          fullWidth
                          name="brute_force.cold_start_grace_ttl"
                          label="Grace TTL"
                          variant="outlined"
                          disabled={!values.brute_force?.cold_start_grace_enabled}
                          helperText="Duration for the grace period (e.g., 30s, 1m, 5m)."
                          onChange={(e: React.ChangeEvent<any>) => {
                            handleChange(e);
                            setHasUnsavedChanges(true);
                          }}
                        />
                      </Box>
                      <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                        When enabled, applies a temporary grace period after startup before enforcing brute-force penalties.
                      </Typography>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="IP Scoping">
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.ip_scoping.rwp_ipv6_cidr"
                            label="Repeating Wrong Password IPv6 CIDR"
                            variant="outlined"
                            type="number"
                            InputProps={{ inputProps: { min: 0, max: 128 } }}
                            helperText="IPv6 CIDR for repeating-wrong-password detection buckets. 0 disables (default /128)."
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.ip_scoping.tolerations_ipv6_cidr"
                            label="Tolerations IPv6 CIDR"
                            variant="outlined"
                            type="number"
                            InputProps={{ inputProps: { min: 0, max: 128 } }}
                            helperText="IPv6 CIDR for tolerations buckets. 0 disables (default /128)."
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                      </Grid>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="Repeating Wrong Password (RWP)">
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.rwp_allowed_unique_hashes"
                            label="Allowed Unique Hashes"
                            variant="outlined"
                            type="number"
                            InputProps={{ inputProps: { min: 0 } }}
                            helperText="Maximum number of unique password hashes allowed within the RWP window before flagging as brute force."
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.rwp_window"
                            label="RWP Window"
                            variant="outlined"
                            helperText="Time window for evaluating repeating wrong passwords (e.g., 1m, 5m, 1h)."
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                      </Grid>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="Tolerations">
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.tolerate_percent"
                            label="Tolerate Percent"
                            variant="outlined"
                            type="number"
                            InputProps={{ inputProps: { min: 0, max: 100 } }}
                            error={getIn(touched, 'brute_force.tolerate_percent') && Boolean(getIn(errors, 'brute_force.tolerate_percent'))}
                            helperText={(getIn(touched, 'brute_force.tolerate_percent') && getIn(errors, 'brute_force.tolerate_percent')) || "Percentage of failed requests to tolerate (0-100)"}
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.tolerate_ttl"
                            label="Tolerate TTL"
                            variant="outlined"
                            error={getIn(touched, 'brute_force.tolerate_ttl') && Boolean(getIn(errors, 'brute_force.tolerate_ttl'))}
                            helperText={(getIn(touched, 'brute_force.tolerate_ttl') && getIn(errors, 'brute_force.tolerate_ttl')) || "Time-to-live for tolerations (e.g., 1h, 30m)"}
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={values.brute_force?.adaptive_toleration || false}
                                onChange={(e) => {
                                  setFieldValue('brute_force.adaptive_toleration', e.target.checked)
                                      .then(() => setHasUnsavedChanges(true));
                                }}
                                name="brute_force.adaptive_toleration"
                              />
                            }
                            label="Adaptive Toleration"
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.min_tolerate_percent"
                            label="Min Tolerate Percent"
                            variant="outlined"
                            type="number"
                            InputProps={{ inputProps: { min: 0, max: 100 } }}
                            error={getIn(touched, 'brute_force.min_tolerate_percent') && Boolean(getIn(errors, 'brute_force.min_tolerate_percent'))}
                            helperText={(getIn(touched, 'brute_force.min_tolerate_percent') && getIn(errors, 'brute_force.min_tolerate_percent')) || "Minimum percentage for adaptive toleration (0-100)"}
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.max_tolerate_percent"
                            label="Max Tolerate Percent"
                            variant="outlined"
                            type="number"
                            InputProps={{ inputProps: { min: 0, max: 100 } }}
                            error={getIn(touched, 'brute_force.max_tolerate_percent') && Boolean(getIn(errors, 'brute_force.max_tolerate_percent'))}
                            helperText={(getIn(touched, 'brute_force.max_tolerate_percent') && getIn(errors, 'brute_force.max_tolerate_percent')) || "Maximum percentage for adaptive toleration (0-100)"}
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <Field
                            as={TextField}
                            fullWidth
                            name="brute_force.scale_factor"
                            label="Scale Factor"
                            variant="outlined"
                            type="number"
                            InputProps={{ inputProps: { min: 0.1, max: 10, step: 0.1 } }}
                            error={getIn(touched, 'brute_force.scale_factor') && Boolean(getIn(errors, 'brute_force.scale_factor'))}
                            helperText={(getIn(touched, 'brute_force.scale_factor') && getIn(errors, 'brute_force.scale_factor')) || "Scale factor for adaptive toleration (0.1-10)"}
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                        </Grid>
                      </Grid>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="Custom Tolerations">
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        Custom tolerations allow you to specify different toleration settings for specific IP addresses or networks.
                      </Typography>
                      <FieldArray name="brute_force.custom_tolerations">
                        {({ push, remove }) => (
                          <div>
                            {values.brute_force?.custom_tolerations && values.brute_force.custom_tolerations.length > 0 ? (
                              values.brute_force.custom_tolerations.map((_toleration: any, index: number) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                  <Grid container spacing={2}>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.custom_tolerations[${index}].ip_address`}
                                        label="IP Address/CIDR"
                                        variant="outlined"
                                        error={getIn(touched, `brute_force.custom_tolerations[${index}].ip_address`) && Boolean(getIn(errors, `brute_force.custom_tolerations[${index}].ip_address`))}
                                        helperText={(getIn(touched, `brute_force.custom_tolerations[${index}].ip_address`) && getIn(errors, `brute_force.custom_tolerations[${index}].ip_address`)) || "IP address or CIDR notation (e.g., 192.168.1.0/24)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.custom_tolerations[${index}].tolerate_percent`}
                                        label="Tolerate Percent"
                                        variant="outlined"
                                        type="number"
                                        InputProps={{ inputProps: { min: 0, max: 100 } }}
                                        error={getIn(touched, `brute_force.custom_tolerations[${index}].tolerate_percent`) && Boolean(getIn(errors, `brute_force.custom_tolerations[${index}].tolerate_percent`))}
                                        helperText={(getIn(touched, `brute_force.custom_tolerations[${index}].tolerate_percent`) && getIn(errors, `brute_force.custom_tolerations[${index}].tolerate_percent`)) || "Percentage of failed requests to tolerate (0-100)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.custom_tolerations[${index}].tolerate_ttl`}
                                        label="Tolerate TTL"
                                        variant="outlined"
                                        error={getIn(touched, `brute_force.custom_tolerations[${index}].tolerate_ttl`) && Boolean(getIn(errors, `brute_force.custom_tolerations[${index}].tolerate_ttl`))}
                                        helperText={(getIn(touched, `brute_force.custom_tolerations[${index}].tolerate_ttl`) && getIn(errors, `brute_force.custom_tolerations[${index}].tolerate_ttl`)) || "Time-to-live for tolerations (e.g., 1h, 30m)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <FormControlLabel
                                        control={
                                          <Switch
                                            checked={values.brute_force?.custom_tolerations[index]?.adaptive_toleration || false}
                                            onChange={(e) => {
                                              setFieldValue(`brute_force.custom_tolerations[${index}].adaptive_toleration`, e.target.checked)
                                                  .then(() => setHasUnsavedChanges(true));
                                            }}
                                            name={`brute_force.custom_tolerations[${index}].adaptive_toleration`}
                                          />
                                        }
                                        label="Adaptive Toleration"
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.custom_tolerations[${index}].min_tolerate_percent`}
                                        label="Min Tolerate Percent"
                                        variant="outlined"
                                        type="number"
                                        InputProps={{ inputProps: { min: 0, max: 100 } }}
                                        error={getIn(touched, `brute_force.custom_tolerations[${index}].min_tolerate_percent`) && Boolean(getIn(errors, `brute_force.custom_tolerations[${index}].min_tolerate_percent`))}
                                        helperText={(getIn(touched, `brute_force.custom_tolerations[${index}].min_tolerate_percent`) && getIn(errors, `brute_force.custom_tolerations[${index}].min_tolerate_percent`)) || "Minimum percentage for adaptive toleration (0-100)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.custom_tolerations[${index}].max_tolerate_percent`}
                                        label="Max Tolerate Percent"
                                        variant="outlined"
                                        type="number"
                                        InputProps={{ inputProps: { min: 0, max: 100 } }}
                                        error={getIn(touched, `brute_force.custom_tolerations[${index}].max_tolerate_percent`) && Boolean(getIn(errors, `brute_force.custom_tolerations[${index}].max_tolerate_percent`))}
                                        helperText={(getIn(touched, `brute_force.custom_tolerations[${index}].max_tolerate_percent`) && getIn(errors, `brute_force.custom_tolerations[${index}].max_tolerate_percent`)) || "Maximum percentage for adaptive toleration (0-100)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.custom_tolerations[${index}].scale_factor`}
                                        label="Scale Factor"
                                        variant="outlined"
                                        type="number"
                                        InputProps={{ inputProps: { min: 0.1, max: 10, step: 0.1 } }}
                                        error={getIn(touched, `brute_force.custom_tolerations[${index}].scale_factor`) && Boolean(getIn(errors, `brute_force.custom_tolerations[${index}].scale_factor`))}
                                        helperText={(getIn(touched, `brute_force.custom_tolerations[${index}].scale_factor`) && getIn(errors, `brute_force.custom_tolerations[${index}].scale_factor`)) || "Scale factor for adaptive toleration (0.1-10)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid display="flex" justifyContent="flex-end" size={12}>
                                      <IconButton 
                                        onClick={() => {
                                          remove(index);
                                          setHasUnsavedChanges(true);
                                        }}
                                        color="error"
                                        aria-label="Remove toleration"
                                      >
                                        <DeleteIcon />
                                      </IconButton>
                                    </Grid>
                                  </Grid>
                                </Paper>
                              ))
                            ) : (
                              <Typography color="textSecondary" sx={{ mb: 2 }}>No custom tolerations added yet.</Typography>
                            )}
                            <Button
                              startIcon={<AddIcon />}
                              variant="outlined"
                              color="primary"
                              onClick={() => {
                                push({
                                  ip_address: '',
                                  tolerate_percent: 0,
                                  tolerate_ttl: '1h',
                                  adaptive_toleration: false,
                                  min_tolerate_percent: 10,
                                  max_tolerate_percent: 50,
                                  scale_factor: 1.0,
                                });
                                setHasUnsavedChanges(true);
                              }}
                            >
                              Add Custom Toleration
                            </Button>
                          </div>
                        )}
                      </FieldArray>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="Buckets">
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        Buckets define rules for detecting brute force attacks based on the number of failed requests within a specific time period.
                      </Typography>
                      <FieldArray name="brute_force.buckets">
                        {({ push, remove }) => (
                          <div>
                            {values.brute_force?.buckets && values.brute_force.buckets.length > 0 ? (
                              values.brute_force.buckets.map((_bucket: any, index: number) => (
                                <Paper key={index} sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
                                  <Grid container spacing={2}>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.buckets[${index}].name`}
                                        label="Name"
                                        variant="outlined"
                                        error={getIn(touched, `brute_force.buckets[${index}].name`) && Boolean(getIn(errors, `brute_force.buckets[${index}].name`))}
                                        helperText={(getIn(touched, `brute_force.buckets[${index}].name`) && getIn(errors, `brute_force.buckets[${index}].name`)) || "Name of the bucket"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.buckets[${index}].period`}
                                        label="Period"
                                        variant="outlined"
                                        error={getIn(touched, `brute_force.buckets[${index}].period`) && Boolean(getIn(errors, `brute_force.buckets[${index}].period`))}
                                        helperText={(getIn(touched, `brute_force.buckets[${index}].period`) && getIn(errors, `brute_force.buckets[${index}].period`)) || "Time period (e.g., 1h, 30m)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.buckets[${index}].cidr`}
                                        label="CIDR"
                                        variant="outlined"
                                        type="number"
                                        InputProps={{ inputProps: { min: 1, max: 128 } }}
                                        error={getIn(touched, `brute_force.buckets[${index}].cidr`) && Boolean(getIn(errors, `brute_force.buckets[${index}].cidr`))}
                                        helperText={(getIn(touched, `brute_force.buckets[${index}].cidr`) && getIn(errors, `brute_force.buckets[${index}].cidr`)) || "CIDR value (1-128)"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Typography variant="subtitle2" sx={{ mb: 1 }}>IP Version</Typography>
                                      <RadioGroup
                                        row
                                        name={`brute_force.buckets[${index}].ip_version`}
                                        value={values.brute_force?.buckets[index]?.ipv4 ? 'ipv4' : 'ipv6'}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          // Set ipv4 to true, and ipv6 to false if ipv4 is selected
                                          // Set ipv4 to false, and ipv6 to true if ipv6 is selected
                                          const isIPv4 = e.target.value === 'ipv4';
                                          setFieldValue(`brute_force.buckets[${index}].ipv4`, isIPv4)
                                              .then(() => setHasUnsavedChanges(true));
                                          setFieldValue(`brute_force.buckets[${index}].ipv6`, !isIPv4)
                                              .then(() => setHasUnsavedChanges(true));
                                        }}
                                      >
                                        <FormControlLabel value="ipv4" control={<Radio />} label="IPv4" />
                                        <FormControlLabel value="ipv6" control={<Radio />} label="IPv6" />
                                      </RadioGroup>
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                      <Field
                                        as={TextField}
                                        fullWidth
                                        name={`brute_force.buckets[${index}].failed_requests`}
                                        label="Failed Requests"
                                        variant="outlined"
                                        type="number"
                                        InputProps={{ inputProps: { min: 1 } }}
                                        error={getIn(touched, `brute_force.buckets[${index}].failed_requests`) && Boolean(getIn(errors, `brute_force.buckets[${index}].failed_requests`))}
                                        helperText={(getIn(touched, `brute_force.buckets[${index}].failed_requests`) && getIn(errors, `brute_force.buckets[${index}].failed_requests`)) || "Number of failed requests threshold"}
                                        onChange={(e: React.ChangeEvent<any>) => {
                                          handleChange(e);
                                          setHasUnsavedChanges(true);
                                        }}
                                      />
                                    </Grid>
                                    <Grid size={12}>
                                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Filter by Protocol</Typography>
                                      <FieldArray name={`brute_force.buckets[${index}].filter_by_protocol`}>
                                        {({ push: pushProtocol, remove: removeProtocol }) => (
                                          <div>
                                            {values.brute_force?.buckets[index]?.filter_by_protocol && Array.isArray(values.brute_force?.buckets[index]?.filter_by_protocol) && values.brute_force?.buckets[index]?.filter_by_protocol!.length > 0 ? (
                                              values.brute_force?.buckets[index]?.filter_by_protocol!.map((_protocol: string, protocolIndex: number) => (
                                                <Box key={protocolIndex} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                  <Field
                                                    as={TextField}
                                                    fullWidth
                                                    name={`brute_force.buckets[${index}].filter_by_protocol[${protocolIndex}]`}
                                                    label={`Protocol ${protocolIndex + 1}`}
                                                    variant="outlined"
                                                    onChange={(e: React.ChangeEvent<any>) => {
                                                      handleChange(e);
                                                      setHasUnsavedChanges(true);
                                                    }}
                                                  />
                                                  <IconButton 
                                                    onClick={() => {
                                                      removeProtocol(protocolIndex);
                                                      setHasUnsavedChanges(true);
                                                    }}
                                                    sx={{ ml: 1 }}
                                                    color="error"
                                                    aria-label="Remove protocol"
                                                  >
                                                    <DeleteIcon />
                                                  </IconButton>
                                                </Box>
                                              ))
                                            ) : (
                                              <Typography color="textSecondary" sx={{ mb: 2 }}>No protocols added yet.</Typography>
                                            )}
                                            <Button
                                              startIcon={<AddIcon />}
                                              variant="outlined"
                                              color="primary"
                                              size="small"
                                              onClick={() => {
                                                pushProtocol('');
                                                setHasUnsavedChanges(true);
                                              }}
                                            >
                                              Add Protocol
                                            </Button>
                                          </div>
                                        )}
                                      </FieldArray>
                                    </Grid>
                                    <Grid size={12}>
                                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Filter by OIDC Client ID</Typography>
                                      <FieldArray name={`brute_force.buckets[${index}].filter_by_oidc_cid`}>
                                        {({ push: pushOIDC, remove: removeOIDC }) => (
                                          <div>
                                            {values.brute_force?.buckets[index]?.filter_by_oidc_cid && Array.isArray(values.brute_force?.buckets[index]?.filter_by_oidc_cid) && values.brute_force?.buckets[index]?.filter_by_oidc_cid!.length > 0 ? (
                                              values.brute_force?.buckets[index]?.filter_by_oidc_cid!.map((_oidc: string, oidcIndex: number) => (
                                                <Box key={oidcIndex} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                  <Field
                                                    as={TextField}
                                                    fullWidth
                                                    name={`brute_force.buckets[${index}].filter_by_oidc_cid[${oidcIndex}]`}
                                                    label={`OIDC Client ID ${oidcIndex + 1}`}
                                                    variant="outlined"
                                                    onChange={(e: React.ChangeEvent<any>) => {
                                                      handleChange(e);
                                                      setHasUnsavedChanges(true);
                                                    }}
                                                  />
                                                  <IconButton 
                                                    onClick={() => {
                                                      removeOIDC(oidcIndex);
                                                      setHasUnsavedChanges(true);
                                                    }}
                                                    sx={{ ml: 1 }}
                                                    color="error"
                                                    aria-label="Remove OIDC Client ID"
                                                  >
                                                    <DeleteIcon />
                                                  </IconButton>
                                                </Box>
                                              ))
                                            ) : (
                                              <Typography color="textSecondary" sx={{ mb: 2 }}>No OIDC Client IDs added yet.</Typography>
                                            )}
                                            <Button
                                              startIcon={<AddIcon />}
                                              variant="outlined"
                                              color="primary"
                                              size="small"
                                              onClick={() => {
                                                pushOIDC('');
                                                setHasUnsavedChanges(true);
                                              }}
                                            >
                                              Add OIDC Client ID
                                            </Button>
                                          </div>
                                        )}
                                      </FieldArray>
                                    </Grid>
                                    <Grid display="flex" justifyContent="flex-end" size={12}>
                                      <IconButton 
                                        onClick={() => {
                                          remove(index);
                                          setHasUnsavedChanges(true);
                                        }}
                                        color="error"
                                        aria-label="Remove bucket"
                                      >
                                        <DeleteIcon />
                                      </IconButton>
                                    </Grid>
                                  </Grid>
                                </Paper>
                              ))
                            ) : (
                              <Typography color="textSecondary" sx={{ mb: 2 }}>No buckets added yet.</Typography>
                            )}
                            <Button
                              startIcon={<AddIcon />}
                              variant="outlined"
                              color="primary"
                              onClick={() => {
                                push({
                                  name: '',
                                  period: '1h',
                                  cidr: 32,
                                  failed_requests: 5,
                                  filter_by_protocol: [],
                                  filter_by_oidc_cid: [],
                                });
                                setHasUnsavedChanges(true);
                              }}
                            >
                              Add Bucket
                            </Button>
                          </div>
                        )}
                      </FieldArray>
                    </CollapsibleFormSection>
                  </Grid>

                </Grid>
              </FormSection>
            </TabPanel>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
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
    </Box>
  );
};

export default FeaturesConfig;
