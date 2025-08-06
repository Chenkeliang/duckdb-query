import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  IconButton,
  Paper,
  Stack,
  Typography,
  Tooltip,
  Chip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

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
    switch(type) {
      case 'inner': return '#34c759'; // Apple绿色
      case 'left': return '#007aff'; // Apple蓝色
      case 'right': return '#5856d6'; // Apple紫色
      case 'outer': return '#ff9500'; // Apple橙色
      default: return '#007aff';
    }
  };

  // 连接类型信息
  const joinTypeInfo = JOIN_TYPES.find(t => t.value === join.how) || JOIN_TYPES[0];

  return (
    <Paper
      sx={{
        p: 2.5,
        mb: 2,
        borderRadius: 2.5,
        position: 'relative',
        boxShadow: 'none',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        transition: 'all 0.2s ease-in-out',
        // 防止触控板手势导致的页面导航
        overscrollBehavior: 'contain',
        touchAction: 'pan-x pan-y',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          borderColor: 'rgba(0, 113, 227, 0.3)'
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
          borderBottom: '1px solid rgba(0,0,0,0.06)'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Chip 
            icon={<LinkIcon sx={{ fontSize: '1rem !important' }} />}
            label={joinTypeInfo.label}
            size="small"
            sx={{ 
              bgcolor: `${getJoinTypeColor(join.how)}10`,
              color: getJoinTypeColor(join.how),
              fontWeight: 500,
              border: `1px solid ${getJoinTypeColor(join.how)}30`,
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
                color: 'text.secondary',
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
                borderColor: 'rgba(0,0,0,0.1)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0,0,0,0.2)',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main',
              },
              fontSize: '0.875rem'
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
              bgcolor: 'rgba(0, 122, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#007aff',
              fontWeight: 'bold',
              fontSize: '0.75rem'
            }}>
              L
            </Box>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 500, 
                color: 'text.primary', 
                fontSize: '0.875rem'
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
                  borderColor: 'rgba(0,0,0,0.1)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(0,0,0,0.2)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
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
                  borderColor: 'rgba(0,0,0,0.1)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(0,0,0,0.2)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
                }
              }}
            >
              {leftColumns.map((column) => (
                <MenuItem key={column} value={column}>{column}</MenuItem>
              ))}
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
          <CompareArrowsIcon 
            sx={{ 
              color: getJoinTypeColor(join.how),
              fontSize: '1.5rem',
              opacity: 0.7
            }} 
          />
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
              bgcolor: 'rgba(88, 86, 214, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5856d6',
              fontWeight: 'bold',
              fontSize: '0.75rem'
            }}>
              R
            </Box>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 500, 
                color: 'text.primary', 
                fontSize: '0.875rem'
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
                  borderColor: 'rgba(0,0,0,0.1)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(0,0,0,0.2)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
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
                  borderColor: 'rgba(0,0,0,0.1)',
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(0,0,0,0.2)',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
                }
              }}
            >
              {rightColumns.map((column) => (
                <MenuItem key={column} value={column}>{column}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Stack>

      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        mt: 2.5,
        pt: 2,
        borderTop: '1px solid rgba(0,0,0,0.06)'
      }}>
        <Tooltip title="删除此连接条件">
          <IconButton 
            color="error" 
            onClick={onRemove}
            size="small"
            sx={{ 
              border: '1px solid rgba(211,47,47,0.2)', 
              borderRadius: 1.5,
              '&:hover': { 
                bgcolor: 'rgba(211,47,47,0.08)',
                boxShadow: '0 2px 8px rgba(211,47,47,0.2)'
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
