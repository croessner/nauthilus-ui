import React from 'react';
import { Tooltip, Box } from '@mui/material';
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

  const handleOpen = (event?: React.SyntheticEvent) => {
    event?.stopPropagation();
    setOpen(true);
    scheduleClose();
  };

  const handleClick = (event: React.MouseEvent<HTMLSpanElement>) => handleOpen(event);
  const handleTouchStart = (event: React.TouchEvent<HTMLSpanElement>) => handleOpen(event);
  const handleMouseEnter = () => setOpen(true);
  const handleMouseLeave = () => setOpen(false);
  const handleFocus = () => setOpen(true);
  const handleBlur = () => setOpen(false);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen(event);
    }
  };

  React.useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);

  return (
    <Tooltip title={title} placement={placement} arrow open={open}>
      <Box
        component="span"
        role="button"
        tabIndex={0}
        aria-label="info"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ml: 0.5,
          width: size === 'small' ? 36 : 40,
          height: size === 'small' ? 36 : 40,
          p: 0.5,
          borderRadius: '50%',
          color: 'text.secondary',
          cursor: 'help',
          outline: 'none',
          '&:hover': { backgroundColor: 'action.hover' },
          '&:focus-visible': {
            boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}`,
          },
        }}
      >
        <InfoOutlinedIcon fontSize={size === 'small' ? 'small' : 'medium'} />
      </Box>
    </Tooltip>
  );
};

export default InfoTooltip;
