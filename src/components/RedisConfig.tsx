import React, { useState } from 'react';
import { Formik, Form, Field, getIn, FieldArray } from 'formik';
import * as Yup from 'yup';
import { TextField, FormControlLabel, Button, Box, Typography, Radio, RadioGroup, FormControl, FormLabel, IconButton, Switch, InputAdornment } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { ServerConfig as ServerConfigType } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import PasswordField from './common/PasswordField';
import InfoTooltip from './common/InfoTooltip';
import Grid from '@mui/material/Grid';

// Local form value type: allow empty-string/null for certain optional inputs used as placeholders
type RedisFormValues = {
  redis: Omit<ServerConfigType['redis'], 'max_retries'> & {
    // Form allows empty string to show placeholder for unset value; coerce to number on submit
    max_retries: number | '' | null | undefined;
    // Keep other optional string fields as-is; many are already optional strings and we pass '' at runtime
  };
};

// Validation schema
const RedisConfigSchema = Yup.object().shape({
  redis: Yup.object().shape({
    database_number: Yup.number()
      .required('Database number is required')
      .min(0, 'Must be at least 0')
      .max(15, 'Must be at most 15'),
    prefix: Yup.string()
      .matches(/^[a-zA-Z0-9_-]*$/, 'Prefix must contain only alphanumeric characters, underscores, and hyphens')
      .nullable(),
    password_nonce: Yup.string()
      .min(16, 'Password nonce must be at least 16 characters')
      .matches(/^\S*$/, 'Password nonce cannot contain spaces')
      .nullable(),
    pool_size: Yup.number()
      .required('Pool size is required')
      .min(1, 'Must be at least 1'),
    idle_pool_size: Yup.number()
      .required('Idle pool size is required')
      .min(0, 'Must be at least 0'),
    positive_cache_ttl: Yup.string()
      .required('Positive cache TTL is required')
      .matches(/^\d+[smhd]$/, 'Must be in format like 5m, 1h, 30s, 1d'),
    negative_cache_ttl: Yup.string()
      .required('Negative cache TTL is required')
      .matches(/^\d+[smhd]$/, 'Must be in format like 1m, 30s, 1h, 1d'),

    // Connection & timeouts tuning (all optional)
    pool_timeout: Yup.string()
      .matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 80ms, 3s, 5m, 1h')
      .nullable(),
    dial_timeout: Yup.string()
      .matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 200ms, 1s, 5m, 1h')
      .nullable(),
    read_timeout: Yup.string()
      .matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 100ms, 1s, 5m, 1h')
      .nullable(),
    write_timeout: Yup.string()
      .matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 100ms, 1s, 5m, 1h')
      .nullable(),
    pool_fifo: Yup.boolean().nullable(),
    conn_max_idle_time: Yup.string()
      .matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 90s, 1m, 5m, 1h')
      .nullable(),
    max_retries: Yup.number()
      .transform((value, originalValue) => (originalValue === '' || originalValue === null ? undefined : value))
      .min(0, 'Must be at least 0')
      .nullable(),

    // TLS configuration
    tls: Yup.object().shape({
      enabled: Yup.boolean(),
      cert: Yup.string().when(['enabled'], {
        is: (enabled: any) => Boolean(enabled),
        then: (schema) => schema.required('Certificate is required when TLS is enabled'),
        otherwise: (schema) => schema.nullable(),
      }),
      key: Yup.string().when(['enabled'], {
        is: (enabled: any) => Boolean(enabled),
        then: (schema) => schema.required('Key is required when TLS is enabled'),
        otherwise: (schema) => schema.nullable(),
      }),
      skip_verify: Yup.boolean(),
    }),

    // Master configuration
    master: Yup.object().when(['$redisSetupType'], {
      is: (redisSetupType: any) => redisSetupType === 'master',
      then: (schema) => schema.shape({
        address: Yup.string()
          .required('Master address is required')
          .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port'),
        username: Yup.string()
          .matches(/^\S*$/, 'Username cannot contain spaces')
          .nullable(),
        password: Yup.string()
          .matches(/^\S*$/, 'Password cannot contain spaces')
          .nullable(),
      }),
      otherwise: (schema) => schema.shape({
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
    }),

    // Replica configuration
    replica: Yup.object().when(['$redisSetupType'], {
      is: (redisSetupType: any) => redisSetupType === 'replica',
      then: (schema) => schema.shape({
        address: Yup.string()
          .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
          .nullable(),
        addresses: Yup.array().of(
          Yup.string()
            .required('Replica address is required')
            .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
        ).min(1, 'At least one replica address is required'),
      }),
      otherwise: (schema) => schema.shape({
        address: Yup.string()
          .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
          .nullable(),
        addresses: Yup.array().of(
          Yup.string().matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
        ),
      }),
    }),

    // Sentinels configuration
    sentinels: Yup.object().when(['$redisSetupType'], {
      is: (redisSetupType: any) => redisSetupType === 'sentinels',
      then: (schema) => schema.shape({
        master: Yup.string()
          .required('Redis Sentinel master name is required')
          .matches(/^\S+$/, 'Master name cannot contain spaces'),
        addresses: Yup.array().of(
          Yup.string()
            .required('Sentinel address is required')
            .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
        ).min(1, 'At least one sentinel address is required'),
        username: Yup.string()
          .matches(/^\S*$/, 'Username cannot contain spaces')
          .nullable(),
        password: Yup.string()
          .matches(/^\S*$/, 'Password cannot contain spaces')
          .nullable(),
      }),
      otherwise: (schema) => schema.shape({
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
    }),

    // Cluster configuration
    cluster: Yup.object().when(['$redisSetupType'], {
      is: (redisSetupType: any) => redisSetupType === 'cluster',
      then: (schema) => schema.shape({
        addresses: Yup.array().of(
          Yup.string()
            .required('Cluster address is required')
            .matches(/^[a-zA-Z0-9.-]+:\d+$/, 'Address must be in the format hostname:port')
        ).min(1, 'At least one cluster address is required'),
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
          .required('Max redirects is required')
          .min(0, 'Must be at least 0'),
        read_timeout: Yup.string()
          .required('Read timeout is required')
          .matches(/^\d+[smh]$/, 'Must be in format like 3s, 1m, 1h'),
        write_timeout: Yup.string()
          .required('Write timeout is required')
          .matches(/^\d+[smh]$/, 'Must be in format like 3s, 1m, 1h'),
      }),
      otherwise: (schema) => schema.shape({
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
  }),
});

const RedisConfig = (): React.JSX.Element | null => {
  const { config, updateConfigSection, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();

  // Reset unsaved changes flag when the component mounts
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

  const initialValues: RedisFormValues = {
    redis: {
      database_number: config.server.redis.database_number || 0,
      prefix: config.server.redis.prefix || '',
      password_nonce: config.server.redis.password_nonce || '',
      pool_size: config.server.redis.pool_size || 10,
      idle_pool_size: config.server.redis.idle_pool_size || 0,
      positive_cache_ttl: config.server.redis.positive_cache_ttl || '5m',
      negative_cache_ttl: config.server.redis.negative_cache_ttl || '1m',

      // Connection & timeouts tuning (use empty to show placeholders with backend defaults)
      pool_timeout: config.server.redis.pool_timeout || '',
      dial_timeout: config.server.redis.dial_timeout || '',
      read_timeout: config.server.redis.read_timeout || '',
      write_timeout: config.server.redis.write_timeout || '',
      pool_fifo: config.server.redis.pool_fifo ?? true,
      conn_max_idle_time: config.server.redis.conn_max_idle_time || '',
      max_retries: typeof config.server.redis.max_retries === 'number' ? config.server.redis.max_retries : '',

      // TLS configuration
      tls: {
        enabled: config.server.redis.tls?.enabled || false,
        cert: config.server.redis.tls?.cert || '',
        key: config.server.redis.tls?.key || '',
        skip_verify: config.server.redis.tls?.skip_verify || false,
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

  const handleSubmit = async (values: RedisFormValues) => {
    try {
      // Create a filtered Redis configuration based on the selected setup type
      const filteredRedis: ServerConfigType['redis'] = {
        // Common configuration
        database_number: values.redis.database_number,
        prefix: values.redis.prefix,
        password_nonce: values.redis.password_nonce,
        pool_size: values.redis.pool_size,
        idle_pool_size: values.redis.idle_pool_size,
        positive_cache_ttl: values.redis.positive_cache_ttl,
        negative_cache_ttl: values.redis.negative_cache_ttl,
        tls: values.redis.tls,
      };

      // Optional connection & timeouts tuning
      if (values.redis.pool_timeout) filteredRedis.pool_timeout = values.redis.pool_timeout;
      if (values.redis.dial_timeout) filteredRedis.dial_timeout = values.redis.dial_timeout;
      if (values.redis.read_timeout) filteredRedis.read_timeout = values.redis.read_timeout;
      if (values.redis.write_timeout) filteredRedis.write_timeout = values.redis.write_timeout;
      if (typeof values.redis.pool_fifo === 'boolean') filteredRedis.pool_fifo = values.redis.pool_fifo;
      if (values.redis.conn_max_idle_time) filteredRedis.conn_max_idle_time = values.redis.conn_max_idle_time;
      if (values.redis.max_retries !== '' && values.redis.max_retries !== undefined && values.redis.max_retries !== null) {
        // ensure number
        const mr = values.redis.max_retries;
        // mr is narrowed to a number by the guard above; Number(...) is a no-op for numbers
        filteredRedis.max_retries = Number(mr);
      }

      // Add configuration specific to the selected setup type
      if (redisSetupType === 'master') {
        filteredRedis.master = values.redis.master;
        // Ensure other setup types are not included
        filteredRedis.replica = undefined;
        filteredRedis.sentinels = undefined;
        filteredRedis.cluster = undefined;
      } else if (redisSetupType === 'replica') {
        filteredRedis.replica = values.redis.replica;
        // Ensure other setup types are not included
        filteredRedis.master = undefined;
        filteredRedis.sentinels = undefined;
        filteredRedis.cluster = undefined;
      } else if (redisSetupType === 'sentinels') {
        filteredRedis.sentinels = values.redis.sentinels;
        // Ensure other setup types are not included
        filteredRedis.master = undefined;
        filteredRedis.replica = undefined;
        filteredRedis.cluster = undefined;
      } else if (redisSetupType === 'cluster') {
        filteredRedis.cluster = values.redis.cluster;
        // Ensure other setup types are not included
        filteredRedis.master = undefined;
        filteredRedis.replica = undefined;
        filteredRedis.sentinels = undefined;
      }

      // Update the server configuration with the filtered Redis configuration
      await updateConfigSection('server', { redis: filteredRedis });
    } catch (error) {
      console.error('Error updating Redis configuration:', error);
    }
  };

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={RedisConfigSchema}
      validationContext={{ redisSetupType }}
      onSubmit={handleSubmit}
      enableReinitialize={true}
      validateOnChange={true}
      validateOnBlur={true}
    >
      {({ errors, touched, values, handleChange, setFieldValue }) => (
        <Form>

          <FormSection
            title="Redis Configuration"
            description="Configure Redis settings for caching and session management."
          >
            <Grid container spacing={3}>
              <Grid size={12}>
                <FormControl component="fieldset">
                  <FormLabel component="legend">Redis Setup Type <InfoTooltip title="Choose how your Redis is deployed: standalone, replica set, Sentinel, or Cluster." /></FormLabel>
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
              <Grid size={{ xs: 12, md: 6 }}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.database_number"
                  label="Database Number"
                  variant="outlined"
                  type="number"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Redis logical database index (0-15)." /></InputAdornment>
                  ), inputProps: { min: 0, max: 15 } }}
                  error={getIn(touched, 'redis.database_number') && Boolean(getIn(errors, 'redis.database_number'))}
                  helperText={(getIn(touched, 'redis.database_number') && getIn(errors, 'redis.database_number')) || "Redis database number (0-15)"}
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
                  name="redis.prefix"
                  label="Key Prefix"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Optional prefix added to all Redis keys." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.prefix') && Boolean(getIn(errors, 'redis.prefix'))}
                  helperText={(getIn(touched, 'redis.prefix') && getIn(errors, 'redis.prefix')) || "Prefix for Redis keys"}
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
                  name="redis.password_nonce"
                  label="Password Nonce"
                  infoTitle="Random string to salt/encrypt stored passwords. Minimum 16 chars; keep it secret."
                  variant="outlined"
                  error={getIn(touched, 'redis.password_nonce') && Boolean(getIn(errors, 'redis.password_nonce'))}
                  helperText={(getIn(touched, 'redis.password_nonce') && getIn(errors, 'redis.password_nonce')) || "Nonce for password encryption (min 16 characters, can include symbols)"}
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
                  name="redis.pool_size"
                  label="Pool Size"
                  variant="outlined"
                  type="number"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Maximum number of open Redis connections." /></InputAdornment>
                  ), inputProps: { min: 1 } }}
                  error={getIn(touched, 'redis.pool_size') && Boolean(getIn(errors, 'redis.pool_size'))}
                  helperText={(getIn(touched, 'redis.pool_size') && getIn(errors, 'redis.pool_size')) || "Size of the connection pool"}
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
                  name="redis.idle_pool_size"
                  label="Idle Pool Size"
                  variant="outlined"
                  type="number"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Number of idle connections kept for reuse." /></InputAdornment>
                  ), inputProps: { min: 0 } }}
                  error={getIn(touched, 'redis.idle_pool_size') && Boolean(getIn(errors, 'redis.idle_pool_size'))}
                  helperText={(getIn(touched, 'redis.idle_pool_size') && getIn(errors, 'redis.idle_pool_size')) || "Number of idle connections allowed"}
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
                  name="redis.positive_cache_ttl"
                  label="Positive Cache TTL"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Time-to-live for successful auth cache entries (e.g., 5m)." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.positive_cache_ttl') && Boolean(getIn(errors, 'redis.positive_cache_ttl'))}
                  helperText={(getIn(touched, 'redis.positive_cache_ttl') && getIn(errors, 'redis.positive_cache_ttl')) || "Duration format (e.g., 5m, 1h)"}
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
                  name="redis.negative_cache_ttl"
                  label="Negative Cache TTL"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Time-to-live for failed auth cache entries (e.g., 30s, 1m)." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.negative_cache_ttl') && Boolean(getIn(errors, 'redis.negative_cache_ttl'))}
                  helperText={(getIn(touched, 'redis.negative_cache_ttl') && getIn(errors, 'redis.negative_cache_ttl')) || "Duration format (e.g., 1m, 30s)"}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
            </Grid>
          </FormSection>

          {/* Connection & Timeouts */}
          <CollapsibleFormSection
            title="Redis Connection & Timeouts"
            description="Tune how the UI connects to Redis. Leave fields empty to use server defaults."
            defaultExpanded={false}
         >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.pool_timeout"
                  label="Pool Timeout"
                  placeholder="80ms"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Time to wait for a free connection from the pool before failing (default 80ms)." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.pool_timeout') && Boolean(getIn(errors, 'redis.pool_timeout'))}
                  helperText={(getIn(touched, 'redis.pool_timeout') && getIn(errors, 'redis.pool_timeout')) || "Duration like 80ms, 3s, 1m"}
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
                  name="redis.dial_timeout"
                  label="Dial Timeout"
                  placeholder="200ms"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="TCP connect timeout (default 200ms)." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.dial_timeout') && Boolean(getIn(errors, 'redis.dial_timeout'))}
                  helperText={(getIn(touched, 'redis.dial_timeout') && getIn(errors, 'redis.dial_timeout')) || "Duration like 200ms, 1s"}
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
                  name="redis.read_timeout"
                  label="Read Timeout"
                  placeholder="100ms"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Per-read operation timeout (default 100ms)." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.read_timeout') && Boolean(getIn(errors, 'redis.read_timeout'))}
                  helperText={(getIn(touched, 'redis.read_timeout') && getIn(errors, 'redis.read_timeout')) || "Duration like 100ms, 1s"}
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
                  name="redis.write_timeout"
                  label="Write Timeout"
                  placeholder="100ms"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Per-write operation timeout (default 100ms)." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.write_timeout') && Boolean(getIn(errors, 'redis.write_timeout'))}
                  helperText={(getIn(touched, 'redis.write_timeout') && getIn(errors, 'redis.write_timeout')) || "Duration like 100ms, 1s"}
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
                      checked={Boolean(values.redis.pool_fifo)}
                      onChange={(e) => {
                        setFieldValue('redis.pool_fifo', e.target.checked)
                          .then(() => setHasUnsavedChanges(true));
                      }}
                      name="redis.pool_fifo"
                    />
                  }
                  label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Use FIFO Connection Pool<InfoTooltip title="Controls connection pool order. On = FIFO (first in, first out); Off = LIFO (last in, first out)." /></Box>}
                />
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.conn_max_idle_time"
                  label="Conn Max Idle Time"
                  placeholder="90s"
                  variant="outlined"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Max time a connection may remain idle before being closed (default 90s)." /></InputAdornment>
                  ) }}
                  error={getIn(touched, 'redis.conn_max_idle_time') && Boolean(getIn(errors, 'redis.conn_max_idle_time'))}
                  helperText={(getIn(touched, 'redis.conn_max_idle_time') && getIn(errors, 'redis.conn_max_idle_time')) || "Duration like 90s, 1m, 5m"}
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
                  name="redis.max_retries"
                  label="Max Retries"
                  placeholder="1"
                  variant="outlined"
                  type="number"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Maximum retry count for failed operations (default 1)." /></InputAdornment>
                  ), inputProps: { min: 0 } }}
                  error={getIn(touched, 'redis.max_retries') && Boolean(getIn(errors, 'redis.max_retries'))}
                  helperText={(getIn(touched, 'redis.max_retries') && getIn(errors, 'redis.max_retries')) || "Non-negative integer"}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          {/* TLS Configuration */}
          <CollapsibleFormSection
            title="Redis TLS Configuration"
            description="Configure TLS settings for Redis connections."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.redis.tls?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('redis.tls.enabled', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="redis.tls.enabled"
                    />
                  }
                  label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable TLS<InfoTooltip title="Use TLS when connecting to Redis. Provide cert/key below if required." /></Box>}
                />
              </Grid>
              {values.redis.tls?.enabled && (
                <>
                  <Grid size={{ xs: 12, md: 12 }}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="redis.tls.cert"
                      label="TLS Certificate Path"
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Path to client certificate for Redis TLS (if needed)." /></InputAdornment>
                      ) }}
                      variant="outlined"
                      error={getIn(touched, 'redis.tls.cert') && Boolean(getIn(errors, 'redis.tls.cert'))}
                      helperText={getIn(touched, 'redis.tls.cert') && getIn(errors, 'redis.tls.cert')}
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 12 }}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="redis.tls.key"
                      label="TLS Key Path"
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Path to private key matching the TLS certificate." /></InputAdornment>
                      ) }}
                      variant="outlined"
                      error={getIn(touched, 'redis.tls.key') && Boolean(getIn(errors, 'redis.tls.key'))}
                      helperText={getIn(touched, 'redis.tls.key') && getIn(errors, 'redis.tls.key')}
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
                          checked={values.redis.tls?.skip_verify || false}
                          onChange={(e) => {
                            setFieldValue('redis.tls.skip_verify', e.target.checked)
                                .then(() => setHasUnsavedChanges(true));
                          }}
                          name="redis.tls.skip_verify"
                        />
                      }
                      label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Skip TLS Verification<InfoTooltip title="Do not verify Redis TLS certificates. Unsafe; use only for testing." /></Box>}
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
                <Grid size={{ xs: 12, md: 12 }}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.master.address"
                    label="Master Address"
                                        InputProps={{ endAdornment: (
                                          <InputAdornment position="end"><InfoTooltip title="Hostname and port of the Redis master (e.g., localhost:6379)." /></InputAdornment>
                                        ) }}
                    variant="outlined"
                    placeholder="localhost:6379"
                    error={getIn(touched, 'redis.master.address') && Boolean(getIn(errors, 'redis.master.address'))}
                    helperText={(getIn(touched, 'redis.master.address') && getIn(errors, 'redis.master.address')) || "Redis master address in the format hostname:port"}
                    onChange={(e: React.ChangeEvent<any>) => {
                      handleChange(e);
                      setHasUnsavedChanges(true);
                    }}
                  />
                </Grid>
                <Grid size={12}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Field
                        as={TextField}
                        fullWidth
                        name="redis.master.username"
                        label="Username"
                        InputProps={{ endAdornment: (
                          <InputAdornment position="end"><InfoTooltip title="Redis username for ACL-enabled deployments (optional)." /></InputAdornment>
                        ) }}
                        variant="outlined"
                        error={getIn(touched, 'redis.master.username') && Boolean(getIn(errors, 'redis.master.username'))}
                        helperText={(getIn(touched, 'redis.master.username') && getIn(errors, 'redis.master.username')) || "Redis username (optional)"}
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Field
                        as={PasswordField}
                        fullWidth
                        name="redis.master.password"
                        label="Password"
                        infoTitle="Password for the Redis user (if required). Keep it secret."
                        variant="outlined"
                        error={getIn(touched, 'redis.master.password') && Boolean(getIn(errors, 'redis.master.password'))}
                        helperText={(getIn(touched, 'redis.master.password') && getIn(errors, 'redis.master.password')) || "Redis password (optional)"}
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </Grid>
                  </Grid>
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
                <Grid size={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Replica Addresses</Typography>
                  <FieldArray name="redis.replica.addresses">
                    {({ push, remove}) => (
                      <div>
                        {values.redis.replica?.addresses && values.redis.replica.addresses.length > 0 ? (
                          values.redis.replica.addresses.map((_address, index) => (
                            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`redis.replica.addresses[${index}]`}
                                label={`Replica Address ${index + 1}`}
                                variant="outlined"
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Replica address in hostname:port format." /></InputAdornment>
                                ) }}
                                placeholder="localhost:6379"
                                error={getIn(touched, `redis.replica.addresses[${index}]`) && Boolean(getIn(errors, `redis.replica.addresses[${index}]`))}
                                helperText={(getIn(touched, `redis.replica.addresses[${index}]`) && getIn(errors, `redis.replica.addresses[${index}]`)) || "Redis replica address in the format hostname:port"}
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
                          <Typography color="textSecondary" sx={{ mb: 2 }}>No replica addresses added yet.</Typography>
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
                <Grid size={{ xs: 12, md: 12 }}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="redis.sentinels.master"
                    label="Master Name"
                    variant="outlined"
                    InputProps={{ endAdornment: (
                      <InputAdornment position="end"><InfoTooltip title="Name of the master as configured in Sentinel." /></InputAdornment>
                    ) }}
                    error={getIn(touched, 'redis.sentinels.master') && Boolean(getIn(errors, 'redis.sentinels.master'))}
                    helperText={(getIn(touched, 'redis.sentinels.master') && getIn(errors, 'redis.sentinels.master')) || "Name of the master instance in Sentinel"}
                    onChange={(e: React.ChangeEvent<any>) => {
                      handleChange(e);
                      setHasUnsavedChanges(true);
                    }}
                  />
                </Grid>
                <Grid size={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Sentinel Addresses</Typography>
                  <FieldArray name="redis.sentinels.addresses">
                    {({ push, remove}) => (
                      <div>
                        {values.redis.sentinels?.addresses && values.redis.sentinels.addresses.length > 0 ? (
                          values.redis.sentinels.addresses.map((_address, index) => (
                            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`redis.sentinels.addresses[${index}]`}
                                label={`Sentinel Address ${index + 1}`}
                                variant="outlined"
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Sentinel address in hostname:port format." /></InputAdornment>
                                ) }}
                                placeholder="localhost:26379"
                                error={getIn(touched, `redis.sentinels.addresses[${index}]`) && Boolean(getIn(errors, `redis.sentinels.addresses[${index}]`))}
                                helperText={(getIn(touched, `redis.sentinels.addresses[${index}]`) && getIn(errors, `redis.sentinels.addresses[${index}]`)) || "Redis sentinel address in the format hostname:port"}
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
                          <Typography color="textSecondary" sx={{ mb: 2 }}>No sentinel addresses added yet.</Typography>
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
                          Add Sentinel Address
                        </Button>
                      </div>
                    )}
                  </FieldArray>
                </Grid>
                <Grid size={12}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Field
                        as={TextField}
                        fullWidth
                        name="redis.sentinels.username"
                        label="Username"
                        InputProps={{ endAdornment: (
                          <InputAdornment position="end"><InfoTooltip title="Sentinel username if authentication is enabled (optional)." /></InputAdornment>
                        ) }}
                        variant="outlined"
                        error={getIn(touched, 'redis.sentinels.username') && Boolean(getIn(errors, 'redis.sentinels.username'))}
                        helperText={(getIn(touched, 'redis.sentinels.username') && getIn(errors, 'redis.sentinels.username')) || "Sentinel username (optional)"}
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Field
                        as={PasswordField}
                        fullWidth
                        name="redis.sentinels.password"
                        label="Password"
                        infoTitle="Password for Sentinel authentication (optional)."
                        variant="outlined"
                        error={getIn(touched, 'redis.sentinels.password') && Boolean(getIn(errors, 'redis.sentinels.password'))}
                        helperText={(getIn(touched, 'redis.sentinels.password') && getIn(errors, 'redis.sentinels.password')) || "Sentinel password (optional)"}
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </Grid>
                  </Grid>
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
                <Grid size={12}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Cluster Addresses</Typography>
                  <FieldArray name="redis.cluster.addresses">
                    {({ push, remove}) => (
                      <div>
                        {values.redis.cluster?.addresses && values.redis.cluster.addresses.length > 0 ? (
                          values.redis.cluster.addresses.map((_address, index) => (
                            <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                name={`redis.cluster.addresses[${index}]`}
                                label={`Cluster Address ${index + 1}`}
                                variant="outlined"
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Cluster node address in hostname:port format." /></InputAdornment>
                                ) }}
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
                <Grid size={12}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Field
                        as={TextField}
                        fullWidth
                        name="redis.cluster.username"
                        label="Username"
                        variant="outlined"
                        InputProps={{ endAdornment: (
                          <InputAdornment position="end"><InfoTooltip title="Cluster username if ACL/authentication is enabled (optional)." /></InputAdornment>
                        ) }}
                        error={getIn(touched, 'redis.cluster.username') && Boolean(getIn(errors, 'redis.cluster.username'))}
                        helperText={(getIn(touched, 'redis.cluster.username') && getIn(errors, 'redis.cluster.username')) || "Cluster username (optional)"}
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Field
                        as={PasswordField}
                        fullWidth
                        name="redis.cluster.password"
                        label="Password"
                        infoTitle="Password for Redis Cluster user (optional)."
                        variant="outlined"
                        error={getIn(touched, 'redis.cluster.password') && Boolean(getIn(errors, 'redis.cluster.password'))}
                        helperText={(getIn(touched, 'redis.cluster.password') && getIn(errors, 'redis.cluster.password')) || "Cluster password (optional)"}
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      />
                    </Grid>
                  </Grid>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.redis.cluster?.route_by_latency || false}
                        onChange={(e) => {
                          setFieldValue('redis.cluster.route_by_latency', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        name="redis.cluster.route_by_latency"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Route By Latency<InfoTooltip title="Prefer nodes with the lowest latency when routing requests." /></Box>}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.redis.cluster?.route_randomly || false}
                        onChange={(e) => {
                          setFieldValue('redis.cluster.route_randomly', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        name="redis.cluster.route_randomly"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Route Randomly<InfoTooltip title="Distribute requests randomly across nodes (ignores latency)." /></Box>}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.redis.cluster?.route_reads_to_replicas || false}
                        onChange={(e) => {
                          setFieldValue('redis.cluster.route_reads_to_replicas', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        name="redis.cluster.route_reads_to_replicas"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Route Reads To Replicas<InfoTooltip title="Send read operations to replica nodes when possible." /></Box>}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
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
                <Grid size={{ xs: 12, md: 6 }}>
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
                <Grid size={{ xs: 12, md: 6 }}>
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
