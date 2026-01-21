import React, { useState, useRef } from 'react';
import { Formik, Form, getIn } from 'formik';
import * as Yup from 'yup';
import { TextField, Button, Box, Typography, Paper, IconButton, List, ListItem, FormControl, InputLabel, Select, MenuItem, Tabs, Tab, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, InputAdornment, FormControlLabel, Checkbox } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { LuaFeatureConfig, LuaFilterConfig, LuaActionConfig, LuaCustomHookConfig, LuaSearchProtocolConfig, LuaConfig as LuaConfigType, NauthilusConfig } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import ValidationErrors from './common/ValidationErrors';
import ProtocolsConfig from './ProtocolsConfig';
import InfoTooltip from './common/InfoTooltip';
import Grid from '@mui/material/Grid';
import CollapsibleFormSection from './common/CollapsibleFormSection';

// Validation schema
const LuaConfigSchema = Yup.object().shape({
  features: Yup.array().of(
    Yup.object().shape({
      name: Yup.string().required('Feature name is required'),
      script_path: Yup.string().required('Script path is required'),
      when_no_auth: Yup.boolean(),
    })
  ),
  filters: Yup.array().of(
    Yup.object().shape({
      name: Yup.string().required('Filter name is required'),
      script_path: Yup.string().required('Script path is required'),
    })
  ),
  actions: Yup.array().of(
    Yup.object().shape({
      type: Yup.string().required('Action type is required'),
      name: Yup.string().required('Action name is required'),
      script_path: Yup.string().required('Script path is required'),
    })
  ),
  custom_hooks: Yup.array().of(
    Yup.object().shape({
      http_location: Yup.string().required('HTTP location is required'),
      http_method: Yup.string().required('HTTP method is required'),
      script_path: Yup.string().required('Script path is required'),
      roles: Yup.array().of(Yup.string()),
    })
  ),
  search: Yup.array().of(
    Yup.object().shape({
      protocol: Yup.array().of(Yup.string()).required('Protocol is required'),
      cache_name: Yup.string().required('Cache name is required'),
      backend_name: Yup.string(),
    })
  ),
  config: Yup.object().shape({
    number_of_workers: Yup.number().min(1, 'Must be at least 1'),
    package_path: Yup.string(),
    backend_script_path: Yup.string(),
    init_script_path: Yup.string(),
    init_script_paths: Yup.array().of(Yup.string()),
    // Tuning fields (optional)
    backend_number_of_workers: Yup.number().min(0),
    action_number_of_workers: Yup.number().min(0),
    queue_length: Yup.number().min(0),
    feature_vm_pool_size: Yup.number().min(0),
    filter_vm_pool_size: Yup.number().min(0),
    hook_vm_pool_size: Yup.number().min(0),
    // IP Scoping
    ip_scoping_v6_cidr: Yup.number().min(0).max(128),
    ip_scoping_v4_cidr: Yup.number().min(0).max(32),
  }),
  optional_lua_backends: Yup.object().shape({}).nullable(),
});

// Action types
const actionTypes = [
  'brute_force',
  'rbl',
  'tls_encryption',
  'relay_domains',
  'lua',
  'post'
];

