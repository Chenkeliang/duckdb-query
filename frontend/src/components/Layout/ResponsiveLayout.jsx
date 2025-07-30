import React, { useState, useEffect } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
  Fab,
  Collapse,
  Alert
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  KeyboardArrowUp as UpIcon,
  Wifi as OnlineIcon,
  WifiOff as OfflineIcon
} from '@mui/icons-material';

const ResponsiveLayout = ({ 
  children, 
  sidebar, 
  title = "Interactive Data Query",
  showNetworkStatus = true 
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));
  
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);

  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineAlert(false);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineAlert(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 监听滚动位置
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.pageYOffset > 300);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 响应式侧边栏宽度
  const sidebarWidth = isMobile ? '100%' : isTablet ? 280 : 320;

  // 滚动到顶部
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // 处理侧边栏切换
  const handleSidebarToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // 移动端关闭侧边栏
  const handleSidebarClose = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* 顶部应用栏 */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: 'primary.main',
          boxShadow: theme.shadows[4]
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="toggle sidebar"
            edge="start"
            onClick={handleSidebarToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>

          {/* 网络状态指示器 */}
          {showNetworkStatus && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {isOnline ? (
                <OnlineIcon color="inherit" />
              ) : (
                <OfflineIcon color="error" />
              )}
              <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {isOnline ? '在线' : '离线'}
              </Typography>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* 侧边栏 */}
      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        open={sidebarOpen}
        onClose={handleSidebarClose}
        sx={{
          width: sidebarOpen ? sidebarWidth : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: sidebarWidth,
            boxSizing: 'border-box',
            borderRight: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper
          },
        }}
        ModalProps={{
          keepMounted: true, // 移动端性能优化
        }}
      >
        {/* 侧边栏工具栏占位 */}
        <Toolbar />
        
        {/* 移动端关闭按钮 */}
        {isMobile && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
            <IconButton onClick={handleSidebarClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        )}
        
        {/* 侧边栏内容 */}
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {sidebar}
        </Box>
      </Drawer>

      {/* 主内容区域 */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          marginLeft: isMobile ? 0 : (sidebarOpen ? 0 : `-${sidebarWidth}px`),
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 工具栏占位 */}
        <Toolbar />

        {/* 离线提示 */}
        <Collapse in={showOfflineAlert}>
          <Alert 
            severity="warning" 
            onClose={() => setShowOfflineAlert(false)}
            sx={{ borderRadius: 0 }}
          >
            您当前处于离线状态，某些功能可能无法正常使用
          </Alert>
        </Collapse>

        {/* 主要内容 */}
        <Box
          sx={{
            flex: 1,
            p: isMobile ? 1 : isTablet ? 2 : 3,
            backgroundColor: theme.palette.background.default,
            minHeight: 'calc(100vh - 64px)' // 减去AppBar高度
          }}
        >
          {children}
        </Box>
      </Box>

      {/* 回到顶部按钮 */}
      <Fab
        color="primary"
        size={isMobile ? "medium" : "large"}
        aria-label="scroll back to top"
        onClick={scrollToTop}
        sx={{
          position: 'fixed',
          bottom: isMobile ? 16 : 32,
          right: isMobile ? 16 : 32,
          opacity: showScrollTop ? 1 : 0,
          transform: showScrollTop ? 'scale(1)' : 'scale(0)',
          transition: theme.transitions.create(['opacity', 'transform'], {
            duration: theme.transitions.duration.standard,
          }),
          zIndex: theme.zIndex.fab
        }}
      >
        <UpIcon />
      </Fab>

      {/* 移动端遮罩层 */}
      {isMobile && sidebarOpen && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: theme.zIndex.drawer - 1
          }}
          onClick={handleSidebarClose}
        />
      )}
    </Box>
  );
};

export default ResponsiveLayout;
