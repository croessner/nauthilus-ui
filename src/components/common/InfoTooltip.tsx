import React from 'react';
import { Tooltip, IconButton } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface InfoTooltipProps {
  title: string;
  size?: 'small' | 'medium';
  placement?: 'bottom' | 'bottom-end' | 'bottom-start' | 'left' | 'left-end' | 'left-start' | 'right' | 'right-end' | 'right-start' | 'top' | 'top-end' | 'top-start';
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({ title, size = 'small', placement = 'top' }) => {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  const scheduleClose = (delay = 3000) => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
    }
    closeTimer.current = window.setTimeout(() => setOpen(false), delay);
  };

  const handleClick = () => {
    setOpen(true);
    scheduleClose();
  };

  const handleTouchStart = () => {
    setOpen(true);
    scheduleClose();
  };

  const handleMouseEnter = () => setOpen(true);
  const handleMouseLeave = () => setOpen(false);
  const handleFocus = () => setOpen(true);
  const handleBlur = () => setOpen(false);

  React.useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);

  return (
    <Tooltip title={title} placement={placement} arrow open={open}>
      <IconButton
        size={size}
        aria-label="info"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        sx={{
          ml: 0.5,
          // Increase touch target for mobile accessibility (WCAG ~44x44px)
          width: size === 'small' ? 36 : 40,
          height: size === 'small' ? 36 : 40,
          p: 0.5,
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
