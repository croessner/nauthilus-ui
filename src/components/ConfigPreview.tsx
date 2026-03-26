import React from 'react';
import { Box, Paper, Typography, useTheme, Alert, List, ListItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { useConfig } from '../contexts/ConfigContext';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { validateConfigForExport } from '../utils/configPreviewValidation';

const ConfigPreview = (): React.JSX.Element => {
  const { config } = useConfig();
  const theme = useTheme();

  const validationResult = validateConfigForExport(config);
  const yamlContent = validationResult.yamlContent;

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Configuration Preview (nauthilus.yml)
      </Typography>

      {/* Configuration Status */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Configuration Status
        </Typography>

        {validationResult.isValid ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            All essential settings are configured correctly. The configuration is ready for operation.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Some essential settings are missing or incomplete. Please review the issues below.
          </Alert>
        )}

        {validationResult.blockingFindings.length > 0 && (
          <List dense>
            {validationResult.blockingFindings.map((error, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  <ErrorOutlineIcon color="error" />
                </ListItemIcon>
                <ListItemText primary={`${error.path}: ${error.message}`} />
              </ListItem>
            ))}
          </List>
        )}

        {validationResult.isValid && (
          <List dense>
            <ListItem>
              <ListItemIcon>
                <CheckCircleOutlineIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Server configuration is valid" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleOutlineIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Backend configuration is valid" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleOutlineIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Redis configuration is valid" />
            </ListItem>
          </List>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            This preview uses the same sanitizer and validation pipeline as download and Git push.
          </Typography>
        </Alert>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="body2" color="text.secondary" paragraph>
        This is a read-only preview of your current configuration in YAML format.
      </Typography>
      <Paper 
        elevation={3} 
        sx={{ 
          p: 2, 
          mt: 2, 
          maxHeight: '70vh', 
          overflow: 'auto',
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          borderRadius: 1
        }}
      >
        <pre 
          style={{ 
            margin: 0, 
            fontFamily: '"Roboto Mono", monospace',
            fontSize: '0.875rem',
            color: theme.palette.mode === 'dark' ? '#d4d4d4' : '#333333',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            pointerEvents: 'none'
          }}
        >
          {yamlContent}
        </pre>
      </Paper>
    </Box>
  );
};

export default ConfigPreview;
