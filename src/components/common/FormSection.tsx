import React, { ReactNode } from 'react';
import { Paper, Typography, Box, Divider } from '@mui/material';

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

const FormSection: React.FC<FormSectionProps> = ({ title, description, children }) => {
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" paragraph>
          {description}
        </Typography>
      )}
      <Divider sx={{ my: 2 }} />
      <Box sx={{ mt: 2 }}>
        {children}
      </Box>
    </Paper>
  );
};

export default FormSection;