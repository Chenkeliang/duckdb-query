import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Avatar,
  Stack,
  Divider,
  Collapse,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  LinearProgress,
  Alert,
  Fade,
  useTheme,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Storage as DatabaseIcon,
  TableChart as TableIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

const ModernDataSourcePanel = ({ 
  dataSources = [], 
  onFileUpload, 
  onDatabaseConnect, 
  onDeleteDataSource,
  onPreviewData,
  loading = false 
}) => {
  const theme = useTheme();
  const [expandedSources, setExpandedSources] = useState(new Set());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const toggleExpanded = (sourceId) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
    }
    setExpandedSources(newExpanded);
  };

  const getSourceIcon = (type) => {
    switch (type) {
      case 'file':
        return <TableIcon />;
      case 'mysql':
      case 'postgresql':
      case 'sqlite':
        return <DatabaseIcon />;
      default:
        return <TableIcon />;
    }
  };

  const getSourceColor = (type) => {
    switch (type) {
      case 'file':
        return theme.palette.info.main;
      case 'mysql':
        return '#f59e0b';
      case 'postgresql':
        return '#3b82f6';
      case 'sqlite':
        return '#10b981';
      default:
        return theme.palette.grey[500];
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected':
      case 'active':
        return <CheckIcon color="success" fontSize="small" />;
      case 'error':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'warning':
        return <WarningIcon color="warning" fontSize="small" />;
      default:
        return null;
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    // 模拟上传进度
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      await onFileUpload(file);
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部操作区 */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              数据源管理
            </Typography>
            <Tooltip title="刷新数据源">
              <IconButton size="small" onClick={() => window.location.reload()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* 快速操作按钮 */}
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained"
              startIcon={<UploadIcon />}
              component="label"
              disabled={isUploading}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              上传文件
              <input
                type="file"
                hidden
                accept=".csv,.xlsx,.xls,.json,.parquet"
                onChange={handleFileUpload}
              />
            </Button>

            <Button
              variant="outlined"
              startIcon={<DatabaseIcon />}
              onClick={onDatabaseConnect}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              连接数据库
            </Button>
          </Stack>

          {/* 上传进度 */}
          {isUploading && (
            <Fade in={isUploading}>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    上传中...
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                    {uploadProgress}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={uploadProgress}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.palette.grey[200],
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>
            </Fade>
          )}
        </CardContent>
      </Card>

      {/* 数据源列表 */}
      <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              已连接数据源
            </Typography>
            <Chip
              label={`${dataSources.length} 个`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
        </CardContent>

        <Divider />

        {/* 数据源列表内容 */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {dataSources.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 200,
                color: 'text.secondary',
              }}
            >
              <DatabaseIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
              <Typography variant="body1" sx={{ mb: 1 }}>
                暂无数据源
              </Typography>
              <Typography variant="body2">
                点击上方按钮添加数据源
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {dataSources.map((source, index) => (
                <React.Fragment key={source.id}>
                  <ListItem
                    sx={{
                      py: 2,
                      px: 3,
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 48 }}>
                      <Avatar
                        sx={{
                          width: 40,
                          height: 40,
                          backgroundColor: getSourceColor(source.type),
                          color: 'white',
                        }}
                      >
                        {getSourceIcon(source.type)}
                      </Avatar>
                    </ListItemIcon>

                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {source.id}
                          </Typography>
                          {getStatusIcon(source.status)}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Chip
                              label={source.type.toUpperCase()}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.75rem', height: 20 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {source.columns?.length || 0} 列
                            </Typography>
                          </Box>
                          {source.description && (
                            <Typography variant="caption" color="text.secondary">
                              {source.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />

                    <ListItemSecondaryAction>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="预览数据">
                          <IconButton
                            size="small"
                            onClick={() => onPreviewData?.(source)}
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="展开详情">
                          <IconButton
                            size="small"
                            onClick={() => toggleExpanded(source.id)}
                          >
                            {expandedSources.has(source.id) ? (
                              <ExpandLessIcon fontSize="small" />
                            ) : (
                              <ExpandMoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="删除数据源">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => onDeleteDataSource?.(source)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </ListItemSecondaryAction>
                  </ListItem>

                  {/* 展开的详细信息 */}
                  <Collapse in={expandedSources.has(source.id)}>
                    <Box sx={{ px: 3, pb: 2, backgroundColor: 'background.secondary' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        字段列表:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {source.columns?.slice(0, 10).map((column) => (
                          <Chip
                            key={column}
                            label={column}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.75rem', height: 24 }}
                          />
                        ))}
                        {source.columns?.length > 10 && (
                          <Chip
                            label={`+${source.columns.length - 10} 更多`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.75rem', height: 24 }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Collapse>

                  {index < dataSources.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Card>

      {/* 底部提示 */}
      {dataSources.length > 0 && (
        <Alert
          severity="info"
          sx={{
            mt: 2,
            borderRadius: 2,
            '& .MuiAlert-message': {
              fontSize: '0.875rem',
            },
          }}
        >
          支持的文件格式：CSV、Excel、JSON、Parquet | 支持的数据库：MySQL、PostgreSQL、SQLite
        </Alert>
      )}
    </Box>
  );
};

export default ModernDataSourcePanel;
