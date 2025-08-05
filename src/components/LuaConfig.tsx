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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { LuaFeatureConfig, LuaFilterConfig, LuaActionConfig, LuaCustomHookConfig, LuaSearchProtocolConfig, LuaConfig as LuaConfigType, NauthilusConfig } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import ValidationErrors from './common/ValidationErrors';
import ProtocolsConfig from './ProtocolsConfig';

// Validation schema
const LuaConfigSchema = Yup.object().shape({
  features: Yup.array().of(
    Yup.object().shape({
      name: Yup.string().required('Feature name is required'),
      script_path: Yup.string().required('Script path is required'),
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
    features: config?.lua?.features || [],
    filters: config?.lua?.filters || [],
    actions: config?.lua?.actions || [],
    custom_hooks: config?.lua?.custom_hooks || [],
    search: config?.lua?.search || [],
    config: config?.lua?.config || {
      number_of_workers: 10,
      package_path: '',
      backend_script_path: '',
      init_script_path: '',
      init_script_paths: [],
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
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
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
            </Box>

            {/* Features Tab */}
            <TabPanel value={tabValue} index={0}>
              <Typography variant="body1" gutterBottom>
                Configure Lua features. These are scripts that run before the authentication process.
              </Typography>

              <Paper sx={{ p: 2, mb: 2 }}>
                <List>
                  {values.features.map((feature: LuaFeatureConfig, index: number) => (
                    <ListItem key={index} divider={index < values.features.length - 1}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={5}>
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
                          />
                        </Grid>
                        <Grid item xs={5}>
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
                          />
                        </Grid>
                        <Grid item xs={2}>
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
                        { name: '', script_path: '' },
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
                    <ListItem key={index} divider={index < values.filters.length - 1}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={5}>
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
                          />
                        </Grid>
                        <Grid item xs={5}>
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
                          />
                        </Grid>
                        <Grid item xs={2}>
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
                        { name: '', script_path: '' },
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
                    <ListItem key={index} divider={index < values.actions.length - 1}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={3}>
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
                        <Grid item xs={3}>
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
                          />
                        </Grid>
                        <Grid item xs={4}>
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
                          />
                        </Grid>
                        <Grid item xs={2}>
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
                    <ListItem key={index} divider={index < values.custom_hooks.length - 1}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={2}>
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
                          />
                        </Grid>
                        <Grid item xs={2}>
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
                        <Grid item xs={4}>
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
                          />
                        </Grid>
                        <Grid item xs={2}>
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
                          />
                        </Grid>
                        <Grid item xs={2}>
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
                    <ListItem key={index} divider={index < values.search.length - 1}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={4}>
                          <ProtocolsConfig
                            index={index}
                            protocol={searchProtocol.protocol}
                            setFieldValue={setFieldValue}
                            touched={touched}
                            errors={errors}
                            setHasUnsavedChanges={setHasUnsavedChanges}
                          />
                        </Grid>
                        <Grid item xs={3}>
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
                        <Grid item xs={3}>
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
                          />
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
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom>
                      Optional Lua Backends
                    </Typography>

                    {Object.entries(values.optional_lua_backends).map(([backendName, backendConfig]: [string, any]) => (
                      <Box key={backendName} sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={10}>
                            <TextField
                              fullWidth
                              label="Backend Name"
                              value={backendName}
                              disabled
                            />
                          </Grid>
                          <Grid item xs={2}>
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
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Number of Workers"
                              name={`optional_lua_backends.${backendName}.number_of_workers`}
                              type="number"
                              value={backendConfig.number_of_workers || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Package Path"
                              name={`optional_lua_backends.${backendName}.package_path`}
                              value={backendConfig.package_path || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              label="Backend Script Path"
                              name={`optional_lua_backends.${backendName}.backend_script_path`}
                              value={backendConfig.backend_script_path || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              label="Init Script Path"
                              name={`optional_lua_backends.${backendName}.init_script_path`}
                              value={backendConfig.init_script_path || ''}
                              onChange={handleChange}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <Typography variant="subtitle2" gutterBottom>
                              Init Script Paths
                            </Typography>
                            <List>
                              {(backendConfig.init_script_paths || []).map((path: string, pathIndex: number) => (
                                <ListItem key={pathIndex} divider={pathIndex < (backendConfig.init_script_paths || []).length - 1}>
                                  <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={10}>
                                      <TextField
                                        fullWidth
                                        label={`Script Path ${pathIndex + 1}`}
                                        name={`optional_lua_backends.${backendName}.init_script_paths[${pathIndex}]`}
                                        value={path}
                                        onChange={handleChange}
                                      />
                                    </Grid>
                                    <Grid item xs={2}>
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
                    />
                  </Grid>
                  <Grid item xs={12}>
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
                    />
                  </Grid>
                  <Grid item xs={12}>
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
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle1" gutterBottom>
                      Init Script Paths
                    </Typography>
                    <List>
                      {(values.config.init_script_paths || []).map((path: string, index: number) => (
                        <ListItem key={index} divider={index < (values.config.init_script_paths || []).length - 1}>
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={10}>
                              <TextField
                                fullWidth
                                label={`Script Path ${index + 1}`}
                                name={`config.init_script_paths[${index}]`}
                                value={path}
                                onChange={handleChange}
                              />
                            </Grid>
                            <Grid item xs={2}>
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
