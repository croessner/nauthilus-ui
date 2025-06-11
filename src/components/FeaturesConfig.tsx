import React, { useMemo } from 'react';
import { Formik, Form, getIn } from 'formik';
import * as Yup from 'yup';
import {
  Grid,
  Button,
  Box,
  Typography,
  FormHelperText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper
} from '@mui/material';
import { NauthilusConfig, ServerConfig } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import CollapsibleFormSection from './common/CollapsibleFormSection';

// Built-in feature types
const builtInFeatureTypes = [
  { value: 'tls_encryption', label: 'TLS Encryption' },
  { value: 'rbl', label: 'RBL' },
  { value: 'relay_domains', label: 'Relay Domains' },
  { value: 'backend_server_monitoring', label: 'Backend Server Monitoring' },
  { value: 'brute_force', label: 'Brute Force' },
  { value: 'lua', label: 'Lua' }
];

// Validation schema
const FeaturesConfigSchema = Yup.object().shape({
  selectedFeatures: Yup.array().of(
    Yup.string().required('Feature is required')
  ),
});

const FeaturesConfig: React.FC = () => {
  const { config, updateConfig, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();

  // Get existing features (already as strings)
  const existingFeatureNames = config?.server?.features || [];

  // Filter feature types based on Lua configuration
  const filteredFeatureTypes = useMemo(() => {
    // Check if Lua features are configured
    const hasLuaFeatures = config?.lua?.features && config.lua.features.length > 0;

    // If Lua features are not configured, filter out the 'lua' option
    if (!hasLuaFeatures) {
      return builtInFeatureTypes.filter(feature => feature.value !== 'lua');
    }

    // Otherwise, return all feature types
    return builtInFeatureTypes;
  }, [config?.lua?.features]);

  // Initial values
  const initialValues = {
    selectedFeatures: existingFeatureNames,
  };

  const handleSubmit = (values: any) => {
    if (!config) return;

    // Create a properly typed copy of the config
    const updatedConfig: NauthilusConfig = { 
      ...config as NauthilusConfig,
      // Ensure server is properly initialized
      server: {
        ...(config?.server || {}) as ServerConfig,
        features: values.selectedFeatures
      }
    };

    updateConfig(updatedConfig);

    // Reset unsaved changes flag after saving
    setHasUnsavedChanges(false);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Features Configuration
      </Typography>

      <Formik
        initialValues={initialValues}
        validationSchema={FeaturesConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
        onChangeCapture={() => setHasUnsavedChanges(true)}
      >
        {({ values, errors, touched, handleChange, setFieldValue }) => (
          <Form>
            <FormSection title="Standard Features">
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="body1" gutterBottom>
                    Configure standard features for the server. Select multiple features from the dropdown.
                  </Typography>

                  <Paper sx={{ p: 2, mb: 2 }}>
                    <FormControl 
                      fullWidth 
                      error={Boolean(
                        getIn(touched, 'selectedFeatures') &&
                        getIn(errors, 'selectedFeatures')
                      )}
                    >
                      <InputLabel id="features-select-label">Features</InputLabel>
                      <Select
                        labelId="features-select-label"
                        id="features-select"
                        multiple
                        value={values.selectedFeatures}
                        onChange={(e) => {
                          setFieldValue('selectedFeatures', e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        renderValue={(selected) => {
                          // Convert feature values to labels for display
                          return (selected as string[])
                            .map(value => {
                              // Always use builtInFeatureTypes for rendering, even if the option is filtered out
                              // This ensures we still show the correct label for any selected feature
                              const feature = builtInFeatureTypes.find(type => type.value === value);
                              return feature ? feature.label : value;
                            })
                            .join(', ');
                        }}
                      >
                        {filteredFeatureTypes.map((type) => (
                          <MenuItem key={type.value} value={type.value}>
                            {type.label}
                          </MenuItem>
                        ))}
                      </Select>
                      {Boolean(
                        getIn(touched, 'selectedFeatures') &&
                        getIn(errors, 'selectedFeatures')
                      ) && (
                        <FormHelperText>
                          {getIn(errors, 'selectedFeatures')}
                        </FormHelperText>
                      )}
                    </FormControl>
                  </Paper>
                </Grid>
              </Grid>
            </FormSection>


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
    </Box>
  );
};

export default FeaturesConfig;