// HTTP methods
const httpMethods = [
  'HEAD',
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH'
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
      id={`lua-tabpanel-${index}`}
      aria-labelledby={`lua-tab-${index}`}
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

const LuaConfig = (): React.JSX.Element => {
  const { config, updateConfig, hasUnsavedChanges, setHasUnsavedChanges, error } = useConfig();
  const [tabValue, setTabValue] = useState(0);
  const [createBackendDialogOpen, setCreateBackendDialogOpen] = useState(false);
  const [newBackendName, setNewBackendName] = useState('');
  const [formikValues, setFormikValues] = useState<any>(null);
  const formikSetFieldValueRef = useRef<any>(null);

  // Initial values
  const initialValues = {
    features: (config?.lua?.features || []).map((f: LuaFeatureConfig) => ({
      ...f,
      when_no_auth: f.when_no_auth || false,
    })),
    filters: (config?.lua?.filters || []).map((f: any) => {
      const wa = (f as any).when_authenticated;
      const wu = (f as any).when_unauthenticated;
      const wn = (f as any).when_no_auth;
      if (wa === undefined && wu === undefined && wn === undefined) {
        return { ...f, when_authenticated: true, when_unauthenticated: true, when_no_auth: false };
      }
      return f;
    }),
    actions: config?.lua?.actions || [],
    custom_hooks: config?.lua?.custom_hooks || [],
    search: config?.lua?.search || [],
    config: config?.lua?.config || {
      number_of_workers: 10,
      package_path: '',
      backend_script_path: '',
      init_script_path: '',
      init_script_paths: [],
      backend_number_of_workers: undefined,
      action_number_of_workers: undefined,
      queue_length: undefined,
      feature_vm_pool_size: undefined,
      filter_vm_pool_size: undefined,
      hook_vm_pool_size: undefined,
      ip_scoping_v6_cidr: 0,
      ip_scoping_v4_cidr: 0,
    },
    optional_lua_backends: config?.lua?.optional_lua_backends || {},
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

    // Update lua configuration
    updatedConfig.lua = {
      ...(config?.lua || {}) as LuaConfigType,
      features: values.features,
      filters: values.filters,
      actions: values.actions,
      custom_hooks: values.custom_hooks,
      search: values.search,
      config: values.config,
      optional_lua_backends: values.optional_lua_backends,
    };


    updateConfig(updatedConfig)
        .then(() => setHasUnsavedChanges(false))
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Lua Configuration
      </Typography>

      {/* Display validation errors at the top of the form */}
      <ValidationErrors error={error} />

      <Formik
        initialValues={initialValues}
        validationSchema={LuaConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
        onChangeCapture={() => setHasUnsavedChanges(true)}
      >
        {({ values, errors, touched, handleChange, setFieldValue }) => (
          <Form>
            <Paper sx={{ mb: 3 }}>
              <Tabs 
                value={tabValue} 
                onChange={handleTabChange} 
                variant="scrollable"
                scrollButtons="auto"
                aria-label="lua configuration tabs"
              >
                <Tab label="Features" id="lua-tab-0" aria-controls="lua-tabpanel-0" />
                <Tab label="Filters" id="lua-tab-1" aria-controls="lua-tabpanel-1" />
                <Tab label="Actions" id="lua-tab-2" aria-controls="lua-tabpanel-2" />
                <Tab label="Custom Hooks" id="lua-tab-3" aria-controls="lua-tabpanel-3" />
                <Tab label="Search Protocols" id="lua-tab-4" aria-controls="lua-tabpanel-4" />
                <Tab label="Optional Backends" id="lua-tab-5" aria-controls="lua-tabpanel-5" />
                <Tab label="Config" id="lua-tab-6" aria-controls="lua-tabpanel-6" />
              </Tabs>
            </Paper>

            {/* Features Tab */}
            <TabPanel value={tabValue} index={0}>
              <Typography variant="body1" gutterBottom>
                Configure Lua features. These are scripts that run before the authentication process.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <List>
                  {values.features.map((feature: LuaFeatureConfig, index: number) => (
                    <ListItem key={index} divider={index < values.features.length - 1} sx={{ py: 2 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid size={5}>
                          <TextField
                            fullWidth
                            label="Feature Name"
                            name={`features[${index}].name`}
                            value={feature.name}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `features[${index}].name`) &&
                              getIn(errors, `features[${index}].name`)
                            )}
                            helperText={
                              getIn(touched, `features[${index}].name`) &&
                              getIn(errors, `features[${index}].name`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Human-readable name shown in the UI for this feature." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={5}>
                          <TextField
                            fullWidth
                            label="Script Path"
                            name={`features[${index}].script_path`}
                            value={feature.script_path}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `features[${index}].script_path`) &&
                              getIn(errors, `features[${index}].script_path`)
                            )}
                            helperText={
                              getIn(touched, `features[${index}].script_path`) &&
                              getIn(errors, `features[${index}].script_path`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Path to the Lua script file. Relative or absolute path supported." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={2}>
                          <IconButton
                            color="error"
                            onClick={() => {
                              const newFeatures = [...values.features];
                              newFeatures.splice(index, 1);
                              setFieldValue('features', newFeatures)
                                  .then(() => setHasUnsavedChanges(true));
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Grid>
                        <Grid size={12}>
                          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  name={`features[${index}].when_no_auth`}
                                  checked={Boolean(feature.when_no_auth)}
                                  onChange={handleChange}
                                />
                              }
                              label="When No Auth"
                            />
                          </Box>
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
                      setFieldValue('features', [
                        ...values.features,
                        { name: '', script_path: '', when_no_auth: false },
                      ])
                          .then(() => setHasUnsavedChanges(true));
                    }}
                  >
                    Add Feature
                  </Button>
                </Box>
              </Paper>
            </TabPanel>

            {/* Filters Tab */}
            <TabPanel value={tabValue} index={1}>
              <Typography variant="body1" gutterBottom>
                Configure Lua filters. Filters run after all backends have completed their work and can override the existing result of an authentication request.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <List>
                  {values.filters.map((filter: LuaFilterConfig, index: number) => (
                    <ListItem key={index} divider={index < values.filters.length - 1} sx={{ py: 2 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid size={5}>
                          <TextField
                            fullWidth
                            label="Filter Name"
                            name={`filters[${index}].name`}
                            value={filter.name}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `filters[${index}].name`) &&
                              getIn(errors, `filters[${index}].name`)
                            )}
                            helperText={
                              getIn(touched, `filters[${index}].name`) &&
                              getIn(errors, `filters[${index}].name`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Name of the filter step applied after backends complete." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={5}>
                          <TextField
                            fullWidth
                            label="Script Path"
                            name={`filters[${index}].script_path`}
                            value={filter.script_path}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `filters[${index}].script_path`) &&
                              getIn(errors, `filters[${index}].script_path`)
                            )}
                            helperText={
                              getIn(touched, `filters[${index}].script_path`) &&
                              getIn(errors, `filters[${index}].script_path`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Path to the Lua script implementing this filter." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={2}>
                          <IconButton
                            color="error"
                            onClick={() => {
                              const newFilters = [...values.filters];
                              newFilters.splice(index, 1);
                              setFieldValue('filters', newFilters)
                                  .then(() => setHasUnsavedChanges(true));
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Grid>
                        <Grid size={12}>
                          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  name={`filters[${index}].when_authenticated`}
                                  checked={Boolean(filter.when_authenticated)}
                                  onChange={handleChange}
                                />
                              }
                              label="When Authenticated"
                            />
                            <FormControlLabel
                              control={
                                <Checkbox
                                  name={`filters[${index}].when_unauthenticated`}
                                  checked={Boolean(filter.when_unauthenticated)}
                                  onChange={handleChange}
                                />
                              }
                              label="When Unauthenticated"
                            />
                            <FormControlLabel
                              control={
                                <Checkbox
                                  name={`filters[${index}].when_no_auth`}
                                  checked={Boolean(filter.when_no_auth)}
                                  onChange={handleChange}
                                />
                              }
                              label="When No Auth"
                            />
                          </Box>
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
                      setFieldValue('filters', [
                        ...values.filters,
                        { name: '', script_path: '', when_authenticated: true, when_unauthenticated: true, when_no_auth: false },
                      ])
                          .then(() => setHasUnsavedChanges(true));
                    }}
                  >
                    Add Filter
                  </Button>
                </Box>
              </Paper>
            </TabPanel>

            {/* Actions Tab */}
            <TabPanel value={tabValue} index={2}>
              <Typography variant="body1" gutterBottom>
                Configure Lua actions. Actions have a type and script path element for each Lua script. An incoming request is waiting for all actions to be completed except of post actions.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <List>
                  {values.actions.map((action: LuaActionConfig, index: number) => (
                    <ListItem key={index} divider={index < values.actions.length - 1} sx={{ py: 2 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid size={3}>
                          <FormControl fullWidth>
                            <InputLabel id={`actions-type-label-${index}`}>Action Type</InputLabel>
                            <Select
                              labelId={`actions-type-label-${index}`}
                              id={`actions-type-${index}`}
                              name={`actions[${index}].type`}
                              value={action.type}
                              label="Action Type"
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `actions[${index}].type`) &&
                                getIn(errors, `actions[${index}].type`)
                              )}
                            >
                              {actionTypes.map((type) => (
                                <MenuItem key={type} value={type}>
                                  {type}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={3}>
                          <TextField
                            fullWidth
                            label="Action Name"
                            name={`actions[${index}].name`}
                            value={action.name}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `actions[${index}].name`) &&
                              getIn(errors, `actions[${index}].name`)
                            )}
                            helperText={
                              getIn(touched, `actions[${index}].name`) &&
                              getIn(errors, `actions[${index}].name`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Identifier for this action; used to distinguish between actions." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={4}>
                          <TextField
                            fullWidth
                            label="Script Path"
                            name={`actions[${index}].script_path`}
                            value={action.script_path}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `actions[${index}].script_path`) &&
                              getIn(errors, `actions[${index}].script_path`)
                            )}
                            helperText={
                              getIn(touched, `actions[${index}].script_path`) &&
                              getIn(errors, `actions[${index}].script_path`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Lua script executed for this action. Post actions run after response is sent." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={2}>
                          <IconButton
                            color="error"
                            onClick={() => {
                              const newActions = [...values.actions];
                              newActions.splice(index, 1);
                              setFieldValue('actions', newActions)
                                  .then(() => setHasUnsavedChanges(true));
                            }}
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
                      setFieldValue('actions', [
                        ...values.actions,
                        { type: '', name: '', script_path: '' },
                      ])
                          .then(() => setHasUnsavedChanges(true));
                    }}
                  >
                    Add Action
                  </Button>
                </Box>
              </Paper>
            </TabPanel>

            {/* Custom Hooks Tab */}
            <TabPanel value={tabValue} index={3}>
              <Typography variant="body1" gutterBottom>
                Configure Lua custom hooks. Custom hooks allow you to define HTTP endpoints that execute Lua scripts.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <List>
                  {values.custom_hooks.map((hook: LuaCustomHookConfig, index: number) => (
                    <ListItem key={index} divider={index < values.custom_hooks.length - 1} sx={{ py: 2 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid size={2}>
                          <TextField
                            fullWidth
                            label="HTTP Location"
                            name={`custom_hooks[${index}].http_location`}
                            value={hook.http_location}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `custom_hooks[${index}].http_location`) &&
                              getIn(errors, `custom_hooks[${index}].http_location`)
                            )}
                            helperText={
                              getIn(touched, `custom_hooks[${index}].http_location`) &&
                              getIn(errors, `custom_hooks[${index}].http_location`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="URL path where this hook is exposed (e.g., /api/my-hook)." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={2}>
                          <FormControl fullWidth>
                            <InputLabel id={`custom-hooks-method-label-${index}`}>HTTP Method</InputLabel>
                            <Select
                              labelId={`custom-hooks-method-label-${index}`}
                              id={`custom-hooks-method-${index}`}
                              name={`custom_hooks[${index}].http_method`}
                              value={hook.http_method}
                              label="HTTP Method"
                              onChange={handleChange}
                              error={Boolean(
                                getIn(touched, `custom_hooks[${index}].http_method`) &&
                                getIn(errors, `custom_hooks[${index}].http_method`)
                              )}
                            >
                              {httpMethods.map((method) => (
                                <MenuItem key={method} value={method}>
                                  {method}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={4}>
                          <TextField
                            fullWidth
                            label="Script Path"
                            name={`custom_hooks[${index}].script_path`}
                            value={hook.script_path}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `custom_hooks[${index}].script_path`) &&
                              getIn(errors, `custom_hooks[${index}].script_path`)
                            )}
                            helperText={
                              getIn(touched, `custom_hooks[${index}].script_path`) &&
                              getIn(errors, `custom_hooks[${index}].script_path`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Lua script executed when this HTTP hook is called." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={2}>
                          <TextField
                            fullWidth
                            label="Roles (comma-separated)"
                            name={`custom_hooks[${index}].roles`}
                            value={hook.roles ? (Array.isArray(hook.roles) ? hook.roles.join(',') : hook.roles) : ''}
                            onChange={(e) => {
                              const roles = e.target.value.split(',').map(role => role.trim()).filter(role => role);
                              setFieldValue(`custom_hooks[${index}].roles`, roles)
                                  .then(() => setHasUnsavedChanges(true));
                            }}
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="List of roles allowed to access this hook (e.g., admin,user)." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={2}>
                          <IconButton
                            color="error"
                            onClick={() => {
                              const newHooks = [...values.custom_hooks];
                              newHooks.splice(index, 1);
                              setFieldValue('custom_hooks', newHooks)
                                  .then(() => setHasUnsavedChanges(true));
                            }}
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
                      setFieldValue('custom_hooks', [
                        ...values.custom_hooks,
                        { http_location: '', http_method: 'GET', script_path: '', roles: [] },
                      ])
                          .then(() => setHasUnsavedChanges(true));
                    }}
                  >
                    Add Custom Hook
                  </Button>
                </Box>
              </Paper>
            </TabPanel>

            {/* Search Protocols Tab */}
            <TabPanel value={tabValue} index={4}>
              <Typography variant="body1" gutterBottom>
                Configure Lua search protocols. These define which protocols can be authenticated using Lua scripts.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <List>
                  {values.search.map((searchProtocol: LuaSearchProtocolConfig, index: number) => (
                    <ListItem key={index} divider={index < values.search.length - 1} sx={{ py: 2 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid size={4}>
                          <ProtocolsConfig
                            index={index}
                            protocol={searchProtocol.protocol}
                            setFieldValue={setFieldValue}
                            touched={touched}
                            errors={errors}
                            setHasUnsavedChanges={setHasUnsavedChanges}
                          />
                        </Grid>
                        <Grid size={3}>
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
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Name of the cache used to speed up lookups for this protocol." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={3}>
                          <TextField
                            fullWidth
                            label="Backend Name (optional)"
                            name={`search[${index}].backend_name`}
                            value={searchProtocol.backend_name || ''}
                            onChange={handleChange}
                            error={Boolean(
                              getIn(touched, `search[${index}].backend_name`) &&
                              getIn(errors, `search[${index}].backend_name`)
                            )}
                            helperText={
                              getIn(touched, `search[${index}].backend_name`) &&
                              getIn(errors, `search[${index}].backend_name`)
                            }
                            InputProps={{ endAdornment: (
                              <InputAdornment position="end"><InfoTooltip title="Optional backend to route this search to. Leave empty for default behavior." /></InputAdornment>
                            ) }}
                          />
                        </Grid>
                        <Grid size={2}>
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
                        { protocol: [], cache_name: '', backend_name: '' },
                      ])
                          .then(() => setHasUnsavedChanges(true));
                    }}
                  >
                    Add Search Protocol
                  </Button>
                </Box>
              </Paper>
            </TabPanel>

            {/* Optional Backends Tab */}
            <TabPanel value={tabValue} index={5}>
              <Typography variant="body1" gutterBottom>
                Configure optional Lua backends. These allow you to define multiple Lua backends with different configurations.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <Typography variant="subtitle1" gutterBottom>
                      Optional Lua Backends
                    </Typography>

                    {Object.entries(values.optional_lua_backends).map(([backendName, backendConfig]: [string, any]) => (
                      <Box key={backendName} sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid size={10}>
                            <TextField
                              fullWidth
                              label="Backend Name"
                              value={backendName}
                              disabled
                            />
                          </Grid>
                          <Grid size={2}>
                            <IconButton
                              color="error"
                              onClick={() => {
                                const newBackends = { ...values.optional_lua_backends };
                                delete newBackends[backendName];
                                setFieldValue('optional_lua_backends', newBackends)
                                    .then(() => setHasUnsavedChanges(true));
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>

                        <Grid container spacing={3} sx={{ mt: 1 }}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              fullWidth
                              label="Number of Workers"
                              name={`optional_lua_backends.${backendName}.number_of_workers`}
                              type="number"
                              value={backendConfig.number_of_workers || ''}
                              onChange={handleChange}
                              InputProps={{ endAdornment: (
                                <InputAdornment position="end"><InfoTooltip title="How many worker goroutines execute Lua scripts in this backend." /></InputAdornment>
                              ) }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              fullWidth
                              label="Package Path"
                              name={`optional_lua_backends.${backendName}.package_path`}
                              value={backendConfig.package_path || ''}
                              onChange={handleChange}
                              InputProps={{ endAdornment: (
                                <InputAdornment position="end"><InfoTooltip title="Lua package.path used by this backend to resolve requires." /></InputAdornment>
                              ) }}
                            />
                          </Grid>
                          <Grid size={12}>
                            <TextField
                              fullWidth
                              label="Backend Script Path"
                              name={`optional_lua_backends.${backendName}.backend_script_path`}
                              value={backendConfig.backend_script_path || ''}
                              onChange={handleChange}
                              InputProps={{ endAdornment: (
                                <InputAdornment position="end"><InfoTooltip title="Path to the main Lua backend script for this optional backend." /></InputAdornment>
                              ) }}
                            />
                          </Grid>
                          <Grid size={12}>
                            <TextField
                              fullWidth
                              label="Init Script Path"
                              name={`optional_lua_backends.${backendName}.init_script_path`}
                              value={backendConfig.init_script_path || ''}
                              onChange={handleChange}
                              InputProps={{ endAdornment: (
                                <InputAdornment position="end"><InfoTooltip title="Optional init script executed on backend startup." /></InputAdornment>
                              ) }}
                            />
                          </Grid>
                          <Grid size={12}>
                            <Typography variant="subtitle2" gutterBottom>
                              Init Script Paths
                            </Typography>
                            <List>
                              {(backendConfig.init_script_paths || []).map((path: string, pathIndex: number) => (
                                <ListItem key={pathIndex} divider={pathIndex < (backendConfig.init_script_paths || []).length - 1} sx={{ py: 2 }}>
                                  <Grid container spacing={2} alignItems="center">
                                    <Grid size={10}>
                                      <TextField
                                        fullWidth
                                        label={`Script Path ${pathIndex + 1}`}
                                        name={`optional_lua_backends.${backendName}.init_script_paths[${pathIndex}]`}
                                        value={path}
                                        onChange={handleChange}
                                        InputProps={{ endAdornment: (
                                          <InputAdornment position="end"><InfoTooltip title="Additional init scripts executed on backend startup (in order)." /></InputAdornment>
                                        ) }}
                                      />
                                    </Grid>
                                    <Grid size={2}>
                                      <IconButton
                                        color="error"
                                        onClick={() => {
                                          const newPaths = [...(backendConfig.init_script_paths || [])];
                                          newPaths.splice(pathIndex, 1);
                                          setFieldValue(`optional_lua_backends.${backendName}.init_script_paths`, newPaths)
                                              .then(() => setHasUnsavedChanges(true));
                                        }}
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
                                  setFieldValue(`optional_lua_backends.${backendName}.init_script_paths`, [
                                    ...(backendConfig.init_script_paths || []),
                                    '',
                                  ])
                                      .then(() => setHasUnsavedChanges(true));
                                }}
                              >
                                Add Init Script Path
                              </Button>
                            </Box>
                          </Grid>
                        </Grid>

                        <CollapsibleFormSection title={`Tuning (Lua) - ${backendName}`} description="Advanced tuning parameters for this optional backend.">
                          <Grid container spacing={2}>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField fullWidth type="number" label="Backend Workers" name={`optional_lua_backends.${backendName}.backend_number_of_workers`} value={backendConfig.backend_number_of_workers ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Replaces deprecated number_of_workers (v1.10.0)." /></InputAdornment>) }} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField fullWidth type="number" label="Action Workers" name={`optional_lua_backends.${backendName}.action_number_of_workers`} value={backendConfig.action_number_of_workers ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Determines Action VM pool size 1:1." /></InputAdornment>) }} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField fullWidth type="number" label="Queue Length" name={`optional_lua_backends.${backendName}.queue_length`} value={backendConfig.queue_length ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="0 = unlimited" /></InputAdornment>) }} />
                            </Grid>

                            <Grid size={12}>
                              <Typography variant="subtitle2">VM Pools</Typography>
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <TextField fullWidth type="number" label="Feature VM Pool Size" name={`optional_lua_backends.${backendName}.feature_vm_pool_size`} value={backendConfig.feature_vm_pool_size ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Fallbacks to Backend Workers when empty." /></InputAdornment>) }} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <TextField fullWidth type="number" label="Filter VM Pool Size" name={`optional_lua_backends.${backendName}.filter_vm_pool_size`} value={backendConfig.filter_vm_pool_size ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Fallbacks to Backend Workers when empty." /></InputAdornment>) }} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <TextField fullWidth type="number" label="Hook VM Pool Size" name={`optional_lua_backends.${backendName}.hook_vm_pool_size`} value={backendConfig.hook_vm_pool_size ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Fallbacks to Backend Workers when empty." /></InputAdornment>) }} />
                            </Grid>

                            <Grid size={12}>
                              <Typography variant="subtitle2">IP Scoping</Typography>
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField fullWidth type="number" label="IPv6 CIDR" name={`optional_lua_backends.${backendName}.ip_scoping_v6_cidr`} value={backendConfig.ip_scoping_v6_cidr ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="0 = disabled" /></InputAdornment>) }} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField fullWidth type="number" label="IPv4 CIDR" name={`optional_lua_backends.${backendName}.ip_scoping_v4_cidr`} value={backendConfig.ip_scoping_v4_cidr ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="0 = disabled" /></InputAdornment>) }} />
                            </Grid>
                          </Grid>
                        </CollapsibleFormSection>

                      </Box>
                    ))}

                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => {
                          setNewBackendName('');
                          setFormikValues(values);
                          formikSetFieldValueRef.current = setFieldValue;
                          setCreateBackendDialogOpen(true);
                        }}
                      >
                        Add Optional Backend
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </TabPanel>

            {/* Config Tab */}
            <TabPanel value={tabValue} index={6}>
              <Typography variant="body1" gutterBottom>
                Configure general Lua settings.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
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
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Global number of worker goroutines for Lua execution." /></InputAdornment>
                      ) }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Package Path"
                      name="config.package_path"
                      value={values.config.package_path || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.package_path') &&
                        getIn(errors, 'config.package_path')
                      )}
                      helperText={
                        getIn(touched, 'config.package_path') &&
                        getIn(errors, 'config.package_path')
                      }
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Global Lua package.path used to locate modules." /></InputAdornment>
                      ) }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Backend Script Path"
                      name="config.backend_script_path"
                      value={values.config.backend_script_path || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.backend_script_path') &&
                        getIn(errors, 'config.backend_script_path')
                      )}
                      helperText={
                        getIn(touched, 'config.backend_script_path') &&
                        getIn(errors, 'config.backend_script_path')
                      }
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Main Lua backend script path for the global configuration." /></InputAdornment>
                      ) }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Init Script Path"
                      name="config.init_script_path"
                      value={values.config.init_script_path || ''}
                      onChange={handleChange}
                      error={Boolean(
                        getIn(touched, 'config.init_script_path') &&
                        getIn(errors, 'config.init_script_path')
                      )}
                      helperText={
                        getIn(touched, 'config.init_script_path') &&
                        getIn(errors, 'config.init_script_path')
                      }
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Optional init script executed when the server starts." /></InputAdornment>
                      ) }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <Typography variant="subtitle1" gutterBottom>
                      Init Script Paths
                    </Typography>
                    <List>
                      {(values.config.init_script_paths || []).map((path: string, index: number) => (
                        <ListItem key={index} divider={index < (values.config.init_script_paths || []).length - 1} sx={{ py: 2 }}>
                          <Grid container spacing={2} alignItems="center">
                            <Grid size={10}>
                              <TextField
                                fullWidth
                                label={`Script Path ${index + 1}`}
                                name={`config.init_script_paths[${index}]`}
                                value={path}
                                onChange={handleChange}
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Additional init scripts executed on server startup (in order)." /></InputAdornment>
                                ) }}
                              />
                            </Grid>
                            <Grid size={2}>
                              <IconButton
                                color="error"
                                onClick={() => {
                                  const newPaths = [...(values.config.init_script_paths || [])];
                                  newPaths.splice(index, 1);
                                  setFieldValue('config.init_script_paths', newPaths)
                                      .then(() => setHasUnsavedChanges(true));
                                }}
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
                          setFieldValue('config.init_script_paths', [
                            ...(values.config.init_script_paths || []),
                            '',
                          ])
                              .then(() => setHasUnsavedChanges(true));
                        }}
                      >
                        Add Init Script Path
                      </Button>
                    </Box>
                  </Grid>

                  <CollapsibleFormSection title="Tuning (Lua)" description="Advanced tuning parameters. Neutral hints; defaults documented.">
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth type="number" label="Backend Workers" name="config.backend_number_of_workers" value={values.config.backend_number_of_workers ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Replaces deprecated number_of_workers (v1.10.0)." /></InputAdornment>) }} />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth type="number" label="Action Workers" name="config.action_number_of_workers" value={values.config.action_number_of_workers ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Determines Action VM pool size 1:1 (default 10)." /></InputAdornment>) }} />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth type="number" label="Queue Length" name="config.queue_length" value={values.config.queue_length ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="0 = unlimited" /></InputAdornment>) }} />
                      </Grid>

                      <Grid size={12}>
                        <Typography variant="subtitle2">VM Pools</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField fullWidth type="number" label="Feature VM Pool Size" name="config.feature_vm_pool_size" value={values.config.feature_vm_pool_size ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Fallbacks to Backend Workers when empty." /></InputAdornment>) }} />
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField fullWidth type="number" label="Filter VM Pool Size" name="config.filter_vm_pool_size" value={values.config.filter_vm_pool_size ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Fallbacks to Backend Workers when empty." /></InputAdornment>) }} />
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField fullWidth type="number" label="Hook VM Pool Size" name="config.hook_vm_pool_size" value={values.config.hook_vm_pool_size ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Fallbacks to Backend Workers when empty." /></InputAdornment>) }} />
                      </Grid>

                      <Grid size={12}>
                        <Typography variant="subtitle2">IP Scoping</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth type="number" label="IPv6 CIDR" name="config.ip_scoping_v6_cidr" value={values.config.ip_scoping_v6_cidr ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="0 = disabled" /></InputAdornment>) }} />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth type="number" label="IPv4 CIDR" name="config.ip_scoping_v4_cidr" value={values.config.ip_scoping_v4_cidr ?? ''} onChange={handleChange} InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="0 = disabled" /></InputAdornment>) }} />
                      </Grid>
                    </Grid>
                  </CollapsibleFormSection>

                </Grid>
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

      {/* Create Backend Dialog */}
      <Dialog
        open={createBackendDialogOpen}
        onClose={() => setCreateBackendDialogOpen(false)}
      >
        <DialogTitle>Create New Lua Backend</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter a name for the new Lua backend.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="backend-name"
            label="Backend Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newBackendName}
            onChange={(e) => setNewBackendName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateBackendDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              if (newBackendName && newBackendName.trim() !== '' && formikValues && formikSetFieldValueRef.current) {
                const newBackends = { ...formikValues.optional_lua_backends };
                newBackends[newBackendName] = {
                  number_of_workers: 10,
                  package_path: '',
                  backend_script_path: '',
                  init_script_path: '',
                  init_script_paths: [],
                  ip_scoping_v6_cidr: 0,
                  ip_scoping_v4_cidr: 0,
                };
                formikSetFieldValueRef.current('optional_lua_backends', newBackends);
                setHasUnsavedChanges(true);
                setCreateBackendDialogOpen(false);
              }
            }}
            color="primary"
            disabled={!newBackendName || newBackendName.trim() === ''}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LuaConfig;
