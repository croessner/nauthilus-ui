import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  TextField, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  CardActions,
  Switch,
  FormControlLabel
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import QRCode from 'qrcode.react';
import { useUser } from '../contexts/UserContext';
import * as mfaUtils from '../utils/mfaUtils';
import * as userManager from '../utils/userManager';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mfa-tabpanel-${index}`}
      aria-labelledby={`mfa-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const MFASettings: React.FC = () => {
  const { user } = useUser();
  const [tabValue, setTabValue] = useState(0);

  // TOTP states
  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrCode, setTotpQrCode] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState('');
  const [totpSuccess, setTotpSuccess] = useState('');

  // WebAuthn states
  const [webAuthnDevices, setWebAuthnDevices] = useState<userManager.WebAuthnCredential[]>([]);
  const [webAuthnSetupOpen, setWebAuthnSetupOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [webAuthnLoading, setWebAuthnLoading] = useState(false);
  const [webAuthnError, setWebAuthnError] = useState('');
  const [webAuthnSuccess, setWebAuthnSuccess] = useState('');

  // Load user's MFA settings
  useEffect(() => {
    if (user) {
      // Set WebAuthn devices if available
      if (user.webAuthnDevices && Array.isArray(user.webAuthnDevices)) {
        setWebAuthnDevices(user.webAuthnDevices);
      }
    }
  }, [user]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // TOTP functions
  const handleSetupTOTP = async () => {
    if (!user) return;

    setTotpLoading(true);
    setTotpError('');

    try {
      const result = await mfaUtils.setupTOTP(user.username);
      setTotpSecret(result.secret);
      setTotpQrCode(result.qrCode);
      setTotpSetupOpen(true);
    } catch (error) {
      setTotpError('Failed to set up TOTP. Please try again.');
      console.error('TOTP setup error:', error);
    } finally {
      setTotpLoading(false);
    }
  };

  const handleVerifyTOTP = async () => {
    if (!user || !totpToken) return;

    setTotpLoading(true);
    setTotpError('');

    try {
      const success = await mfaUtils.verifyTOTP(user.username, totpToken);
      if (success) {
        setTotpSetupOpen(false);
        setTotpSuccess('TOTP has been successfully set up!');
        // Update user context to reflect TOTP is enabled
        if (user) {
          user.totpEnabled = true;
        }
      } else {
        setTotpError('Invalid verification code. Please try again.');
      }
    } catch (error) {
      setTotpError('Failed to verify TOTP. Please try again.');
      console.error('TOTP verification error:', error);
    } finally {
      setTotpLoading(false);
      setTotpToken('');
    }
  };

  const handleDisableTOTP = async () => {
    if (!user) return;

    setTotpLoading(true);
    setTotpError('');

    try {
      const success = await mfaUtils.disableTOTP(user.username);
      if (success) {
        setTotpSuccess('TOTP has been successfully disabled.');
        // Update user context to reflect TOTP is disabled
        if (user) {
          user.totpEnabled = false;
        }
      } else {
        setTotpError('Failed to disable TOTP. Please try again.');
      }
    } catch (error) {
      setTotpError('Failed to disable TOTP. Please try again.');
      console.error('TOTP disable error:', error);
    } finally {
      setTotpLoading(false);
    }
  };

  // WebAuthn functions
  const handleRegisterWebAuthn = async () => {
    if (!user || !deviceName) return;

    setWebAuthnLoading(true);
    setWebAuthnError('');

    try {
      // Start registration
      const { publicKey, sessionData } = await mfaUtils.beginWebAuthnRegistration(user.username);

      if (!publicKey) {
        throw new Error('Failed to get WebAuthn registration options from server');
      }

      // Create credential
      try {
        const credential = await navigator.credentials.create({
          publicKey
        }) as PublicKeyCredential;

        if (!credential) {
          throw new Error('Browser did not return a credential');
        }

        // Finish registration
        const success = await mfaUtils.finishWebAuthnRegistration(credential, deviceName, sessionData);

        if (success) {
          setWebAuthnSetupOpen(false);
          setWebAuthnSuccess('Security key has been successfully registered!');

          // Update user context to reflect WebAuthn is enabled
          if (user) {
            user.webAuthnEnabled = true;

            // Refresh the list of devices
            // In a real app, you would fetch the updated user data here
            // For now, we'll just add a placeholder
            const newDevice: userManager.WebAuthnCredential = {
              id: Math.random().toString(36).substring(7),
              publicKey: '', // This would normally come from the server
              name: deviceName,
              createdAt: new Date().toISOString(),
              lastUsed: new Date().toISOString(),
              aaguid: '', // This would normally come from the server
              authenticator: 'WebAuthn Device'
            };

            setWebAuthnDevices(prev => [...prev, newDevice]);
          }
        } else {
          setWebAuthnError('Failed to register security key. Please try again.');
        }
      } catch (credentialError) {
        console.error('Error creating credential:', credentialError);
        if (credentialError instanceof Error) {
          if (credentialError.message.includes('challenge')) {
            setWebAuthnError('Server configuration issue: Invalid challenge. Please contact your administrator.');
          } else if (credentialError.message.includes('already registered')) {
            setWebAuthnError('This security key is already registered. Please use a different one.');
          } else {
            setWebAuthnError(`Failed to create credential: ${credentialError.message}`);
          }
        } else {
          setWebAuthnError('Failed to create credential. Please try again or use a different security key.');
        }
      }
    } catch (error) {
      console.error('WebAuthn registration error:', error);
      if (error instanceof Error) {
        if (error.message.includes('Missing challenge')) {
          setWebAuthnError('Server configuration issue: Missing challenge in response. Please contact your administrator.');
        } else {
          setWebAuthnError(`Failed to register security key: ${error.message}`);
        }
      } else {
        setWebAuthnError('Failed to register security key. Please try again.');
      }
    } finally {
      setWebAuthnLoading(false);
      setDeviceName('');
    }
  };

  const handleRemoveWebAuthn = async (credentialId: string) => {
    if (!user) return;

    setWebAuthnLoading(true);
    setWebAuthnError('');

    try {
      const success = await mfaUtils.removeWebAuthnCredential(user.username, credentialId);

      if (success) {
        // Remove the device from the list
        setWebAuthnDevices(prev => prev.filter(device => device.id !== credentialId));

        setWebAuthnSuccess('Security key has been successfully removed.');

        // If no devices left, update user context to reflect WebAuthn is disabled
        if (webAuthnDevices.length <= 1 && user) {
          user.webAuthnEnabled = false;
        }
      } else {
        setWebAuthnError('Failed to remove security key. Please try again.');
      }
    } catch (error) {
      setWebAuthnError('Failed to remove security key. Please try again.');
      console.error('WebAuthn remove error:', error);
    } finally {
      setWebAuthnLoading(false);
    }
  };

  if (!user) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Please log in to manage your MFA settings.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Multi-Factor Authentication
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Authenticator App (TOTP)" />
          <Tab label="Security Keys (WebAuthn)" />
        </Tabs>

        {/* TOTP Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Authenticator App
            </Typography>
            <Typography variant="body1" paragraph>
              Use an authenticator app like Google Authenticator, Authy, or Microsoft Authenticator to generate time-based one-time passwords.
            </Typography>

            {totpError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {totpError}
              </Alert>
            )}

            {totpSuccess && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {totpSuccess}
              </Alert>
            )}

            <Card>
              <CardContent>
                <Grid container alignItems="center">
                  <Grid item xs={8}>
                    <Typography variant="h6">
                      Authenticator App
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {user.totpEnabled ? 'Enabled' : 'Disabled'}
                    </Typography>
                  </Grid>
                  <Grid item xs={4} container justifyContent="flex-end">
                    <FormControlLabel
                      control={
                        <Switch
                          checked={!!user.totpEnabled}
                          onChange={() => {
                            if (user.totpEnabled) {
                              handleDisableTOTP();
                            } else {
                              handleSetupTOTP();
                            }
                          }}
                          disabled={totpLoading}
                        />
                      }
                      label=""
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Box>

          {/* TOTP Setup Dialog */}
          <Dialog open={totpSetupOpen} onClose={() => setTotpSetupOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Set Up Authenticator App</DialogTitle>
            <DialogContent>
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Typography variant="body1" paragraph>
                  Scan this QR code with your authenticator app:
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                  {totpQrCode && <QRCode value={totpQrCode} size={200} />}
                </Box>
                <Typography variant="body2" paragraph>
                  Or enter this code manually: <strong>{totpSecret}</strong>
                </Typography>
                <TextField
                  label="Verification Code"
                  variant="outlined"
                  fullWidth
                  margin="normal"
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value)}
                  disabled={totpLoading}
                  placeholder="Enter the 6-digit code from your app"
                />
                {totpError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {totpError}
                  </Alert>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setTotpSetupOpen(false)} color="primary">
                Cancel
              </Button>
              <Button
                onClick={handleVerifyTOTP}
                color="primary"
                variant="contained"
                disabled={!totpToken || totpLoading}
              >
                {totpLoading ? <CircularProgress size={24} /> : 'Verify'}
              </Button>
            </DialogActions>
          </Dialog>
        </TabPanel>

        {/* WebAuthn Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Security Keys
            </Typography>
            <Typography variant="body1" paragraph>
              Use security keys like YubiKey, or biometric authentication like Windows Hello, Touch ID, or Face ID.
            </Typography>

            {webAuthnError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {webAuthnError}
              </Alert>
            )}

            {webAuthnSuccess && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {webAuthnSuccess}
              </Alert>
            )}

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Registered Security Keys
                </Typography>
                {webAuthnDevices.length === 0 ? (
                  <Typography variant="body2" color="textSecondary">
                    No security keys registered.
                  </Typography>
                ) : (
                  <List>
                    {webAuthnDevices.map((device, index) => (
                      <React.Fragment key={device.id}>
                        <ListItem>
                          <ListItemText
                            primary={device.name}
                            secondary={`Last used: ${new Date(device.lastUsed).toLocaleString()}`}
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              aria-label="delete"
                              onClick={() => handleRemoveWebAuthn(device.id)}
                              disabled={webAuthnLoading}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                        {index < webAuthnDevices.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                )}
              </CardContent>
              <CardActions>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setWebAuthnSetupOpen(true)}
                  disabled={webAuthnLoading}
                >
                  Register New Security Key
                </Button>
              </CardActions>
            </Card>
          </Box>

          {/* WebAuthn Setup Dialog */}
          <Dialog open={webAuthnSetupOpen} onClose={() => setWebAuthnSetupOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Register Security Key</DialogTitle>
            <DialogContent>
              <Typography variant="body1" paragraph>
                Enter a name for your security key:
              </Typography>
              <TextField
                label="Device Name"
                variant="outlined"
                fullWidth
                margin="normal"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                disabled={webAuthnLoading}
                placeholder="e.g., My YubiKey, Windows Hello, Touch ID"
              />
              {webAuthnError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {webAuthnError}
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setWebAuthnSetupOpen(false)} color="primary">
                Cancel
              </Button>
              <Button
                onClick={handleRegisterWebAuthn}
                color="primary"
                variant="contained"
                disabled={!deviceName || webAuthnLoading}
              >
                {webAuthnLoading ? <CircularProgress size={24} /> : 'Register'}
              </Button>
            </DialogActions>
          </Dialog>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default MFASettings;
