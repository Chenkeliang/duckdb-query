import {
  Box,
  Collapse,
  FormControlLabel,
  Slider,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { Lightbulb } from 'lucide-react';
import React, { useState } from "react";

/**
 * LimitControls - 限制结果数量控制组件
 * 允许用户配置结果限制
 */
const LimitControls = ({
  limit,
  onLimitChange,
  disabled = false,
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
    <Box sx={{ width: "100%" }}>
      {/* 标题和控制 - 统一蓝色风格 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, px: 0.5 }}>
        <Box sx={{ width: 8, height: 8, bgcolor: "#3b82f6", borderRadius: "50%" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
          限制行数 (LIMIT)
        </Typography>
      </Box>

      <Collapse in={isExpanded}>
        <Box sx={{ bgcolor: "#f9fafb", borderRadius: 4, border: "1px solid #e5e7eb", p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
              启用结果数量限制
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={limitEnabled}
                  onChange={(e) => handleLimitToggle(e.target.checked)}
                  disabled={disabled}
                  size="small"
                />
              }
              label=""
            />
          </Box>

          {limitEnabled && (
            <Box sx={{ mt: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 1, display: "block" }}
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
                        borderColor: '#e5e7eb'
                      },
                      '&:hover fieldset': {
                        borderColor: '#3b82f6'
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#3b82f6',
                        borderWidth: 2
                      }
                    }
                  }}
                />
              </Box>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
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
