import React, { useState, useEffect } from 'react';
import { 
  Box, 
  CircularProgress, 
  Typography, 
  LinearProgress,
  Chip,
  Card,
  CardContent
} from '@mui/material';
import {
  QueryStats as QueryIcon,
  Storage as StorageIcon,
  Speed as SpeedIcon,
  CloudDownload as DownloadIcon
} from '@mui/icons-material';

const EnhancedLoadingIndicator = ({ 
  message = "正在加载...",
  type = "query", // query, upload, export, processing
  progress = null, // 0-100 的进度值
  details = null,
  estimatedTime = null,
  showElapsedTime = true
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!showElapsedTime) return;
    
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [showElapsedTime]);

  const getLoadingConfig = () => {
    switch (type) {
      case 'query':
        return {
          icon: <QueryIcon sx={{ fontSize: 40, color: 'primary.main' }} />,
          title: '正在执行查询...',
          description: '正在处理数据源连接和查询优化，请稍候',
          color: 'primary'
        };
      case 'upload':
        return {
          icon: <StorageIcon sx={{ fontSize: 40, color: 'success.main' }} />,
          title: '正在上传文件...',
          description: '正在解析文件内容并创建数据表',
          color: 'success'
        };
      case 'export':
        return {
          icon: <DownloadIcon sx={{ fontSize: 40, color: 'warning.main' }} />,
          title: '正在导出数据...',
          description: '正在生成导出文件，请稍候',
          color: 'warning'
        };
      case 'processing':
        return {
          icon: <SpeedIcon sx={{ fontSize: 40, color: 'info.main' }} />,
          title: '正在处理数据...',
          description: '正在进行数据转换和优化',
          color: 'info'
        };
      default:
        return {
          icon: <CircularProgress size={40} />,
          title: message,
          description: '正在处理中...',
          color: 'primary'
        };
    }
  };

  const config = getLoadingConfig();

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };

  const getProgressColor = () => {
    if (progress === null) return config.color;
    if (progress < 30) return 'error';
    if (progress < 70) return 'warning';
    return 'success';
  };

  return (
    <Card sx={{ maxWidth: 400, mx: 'auto', mt: 4, boxShadow: 3 }}>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
            gap: 2
          }}
        >
          {/* 图标和进度 */}
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            {progress !== null ? (
              <>
                <CircularProgress
                  variant="determinate"
                  value={progress}
                  size={60}
                  thickness={4}
                  color={getProgressColor()}
                />
                <Box
                  sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="caption" component="div" color="text.secondary" fontWeight="bold">
                    {`${Math.round(progress)}%`}
                  </Typography>
                </Box>
              </>
            ) : (
              config.icon
            )}
          </Box>

          {/* 标题 */}
          <Typography variant="h6" color="text.primary" textAlign="center" fontWeight="600">
            {config.title}
          </Typography>

          {/* 描述 */}
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {config.description}
          </Typography>

          {/* 进度条 */}
          {progress !== null && (
            <Box sx={{ width: '100%', mt: 1 }}>
              <LinearProgress 
                variant="determinate" 
                value={progress} 
                color={getProgressColor()}
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  backgroundColor: 'rgba(0,0,0,0.1)'
                }}
              />
            </Box>
          )}

          {/* 详细信息 */}
          {details && (
            <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ fontStyle: 'italic' }}>
              {details}
            </Typography>
          )}

          {/* 时间信息 */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {showElapsedTime && (
              <Chip 
                label={`已用时: ${formatTime(elapsed)}`} 
                size="small" 
                variant="outlined" 
                color="default"
              />
            )}
            {estimatedTime && (
              <Chip 
                label={`预计: ${formatTime(estimatedTime)}`} 
                size="small" 
                variant="outlined" 
                color="info"
              />
            )}
          </Box>

          {/* 性能提示 */}
          {elapsed > 10 && type === 'query' && (
            <Box sx={{ mt: 1, p: 1, backgroundColor: 'warning.light', borderRadius: 1, width: '100%' }}>
              <Typography variant="caption" color="warning.dark" textAlign="center" display="block">
                💡 查询时间较长，建议添加筛选条件或减少数据量
              </Typography>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default EnhancedLoadingIndicator;
