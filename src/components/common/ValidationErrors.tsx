import React from 'react';
import { Alert, Box } from '@mui/material';

interface ValidationErrorsProps {
  error: string | null;
}

/**
 * A component to display validation errors in a consistent way across all forms.
 * It parses the error message from the ConfigContext and displays it in a user-friendly format.
 */
const ValidationErrors: React.FC<ValidationErrorsProps> = ({ error }) => {
  if (!error) return null;

  // Check if this is a validation error
  if (error.startsWith('Validation failed:')) {
    // Extract the validation errors from the message
    const errorMessage = error.replace('Validation failed:', '').trim();
    
    return (
      <Box sx={{ mb: 3 }}>
        <Alert severity="error">
          <strong>Please fix the following issues:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            {errorMessage.split(',').map((err, index) => (
              <li key={index}>{err.trim()}</li>
            ))}
          </ul>
        </Alert>
      </Box>
    );
  }

  // For other types of errors, just display the message
  return (
    <Box sx={{ mb: 3 }}>
      <Alert severity="error">{error}</Alert>
    </Box>
  );
};

export default ValidationErrors;