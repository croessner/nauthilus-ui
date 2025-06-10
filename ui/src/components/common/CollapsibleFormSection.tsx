import React, { ReactNode, useState } from 'react';
import { Paper, Typography, Box, Divider, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface CollapsibleFormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  required?: boolean;
}

const CollapsibleFormSection: React.FC<CollapsibleFormSectionProps> = ({ 
  title, 
  description, 
  children, 
  defaultExpanded = false,
  required = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleChange = () => {
    setExpanded(!expanded);
  };

  return (
    <Paper sx={{ p: 0, mb: 3 }}>
      <Accordion expanded={expanded} onChange={handleChange} defaultExpanded={defaultExpanded}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls={`${title.toLowerCase().replace(/\s+/g, '-')}-content`}
          id={`${title.toLowerCase().replace(/\s+/g, '-')}-header`}
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