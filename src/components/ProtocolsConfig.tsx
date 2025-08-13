import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { getIn } from 'formik';
import InfoTooltip from './common/InfoTooltip';

interface ProtocolsConfigProps {
  index: number;
  protocol: string[] | string | undefined;
  setFieldValue: (field: string, value: any) => Promise<any>;
  touched: any;
  errors: any;
  setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  fullWidth?: boolean;
}

const ProtocolsConfig = ({
  index,
  protocol,
  setFieldValue,
  touched,
  errors,
  setHasUnsavedChanges,
  fullWidth = true,
}: ProtocolsConfigProps): React.JSX.Element => {
  return (
    <TextField
      fullWidth={fullWidth}
      label="Protocols (comma-separated)"
      name={`search[${index}].protocol`}
      value={protocol ? (Array.isArray(protocol) ? protocol.join(',') : protocol) : ''}
      onChange={(e) => {
        const protocols = e.target.value.split(',').map(protocol => protocol.trim()).filter(protocol => protocol);
        setFieldValue(`search[${index}].protocol`, protocols)
            .then(() => setHasUnsavedChanges(true));
      }}
      error={Boolean(
        getIn(touched, `search[${index}].protocol`) &&
        getIn(errors, `search[${index}].protocol`)
      )}
      helperText={
        getIn(touched, `search[${index}].protocol`) &&
        getIn(errors, `search[${index}].protocol`)
      }
      InputProps={{ endAdornment: (
        <InputAdornment position="end"><InfoTooltip title="Comma-separated protocols to enable (e.g., smtp,imap,pop3)." /></InputAdornment>
      ) }}
    />
  );
};

export default ProtocolsConfig;
