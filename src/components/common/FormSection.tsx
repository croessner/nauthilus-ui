import React, { ReactNode } from 'react';
import { Paper, Typography, Box, Divider } from '@mui/material';

interface FormSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

const FormSection: React.FC<FormSectionProps> = ({ title, description, children }) => {
  const hasHeader = Boolean(title) || Boolean(description);
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      {title && (
        <Typography variant="h5" component="h2" gutterBottom>
          {title}
        </Typography>
      )}
      {description && (
        <Typography variant="body2" color="text.secondary" paragraph>
          {description}
        </Typography>
      )}
      {hasHeader && <Divider sx={{ my: 2 }} />}
      <Box sx={{ mt: hasHeader ? 2 : 0 }}>
        {children}
      </Box>
    </Paper>
  );
};

export default FormSection;
