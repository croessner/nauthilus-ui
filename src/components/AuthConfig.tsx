import React, { useState } from 'react';
import { Formik, Form, Field, getIn } from 'formik';
import * as Yup from 'yup';
import { 
  TextField, 
  Checkbox, 
  FormControlLabel, 
  Grid, 
  Button, 
  Box,
  FormHelperText,
  Typography,
  Switch
} from '@mui/material';
import { ServerConfig as ServerConfigType } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';

// Validation schema
const AuthConfigSchema = Yup.object().shape({
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
        .min(16, 'Password must be at least 16 characters')
        .matches(/^\S+$/, 'Password cannot contain spaces'),
      otherwise: (schema) => schema,
    }),
  }),

  // JWT Auth validation
  jwt_auth: Yup.object().shape({
    enabled: Yup.boolean(),
    secret_key: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema
        .required('Secret key is required when JWT Auth is enabled')
        .min(32, 'Secret key must be at least 32 characters')
        .matches(/^\S+$/, 'Secret key cannot contain spaces'),
      otherwise: (schema) => schema,
    }),
    token_expiry: Yup.string().when(['enabled'], {
      is: (enabled: any) => Boolean(enabled),
      then: (schema) => schema.required('Token expiry is required when JWT Auth is enabled'),
      otherwise: (schema) => schema,
    }),
    refresh_token: Yup.boolean(),
    refresh_token_expiry: Yup.string().when(['enabled', 'refresh_token'], {
      is: (enabled: any, refresh_token: any) => Boolean(enabled) && Boolean(refresh_token),
      then: (schema) => schema.required('Refresh token expiry is required when refresh tokens are enabled'),
      otherwise: (schema) => schema,
    }),
    store_in_redis: Yup.boolean(),
    users: Yup.array().of(
      Yup.object().shape({
        username: Yup.string().required('Username is required').matches(/^\S+$/, 'Username cannot contain spaces'),
        password: Yup.string()
          .required('Password is required')
          .min(8, 'Password must be at least 8 characters')
          .matches(/^\S+$/, 'Password cannot contain spaces'),
        roles: Yup.array().of(Yup.string()),
      })
    ),
  }),
});

