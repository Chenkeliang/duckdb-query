import React from 'react';
import {
  Box,
  Chip,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartIcon from '@mui/icons-material/TableChart';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const SourceSelector = ({
  availableSources,
  selectedSources,
  onSourceSelect,
  onSourceRemove
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: { xs: 'column', sm: 'row' }, 
      gap: 3, 
      mb: 2 
    }}>
      {/* 可用数据源列表 */}
      <Paper sx={{ 
        flex: 1, 
        p: 0, 
        maxHeight: 250, 
        overflow: 'hidden',
        borderRadius: 2,
        border: '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box sx={{ 
          p: 1.5, 
          pb: 1, 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          bgcolor: 'rgba(0, 0, 0, 0.01)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <StorageIcon 
              sx={{ 
                color: 'rgba(0, 113, 227, 0.8)',
                fontSize: '1rem'
              }} 
            />
            <Typography 
              variant="subtitle2" 
              sx={{ 
                fontWeight: 500, 
                fontSize: '0.85rem',
                color: 'text.primary'
              }}
            >
              可用数据源
            </Typography>
          </Box>
          <Tooltip title="点击数据源将其添加到查询中">
            <InfoOutlinedIcon 
              fontSize="small" 
              sx={{ 
                fontSize: '0.9rem',
                color: 'text.secondary',
                opacity: 0.7
              }} 
            />
          </Tooltip>
        </Box>
        
        <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
          {availableSources.length > 0 ? (
            <List disablePadding>
              {[...availableSources]
                .filter(source => !selectedSources.some(s => s.id === source.id))
                .sort((a, b) => {
                  // 按创建时间倒序排序（最新的在上面）
                  // 如果createdAt为null，将其放在最后
                  if (!a.createdAt && !b.createdAt) return 0;
                  if (!a.createdAt) return 1;
                  if (!b.createdAt) return -1;
                  const timeA = new Date(a.createdAt).getTime();
                  const timeB = new Date(b.createdAt).getTime();
                  return timeB - timeA; // 时间大的（新的）排在前面
                })
                .map((source, index, array) => (
                  <React.Fragment key={source.id}>
                    <ListItem
                      button
                      onClick={() => onSourceSelect(source)}
                      sx={{ 
                        py: 1,
                        px: 2,
                        transition: 'all 0.2s',
                        '&:hover': { 
                          bgcolor: 'rgba(0, 113, 227, 0.04)',
                        }
                      }}
                    >
                      <ListItemText
                        disableTypography
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 500,
                                fontSize: '0.875rem'
                              }}
                            >
                              {source.name || source.id}
                            </Typography>
                            <Chip 
                              label={`${source.columns?.length || 0}列`}
                              size="small"
                              sx={{ 
                                height: 18,
                                fontSize: '0.65rem',
                                bgcolor: 'rgba(0, 113, 227, 0.08)',
                                color: 'rgba(0, 113, 227, 0.8)',
                                fontWeight: 500
                              }}
                            />
                          </Box>
                        }
                        secondary={
                          <Typography 
                            variant="caption" 
                            component="span"
                            sx={{ 
                              color: 'text.secondary',
                              mt: 0.5,
                              fontSize: '0.75rem',
                              display: 'block'
                            }}
                          >
                            {(source.type || '').toUpperCase()}
                          </Typography>
                        }
                      />
                      <Tooltip title="添加到查询">
                        <IconButton
                          edge="end"
                          size="small"
                          sx={{ 
                            color: 'primary.main',
                            opacity: 0.7,
                            '&:hover': {
                              opacity: 1,
                              bgcolor: 'rgba(0, 113, 227, 0.1)'
                            }
                          }}
                        >
                          <AddCircleOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItem>
                    {index < array.length - 1 && (
                      <Divider 
                        variant="inset" 
                        component="li" 
                        sx={{ 
                          ml: 2,
                          borderColor: 'rgba(0, 0, 0, 0.04)'
                        }} 
                      />
                    )}
                  </React.Fragment>
                ))}
            </List>
          ) : (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              p: 3
            }}>
              <Typography 
                variant="body2" 
                color="text.secondary" 
                align="center"
                sx={{ 
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  opacity: 0.7
                }}
              >
                没有可用的数据源
                <Typography 
                  variant="caption" 
                  component="span" 
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  请先上传文件
                </Typography>
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* 已选择数据源 */}
      <Paper sx={{ 
        flex: 1, 
        p: 0, 
        maxHeight: 250, 
        overflow: 'hidden',
        borderRadius: 2,
        border: '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box sx={{ 
          p: 1.5, 
          pb: 1, 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          bgcolor: 'rgba(0, 0, 0, 0.01)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TableChartIcon 
              sx={{ 
                color: 'rgba(52, 199, 89, 0.8)', // Apple绿色
                fontSize: '1rem'
              }} 
            />
            <Typography 
              variant="subtitle2" 
              sx={{ 
                fontWeight: 500, 
                fontSize: '0.85rem',
                color: 'text.primary'
              }}
            >
              已选择数据源
            </Typography>
            {selectedSources.length > 0 && (
              <Chip 
                label={selectedSources.length}
                size="small"
                sx={{ 
                  ml: 1,
                  height: 20,
                  minWidth: 20,
                  fontSize: '0.7rem',
                  bgcolor: 'rgba(52, 199, 89, 0.1)',
                  color: 'rgba(52, 199, 89, 0.8)',
                  fontWeight: 600
                }}
              />
            )}
          </Box>
        </Box>
        
        <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
          {selectedSources.length > 0 ? (
            <List disablePadding>
              {selectedSources.map((source, index, array) => (
                <React.Fragment key={source.id}>
                  <ListItem 
                    sx={{ 
                      py: 1,
                      px: 2,
                      transition: 'all 0.2s',
                    }}
                  >
                    <ListItemText
                      disableTypography
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              fontSize: '0.875rem'
                            }}
                          >
                            {source.name || source.id}
                          </Typography>
                          <Chip 
                            label={`${source.columns?.length || 0}列`}
                            size="small"
                            sx={{ 
                              height: 18,
                              fontSize: '0.65rem',
                              bgcolor: 'rgba(52, 199, 89, 0.08)',
                              color: 'rgba(52, 199, 89, 0.8)',
                              fontWeight: 500
                            }}
                          />
                        </Box>
                      }
                      secondary={
                        <Typography 
                          variant="caption" 
                          component="span"
                          sx={{ 
                            color: 'text.secondary',
                            mt: 0.5,
                            fontSize: '0.75rem',
                            display: 'block'
                          }}
                        >
                          {(source.type || '').toUpperCase()}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="从查询中移除">
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => onSourceRemove(source.id)}
                          sx={{ 
                            color: 'error.light',
                            opacity: 0.7,
                            '&:hover': {
                              opacity: 1,
                              bgcolor: 'rgba(211, 47, 47, 0.05)'
                            }
                          }}
                        >
                          <DeleteIcon 
                            sx={{ fontSize: '1rem' }} 
                          />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < array.length - 1 && (
                    <Divider 
                      variant="inset" 
                      component="li" 
                      sx={{ 
                        ml: 2,
                        borderColor: 'rgba(0, 0, 0, 0.04)'
                      }} 
                    />
                  )}
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              p: 3
            }}>
              <Typography 
                variant="body2" 
                color="text.secondary" 
                align="center"
                sx={{ 
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  opacity: 0.7
                }}
              >
                尚未选择数据源
                <Typography 
                  variant="caption" 
                  component="span" 
                  sx={{ mt: 0.5, display: 'block' }}
                >
                  从左侧列表中选择数据源
                </Typography>
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default SourceSelector;
