import React from 'react';
import TextField from '@mui/material/TextField';

const RoundedTextField = React.forwardRef(function RoundedTextField(
  { InputProps = {}, sx = {}, multiline, minRows, ...props },
  ref
) {
  const mergedInputSx = {
    borderRadius: multiline ? '18px' : 'var(--dq-radius-card)',
    backgroundColor: 'var(--dq-surface)',
    ...(multiline
      ? {
          alignItems: 'flex-start',
          padding: '12px 16px',
          fontFamily: 'Monaco, Consolas, "Courier New", monospace'
        }
      : {}),
    '& fieldset': {
      borderColor: 'var(--dq-border-subtle)'
    },
    '&:hover fieldset': {
      borderColor: 'var(--dq-border-card)'
    },
    '&.Mui-focused fieldset': {
      borderColor: 'var(--dq-accent-primary)',
      boxShadow: '0 0 0 1px color-mix(in oklab, var(--dq-accent-primary) 55%, transparent)'
    },
    ...InputProps.sx
  };

  return (
    <TextField
      inputRef={ref}
      variant="outlined"
      multiline={multiline}
      minRows={minRows}
      InputProps={{
        ...InputProps,
        sx: mergedInputSx
      }}
      sx={{
        '& .MuiInputLabel-root': {
          color: 'var(--dq-text-tertiary)'
        },
        '& .MuiInputBase-input': {
          color: 'var(--dq-text-primary)'
        },
        '& .MuiFormHelperText-root': {
          color: 'var(--dq-text-tertiary)'
        },
        ...sx
      }}
      {...props}
    />
  );
});

export default RoundedTextField;
