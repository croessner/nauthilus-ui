import React, { useState, useEffect } from 'react';
import { Alert, Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface ValidationErrorsProps {
  error: string | null;
}

/**
 * A component to display validation errors in a consistent way across all forms.
 * It parses the error message from the ConfigContext and displays it in a user-friendly format.
 * Errors will automatically disappear after 15 seconds and can be dismissed with the close icon.
 */
const ValidationErrors: React.FC<ValidationErrorsProps> = ({ error }) => {
  const [visible, setVisible] = useState(!!error);
  const [currentError, setCurrentError] = useState(error);

  // Reset visibility and current error when error prop changes
  useEffect(() => {
    if (error) {
      setVisible(true);
      setCurrentError(error);

      // Auto-dismiss after 15 seconds
      const timer = setTimeout(() => {
        setVisible(false);
      }, 15000);

      return () => clearTimeout(timer);
    }
  }, [error]);

  if (!currentError || !visible) return null;

  // Handle manual dismissal
  const handleDismiss = () => {
    setVisible(false);
  };

  // Check if this is a validation error
  if (currentError.startsWith('Validation failed:')) {
    // Extract the validation errors from the message
    const errorMessage = currentError.replace('Validation failed:', '').trim();

    return (
      <Box sx={{ mb: 3 }}>
        <Alert 
          severity="error"
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={handleDismiss}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
        >
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
      <Alert 
        severity="error"
        action={
          <IconButton
            aria-label="close"
            color="inherit"
            size="small"
            onClick={handleDismiss}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
      >
        {currentError}
      </Alert>
    </Box>
  );
};

export default ValidationErrors;
