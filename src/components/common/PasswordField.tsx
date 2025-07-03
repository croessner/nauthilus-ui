import React, { useState } from 'react';
import { TextField, InputAdornment, IconButton } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

interface PasswordFieldProps {
  name: string;
  label: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<any>) => void;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  variant?: 'outlined' | 'standard' | 'filled';
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  margin?: 'none' | 'dense' | 'normal';
}

const PasswordField = ({
  name,
  label,
  value,
  onChange,
  error,
  helperText,
  fullWidth = true,
  variant = 'outlined',
  required = false,
  placeholder,
  disabled = false,
  className,
  margin,
}: PasswordFieldProps): JSX.Element => {
  const [showPassword, setShowPassword] = useState(false);

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <TextField
      name={name}
      label={label}
      type={showPassword ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
      variant={variant}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      margin={margin}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={handleClickShowPassword}
              edge="end"
            >
              {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

export default PasswordField;
