import React from 'react';
import { Box, Typography, Tooltip, IconButton, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

export type ConnectionState = 'unknown' | 'connected' | 'disconnected' | 'checking';

interface ConnectionStatusProps {
  status: ConnectionState;
  message?: string;
  onCheck: () => void | Promise<void>;
  disabled?: boolean;
}

const ConnectionStatus = ({ status, message, onCheck, disabled }: ConnectionStatusProps): React.JSX.Element => {
  const isChecking = status === 'checking';
  const isDisabled = disabled ?? isChecking;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <Typography variant="subtitle1" sx={{ mr: 2 }}>Connection Status:</Typography>
      {status === 'checking' && <CircularProgress size={20} sx={{ mr: 1 }} />}
      {status === 'connected' && <CheckCircleIcon color="success" sx={{ mr: 1 }} />}
      {status === 'disconnected' && <ErrorIcon color="error" sx={{ mr: 1 }} />}
      {status === 'unknown' && <Typography color="text.secondary">Not checked</Typography>}
      {status === 'disconnected' && (
        <Typography color="error.main">{message}</Typography>
      )}
      <Tooltip title="Check connection">
        <span>
          <IconButton onClick={() => { void onCheck(); }} disabled={isDisabled} sx={{ ml: 1 }}>
            <RefreshIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

export default ConnectionStatus;
