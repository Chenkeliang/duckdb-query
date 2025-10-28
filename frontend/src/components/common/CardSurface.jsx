import React from 'react';
import Box from '@mui/material/Box';

const CardSurface = React.forwardRef(function CardSurface(
  { active = false, elevation = false, padding = 2, sx = {}, ...props },
  ref
) {
  return (
    <Box
      ref={ref}
      sx={{
        backgroundColor: active ? 'var(--dq-surface-card-active)' : 'var(--dq-surface-card)',
        borderRadius: 'var(--dq-radius-card)',
        border: '1px solid',
        borderColor: active ? 'var(--dq-border-card)' : 'var(--dq-border-subtle)',
        boxShadow: elevation ? 'var(--dq-shadow-soft)' : 'none',
        transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        p: padding,
        ...sx
      }}
      {...props}
    />
  );
});

export default CardSurface;
