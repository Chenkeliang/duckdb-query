import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const SectionHeader = ({ title, subtitle, action, icon, sx = {} }) => {
  if (!title) return null;

  const showAccentDot = !icon;

  return (
    <Stack
      direction="row"
      alignItems={subtitle ? 'flex-start' : 'center'}
      justifyContent="space-between"
      spacing={2}
      sx={{ width: '100%', ...sx }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        {showAccentDot && (
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--dq-accent-primary)',
              flexShrink: 0,
              boxShadow: '0 0 0 3px color-mix(in oklab, var(--dq-accent-primary) 12%, transparent)'
            }}
          />
        )}
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            {icon}
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 600, color: 'var(--dq-text-primary)', fontSize: '20px', lineHeight: 1.3 }}
            >
              {title}
            </Typography>
          </Stack>
          {subtitle && (
            <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)', mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {action}
    </Stack>
  );
};

export default SectionHeader;
