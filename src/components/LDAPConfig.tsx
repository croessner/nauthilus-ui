import React, { useState, useRef } from 'react';
import { Formik, Form, getIn } from 'formik';
import * as Yup from 'yup';
import {
  TextField,
  Grid,
  Button,
  Box,
  Typography,
  Paper,
  IconButton,
  List,
  ListItem,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  InputAdornment
} from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { LDAPConfig as LDAPConfigType, LDAPSearchProtocolConfig, NauthilusConfig } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import ValidationErrors from './common/ValidationErrors';
import PasswordField from './common/PasswordField';
import ProtocolsConfig from './ProtocolsConfig';

// Validation schema
const LDAPConfigSchema = Yup.object().shape({
  config: Yup.object().shape({
    lookup_pool_size: Yup.number().required('Lookup pool size is required').min(1, 'Must be at least 1'),
    lookup_idle_pool_size: Yup.number().min(0, 'Must be at least 0'),
    auth_pool_size: Yup.number().min(0, 'Must be at least 0'),
    auth_idle_pool_size: Yup.number().min(0, 'Must be at least 0'),
    number_of_workers: Yup.number().min(1, 'Must be at least 1'),
    server_uri: Yup.array().of(Yup.string()).required('At least one server URI is required'),
  }),
  optional_ldap_pools: Yup.object().shape({}).nullable(),
  search: Yup.array().of(
    Yup.object().shape({
      protocol: Yup.array().of(Yup.string()).required('Protocol is required'),
      cache_name: Yup.string().required('Cache name is required'),
      base_dn: Yup.string().required('Base DN is required'),
      filter: Yup.object().shape({
        user: Yup.string(),
        list_accounts: Yup.string(),
        webauthn_credentials: Yup.string(),
      }),
      mapping: Yup.object().shape({
        account_field: Yup.string().required('Account field is required'),
      }),
      attribute: Yup.array().of(Yup.string()).required('At least one attribute is required'),
    })
  ),
});