const AuthConfig: React.FC = () => {
  const { config, updateConfigSection, setHasUnsavedChanges } = useConfig();

  // Reset unsaved changes flag when component mounts
  React.useEffect(() => {
    setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  if (!config) {
    return null;
  }

  const initialValues = {
    // Initialize basic auth configuration
    basic_auth: {
      enabled: config.server.basic_auth?.enabled || false,
      username: config.server.basic_auth?.username || '',
      password: config.server.basic_auth?.password || '',
    },

    // Initialize JWT auth configuration
    jwt_auth: {
      enabled: config.server.jwt_auth?.enabled || false,
      secret_key: config.server.jwt_auth?.secret_key || '',
      token_expiry: config.server.jwt_auth?.token_expiry || '1h',
      refresh_token: config.server.jwt_auth?.refresh_token || false,
      refresh_token_expiry: config.server.jwt_auth?.refresh_token_expiry || '24h',
      store_in_redis: config.server.jwt_auth?.store_in_redis || false,
      users: config.server.jwt_auth?.users || [],
    },
  };

  const handleSubmit = async (values: any) => {
    try {
      // Update only the authentication-related parts of the server configuration
      await updateConfigSection('server', {
        basic_auth: values.basic_auth,
        jwt_auth: values.jwt_auth,
      });
    } catch (error) {
      console.error('Error updating authentication configuration:', error);
    }
  };

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={AuthConfigSchema}
      onSubmit={handleSubmit}
    >
      {({ errors, touched, values, handleChange, setFieldValue }) => (
        <Form>
          <FormSection
            title="Authentication Configuration"
            description="Configure authentication methods for accessing the API."
          >
            <Grid container spacing={3}>
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
                  <Grid item xs={12} md={6}>
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
                  <Grid item xs={12} md={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="basic_auth.password"
                      label="Password"
                      type="password"
                      variant="outlined"
                      error={getIn(touched, 'basic_auth.password') && Boolean(getIn(errors, 'basic_auth.password'))}
                      helperText={
                        (getIn(touched, 'basic_auth.password') && getIn(errors, 'basic_auth.password')) ||
                        "Password must be at least 16 characters and without spaces"
                      }
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
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
                  <Grid item xs={12} md={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="jwt_auth.secret_key"
                      label="Secret Key"
                      variant="outlined"
                      error={getIn(touched, 'jwt_auth.secret_key') && Boolean(getIn(errors, 'jwt_auth.secret_key'))}
                      helperText={
                        (getIn(touched, 'jwt_auth.secret_key') && getIn(errors, 'jwt_auth.secret_key')) ||
                        "Secret key must be at least 32 characters and without spaces"
                      }
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="jwt_auth.token_expiry"
                      label="Token Expiry"
                      variant="outlined"
                      placeholder="e.g., 1h, 30m, 24h"
                      error={getIn(touched, 'jwt_auth.token_expiry') && Boolean(getIn(errors, 'jwt_auth.token_expiry'))}
                      helperText={
                        (getIn(touched, 'jwt_auth.token_expiry') && getIn(errors, 'jwt_auth.token_expiry')) ||
                        "Duration format: e.g., 1h, 30m, 24h"
                      }
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={values.jwt_auth?.refresh_token || false}
                          onChange={(e) => {
                            setFieldValue('jwt_auth.refresh_token', e.target.checked);
                            setHasUnsavedChanges(true);
                          }}
                          name="jwt_auth.refresh_token"
                        />
                      }
                      label="Enable Refresh Tokens"
                    />
                  </Grid>
                  {values.jwt_auth?.refresh_token && (
                    <Grid item xs={12} md={6}>
                      <Field
                        as={TextField}
                        fullWidth
                        name="jwt_auth.refresh_token_expiry"
                        label="Refresh Token Expiry"
                        variant="outlined"
                        placeholder="e.g., 24h, 7d"
                        error={getIn(touched, 'jwt_auth.refresh_token_expiry') && Boolean(getIn(errors, 'jwt_auth.refresh_token_expiry'))}
                        helperText={
                          (getIn(touched, 'jwt_auth.refresh_token_expiry') && getIn(errors, 'jwt_auth.refresh_token_expiry')) ||
                          "Duration format: e.g., 24h, 7d"
                        }
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </Grid>
                  )}
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={values.jwt_auth?.store_in_redis || false}
                          onChange={(e) => {
                            setFieldValue('jwt_auth.store_in_redis', e.target.checked);
                            setHasUnsavedChanges(true);
                          }}
                          name="jwt_auth.store_in_redis"
                        />
                      }
                      label="Store Tokens in Redis (for multi-instance compatibility)"
                    />
                  </Grid>

                  {/* JWT Users */}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>JWT Users</Typography>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="textSecondary">
                        Define users that can authenticate using JWT tokens.
                      </Typography>
                    </Box>
                    {values.jwt_auth?.users && values.jwt_auth.users.length > 0 ? (
                      values.jwt_auth.users.map((user, index) => (
                        <Box key={index} sx={{ mb: 3, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`jwt_auth.users[${index}].username`}
                                label="Username"
                                variant="outlined"
                                error={
                                  getIn(touched, `jwt_auth.users[${index}].username`) && 
                                  Boolean(getIn(errors, `jwt_auth.users[${index}].username`))
                                }
                                helperText={
                                  getIn(touched, `jwt_auth.users[${index}].username`) && 
                                  getIn(errors, `jwt_auth.users[${index}].username`)
                                }
                              />
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`jwt_auth.users[${index}].password`}
                                label="Password"
                                type="password"
                                variant="outlined"
                                error={
                                  getIn(touched, `jwt_auth.users[${index}].password`) && 
                                  Boolean(getIn(errors, `jwt_auth.users[${index}].password`))
                                }
                                helperText={
                                  (getIn(touched, `jwt_auth.users[${index}].password`) && 
                                  getIn(errors, `jwt_auth.users[${index}].password`)) ||
                                  "Password must be at least 8 characters and without spaces"
                                }
                              />
                            </Grid>
                            <Grid item xs={12}>
                              {/* Use a regular TextField for roles to allow typing commas */}
                              <TextField
                                fullWidth
                                name={`jwt_auth.users[${index}].roles`}
                                label="Roles (comma-separated)"
                                variant="outlined"
                                // Initialize with the current roles joined by commas
                                defaultValue={(values.jwt_auth?.users?.[index]?.roles || []).join(', ')}
                                // Process the roles when the field loses focus
                                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                                  const rolesArray = e.target.value.split(',').map((role: string) => role.trim()).filter(Boolean);
                                  setFieldValue(`jwt_auth.users[${index}].roles`, rolesArray);
                                }}
                              />
                              <FormHelperText>
                                Default roles: authenticate, user_info, list_accounts, security, admin
                              </FormHelperText>
                            </Grid>
                            <Grid item xs={12}>
                              <Button
                                variant="outlined"
                                color="error"
                                onClick={() => {
                                  const newUsers = [...(values.jwt_auth?.users || [])];
                                  newUsers.splice(index, 1);
                                  setFieldValue('jwt_auth.users', newUsers);
                                }}
                              >
                                Remove User
                              </Button>
                            </Grid>
                          </Grid>
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                        No users defined. Add a user to enable JWT authentication.
                      </Typography>
                    )}
                    <Button
                      variant="outlined"
                      onClick={() => {
                        const newUser = { username: '', password: '', roles: ['authenticate'] };
                        const newUsers = [...(values.jwt_auth?.users || []), newUser];
                        setFieldValue('jwt_auth.users', newUsers);
                      }}
                      sx={{ mt: 1 }}
                    >
                      Add User
                    </Button>
                  </Grid>
                </>
              )}
            </Grid>
          </FormSection>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="contained" color="primary">
              Save Changes
            </Button>
          </Box>
        </Form>
      )}
    </Formik>
  );
};

export default AuthConfig;
