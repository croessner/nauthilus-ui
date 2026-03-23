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
    encryption_secret: Yup.string()
      .required('Encryption secret is required')
      .min(16, 'Encryption secret must be at least 16 characters')
      .matches(/^\S*$/, 'Encryption secret cannot contain spaces')
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
    // Feature flags
    identity_enabled: Yup.boolean().nullable(),
    maint_notifications_enabled: Yup.boolean().nullable(),
    protocol: Yup.number().oneOf([0, 2, 3]).nullable(),

    // Account local cache
    account_local_cache: Yup.object().shape({
      enabled: Yup.boolean(),
      ttl: Yup.string().matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 30s, 5m, 1h').nullable(),
      shards: Yup.number().min(1, 'Must be at least 1').max(1024, 'Must be at most 1024').nullable(),
      cleanup_interval: Yup.string().matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 5s, 1m').nullable(),
      max_items: Yup.number().min(0, 'Must be at least 0').nullable(),
    }),

    // Batching
    batching: Yup.object().shape({
      enabled: Yup.boolean(),
      max_batch_size: Yup.number().min(2, 'Must be at least 2').max(1024, 'Must be at most 1024').nullable(),
      max_wait: Yup.string().matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 2ms, 10ms, 1s').nullable(),
      queue_capacity: Yup.number().min(0, 'Must be at least 0').nullable(),
      skip_commands: Yup.array().of(Yup.string().matches(/^[\w:]+$/i, 'Use simple command names').nullable()).nullable(),
      pipeline_timeout: Yup.string().matches(/^\d+(ms|s|m|h)$/i, 'Use duration like 100ms, 1s').nullable(),
    }),

    // Client Tracking (RESP3 client-side caching)
    client_tracking: Yup.object().shape({
      enabled: Yup.boolean(),
      bcast: Yup.boolean(),
      noloop: Yup.boolean(),
      opt_in: Yup.boolean(),
      opt_out: Yup.boolean(),
      prefixes: Yup.array()
        .of(Yup.string().matches(/^\S*$/, 'No spaces allowed in prefix').nullable())
        .nullable(),
    }).test('optin-optout-exclusive', 'Opt-In and Opt-Out cannot be enabled at the same time', (ct: any) => {
      if (!ct || !ct.enabled) return true;
      return !(ct.opt_in && ct.opt_out);
    }).test('bcast-prefix-exclusive', 'BCAST cannot be combined with PREFIX. Disable BCAST or remove prefixes.', (ct: any) => {
      if (!ct || !ct.enabled) return true;
      const hasPrefixes = Array.isArray(ct.prefixes) && ct.prefixes.filter((p: any) => (p || '').trim() !== '').length > 0;
      return !(ct.bcast && hasPrefixes);
    }),

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
      ca_file: Yup.string().nullable(),
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
      encryption_secret: config.server.redis.encryption_secret || '',
      pool_size: config.server.redis.pool_size || 10,
      idle_pool_size: config.server.redis.idle_pool_size || 0,
      positive_cache_ttl: config.server.redis.positive_cache_ttl || '5m',
      negative_cache_ttl: config.server.redis.negative_cache_ttl || '1m',
      // Feature flags
      identity_enabled: config.server.redis.identity_enabled ?? false,
      maint_notifications_enabled: config.server.redis.maint_notifications_enabled ?? false,
      protocol: config.server.redis.protocol ?? 2,

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
        ca_file: config.server.redis.tls?.ca_file || '',
        skip_verify: config.server.redis.tls?.skip_verify || false,
        min_tls_version: config.server.redis.tls?.min_tls_version || 'TLS1.2',
        cipher_suites: config.server.redis.tls?.cipher_suites || [],
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

      // Account local cache
      account_local_cache: {
        enabled: config.server.redis.account_local_cache?.enabled || false,
        ttl: config.server.redis.account_local_cache?.ttl || '',
        shards: config.server.redis.account_local_cache?.shards ?? undefined,
        cleanup_interval: config.server.redis.account_local_cache?.cleanup_interval || '',
        max_items: config.server.redis.account_local_cache?.max_items ?? undefined,
      },

      // Batching
      batching: {
        enabled: config.server.redis.batching?.enabled || false,
        max_batch_size: config.server.redis.batching?.max_batch_size ?? undefined,
        max_wait: config.server.redis.batching?.max_wait || '',
        queue_capacity: config.server.redis.batching?.queue_capacity ?? undefined,
        skip_commands: config.server.redis.batching?.skip_commands?.length ? config.server.redis.batching.skip_commands : [''],
        pipeline_timeout: config.server.redis.batching?.pipeline_timeout || '',
      },

      // Client Tracking
      client_tracking: {
        enabled: config.server.redis.client_tracking?.enabled || false,
        bcast: config.server.redis.client_tracking?.bcast || false,
        noloop: config.server.redis.client_tracking?.noloop || false,
        opt_in: config.server.redis.client_tracking?.opt_in || false,
        opt_out: config.server.redis.client_tracking?.opt_out || false,
        prefixes: config.server.redis.client_tracking?.prefixes?.length ? config.server.redis.client_tracking.prefixes : [''],
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
        encryption_secret: values.redis.encryption_secret,
        pool_size: values.redis.pool_size,
        idle_pool_size: values.redis.idle_pool_size,
        positive_cache_ttl: values.redis.positive_cache_ttl,
        negative_cache_ttl: values.redis.negative_cache_ttl,
        tls: values.redis.tls,
        // Feature flags
        identity_enabled: Boolean(values.redis.identity_enabled),
        maint_notifications_enabled: Boolean(values.redis.maint_notifications_enabled),
        protocol: values.redis.protocol as 0 | 2 | 3,
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

      // Account local cache
      if (values.redis.account_local_cache) {
        const alc: any = { enabled: Boolean(values.redis.account_local_cache.enabled) };
        if (values.redis.account_local_cache.ttl) alc.ttl = values.redis.account_local_cache.ttl;
        if (typeof values.redis.account_local_cache.shards === 'number') alc.shards = values.redis.account_local_cache.shards;
        if (values.redis.account_local_cache.cleanup_interval) alc.cleanup_interval = values.redis.account_local_cache.cleanup_interval;
        if (typeof values.redis.account_local_cache.max_items === 'number') alc.max_items = values.redis.account_local_cache.max_items;
        filteredRedis.account_local_cache = alc;
      }

      // Batching
      if (values.redis.batching) {
        const bt: any = { enabled: Boolean(values.redis.batching.enabled) };
        if (typeof values.redis.batching.max_batch_size === 'number') bt.max_batch_size = values.redis.batching.max_batch_size;
        if (values.redis.batching.max_wait) bt.max_wait = values.redis.batching.max_wait;
        if (typeof values.redis.batching.queue_capacity === 'number') bt.queue_capacity = values.redis.batching.queue_capacity;
        if (Array.isArray(values.redis.batching.skip_commands)) {
          const sc = values.redis.batching.skip_commands.filter((s) => (s || '').trim() !== '');
          if (sc.length) bt.skip_commands = sc;
        }
        if (values.redis.batching.pipeline_timeout) bt.pipeline_timeout = values.redis.batching.pipeline_timeout;
        filteredRedis.batching = bt;
      }

      // Client Tracking
      if (values.redis.client_tracking) {
        const ctSrc = values.redis.client_tracking as any;
        const ct: any = { enabled: Boolean(ctSrc.enabled) };
        if (typeof ctSrc.bcast === 'boolean') ct.bcast = ctSrc.bcast;
        if (typeof ctSrc.noloop === 'boolean') ct.noloop = ctSrc.noloop;
        if (typeof ctSrc.opt_in === 'boolean') ct.opt_in = ctSrc.opt_in;
        if (typeof ctSrc.opt_out === 'boolean') ct.opt_out = ctSrc.opt_out;
        if (Array.isArray(ctSrc.prefixes)) {
          const pf = ctSrc.prefixes.filter((p: any) => (p || '').trim() !== '');
          if (pf.length) ct.prefixes = pf;
        }
        filteredRedis.client_tracking = ct;
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
              {/* Other common settings */}
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
                  as={PasswordField}
                  fullWidth
                  name="redis.encryption_secret"
                  label="Encryption Secret"
                  infoTitle="Secret used to encrypt Redis-stored values. Minimum 16 chars; keep it secret."
                  variant="outlined"
                  error={getIn(touched, 'redis.encryption_secret') && Boolean(getIn(errors, 'redis.encryption_secret'))}
                  helperText={(getIn(touched, 'redis.encryption_secret') && getIn(errors, 'redis.encryption_secret')) || "Secret for Redis value encryption (min 16 characters, can include symbols)"}
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

              {/* Compatibility settings header and side-by-side switches */}
              <Grid size={12}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Compatibility settings
                </Typography>
                <Grid container spacing={2} alignItems="flex-end">
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(values.redis.identity_enabled)}
                          onChange={(e) => {
                            setFieldValue('redis.identity_enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                          }}
                          name="redis.identity_enabled"
                        />
                      }
                      label={
                        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                          Enable CLIENT SETINFO
                          <InfoTooltip title="When enabled, the application sends CLIENT SETINFO to Redis." />
                        </Box>
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(values.redis.maint_notifications_enabled)}
                          onChange={(e) => {
                            setFieldValue('redis.maint_notifications_enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                          }}
                          name="redis.maint_notifications_enabled"
                        />
                      }
                      label={
                        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                          Enable CLIENT MAINT_NOTIFICATIONS
                          <InfoTooltip title="When enabled, the application sends CLIENT MAINT_NOTIFICATIONS to Redis." />
                        </Box>
                      }
                    />
                  </Grid>
                  <Grid size={12} sx={{ mt: 1 }}>
                    <FormControl component="fieldset">
                      <FormLabel component="legend">
                        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                          Redis Protocol
                          <InfoTooltip title="Select the Redis RESP protocol version." />
                        </Box>
                      </FormLabel>
                      <RadioGroup
                        row
                        name="redis.protocol"
                        value={values.redis.protocol ?? 2}
                        onChange={(e) => {
                          void setFieldValue('redis.protocol', parseInt(e.target.value, 10));
                          setHasUnsavedChanges(true);
                        }}
                      >
                        <FormControlLabel value={0} control={<Radio />} label="auto (0)" />
                        <FormControlLabel value={2} control={<Radio />} label="RESP2" />
                        <FormControlLabel value={3} control={<Radio />} label="RESP3" />
                      </RadioGroup>
                    </FormControl>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </FormSection>

          <CollapsibleFormSection
            title="Account Local Cache"
            description="Configure in-process cache for username → account mapping."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 12, md: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(values.redis.account_local_cache?.enabled)}
                      onChange={(e) => {
                        void setFieldValue('redis.account_local_cache.enabled', e.target.checked);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  }
                  label={<Typography>Enabled <InfoTooltip title="Toggle the in-process account cache." /></Typography>}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.account_local_cache.ttl"
                  label="TTL"
                  placeholder="e.g., 5m"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Entry time-to-live, e.g., 5m, 1h. Empty to use server default." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.account_local_cache.ttl') && Boolean(getIn(errors, 'redis.account_local_cache.ttl'))}
                  helperText={getIn(touched, 'redis.account_local_cache.ttl') && getIn(errors, 'redis.account_local_cache.ttl')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  type="number"
                  name="redis.account_local_cache.shards"
                  label="Shards"
                  placeholder="e.g., 256"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Number of hash shards (1–1024)." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.account_local_cache.shards') && Boolean(getIn(errors, 'redis.account_local_cache.shards'))}
                  helperText={getIn(touched, 'redis.account_local_cache.shards') && getIn(errors, 'redis.account_local_cache.shards')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.account_local_cache.cleanup_interval"
                  label="Cleanup Interval"
                  placeholder="e.g., 30s"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Cleanup sweep interval." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.account_local_cache.cleanup_interval') && Boolean(getIn(errors, 'redis.account_local_cache.cleanup_interval'))}
                  helperText={getIn(touched, 'redis.account_local_cache.cleanup_interval') && getIn(errors, 'redis.account_local_cache.cleanup_interval')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  type="number"
                  name="redis.account_local_cache.max_items"
                  label="Max Items"
                  placeholder="0 = unlimited"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Upper bound on items; 0 for unlimited." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.account_local_cache.max_items') && Boolean(getIn(errors, 'redis.account_local_cache.max_items'))}
                  helperText={getIn(touched, 'redis.account_local_cache.max_items') && getIn(errors, 'redis.account_local_cache.max_items')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Redis Client Tracking"
            description="Enable RESP3 client-side caching via Redis CLIENT TRACKING. When enabled, read replies can be served from a per-connection cache, and Redis pushes invalidation messages whenever cached keys change. Requires Redis 6+ and RESP3. Choose the options below to balance cache hit rate, correctness, and network churn."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <Typography variant="body2" color="text.secondary" component="div" sx={{ mt: -1 }}>
                  <strong>Guidance:</strong>
                  <ul style={{ marginTop: 4, marginBottom: 0 }}>
                    <li>Read-heavy workloads: use Default or Opt-Out with NoLoop for best hit rate.</li>
                    <li>Mixed or correctness-sensitive paths: use Opt-In so only selected reads are cached (requires client to send <code>CACHING yes</code>).</li>
                    <li>Many distinct/unpredictable keys: consider Broadcast (BCAST) + NoLoop; expect more invalidation traffic.</li>
                    <li>Known key namespaces: prefer PREFIX filters to limit tracking to specific keyspaces (cannot be combined with BCAST).</li>
                  </ul>
                </Typography>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(values.redis.client_tracking?.enabled)}
                      onChange={async (e) => {
                        await setFieldValue('redis.client_tracking.enabled', e.target.checked);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  }
                  label={<Typography>Enabled <InfoTooltip title="Turn on Redis CLIENT TRACKING for this server's Redis connections (Redis 6+, RESP3). The client keeps a per-connection read cache and receives server push invalidations when keys change." /></Typography>}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(values.redis.client_tracking?.bcast)}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        await setFieldValue('redis.client_tracking.bcast', checked);
                        // BCAST cannot be combined with PREFIX; clear prefixes when enabling to avoid conflicts
                        if (checked) {
                          await setFieldValue('redis.client_tracking.prefixes', ['']);
                        }
                        setHasUnsavedChanges(true);
                      }}
                    />
                  }
                  label={<Typography>Broadcast (BCAST) <InfoTooltip title="Broadcast mode: Redis sends invalidations for any key change, and the client drops notifications for keys it does not cache. Useful when you read many distinct/unpredictable keys. Increases network traffic. Incompatible with PREFIX filters." /></Typography>}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(values.redis.client_tracking?.noloop)}
                      onChange={async (e) => {
                        await setFieldValue('redis.client_tracking.noloop', e.target.checked);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  }
                  label={<Typography>NoLoop <InfoTooltip title="Do not receive invalidations for writes issued by the same connection. Reduces churn after your own writes, but the cache may be briefly stale immediately after you write." /></Typography>}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 12, md: 12 }}>
                <FormControl component="fieldset">
                  <FormLabel component="legend">Tracking Mode</FormLabel>
                  <RadioGroup
                    row
                    value={values.redis.client_tracking?.opt_in ? 'opt_in' : values.redis.client_tracking?.opt_out ? 'opt_out' : 'default'}
                    onChange={async (_e, v) => {
                      if (v === 'opt_in') {
                        await setFieldValue('redis.client_tracking.opt_in', true);
                        await setFieldValue('redis.client_tracking.opt_out', false);
                      } else if (v === 'opt_out') {
                        await setFieldValue('redis.client_tracking.opt_in', false);
                        await setFieldValue('redis.client_tracking.opt_out', true);
                      } else {
                        await setFieldValue('redis.client_tracking.opt_in', false);
                        await setFieldValue('redis.client_tracking.opt_out', false);
                      }
                      setHasUnsavedChanges(true);
                    }}
                  >
                    <FormControlLabel value="default" control={<Radio />} label={<Typography>Default <InfoTooltip title="Track all reads (neither OPTIN nor OPTOUT). Per-command CACHING hints are ignored. Choose when you want caching for all read commands and do not need per-command control." /></Typography>} />
                    <FormControlLabel value="opt_in" control={<Radio />} label={<Typography>Opt-In <InfoTooltip title="Only track reads explicitly tagged with 'CACHING yes'. Good when most reads should not be cached or when you need tight control. Requires the client to send the CACHING modifier." /></Typography>} />
                    <FormControlLabel value="opt_out" control={<Radio />} label={<Typography>Opt-Out <InfoTooltip title="Track reads by default, but allow opting out per-command with 'CACHING no'. Suited for read-heavy paths that occasionally require strict consistency." /></Typography>} />
                  </RadioGroup>
                  {getIn(errors, 'redis.client_tracking') && values.redis.client_tracking?.enabled && (
                    <Typography color="error" variant="body2">{String(getIn(errors, 'redis.client_tracking'))}</Typography>
                  )}
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Prefix Filters
                  <InfoTooltip title="Limit tracking to specific key prefixes (Redis TRACKING PREFIX), e.g., 'nt:'. Reduces invalidations and memory overhead by focusing on known namespaces. Cannot be used together with BCAST." />
                </Typography>
                <FieldArray name="redis.client_tracking.prefixes">
                  {({ push, remove }) => (
                    <Box>
                      {values.redis.client_tracking?.prefixes?.map((_pfx, idx) => (
                        <Box key={idx} display="flex" alignItems="center" gap={1} mb={1}>
                          <Field
                            as={TextField}
                            fullWidth
                            disabled={Boolean(values.redis.client_tracking?.bcast)}
                            name={`redis.client_tracking.prefixes.${idx}`}
                            placeholder="e.g., nt:"
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                          <IconButton aria-label="delete" disabled={Boolean(values.redis.client_tracking?.bcast)} onClick={() => { remove(idx); setHasUnsavedChanges(true); }}>
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      ))}
                      <Button
                        startIcon={<AddIcon />}
                        variant="outlined"
                        size="small"
                        disabled={Boolean(values.redis.client_tracking?.bcast)}
                        onClick={() => { push(''); setHasUnsavedChanges(true); }}
                      >
                        Add Prefix
                      </Button>
                      {Boolean(values.redis.client_tracking?.bcast) && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          BCAST is enabled: prefix filters are disabled by Redis when BCAST is on.
                        </Typography>
                      )}
                    </Box>
                  )}
                </FieldArray>
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Redis Batching"
            description="Client-side command batching to reduce Redis round-trips."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 12, md: 12 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(values.redis.batching?.enabled)}
                      onChange={(e) => {
                        void setFieldValue('redis.batching.enabled', e.target.checked);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  }
                  label={<Typography>Enabled <InfoTooltip title="Enable client-side command batching." /></Typography>}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  type="number"
                  name="redis.batching.max_batch_size"
                  label="Max Batch Size"
                  placeholder="e.g., 16"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Upper bound of commands in a single pipeline (2–1024)." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.batching.max_batch_size') && Boolean(getIn(errors, 'redis.batching.max_batch_size'))}
                  helperText={getIn(touched, 'redis.batching.max_batch_size') && getIn(errors, 'redis.batching.max_batch_size')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.batching.max_wait"
                  label="Max Wait"
                  placeholder="e.g., 2ms"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Max time to queue before flushing; 0 disables timer." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.batching.max_wait') && Boolean(getIn(errors, 'redis.batching.max_wait'))}
                  helperText={getIn(touched, 'redis.batching.max_wait') && getIn(errors, 'redis.batching.max_wait')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  type="number"
                  name="redis.batching.queue_capacity"
                  label="Queue Capacity"
                  placeholder="e.g., 8192"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Internal queue size; 0 for unbuffered." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.batching.queue_capacity') && Boolean(getIn(errors, 'redis.batching.queue_capacity'))}
                  helperText={getIn(touched, 'redis.batching.queue_capacity') && getIn(errors, 'redis.batching.queue_capacity')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle1" gutterBottom>Skip Commands</Typography>
                <FieldArray name="redis.batching.skip_commands">
                  {({ push, remove }) => (
                    <Box>
                      {values.redis.batching?.skip_commands?.map((_cmd, idx) => (
                        <Box key={idx} display="flex" alignItems="center" gap={1} mb={1}>
                          <Field
                            as={TextField}
                            fullWidth
                            name={`redis.batching.skip_commands.${idx}`}
                            placeholder="e.g., blpop"
                            onChange={(e: React.ChangeEvent<any>) => {
                              handleChange(e);
                              setHasUnsavedChanges(true);
                            }}
                          />
                          <IconButton aria-label="delete" onClick={() => { remove(idx); setHasUnsavedChanges(true); }}>
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      ))}
                      <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={() => { push(''); setHasUnsavedChanges(true); }}>
                        Add Command
                      </Button>
                    </Box>
                  )}
                </FieldArray>
              </Grid>

              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Field
                  as={TextField}
                  fullWidth
                  name="redis.batching.pipeline_timeout"
                  label="Pipeline Timeout"
                  placeholder="e.g., 500ms"
                  InputProps={{ endAdornment: (<InputAdornment position="end"><InfoTooltip title="Max time to wait for a pipeline send." /></InputAdornment>) }}
                  error={getIn(touched, 'redis.batching.pipeline_timeout') && Boolean(getIn(errors, 'redis.batching.pipeline_timeout'))}
                  helperText={getIn(touched, 'redis.batching.pipeline_timeout') && getIn(errors, 'redis.batching.pipeline_timeout')}
                  onChange={(e: React.ChangeEvent<any>) => {
                    handleChange(e);
                    setHasUnsavedChanges(true);
                  }}
                />
              </Grid>
            </Grid>
          </CollapsibleFormSection>

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
                        void setFieldValue('redis.pool_fifo', e.target.checked)
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
                        void setFieldValue('redis.tls.enabled', e.target.checked)
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
                      name="redis.tls.ca_file"
                      label="TLS CA File Path"
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Path to CA certificate file used to validate the Redis server certificate." /></InputAdornment>
                      ) }}
                      variant="outlined"
                      error={getIn(touched, 'redis.tls.ca_file') && Boolean(getIn(errors, 'redis.tls.ca_file'))}
                      helperText={getIn(touched, 'redis.tls.ca_file') && getIn(errors, 'redis.tls.ca_file')}
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
                            void setFieldValue('redis.tls.skip_verify', e.target.checked)
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
                          void setFieldValue('redis.cluster.route_by_latency', e.target.checked)
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
                          void setFieldValue('redis.cluster.route_randomly', e.target.checked)
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
                          void setFieldValue('redis.cluster.route_reads_to_replicas', e.target.checked)
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
