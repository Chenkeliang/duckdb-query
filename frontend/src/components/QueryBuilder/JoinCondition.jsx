import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import {
  Box,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import React from 'react';
import { resolveColor, withOpacity } from '../../utils/colorUtils';

const JOIN_TYPES = [
  { value: 'inner', label: '内连接 (Inner Join)', description: '仅返回两表中匹配的行' },
  { value: 'left', label: '左连接 (Left Join)', description: '返回左表所有行，不管右表是否匹配' },
  { value: 'right', label: '右连接 (Right Join)', description: '返回右表所有行，不管左表是否匹配' },
  { value: 'outer', label: '外连接 (Full Join)', description: '返回两表所有行，不管是否匹配' }
];

const JoinCondition = ({ join, sources, onUpdate, onRemove }) => {
  const leftSource = sources.find(s => s.id === join.left_source_id);
  const rightSource = sources.find(s => s.id === join.right_source_id);

  const leftColumns = leftSource ?
    (Array.isArray(leftSource.columns) ? leftSource.columns : []) :
    [];

  const rightColumns = rightSource ?
    (Array.isArray(rightSource.columns) ? rightSource.columns : []) :
    [];

  const handleChange = (field, value) => {
    onUpdate({ ...join, [field]: value });
  };

  // 根据连接类型返回对应的颜色
  const getJoinTypeColor = (type) => {
    switch (type) {
      case 'inner': return 'var(--dq-highlight-green)'; // Apple绿色
      case 'left': return 'var(--dq-highlight-blue)'; // Apple蓝色
      case 'right': return 'var(--dq-highlight-purple)'; // Apple紫色
      case 'outer': return 'var(--dq-highlight-orange)'; // Apple橙色
      default: return 'var(--dq-highlight-blue)';
    }
  };

  // 连接类型信息
  const joinTypeInfo = JOIN_TYPES.find(t => t.value === join.how) || JOIN_TYPES[0];
  const joinBaseColor = resolveColor(getJoinTypeColor(join.how), getJoinTypeColor(join.how));
  const joinOverlay = (amount) => withOpacity(getJoinTypeColor(join.how), amount, joinBaseColor);
  const neutralOverlay = (amount) => withOpacity('var(--dq-border)', amount, resolveColor('var(--dq-border)', 'var(--dq-border)'));
  const badgeOverlay = (colorVar) => withOpacity(colorVar, 0.12, resolveColor(colorVar, colorVar));
  const errorOverlay = (amount) => withOpacity('var(--dq-status-error-fg)', amount, resolveColor('var(--dq-status-error-fg)', 'var(--dq-status-error-fg)'));

  return (
    <Paper
      sx={{
        p: 2.5,
        mb: 2,
        borderRadius: 2.5,
        position: 'relative',
        boxShadow: 'none',
        border: '1px solid var(--dq-border-subtle)',
        transition: 'all 0.2s ease-in-out',
        // 防止触控板手势导致的页面导航
        overscrollBehavior: 'contain',
        touchAction: 'pan-x pan-y',
        '&:hover': {
          boxShadow: 'var(--dq-shadow-soft)',
          borderColor: 'var(--dq-border-hover)'
        }
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2.5,
          pb: 2,
          borderBottom: '1px solid var(--dq-border-subtle)'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Chip
            icon={<LinkIcon sx={{ fontSize: '1rem' }} />}
            label={joinTypeInfo.label}
            size="small"
            sx={{
              bgcolor: joinOverlay(0.12),
              color: getJoinTypeColor(join.how),
              fontWeight: 500,
              border: `1px solid ${joinOverlay(0.3)}`,
              '& .MuiChip-icon': {
                color: getJoinTypeColor(join.how)
              }
            }}
          />
          <Tooltip title={joinTypeInfo.description} placement="top" arrow>
            <Typography
              variant="caption"
              sx={{
                ml: 1,
                color: 'var(--dq-text-secondary)',
                cursor: 'help'
              }}
            >
              {joinTypeInfo.description}
            </Typography>
          </Tooltip>
        </Box>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id={`join-type-label-${join.left_source_id}-${join.right_source_id}`}>
            连接类型
          </InputLabel>
          <Select
            labelId={`join-type-label-${join.left_source_id}-${join.right_source_id}`}
            value={join.how}
            label="连接类型"
            onChange={(e) => handleChange('how', e.target.value)}
            sx={{
              borderRadius: 2,
              '.MuiOutlinedInput-notchedOutline': {
                borderColor: 'var(--dq-border-subtle)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'var(--dq-border-hover)',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'var(--dq-text-primary)',
              },
              fontSize: '1rem'
            }}
          >
            {JOIN_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems="center"
      >
        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: '100%'
        }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}>
            <Box sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: badgeOverlay('var(--dq-highlight-blue)'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dq-highlight-blue)',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}>
              L
            </Box>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                color: 'var(--dq-text-primary)',
                fontSize: '1rem'
              }}
            >
              左表
            </Typography>
          </Box>

          <FormControl fullWidth size="small">
            <InputLabel id={`left-source-label-${join.left_source_id}`}>
              数据表
            </InputLabel>
            <Select
              labelId={`left-source-label-${join.left_source_id}`}
              value={join.left_source_id}
              label="数据表"
              onChange={(e) => handleChange('left_source_id', e.target.value)}
              sx={{
                borderRadius: 2,
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-subtle)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-hover)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-text-primary)',
                }
              }}
            >
              {sources.map((source) => (
                <MenuItem key={source.id} value={source.id}>
                  {source.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel id={`left-column-label-${join.left_source_id}`}>
              连接列
            </InputLabel>
            <Select
              labelId={`left-column-label-${join.left_source_id}`}
              value={join.left_on}
              label="连接列"
              onChange={(e) => handleChange('left_on', e.target.value)}
              sx={{
                borderRadius: 2,
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-subtle)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-hover)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-text-primary)',
                }
              }}
            >
              {leftColumns.map((column) => {
                const columnName = typeof column === 'string' ? column : column.name;
                return (
                  <MenuItem key={columnName} value={columnName}>{columnName}</MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>

        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%'
          }}
        >
          <Tooltip title="交换左右表" placement="top" arrow>
            <IconButton
              onClick={() => {
                // 交换左右表
                const newJoin = {
                  ...join,
                  left_source_id: join.right_source_id,
                  right_source_id: join.left_source_id,
                  left_on: join.right_on,
                  right_on: join.left_on
                };
                onUpdate(newJoin);
              }}
              sx={{
                p: 1,
                borderRadius: '50%',
                bgcolor: 'var(--dq-surface-hover)',
                '&:hover': {
                  bgcolor: neutralOverlay(0.12),
                  transform: 'scale(1.1)'
                },
                transition: 'all 0.2s ease-in-out'
              }}
            >
              <CompareArrowsIcon
                sx={{
                  color: getJoinTypeColor(join.how),
                  fontSize: '1.5rem'
                }}
              />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: '100%'
        }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}>
            <Box sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: badgeOverlay('var(--dq-highlight-purple)'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--dq-highlight-purple)',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}>
              R
            </Box>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                color: 'var(--dq-text-primary)',
                fontSize: '1rem'
              }}
            >
              右表
            </Typography>
          </Box>

          <FormControl fullWidth size="small">
            <InputLabel id={`right-source-label-${join.right_source_id}`}>
              数据表
            </InputLabel>
            <Select
              labelId={`right-source-label-${join.right_source_id}`}
              value={join.right_source_id}
              label="数据表"
              onChange={(e) => handleChange('right_source_id', e.target.value)}
              sx={{
                borderRadius: 2,
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-subtle)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-hover)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-text-primary)',
                }
              }}
            >
              {sources.map((source) => (
                <MenuItem key={source.id} value={source.id}>{source.id}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel id={`right-column-label-${join.right_source_id}`}>
              连接列
            </InputLabel>
            <Select
              labelId={`right-column-label-${join.right_source_id}`}
              value={join.right_on}
              label="连接列"
              onChange={(e) => handleChange('right_on', e.target.value)}
              sx={{
                borderRadius: 2,
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-subtle)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-border-hover)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'var(--dq-text-primary)',
                }
              }}
            >
              {rightColumns.map((column) => {
                const columnName = typeof column === 'string' ? column : column.name;
                return (
                  <MenuItem key={columnName} value={columnName}>{columnName}</MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </Box>
      </Stack>

      <Box sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        mt: 2.5,
        pt: 2,
        borderTop: '1px solid var(--dq-border-subtle)'
      }}>
        <Tooltip title="删除此连接条件">
          <IconButton
            color="error"
            onClick={onRemove}
            size="small"
            sx={{
              border: `1px solid ${errorOverlay(0.32)}`,
              borderRadius: 1.5,
              '&:hover': {
                bgcolor: errorOverlay(0.18),
                boxShadow: `0 2px 8px ${errorOverlay(0.32)}`
              }
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
};

export default JoinCondition;
