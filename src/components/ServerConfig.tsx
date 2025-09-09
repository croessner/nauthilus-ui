import React from 'react';
import { Formik, Form, Field, getIn } from 'formik';
import * as Yup from 'yup';
import { 
  TextField, 
  FormControlLabel, 
  Grid, 
  Button, 
  Box,
  FormHelperText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Switch,
  InputAdornment
} from '@mui/material';
import { ServerConfig as ServerConfigType } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import InfoTooltip from './common/InfoTooltip';

// Validation schema
const ServerConfigSchema = Yup.object().shape({
  address: Yup.string()
    .required('Address is required')
    .test(
      'is-valid-address-with-port',
      'Address must be a valid IPv4 or IPv6 address with port (e.g., 127.0.0.1:8080 or [::1]:8080)',
      (value) => {
        if (!value) return false;

        // IPv4 with port regex: matches formats like 127.0.0.1:8080
        const ipv4WithPortRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?):[0-9]{1,5}$/;

        // IPv6 with port regex: matches formats like [::1]:8080 or [2001:db8::1]:8080
        const ipv6WithPortRegex = /^\[(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))]:[0-9]{1,5}$/;

        return ipv4WithPortRegex.test(value) || ipv6WithPortRegex.test(value);
      }
    ),
  max_concurrent_requests: Yup.number()
    .min(1, 'Must be at least 1')
    .required('Max concurrent requests is required'),
  max_password_history_entries: Yup.number()
    .min(1, 'Must be at least 1')
    .required('Max password history entries is required'),
  http3: Yup.boolean(),
  haproxy_v2: Yup.boolean(),
  instance_name: Yup.string()
    .min(1, 'Must be at least 1 character')
    .max(255, 'Must be at most 255 characters')
    .required('Instance name is required'),

  // TLS configuration validation
  tls: Yup.object().shape({
    enabled: Yup.boolean(),
    cert: Yup.string().when('enabled', (enabled, schema) => 
      enabled 
        ? schema.required('TLS certificate path is required when TLS is enabled')
        : schema
    ),
    key: Yup.string().when('enabled', (enabled, schema) => 
      enabled 
        ? schema.required('TLS key path is required when TLS is enabled')
        : schema
    ),
    skip_verify: Yup.boolean(),
    ca_file: Yup.string(),
    min_tls_version: Yup.string().oneOf(['TLS1.2', 'TLS1.3'], 'Must be either TLS1.2 or TLS1.3'),
    cipher_suites: Yup.array().of(Yup.string()),
  }),


  // Brute force protocols validation
  brute_force_protocols: Yup.array().of(
    Yup.object().shape({
      name: Yup.string().required('Protocol name is required'),
    })
  ),

  // Insights validation moved to MonitoringConfig

  // Disabled endpoints validation
  disabled_endpoints: Yup.object().shape({
    auth_header: Yup.boolean(),
    auth_json: Yup.boolean(),
    auth_basic: Yup.boolean(),
    auth_nginx: Yup.boolean(),
    auth_saslauthd: Yup.boolean(),
    auth_jwt: Yup.boolean(),
    custom_hooks: Yup.boolean(),
    configuration: Yup.boolean(),
  }),

  // Default HTTP request header validation
  default_http_request_header: Yup.object().shape({
    username: Yup.string(),
    password: Yup.string(),
    password_encoded: Yup.string(),
    protocol: Yup.string(),
    login_attempt: Yup.string(),
    auth_method: Yup.string(),
    local_ip: Yup.string(),
    local_port: Yup.string(),
    client_ip: Yup.string(),
    client_port: Yup.string(),
    client_host: Yup.string(),
    client_id: Yup.string(),
    ssl: Yup.string(),
    ssl_session_id: Yup.string(),
    ssl_verify: Yup.string(),
    ssl_subject: Yup.string(),
    ssl_client_cn: Yup.string(),
    ssl_issuer: Yup.string(),
    ssl_client_not_before: Yup.string(),
    ssl_client_not_after: Yup.string(),
    ssl_subject_dn: Yup.string(),
    ssl_issuer_dn: Yup.string(),
    ssl_client_subject_dn: Yup.string(),
    ssl_client_issuer_dn: Yup.string(),
    ssl_cipher: Yup.string(),
    ssl_protocol: Yup.string(),
    ssl_serial: Yup.string(),
    ssl_fingerprint: Yup.string(),
    oidc_cid: Yup.string(),
  }),

  // Compression validation
  compression: Yup.object().shape({
    enabled: Yup.boolean(),
    level: Yup.number().min(1, 'Must be at least 1').max(9, 'Must be at most 9'),
    content_types: Yup.array().of(Yup.string()),
    min_length: Yup.number().min(0, 'Must be at least 0'),
  }),

  // Keep-Alive validation
  keep_alive: Yup.object().shape({
    enabled: Yup.boolean(),
    timeout: Yup.string(),
    max_idle_connections: Yup.number().min(1, 'Must be at least 1'),
    max_idle_connections_per_host: Yup.number().min(0, 'Must be at least 0'),
  }),

  // HTTP Client validation
  http_client: Yup.object().shape({
    max_connections_per_host: Yup.number().min(1, 'Must be at least 1'),
    max_idle_connections: Yup.number().min(1, 'Must be at least 1'),
    max_idle_connections_per_host: Yup.number().min(0, 'Must be at least 0'),
    idle_connection_timeout: Yup.string(),
    proxy: Yup.string(),
    tls: Yup.object().shape({
      skip_verify: Yup.boolean(),
    }),
  }),
});

