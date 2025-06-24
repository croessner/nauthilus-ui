import React, { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import {
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
  Divider,
  Card,
  CardContent,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { BackendConfig } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import ValidationErrors from './common/ValidationErrors';

// Validation schema
const BackendsConfigSchema = Yup.object().shape({
  backends: Yup.array().of(
    Yup.string().required('Backend type is required')
  ),
});

const BackendsConfig: React.FC = () => {
  const { config, updateConfig, setHasUnsavedChanges, error } = useConfig();
  const [isFormChanged, setIsFormChanged] = useState(false);

  // Check if Lua is configured
  const isLuaConfigured = Boolean(config?.lua?.config?.backend_script_path);

  // Check if LDAP is configured
  const isLDAPConfigured = Boolean(config?.ldap?.config?.server_uri?.length);

  // Get optional Lua backends
  const optionalLuaBackends = config?.lua?.optional_lua_backends || {};

  // Get optional LDAP pools
  const optionalLDAPPools = config?.ldap?.optional_ldap_pools || {};

  // Initial values
  const initialValues = {
    backends: config?.server?.backends || [],
  };


  const handleSubmit = (values: { backends: BackendConfig[] }) => {
    if (!config) return;

    const newConfig = {
      ...config,
      server: {
        ...config.server,
        backends: values.backends,
      },
    };

    updateConfig(newConfig);
    setHasUnsavedChanges(false);
    setIsFormChanged(false);
  };

  // Function to check if form values have changed from initial values
  const checkFormChanged = (currentValues: any, initialVals: any): boolean => {
    return JSON.stringify(currentValues) !== JSON.stringify(initialVals);
  };

  // Function to get available backend types based on configuration
  const getAvailableBackendTypes = () => {
    const backendTypes = ['cache'];

    if (isLuaConfigured) {
      backendTypes.push('lua');
    }

    if (isLDAPConfigured) {
      backendTypes.push('ldap');
    }

    // Add optional Lua backends
    Object.keys(optionalLuaBackends).forEach(name => {
      backendTypes.push(`lua(${name})`);
    });

    // Add optional LDAP pools
    Object.keys(optionalLDAPPools).forEach(name => {
      backendTypes.push(`ldap(${name})`);
    });

    return backendTypes;
  };

  return (
    <>
      {/* Display validation errors at the top of the form */}
      <ValidationErrors error={error} />

      <Formik
        initialValues={initialValues}
        validationSchema={BackendsConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
      // Track form changes
      validate={(values) => {
        // Check if current values differ from initial values
        const hasChanged = checkFormChanged(values, initialValues);
        setIsFormChanged(hasChanged);
        setHasUnsavedChanges(hasChanged);
        return {}; // Return empty object (no validation errors)
      }}
    >
      {({ values, errors, touched, isSubmitting, setFieldValue }) => {
        const availableBackendTypes = getAvailableBackendTypes();

        return (
          <Form>
            <FormSection title="Backends Configuration">
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="body1" gutterBottom>
                    Configure the authentication backends and their order. The backends are processed in the order they appear in the list.
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    Note: The cache backend is always available. Lua and LDAP backends are only available if they have been configured.
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <List>
                      {values.backends.map((backend, index) => (
                        <ListItem key={index} divider={index < values.backends.length - 1}>
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={8}>
                              <FormControl fullWidth>
                                <InputLabel id={`backend-type-label-${index}`}>Backend Type</InputLabel>
                                <Select
                                  labelId={`backend-type-label-${index}`}
                                  id={`backend-type-${index}`}
                                  value={backend}
                                  label="Backend Type"
                                  onChange={(e) => {
                                    const newBackends = [...values.backends];
                                    newBackends[index] = e.target.value;
                                    setFieldValue('backends', newBackends);
                                  }}
                                  error={touched.backends !== undefined && errors.backends !== undefined && 
                                    Array.isArray(touched.backends) && Array.isArray(errors.backends) &&
                                    index < touched.backends.length && index < errors.backends.length && 
                                    Boolean(touched.backends[index]) && Boolean(errors.backends[index])}
                                >
                                  {availableBackendTypes.map((type) => (
                                    <MenuItem key={type} value={type}>
                                      {type}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Grid>
                            <Grid item xs={4}>
                              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <IconButton
                                  color="primary"
                                  onClick={() => {
                                    if (index > 0) {
                                      const newBackends = [...values.backends];
                                      const temp = newBackends[index];
                                      newBackends[index] = newBackends[index - 1];
                                      newBackends[index - 1] = temp;
                                      setFieldValue('backends', newBackends);
                                      setHasUnsavedChanges(true);
                                    }
                                  }}
                                  disabled={index === 0}
                                >
                                  <ArrowUpwardIcon />
                                </IconButton>
                                <IconButton
                                  color="primary"
                                  onClick={() => {
                                    if (index < values.backends.length - 1) {
                                      const newBackends = [...values.backends];
                                      const temp = newBackends[index];
                                      newBackends[index] = newBackends[index + 1];
                                      newBackends[index + 1] = temp;
                                      setFieldValue('backends', newBackends);
                                      setHasUnsavedChanges(true);
                                    }
                                  }}
                                  disabled={index === values.backends.length - 1}
                                >
                                  <ArrowDownwardIcon />
                                </IconButton>
                                <IconButton
                                  color="error"
                                  onClick={() => {
                                    const newBackends = [...values.backends];
                                    newBackends.splice(index, 1);
                                    setFieldValue('backends', newBackends);
                                    setHasUnsavedChanges(true);
                                  }}
                                >
                                  <DeleteIcon />
                                </IconButton>
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
                          setFieldValue('backends', [
                            ...values.backends,
                            'cache',
                          ]);
                          setHasUnsavedChanges(true);
                        }}
                      >
                        Add Backend
                      </Button>
                    </Box>
                  </Paper>
                </Grid>

                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Available Backend Types
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="h6">Cache</Typography>
                          <Typography variant="body2">
                            The cache backend is always available and uses Redis to store authentication results.
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>

                    {isLuaConfigured && (
                      <Grid item xs={12} md={4}>
                        <Card>
                          <CardContent>
                            <Typography variant="h6">Lua</Typography>
                            <Typography variant="body2">
                              The Lua backend uses Lua scripts for authentication.
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    )}

                    {isLDAPConfigured && (
                      <Grid item xs={12} md={4}>
                        <Card>
                          <CardContent>
                            <Typography variant="h6">LDAP</Typography>
                            <Typography variant="body2">
                              The LDAP backend authenticates against LDAP servers.
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    )}

                    {Object.keys(optionalLuaBackends).map((name) => (
                      <Grid item xs={12} md={4} key={`lua-${name}`}>
                        <Card>
                          <CardContent>
                            <Typography variant="h6">Lua ({name})</Typography>
                            <Typography variant="body2">
                              Optional Lua backend with custom configuration.
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}

                    {Object.keys(optionalLDAPPools).map((name) => (
                      <Grid item xs={12} md={4} key={`ldap-${name}`}>
                        <Card>
                          <CardContent>
                            <Typography variant="h6">LDAP ({name})</Typography>
                            <Typography variant="body2">
                              Optional LDAP pool with custom configuration.
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Grid>
              </Grid>
            </FormSection>

            <Box mt={3} display="flex" justifyContent="flex-end">
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isSubmitting || !isFormChanged}
              >
                Save Changes
              </Button>
            </Box>
          </Form>
        );
      }}
    </Formik>
    </>
  );
};

export default BackendsConfig;
