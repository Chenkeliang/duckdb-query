import React from 'react';
import Switch from '@mui/material/Switch';
import { styled } from '@mui/material/styles';

const StyledSwitch = styled(Switch)(() => ({
  width: 48,
  height: 28,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 3,
    margin: 1,
    transitionDuration: '200ms',
    '&.Mui-checked': {
      transform: 'translateX(20px)',
      color: '#fff',
      '& + .MuiSwitch-track': {
        backgroundColor: 'var(--dq-accent-primary)',
        borderColor: 'color-mix(in oklab, var(--dq-accent-primary) 60%, transparent)',
        opacity: 1,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: 0.5,
    },
  },
  '& .MuiSwitch-thumb': {
    width: 22,
    height: 22,
    borderRadius: 10,
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)',
    backgroundColor: 'var(--dq-surface)',
  },
  '& .MuiSwitch-track': {
    borderRadius: 16,
    backgroundColor: 'var(--dq-switch-track-bg)',
    border: '1px solid var(--dq-switch-track-border)',
    opacity: 1,
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
  },
}));

const RoundedSwitch = React.forwardRef(function RoundedSwitch(props, ref) {
  return <StyledSwitch ref={ref} {...props} />;
});

export default RoundedSwitch;
