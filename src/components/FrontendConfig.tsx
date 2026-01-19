import React, { useState } from 'react';
import { Formik, Form, Field, getIn, FieldArray } from 'formik';
import * as Yup from 'yup';
import { TextField, FormControlLabel, Button, Box, Typography, Switch, Divider, IconButton, Card, CardContent, CardActions, Accordion, AccordionSummary, AccordionDetails, FormControl, InputLabel, Select, MenuItem, InputAdornment } from '@mui/material';
import InfoTooltip from './common/InfoTooltip';
import PasswordField from './common/PasswordField';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { FrontendConfig as FrontendConfigType, Oauth2Config } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';
import FormSection from './common/FormSection';
import ValidationErrors from './common/ValidationErrors';
import Grid from '@mui/material/Grid';

// Validation schema
const FrontendConfigSchema = Yup.object().shape({
  frontend: Yup.object().shape({
    enabled: Yup.boolean(),
    csrf_secret: Yup.string()
      .when('enabled', {
        is: true,
        then: schema => schema
          .required('CSRF Secret is required when frontend is enabled')
          .length(32, 'CSRF Secret must be exactly 32 characters')
          .matches(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/, 'CSRF Secret must contain only alphanumeric characters and symbols')
          .test(
            'no-spaces',
            'CSRF Secret must not contain spaces',
            value => !value || !value.includes(' ')
          ),
      }),
    cookie_store_auth_key: Yup.string()
      .when('enabled', {
        is: true,
        then: schema => schema
          .required('Cookie Store Auth Key is required when frontend is enabled')
          .length(32, 'Cookie Store Auth Key must be exactly 32 characters')
          .matches(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/, 'Cookie Store Auth Key must contain only alphanumeric characters and symbols')
          .test(
            'no-spaces',
            'Cookie Store Auth Key must not contain spaces',
            value => !value || !value.includes(' ')
          ),
      }),
    cookie_store_encryption_key: Yup.string()
      .when('enabled', {
        is: true,
        then: schema => schema
          .required('Cookie Store Encryption Key is required when frontend is enabled')
          .test(
            'valid-length',
            'Cookie Store Encryption Key must be 16, 24, or 32 characters',
            value => !value || [16, 24, 32].includes(value.length)
          )
          .matches(/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/, 'Cookie Store Encryption Key must contain only alphanumeric characters and symbols')
          .test(
            'no-spaces',
            'Cookie Store Encryption Key must not contain spaces',
            value => !value || !value.includes(' ')
          ),
      }),
    html_static_content_path: Yup.string(),
    default_logo_image: Yup.string(),
    login_page: Yup.string(),
    login_page_welcome: Yup.string(),
    login_page_logo_image_alt: Yup.string(),
    two_factor_page: Yup.string(),
    consent_page: Yup.string(),
    logout_page: Yup.string(),
    error_page: Yup.string(),
    notify_page: Yup.string(),
    device_page: Yup.string(),
    homepage: Yup.string().url('Must be a valid URL'),
    logout_page_welcome: Yup.string(),
    consent_page_welcome: Yup.string(),
    consent_page_logo_image_alt: Yup.string(),
    notify_page_welcome: Yup.string(),
    notify_page_logo_image_alt: Yup.string(),
    language_resources: Yup.string(),
    default_language: Yup.string(),
    hydra_admin_uri: Yup.string().url('Must be a valid URL'),
    totp_issuer: Yup.string(),
    totp_skew: Yup.number().min(0, 'Must be at least 0'),
    login_remember_for: Yup.number(),
  }),
  ory_hydra_admin_url: Yup.string()
    .url('Must be a valid URL')
    .test(
      'is-url-with-protocol',
      'URL must include protocol (http:// or https://)',
      value => !value || value.startsWith('http://') || value.startsWith('https://')
    ),
  oauth2: Yup.object().shape({
    custom_scopes: Yup.array().of(
      Yup.object().shape({
        name: Yup.string().required('Scope name is required'),
        description: Yup.string().required('Description is required'),
        claims: Yup.array().of(
          Yup.object().shape({
            name: Yup.string().required('Claim name is required'),
            type: Yup.string().required('Claim type is required'),
          })
        ),
      })
    ),
    clients: Yup.array().of(
      Yup.object().shape({
        skip_consent: Yup.boolean(),
        skip_totp: Yup.boolean(),
        name: Yup.string().required('Client name is required'),
        client_id: Yup.string().required('Client ID is required'),
        subject: Yup.string().required('Subject is required')
          .matches(/^[a-zA-Z0-9]+$/, 'Subject must contain only alphanumeric characters'),
        claims: Yup.object().shape({
          email: Yup.string(),
          email_verified: Yup.boolean(),
          name: Yup.string(),
          given_name: Yup.string(),
          family_name: Yup.string(),
          middle_name: Yup.string(),
          nickname: Yup.string(),
          preferred_username: Yup.string(),
          profile: Yup.string(),
          picture: Yup.string(),
          website: Yup.string(),
          gender: Yup.string(),
          birthdate: Yup.string(),
          zoneinfo: Yup.string(),
          locale: Yup.string(),
          phone_number: Yup.string(),
          phone_number_verified: Yup.boolean(),
          address: Yup.string(),
          updated_at: Yup.string(),
        }),
      })
    ),
  }),
});

