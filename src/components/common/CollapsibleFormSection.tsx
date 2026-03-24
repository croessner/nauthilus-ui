import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { Paper, Typography, Box, Accordion, AccordionSummary, AccordionDetails, Divider } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getCurrentUsernameHint } from '../../utils/userManager';

interface CollapsibleFormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  required?: boolean;
}

const accordionTransitionTimeoutMs = {
  enter: 160,
  exit: 120,
};

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
      return getCurrentUsernameHint() || 'anon';
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
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, expanded ? 'true' : 'false');
      }
    } catch {
      // ignore storage errors
    }
  }, [expanded, storageKey]);

  const handleChange = (_event: React.SyntheticEvent, nextExpanded: boolean) => {
    setExpanded(nextExpanded);
  };

  return (
    <Paper sx={{ p: 0, mb: 3 }}>
      <Accordion
        expanded={expanded}
        onChange={handleChange}
        slotProps={{
          transition: {
            mountOnEnter: true,
            unmountOnExit: true,
            timeout: accordionTransitionTimeoutMs,
          },
        }}
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
          <Box sx={{ mt: 2 }}>
            {children}
          </Box>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};

export default CollapsibleFormSection;
