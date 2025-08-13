import React from 'react';
import { Tooltip, IconButton } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface InfoTooltipProps {
  title: string;
  size?: 'small' | 'medium';
  placement?: 'bottom' | 'bottom-end' | 'bottom-start' | 'left' | 'left-end' | 'left-start' | 'right' | 'right-end' | 'right-start' | 'top' | 'top-end' | 'top-start';
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ title, size = 'small', placement = 'top' }) => {
  return (
    <Tooltip title={title} placement={placement} arrow>
      <IconButton
        size={size}
        aria-label="info"
        sx={{
          ml: 0.5,
          p: 0.3,
          borderRadius: '50%',
          border: '1px solid',
          borderColor: 'divider',
          color: 'text.secondary',
          '&:hover': { backgroundColor: 'action.hover' },
        }}
      >
        <InfoOutlinedIcon fontSize={size === 'small' ? 'small' : 'medium'} />
      </IconButton>
    </Tooltip>
  );
};

export default InfoTooltip;
