import React from 'react';
import Button from '@mui/material/Button';

const RoundedButton = React.forwardRef(function RoundedButton(
  { variant = 'contained', disableElevation = true, size = 'medium', sx = {}, ...props },
  ref
) {
  const paddingX = size === 'small' ? 1.5 : size === 'large' ? 3 : 2.5;
  const paddingY = size === 'small' ? 0.5 : size === 'large' ? 1.25 : 1;

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      disableElevation={disableElevation}
      sx={{
        borderRadius: 'var(--dq-radius-cta)',
        textTransform: 'none',
        fontWeight: 600,
        px: paddingX,
        py: paddingY,
        '&.MuiButton-contained': {
          backgroundColor: 'var(--dq-accent-primary)',
          color: '#fff',
          '&:hover': {
            backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 88%, transparent)'
          }
        },
        '&.MuiButton-outlined': {
          borderColor: 'var(--dq-border-card)',
          color: 'var(--dq-accent-primary)',
          '&:hover': {
            borderColor: 'var(--dq-accent-primary)',
            backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 8%, transparent)'
          }
        },
        '&.Mui-disabled': {
          backgroundColor: 'color-mix(in oklab, var(--dq-neutral-200) 90%, transparent)',
          color: 'var(--dq-neutral-500)'
        },
        ...sx
      }}
      {...props}
    />
  );
});

export default RoundedButton;
