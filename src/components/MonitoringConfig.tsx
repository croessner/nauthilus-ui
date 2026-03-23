import React from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { FormControlLabel, Button, Box, FormHelperText, FormControl, Select, MenuItem, Typography, Switch, TextField, InputLabel, InputAdornment } from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import Grid from '@mui/material/Grid';

// Validation schema
const MonitoringConfigSchema = Yup.object().shape({
  // Insights validation
  insights: Yup.object().shape({
    enable_pprof: Yup.boolean(),
    enable_block_profile: Yup.boolean(),
    monitor_connections: Yup.boolean(),
    tracing: Yup.object().shape({
      enabled: Yup.boolean(),
      exporter: Yup.mixed().oneOf(['otlphttp', 'none', undefined as any]),
      endpoint: Yup.string().nullable(),
      sampler_ratio: Yup.number().min(0, 'Must be >= 0').max(1, 'Must be <= 1').nullable(),
      service_name: Yup.string().max(255, 'Max 255 characters').nullable(),
      propagators: Yup.array().of(Yup.mixed().oneOf(['tracecontext', 'baggage', 'b3', 'b3multi', 'jaeger'] as const)).nullable(),
      enable_redis: Yup.boolean(),
      log_export_results: Yup.boolean(),
      tls: Yup.object().shape({
        enabled: Yup.boolean(),
        skip_verify: Yup.boolean(),
        cert: Yup.string().nullable(),
        key: Yup.string().nullable(),
        ca_file: Yup.string().nullable(),
      }).nullable(),
    })
  }),

  // Prometheus timer validation
  prometheus_timer: Yup.object().shape({
    enabled: Yup.boolean(),
    labels: Yup.array().of(Yup.string()),
  }),
});

