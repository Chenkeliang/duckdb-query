import React, { useState } from 'react';
import { IconButton, Popover, Typography, List, ListItem, ListItemText, Box } from '@mui/material';
import { HelpCircle } from 'lucide-react';

const TypeHelpPopover = () => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        size="small"
        onClick={handleOpen}
        aria-label="数据类型说明"
        sx={{
          color: 'rgba(148, 163, 184, 0.9)',
          '&:hover': {
            color: '#0ea5e9',
          },
        }}
      >
        <HelpCircle size={16} />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            backgroundColor: '#0f172a',
            color: '#e2e8f0',
            borderRadius: 2,
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.35)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            maxWidth: 360,
            p: 2,
          },
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            类型提示
          </Typography>
          <Typography variant="body2" sx={{ mb: 1.5, color: 'rgba(226, 232, 240, 0.85)' }}>
            当聚合或关联列的类型不一致时，可以通过 TRY_CAST 将其转换为兼容类型。
          </Typography>
          <List dense disablePadding>
            <ListItem disableGutters>
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ color: '#38bdf8' }}>
                    DECIMAL(18,4)
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" sx={{ color: 'rgba(226, 232, 240, 0.65)' }}>
                    精确小数，适用于金额、比率等需要保留精度的场景
                  </Typography>
                }
              />
            </ListItem>
            <ListItem disableGutters>
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ color: '#38bdf8' }}>
                    DOUBLE
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" sx={{ color: 'rgba(226, 232, 240, 0.65)' }}>
                    浮点数，适用于统计分析及允许轻微误差的场景
                  </Typography>
                }
              />
            </ListItem>
            <ListItem disableGutters>
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ color: '#38bdf8' }}>
                    VARCHAR
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" sx={{ color: 'rgba(226, 232, 240, 0.65)' }}>
                    文本类型，常用于兼容异常值或作为保底选项
                  </Typography>
                }
              />
            </ListItem>
          </List>
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'rgba(148, 163, 184, 0.9)' }}>
            提示：TRY_CAST 在转换失败时会返回 NULL，不会中断查询。
          </Typography>
        </Box>
      </Popover>
    </>
  );
};

export default TypeHelpPopover;
