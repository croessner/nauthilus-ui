import React, { useState } from 'react';
import { Formik, Form, Field, getIn, FieldArray } from 'formik';
import * as Yup from 'yup';
import { 
  TextField, 
  FormControlLabel, 
  Grid, 
  Button, 
  Box,
  Typography,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  IconButton,
  Switch
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { ServerConfig as ServerConfigType } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import ValidationErrors from './common/ValidationErrors';

// Validation schema
const RedisConfigSchema = Yup.object().shape({
  redis: Yup.object().shape({
    database_number: Yup.number()
      .min(0, 'Must be at least 0')
      .max(15, 'Must be at most 15')
      .nullable(),
    prefix: Yup.string()
      .matches(/^[a-zA-Z0-9_-]*$/, 'Prefix must contain only alphanumeric characters, underscores, and hyphens')
      .nullable(),
    password_nonce: Yup.string()
      .min(16, 'Password nonce must be at least 16 characters')
      .matches(/^\S*$/, 'Password nonce cannot contain spaces')
      .nullable(),
    pool_size: Yup.number()
      .min(1, 'Must be at least 1')
      .nullable(),
    idle_pool_size: Yup.number()
      .min(0, 'Must be at least 0')
      .nullable(),
    positive_cache_ttl: Yup.string()
      .nullable(),
    negative_cache_ttl: Yup.string()
      .nullable(),

    // TLS configuration
    tls: Yup.object().shape({
      enabled: Yup.boolean(),
      cert: Yup.string().when('enabled', (enabled, schema) => 
        enabled 
          ? schema.required('Certificate is required when TLS is enabled')
          : schema.nullable()
      ),
      key: Yup.string().when('enabled', (enabled, schema) => 
        enabled 
          ? schema.required('Key is required when TLS is enabled')
          : schema.nullable()
      ),
      http_client_skip_verify: Yup.boolean(),
    }),

    // Master configuration
    master: Yup.object().shape({
      address: Yup.string()
        .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
        .nullable(),
      username: Yup.string()
        .matches(/^\S*$/, 'Username cannot contain spaces')
        .nullable(),
      password: Yup.string()
        .matches(/^\S*$/, 'Password cannot contain spaces')
        .nullable(),
    }),

    // Replica configuration
    replica: Yup.object().shape({
      address: Yup.string()
        .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
        .nullable(),
      addresses: Yup.array().of(
        Yup.string().matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
      ),
    }),

    // Sentinels configuration
    sentinels: Yup.object().shape({
      master: Yup.string()
        .matches(/^\S+$/, 'Master name cannot contain spaces')
        .nullable(),
      addresses: Yup.array().of(
        Yup.string().matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
      ),
      username: Yup.string()
        .matches(/^\S*$/, 'Username cannot contain spaces')
        .nullable(),
      password: Yup.string()
        .matches(/^\S*$/, 'Password cannot contain spaces')
        .nullable(),
    }),

    // Cluster configuration
    cluster: Yup.object().shape({
      addresses: Yup.array().of(
        Yup.string().matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
      ),
      username: Yup.string()
        .matches(/^\S*$/, 'Username cannot contain spaces')
        .nullable(),
      password: Yup.string()
        .matches(/^\S*$/, 'Password cannot contain spaces')
        .nullable(),
      route_by_latency: Yup.boolean(),
      route_randomly: Yup.boolean(),
      read_only: Yup.boolean(), // Deprecated
      route_reads_to_replicas: Yup.boolean(),
      max_redirects: Yup.number()
        .min(0, 'Must be at least 0')
        .nullable(),
      read_timeout: Yup.string()
        .nullable(),
      write_timeout: Yup.string()
        .nullable(),
    }),
  }),
});

const RedisConfig: React.FC = () => {
  const { config, updateConfigSection, hasUnsavedChanges, setHasUnsavedChanges, error } = useConfig();

  // Reset unsaved changes flag when component mounts
  React.useEffect(() => {
    setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  // Determine the Redis setup type based on the configuration
  const determineRedisSetupType = (config: any): string => {
    if (!config) return 'master';

    if (config.server.redis.cluster?.addresses?.length) {
      return 'cluster';
    } else if (config.server.redis.sentinels?.addresses?.length) {
      return 'sentinels';
    } else if (config.server.redis.replica?.addresses?.length || config.server.redis.replica?.address) {
      return 'replica';
    } else {
      return 'master';
    }
  };

  const [redisSetupType, setRedisSetupType] = useState<string>(() => determineRedisSetupType(config));

  // Update redisSetupType when config changes (e.g., when switching profiles)
  React.useEffect(() => {
    if (config) {
      setRedisSetupType(determineRedisSetupType(config));
    }
  }, [config]);

  // Handle Redis setup type change
  const handleRedisSetupTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRedisSetupType(event.target.value);
    setHasUnsavedChanges(true);
  };

  if (!config) {
    return null;
  }

  const initialValues = {
    redis: {
      database_number: config.server.redis.database_number || 0,
      prefix: config.server.redis.prefix || '',
      password_nonce: config.server.redis.password_nonce || '',
      pool_size: config.server.redis.pool_size || 10,
      idle_pool_size: config.server.redis.idle_pool_size || 0,
      positive_cache_ttl: config.server.redis.positive_cache_ttl || '5m',
      negative_cache_ttl: config.server.redis.negative_cache_ttl || '1m',

      // TLS configuration
      tls: {
        enabled: config.server.redis.tls?.enabled || false,
        cert: config.server.redis.tls?.cert || '',
        key: config.server.redis.tls?.key || '',
        http_client_skip_verify: config.server.redis.tls?.http_client_skip_verify || false,
      },

      // Master configuration
      master: {
        address: config.server.redis.master?.address || 'localhost:6379',
        username: config.server.redis.master?.username || '',
        password: config.server.redis.master?.password || '',
      },

      // Replica configuration
      replica: {
        address: config.server.redis.replica?.address || '',
        // Ensure there's at least one empty address field if none are configured
        addresses: config.server.redis.replica?.addresses?.length ? config.server.redis.replica.addresses : [''],
      },

      // Sentinels configuration
      sentinels: {
        master: config.server.redis.sentinels?.master || '',
        // Ensure there's at least one empty address field if none are configured
        addresses: config.server.redis.sentinels?.addresses?.length ? config.server.redis.sentinels.addresses : [''],
        username: config.server.redis.sentinels?.username || '',
        password: config.server.redis.sentinels?.password || '',
      },

      // Cluster configuration
      cluster: {
        // Ensure there's at least one empty address field if none are configured
        addresses: config.server.redis.cluster?.addresses?.length ? config.server.redis.cluster.addresses : [''],
        username: config.server.redis.cluster?.username || '',
        password: config.server.redis.cluster?.password || '',
        route_by_latency: config.server.redis.cluster?.route_by_latency || false,
        route_randomly: config.server.redis.cluster?.route_randomly || false,
        // Use the new parameter if available, otherwise fall back to the old one for backward compatibility
        route_reads_to_replicas: config.server.redis.cluster?.route_reads_to_replicas || config.server.redis.cluster?.read_only || false,
        max_redirects: config.server.redis.cluster?.max_redirects || 3,
        read_timeout: config.server.redis.cluster?.read_timeout || '3s',
        write_timeout: config.server.redis.cluster?.write_timeout || '3s',
      },
    },
  };

  const handleSubmit = async (values: { redis: ServerConfigType['redis'] }) => {
    try {
      // Update the server configuration with the new Redis configuration
      await updateConfigSection('server', { redis: values.redis });
    } catch (error) {
      console.error('Error updating Redis configuration:', error);
    }
  };

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={RedisConfigSchema}
      onSubmit={handleSubmit}
      enableReinitialize={true}
    >
      {({ errors, touched, values, handleChange, setFieldValue }) => (
        <Form>
          {/* Display validation errors at the top of the form */}
          <ValidationErrors error={error} />

          <FormSection
            title="Redis Configuration"
            description="Configure Redis settings for caching and session management."
          >
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControl component="fieldset">
                  <FormLabel component="legend">Redis Setup Type</FormLabel>
                  <RadioGroup
                    row
                    value={redisSetupType}
                    onChange={handleRedisSetupTypeChange}
                  >
                    <FormControlLabel value="master" control={<Radio />} label="Standalone Master" />
                    <FormControlLabel value="replica" control={<Radio />} label="Standalone Replica" />
                    <FormControlLabel value="sentinels" control={<Radio />} label="Sentinel" />
                    <FormControlLabel value="cluster" control={<Radio />} label="Cluster" />
                  </RadioGroup>
                </FormControl>
              </Grid>

              {/* Common Redis Configuration */}
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.database_number"
                  label="Database Number"
                  variant="outlined"
                  type="number"
                  InputProps={{ inputProps: { min: 0, max: 15 } }}
                  error={getIn(touched, 'redis.database_number') && Boolean(getIn(errors, 'redis.database_number'))}
                  helperText={(getIn(touched, 'redis.database_number') && getIn(errors, 'redis.database_number')) || "Redis database number (0-15)"}
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
                  name="redis.prefix"
                  label="Key Prefix"
                  variant="outlined"
                  error={getIn(touched, 'redis.prefix') && Boolean(getIn(errors, 'redis.prefix'))}
                  helperText={(getIn(touched, 'redis.prefix') && getIn(errors, 'redis.prefix')) || "Prefix for Redis keys"}
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
                  name="redis.password_nonce"
                  label="Password Nonce"
                  variant="outlined"
                  error={getIn(touched, 'redis.password_nonce') && Boolean(getIn(errors, 'redis.password_nonce'))}
                  helperText={(getIn(touched, 'redis.password_nonce') && getIn(errors, 'redis.password_nonce')) || "Nonce for password encryption (min 16 characters, can include symbols)"}
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
                  name="redis.pool_size"
                  label="Pool Size"
                  variant="outlined"
                  type="number"
                  InputProps={{ inputProps: { min: 1 } }}
                  error={getIn(touched, 'redis.pool_size') && Boolean(getIn(errors, 'redis.pool_size'))}
                  helperText={(getIn(touched, 'redis.pool_size') && getIn(errors, 'redis.pool_size')) || "Size of the connection pool"}
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
                  name="redis.idle_pool_size"
                  label="Idle Pool Size"
                  variant="outlined"
                  type="number"
                  InputProps={{ inputProps: { min: 0 } }}
                  error={getIn(touched, 'redis.idle_pool_size') && Boolean(getIn(errors, 'redis.idle_pool_size'))}
                  helperText={(getIn(touched, 'redis.idle_pool_size') && getIn(errors, 'redis.idle_pool_size')) || "Number of idle connections allowed"}
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
                  name="redis.positive_cache_ttl"
                  label="Positive Cache TTL"
                  variant="outlined"
                  error={getIn(touched, 'redis.positive_cache_ttl') && Boolean(getIn(errors, 'redis.positive_cache_ttl'))}
                  helperText={(getIn(touched, 'redis.positive_cache_ttl') && getIn(errors, 'redis.positive_cache_ttl')) || "Duration format (e.g., 5m, 1h)"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.negative_cache_ttl"
                  label="Negative Cache TTL"
                  variant="outlined"
                  error={getIn(touched, 'redis.negative_cache_ttl') && Boolean(getIn(errors, 'redis.negative_cache_ttl'))}
                  helperText={(getIn(touched, 'redis.negative_cache_ttl') && getIn(errors, 'redis.negative_cache_ttl')) || "Duration format (e.g., 1m, 30s)"}
                />
              </Grid>
            </Grid>
          </FormSection>

          {/* TLS Configuration */}
          <CollapsibleFormSection
            title="Redis TLS Configuration"
            description="Configure TLS settings for Redis connections."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.redis.tls?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('redis.tls.enabled', e.target.checked);
                      }}
                      name="redis.tls.enabled"
                    />
                  }
                  label="Enable TLS"
                />
              </Grid>
              {values.redis.tls?.enabled && (
                <>
                  <Grid item xs={12} md={12}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="redis.tls.cert"
                      label="TLS Certificate Path"
                      variant="outlined"
                      error={getIn(touched, 'redis.tls.cert') && Boolean(getIn(errors, 'redis.tls.cert'))}
                      helperText={getIn(touched, 'redis.tls.cert') && getIn(errors, 'redis.tls.cert')}
                    />
                  </Grid>
                  <Grid item xs={12} md={12}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="redis.tls.key"
                      label="TLS Key Path"
                      variant="outlined"
                      error={getIn(touched, 'redis.tls.key') && Boolean(getIn(errors, 'redis.tls.key'))}
                      helperText={getIn(touched, 'redis.tls.key') && getIn(errors, 'redis.tls.key')}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={values.redis.tls?.http_client_skip_verify || false}
                          onChange={(e) => {
                            setFieldValue('redis.tls.http_client_skip_verify', e.target.checked);
                          }}
                          name="redis.tls.http_client_skip_verify"
                        />
                      }
                      label="Skip TLS Verification"
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </CollapsibleFormSection>

          {/* Standalone Master Configuration */}
          {redisSetupType === 'master' && (
            <CollapsibleFormSection
              title="Standalone Master Configuration"
              description="Configure a standalone Redis master instance."
              defaultExpanded={true}
            >
              <Grid container spacing={3}>
                <Grid item xs={12} md={12}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.master.address"
                    label="Master Address"
                    variant="outlined"
                    placeholder="localhost:6379"
                    error={getIn(touched, 'redis.master.address') && Boolean(getIn(errors, 'redis.master.address'))}
                    helperText={(getIn(touched, 'redis.master.address') && getIn(errors, 'redis.master.address')) || "Redis master address in the format hostname:port"}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.master.username"
                    label="Username"
                    variant="outlined"
                    error={getIn(touched, 'redis.master.username') && Boolean(getIn(errors, 'redis.master.username'))}
                    helperText={(getIn(touched, 'redis.master.username') && getIn(errors, 'redis.master.username')) || "Redis username (optional)"}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.master.password"
                    label="Password"
                    variant="outlined"
                    type="password"
                    error={getIn(touched, 'redis.master.password') && Boolean(getIn(errors, 'redis.master.password'))}
                    helperText={(getIn(touched, 'redis.master.password') && getIn(errors, 'redis.master.password')) || "Redis password (optional)"}
                  />
                </Grid>
              </Grid>
            </CollapsibleFormSection>
          )}

          {/* Standalone Replica Configuration */}
          {redisSetupType === 'replica' && (
            <CollapsibleFormSection
              title="Standalone Replica Configuration"
              description="Configure a standalone Redis replica instance."
              defaultExpanded={true}
            >
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Replica Addresses</Typography>
                  <FieldArray name="redis.replica.addresses">
                    {({ push, remove, form }) => (
                      <div>
                        {values.redis.replica?.addresses && values.redis.replica.addresses.length > 0 ? (
                          values.redis.replica.addresses.map((address, index) => (
                            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`redis.replica.addresses[${index}]`}
                                label={`Replica Address ${index + 1}`}
                                variant="outlined"
                                placeholder="localhost:6379"
                                error={getIn(touched, `redis.replica.addresses[${index}]`) && Boolean(getIn(errors, `redis.replica.addresses[${index}]`))}
                                helperText={(getIn(touched, `redis.replica.addresses[${index}]`) && getIn(errors, `redis.replica.addresses[${index}]`)) || "Redis replica address in the format hostname:port"}
                              />
                              <IconButton 
                                onClick={() => remove(index)}
                                sx={{ ml: 1 }}
                                color="error"
                                aria-label="Remove address"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          ))
                        ) : (
                          <Typography color="textSecondary" sx={{ mb: 2 }}>No replica addresses added yet.</Typography>
                        )}
                        <Button
                          startIcon={<AddIcon />}
                          variant="outlined"
                          color="primary"
                          onClick={() => push('')}
                        >
                          Add Replica Address
                        </Button>
                      </div>
                    )}
                  </FieldArray>
                </Grid>
              </Grid>
            </CollapsibleFormSection>
          )}

          {/* Sentinel Configuration */}
          {redisSetupType === 'sentinels' && (
            <CollapsibleFormSection
              title="Sentinel Configuration"
              description="Configure Redis Sentinel for high availability."
              defaultExpanded={true}
            >
              <Grid container spacing={3}>
                <Grid item xs={12} md={12}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.sentinels.master"
                    label="Master Name"
                    variant="outlined"
                    error={getIn(touched, 'redis.sentinels.master') && Boolean(getIn(errors, 'redis.sentinels.master'))}
                    helperText={(getIn(touched, 'redis.sentinels.master') && getIn(errors, 'redis.sentinels.master')) || "Name of the master instance in Sentinel"}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Sentinel Addresses</Typography>
                  <FieldArray name="redis.sentinels.addresses">
                    {({ push, remove, form }) => (
                      <div>
                        {values.redis.sentinels?.addresses && values.redis.sentinels.addresses.length > 0 ? (
                          values.redis.sentinels.addresses.map((address, index) => (
                            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`redis.sentinels.addresses[${index}]`}
                                label={`Sentinel Address ${index + 1}`}
                                variant="outlined"
                                placeholder="localhost:26379"
                                error={getIn(touched, `redis.sentinels.addresses[${index}]`) && Boolean(getIn(errors, `redis.sentinels.addresses[${index}]`))}
                                helperText={(getIn(touched, `redis.sentinels.addresses[${index}]`) && getIn(errors, `redis.sentinels.addresses[${index}]`)) || "Redis sentinel address in the format hostname:port"}
                              />
                              <IconButton 
                                onClick={() => remove(index)}
                                sx={{ ml: 1 }}
                                color="error"
                                aria-label="Remove address"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          ))
                        ) : (
                          <Typography color="textSecondary" sx={{ mb: 2 }}>No sentinel addresses added yet.</Typography>
                        )}
                        <Button
                          startIcon={<AddIcon />}
                          variant="outlined"
                          color="primary"
                          onClick={() => push('')}
                        >
                          Add Sentinel Address
                        </Button>
                      </div>
                    )}
                  </FieldArray>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.sentinels.username"
                    label="Username"
                    variant="outlined"
                    error={getIn(touched, 'redis.sentinels.username') && Boolean(getIn(errors, 'redis.sentinels.username'))}
                    helperText={(getIn(touched, 'redis.sentinels.username') && getIn(errors, 'redis.sentinels.username')) || "Sentinel username (optional)"}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.sentinels.password"
                    label="Password"
                    variant="outlined"
                    type="password"
                    error={getIn(touched, 'redis.sentinels.password') && Boolean(getIn(errors, 'redis.sentinels.password'))}
                    helperText={(getIn(touched, 'redis.sentinels.password') && getIn(errors, 'redis.sentinels.password')) || "Sentinel password (optional)"}
                  />
                </Grid>
              </Grid>
            </CollapsibleFormSection>
          )}

          {/* Cluster Configuration */}
          {redisSetupType === 'cluster' && (
            <CollapsibleFormSection
              title="Cluster Configuration"
              description="Configure Redis Cluster for scalability and high availability."
              defaultExpanded={true}
            >
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Cluster Addresses</Typography>
                  <FieldArray name="redis.cluster.addresses">
                    {({ push, remove, form }) => (
                      <div>
                        {values.redis.cluster?.addresses && values.redis.cluster.addresses.length > 0 ? (
                          values.redis.cluster.addresses.map((address, index) => (
                            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`redis.cluster.addresses[${index}]`}
                                label={`Cluster Address ${index + 1}`}
                                variant="outlined"
                                placeholder="localhost:6379"
                                error={getIn(touched, `redis.cluster.addresses[${index}]`) && Boolean(getIn(errors, `redis.cluster.addresses[${index}]`))}
                                helperText={(getIn(touched, `redis.cluster.addresses[${index}]`) && getIn(errors, `redis.cluster.addresses[${index}]`)) || "Redis cluster address in the format hostname:port"}
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
                                aria-label="Remove address"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          ))
                        ) : (
                          <Typography color="textSecondary" sx={{ mb: 2 }}>No cluster addresses added yet.</Typography>
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
                          Add Cluster Address
                        </Button>
                      </div>
                    )}
                  </FieldArray>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.cluster.username"
                    label="Username"
                    variant="outlined"
                    error={getIn(touched, 'redis.cluster.username') && Boolean(getIn(errors, 'redis.cluster.username'))}
                    helperText={(getIn(touched, 'redis.cluster.username') && getIn(errors, 'redis.cluster.username')) || "Cluster username (optional)"}
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
                    name="redis.cluster.password"
                    label="Password"
                    variant="outlined"
                    type="password"
                    error={getIn(touched, 'redis.cluster.password') && Boolean(getIn(errors, 'redis.cluster.password'))}
                    helperText={(getIn(touched, 'redis.cluster.password') && getIn(errors, 'redis.cluster.password')) || "Cluster password (optional)"}
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
                        checked={values.redis.cluster?.route_by_latency || false}
                        onChange={(e) => {
                          setFieldValue('redis.cluster.route_by_latency', e.target.checked);
                          setHasUnsavedChanges(true);
                        }}
                        name="redis.cluster.route_by_latency"
                      />
                    }
                    label="Route By Latency"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.redis.cluster?.route_randomly || false}
                        onChange={(e) => {
                          setFieldValue('redis.cluster.route_randomly', e.target.checked);
                          setHasUnsavedChanges(true);
                        }}
                        name="redis.cluster.route_randomly"
                      />
                    }
                    label="Route Randomly"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.redis.cluster?.route_reads_to_replicas || false}
                        onChange={(e) => {
                          setFieldValue('redis.cluster.route_reads_to_replicas', e.target.checked);
                          setHasUnsavedChanges(true);
                        }}
                        name="redis.cluster.route_reads_to_replicas"
                      />
                    }
                    label="Route Reads To Replicas"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.cluster.max_redirects"
                    label="Max Redirects"
                    variant="outlined"
                    type="number"
                    InputProps={{ inputProps: { min: 0 } }}
                    error={getIn(touched, 'redis.cluster.max_redirects') && Boolean(getIn(errors, 'redis.cluster.max_redirects'))}
                    helperText={(getIn(touched, 'redis.cluster.max_redirects') && getIn(errors, 'redis.cluster.max_redirects')) || "Maximum number of redirects"}
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
                    name="redis.cluster.read_timeout"
                    label="Read Timeout"
                    variant="outlined"
                    error={getIn(touched, 'redis.cluster.read_timeout') && Boolean(getIn(errors, 'redis.cluster.read_timeout'))}
                    helperText={(getIn(touched, 'redis.cluster.read_timeout') && getIn(errors, 'redis.cluster.read_timeout')) || "Duration format (e.g., 3s, 1m)"}
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
                    name="redis.cluster.write_timeout"
                    label="Write Timeout"
                    variant="outlined"
                    error={getIn(touched, 'redis.cluster.write_timeout') && Boolean(getIn(errors, 'redis.cluster.write_timeout'))}
                    helperText={(getIn(touched, 'redis.cluster.write_timeout') && getIn(errors, 'redis.cluster.write_timeout')) || "Duration format (e.g., 3s, 1m)"}
                    onChange={(e: React.ChangeEvent<any>) => {
                      handleChange(e);
                      setHasUnsavedChanges(true);
                    }}
                  />
                </Grid>
              </Grid>
            </CollapsibleFormSection>
          )}

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="contained" color="primary" disabled={!hasUnsavedChanges}>
              Save Changes
            </Button>
          </Box>
        </Form>
      )}
    </Formik>
  );
};

export default RedisConfig;
