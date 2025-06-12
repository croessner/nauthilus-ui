import React from 'react';
import { Box, Paper, Typography, useTheme } from '@mui/material';
import yaml from 'js-yaml';
import { useConfig } from '../contexts/ConfigContext';

const ConfigPreview: React.FC = () => {
  const { config } = useConfig();
  const theme = useTheme();

  // Convert config to YAML
  const yamlContent = config ? yaml.dump(config) : '';

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Configuration Preview (nauthilus.yml)
      </Typography>
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
            wordBreak: 'break-word'
          }}
        >
          {yamlContent}
        </pre>
      </Paper>
    </Box>
  );
};

export default ConfigPreview;