const FrontendConfig = (): React.JSX.Element => {
  const { config, updateConfig, setHasUnsavedChanges, error } = useConfig();
  const [isFormChanged, setIsFormChanged] = useState(false);

  const initialValues: { 
    frontend?: FrontendConfigType, 
    ory_hydra_admin_url?: string,
    oauth2?: Oauth2Config
  } = {
    frontend: config?.server?.frontend || {
      enabled: false,
      csrf_secret: '',
      cookie_store_auth_key: '',
      cookie_store_encryption_key: '',
      html_static_content_path: '',
      default_logo_image: '',
      login_page: '',
      login_page_welcome: '',
      login_page_logo_image_alt: '',
      two_factor_page: '',
      consent_page: '',
      logout_page: '',
      error_page: '',
      notify_page: '',
      device_page: '',
      homepage: '',
      logout_page_welcome: '',
      consent_page_welcome: '',
      consent_page_logo_image_alt: '',
      notify_page_welcome: '',
      notify_page_logo_image_alt: '',
      language_resources: '',
      default_language: '',
      hydra_admin_uri: '',
      totp_issuer: '',
      totp_skew: 0,
      login_remember_for: 0,
    },
    ory_hydra_admin_url: config?.server?.ory_hydra_admin_url || '',
    oauth2: config?.oauth2 || {
      custom_scopes: [],
      clients: []
    }
  };


  const handleSubmit = (values: { 
    frontend?: FrontendConfigType, 
    ory_hydra_admin_url?: string,
    oauth2?: Oauth2Config
  }) => {
    if (!config) return;

    const newConfig = {
      ...config,
      server: {
        ...config.server,
        frontend: values.frontend,
        ory_hydra_admin_url: values.ory_hydra_admin_url,
      },
      oauth2: values.oauth2
    };

    updateConfig(newConfig)
        .then(() => {
          setHasUnsavedChanges(false);
          setIsFormChanged(false);
        })
  };

  // Function to check if form values have changed from initial values
  const checkFormChanged = (currentValues: any, initialVals: any): boolean => {
    return JSON.stringify(currentValues) !== JSON.stringify(initialVals);
  };

  return (
    <>
      {/* Display validation errors at the top of the form */}
      <ValidationErrors error={error} />

      <Formik
        initialValues={initialValues}
        validationSchema={FrontendConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
      // Track form changes
      validate={(values) => {
        // Check if current values differ from initial values
        const hasChanged = checkFormChanged(values, initialValues);
        setIsFormChanged(hasChanged);
        return {}; // Return an empty object (no validation errors)
      }}
    >
      {({ values, errors, touched, handleChange, handleBlur, isSubmitting, setFieldValue}) => {

        return (
          <Form>
            <FormSection title="Frontend Configuration">
              <Grid container spacing={3}>
                <Grid size={12}>
                  <Typography variant="body1" gutterBottom>
                    Configure the frontend settings for the web interface.
                  </Typography>
                </Grid>

                <Grid size={12}>
                  <FormControlLabel
                    control={
                      <Field
                        as={Switch}
                        name="frontend.enabled"
                        color="primary"
                        checked={values.frontend?.enabled || false}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setFieldValue('frontend.enabled', e.target.checked)
                              .then(() => setHasUnsavedChanges(true));
                        }}
                      />
                    }
                    label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable Frontend<InfoTooltip title="Enables the web frontend. Requires secure keys and HTTPS in production." /></Box>}
                  />
                </Grid>

                {values.frontend?.enabled && (
                  <>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Field
                        as={PasswordField}
                        fullWidth
                        label="CSRF Secret"
                        name="frontend.csrf_secret"
                        infoTitle="Secret 32-character key to protect against CSRF attacks. Keep it private."
                        value={values.frontend?.csrf_secret || ''}
                        onChange={handleChange}
                        error={Boolean(getIn(touched, 'frontend.csrf_secret') && getIn(errors, 'frontend.csrf_secret'))}
                        helperText={
                          (getIn(touched, 'frontend.csrf_secret') && getIn(errors, 'frontend.csrf_secret')) ||
                          "32 character string used for CSRF protection"
                        }
                      />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                      <Field
                        as={PasswordField}
                        fullWidth
                        label="Cookie Store Auth Key"
                                                infoTitle="32-character key for signing session cookies. Keep it private."
                        name="frontend.cookie_store_auth_key"
                        value={values.frontend?.cookie_store_auth_key || ''}
                        onChange={handleChange}
                        error={Boolean(getIn(touched, 'frontend.cookie_store_auth_key') && getIn(errors, 'frontend.cookie_store_auth_key'))}
                        helperText={
                          (getIn(touched, 'frontend.cookie_store_auth_key') && getIn(errors, 'frontend.cookie_store_auth_key')) ||
                          "32 character string used for cookie authentication"
                        }
                      />
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                      <Field
                        as={PasswordField}
                        fullWidth
                        label="Cookie Store Encryption Key"
                        name="frontend.cookie_store_encryption_key"
                        value={values.frontend?.cookie_store_encryption_key || ''}
                        onChange={handleChange}
                        error={Boolean(getIn(touched, 'frontend.cookie_store_encryption_key') && getIn(errors, 'frontend.cookie_store_encryption_key'))}
                        helperText={
                          (getIn(touched, 'frontend.cookie_store_encryption_key') && getIn(errors, 'frontend.cookie_store_encryption_key')) ||
                          "Must be 16, 24, or 32 characters long, used for cookie encryption"
                        }
                      />
                    </Grid>

                    <Grid size={12}>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="h6" gutterBottom>
                        Frontend UI Customization
                      </Typography>
                    </Grid>

                    <Grid size={12}>
                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>Paths & Resources</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                label="Static Content Path"
                                name="frontend.html_static_content_path"
                                value={values.frontend?.html_static_content_path || ''}
                                onChange={handleChange}
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Path to custom HTML/static content." /></InputAdornment>
                                ) }}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                label="Language Resources Path"
                                name="frontend.language_resources"
                                value={values.frontend?.language_resources || ''}
                                onChange={handleChange}
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Path to language translation files." /></InputAdornment>
                                ) }}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                label="Default Language"
                                name="frontend.default_language"
                                value={values.frontend?.default_language || ''}
                                onChange={handleChange}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                label="Homepage URL"
                                name="frontend.homepage"
                                value={values.frontend?.homepage || ''}
                                onChange={handleChange}
                                error={Boolean(getIn(touched, 'frontend.homepage') && getIn(errors, 'frontend.homepage'))}
                                helperText={getIn(touched, 'frontend.homepage') && getIn(errors, 'frontend.homepage')}
                              />
                            </Grid>
                          </Grid>
                        </AccordionDetails>
                      </Accordion>

                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>Identity & Auth Settings</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                label="TOTP Issuer"
                                name="frontend.totp_issuer"
                                value={values.frontend?.totp_issuer || ''}
                                onChange={handleChange}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                type="number"
                                label="TOTP Skew"
                                name="frontend.totp_skew"
                                value={values.frontend?.totp_skew || 0}
                                onChange={handleChange}
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Allowed time skew for TOTP tokens (steps)." /></InputAdornment>
                                ) }}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                type="number"
                                label="Login Remember For"
                                name="frontend.login_remember_for"
                                value={values.frontend?.login_remember_for || 0}
                                onChange={handleChange}
                                InputProps={{ endAdornment: (
                                  <InputAdornment position="end"><InfoTooltip title="Duration in seconds for 'Remember Me' sessions." /></InputAdornment>
                                ) }}
                              />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                              <Field
                                as={TextField}
                                fullWidth
                                label="Hydra Admin URI"
                                name="frontend.hydra_admin_uri"
                                value={values.frontend?.hydra_admin_uri || ''}
                                onChange={handleChange}
                                error={Boolean(getIn(touched, 'frontend.hydra_admin_uri') && getIn(errors, 'frontend.hydra_admin_uri'))}
                                helperText={getIn(touched, 'frontend.hydra_admin_uri') && getIn(errors, 'frontend.hydra_admin_uri')}
                              />
                            </Grid>
                          </Grid>
                        </AccordionDetails>
                      </Accordion>

                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>Login & Consent Pages</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>
                            <Grid size={12}><Typography variant="subtitle2">Login Page</Typography></Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Page Path" name="frontend.login_page" value={values.frontend?.login_page || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Welcome Message" name="frontend.login_page_welcome" value={values.frontend?.login_page_welcome || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Logo Alt Text" name="frontend.login_page_logo_image_alt" value={values.frontend?.login_page_logo_image_alt || ''} onChange={handleChange} />
                            </Grid>

                            <Grid size={12} sx={{ mt: 1 }}><Typography variant="subtitle2">Consent Page</Typography></Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Page Path" name="frontend.consent_page" value={values.frontend?.consent_page || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Welcome Message" name="frontend.consent_page_welcome" value={values.frontend?.consent_page_welcome || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Logo Alt Text" name="frontend.consent_page_logo_image_alt" value={values.frontend?.consent_page_logo_image_alt || ''} onChange={handleChange} />
                            </Grid>
                          </Grid>
                        </AccordionDetails>
                      </Accordion>

                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>Notify & Other Pages</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>
                            <Grid size={12}><Typography variant="subtitle2">Notify Page</Typography></Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Page Path" name="frontend.notify_page" value={values.frontend?.notify_page || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Welcome Message" name="frontend.notify_page_welcome" value={values.frontend?.notify_page_welcome || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Logo Alt Text" name="frontend.notify_page_logo_image_alt" value={values.frontend?.notify_page_logo_image_alt || ''} onChange={handleChange} />
                            </Grid>

                            <Grid size={12} sx={{ mt: 1 }}><Typography variant="subtitle2">Other Pages</Typography></Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Logout Page Path" name="frontend.logout_page" value={values.frontend?.logout_page || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 8 }}>
                              <Field as={TextField} fullWidth label="Logout Welcome Message" name="frontend.logout_page_welcome" value={values.frontend?.logout_page_welcome || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="2FA Page" name="frontend.two_factor_page" value={values.frontend?.two_factor_page || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Error Page" name="frontend.error_page" value={values.frontend?.error_page || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={{ xs: 12, md: 4 }}>
                              <Field as={TextField} fullWidth label="Device Page" name="frontend.device_page" value={values.frontend?.device_page || ''} onChange={handleChange} />
                            </Grid>
                            <Grid size={12}>
                              <Field as={TextField} fullWidth label="Default Logo Image" name="frontend.default_logo_image" value={values.frontend?.default_logo_image || ''} onChange={handleChange} helperText="Path or URL to the default logo image." />
                            </Grid>
                          </Grid>
                        </AccordionDetails>
                      </Accordion>
                    </Grid>
                  </>
                )}

                <Grid size={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Ory Hydra Configuration
                  </Typography>
                </Grid>

                <Grid size={12}>
                  <Field
                    as={TextField}
                    fullWidth
                    label="Ory Hydra Admin URL"
                    name="ory_hydra_admin_url"
                    value={values.ory_hydra_admin_url || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    error={Boolean(getIn(touched, 'ory_hydra_admin_url') && getIn(errors, 'ory_hydra_admin_url'))}
                    helperText={
                      (getIn(touched, 'ory_hydra_admin_url') && getIn(errors, 'ory_hydra_admin_url')) ||
                      "URL to the Ory Hydra Admin API (e.g., https://hydra-admin.example.com)"
                    }
                  />
                </Grid>

                <Grid size={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    OAuth2 Configuration
                  </Typography>
                </Grid>

                {/* OAuth2 Custom Scopes */}
                <Grid size={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle1">Custom Scopes</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <FieldArray name="oauth2.custom_scopes">
                        {({ push, remove }) => (
                          <Box>
                            {values.oauth2?.custom_scopes && values.oauth2.custom_scopes.length > 0 ? (
                              values.oauth2.custom_scopes.map((scope, scopeIndex) => (
                                <Card key={scopeIndex} sx={{ mb: 2 }}>
                                  <CardContent>
                                    <Grid container spacing={2}>
                                      <Grid size={{ xs: 12, sm: 6 }}>
                                        <Field
                                          as={TextField}
                                          fullWidth
                                          label="Scope Name"
                                          name={`oauth2.custom_scopes.${scopeIndex}.name`}
                                          error={Boolean(
                                            getIn(touched, `oauth2.custom_scopes.${scopeIndex}.name`) &&
                                            getIn(errors, `oauth2.custom_scopes.${scopeIndex}.name`)
                                          )}
                                          helperText={
                                            getIn(touched, `oauth2.custom_scopes.${scopeIndex}.name`) &&
                                            getIn(errors, `oauth2.custom_scopes.${scopeIndex}.name`)
                                          }
                                        />
                                      </Grid>
                                      <Grid size={{ xs: 12, sm: 6 }}>
                                        <Field
                                          as={TextField}
                                          fullWidth
                                          label="Description"
                                          name={`oauth2.custom_scopes.${scopeIndex}.description`}
                                          error={Boolean(
                                            getIn(touched, `oauth2.custom_scopes.${scopeIndex}.description`) &&
                                            getIn(errors, `oauth2.custom_scopes.${scopeIndex}.description`)
                                          )}
                                          helperText={
                                            getIn(touched, `oauth2.custom_scopes.${scopeIndex}.description`) &&
                                            getIn(errors, `oauth2.custom_scopes.${scopeIndex}.description`)
                                          }
                                        />
                                      </Grid>
                                    </Grid>

                                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                                      Claims
                                    </Typography>

                                    <FieldArray name={`oauth2.custom_scopes.${scopeIndex}.claims`}>
                                      {({ push: pushClaim, remove: removeClaim }) => (
                                        <Box>
                                          {scope.claims && scope.claims.length > 0 ? (
                                            scope.claims.map((_claim, claimIndex) => (
                                              <Grid container spacing={2} key={claimIndex} sx={{ mb: 1 }}>
                                                <Grid size={5}>
                                                  <Field
                                                    as={TextField}
                                                    fullWidth
                                                    label="Claim Name"
                                                    name={`oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.name`}
                                                    error={Boolean(
                                                      getIn(touched, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.name`) &&
                                                      getIn(errors, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.name`)
                                                    )}
                                                    helperText={
                                                      getIn(touched, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.name`) &&
                                                      getIn(errors, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.name`)
                                                    }
                                                  />
                                                </Grid>
                                                <Grid size={5}>
                                                  <FormControl 
                                                    fullWidth
                                                    error={Boolean(
                                                      getIn(touched, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.type`) &&
                                                      getIn(errors, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.type`)
                                                    )}
                                                  >
                                                    <InputLabel id={`claim-type-label-${scopeIndex}-${claimIndex}`}>Claim Type</InputLabel>
                                                    <Field
                                                      as={Select}
                                                      labelId={`claim-type-label-${scopeIndex}-${claimIndex}`}
                                                      label="Claim Type"
                                                      name={`oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.type`}
                                                    >
                                                      <MenuItem value="string">string</MenuItem>
                                                      <MenuItem value="boolean">boolean</MenuItem>
                                                      <MenuItem value="float">float</MenuItem>
                                                      <MenuItem value="integer">integer</MenuItem>
                                                    </Field>
                                                    {Boolean(
                                                      getIn(touched, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.type`) &&
                                                      getIn(errors, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.type`)
                                                    ) && (
                                                      <Typography variant="caption" color="error">
                                                        {getIn(errors, `oauth2.custom_scopes.${scopeIndex}.claims.${claimIndex}.type`)}
                                                      </Typography>
                                                    )}
                                                  </FormControl>
                                                </Grid>
                                                <Grid size={2}>
                                                  <IconButton
                                                    color="error"
                                                    onClick={() => removeClaim(claimIndex)}
                                                    sx={{ mt: 1 }}
                                                  >
                                                    <DeleteIcon />
                                                  </IconButton>
                                                </Grid>
                                              </Grid>
                                            ))
                                          ) : (
                                            <Typography color="textSecondary" sx={{ mb: 2 }}>
                                              No claims defined
                                            </Typography>
                                          )}
                                          <Button
                                            startIcon={<AddIcon />}
                                            onClick={() => pushClaim({ name: '', type: 'string' })}
                                            variant="outlined"
                                            size="small"
                                            sx={{ mt: 1 }}
                                          >
                                            Add Claim
                                          </Button>
                                        </Box>
                                      )}
                                    </FieldArray>
                                  </CardContent>
                                  <CardActions>
                                    <Button
                                      startIcon={<DeleteIcon />}
                                      color="error"
                                      onClick={() => remove(scopeIndex)}
                                    >
                                      Remove Scope
                                    </Button>
                                  </CardActions>
                                </Card>
                              ))
                            ) : (
                              <Typography color="textSecondary" sx={{ mb: 2 }}>
                                No custom scopes defined
                              </Typography>
                            )}
                            <Button
                              startIcon={<AddIcon />}
                              onClick={() => push({ name: '', description: '', claims: [] })}
                              variant="outlined"
                              sx={{ mt: 1 }}
                            >
                              Add Custom Scope
                            </Button>
                          </Box>
                        )}
                      </FieldArray>
                    </AccordionDetails>
                  </Accordion>
                </Grid>

                {/* OAuth2 Clients */}
                <Grid sx={{ mt: 2 }} size={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle1">OAuth2 Clients</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <FieldArray name="oauth2.clients">
                        {({ push, remove }) => (
                          <Box>
                            {values.oauth2?.clients && values.oauth2.clients.length > 0 ? (
                              values.oauth2.clients.map((client, clientIndex) => (
                                <Card key={clientIndex} sx={{ mb: 2 }}>
                                  <CardContent>
                                    <Grid container spacing={2}>
                                      <Grid size={{ xs: 12, sm: 6 }}>
                                        <Field
                                          as={TextField}
                                          fullWidth
                                          label="Client Name"
                                          name={`oauth2.clients.${clientIndex}.name`}
                                          error={Boolean(
                                            getIn(touched, `oauth2.clients.${clientIndex}.name`) &&
                                            getIn(errors, `oauth2.clients.${clientIndex}.name`)
                                          )}
                                          helperText={
                                            getIn(touched, `oauth2.clients.${clientIndex}.name`) &&
                                            getIn(errors, `oauth2.clients.${clientIndex}.name`)
                                          }
                                        />
                                      </Grid>
                                      <Grid size={{ xs: 12, sm: 6 }}>
                                        <Field
                                          as={TextField}
                                          fullWidth
                                          label="Client ID"
                                          name={`oauth2.clients.${clientIndex}.client_id`}
                                          error={Boolean(
                                            getIn(touched, `oauth2.clients.${clientIndex}.client_id`) &&
                                            getIn(errors, `oauth2.clients.${clientIndex}.client_id`)
                                          )}
                                          helperText={
                                            getIn(touched, `oauth2.clients.${clientIndex}.client_id`) &&
                                            getIn(errors, `oauth2.clients.${clientIndex}.client_id`)
                                          }
                                        />
                                      </Grid>
                                      <Grid size={{ xs: 12, sm: 6 }}>
                                        <Field
                                          as={TextField}
                                          fullWidth
                                          label="Subject"
                                          name={`oauth2.clients.${clientIndex}.subject`}
                                          error={Boolean(
                                            getIn(touched, `oauth2.clients.${clientIndex}.subject`) &&
                                            getIn(errors, `oauth2.clients.${clientIndex}.subject`)
                                          )}
                                          helperText={
                                            (getIn(touched, `oauth2.clients.${clientIndex}.subject`) &&
                                            getIn(errors, `oauth2.clients.${clientIndex}.subject`)) ||
                                            "Alphanumeric identifier for the subject"
                                          }
                                        />
                                      </Grid>
                                      <Grid size={{ xs: 12, sm: 6 }}>
                                        <FormControlLabel
                                          control={
                                            <Field
                                              as={Switch}
                                              name={`oauth2.clients.${clientIndex}.skip_consent`}
                                              color="primary"
                                              checked={client.skip_consent || false}
                                            />
                                          }
                                          label="Skip Consent"
                                        />
                                        <FormControlLabel
                                          control={
                                            <Field
                                              as={Switch}
                                              name={`oauth2.clients.${clientIndex}.skip_totp`}
                                              color="primary"
                                              checked={client.skip_totp || false}
                                            />
                                          }
                                          label="Skip TOTP"
                                        />
                                      </Grid>
                                    </Grid>

                                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                                      ID Token Claims
                                    </Typography>

                                    <Accordion>
                                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                        <Typography>Configure Claims</Typography>
                                      </AccordionSummary>
                                      <AccordionDetails>
                                        <Grid container spacing={2}>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <Field
                                              as={TextField}
                                              fullWidth
                                              label="Email"
                                              name={`oauth2.clients.${clientIndex}.claims.email`}
                                              error={Boolean(
                                                getIn(touched, `oauth2.clients.${clientIndex}.claims.email`) &&
                                                getIn(errors, `oauth2.clients.${clientIndex}.claims.email`)
                                              )}
                                              helperText={
                                                getIn(touched, `oauth2.clients.${clientIndex}.claims.email`) &&
                                                getIn(errors, `oauth2.clients.${clientIndex}.claims.email`)
                                              }
                                            />
                                          </Grid>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <FormControlLabel
                                              control={
                                                <Field
                                                  as={Switch}
                                                  name={`oauth2.clients.${clientIndex}.claims.email_verified`}
                                                  color="primary"
                                                  checked={client.claims?.email_verified || false}
                                                />
                                              }
                                              label="Email Verified"
                                            />
                                          </Grid>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <Field
                                              as={TextField}
                                              fullWidth
                                              label="Name"
                                              name={`oauth2.clients.${clientIndex}.claims.name`}
                                            />
                                          </Grid>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <Field
                                              as={TextField}
                                              fullWidth
                                              label="Given Name"
                                              name={`oauth2.clients.${clientIndex}.claims.given_name`}
                                            />
                                          </Grid>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <Field
                                              as={TextField}
                                              fullWidth
                                              label="Family Name"
                                              name={`oauth2.clients.${clientIndex}.claims.family_name`}
                                            />
                                          </Grid>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <Field
                                              as={TextField}
                                              fullWidth
                                              label="Middle Name"
                                              name={`oauth2.clients.${clientIndex}.claims.middle_name`}
                                            />
                                          </Grid>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <Field
                                              as={TextField}
                                              fullWidth
                                              label="Nickname"
                                              name={`oauth2.clients.${clientIndex}.claims.nickname`}
                                            />
                                          </Grid>
                                          <Grid size={{ xs: 12, sm: 6 }}>
                                            <Field
                                              as={TextField}
                                              fullWidth
                                              label="Preferred Username"
                                              name={`oauth2.clients.${clientIndex}.claims.preferred_username`}
                                            />
                                          </Grid>
                                        </Grid>
                                      </AccordionDetails>
                                    </Accordion>
                                  </CardContent>
                                  <CardActions>
                                    <Button
                                      startIcon={<DeleteIcon />}
                                      color="error"
                                      onClick={() => remove(clientIndex)}
                                    >
                                      Remove Client
                                    </Button>
                                  </CardActions>
                                </Card>
                              ))
                            ) : (
                              <Typography color="textSecondary" sx={{ mb: 2 }}>
                                No OAuth2 clients defined
                              </Typography>
                            )}
                            <Button
                              startIcon={<AddIcon />}
                              onClick={() => push({ 
                                name: '', 
                                client_id: '', 
                                subject: '',
                                skip_consent: false,
                                skip_totp: false,
                                claims: {}
                              })}
                              variant="outlined"
                              sx={{ mt: 1 }}
                            >
                              Add OAuth2 Client
                            </Button>
                          </Box>
                        )}
                      </FieldArray>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              </Grid>
            </FormSection>

            <Box mt={3} display="flex" justifyContent="flex-end">
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isSubmitting || !isFormChanged}
              >
                Save Changes
              </Button>
            </Box>
          </Form>
        );
      }}
    </Formik>
    </>
  );
};

export default FrontendConfig;
