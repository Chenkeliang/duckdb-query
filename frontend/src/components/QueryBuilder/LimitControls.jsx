import {
  Box,
  Collapse,
  FormControlLabel,
  Slider,
  TextField,
  Typography
} from "@mui/material";
import { Lightbulb } from 'lucide-react';
import React, { useState } from "react";
import { RoundedSwitch } from '../common';

/**
 * LimitControls - 限制结果数量控制组件
 * 允许用户配置结果限制
 */
const LimitControls = ({
  limit,
  onLimitChange,
  disabled = false,
  showHeader = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [limitEnabled, setLimitEnabled] = useState(!!limit);
  const [limitValue, setLimitValue] = useState(limit || 100);

  // 处理限制数量变化
  const handleLimitToggle = (enabled) => {
    setLimitEnabled(enabled);
    if (enabled) {
      onLimitChange(limitValue);
    } else {
      onLimitChange(null);
    }
  };

  const handleLimitValueChange = (value) => {
    setLimitValue(value);
    if (limitEnabled) {
      onLimitChange(value);
    }
  };

  return (
    <Box sx={{
      width: "100%",
      bgcolor: 'transparent',
      borderRadius: 0,
      border: 'none',
      p: 0,
      color: 'var(--dq-text-primary)'
    }}>
      {showHeader && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, px: 0.5 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: "var(--dq-accent-primary)", borderRadius: "50%" }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--dq-text-primary)' }}>
            限制行数 (LIMIT)
          </Typography>
        </Box>
      )}

      <Collapse in={isExpanded}>
        <Box sx={{ bgcolor: 'var(--dq-surface-card)', borderRadius: 3, border: "1px solid var(--dq-border-subtle)", p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, flex: 1, color: 'var(--dq-text-primary)' }}>
              启用结果数量限制
            </Typography>
            <FormControlLabel
              control={
                <RoundedSwitch
                  checked={limitEnabled}
                  onChange={(e) => handleLimitToggle(e.target.checked)}
                  disabled={disabled}
                  size="small"
                />
              }
              label=""
              sx={{ ml: 1 }}
            />
          </Box>

          {limitEnabled && (
            <Box sx={{ mt: 2 }}>
              <Typography
                variant="caption"
                sx={{ mb: 1, display: "block", color: 'var(--dq-text-tertiary)' }}
              >
                最多返回 {limitValue} 条记录
              </Typography>

              <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                <Slider
                  value={limitValue}
                  onChange={(e, value) => handleLimitValueChange(value)}
                  disabled={disabled}
                  min={1}
                  max={10000}
                  step={limitValue <= 100 ? 10 : limitValue <= 1000 ? 50 : 100}
                  marks={[
                    { value: 10, label: "10" },
                    { value: 100, label: "100" },
                    { value: 1000, label: "1K" },
                    { value: 10000, label: "10K" },
                  ]}
                  sx={{ flex: 1 }}
                />

                <TextField
                  size="small"
                  type="number"
                  value={limitValue}
                  onChange={(e) => {
                    const value = Math.max(
                      1,
                      Math.min(10000, parseInt(e.target.value) || 1),
                    );
                    handleLimitValueChange(value);
                  }}
                  disabled={disabled}
                  inputProps={{ min: 1, max: 10000 }}
                  sx={{
                    width: 80,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      '& fieldset': {
                        borderColor: 'var(--dq-border-subtle)'
                      },
                      '&:hover fieldset': {
                        borderColor: 'var(--dq-accent-primary)'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: 'var(--dq-accent-primary)',
                        borderWidth: 2
                      }
                    }
                  }}
                />
              </Box>

              <Typography
                variant="caption"
                sx={{ mt: 1, display: "block", color: 'var(--dq-text-tertiary)' }}
              >
                <Lightbulb size={16} style={{ marginRight: '8px' }} />
                提示：限制结果数量可以提高查询性能
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export default LimitControls;