const ServerConfig = (): React.JSX.Element | null => {
  const { config, updateConfigSection, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();
  const [customProtocol, setCustomProtocol] = React.useState<string>('');

  // Reset unsaved changes flag when component mounts
  React.useEffect(() => {
    setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  if (!config) {
    return null;
  }

  const initialValues: ServerConfigType = {
    address: config.server.address || '',
    max_concurrent_requests: config.server.max_concurrent_requests || 100,
    max_password_history_entries: config.server.max_password_history_entries || 10,
    http3: config.server.http3 || false,
    haproxy_v2: config.server.haproxy_v2 || false,
    instance_name: config.server.instance_name || 'nauthilus',
    redis: config.server.redis,

    // Initialize TLS configuration
    tls: {
      enabled: config.server.tls?.enabled || false,
      cert: config.server.tls?.cert || '',
      key: config.server.tls?.key || '',
      skip_verify: config.server.tls?.skip_verify || false,
      ca_file: config.server.tls?.ca_file || '',
      min_tls_version: config.server.tls?.min_tls_version || 'TLS1.2',
      cipher_suites: config.server.tls?.cipher_suites || [],
    },


    // Insights configuration is now in MonitoringConfig

    // Initialize disabled endpoints configuration
    disabled_endpoints: {
      auth_header: config.server.disabled_endpoints?.auth_header || false,
      auth_json: config.server.disabled_endpoints?.auth_json || false,
      auth_basic: config.server.disabled_endpoints?.auth_basic || false,
      auth_nginx: config.server.disabled_endpoints?.auth_nginx || false,
      auth_saslauthd: config.server.disabled_endpoints?.auth_saslauthd || false,
      auth_jwt: config.server.disabled_endpoints?.auth_jwt || false,
      custom_hooks: config.server.disabled_endpoints?.custom_hooks || false,
      configuration: config.server.disabled_endpoints?.configuration || false,
    },

    // Initialize default HTTP request header configuration
    default_http_request_header: {
      username: config.server.default_http_request_header?.username || '',
      password: config.server.default_http_request_header?.password || '',
      password_encoded: config.server.default_http_request_header?.password_encoded || '',
      protocol: config.server.default_http_request_header?.protocol || '',
      login_attempt: config.server.default_http_request_header?.login_attempt || '',
      auth_method: config.server.default_http_request_header?.auth_method || '',
      local_ip: config.server.default_http_request_header?.local_ip || '',
      local_port: config.server.default_http_request_header?.local_port || '',
      client_ip: config.server.default_http_request_header?.client_ip || '',
      client_port: config.server.default_http_request_header?.client_port || '',
      client_host: config.server.default_http_request_header?.client_host || '',
      client_id: config.server.default_http_request_header?.client_id || '',
      ssl: config.server.default_http_request_header?.ssl || '',
      ssl_session_id: config.server.default_http_request_header?.ssl_session_id || '',
      ssl_verify: config.server.default_http_request_header?.ssl_verify || '',
      ssl_subject: config.server.default_http_request_header?.ssl_subject || '',
      ssl_client_cn: config.server.default_http_request_header?.ssl_client_cn || '',
      ssl_issuer: config.server.default_http_request_header?.ssl_issuer || '',
      ssl_client_not_before: config.server.default_http_request_header?.ssl_client_not_before || '',
      ssl_client_not_after: config.server.default_http_request_header?.ssl_client_not_after || '',
      ssl_subject_dn: config.server.default_http_request_header?.ssl_subject_dn || '',
      ssl_issuer_dn: config.server.default_http_request_header?.ssl_issuer_dn || '',
      ssl_client_subject_dn: config.server.default_http_request_header?.ssl_client_subject_dn || '',
      ssl_client_issuer_dn: config.server.default_http_request_header?.ssl_client_issuer_dn || '',
      ssl_cipher: config.server.default_http_request_header?.ssl_cipher || '',
      ssl_protocol: config.server.default_http_request_header?.ssl_protocol || '',
      ssl_serial: config.server.default_http_request_header?.ssl_serial || '',
      ssl_fingerprint: config.server.default_http_request_header?.ssl_fingerprint || '',
      oidc_cid: config.server.default_http_request_header?.oidc_cid || '',
    },

    // Initialize compression configuration
    compression: {
      enabled: config.server.compression?.enabled || false,
      level: config.server.compression?.level || 5,
      content_types: config.server.compression?.content_types || ['text/html', 'text/css', 'text/plain', 'text/javascript', 'application/javascript', 'application/json', 'application/xml'],
      min_length: config.server.compression?.min_length || 1024,
    },

    // Initialize keep-alive configuration
    keep_alive: {
      enabled: config.server.keep_alive?.enabled || false,
      timeout: config.server.keep_alive?.timeout || '60s',
      max_idle_connections: config.server.keep_alive?.max_idle_connections || 100,
      max_idle_connections_per_host: config.server.keep_alive?.max_idle_connections_per_host || 10,
    },

    // Initialize HTTP client configuration
    http_client: {
      max_connections_per_host: config.server.http_client?.max_connections_per_host || 100,
      max_idle_connections: config.server.http_client?.max_idle_connections || 100,
      max_idle_connections_per_host: config.server.http_client?.max_idle_connections_per_host || 10,
      idle_connection_timeout: config.server.http_client?.idle_connection_timeout || '90s',
      proxy: config.server.http_client?.proxy || '',
      tls: {
        skip_verify: config.server.http_client?.tls?.skip_verify || false,
      },
    },

    // Initialize log configuration
    log: {
      json: config.server.log?.json || false,
      color: config.server.log?.color || true,
      level: config.server.log?.level || 'info',
      debug_modules: config.server.log?.debug_modules || [],
    },

    // Initialize brute force protocols
    brute_force_protocols: config.server.brute_force_protocols || [],

    // Initialize DNS configuration
    dns: {
      resolver: config.server.dns?.resolver || '',
      timeout: config.server.dns?.timeout || '5s',
      resolve_client_ip: config.server.dns?.resolve_client_ip || false,
    },

    // Initialize master user configuration
    master_user: {
      enabled: config.server.master_user?.enabled || false,
      delimiter: config.server.master_user?.delimiter || '%',
    },

    // Prometheus timer configuration is now in MonitoringConfig
  };

  const handleSubmit = async (values: ServerConfigType) => {
    try {
      // Make sure we preserve the redis configuration and include all new configuration options
      const updatedValues = {
        ...values,
        redis: config.server.redis, // Redis configuration is now handled by RedisConfig component
        // insights is now in MonitoringConfig
        disabled_endpoints: values.disabled_endpoints,
        default_http_request_header: values.default_http_request_header,
        compression: values.compression,
        keep_alive: values.keep_alive,
        http_client: values.http_client,
        log: values.log,
        brute_force_protocols: values.brute_force_protocols,
        dns: values.dns,
        master_user: values.master_user,
        // prometheus_timer is now in MonitoringConfig
      };
      await updateConfigSection('server', updatedValues);
      // Reset the unsaved changes flag after successful save
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error updating server configuration:', error);
    }
  };


  return (
    <Formik
      initialValues={initialValues}
      validationSchema={ServerConfigSchema}
      onSubmit={handleSubmit}
      enableReinitialize={true}
    >
      {({ errors, touched, values, handleChange, setFieldValue }) => (
        <Form>
          <FormSection
            title="Server Configuration"
            description="Configure the basic server settings for Nauthilus."
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="address"
                  label="Server Address"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Listening address with port. IPv4 or IPv6 in brackets (e.g., 127.0.0.1:8080 or [::1]:8080)." /></InputAdornment>
                  ) }}
                  variant="outlined"
                  placeholder="127.0.0.1:8080 or [::1]:8080"
                  error={touched.address && Boolean(errors.address)}
                  helperText={
                    (touched.address && errors.address) || 
                    "Enter a valid IPv4 or IPv6 address with port (e.g., 127.0.0.1:8080 or [::1]:8080)"
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
                  name="instance_name"
                  label="Instance Name"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Human-readable instance identifier used in logs/metrics and UI." /></InputAdornment>
                  ) }}
                  variant="outlined"
                  error={touched.instance_name && Boolean(errors.instance_name)}
                  helperText={touched.instance_name && errors.instance_name}
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
                  name="max_concurrent_requests"
                  label="Max Concurrent Requests"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="Maximum number of requests processed simultaneously. Higher values increase throughput but also resource usage." /></InputAdornment>
                  ) }}
                  variant="outlined"
                  type="number"
                  error={touched.max_concurrent_requests && Boolean(errors.max_concurrent_requests)}
                  helperText={touched.max_concurrent_requests && errors.max_concurrent_requests}
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
                  name="max_password_history_entries"
                  label="Max Password History Entries"
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end"><InfoTooltip title="How many previous passwords are remembered to prevent reuse." /></InputAdornment>
                  ) }}
                  variant="outlined"
                  type="number"
                  error={touched.max_password_history_entries && Boolean(errors.max_password_history_entries)}
                  helperText={touched.max_password_history_entries && errors.max_password_history_entries}
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
                      checked={values.http3}
                      onChange={(e) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                      name="http3"
                    />
                  }
                  label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable HTTP/3<InfoTooltip title="Enables HTTP/3 (QUIC) support. Requires compatible clients and network." /></Box>}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.haproxy_v2}
                      onChange={(e) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                      name="haproxy_v2"
                    />
                  }
                  label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable HAProxy Protocol v2<InfoTooltip title="Accepts the HAProxy PROXY v2 header to get client IPs behind load balancers." /></Box>}
                />
              </Grid>
            </Grid>
          </FormSection>

          <CollapsibleFormSection
            title="TLS Configuration"
            description="Configure TLS settings for secure connections."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.tls?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('tls.enabled', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="tls.enabled"
                    />
                  }
                  label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable TLS<InfoTooltip title="Serve HTTPS directly from the server. Provide certificate and key paths." /></Box>}
                />
              </Grid>
              {values.tls?.enabled && (
                <>
                  <Grid item xs={12} md={12}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="tls.cert"
                      label="TLS Certificate Path"
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Path to PEM-encoded certificate file for HTTPS." /></InputAdornment>
                      ) }}
                      variant="outlined"
                      error={getIn(touched, 'tls.cert') && Boolean(getIn(errors, 'tls.cert'))}
                      helperText={getIn(touched, 'tls.cert') && getIn(errors, 'tls.cert')}
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={12}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="tls.key"
                      label="TLS Key Path"
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Path to PEM-encoded private key file matching the certificate." /></InputAdornment>
                      ) }}
                      variant="outlined"
                      error={getIn(touched, 'tls.key') && Boolean(getIn(errors, 'tls.key'))}
                      helperText={getIn(touched, 'tls.key') && getIn(errors, 'tls.key')}
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={12}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="tls.ca_file"
                      label="TLS CA Certificate Path"
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Optional: CA bundle to verify client or upstream certificates." /></InputAdornment>
                      ) }}
                      variant="outlined"
                      error={getIn(touched, 'tls.ca_file') && Boolean(getIn(errors, 'tls.ca_file'))}
                      helperText={getIn(touched, 'tls.ca_file') && getIn(errors, 'tls.ca_file')}
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
                          checked={values.tls?.skip_verify || false}
                          onChange={(e) => {
                            setFieldValue('tls.skip_verify', e.target.checked)
                                .then(() => setHasUnsavedChanges(true));
                          }}
                          name="tls.skip_verify"
                        />
                      }
                      label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Skip TLS Verification<InfoTooltip title="Do not verify peer TLS certificates. Unsafe; testing only." /></Box>}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth variant="outlined">
                      <InputLabel id="min-tls-version-label">Minimum TLS Version</InputLabel>
                      <Field
                        as={Select}
                        labelId="min-tls-version-label"
                        name="tls.min_tls_version"
                        label="Minimum TLS Version"
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      >
                        <MenuItem value="TLS1.2">TLS 1.2</MenuItem>
                        <MenuItem value="TLS1.3">TLS 1.3</MenuItem>
                      </Field>
                      <FormHelperText>
                        Select the minimum TLS protocol version to use.
                      </FormHelperText>
                      {getIn(touched, 'tls.min_tls_version') && getIn(errors, 'tls.min_tls_version') && (
                        <FormHelperText error>{getIn(errors, 'tls.min_tls_version')}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={12}>
                    <FormControl fullWidth variant="outlined">
                      <InputLabel id="cipher-suites-label">Cipher Suites</InputLabel>
                      <Field
                        as={Select}
                        labelId="cipher-suites-label"
                        name="tls.cipher_suites"
                        label="Cipher Suites"
                        multiple
                        onChange={(e: React.ChangeEvent<any>) => {
                          handleChange(e);
                          setHasUnsavedChanges(true);
                        }}
                      >
                        <MenuItem value="TLS_RSA_WITH_AES_128_CBC_SHA">TLS_RSA_WITH_AES_128_CBC_SHA</MenuItem>
                        <MenuItem value="TLS_RSA_WITH_AES_256_CBC_SHA">TLS_RSA_WITH_AES_256_CBC_SHA</MenuItem>
                        <MenuItem value="TLS_RSA_WITH_AES_128_GCM_SHA256">TLS_RSA_WITH_AES_128_GCM_SHA256</MenuItem>
                        <MenuItem value="TLS_RSA_WITH_AES_256_GCM_SHA384">TLS_RSA_WITH_AES_256_GCM_SHA384</MenuItem>
                        <MenuItem value="TLS_AES_128_GCM_SHA256">TLS_AES_128_GCM_SHA256</MenuItem>
                        <MenuItem value="TLS_AES_256_GCM_SHA384">TLS_AES_256_GCM_SHA384</MenuItem>
                        <MenuItem value="TLS_CHACHA20_POLY1305_SHA256">TLS_CHACHA20_POLY1305_SHA256</MenuItem>
                        <MenuItem value="TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA">TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA</MenuItem>
                        <MenuItem value="TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA">TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA</MenuItem>
                        <MenuItem value="TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA">TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA</MenuItem>
                        <MenuItem value="TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA">TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA</MenuItem>
                        <MenuItem value="TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256">TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256</MenuItem>
                        <MenuItem value="TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384">TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384</MenuItem>
                        <MenuItem value="TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256">TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256</MenuItem>
                        <MenuItem value="TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384">TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384</MenuItem>
                        <MenuItem value="TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256">TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256</MenuItem>
                        <MenuItem value="TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256">TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256</MenuItem>
                      </Field>
                      <FormHelperText>
                        Select one or more cipher suites. If none selected, the server will use the default ciphers.
                      </FormHelperText>
                      {getIn(touched, 'tls.cipher_suites') && getIn(errors, 'tls.cipher_suites') && (
                        <FormHelperText error>{getIn(errors, 'tls.cipher_suites')}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                </>
              )}
            </Grid>
          </CollapsibleFormSection>


          {/* Insights Configuration moved to MonitoringConfig */}

          <CollapsibleFormSection
            title="Disabled Endpoints Configuration"
            description="Configure which HTTP endpoints should be disabled."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.disabled_endpoints?.auth_header || false}
                      onChange={(e) => {
                        setFieldValue('disabled_endpoints.auth_header', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="disabled_endpoints.auth_header"
                    />
                  }
                  label="Disable Auth Header Endpoint (/api/v1/auth/header)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.disabled_endpoints?.auth_json || false}
                      onChange={(e) => {
                        setFieldValue('disabled_endpoints.auth_json', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="disabled_endpoints.auth_json"
                    />
                  }
                  label="Disable Auth JSON Endpoint (/api/v1/auth/json)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.disabled_endpoints?.auth_basic || false}
                      onChange={(e) => {
                        setFieldValue('disabled_endpoints.auth_basic', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="disabled_endpoints.auth_basic"
                    />
                  }
                  label="Disable Auth Basic Endpoint (/api/v1/auth/basic)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.disabled_endpoints?.auth_nginx || false}
                      onChange={(e) => {
                        setFieldValue('disabled_endpoints.auth_nginx', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="disabled_endpoints.auth_nginx"
                    />
                  }
                  label="Disable Auth Nginx Endpoint (/api/v1/auth/nginx)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.disabled_endpoints?.auth_saslauthd || false}
                      onChange={(e) => {
                        setFieldValue('disabled_endpoints.auth_saslauthd', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="disabled_endpoints.auth_saslauthd"
                    />
                  }
                  label="Disable Auth SASL Endpoint (/api/v1/auth/saslauthd)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.disabled_endpoints?.auth_jwt || false}
                      onChange={(e) => {
                        setFieldValue('disabled_endpoints.auth_jwt', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="disabled_endpoints.auth_jwt"
                    />
                  }
                  label="Disable JWT Endpoints (/api/v1/jwt/*)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.disabled_endpoints?.custom_hooks || false}
                      onChange={(e) => {
                        setFieldValue('disabled_endpoints.custom_hooks', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="disabled_endpoints.custom_hooks"
                    />
                  }
                  label="Disable Custom Hooks Endpoints (/api/v1/custom/*)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                    control={
                      <Switch
                          checked={values.disabled_endpoints?.configuration || false}
                          onChange={(e) => {
                            setFieldValue('disabled_endpoints.configuration', e.target.checked)
                                .then(() => setHasUnsavedChanges(true));
                          }}
                          name="disabled_endpoints.configuration"
                      />
                    }
                    label="Disable Configuration Endpoints (/api/v1/config/*)"
                />
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Default HTTP Request Header Configuration"
            description="Configure default HTTP request headers for authentication requests."
          >
            {/* Authentication Headers */}
            <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Authentication Headers</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.username"
                  label="Username Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.username') && Boolean(getIn(errors, 'default_http_request_header.username'))}
                  helperText={(getIn(touched, 'default_http_request_header.username') && getIn(errors, 'default_http_request_header.username')) || "Default: X-Auth-Username"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.password"
                  label="Password Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.password') && Boolean(getIn(errors, 'default_http_request_header.password'))}
                  helperText={(getIn(touched, 'default_http_request_header.password') && getIn(errors, 'default_http_request_header.password')) || "Default: X-Auth-Password"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.password_encoded"
                  label="Password Encoded Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.password_encoded') && Boolean(getIn(errors, 'default_http_request_header.password_encoded'))}
                  helperText={(getIn(touched, 'default_http_request_header.password_encoded') && getIn(errors, 'default_http_request_header.password_encoded')) || "Default: X-Auth-Password-Encoded"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.protocol"
                  label="Protocol Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.protocol') && Boolean(getIn(errors, 'default_http_request_header.protocol'))}
                  helperText={(getIn(touched, 'default_http_request_header.protocol') && getIn(errors, 'default_http_request_header.protocol')) || "Default: X-Auth-Protocol"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.login_attempt"
                  label="Login Attempt Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.login_attempt') && Boolean(getIn(errors, 'default_http_request_header.login_attempt'))}
                  helperText={(getIn(touched, 'default_http_request_header.login_attempt') && getIn(errors, 'default_http_request_header.login_attempt')) || "Default: X-Auth-Login-Attempt"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.auth_method"
                  label="Auth Method Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.auth_method') && Boolean(getIn(errors, 'default_http_request_header.auth_method'))}
                  helperText={(getIn(touched, 'default_http_request_header.auth_method') && getIn(errors, 'default_http_request_header.auth_method')) || "Default: X-Auth-Method"}
                />
              </Grid>
            </Grid>

            {/* Client Information Headers */}
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Client Information Headers</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.client_ip"
                  label="Client IP Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.client_ip') && Boolean(getIn(errors, 'default_http_request_header.client_ip'))}
                  helperText={(getIn(touched, 'default_http_request_header.client_ip') && getIn(errors, 'default_http_request_header.client_ip')) || "Default: X-Auth-Client-IP"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.client_port"
                  label="Client Port Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.client_port') && Boolean(getIn(errors, 'default_http_request_header.client_port'))}
                  helperText={(getIn(touched, 'default_http_request_header.client_port') && getIn(errors, 'default_http_request_header.client_port')) || "Default: X-Auth-Client-Port"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.client_host"
                  label="Client Host Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.client_host') && Boolean(getIn(errors, 'default_http_request_header.client_host'))}
                  helperText={(getIn(touched, 'default_http_request_header.client_host') && getIn(errors, 'default_http_request_header.client_host')) || "Default: X-Auth-Client-Host"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.client_id"
                  label="Client ID Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.client_id') && Boolean(getIn(errors, 'default_http_request_header.client_id'))}
                  helperText={(getIn(touched, 'default_http_request_header.client_id') && getIn(errors, 'default_http_request_header.client_id')) || "Default: X-Auth-Client-ID"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.local_ip"
                  label="Local IP Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.local_ip') && Boolean(getIn(errors, 'default_http_request_header.local_ip'))}
                  helperText={(getIn(touched, 'default_http_request_header.local_ip') && getIn(errors, 'default_http_request_header.local_ip')) || "Default: X-Auth-Local-IP"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.local_port"
                  label="Local Port Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.local_port') && Boolean(getIn(errors, 'default_http_request_header.local_port'))}
                  helperText={(getIn(touched, 'default_http_request_header.local_port') && getIn(errors, 'default_http_request_header.local_port')) || "Default: X-Auth-Local-Port"}
                />
              </Grid>
            </Grid>

            {/* SSL/TLS Headers */}
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>SSL/TLS Headers</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl"
                  label="SSL Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl') && Boolean(getIn(errors, 'default_http_request_header.ssl'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl') && getIn(errors, 'default_http_request_header.ssl')) || "Default: X-Auth-SSL"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_session_id"
                  label="SSL Session ID Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_session_id') && Boolean(getIn(errors, 'default_http_request_header.ssl_session_id'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_session_id') && getIn(errors, 'default_http_request_header.ssl_session_id')) || "Default: X-Auth-SSL-Session-ID"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_verify"
                  label="SSL Verify Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_verify') && Boolean(getIn(errors, 'default_http_request_header.ssl_verify'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_verify') && getIn(errors, 'default_http_request_header.ssl_verify')) || "Default: X-Auth-SSL-Verify"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_cipher"
                  label="SSL Cipher Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_cipher') && Boolean(getIn(errors, 'default_http_request_header.ssl_cipher'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_cipher') && getIn(errors, 'default_http_request_header.ssl_cipher')) || "Default: X-Auth-SSL-Cipher"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_protocol"
                  label="SSL Protocol Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_protocol') && Boolean(getIn(errors, 'default_http_request_header.ssl_protocol'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_protocol') && getIn(errors, 'default_http_request_header.ssl_protocol')) || "Default: X-Auth-SSL-Protocol"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_serial"
                  label="SSL Serial Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_serial') && Boolean(getIn(errors, 'default_http_request_header.ssl_serial'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_serial') && getIn(errors, 'default_http_request_header.ssl_serial')) || "Default: X-Auth-SSL-Serial"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_fingerprint"
                  label="SSL Fingerprint Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_fingerprint') && Boolean(getIn(errors, 'default_http_request_header.ssl_fingerprint'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_fingerprint') && getIn(errors, 'default_http_request_header.ssl_fingerprint')) || "Default: X-Auth-SSL-Fingerprint"}
                />
              </Grid>
            </Grid>

            {/* SSL/TLS Certificate Headers */}
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>SSL/TLS Certificate Headers</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_subject"
                  label="SSL Subject Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_subject') && Boolean(getIn(errors, 'default_http_request_header.ssl_subject'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_subject') && getIn(errors, 'default_http_request_header.ssl_subject')) || "Default: X-Auth-SSL-Subject"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_client_cn"
                  label="SSL Client CN Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_client_cn') && Boolean(getIn(errors, 'default_http_request_header.ssl_client_cn'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_client_cn') && getIn(errors, 'default_http_request_header.ssl_client_cn')) || "Default: X-Auth-SSL-Client-CN"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_issuer"
                  label="SSL Issuer Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_issuer') && Boolean(getIn(errors, 'default_http_request_header.ssl_issuer'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_issuer') && getIn(errors, 'default_http_request_header.ssl_issuer')) || "Default: X-Auth-SSL-Issuer"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_client_not_before"
                  label="SSL Client Not Before Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_client_not_before') && Boolean(getIn(errors, 'default_http_request_header.ssl_client_not_before'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_client_not_before') && getIn(errors, 'default_http_request_header.ssl_client_not_before')) || "Default: X-Auth-SSL-Client-Not-Before"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_client_not_after"
                  label="SSL Client Not After Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_client_not_after') && Boolean(getIn(errors, 'default_http_request_header.ssl_client_not_after'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_client_not_after') && getIn(errors, 'default_http_request_header.ssl_client_not_after')) || "Default: X-Auth-SSL-Client-Not-After"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_subject_dn"
                  label="SSL Subject DN Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_subject_dn') && Boolean(getIn(errors, 'default_http_request_header.ssl_subject_dn'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_subject_dn') && getIn(errors, 'default_http_request_header.ssl_subject_dn')) || "Default: X-Auth-SSL-Subject-DN"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_issuer_dn"
                  label="SSL Issuer DN Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_issuer_dn') && Boolean(getIn(errors, 'default_http_request_header.ssl_issuer_dn'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_issuer_dn') && getIn(errors, 'default_http_request_header.ssl_issuer_dn')) || "Default: X-Auth-SSL-Issuer-DN"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_client_subject_dn"
                  label="SSL Client Subject DN Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_client_subject_dn') && Boolean(getIn(errors, 'default_http_request_header.ssl_client_subject_dn'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_client_subject_dn') && getIn(errors, 'default_http_request_header.ssl_client_subject_dn')) || "Default: X-Auth-SSL-Client-Subject-DN"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.ssl_client_issuer_dn"
                  label="SSL Client Issuer DN Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.ssl_client_issuer_dn') && Boolean(getIn(errors, 'default_http_request_header.ssl_client_issuer_dn'))}
                  helperText={(getIn(touched, 'default_http_request_header.ssl_client_issuer_dn') && getIn(errors, 'default_http_request_header.ssl_client_issuer_dn')) || "Default: X-Auth-SSL-Client-Issuer-DN"}
                />
              </Grid>
            </Grid>

            {/* Other Headers */}
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Other Headers</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="default_http_request_header.oidc_cid"
                  label="OIDC Client ID Header"
                  variant="outlined"
                  error={getIn(touched, 'default_http_request_header.oidc_cid') && Boolean(getIn(errors, 'default_http_request_header.oidc_cid'))}
                  helperText={(getIn(touched, 'default_http_request_header.oidc_cid') && getIn(errors, 'default_http_request_header.oidc_cid')) || "Default: X-OIDC-CID"}
                />
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Compression Configuration"
            description="Configure HTTP response compression settings."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.compression?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('compression.enabled', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="compression.enabled"
                    />
                  }
                  label="Enable Compression"
                />
              </Grid>
              {values.compression?.enabled && (
                <>
                  <Grid item xs={12} md={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="compression.level"
                      label="Compression Level (1-9)"
                      variant="outlined"
                      type="number"
                      InputProps={{ inputProps: { min: 1, max: 9 } }}
                      error={getIn(touched, 'compression.level') && Boolean(getIn(errors, 'compression.level'))}
                      helperText={(getIn(touched, 'compression.level') && getIn(errors, 'compression.level')) || "1 is fastest, 9 is best compression"}
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
                      name="compression.min_length"
                      label="Minimum Content Length (bytes)"
                      variant="outlined"
                      type="number"
                      InputProps={{ inputProps: { min: 0 } }}
                      error={getIn(touched, 'compression.min_length') && Boolean(getIn(errors, 'compression.min_length'))}
                      helperText={(getIn(touched, 'compression.min_length') && getIn(errors, 'compression.min_length')) || "Minimum content length required for compression"}
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Content Types to Compress</Typography>
                    <FormControl fullWidth error={getIn(touched, 'compression.content_types') && Boolean(getIn(errors, 'compression.content_types'))}>
                      <Select
                        multiple
                        value={values.compression?.content_types || []}
                        onChange={(e) => {
                          setFieldValue('compression.content_types', e.target.value)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        renderValue={(selected) => (Array.isArray(selected) ? selected.join(', ') : '')}
                      >
                        <MenuItem value="text/html">text/html</MenuItem>
                        <MenuItem value="text/css">text/css</MenuItem>
                        <MenuItem value="text/plain">text/plain</MenuItem>
                        <MenuItem value="text/javascript">text/javascript</MenuItem>
                        <MenuItem value="application/javascript">application/javascript</MenuItem>
                        <MenuItem value="application/json">application/json</MenuItem>
                        <MenuItem value="application/xml">application/xml</MenuItem>
                        <MenuItem value="image/svg+xml">image/svg+xml</MenuItem>
                      </Select>
                      <FormHelperText>
                        {(getIn(touched, 'compression.content_types') && getIn(errors, 'compression.content_types')) || "Select content types to compress"}
                      </FormHelperText>
                    </FormControl>
                  </Grid>
                </>
              )}
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Keep-Alive Configuration"
            description="Configure HTTP connection keep-alive settings."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.keep_alive?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('keep_alive.enabled', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="keep_alive.enabled"
                    />
                  }
                  label="Enable Keep-Alive"
                />
              </Grid>
              {values.keep_alive?.enabled && (
                <>
                  <Grid item xs={12} md={6}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="keep_alive.timeout"
                      label="Keep-Alive Timeout"
                      variant="outlined"
                      error={getIn(touched, 'keep_alive.timeout') && Boolean(getIn(errors, 'keep_alive.timeout'))}
                      helperText={(getIn(touched, 'keep_alive.timeout') && getIn(errors, 'keep_alive.timeout')) || "Duration format (e.g., 60s, 2m)"}
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
                      name="keep_alive.max_idle_connections"
                      label="Max Idle Connections"
                      variant="outlined"
                      type="number"
                      InputProps={{ inputProps: { min: 1 } }}
                      error={getIn(touched, 'keep_alive.max_idle_connections') && Boolean(getIn(errors, 'keep_alive.max_idle_connections'))}
                      helperText={(getIn(touched, 'keep_alive.max_idle_connections') && getIn(errors, 'keep_alive.max_idle_connections')) || "Maximum number of idle connections"}
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
                      name="keep_alive.max_idle_connections_per_host"
                      label="Max Idle Connections Per Host"
                      variant="outlined"
                      type="number"
                      InputProps={{ inputProps: { min: 0 } }}
                      error={getIn(touched, 'keep_alive.max_idle_connections_per_host') && Boolean(getIn(errors, 'keep_alive.max_idle_connections_per_host'))}
                      helperText={(getIn(touched, 'keep_alive.max_idle_connections_per_host') && getIn(errors, 'keep_alive.max_idle_connections_per_host')) || "Maximum number of idle connections per host"}
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="HTTP Client Configuration"
            description="Configure HTTP client settings for outgoing connections."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="http_client.max_connections_per_host"
                  label="Max Connections Per Host"
                  variant="outlined"
                  type="number"
                  InputProps={{ inputProps: { min: 1 } }}
                  error={getIn(touched, 'http_client.max_connections_per_host') && Boolean(getIn(errors, 'http_client.max_connections_per_host'))}
                  helperText={(getIn(touched, 'http_client.max_connections_per_host') && getIn(errors, 'http_client.max_connections_per_host')) || "Maximum number of connections per host"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="http_client.max_idle_connections"
                  label="Max Idle Connections"
                  variant="outlined"
                  type="number"
                  InputProps={{ inputProps: { min: 1 } }}
                  error={getIn(touched, 'http_client.max_idle_connections') && Boolean(getIn(errors, 'http_client.max_idle_connections'))}
                  helperText={(getIn(touched, 'http_client.max_idle_connections') && getIn(errors, 'http_client.max_idle_connections')) || "Maximum number of idle connections"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="http_client.max_idle_connections_per_host"
                  label="Max Idle Connections Per Host"
                  variant="outlined"
                  type="number"
                  InputProps={{ inputProps: { min: 0 } }}
                  error={getIn(touched, 'http_client.max_idle_connections_per_host') && Boolean(getIn(errors, 'http_client.max_idle_connections_per_host'))}
                  helperText={(getIn(touched, 'http_client.max_idle_connections_per_host') && getIn(errors, 'http_client.max_idle_connections_per_host')) || "Maximum number of idle connections per host"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="http_client.idle_connection_timeout"
                  label="Idle Connection Timeout"
                  variant="outlined"
                  error={getIn(touched, 'http_client.idle_connection_timeout') && Boolean(getIn(errors, 'http_client.idle_connection_timeout'))}
                  helperText={(getIn(touched, 'http_client.idle_connection_timeout') && getIn(errors, 'http_client.idle_connection_timeout')) || "Duration format (e.g., 90s, 2m)"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="http_client.proxy"
                  label="HTTP Proxy URL"
                  variant="outlined"
                  error={getIn(touched, 'http_client.proxy') && Boolean(getIn(errors, 'http_client.proxy'))}
                  helperText={(getIn(touched, 'http_client.proxy') && getIn(errors, 'http_client.proxy')) || "Proxy URL (e.g., http://proxy.example.com:8080)"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.http_client?.tls?.skip_verify || false}
                      onChange={(e) => {
                        setFieldValue('http_client.tls.skip_verify', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="http_client.tls.skip_verify"
                    />
                  }
                  label="Skip TLS Verification for HTTP Client"
                />
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Log Configuration"
            description="Configure logging settings."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.log?.json || false}
                      onChange={(e) => {
                        setFieldValue('log.json', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="log.json"
                    />
                  }
                  label="Enable JSON Logging"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.log?.color || false}
                      onChange={(e) => {
                        setFieldValue('log.color', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="log.color"
                    />
                  }
                  label="Enable Colored Logging"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Log Level</InputLabel>
                  <Select
                    value={values.log?.level || 'info'}
                    onChange={(e) => {
                      setFieldValue('log.level', e.target.value)
                          .then(() => setHasUnsavedChanges(true));
                    }}
                    label="Log Level"
                  >
                    <MenuItem value="debug">Debug</MenuItem>
                    <MenuItem value="info">Info</MenuItem>
                    <MenuItem value="warn">Warn</MenuItem>
                    <MenuItem value="error">Error</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Debug Modules</Typography>
                <FormControl fullWidth>
                  <Select
                    multiple
                    value={values.log?.debug_modules || []}
                    onChange={(e) => {
                      const selectedModules = Array.isArray(e.target.value) 
                        ? e.target.value
                        : [];
                      setFieldValue('log.debug_modules', selectedModules)
                          .then(() => setHasUnsavedChanges(true));
                    }}
                    renderValue={(selected) => (Array.isArray(selected) ? selected.join(', ') : '')}
                  >
                    <MenuItem value="all">all</MenuItem>
                    <MenuItem value="auth">auth</MenuItem>
                    <MenuItem value="backend">backend</MenuItem>
                    <MenuItem value="brute_force">brute_force</MenuItem>
                    <MenuItem value="cache">cache</MenuItem>
                    <MenuItem value="config">config</MenuItem>
                    <MenuItem value="dns">dns</MenuItem>
                    <MenuItem value="feature">feature</MenuItem>
                    <MenuItem value="filter">filter</MenuItem>
                    <MenuItem value="hook">hook</MenuItem>
                    <MenuItem value="http">http</MenuItem>
                    <MenuItem value="ldap">ldap</MenuItem>
                    <MenuItem value="lua">lua</MenuItem>
                    <MenuItem value="mail">mail</MenuItem>
                    <MenuItem value="metrics">metrics</MenuItem>
                    <MenuItem value="oauth2">oauth2</MenuItem>
                    <MenuItem value="password">password</MenuItem>
                    <MenuItem value="rbl">rbl</MenuItem>
                    <MenuItem value="redis">redis</MenuItem>
                    <MenuItem value="server">server</MenuItem>
                    <MenuItem value="session">session</MenuItem>
                    <MenuItem value="totp">totp</MenuItem>
                    <MenuItem value="webauthn">webauthn</MenuItem>
                  </Select>
                  <FormHelperText>
                    Select modules to enable debug logging for
                  </FormHelperText>
                </FormControl>
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Brute Force Protection"
            description="Configure brute force protection settings."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Protocols to Protect</Typography>
                <FormControl fullWidth>
                  <Select
                    multiple
                    value={values.brute_force_protocols || []}
                    onChange={(e) => {
                      const selectedProtocols = Array.isArray(e.target.value) 
                        ? e.target.value
                        : [];
                      setFieldValue('brute_force_protocols', selectedProtocols)
                          .then(() => setHasUnsavedChanges(true));
                    }}
                    renderValue={(selected) => (Array.isArray(selected) ? selected.map(s => s.toLowerCase()).join(', ') : '')}
                  >
                    {/* Predefined protocols */}
                    <MenuItem value="HTTP">HTTP</MenuItem>
                    <MenuItem value="SMTP">SMTP</MenuItem>
                    <MenuItem value="IMAP">IMAP</MenuItem>
                    <MenuItem value="POP3">POP3</MenuItem>
                    <MenuItem value="FTP">FTP</MenuItem>
                    <MenuItem value="SSH">SSH</MenuItem>
                    <MenuItem value="LDAP">LDAP</MenuItem>
                    <MenuItem value="RADIUS">RADIUS</MenuItem>

                    {/* Custom protocols */}
                    {values.brute_force_protocols?.filter(p => 
                      !["HTTP", "SMTP", "IMAP", "POP3", "FTP", "SSH", "LDAP", "RADIUS"].includes(p.toUpperCase())
                    ).map(protocol => (
                      <MenuItem key={protocol} value={protocol}>
                        {protocol}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Select protocols to enable brute force protection for. Adding protocols to this list enables brute force protection.
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Custom Protocol</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <TextField
                    fullWidth
                    placeholder="Enter custom protocol"
                    value={customProtocol || ''}
                    onChange={(e) => setCustomProtocol(e.target.value)}
                    sx={{ mr: 2 }}
                  />
                  <Button
                    variant="contained"
                    onClick={() => {
                      if (customProtocol && customProtocol.trim() !== '') {
                        const currentProtocols = values.brute_force_protocols || [];
                        const protocolExists = currentProtocols.some(
                          p => p.toLowerCase() === customProtocol.trim().toLowerCase()
                        );

                        if (!protocolExists) {
                          setFieldValue('brute_force_protocols', [
                            ...currentProtocols,
                            customProtocol.trim()
                          ])
                              .then(() => setHasUnsavedChanges(true));
                        }
                      }
                    }}
                  >
                    Add
                  </Button>
                </Box>
                <FormHelperText>
                  Add a custom protocol to the list. The protocol name will be converted to lowercase when processed.
                </FormHelperText>
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="DNS Configuration"
            description="Configure DNS settings."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="dns.resolver"
                  label="DNS Resolver"
                  variant="outlined"
                  error={getIn(touched, 'dns.resolver') && Boolean(getIn(errors, 'dns.resolver'))}
                  helperText={(getIn(touched, 'dns.resolver') && getIn(errors, 'dns.resolver')) || "DNS resolver address (e.g., 1.1.1.1:53)"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Field
                  as={TextField}
                  fullWidth
                  name="dns.timeout"
                  label="DNS Timeout"
                  variant="outlined"
                  error={getIn(touched, 'dns.timeout') && Boolean(getIn(errors, 'dns.timeout'))}
                  helperText={(getIn(touched, 'dns.timeout') && getIn(errors, 'dns.timeout')) || "Duration format (e.g., 5s, 1m)"}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.dns?.resolve_client_ip || false}
                      onChange={(e) => {
                        setFieldValue('dns.resolve_client_ip', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="dns.resolve_client_ip"
                    />
                  }
                  label="Resolve Client IP"
                />
              </Grid>
            </Grid>
          </CollapsibleFormSection>

          <CollapsibleFormSection
            title="Master User Configuration"
            description="Configure master user settings."
            defaultExpanded={false}
          >
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.master_user?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('master_user.enabled', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                      }}
                      name="master_user.enabled"
                    />
                  }
                  label="Enable Master User"
                />
              </Grid>
              {values.master_user?.enabled && (
                <Grid item xs={12} md={6}>
                  <Field
                    as={TextField}
                    fullWidth
                    name="master_user.delimiter"
                    label="Master User Delimiter"
                    variant="outlined"
                    error={getIn(touched, 'master_user.delimiter') && Boolean(getIn(errors, 'master_user.delimiter'))}
                    helperText={(getIn(touched, 'master_user.delimiter') && getIn(errors, 'master_user.delimiter')) || "Character used to separate master user from target user"}
                  />
                </Grid>
              )}
            </Grid>
          </CollapsibleFormSection>

          {/* Prometheus Timer Configuration moved to MonitoringConfig */}

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button 
              type="submit" 
              variant="contained" 
              color="primary" 
              disabled={!hasUnsavedChanges}
              onClick={async () => {
                if (hasUnsavedChanges) {
                  try {
                    await handleSubmit(values);
                  } catch (error) {
                    console.error('Error saving configuration:', error);
                  }
                }
              }}
            >
              Save Changes
            </Button>
          </Box>
        </Form>
      )}
    </Formik>
  );
};

export default ServerConfig;
