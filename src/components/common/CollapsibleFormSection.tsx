import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Paper, Typography, Box, Divider, Accordion, AccordionSummary, AccordionDetails, CircularProgress } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';

interface CollapsibleFormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  required?: boolean;
}

const contentRevealDelayMs = 220;

const CollapsibleFormSection = ({ 
  title, 
  description, 
  children, 
  defaultExpanded = false,
  required = false
}: CollapsibleFormSectionProps): React.ReactElement => {
  // Determine a per-user, per-page storage key for this section
  const username = useMemo(() => {
    try {
      const token = Cookies.get('nauthilus_token');
      if (!token) return 'anon';
      const decoded = jwtDecode<{ sub: string }>(token);
      return decoded?.sub || 'anon';
    } catch {
      return 'anon';
    }
  }, []);

  const sectionId = useMemo(() => title.toLowerCase().replace(/\s+/g, '-'), [title]);
  const storageKey = useMemo(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    return `ui:collapsible:${username}:${path}:${sectionId}`;
  }, [username, sectionId]);

  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return defaultExpanded;
  });
  const [contentReady, setContentReady] = useState<boolean>(defaultExpanded);
  const timeoutRef = useRef<number | null>(null);

  const clearPendingContentMount = () => {
    if (timeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, expanded ? 'true' : 'false');
      }
    } catch {
      // ignore storage errors
    }
  }, [expanded, storageKey]);

  useEffect(() => {
    if (!expanded || contentReady) {
      return;
    }

    if (typeof window === 'undefined') {
      setContentReady(true);
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      setContentReady(true);
      timeoutRef.current = null;
    }, contentRevealDelayMs);

    return clearPendingContentMount;
  }, [expanded, contentReady]);

  useEffect(() => clearPendingContentMount, []);

  const handleChange = (_event: React.SyntheticEvent, nextExpanded: boolean) => {
    clearPendingContentMount();
    setExpanded(nextExpanded);
    setContentReady(false);
  };

  return (
    <Paper sx={{ p: 0, mb: 3 }}>
      <Accordion
        expanded={expanded}
        onChange={handleChange}
        slotProps={{ transition: { mountOnEnter: true, unmountOnExit: true } }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls={`${sectionId}-content`}
          id={`${sectionId}-header`}
          sx={{ 
            p: 2,
            backgroundColor: required ? 'primary.light' : 'default',
            '& .MuiAccordionSummary-content': {
              alignItems: 'center'
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {required && (
              <Typography 
                variant="caption" 
                sx={{ 
                  mr: 1, 
                  color: 'primary.contrastText',
                  backgroundColor: 'primary.main',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontWeight: 'bold'
                }}
              >
                REQUIRED
              </Typography>
            )}
            <Typography variant="h5" component="h2">
              {title}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 3 }}>
          {description && (
            <Typography variant="body2" color="text.secondary" paragraph>
              {description}
            </Typography>
          )}
          <Divider sx={{ my: 2 }} />
          {contentReady ? (
            <Box sx={{ mt: 2 }}>
              {children}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 120, py: 4 }}>
              <CircularProgress />
            </Box>
          )}
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};

export default CollapsibleFormSection;
