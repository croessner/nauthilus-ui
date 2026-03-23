import React from 'react';
import { Formik, Form, Field, getIn } from 'formik';
import * as Yup from 'yup';
import { TextField, FormControlLabel, Button, Box, Typography, Switch, InputAdornment } from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import PasswordField from './common/PasswordField';
import Grid from '@mui/material/Grid';

const AuthConfigSchema = Yup.object().shape({
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
  oidc_auth: Yup.object().shape({
    enabled: Yup.boolean(),
  }),
});

const AuthConfig = (): React.JSX.Element | null => {
  const { config, updateConfigSection, hasUnsavedChanges, setHasUnsavedChanges } = useConfig();

  React.useEffect(() => {
    setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  if (!config) {
    return null;
  }

  const legacyJwtEnabled = Boolean((config.server as any).jwt_auth?.enabled);

  const initialValues = {
    basic_auth: {
      enabled: config.server.basic_auth?.enabled || false,
      username: config.server.basic_auth?.username || '',
      password: config.server.basic_auth?.password || '',
    },
    oidc_auth: {
      enabled: config.server.oidc_auth?.enabled || legacyJwtEnabled || false,
    },
  };

  const handleSubmit = async (values: any) => {
    try {
      await updateConfigSection('server', {
        basic_auth: values.basic_auth,
        oidc_auth: values.oidc_auth,
        jwt_auth: undefined,
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
      enableReinitialize={true}
    >
      {({ errors, touched, values, handleChange, setFieldValue }) => (
        <Form>
          <FormSection
            title="Authentication Configuration"
            description="Configure authentication methods for accessing the API."
          >
            <Grid container spacing={3}>
              <Grid size={12}>
                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Basic Authentication</Typography>
              </Grid>
              <Grid size={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.basic_auth?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('basic_auth.enabled', e.target.checked)
                          .then(() => setHasUnsavedChanges(true));
                        if (e.target.checked && values.oidc_auth?.enabled) {
                          setFieldValue('oidc_auth.enabled', false)
                            .then(() => setHasUnsavedChanges(true));
                        }
                      }}
                      name="basic_auth.enabled"
                    />
                  }
                  label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable Basic Authentication<InfoTooltip title="Enables simple HTTP authentication for API access. Do not use alongside OIDC." /></Box>}
                />
              </Grid>
              {values.basic_auth?.enabled && (
                <>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field
                      as={TextField}
                      fullWidth
                      name="basic_auth.username"
                      label="Username"
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end"><InfoTooltip title="Username for Basic Auth. No spaces allowed." /></InputAdornment>
                      ) }}
                      variant="outlined"
                      error={getIn(touched, 'basic_auth.username') && Boolean(getIn(errors, 'basic_auth.username'))}
                      helperText={getIn(touched, 'basic_auth.username') && getIn(errors, 'basic_auth.username')}
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
                      name="basic_auth.password"
                      label="Password"
                      infoTitle="Password for Basic Auth. At least 16 characters, no spaces. Keep it secure."
                      variant="outlined"
                      error={getIn(touched, 'basic_auth.password') && Boolean(getIn(errors, 'basic_auth.password'))}
                      helperText={
                        (getIn(touched, 'basic_auth.password') && getIn(errors, 'basic_auth.password')) ||
                        'Password must be at least 16 characters and without spaces'
                      }
                      onChange={(e: React.ChangeEvent<any>) => {
                        handleChange(e);
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </Grid>
                </>
              )}

              <Grid size={12}>
                <Typography variant="subtitle1" sx={{ mt: 4, mb: 1 }}>OIDC Authentication</Typography>
              </Grid>
              <Grid size={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={values.oidc_auth?.enabled || false}
                      onChange={(e) => {
                        setFieldValue('oidc_auth.enabled', e.target.checked)
                          .then(() => setHasUnsavedChanges(true));
                        if (e.target.checked && values.basic_auth?.enabled) {
                          setFieldValue('basic_auth.enabled', false)
                            .then(() => setHasUnsavedChanges(true));
                        }
                      }}
                      name="oidc_auth.enabled"
                    />
                  }
                  label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable OIDC Authentication<InfoTooltip title="Enables OIDC authentication for API access. Do not use alongside Basic Auth." /></Box>}
                />
              </Grid>
              {values.oidc_auth?.enabled && (
                <Grid size={12}>
                  <Typography variant="body2" color="textSecondary">
                    OIDC authentication is enabled through <code>server.oidc_auth.enabled</code>.
                  </Typography>
                </Grid>
              )}
            </Grid>
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

export default AuthConfig;
