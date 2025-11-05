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
        '&.Mui-disabled': {
          backgroundColor: 'color-mix(in oklab, var(--dq-neutral-200) 85%, transparent)',
          color: 'var(--dq-neutral-500)',
          borderColor: 'transparent'
        },
        ...sx
      }}
      {...props}
    />
  );
});

export default RoundedButton;
