import React from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import { 
  FormControlLabel, 
  Grid, 
  Button, 
  Box,
  FormHelperText,
  FormControl,
  Select,
  MenuItem,
  Typography,
  Switch
} from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';

// Validation schema
const MonitoringConfigSchema = Yup.object().shape({
  // Insights validation
  insights: Yup.object().shape({
    enable_pprof: Yup.boolean(),
    enable_block_profile: Yup.boolean(),
    monitor_connections: Yup.boolean(),
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
                <Grid item xs={12} md={6}>
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
                <Grid item xs={12} md={6}>
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
                <Grid item xs={12} md={6}>
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
              title="Prometheus Timer Configuration"
              description="Configure Prometheus timer settings."
              defaultExpanded={true}
            >
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
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
                  <Grid item xs={12}>
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
