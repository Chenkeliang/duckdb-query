import React, { useMemo } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';

const normalizeOption = (column) => {
  if (!column) {
    return null;
  }

  if (typeof column === 'string') {
    return {
      key: column,
      label: column,
      dataType: 'text',
    };
  }

  const name = column.name || column.column || column.column_name || column.id;
  if (!name) {
    return null;
  }

  return {
    key: name,
    label: column.label || column.displayName || name,
    dataType: (column.normalizedType || column.normalized_type || column.dataType || column.type || 'text').toString(),
    rawType: column.rawType || column.dataType || column.type || '',
  };
};

const ColumnSelect = ({
  columns = [],
  value = '',
  onChange,
  label,
  disabled = false,
  placeholder = '',
  size = 'small',
  allowClear = false,
  fullWidth = false,
}) => {
  const options = useMemo(() => {
    return columns
      .map(normalizeOption)
      .filter((item) => item && item.key);
  }, [columns]);

  const selected = useMemo(
    () => options.find((option) => option.key === value) || null,
    [options, value],
  );

  return (
    <Autocomplete
      options={options}
      value={selected}
      onChange={(_, newValue) => onChange?.(newValue ? newValue.key : '')}
      size={size}
      disabled={disabled || options.length === 0}
      fullWidth={fullWidth}
      autoHighlight
      blurOnSelect
      clearOnBlur={false}
      clearOnEscape
      disableClearable={!allowClear}
      clearIcon={<ClearIcon fontSize="small" />}
      slotProps={{
        popupIndicator: {
          sx: {
            color: 'var(--dq-accent-primary)',
            '&:hover': {
              color: 'var(--dq-accent-200)',
              backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 20%, transparent)'
            }
          }
        },
        clearIndicator: allowClear
          ? {
              sx: {
                color: 'var(--dq-accent-primary)',
                '&:hover': {
                  color: 'var(--dq-accent-200)',
                  backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 18%, transparent)'
                }
              }
            }
          : undefined
      }}
      isOptionEqualToValue={(option, optionValue) => option.key === optionValue.key}
      getOptionLabel={(option) => option?.label || ''}
      renderOption={(props, option) => (
        <li {...props} key={option.key}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {option.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'lowercase' }} title={option.rawType || option.dataType}>
              {(option.dataType || 'text').toLowerCase()}
            </Typography>
          </Box>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          size={size}
        />
      )}
    />
  );
};

export default ColumnSelect;
