import React, { useEffect, useMemo } from 'react';
import { Formik, Form, Field, getIn, FieldArray } from 'formik';
import * as Yup from 'yup';
import {
  TextField,
  FormControlLabel,
  Button,
  Box,
  Typography,
  Switch,
  Divider,
  IconButton,
  Card,
  CardContent,
  CardActions,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoTooltip from './common/InfoTooltip';
import PasswordField from './common/PasswordField';
import FormSection from './common/FormSection';
import ValidationErrors from './common/ValidationErrors';
import CollapsibleFormSection from './common/CollapsibleFormSection';
import { FrontendConfig as FrontendConfigType, IdPConfig, NauthilusConfig } from '../types/config';
import { useConfig } from '../contexts/ConfigContext';

type FrontendPageValues = {
  frontend: FrontendConfigType;
  idp: IdPConfig;
};

const FrontendConfigSchema = Yup.object().shape({
  frontend: Yup.object().shape({
    enabled: Yup.boolean(),
    encryption_secret: Yup.string().when('enabled', {
      is: true,
      then: (schema) => schema.required('Encryption secret is required when frontend is enabled').min(16, 'Must be at least 16 characters'),
      otherwise: (schema) => schema,
    }),
    totp_skew: Yup.number().min(0, 'Must be at least 0'),
  }),
  idp: Yup.object().shape({
    oidc: Yup.object().shape({
      enabled: Yup.boolean(),
      issuer: Yup.string().when('enabled', {
        is: true,
        then: (schema) => schema.required('Issuer is required when OIDC is enabled'),
        otherwise: (schema) => schema,
      }),
      clients: Yup.array().of(
        Yup.object().shape({
          client_id: Yup.string().required('Client ID is required'),
        })
      ),
    }),
    saml2: Yup.object().shape({
      service_providers: Yup.array().of(
        Yup.object().shape({
          entity_id: Yup.string().required('Entity ID is required'),
          acs_url: Yup.string().required('ACS URL is required'),
        })
      ),
    }),
  }),
});

const defaultValues: FrontendPageValues = {
  frontend: {
    enabled: false,
    encryption_secret: '',
    html_static_content_path: '',
    language_resources: '',
    languages: [],
    default_language: '',
    totp_issuer: '',
    totp_skew: 0,
    security_headers: {
      enabled: true,
      content_security_policy: '',
      content_security_policy_report_only: false,
      strict_transport_security: '',
      x_content_type_options: '',
      x_frame_options: '',
      referrer_policy: '',
      permissions_policy: '',
      cross_origin_opener_policy: '',
      cross_origin_resource_policy: '',
      cross_origin_embedder_policy: '',
      x_permitted_cross_domain_policies: '',
      x_dns_prefetch_control: '',
    },
  },
  idp: {
    remember_me_ttl: '',
    terms_of_service_url: '',
    privacy_policy_url: '',
    webauthn: {
      rp_display_name: '',
      rp_id: '',
      rp_origins: [],
      authenticator_attachment: '',
      resident_key: '',
      user_verification: '',
    },
    oidc: {
      enabled: false,
      issuer: '',
      signing_keys: [],
      auto_key_rotation: false,
      key_rotation_interval: '',
      key_max_age: '',
      clients: [],
      custom_scopes: [],
      scopes_supported: [],
      response_types_supported: [],
      subject_types_supported: [],
      id_token_signing_alg_values_supported: [],
      token_endpoint_auth_methods_supported: [],
      code_challenge_methods_supported: [],
      claims_supported: [],
      front_channel_logout_supported: true,
      front_channel_logout_session_supported: false,
      back_channel_logout_supported: true,
      back_channel_logout_session_supported: false,
      access_token_type: 'jwt',
      default_access_token_lifetime: '',
      default_refresh_token_lifetime: '',
      consent_ttl: '',
      consent_mode: 'all_or_nothing',
      token_endpoint_allow_get: false,
      device_code_expiry: '',
      device_code_polling_interval: 0,
      device_code_user_code_length: 0,
    },
    saml2: {
      enabled: false,
      entity_id: '',
      cert: '',
      cert_file: '',
      key: '',
      key_file: '',
      service_providers: [],
      signature_method: '',
      default_expire_time: '',
      name_id_format: '',
      slo: {
        enabled: true,
        front_channel_enabled: true,
        back_channel_enabled: false,
        request_timeout: '',
        max_participants: 0,
        back_channel_max_retries: 0,
      },
    },
  },
};

interface DirtyStateBridgeProps {
  dirty: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
}

const DirtyStateBridge = ({ dirty, setHasUnsavedChanges }: DirtyStateBridgeProps): null => {
  useEffect(() => {
    setHasUnsavedChanges(dirty);
  }, [dirty, setHasUnsavedChanges]);

  return null;
};

const FrontendConfig = (): React.JSX.Element => {
  const { config, updateConfig, setHasUnsavedChanges, error } = useConfig();

  const initialValues = useMemo<FrontendPageValues>(() => ({
    frontend: {
      ...defaultValues.frontend,
      ...(config?.server?.frontend || {}),
      security_headers: {
        ...(defaultValues.frontend.security_headers || {}),
        ...(config?.server?.frontend?.security_headers || {}),
      },
    },
    idp: {
      ...defaultValues.idp,
      ...(config?.idp || {}),
      webauthn: {
        ...(defaultValues.idp.webauthn || {}),
        ...(config?.idp?.webauthn || {}),
      },
      oidc: {
        ...(defaultValues.idp.oidc || {}),
        ...(config?.idp?.oidc || {}),
        signing_keys: config?.idp?.oidc?.signing_keys || [],
        clients: config?.idp?.oidc?.clients || [],
        custom_scopes: config?.idp?.oidc?.custom_scopes || [],
        scopes_supported: config?.idp?.oidc?.scopes_supported || [],
        response_types_supported: config?.idp?.oidc?.response_types_supported || [],
        subject_types_supported: config?.idp?.oidc?.subject_types_supported || [],
        id_token_signing_alg_values_supported: config?.idp?.oidc?.id_token_signing_alg_values_supported || [],
        token_endpoint_auth_methods_supported: config?.idp?.oidc?.token_endpoint_auth_methods_supported || [],
        code_challenge_methods_supported: config?.idp?.oidc?.code_challenge_methods_supported || [],
        claims_supported: config?.idp?.oidc?.claims_supported || [],
      },
      saml2: {
        ...(defaultValues.idp.saml2 || {}),
        ...(config?.idp?.saml2 || {}),
        slo: {
          ...(defaultValues.idp.saml2?.slo || {}),
          ...(config?.idp?.saml2?.slo || {}),
        },
        service_providers: config?.idp?.saml2?.service_providers || [],
      },
    },
  }), [config]);

  const handleSubmit = (values: FrontendPageValues) => {
    if (!config) return;

    const currentServer: Record<string, unknown> = { ...(config.server as Record<string, unknown>) };
    const nextIdP: IdPConfig = { ...(values.idp || {}) };

    const oidcAny = nextIdP.oidc as Record<string, any> | undefined;
    if (oidcAny && Array.isArray(oidcAny.clients)) {
      oidcAny.clients = oidcAny.clients.map((client: Record<string, any>) => {
        const { remember_me_ttl, ...cleanClient } = client;
        return cleanClient;
      });
    }

    const saml2Any = nextIdP.saml2 as Record<string, any> | undefined;
    if (saml2Any) {
      delete saml2Any.slo_enabled;
      delete saml2Any.slo_front_channel_enabled;
      delete saml2Any.slo_back_channel_enabled;
      delete saml2Any.slo_back_channel_timeout;
      delete saml2Any.slo_back_channel_max_retries;

      if (Array.isArray(saml2Any.service_providers)) {
        saml2Any.service_providers = saml2Any.service_providers.map((sp: Record<string, any>) => {
          const { remember_me_ttl, ...cleanSp } = sp;
          return cleanSp;
        });
      }
    }

    const nextConfig: NauthilusConfig = {
      ...(config as NauthilusConfig),
      server: {
        ...(currentServer as any),
        frontend: values.frontend,
      },
      idp: nextIdP,
    };

    delete (nextConfig as any).oauth2;

    updateConfig(nextConfig).then(() => {
      setHasUnsavedChanges(false);
    });
  };

  return (
    <>
      <ValidationErrors error={error} />

      <Formik
        initialValues={initialValues}
        validationSchema={FrontendConfigSchema}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ values, errors, touched, handleChange, isSubmitting, setFieldValue, dirty }: any) => {
          const renderStringArrayEditor = (name: string, label: string, helperText?: string) => {
            const list: string[] = getIn(values, name) || [];

            return (
              <FieldArray name={name}>
                {({ push, remove }: any) => (
                  <Box>
                    {list.length > 0 ? (
                      list.map((item: string, index: number) => (
                        <Grid container spacing={1} key={`${name}-${index}`} sx={{ mb: 1 }}>
                          <Grid size={{ xs: 11 }}>
                            <TextField
                              fullWidth
                              label={`${label} ${index + 1}`}
                              value={item || ''}
                              onChange={(e) => {
                                setFieldValue(`${name}.${index}`, e.target.value).then(() => setHasUnsavedChanges(true));
                              }}
                              helperText={index === 0 ? helperText : undefined}
                            />
                          </Grid>
                          <Grid size={{ xs: 1 }}>
                            <IconButton color="error" onClick={() => {
                              remove(index);
                              setHasUnsavedChanges(true);
                            }}>
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>
                      ))
                    ) : (
                      <Typography color="text.secondary" sx={{ mb: 1 }}>No entries configured.</Typography>
                    )}
                    <Button
                      startIcon={<AddIcon />}
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        push('');
                        setHasUnsavedChanges(true);
                      }}
                    >
                      Add {label}
                    </Button>
                  </Box>
                )}
              </FieldArray>
            );
          };

          const renderClaimMappingsEditor = (name: string) => {
            const mappings: Array<{ claim?: string; attribute?: string; type?: string }> = getIn(values, name) || [];

            return (
              <FieldArray name={name}>
                {({ push, remove }: any) => (
                  <Box>
                    {mappings.length > 0 ? mappings.map((_: any, index: number) => (
                      <Grid container spacing={1} key={`${name}-${index}`} sx={{ mb: 1 }}>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <TextField
                            fullWidth
                            label="Claim"
                            value={getIn(values, `${name}.${index}.claim`) || ''}
                            onChange={(e) => {
                              setFieldValue(`${name}.${index}.claim`, e.target.value).then(() => setHasUnsavedChanges(true));
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <TextField
                            fullWidth
                            label="Attribute"
                            value={getIn(values, `${name}.${index}.attribute`) || ''}
                            onChange={(e) => {
                              setFieldValue(`${name}.${index}.attribute`, e.target.value).then(() => setHasUnsavedChanges(true));
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                          <TextField
                            fullWidth
                            label="Type"
                            value={getIn(values, `${name}.${index}.type`) || ''}
                            onChange={(e) => {
                              setFieldValue(`${name}.${index}.type`, e.target.value).then(() => setHasUnsavedChanges(true));
                            }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 1 }}>
                          <IconButton color="error" onClick={() => {
                            remove(index);
                            setHasUnsavedChanges(true);
                          }}>
                            <DeleteIcon />
                          </IconButton>
                        </Grid>
                      </Grid>
                    )) : <Typography color="text.secondary" sx={{ mb: 1 }}>No mappings configured.</Typography>}
                    <Button
                      startIcon={<AddIcon />}
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        push({ claim: '', attribute: '', type: '' });
                        setHasUnsavedChanges(true);
                      }}
                    >
                      Add Mapping
                    </Button>
                  </Box>
                )}
              </FieldArray>
            );
          };

          return (
            <Form>
              <DirtyStateBridge dirty={dirty} setHasUnsavedChanges={setHasUnsavedChanges} />
              <FormSection title="Frontend & IdP Configuration">
                <Grid container spacing={3}>
                  <Grid size={12}>
                    <Typography variant="body1" gutterBottom>
                      Configure frontend settings and the complete integrated IdP stack (OIDC, SAML2, WebAuthn).
                    </Typography>
                  </Grid>

                  <Grid size={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="h6">Frontend</Typography>
                  </Grid>

                  <Grid size={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={values.frontend?.enabled || false}
                          onChange={(e) => {
                            setFieldValue('frontend.enabled', e.target.checked).then(() => setHasUnsavedChanges(true));
                          }}
                        />
                      }
                      label={<Box sx={{ display: 'inline-flex', alignItems: 'center' }}>Enable Frontend<InfoTooltip title="Enable/disable internal frontend routes." /></Box>}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field
                      as={PasswordField}
                      fullWidth
                      name="frontend.encryption_secret"
                      label="Encryption Secret"
                      infoTitle="Secret used for frontend cookie/session encryption (min 16 chars)."
                      error={Boolean(getIn(touched, 'frontend.encryption_secret') && getIn(errors, 'frontend.encryption_secret'))}
                      helperText={(getIn(touched, 'frontend.encryption_secret') && getIn(errors, 'frontend.encryption_secret')) || 'Required when frontend is enabled'}
                      onChange={handleChange}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field as={TextField} fullWidth name="frontend.html_static_content_path" label="HTML Static Content Path" onChange={handleChange} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field as={TextField} fullWidth name="frontend.language_resources" label="Language Resources Path" onChange={handleChange} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field as={TextField} fullWidth name="frontend.default_language" label="Default Language" onChange={handleChange} />
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field as={TextField} fullWidth name="frontend.totp_issuer" label="TOTP Issuer" onChange={handleChange} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Field
                      as={TextField}
                      fullWidth
                      type="number"
                      name="frontend.totp_skew"
                      label="TOTP Skew"
                      onChange={handleChange}
                      InputProps={{ endAdornment: <InputAdornment position="end"><InfoTooltip title="Allowed TOTP time skew steps." /></InputAdornment> }}
                    />
                  </Grid>

                  <Grid size={12}>
                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography>Frontend Languages</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        {renderStringArrayEditor('frontend.languages', 'Language Code', 'Example: en, de, fr')}
                      </AccordionDetails>
                    </Accordion>
                  </Grid>

                  <Grid size={12}>
                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography>Frontend Security Headers</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Grid container spacing={2}>
                          <Grid size={12}>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={values.frontend?.security_headers?.enabled ?? true}
                                  onChange={(e) => {
                                    setFieldValue('frontend.security_headers.enabled', e.target.checked).then(() => setHasUnsavedChanges(true));
                                  }}
                                />
                              }
                              label="Enable Security Headers"
                            />
                          </Grid>
                          {[
                            ['content_security_policy', 'Content Security Policy'],
                            ['strict_transport_security', 'Strict Transport Security'],
                            ['x_content_type_options', 'X-Content-Type-Options'],
                            ['x_frame_options', 'X-Frame-Options'],
                            ['referrer_policy', 'Referrer Policy'],
                            ['permissions_policy', 'Permissions Policy'],
                            ['cross_origin_opener_policy', 'Cross-Origin-Opener-Policy'],
                            ['cross_origin_resource_policy', 'Cross-Origin-Resource-Policy'],
                            ['cross_origin_embedder_policy', 'Cross-Origin-Embedder-Policy'],
                            ['x_permitted_cross_domain_policies', 'X-Permitted-Cross-Domain-Policies'],
                            ['x_dns_prefetch_control', 'X-DNS-Prefetch-Control'],
                          ].map(([key, label]) => (
                            <Grid key={key} size={{ xs: 12, md: 6 }}>
                              <Field as={TextField} fullWidth name={`frontend.security_headers.${key}`} label={label} onChange={handleChange} />
                            </Grid>
                          ))}
                          <Grid size={{ xs: 12, md: 6 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={values.frontend?.security_headers?.content_security_policy_report_only || false}
                                  onChange={(e) => {
                                    setFieldValue('frontend.security_headers.content_security_policy_report_only', e.target.checked).then(() => setHasUnsavedChanges(true));
                                  }}
                                />
                              }
                              label="CSP Report-Only"
                            />
                          </Grid>
                        </Grid>
                      </AccordionDetails>
                    </Accordion>
                  </Grid>

                  <Grid size={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="h6">IdP Global</Typography>
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Field as={TextField} fullWidth name="idp.remember_me_ttl" label="Remember Me TTL" onChange={handleChange} helperText="Duration like 24h" />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Field as={TextField} fullWidth name="idp.terms_of_service_url" label="Terms of Service URL" onChange={handleChange} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Field as={TextField} fullWidth name="idp.privacy_policy_url" label="Privacy Policy URL" onChange={handleChange} />
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="WebAuthn" description="idp.webauthn" defaultExpanded={false}>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <Field as={TextField} fullWidth name="idp.webauthn.rp_display_name" label="RP Display Name" onChange={handleChange} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <Field as={TextField} fullWidth name="idp.webauthn.rp_id" label="RP ID" onChange={handleChange} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <FormControl fullWidth>
                            <InputLabel>Authenticator Attachment</InputLabel>
                            <Select
                              label="Authenticator Attachment"
                              value={values.idp?.webauthn?.authenticator_attachment || ''}
                              onChange={(e) => setFieldValue('idp.webauthn.authenticator_attachment', e.target.value).then(() => setHasUnsavedChanges(true))}
                            >
                              <MenuItem value="">(default)</MenuItem>
                              <MenuItem value="platform">platform</MenuItem>
                              <MenuItem value="cross-platform">cross-platform</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <FormControl fullWidth>
                            <InputLabel>Resident Key</InputLabel>
                            <Select
                              label="Resident Key"
                              value={values.idp?.webauthn?.resident_key || ''}
                              onChange={(e) => setFieldValue('idp.webauthn.resident_key', e.target.value).then(() => setHasUnsavedChanges(true))}
                            >
                              <MenuItem value="">(default)</MenuItem>
                              <MenuItem value="discouraged">discouraged</MenuItem>
                              <MenuItem value="preferred">preferred</MenuItem>
                              <MenuItem value="required">required</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <FormControl fullWidth>
                            <InputLabel>User Verification</InputLabel>
                            <Select
                              label="User Verification"
                              value={values.idp?.webauthn?.user_verification || ''}
                              onChange={(e) => setFieldValue('idp.webauthn.user_verification', e.target.value).then(() => setHasUnsavedChanges(true))}
                            >
                              <MenuItem value="">(default)</MenuItem>
                              <MenuItem value="discouraged">discouraged</MenuItem>
                              <MenuItem value="preferred">preferred</MenuItem>
                              <MenuItem value="required">required</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={12}>
                          {renderStringArrayEditor('idp.webauthn.rp_origins', 'RP Origin', 'Example: https://idp.example.com')}
                        </Grid>
                      </Grid>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="OIDC" description="idp.oidc" defaultExpanded={false}>
                      <Grid container spacing={2}>
                        <Grid size={12}>
                          <FormControlLabel
                            control={<Switch checked={values.idp?.oidc?.enabled || false} onChange={(e) => setFieldValue('idp.oidc.enabled', e.target.checked).then(() => setHasUnsavedChanges(true))} />}
                            label="Enable OIDC"
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 8 }}>
                          <Field as={TextField} fullWidth name="idp.oidc.issuer" label="Issuer" onChange={handleChange} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <FormControl fullWidth>
                            <InputLabel>Access Token Type</InputLabel>
                            <Select
                              label="Access Token Type"
                              value={values.idp?.oidc?.access_token_type || 'jwt'}
                              onChange={(e) => setFieldValue('idp.oidc.access_token_type', e.target.value).then(() => setHasUnsavedChanges(true))}
                            >
                              <MenuItem value="jwt">jwt</MenuItem>
                              <MenuItem value="opaque">opaque</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>

                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name="idp.oidc.default_access_token_lifetime" label="Default Access Token Lifetime" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name="idp.oidc.default_refresh_token_lifetime" label="Default Refresh Token Lifetime" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name="idp.oidc.consent_ttl" label="Consent TTL" onChange={handleChange} /></Grid>

                        <Grid size={{ xs: 12, md: 4 }}>
                          <FormControl fullWidth>
                            <InputLabel>Consent Mode</InputLabel>
                            <Select
                              label="Consent Mode"
                              value={values.idp?.oidc?.consent_mode || 'all_or_nothing'}
                              onChange={(e) => setFieldValue('idp.oidc.consent_mode', e.target.value).then(() => setHasUnsavedChanges(true))}
                            >
                              <MenuItem value="all_or_nothing">all_or_nothing</MenuItem>
                              <MenuItem value="granular_optional">granular_optional</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name="idp.oidc.key_rotation_interval" label="Key Rotation Interval" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name="idp.oidc.key_max_age" label="Key Max Age" onChange={handleChange} /></Grid>

                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth type="number" name="idp.oidc.device_code_polling_interval" label="Device Code Polling Interval" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth type="number" name="idp.oidc.device_code_user_code_length" label="Device Code User Code Length" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name="idp.oidc.device_code_expiry" label="Device Code Expiry" onChange={handleChange} /></Grid>

                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.oidc?.auto_key_rotation || false} onChange={(e) => setFieldValue('idp.oidc.auto_key_rotation', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Auto Key Rotation" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.oidc?.token_endpoint_allow_get || false} onChange={(e) => setFieldValue('idp.oidc.token_endpoint_allow_get', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Token Endpoint Allow GET" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.oidc?.front_channel_logout_supported ?? true} onChange={(e) => setFieldValue('idp.oidc.front_channel_logout_supported', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Front Channel Logout Supported" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.oidc?.front_channel_logout_session_supported || false} onChange={(e) => setFieldValue('idp.oidc.front_channel_logout_session_supported', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Front Channel Logout Session Supported" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.oidc?.back_channel_logout_supported ?? true} onChange={(e) => setFieldValue('idp.oidc.back_channel_logout_supported', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Back Channel Logout Supported" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.oidc?.back_channel_logout_session_supported || false} onChange={(e) => setFieldValue('idp.oidc.back_channel_logout_session_supported', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Back Channel Logout Session Supported" /></Grid>

                        <Grid size={12}><Divider sx={{ my: 1 }} /><Typography variant="subtitle1">OIDC Discovery/Support Arrays</Typography></Grid>
                        <Grid size={12}>{renderStringArrayEditor('idp.oidc.scopes_supported', 'Scope')}</Grid>
                        <Grid size={12}>{renderStringArrayEditor('idp.oidc.response_types_supported', 'Response Type')}</Grid>
                        <Grid size={12}>{renderStringArrayEditor('idp.oidc.subject_types_supported', 'Subject Type')}</Grid>
                        <Grid size={12}>{renderStringArrayEditor('idp.oidc.id_token_signing_alg_values_supported', 'ID Token Signing Algorithm')}</Grid>
                        <Grid size={12}>{renderStringArrayEditor('idp.oidc.token_endpoint_auth_methods_supported', 'Token Endpoint Auth Method')}</Grid>
                        <Grid size={12}>{renderStringArrayEditor('idp.oidc.code_challenge_methods_supported', 'Code Challenge Method')}</Grid>
                        <Grid size={12}>{renderStringArrayEditor('idp.oidc.claims_supported', 'Claim')}</Grid>

                        <Grid size={12}><Divider sx={{ my: 1 }} /><Typography variant="subtitle1">Signing Keys</Typography></Grid>
                        <Grid size={12}>
                          <FieldArray name="idp.oidc.signing_keys">
                            {({ push, remove }: any) => (
                              <Box>
                                {(values.idp?.oidc?.signing_keys || []).map((_: any, idx: number) => (
                                  <Card key={`signing-key-${idx}`} sx={{ mb: 2 }}>
                                    <CardContent>
                                      <Grid container spacing={2}>
                                        <Grid size={{ xs: 12, md: 3 }}><Field as={TextField} fullWidth name={`idp.oidc.signing_keys.${idx}.id`} label="Key ID" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 3 }}><Field as={TextField} fullWidth name={`idp.oidc.signing_keys.${idx}.algorithm`} label="Algorithm" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 3 }}><Field as={TextField} fullWidth name={`idp.oidc.signing_keys.${idx}.key_file`} label="Key File" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 3 }}><FormControlLabel control={<Switch checked={Boolean(getIn(values, `idp.oidc.signing_keys.${idx}.active`))} onChange={(e) => setFieldValue(`idp.oidc.signing_keys.${idx}.active`, e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Active" /></Grid>
                                        <Grid size={12}><Field as={TextField} fullWidth multiline minRows={2} name={`idp.oidc.signing_keys.${idx}.key`} label="Inline Key" onChange={handleChange} /></Grid>
                                      </Grid>
                                    </CardContent>
                                    <CardActions>
                                      <Button color="error" startIcon={<DeleteIcon />} onClick={() => { remove(idx); setHasUnsavedChanges(true); }}>Remove Key</Button>
                                    </CardActions>
                                  </Card>
                                ))}
                                <Button startIcon={<AddIcon />} variant="outlined" onClick={() => { push({ id: '', key: '', key_file: '', algorithm: 'RS256', active: false }); setHasUnsavedChanges(true); }}>
                                  Add Signing Key
                                </Button>
                              </Box>
                            )}
                          </FieldArray>
                        </Grid>

                        <Grid size={12}><Divider sx={{ my: 1 }} /><Typography variant="subtitle1">Custom Scopes</Typography></Grid>
                        <Grid size={12}>
                          <FieldArray name="idp.oidc.custom_scopes">
                            {({ push, remove }: any) => (
                              <Box>
                                {(values.idp?.oidc?.custom_scopes || []).map((_: any, sIdx: number) => (
                                  <Card key={`scope-${sIdx}`} sx={{ mb: 2 }}>
                                    <CardContent>
                                      <Grid container spacing={2}>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.custom_scopes.${sIdx}.name`} label="Scope Name" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 8 }}><Field as={TextField} fullWidth name={`idp.oidc.custom_scopes.${sIdx}.description`} label="Description" onChange={handleChange} /></Grid>
                                        <Grid size={12}>
                                          <FieldArray name={`idp.oidc.custom_scopes.${sIdx}.claims`}>
                                            {({ push: pushClaim, remove: removeClaim }: any) => (
                                              <Box>
                                                {((getIn(values, `idp.oidc.custom_scopes.${sIdx}.claims`) as any[]) || []).map((__: any, cIdx: number) => (
                                                  <Grid container spacing={1} key={`scope-${sIdx}-claim-${cIdx}`} sx={{ mb: 1 }}>
                                                    <Grid size={{ xs: 12, md: 5 }}><Field as={TextField} fullWidth name={`idp.oidc.custom_scopes.${sIdx}.claims.${cIdx}.name`} label="Claim Name" onChange={handleChange} /></Grid>
                                                    <Grid size={{ xs: 12, md: 5 }}><Field as={TextField} fullWidth name={`idp.oidc.custom_scopes.${sIdx}.claims.${cIdx}.type`} label="Claim Type" onChange={handleChange} /></Grid>
                                                    <Grid size={{ xs: 12, md: 2 }}><IconButton color="error" onClick={() => { removeClaim(cIdx); setHasUnsavedChanges(true); }}><DeleteIcon /></IconButton></Grid>
                                                  </Grid>
                                                ))}
                                                <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={() => { pushClaim({ name: '', type: 'string' }); setHasUnsavedChanges(true); }}>
                                                  Add Claim
                                                </Button>
                                              </Box>
                                            )}
                                          </FieldArray>
                                        </Grid>
                                      </Grid>
                                    </CardContent>
                                    <CardActions>
                                      <Button color="error" startIcon={<DeleteIcon />} onClick={() => { remove(sIdx); setHasUnsavedChanges(true); }}>Remove Scope</Button>
                                    </CardActions>
                                  </Card>
                                ))}
                                <Button startIcon={<AddIcon />} variant="outlined" onClick={() => { push({ name: '', description: '', claims: [] }); setHasUnsavedChanges(true); }}>
                                  Add Custom Scope
                                </Button>
                              </Box>
                            )}
                          </FieldArray>
                        </Grid>

                        <Grid size={12}><Divider sx={{ my: 1 }} /><Typography variant="subtitle1">OIDC Clients</Typography></Grid>
                        <Grid size={12}>
                          <FieldArray name="idp.oidc.clients">
                            {({ push, remove }: any) => (
                              <Box>
                                {(values.idp?.oidc?.clients || []).map((_: any, cIdx: number) => (
                                  <Card key={`oidc-client-${cIdx}`} sx={{ mb: 2 }}>
                                    <CardContent>
                                      <Grid container spacing={2}>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.name`} label="Name" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.client_id`} label="Client ID" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={PasswordField} fullWidth name={`idp.oidc.clients.${cIdx}.client_secret`} label="Client Secret" onChange={handleChange} /></Grid>

                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.token_endpoint_auth_method`} label="Token Endpoint Auth Method" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.access_token_type`} label="Access Token Type" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.consent_mode`} label="Consent Mode" onChange={handleChange} /></Grid>

                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.access_token_lifetime`} label="Access Token Lifetime" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.refresh_token_lifetime`} label="Refresh Token Lifetime" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.consent_ttl`} label="Consent TTL" onChange={handleChange} /></Grid>

                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.client_public_key_algorithm`} label="Client Public Key Algorithm" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.client_public_key_file`} label="Client Public Key File" onChange={handleChange} /></Grid>
                                        <Grid size={12}><Field as={TextField} fullWidth multiline minRows={2} name={`idp.oidc.clients.${cIdx}.client_public_key`} label="Client Public Key" onChange={handleChange} /></Grid>

                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.backchannel_logout_uri`} label="Backchannel Logout URI" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.frontchannel_logout_uri`} label="Frontchannel Logout URI" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.oidc.clients.${cIdx}.logout_redirect_uri`} label="Logout Redirect URI" onChange={handleChange} /></Grid>

                                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={Boolean(getIn(values, `idp.oidc.clients.${cIdx}.skip_consent`))} onChange={(e) => setFieldValue(`idp.oidc.clients.${cIdx}.skip_consent`, e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Skip Consent" /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={Boolean(getIn(values, `idp.oidc.clients.${cIdx}.delayed_response`))} onChange={(e) => setFieldValue(`idp.oidc.clients.${cIdx}.delayed_response`, e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Delayed Response" /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={Boolean(getIn(values, `idp.oidc.clients.${cIdx}.frontchannel_logout_session_required`))} onChange={(e) => setFieldValue(`idp.oidc.clients.${cIdx}.frontchannel_logout_session_required`, e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Frontchannel Logout Session Required" /></Grid>

                                        <Grid size={12}><Typography variant="subtitle2">Redirect URIs</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.redirect_uris`, 'Redirect URI')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Post Logout Redirect URIs</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.post_logout_redirect_uris`, 'Post Logout Redirect URI')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Scopes</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.scopes`, 'Scope')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Grant Types</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.grant_types`, 'Grant Type')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Required MFA</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.require_mfa`, 'Required MFA')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Supported MFA</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.supported_mfa`, 'Supported MFA')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Required Scopes</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.required_scopes`, 'Required Scope')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Optional Scopes</Typography>{renderStringArrayEditor(`idp.oidc.clients.${cIdx}.optional_scopes`, 'Optional Scope')}</Grid>

                                        <Grid size={12}><Typography variant="subtitle2">ID Token Claim Mappings</Typography>{renderClaimMappingsEditor(`idp.oidc.clients.${cIdx}.id_token_claims.mappings`)}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Access Token Claim Mappings</Typography>{renderClaimMappingsEditor(`idp.oidc.clients.${cIdx}.access_token_claims.mappings`)}</Grid>
                                      </Grid>
                                    </CardContent>
                                    <CardActions>
                                      <Button color="error" startIcon={<DeleteIcon />} onClick={() => { remove(cIdx); setHasUnsavedChanges(true); }}>
                                        Remove Client
                                      </Button>
                                    </CardActions>
                                  </Card>
                                ))}
                                <Button
                                  startIcon={<AddIcon />}
                                  variant="outlined"
                                  onClick={() => {
                                    push({
                                      name: '',
                                      client_id: '',
                                      client_secret: '',
                                      redirect_uris: [],
                                      scopes: [],
                                      grant_types: [],
                                      require_mfa: [],
                                      supported_mfa: [],
                                      post_logout_redirect_uris: [],
                                      backchannel_logout_uri: '',
                                      frontchannel_logout_uri: '',
                                      logout_redirect_uri: '',
                                      access_token_type: '',
                                      token_endpoint_auth_method: '',
                                      client_public_key: '',
                                      client_public_key_file: '',
                                      client_public_key_algorithm: '',
                                      id_token_claims: { mappings: [] },
                                      access_token_claims: { mappings: [] },
                                      access_token_lifetime: '',
                                      refresh_token_lifetime: '',
                                      consent_ttl: '',
                                      consent_mode: '',
                                      required_scopes: [],
                                      optional_scopes: [],
                                      skip_consent: false,
                                      delayed_response: false,
                                      frontchannel_logout_session_required: false,
                                    });
                                    setHasUnsavedChanges(true);
                                  }}
                                >
                                  Add OIDC Client
                                </Button>
                              </Box>
                            )}
                          </FieldArray>
                        </Grid>
                      </Grid>
                    </CollapsibleFormSection>
                  </Grid>

                  <Grid size={12}>
                    <CollapsibleFormSection title="SAML2" description="idp.saml2" defaultExpanded={false}>
                      <Grid container spacing={2}>
                        <Grid size={12}>
                          <FormControlLabel control={<Switch checked={values.idp?.saml2?.enabled || false} onChange={(e) => setFieldValue('idp.saml2.enabled', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Enable SAML2" />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}><Field as={TextField} fullWidth name="idp.saml2.entity_id" label="Entity ID" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><Field as={TextField} fullWidth name="idp.saml2.signature_method" label="Signature Method" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><Field as={TextField} fullWidth name="idp.saml2.default_expire_time" label="Default Expire Time" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><Field as={TextField} fullWidth name="idp.saml2.name_id_format" label="NameID Format" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><Field as={TextField} fullWidth name="idp.saml2.cert_file" label="Certificate File" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 6 }}><Field as={TextField} fullWidth name="idp.saml2.key_file" label="Key File" onChange={handleChange} /></Grid>
                        <Grid size={12}><Field as={TextField} fullWidth multiline minRows={2} name="idp.saml2.cert" label="Inline Certificate" onChange={handleChange} /></Grid>
                        <Grid size={12}><Field as={TextField} fullWidth multiline minRows={2} name="idp.saml2.key" label="Inline Private Key" onChange={handleChange} /></Grid>

                        <Grid size={12}><Divider sx={{ my: 1 }} /><Typography variant="subtitle1">SLO</Typography></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.saml2?.slo?.enabled ?? true} onChange={(e) => setFieldValue('idp.saml2.slo.enabled', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="SLO Enabled" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.saml2?.slo?.front_channel_enabled ?? true} onChange={(e) => setFieldValue('idp.saml2.slo.front_channel_enabled', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="SLO Front-Channel Enabled" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={values.idp?.saml2?.slo?.back_channel_enabled || false} onChange={(e) => setFieldValue('idp.saml2.slo.back_channel_enabled', e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="SLO Back-Channel Enabled" /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name="idp.saml2.slo.request_timeout" label="SLO Request Timeout" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth type="number" name="idp.saml2.slo.max_participants" label="SLO Max Participants" onChange={handleChange} /></Grid>
                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth type="number" name="idp.saml2.slo.back_channel_max_retries" label="SLO Back-Channel Retries" onChange={handleChange} /></Grid>

                        <Grid size={12}><Divider sx={{ my: 1 }} /><Typography variant="subtitle1">Service Providers</Typography></Grid>
                        <Grid size={12}>
                          <FieldArray name="idp.saml2.service_providers">
                            {({ push, remove }: any) => (
                              <Box>
                                {(values.idp?.saml2?.service_providers || []).map((_: any, spIdx: number) => (
                                  <Card key={`saml-sp-${spIdx}`} sx={{ mb: 2 }}>
                                    <CardContent>
                                      <Grid container spacing={2}>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.saml2.service_providers.${spIdx}.name`} label="Name" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.saml2.service_providers.${spIdx}.entity_id`} label="Entity ID" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.saml2.service_providers.${spIdx}.acs_url`} label="ACS URL" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.saml2.service_providers.${spIdx}.slo_url`} label="SLO URL" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.saml2.service_providers.${spIdx}.slo_back_channel_url`} label="SLO Back-Channel URL" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><Field as={TextField} fullWidth name={`idp.saml2.service_providers.${spIdx}.logout_redirect_uri`} label="Logout Redirect URI" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 6 }}><Field as={TextField} fullWidth name={`idp.saml2.service_providers.${spIdx}.cert_file`} label="Certificate File" onChange={handleChange} /></Grid>
                                        <Grid size={12}><Field as={TextField} fullWidth multiline minRows={2} name={`idp.saml2.service_providers.${spIdx}.cert`} label="Inline Certificate" onChange={handleChange} /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={Boolean(getIn(values, `idp.saml2.service_providers.${spIdx}.authn_requests_signed`))} onChange={(e) => setFieldValue(`idp.saml2.service_providers.${spIdx}.authn_requests_signed`, e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Authn Requests Signed" /></Grid>
                                        <Grid size={{ xs: 12, md: 4 }}><FormControlLabel control={<Switch checked={Boolean(getIn(values, `idp.saml2.service_providers.${spIdx}.delayed_response`))} onChange={(e) => setFieldValue(`idp.saml2.service_providers.${spIdx}.delayed_response`, e.target.checked).then(() => setHasUnsavedChanges(true))} />} label="Delayed Response" /></Grid>

                                        <Grid size={12}><Typography variant="subtitle2">Allowed Attributes</Typography>{renderStringArrayEditor(`idp.saml2.service_providers.${spIdx}.allowed_attributes`, 'Allowed Attribute')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Required MFA</Typography>{renderStringArrayEditor(`idp.saml2.service_providers.${spIdx}.require_mfa`, 'Required MFA')}</Grid>
                                        <Grid size={12}><Typography variant="subtitle2">Supported MFA</Typography>{renderStringArrayEditor(`idp.saml2.service_providers.${spIdx}.supported_mfa`, 'Supported MFA')}</Grid>
                                      </Grid>
                                    </CardContent>
                                    <CardActions>
                                      <Button color="error" startIcon={<DeleteIcon />} onClick={() => { remove(spIdx); setHasUnsavedChanges(true); }}>
                                        Remove Service Provider
                                      </Button>
                                    </CardActions>
                                  </Card>
                                ))}
                                <Button
                                  startIcon={<AddIcon />}
                                  variant="outlined"
                                  onClick={() => {
                                    push({
                                      name: '',
                                      entity_id: '',
                                      acs_url: '',
                                      slo_url: '',
                                      slo_back_channel_url: '',
                                      cert: '',
                                      cert_file: '',
                                      authn_requests_signed: false,
                                      allowed_attributes: [],
                                      require_mfa: [],
                                      supported_mfa: [],
                                      logout_redirect_uri: '',
                                      delayed_response: false,
                                    });
                                    setHasUnsavedChanges(true);
                                  }}
                                >
                                  Add Service Provider
                                </Button>
                              </Box>
                            )}
                          </FieldArray>
                        </Grid>
                      </Grid>
                    </CollapsibleFormSection>
                  </Grid>
                </Grid>
              </FormSection>

              <Box mt={3} display="flex" justifyContent="flex-end">
                <Button type="submit" variant="contained" color="primary" disabled={isSubmitting || !dirty}>
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