// LDAP scope options
const scopeOptions = [
  'base',
  'one',
  'sub'
];

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`ldap-tabpanel-${index}`}
      aria-labelledby={`ldap-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const LDAPConfig = (): React.JSX.Element => {
  const { config, updateConfig, hasUnsavedChanges, setHasUnsavedChanges, error } = useConfig();
  const [tabValue, setTabValue] = useState(0);
  const [createPoolDialogOpen, setCreatePoolDialogOpen] = useState(false);
  const [newPoolName, setNewPoolName] = useState('');
  const [formikValues, setFormikValues] = useState<any>(null);
  const formikSetFieldValueRef = useRef<any>(null);

  // Initial values
  const initialValues = {
    config: config?.ldap?.config || {
      pool_only: false,
      start_tls: false,
      tls_skip_verify: false,
      sasl_external: false,
      number_of_workers: 10,
      lookup_pool_size: 10,
      lookup_idle_pool_size: 5,
      auth_pool_size: 10,
      auth_idle_pool_size: 5,
      bind_dn: '',
      bind_pw: '',
      tls_ca_cert: '',
      tls_client_cert: '',
      tls_client_key: '',
      connect_abort_timeout: '10s',
      server_uri: ['ldap://localhost'],
    },
    optional_ldap_pools: config?.ldap?.optional_ldap_pools || {},
    search: config?.ldap?.search || [],
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleSubmit = (values: any) => {
    if (!config) return;

    // Create a properly typed copy of the config
    const updatedConfig: NauthilusConfig = { 
      ...config as NauthilusConfig,
    };

    // Update LDAP configuration
    updatedConfig.ldap = {
      ...(config?.ldap || {}) as LDAPConfigType,
      config: values.config,
      optional_ldap_pools: values.optional_ldap_pools,
      search: values.search,
    };


    updateConfig(updatedConfig)
        .then(() => setHasUnsavedChanges(false))
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        LDAP Configuration
      </Typography>

      {/* Display validation errors at the top of the form */}
      <ValidationErrors error={error} />

      <Formik
        initialValues={initialValues}
        validationSchema={LDAPConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
        onChangeCapture={() => setHasUnsavedChanges(true)}
      >
        {({ values, errors, touched, handleChange, setFieldValue }) => (
          <Form>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange} 
                variant="scrollable"
                scrollButtons="auto"
                aria-label="ldap configuration tabs"
              >
                <Tab label="Main Configuration" id="ldap-tab-0" aria-controls="ldap-tabpanel-0" />
                <Tab label="Optional LDAP Pools" id="ldap-tab-1" aria-controls="ldap-tabpanel-1" />
                <Tab label="Search Protocols" id="ldap-tab-2" aria-controls="ldap-tabpanel-2" />
              </Tabs>
            </Box>

            {/* Main Configuration Tab */}
            <TabPanel value={tabValue} index={0}>
              <Typography variant="body1" gutterBottom sx={{ mb: 2 }}>
                Configure the main LDAP connection settings.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          name="config.pool_only"
                          checked={values.config.pool_only || false}
                          onChange={handleChange}
                        />
                      }
                      label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Pool Only<InfoTooltip title="Use only pooled connections; disables direct binds on demand." /></Box>}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          name="config.start_tls"
                          checked={values.config.start_tls || false}
                          onChange={handleChange}
                        />
                      }
                      label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Start TLS<InfoTooltip title="Upgrade plain LDAP connection to TLS using STARTTLS." /></Box>}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          name="config.tls_skip_verify"
                          checked={values.config.tls_skip_verify || false}
                          onChange={handleChange}
                        />
                      }
                      label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>TLS Skip Verify<InfoTooltip title="Do not verify server certificate. Unsafe; only for testing." /></Box>}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          name="config.sasl_external"
                          checked={values.config.sasl_external || false}
                          onChange={handleChange}
                        />
                      }
                      label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>SASL External<InfoTooltip title="Use SASL EXTERNAL mechanism (e.g., with client TLS certificates)." /></Box>}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Number of Workers"
                      name="config.number_of_workers"
                      type="number"
                      value={values.config.number_of_workers || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.number_of_workers') &&
                        getIn(errors, 'config.number_of_workers')
                      )}
                      helperText={
                        getIn(touched, 'config.number_of_workers') &&
                        getIn(errors, 'config.number_of_workers')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Lookup Pool Size"
                      name="config.lookup_pool_size"
                      type="number"
                      value={values.config.lookup_pool_size || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.lookup_pool_size') &&
                        getIn(errors, 'config.lookup_pool_size')
                      )}
                      helperText={
                        getIn(touched, 'config.lookup_pool_size') &&
                        getIn(errors, 'config.lookup_pool_size')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Lookup Idle Pool Size"
                      name="config.lookup_idle_pool_size"
                      type="number"
                      value={values.config.lookup_idle_pool_size || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.lookup_idle_pool_size') &&
                        getIn(errors, 'config.lookup_idle_pool_size')
                      )}
                      helperText={
                        getIn(touched, 'config.lookup_idle_pool_size') &&
                        getIn(errors, 'config.lookup_idle_pool_size')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Auth Pool Size"
                      name="config.auth_pool_size"
                      type="number"
                      value={values.config.auth_pool_size || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.auth_pool_size') &&
                        getIn(errors, 'config.auth_pool_size')
                      )}
                      helperText={
                        getIn(touched, 'config.auth_pool_size') &&
                        getIn(errors, 'config.auth_pool_size')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Auth Idle Pool Size"
                      name="config.auth_idle_pool_size"
                      type="number"
                      value={values.config.auth_idle_pool_size || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.auth_idle_pool_size') &&
                        getIn(errors, 'config.auth_idle_pool_size')
                      )}
                      helperText={
                        getIn(touched, 'config.auth_idle_pool_size') &&
                        getIn(errors, 'config.auth_idle_pool_size')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Bind DN"
                      name="config.bind_dn"
                      value={values.config.bind_dn || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.bind_dn') &&
                        getIn(errors, 'config.bind_dn')
                      )}
                      helperText={
                        getIn(touched, 'config.bind_dn') &&
                        getIn(errors, 'config.bind_dn')
                      }
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Distinguished Name used for LDAP bind (e.g., cn=admin,dc=example,dc=com)." /></InputAdornment>
                      ) }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <PasswordField
                      fullWidth
                      name="config.bind_pw"
                      label="Bind Password"
                      infoTitle="Password for the bind DN user. Keep it secret."
                      value={values.config.bind_pw || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.bind_pw') &&
                        getIn(errors, 'config.bind_pw')
                      )}
                      helperText={
                        getIn(touched, 'config.bind_pw') &&
                        getIn(errors, 'config.bind_pw')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="TLS CA Certificate"
                      name="config.tls_ca_cert"
                      value={values.config.tls_ca_cert || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.tls_ca_cert') &&
                        getIn(errors, 'config.tls_ca_cert')
                      )}
                      helperText={
                        getIn(touched, 'config.tls_ca_cert') &&
                        getIn(errors, 'config.tls_ca_cert')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="TLS Client Certificate"
                      name="config.tls_client_cert"
                      value={values.config.tls_client_cert || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.tls_client_cert') &&
                        getIn(errors, 'config.tls_client_cert')
                      )}
                      helperText={
                        getIn(touched, 'config.tls_client_cert') &&
                        getIn(errors, 'config.tls_client_cert')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="TLS Client Key"
                      name="config.tls_client_key"
                      value={values.config.tls_client_key || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.tls_client_key') &&
                        getIn(errors, 'config.tls_client_key')
                      )}
                      helperText={
                        getIn(touched, 'config.tls_client_key') &&
                        getIn(errors, 'config.tls_client_key')
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Connect Abort Timeout"
                      name="config.connect_abort_timeout"
                      value={values.config.connect_abort_timeout || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.connect_abort_timeout') &&
                        getIn(errors, 'config.connect_abort_timeout')
                      )}
                      helperText={
                        getIn(touched, 'config.connect_abort_timeout') &&
                        getIn(errors, 'config.connect_abort_timeout')
                      }
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ mb: 2 }}>
                      Server URIs
                    </Typography>
                    <List>
                      {(Array.isArray(values.config.server_uri) ? values.config.server_uri : [values.config.server_uri].filter(Boolean)).map((uri: string, index: number) => (
                        <ListItem key={index} divider={index < (Array.isArray(values.config.server_uri) ? values.config.server_uri : [values.config.server_uri].filter(Boolean)).length - 1}>
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={10}>
                              <TextField
                                fullWidth
                                label={`Server URI ${index + 1}`}
                                name={`config.server_uri[${index}]`}
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="LDAP server URI (e.g., ldap://host:389 or ldaps://host:636)." /></InputAdornment>
                                ) }}
                                value={uri}
                                onChange={handleChange}
                                error={Boolean(
                                  getIn(touched, `config.server_uri[${index}]`) &&
                                  getIn(errors, `config.server_uri[${index}]`)
                                )}
                                helperText={
                                  getIn(touched, `config.server_uri[${index}]`) &&
                                  getIn(errors, `config.server_uri[${index}]`)
                                }
                              />
                            </Grid>
                            <Grid item xs={2}>
                              <IconButton
                                color="error"
                                onClick={() => {
                                  const currentUris = Array.isArray(values.config.server_uri) 
                                    ? values.config.server_uri 
                                    : [values.config.server_uri].filter(Boolean);
                                  const newUris = [...currentUris];
                                  newUris.splice(index, 1);
                                  setFieldValue('config.server_uri', newUris)
                                      .then(() => setHasUnsavedChanges(true));
                                }}
                                disabled={(Array.isArray(values.config.server_uri) ? values.config.server_uri : [values.config.server_uri].filter(Boolean)).length <= 1}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Grid>
                          </Grid>
                        </ListItem>
                      ))}
                    </List>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => {
                          const currentUris = Array.isArray(values.config.server_uri) 
                            ? values.config.server_uri 
                            : [values.config.server_uri].filter(Boolean);
                          setFieldValue('config.server_uri', [
                            ...currentUris,
                            '',
                          ])
                              .then(() => setHasUnsavedChanges(true));
                        }}
                      >
                        Add Server URI
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </TabPanel>

            {/* Optional LDAP Pools Tab */}
            <TabPanel value={tabValue} index={1}>
              <Typography variant="body1" gutterBottom sx={{ mb: 2 }}>
                Configure optional LDAP pools. These allow you to define multiple LDAP backends with different configurations.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom sx={{ mb: 2 }}>
                      Optional LDAP Pools
                    </Typography>

                    {Object.entries(values.optional_ldap_pools).map(([poolName, poolConfig]: [string, any]) => (
                      <Box key={poolName} sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={10}>
                            <TextField
                              fullWidth
                              label="Pool Name"
                              value={poolName}
                              disabled
                            />
                          </Grid>
                          <Grid item xs={2}>
                            <IconButton
                              color="error"
                              onClick={() => {
                                const newPools = { ...values.optional_ldap_pools };
                                delete newPools[poolName];
                                setFieldValue('optional_ldap_pools', newPools)
                                    .then(() => setHasUnsavedChanges(true));
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>

                        <Grid container spacing={3} sx={{ mt: 1 }}>
                          <Grid item xs={12} md={6}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name={`optional_ldap_pools.${poolName}.pool_only`}
                                  checked={poolConfig.pool_only || false}
                                  onChange={handleChange}
                                />
                              }
                              label="Pool Only"
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name={`optional_ldap_pools.${poolName}.start_tls`}
                                  checked={poolConfig.start_tls || false}
                                  onChange={handleChange}
                                />
                              }
                              label="Start TLS"
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name={`optional_ldap_pools.${poolName}.tls_skip_verify`}
                                  checked={poolConfig.tls_skip_verify || false}
                                  onChange={handleChange}
                                />
                              }
                              label="TLS Skip Verify"
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <FormControlLabel
                              control={
                                <Switch
                                  name={`optional_ldap_pools.${poolName}.sasl_external`}
                                  checked={poolConfig.sasl_external || false}
                                  onChange={handleChange}
                                />
                              }
                              label="SASL External"
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Number of Workers"
                              name={`optional_ldap_pools.${poolName}.number_of_workers`}
                              type="number"
                              value={poolConfig.number_of_workers || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Lookup Pool Size"
                              name={`optional_ldap_pools.${poolName}.lookup_pool_size`}
                              type="number"
                              value={poolConfig.lookup_pool_size || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Lookup Idle Pool Size"
                              name={`optional_ldap_pools.${poolName}.lookup_idle_pool_size`}
                              type="number"
                              value={poolConfig.lookup_idle_pool_size || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Auth Pool Size"
                              name={`optional_ldap_pools.${poolName}.auth_pool_size`}
                              type="number"
                              value={poolConfig.auth_pool_size || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Auth Idle Pool Size"
                              name={`optional_ldap_pools.${poolName}.auth_idle_pool_size`}
                              type="number"
                              value={poolConfig.auth_idle_pool_size || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Bind DN"
                              name={`optional_ldap_pools.${poolName}.bind_dn`}
                              value={poolConfig.bind_dn || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <PasswordField
                              fullWidth
                              name={`optional_ldap_pools.${poolName}.bind_pw`}
                              label="Bind Password"
                              value={poolConfig.bind_pw || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="TLS CA Certificate"
                              name={`optional_ldap_pools.${poolName}.tls_ca_cert`}
                              value={poolConfig.tls_ca_cert || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="TLS Client Certificate"
                              name={`optional_ldap_pools.${poolName}.tls_client_cert`}
                              value={poolConfig.tls_client_cert || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="TLS Client Key"
                              name={`optional_ldap_pools.${poolName}.tls_client_key`}
                              value={poolConfig.tls_client_key || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Connect Abort Timeout"
                              name={`optional_ldap_pools.${poolName}.connect_abort_timeout`}
                              value={poolConfig.connect_abort_timeout || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
                              Server URIs
                            </Typography>
                            <List>
                              {(Array.isArray(poolConfig.server_uri) ? poolConfig.server_uri : [poolConfig.server_uri].filter(Boolean)).map((uri: string, uriIndex: number) => (
                                <ListItem key={uriIndex} divider={uriIndex < (Array.isArray(poolConfig.server_uri) ? poolConfig.server_uri : [poolConfig.server_uri].filter(Boolean)).length - 1}>
                                  <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={10}>
                                      <TextField
                                        fullWidth
                                        label={`Server URI ${uriIndex + 1}`}
                                        name={`optional_ldap_pools.${poolName}.server_uri[${uriIndex}]`}
                                        value={uri}
                                        onChange={handleChange}
                                      />
                                    </Grid>
                                    <Grid item xs={2}>
                                      <IconButton
                                        color="error"
                                        onClick={() => {
                                          const currentUris = Array.isArray(poolConfig.server_uri) 
                                            ? poolConfig.server_uri 
                                            : [poolConfig.server_uri].filter(Boolean);
                                          const newUris = [...currentUris];
                                          newUris.splice(uriIndex, 1);
                                          setFieldValue(`optional_ldap_pools.${poolName}.server_uri`, newUris)
                                              .then(() => setHasUnsavedChanges(true));
                                        }}
                                        disabled={(Array.isArray(poolConfig.server_uri) ? poolConfig.server_uri : [poolConfig.server_uri].filter(Boolean)).length <= 1}
                                      >
                                        <DeleteIcon />
                                      </IconButton>
                                    </Grid>
                                  </Grid>
                                </ListItem>
                              ))}
                            </List>
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                              <Button
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={() => {
                                  const currentUris = Array.isArray(poolConfig.server_uri) 
                                    ? poolConfig.server_uri 
                                    : [poolConfig.server_uri].filter(Boolean);
                                  setFieldValue(`optional_ldap_pools.${poolName}.server_uri`, [
                                    ...currentUris,
                                    '',
                                  ])
                                      .then(() => setHasUnsavedChanges(true));
                                }}
                              >
                                Add Server URI
                              </Button>
                            </Box>
                          </Grid>
                        </Grid>
                      </Box>
                    ))}

                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => {
                          setNewPoolName('');
                          setFormikValues(values);
                          formikSetFieldValueRef.current = setFieldValue;
                          setCreatePoolDialogOpen(true);
                        }}
                      >
                        Add Optional Pool
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </TabPanel>

            {/* Search Protocols Tab */}
            <TabPanel value={tabValue} index={2}>
              <Typography variant="body1" gutterBottom sx={{ mb: 2 }}>
                Configure LDAP search protocols. These define which protocols can be authenticated using LDAP.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <List>
                  {values.search.map((searchProtocol: LDAPSearchProtocolConfig, index: number) => (
                    <ListItem key={index} divider={index < values.search.length - 1}>
                      <Box sx={{ width: '100%', mb: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={10}>
                            <Typography variant="subtitle1" sx={{ mb: 1 }}>Search Protocol {index + 1}</Typography>
                          </Grid>
                          <Grid item xs={2}>
                            <IconButton
                              color="error"
                              onClick={() => {
                                const newSearch = [...values.search];
                                newSearch.splice(index, 1);
                                setFieldValue('search', newSearch)
                                    .then(() => setHasUnsavedChanges(true));
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>

                        <Grid container spacing={2} sx={{ mt: 1 }}>
                          <Grid item xs={12} md={6}>
                            <ProtocolsConfig
                              index={index}
                              protocol={searchProtocol.protocol}
                              setFieldValue={setFieldValue}
                              touched={touched}
                              errors={errors}
                              setHasUnsavedChanges={setHasUnsavedChanges}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Cache Name"
                              name={`search[${index}].cache_name`}
                              value={searchProtocol.cache_name || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].cache_name`) &&
                                getIn(errors, `search[${index}].cache_name`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].cache_name`) &&
                                getIn(errors, `search[${index}].cache_name`)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Pool Name (optional)"
                              name={`search[${index}].pool_name`}
                              value={searchProtocol.pool_name || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].pool_name`) &&
                                getIn(errors, `search[${index}].pool_name`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].pool_name`) &&
                                getIn(errors, `search[${index}].pool_name`)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Base DN"
                              name={`search[${index}].base_dn`}
                              value={searchProtocol.base_dn || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].base_dn`) &&
                                getIn(errors, `search[${index}].base_dn`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].base_dn`) &&
                                getIn(errors, `search[${index}].base_dn`)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                              <InputLabel id={`search-scope-label-${index}`}>Scope</InputLabel>
                              <Select
                                labelId={`search-scope-label-${index}`}
                                id={`search-scope-${index}`}
                                name={`search[${index}].scope`}
                                value={searchProtocol.scope || 'sub'}
                                label="Scope"
                                onChange={handleChange}
                              >
                                {scopeOptions.map((scope) => (
                                  <MenuItem key={scope} value={scope}>
                                    {scope}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Attributes (comma-separated)"
                              name={`search[${index}].attribute`}
                              value={searchProtocol.attribute ? (Array.isArray(searchProtocol.attribute) ? searchProtocol.attribute.join(',') : searchProtocol.attribute) : ''}
                              onChange={(e) => {
                                const attributes = e.target.value.split(',').map(attr => attr.trim()).filter(attr => attr);
                                setFieldValue(`search[${index}].attribute`, attributes)
                                    .then(() => setHasUnsavedChanges(true));
                              }}
                              error={Boolean(
                                getIn(touched, `search[${index}].attribute`) &&
                                getIn(errors, `search[${index}].attribute`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].attribute`) &&
                                getIn(errors, `search[${index}].attribute`)
                              }
                            />
                          </Grid>
                        </Grid>

                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 2 }}>Filters</Typography>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="User Filter"
                              name={`search[${index}].filter.user`}
                              value={searchProtocol.filter?.user || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].filter.user`) &&
                                getIn(errors, `search[${index}].filter.user`)
                              )}
                              helperText={
                                (getIn(touched, `search[${index}].filter.user`) &&
                                getIn(errors, `search[${index}].filter.user`)) ||
                                "Available macros: %s (username), %{user}, %{username}, %{domain}, %{service}, %{local_ip}, %{local_port}, %{remote_ip}, %{remote_port}, %{totp_secret}. Modifiers: %L{...} (lowercase), %U{...} (uppercase)"
                              }
                              multiline
                              rows={3}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="List Accounts Filter"
                              name={`search[${index}].filter.list_accounts`}
                              value={searchProtocol.filter?.list_accounts || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].filter.list_accounts`) &&
                                getIn(errors, `search[${index}].filter.list_accounts`)
                              )}
                              helperText={
                                (getIn(touched, `search[${index}].filter.list_accounts`) &&
                                getIn(errors, `search[${index}].filter.list_accounts`)) ||
                                "Available macros: %s (username), %{user}, %{username}, %{domain}, %{service}, %{local_ip}, %{local_port}, %{remote_ip}, %{remote_port}, %{totp_secret}. Modifiers: %L{...} (lowercase), %U{...} (uppercase)"
                              }
                              multiline
                              rows={3}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="WebAuthn Credentials Filter"
                              name={`search[${index}].filter.webauthn_credentials`}
                              value={searchProtocol.filter?.webauthn_credentials || ''}
                              onChange={handleChange}
                              disabled
                              error={Boolean(
                                getIn(touched, `search[${index}].filter.webauthn_credentials`) &&
                                getIn(errors, `search[${index}].filter.webauthn_credentials`)
                              )}
                              helperText="This feature is not implemented yet."
                              multiline
                              rows={3}
                            />
                          </Grid>
                        </Grid>

                        <Typography variant="subtitle2" sx={{ mt: 2, mb: 2 }}>Attribute Mapping</Typography>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Account Field"
                              name={`search[${index}].mapping.account_field`}
                              value={searchProtocol.mapping?.account_field || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.account_field`) &&
                                getIn(errors, `search[${index}].mapping.account_field`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].mapping.account_field`) &&
                                getIn(errors, `search[${index}].mapping.account_field`)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="TOTP Secret Field"
                              name={`search[${index}].mapping.totp_secret_field`}
                              value={searchProtocol.mapping?.totp_secret_field || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.totp_secret_field`) &&
                                getIn(errors, `search[${index}].mapping.totp_secret_field`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].mapping.totp_secret_field`) &&
                                getIn(errors, `search[${index}].mapping.totp_secret_field`)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="TOTP Recovery Field"
                              name={`search[${index}].mapping.totp_recovery_field`}
                              value={searchProtocol.mapping?.totp_recovery_field || ''}
                              onChange={handleChange}
                              disabled
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.totp_recovery_field`) &&
                                getIn(errors, `search[${index}].mapping.totp_recovery_field`)
                              )}
                              helperText="This feature is not implemented yet."
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Display Name Field"
                              name={`search[${index}].mapping.display_name_field`}
                              value={searchProtocol.mapping?.display_name_field || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.display_name_field`) &&
                                getIn(errors, `search[${index}].mapping.display_name_field`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].mapping.display_name_field`) &&
                                getIn(errors, `search[${index}].mapping.display_name_field`)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Credential Object"
                              name={`search[${index}].mapping.credential_object`}
                              value={searchProtocol.mapping?.credential_object || ''}
                              onChange={handleChange}
                              disabled
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.credential_object`) &&
                                getIn(errors, `search[${index}].mapping.credential_object`)
                              )}
                              helperText="This feature is not implemented yet."
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Credential ID Field"
                              name={`search[${index}].mapping.credential_id_field`}
                              value={searchProtocol.mapping?.credential_id_field || ''}
                              onChange={handleChange}
                              disabled
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.credential_id_field`) &&
                                getIn(errors, `search[${index}].mapping.credential_id_field`)
                              )}
                              helperText="This feature is not implemented yet."
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Public Key Field"
                              name={`search[${index}].mapping.public_key_field`}
                              value={searchProtocol.mapping?.public_key_field || ''}
                              onChange={handleChange}
                              disabled
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.public_key_field`) &&
                                getIn(errors, `search[${index}].mapping.public_key_field`)
                              )}
                              helperText="This feature is not implemented yet."
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Unique User ID Field"
                              name={`search[${index}].mapping.unique_user_id_field`}
                              value={searchProtocol.mapping?.unique_user_id_field || ''}
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.unique_user_id_field`) &&
                                getIn(errors, `search[${index}].mapping.unique_user_id_field`)
                              )}
                              helperText={
                                getIn(touched, `search[${index}].mapping.unique_user_id_field`) &&
                                getIn(errors, `search[${index}].mapping.unique_user_id_field`)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="AAGUID Field"
                              name={`search[${index}].mapping.aaguid_field`}
                              value={searchProtocol.mapping?.aaguid_field || ''}
                              onChange={handleChange}
                              disabled
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.aaguid_field`) &&
                                getIn(errors, `search[${index}].mapping.aaguid_field`)
                              )}
                              helperText="This feature is not implemented yet."
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Sign Count Field"
                              name={`search[${index}].mapping.sign_count_field`}
                              value={searchProtocol.mapping?.sign_count_field || ''}
                              onChange={handleChange}
                              disabled
                              error={Boolean(
                                getIn(touched, `search[${index}].mapping.sign_count_field`) &&
                                getIn(errors, `search[${index}].mapping.sign_count_field`)
                              )}
                              helperText="This feature is not implemented yet."
                            />
                          </Grid>
                        </Grid>
                      </Box>
                    </ListItem>
                  ))}
                </List>

                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setFieldValue('search', [
                        ...values.search,
                        {
                          protocol: [],
                          cache_name: '',
                          pool_name: '',
                          base_dn: '',
                          scope: 'sub',
                          filter: {
                            user: '',
                            list_accounts: '',
                            webauthn_credentials: '',
                          },
                          mapping: {
                            account_field: '',
                            totp_secret_field: '',
                            totp_recovery_field: '',
                            display_name_field: '',
                            credential_object: '',
                            credential_id_field: '',
                            public_key_field: '',
                            unique_user_id_field: '',
                            aaguid_field: '',
                            sign_count_field: '',
                          },
                          attribute: [],
                        },
                      ])
                          .then(() => setHasUnsavedChanges(true));
                    }}
                  >
                    Add Search Protocol
                  </Button>
                </Box>
              </Paper>
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

      {/* Create Pool Dialog */}
      <Dialog
        open={createPoolDialogOpen}
        onClose={() => setCreatePoolDialogOpen(false)}
      >
        <DialogTitle>Create New LDAP Pool</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter a name for the new LDAP pool.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="pool-name"
            label="Pool Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newPoolName}
            onChange={(e) => setNewPoolName(e.target.value)}
            error={newPoolName === 'default'}
            helperText={newPoolName === 'default' ? 'Pool name cannot be "default"' : ''}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatePoolDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              if (newPoolName && newPoolName.trim() !== '' && newPoolName !== 'default' && formikValues && formikSetFieldValueRef.current) {
                const newPools = { ...formikValues.optional_ldap_pools };
                newPools[newPoolName] = {
                  pool_only: false,
                  start_tls: false,
                  tls_skip_verify: false,
                  sasl_external: false,
                  number_of_workers: 10,
                  lookup_pool_size: 10,
                  lookup_idle_pool_size: 5,
                  auth_pool_size: 10,
                  auth_idle_pool_size: 5,
                  bind_dn: '',
                  bind_pw: '',
                  tls_ca_cert: '',
                  tls_client_cert: '',
                  tls_client_key: '',
                  connect_abort_timeout: '10s',
                  server_uri: ['ldap://localhost'],
                };
                formikSetFieldValueRef.current('optional_ldap_pools', newPools);
                setHasUnsavedChanges(true);
                setCreatePoolDialogOpen(false);
              }
            }}
            color="primary"
            disabled={!newPoolName || newPoolName.trim() === '' || newPoolName === 'default'}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LDAPConfig;