const MonitoringConfig = (): React.JSX.Element | null => {
  const { config, updateConfigSection, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();

  // Reset unsaved changes flag when the component mounts
  React.useEffect(() => {
    setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  if (!config) {
    return null;
  }

  const initialValues = {
    // Initialize the insights-configuration
    insights: {
      enable_pprof: config.server.insights?.enable_pprof || false,
      enable_block_profile: config.server.insights?.enable_block_profile || false,
      monitor_connections: config.server.insights?.monitor_connections || false,
      tracing: {
        enabled: config.server.insights?.tracing?.enabled || false,
        exporter: (config.server.insights?.tracing?.exporter as any) || 'none',
        endpoint: config.server.insights?.tracing?.endpoint || '',
        sampler_ratio: typeof config.server.insights?.tracing?.sampler_ratio === 'number' ? config.server.insights?.tracing?.sampler_ratio : undefined,
        service_name: config.server.insights?.tracing?.service_name || '',
        propagators: config.server.insights?.tracing?.propagators || [],
        enable_redis: config.server.insights?.tracing?.enable_redis || false,
        log_export_results: config.server.insights?.tracing?.log_export_results || false,
        tls: {
          enabled: config.server.insights?.tracing?.tls?.enabled || false,
          skip_verify: config.server.insights?.tracing?.tls?.skip_verify || false,
          cert: config.server.insights?.tracing?.tls?.cert || '',
          key: config.server.insights?.tracing?.tls?.key || '',
          ca_file: config.server.insights?.tracing?.tls?.ca_file || '',
          min_tls_version: config.server.insights?.tracing?.tls?.min_tls_version || 'TLS1.2',
          cipher_suites: config.server.insights?.tracing?.tls?.cipher_suites || [],
        },
      },
    },

    // Initialize Prometheus timer configuration
    prometheus_timer: {
      enabled: config.server.prometheus_timer?.enabled || false,
      labels: config.server.prometheus_timer?.labels || [],
    },
  };

  const handleSubmit = async (values: any) => {
    try {
      // Update only the monitoring-related configurations
      const updatedValues = {
        ...config.server,
        insights: values.insights,
        prometheus_timer: values.prometheus_timer
      };
      await updateConfigSection('server', updatedValues);
    } catch (error) {
      console.error('Error updating monitoring configuration:', error);
    }
  };

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={MonitoringConfigSchema}
      onSubmit={handleSubmit}
      enableReinitialize={true}
    >
      {({values, setFieldValue }) => (
        <Form>
          <FormSection
            title="Monitoring Configuration"
            description="Configure monitoring and debugging settings for Nauthilus."
          >
            <CollapsibleFormSection
              title="Insights Configuration"
              description="Configure debugging and monitoring settings."
              defaultExpanded={true}
            >
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.insights?.enable_pprof || false}
                        onChange={(e) => {
                          setFieldValue('insights.enable_pprof', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        name="insights.enable_pprof"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable pprof (Go Profiling)<InfoTooltip title="Enables Go pprof for runtime profiling (CPU, heap, etc.). Use only in test/debug environments." /></Box>}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.insights?.enable_block_profile || false}
                        onChange={(e) => {
                          setFieldValue('insights.enable_block_profile', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        name="insights.enable_block_profile"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable Block Profile<InfoTooltip title="Captures blocking events (block profiling). Adds overhead; enable only temporarily." /></Box>}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.insights?.monitor_connections || false}
                        onChange={(e) => {
                          setFieldValue('insights.monitor_connections', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        name="insights.monitor_connections"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Monitor Connections<InfoTooltip title="Monitors incoming connections for diagnostics. May increase logging/metrics volume." /></Box>}
                  />
                </Grid>
              </Grid>
            </CollapsibleFormSection>

            <CollapsibleFormSection
              title="Tracing"
              description="Distributed tracing for requests and background jobs. Useful to understand latency and call chains across services."
              defaultExpanded={false}
            >
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 12 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.insights?.tracing?.enabled || false}
                        onChange={(e) => {
                          setFieldValue('insights.tracing.enabled', e.target.checked)
                            .then(() => setHasUnsavedChanges(true));
                        }}
                        name="insights.tracing.enabled"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable Tracing<InfoTooltip title="Emits trace spans for server operations. Enable to integrate with tracing backends; keep disabled if not used to avoid overhead." /></Box>}
                  />
                </Grid>
                {values.insights?.tracing?.enabled && (
                  <>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <FormControl fullWidth>
                        <InputLabel id="tracing-exporter-label">Exporter</InputLabel>
                        <Select
                          labelId="tracing-exporter-label"
                          label="Exporter"
                          value={values.insights?.tracing?.exporter || 'none'}
                          onChange={(e) => {
                            setFieldValue('insights.tracing.exporter', e.target.value)
                              .then(() => setHasUnsavedChanges(true));
                          }}
                        >
                          <MenuItem value="none">none</MenuItem>
                          <MenuItem value="otlphttp">otlphttp</MenuItem>
                        </Select>
                        <FormHelperText>Choose the tracing exporter. Use otlphttp for OTLP/HTTP, or none to disable export.</FormHelperText>
                      </FormControl>
                    </Grid>

                    {values.insights?.tracing?.exporter === 'otlphttp' && (
                      <>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            fullWidth
                            label="Endpoint"
                            name="insights.tracing.endpoint"
                            value={values.insights?.tracing?.endpoint || ''}
                            onChange={(e) => {
                              setFieldValue('insights.tracing.endpoint', e.target.value)
                                .then(() => setHasUnsavedChanges(true));
                            }}
                            helperText="Exporter endpoint, e.g. https://otel-collector:4318/v1/traces"
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            fullWidth
                            type="number"
                            inputProps={{ min: 0, max: 100, step: 0.1 }}
                            label="Sampler Ratio (%)"
                            name="insights.tracing.sampler_ratio_percent"
                            value={
                              values.insights?.tracing?.sampler_ratio === undefined || values.insights?.tracing?.sampler_ratio === null
                                ? ''
                                : Math.round((values.insights.tracing.sampler_ratio as number) * 100 * 10) / 10
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                setFieldValue('insights.tracing.sampler_ratio', undefined)
                                  .then(() => setHasUnsavedChanges(true));
                                return;
                              }
                              const percent = Number(raw);
                              if (isNaN(percent)) {
                                setFieldValue('insights.tracing.sampler_ratio', undefined)
                                  .then(() => setHasUnsavedChanges(true));
                                return;
                              }
                              const fraction = Math.min(1, Math.max(0, percent / 100));
                              setFieldValue('insights.tracing.sampler_ratio', fraction)
                                .then(() => setHasUnsavedChanges(true));
                            }}
                            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                            helperText="Percentage of traces to sample (0 – 100%)."
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            fullWidth
                            label="Service Name"
                            name="insights.tracing.service_name"
                            value={values.insights?.tracing?.service_name || ''}
                            onChange={(e) => {
                              setFieldValue('insights.tracing.service_name', e.target.value)
                                .then(() => setHasUnsavedChanges(true));
                            }}
                            helperText="Logical service name reported in traces."
                          />
                        </Grid>
                        <Grid size={12}>
                          <FormControl fullWidth>
                            <InputLabel id="tracing-propagators-label">Propagators</InputLabel>
                            <Select
                              labelId="tracing-propagators-label"
                              label="Propagators"
                              multiple
                              value={values.insights?.tracing?.propagators || []}
                              onChange={(e) => {
                                setFieldValue('insights.tracing.propagators', e.target.value)
                                  .then(() => setHasUnsavedChanges(true));
                              }}
                              renderValue={(selected) => (Array.isArray(selected) ? (selected as string[]).join(', ') : '')}
                            >
                              <MenuItem value="tracecontext">tracecontext</MenuItem>
                              <MenuItem value="baggage">baggage</MenuItem>
                              <MenuItem value="b3">b3</MenuItem>
                              <MenuItem value="b3multi">b3multi</MenuItem>
                              <MenuItem value="jaeger">jaeger</MenuItem>
                            </Select>
                            <FormHelperText>Choose text map propagators to use.</FormHelperText>
                          </FormControl>
                        </Grid>

                        <Grid size={{ xs: 12, md: 6 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={Boolean(values.insights?.tracing?.enable_redis)}
                                onChange={(e) => {
                                  setFieldValue('insights.tracing.enable_redis', e.target.checked)
                                    .then(() => setHasUnsavedChanges(true));
                                }}
                                name="insights.tracing.enable_redis"
                              />
                            }
                            label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Trace Redis Operations<InfoTooltip title="Adds spans for Redis client operations." /></Box>}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={Boolean(values.insights?.tracing?.log_export_results)}
                                onChange={(e) => {
                                  setFieldValue('insights.tracing.log_export_results', e.target.checked)
                                    .then(() => setHasUnsavedChanges(true));
                                }}
                                name="insights.tracing.log_export_results"
                              />
                            }
                            label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Log Export Results<InfoTooltip title="If enabled, successful export batches are logged at INFO level." /></Box>}
                          />
                        </Grid>

                        {/* TLS for exporter */}
                        <Grid size={12}>
                          <Typography variant="subtitle2">Exporter TLS</Typography>
                        </Grid>
                        <Grid size={{ xs: 12, md: 12 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={Boolean(values.insights?.tracing?.tls?.enabled)}
                                onChange={(e) => {
                                  setFieldValue('insights.tracing.tls.enabled', e.target.checked)
                                    .then(() => setHasUnsavedChanges(true));
                                }}
                                name="insights.tracing.tls.enabled"
                              />
                            }
                            label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable TLS<InfoTooltip title="Enable TLS for the exporter connection." /></Box>}
                          />
                        </Grid>
                        {values.insights?.tracing?.tls?.enabled && (
                          <>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={Boolean(values.insights?.tracing?.tls?.skip_verify)}
                                    onChange={(e) => {
                                      setFieldValue('insights.tracing.tls.skip_verify', e.target.checked)
                                        .then(() => setHasUnsavedChanges(true));
                                    }}
                                    name="insights.tracing.tls.skip_verify"
                                  />
                                }
                                label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Skip Certificate Verification<InfoTooltip title="Do not verify the server certificate (insecure)." /></Box>}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                fullWidth
                                label="Client Cert Path"
                                name="insights.tracing.tls.cert"
                                value={values.insights?.tracing?.tls?.cert || ''}
                                onChange={(e) => {
                                  setFieldValue('insights.tracing.tls.cert', e.target.value)
                                    .then(() => setHasUnsavedChanges(true));
                                }}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                fullWidth
                                label="Client Key Path"
                                name="insights.tracing.tls.key"
                                value={values.insights?.tracing?.tls?.key || ''}
                                onChange={(e) => {
                                  setFieldValue('insights.tracing.tls.key', e.target.value)
                                    .then(() => setHasUnsavedChanges(true));
                                }}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                fullWidth
                                label="CA File Path"
                                name="insights.tracing.tls.ca_file"
                                value={values.insights?.tracing?.tls?.ca_file || ''}
                                onChange={(e) => {
                                  setFieldValue('insights.tracing.tls.ca_file', e.target.value)
                                    .then(() => setHasUnsavedChanges(true));
                                }}
                              />
                            </Grid>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
                {/* Removed environment-related help text per request */}
              </Grid>
            </CollapsibleFormSection>

            <CollapsibleFormSection
              title="Prometheus Timer Configuration"
              description="Configure Prometheus timer settings."
              defaultExpanded={true}
            >
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.prometheus_timer?.enabled || false}
                        onChange={(e) => {
                          setFieldValue('prometheus_timer.enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        name="prometheus_timer.enabled"
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable Prometheus Timer<InfoTooltip title="Enables latency timer for Prometheus. Provides metrics based on the selected labels." /></Box>}
                  />
                </Grid>
                {values.prometheus_timer?.enabled && (
                  <Grid size={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <Typography variant="subtitle2">Timer Labels</Typography>
                                        <InfoTooltip title="Choose additional labels to break down metrics (e.g., per action/backend). Too many labels increase cardinality." />
                                        </Box>
                    <FormControl fullWidth>
                      <Select
                        multiple
                        value={values.prometheus_timer?.labels || []}
                        onChange={(e) => {
                          setFieldValue('prometheus_timer.labels', e.target.value)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                        renderValue={(selected) => (Array.isArray(selected) ? selected.join(', ') : '')}
                      >
                        <MenuItem value="action">action</MenuItem>
                        <MenuItem value="account">account</MenuItem>
                        <MenuItem value="backend">backend</MenuItem>
                        <MenuItem value="brute_force">brute_force</MenuItem>
                        <MenuItem value="feature">feature</MenuItem>
                        <MenuItem value="filter">filter</MenuItem>
                        <MenuItem value="post_action">post_action</MenuItem>
                        <MenuItem value="request">request</MenuItem>
                        <MenuItem value="store_totp">store_totp</MenuItem>
                        <MenuItem value="dns">dns</MenuItem>
                      </Select>
                      <FormHelperText>
                        Select labels to include in Prometheus metrics
                      </FormHelperText>
                    </FormControl>
                  </Grid>
                )}
              </Grid>
            </CollapsibleFormSection>
          </FormSection>

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

export default MonitoringConfig;
