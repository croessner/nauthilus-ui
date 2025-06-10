import React from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography
} from '@mui/material';
import { ServerConfig as ServerConfigType } from '../types/config';
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

const MonitoringConfig: React.FC = () => {
  const { config, updateConfigSection } = useConfig();

  if (!config) {
    return null;
  }

  const initialValues = {
    // Initialize insights configuration
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
    >
      {({ errors, touched, values, handleChange, setFieldValue }) => (
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
                      <Checkbox
                        checked={values.insights?.enable_pprof || false}
                        onChange={(e) => {
                          setFieldValue('insights.enable_pprof', e.target.checked);
                        }}
                        name="insights.enable_pprof"
                      />
                    }
                    label="Enable pprof (Go Profiling)"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={values.insights?.enable_block_profile || false}
                        onChange={(e) => {
                          setFieldValue('insights.enable_block_profile', e.target.checked);
                        }}
                        name="insights.enable_block_profile"
                      />
                    }
                    label="Enable Block Profile"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={values.insights?.monitor_connections || false}
                        onChange={(e) => {
                          setFieldValue('insights.monitor_connections', e.target.checked);
                        }}
                        name="insights.monitor_connections"
                      />
                    }
                    label="Monitor Connections"
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
                      <Checkbox
                        checked={values.prometheus_timer?.enabled || false}
                        onChange={(e) => {
                          setFieldValue('prometheus_timer.enabled', e.target.checked);
                        }}
                        name="prometheus_timer.enabled"
                      />
                    }
                    label="Enable Prometheus Timer"
                  />
                </Grid>
                {values.prometheus_timer?.enabled && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Timer Labels</Typography>
                    <FormControl fullWidth>
                      <Select
                        multiple
                        value={values.prometheus_timer?.labels || []}
                        onChange={(e) => {
                          setFieldValue('prometheus_timer.labels', e.target.value);
                        }}
                        renderValue={(selected) => (Array.isArray(selected) ? selected.join(', ') : '')}
                      >
                        <MenuItem value="method">method</MenuItem>
                        <MenuItem value="path">path</MenuItem>
                        <MenuItem value="status">status</MenuItem>
                        <MenuItem value="protocol">protocol</MenuItem>
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
            <Button type="submit" variant="contained" color="primary">
              Save Changes
            </Button>
          </Box>
        </Form>
      )}
    </Formik>
  );
};

export default MonitoringConfig;