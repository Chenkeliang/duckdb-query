import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  useTheme,
  useMediaQuery,
  Breadcrumbs,
  Link,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Badge,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Dashboard as DashboardIcon,
  Storage as StorageIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
  Notifications as NotificationsIcon,
  AccountCircle as AccountIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 280;

const ModernLayout = ({ children, currentPage = 'dashboard', onPageChange }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState(null);

  const navigationItems = [
    {
      id: 'dashboard',
      label: '数据概览',
      icon: <DashboardIcon />,
      path: '/dashboard',
    },
    {
      id: 'datasources',
      label: '数据源管理',
      icon: <StorageIcon />,
      path: '/datasources',
    },
    {
      id: 'query',
      label: '查询分析',
      icon: <AnalyticsIcon />,
      path: '/query',
    },
    {
      id: 'settings',
      label: '系统设置',
      icon: <SettingsIcon />,
      path: '/settings',
    },
  ];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleAccountMenuOpen = (event) => {
    setAccountMenuAnchor(event.currentTarget);
  };

  const handleAccountMenuClose = () => {
    setAccountMenuAnchor(null);
  };

  const getBreadcrumbs = () => {
    const currentItem = navigationItems.find(item => item.id === currentPage);
    return [
      { label: '首页', href: '/' },
      { label: currentItem?.label || '未知页面', href: currentItem?.path || '#' },
    ];
  };

  const SidebarContent = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo区域 */}
      <Box
        sx={{
          p: 3,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <AnalyticsIcon />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            DataQuery Pro
          </Typography>
          <Typography variant="caption" color="text.secondary">
            多数据源分析平台
          </Typography>
        </Box>
      </Box>

      {/* 导航菜单 */}
      <Box sx={{ flex: 1, p: 2 }}>
        <Typography
          variant="caption"
          sx={{
            px: 2,
            py: 1,
            display: 'block',
            fontWeight: 600,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          主要功能
        </Typography>
        
        <Box sx={{ mt: 1 }}>
          {navigationItems.map((item) => (
            <Box
              key={item.id}
              onClick={() => onPageChange?.(item.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                borderRadius: 2,
                cursor: 'pointer',
                mb: 0.5,
                transition: 'all 0.2s ease-in-out',
                backgroundColor: currentPage === item.id ? 'primary.main' : 'transparent',
                color: currentPage === item.id ? 'primary.contrastText' : 'text.primary',
                '&:hover': {
                  backgroundColor: currentPage === item.id ? 'primary.dark' : 'action.hover',
                  transform: 'translateX(4px)',
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                }}
              >
                {item.icon}
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* 底部帮助区域 */}
      <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            borderRadius: 2,
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <HelpIcon sx={{ color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            帮助与支持
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* 顶部导航栏 */}
      <AppBar
        position="fixed"
        sx={{
          width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { lg: `${DRAWER_WIDTH}px` },
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {isMobile && (
              <IconButton
                color="inherit"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 1 }}
              >
                <MenuIcon />
              </IconButton>
            )}
            
            {/* 面包屑导航 */}
            <Breadcrumbs
              separator="/"
              sx={{
                '& .MuiBreadcrumbs-separator': {
                  color: 'text.secondary',
                },
              }}
            >
              {getBreadcrumbs().map((crumb, index) => (
                <Link
                  key={index}
                  color={index === getBreadcrumbs().length - 1 ? 'text.primary' : 'text.secondary'}
                  href={crumb.href}
                  underline="hover"
                  sx={{
                    fontSize: '0.875rem',
                    fontWeight: index === getBreadcrumbs().length - 1 ? 600 : 400,
                  }}
                >
                  {crumb.label}
                </Link>
              ))}
            </Breadcrumbs>
          </Box>

          {/* 右侧工具栏 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="通知">
              <IconButton color="inherit">
                <Badge badgeContent={3} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title="主题切换">
              <IconButton color="inherit">
                <LightModeIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="账户设置">
              <IconButton
                color="inherit"
                onClick={handleAccountMenuOpen}
                sx={{ ml: 1 }}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'secondary.main',
                    fontSize: '0.875rem',
                  }}
                >
                  U
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* 侧边栏 */}
      <Box
        component="nav"
        sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}
      >
        {/* 移动端抽屉 */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              border: 'none',
              boxShadow: theme.shadows[3],
            },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
            <IconButton onClick={handleDrawerToggle}>
              <CloseIcon />
            </IconButton>
          </Box>
          <SidebarContent />
        </Drawer>

        {/* 桌面端固定侧边栏 */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              border: 'none',
              boxShadow: theme.shadows[1],
              borderRight: `1px solid ${theme.palette.divider}`,
            },
          }}
          open
        >
          <SidebarContent />
        </Drawer>
      </Box>

      {/* 主内容区域 */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          backgroundColor: 'background.default',
        }}
      >
        <Toolbar /> {/* 为AppBar留出空间 */}
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      </Box>

      {/* 账户菜单 */}
      <Menu
        anchorEl={accountMenuAnchor}
        open={Boolean(accountMenuAnchor)}
        onClose={handleAccountMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 200,
            borderRadius: 2,
            boxShadow: theme.shadows[3],
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            用户账户
          </Typography>
          <Typography variant="body2" color="text.secondary">
            admin@example.com
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleAccountMenuClose}>
          <AccountIcon sx={{ mr: 2 }} />
          个人资料
        </MenuItem>
        <MenuItem onClick={handleAccountMenuClose}>
          <SettingsIcon sx={{ mr: 2 }} />
          账户设置
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleAccountMenuClose}>
          退出登录
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default ModernLayout;
