import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Paper,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { BarChart3, Database, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';

const SourceSelector = ({
  availableSources,
  selectedSources,
  onSourceSelect,
  onSourceRemove,
  onRefresh
}) => {
  const [sourceSearchTerm, setSourceSearchTerm] = useState('');

  const normalizedSourceSearch = sourceSearchTerm.trim().toLowerCase();

  // 基于名称 / 类型的轻量本地过滤，避免大列表难以定位
  const filteredAvailableSources = useMemo(() => {
    if (!Array.isArray(availableSources)) {
      return [];
    }
    const unselectedSources = availableSources.filter(
      (source) => !selectedSources.some((s) => s.id === source.id)
    );
    if (!normalizedSourceSearch) {
      return unselectedSources;
    }
    return unselectedSources.filter((source) => {
      const name = (source.name || source.id || '').toLowerCase();
      const type = (source.type || '').toLowerCase();
      return name.includes(normalizedSourceSearch) || type.includes(normalizedSourceSearch);
    });
  }, [availableSources, selectedSources, normalizedSourceSearch]);

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
        border: '1px solid var(--dq-border-subtle)',
        boxShadow: 'none',
        backgroundColor: 'var(--dq-surface-card)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box
          sx={{
            p: 1.5,
            pb: 1,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--dq-border-subtle)',
            bgcolor: 'var(--dq-surface)'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <Database
              sx={{
                color: 'var(--dq-accent-primary)',
                fontSize: '1rem'
              }}
            />
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 500,
                fontSize: '1rem',
                color: 'var(--dq-text-primary)'
              }}
            >
              可用数据源
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              flex: 1,
              justifyContent: { xs: 'flex-start', sm: 'flex-end' },
              flexWrap: 'wrap'
            }}
          >
            <TextField
              size="small"
              value={sourceSearchTerm}
              onChange={(event) => setSourceSearchTerm(event.target.value)}
              placeholder="搜索数据源或类型"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} color="var(--dq-text-tertiary)" />
                  </InputAdornment>
                )
              }}
              sx={{
                width: { xs: '100%', sm: 220 },
                flexShrink: 0,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  backgroundColor: 'var(--dq-surface)',
                  fontSize: '1rem',
                  '& fieldset': {
                    borderColor: 'var(--dq-border-subtle)'
                  },
                  '&:hover fieldset': {
                    borderColor: 'var(--dq-border-card)'
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'var(--dq-accent-primary)'
                  }
                }
              }}
            />
            {onRefresh && (
              <Tooltip title="刷新数据源列表">
                <IconButton
                  size="small"
                  onClick={onRefresh}
                  sx={{
                    color: 'var(--dq-text-secondary)',
                    opacity: 0.75,
                    '&:hover': {
                      opacity: 1,
                      bgcolor: 'var(--dq-accent-primary-soft)',
                      color: 'var(--dq-text-primary)'
                    }
                  }}
              >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="点击数据源将其添加到查询中">
              <InfoOutlinedIcon
                fontSize="small"
                sx={{
                  fontSize: '1rem',
                  color: 'var(--dq-text-secondary)',
                  opacity: 0.7
                }}
              />
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
          {availableSources.length > 0 ? (
            filteredAvailableSources.length > 0 ? (
              <List disablePadding>
                {[...filteredAvailableSources]
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
                        transition: 'background-color 0.2s ease, border-color 0.2s ease',
                        borderRadius: 1.5,
                        border: '1px solid transparent',
                        backgroundColor: 'var(--dq-surface)',
                        '&:hover': {
                          bgcolor: 'var(--dq-accent-primary-soft)',
                          borderColor: 'color-mix(in oklab, var(--dq-accent-primary) 30%, var(--dq-border-card))'
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
                                fontSize: '1rem',
                                color: 'var(--dq-text-primary)'
                              }}
                            >
                              {source.name || source.id}
                            </Typography>
                            <Chip
                              label={`${source.columns?.length || 0}列`}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '1rem',
                                bgcolor: 'color-mix(in oklab, var(--dq-accent-primary) 14%, transparent)',
                                color: 'var(--dq-accent-primary)',
                                fontWeight: 600
                              }}
                            />
                          </Box>
                        }
                        secondary={
                  <Typography
                    variant="caption"
                    component="span"
                    sx={{
                      color: 'var(--dq-text-secondary)',
                      mt: 0.5,
                      fontSize: '1rem',
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
                          color: 'var(--dq-accent-primary)',
                          opacity: 0.75,
                          '&:hover': {
                            opacity: 1,
                            bgcolor: 'var(--dq-accent-primary-soft)'
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
                        borderColor: 'var(--dq-border-subtle)'
                        }}
                      />
                    )}
                  </React.Fragment>
                ))}
              </List>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  p: 3,
                  textAlign: 'center',
                  color: 'var(--dq-text-secondary)'
                }}
              >
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
                  未找到匹配的数据源
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.75 }}>
                  调整搜索关键词或清空搜索框
                </Typography>
              </Box>
            )
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
                  fontSize: '1rem',
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
        border: '1px solid var(--dq-border-subtle)',
        boxShadow: 'none',
        backgroundColor: 'var(--dq-surface-card)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box sx={{
          p: 1.5,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--dq-border-subtle)',
          bgcolor: 'var(--dq-surface)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <BarChart3
              sx={{
                color: 'var(--dq-status-success-fg)',
                fontSize: '1rem'
              }}
            />
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 500,
                fontSize: '1rem',
                color: 'var(--dq-text-primary)'
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
                      fontSize: '1rem',
                      bgcolor: 'color-mix(in oklab, var(--dq-status-success-fg) 18%, transparent)',
                      color: 'var(--dq-status-success-fg)',
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
                        borderRadius: 1.5,
                        transition: 'background-color 0.2s ease, border-color 0.2s ease',
                        backgroundColor: 'var(--dq-surface)',
                        border: '1px solid var(--dq-border-subtle)',
                        '&:hover': {
                          backgroundColor: 'var(--dq-accent-primary-soft)',
                          borderColor: 'color-mix(in oklab, var(--dq-accent-primary) 30%, var(--dq-border-card))'
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
                              fontSize: '1rem',
                              color: 'var(--dq-text-primary)'
                            }}
                          >
                            {source.name || source.id}
                          </Typography>
                          <Chip
                            label={`${source.columns?.length || 0}列`}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '1rem',
                              bgcolor: 'color-mix(in oklab, var(--dq-status-success-fg) 14%, transparent)',
                              color: 'var(--dq-status-success-fg)',
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
                    color: 'var(--dq-text-secondary)',
                    mt: 0.5,
                    fontSize: '1rem',
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
                          color: 'var(--dq-accent-100)',
                          opacity: 0.75,
                          '&:hover': {
                            opacity: 1,
                            bgcolor: 'var(--dq-accent-primary-soft)'
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
                        borderColor: 'var(--dq-border-subtle)'
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
                  fontSize: '1rem',
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
