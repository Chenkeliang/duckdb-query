#!/bin/bash

# 准备现代化UI文件的脚本
# 在Docker构建过程中使用

set -e

echo "🎨 准备现代化UI文件..."

# 创建目录结构
mkdir -p src/theme
mkdir -p src/components/Layout
mkdir -p src/components/DataSource
mkdir -p src/components/Query
mkdir -p src/components/Results
mkdir -p src/components/DatabaseManager
mkdir -p src/components/ExportManager
mkdir -p src/styles

# 复制主题文件
cat > src/theme/modernTheme.js << 'EOF'
import { createTheme } from '@mui/material/styles';

export const modernTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb',
      light: '#3b82f6',
      dark: '#1d4ed8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#7c3aed',
      light: '#8b5cf6',
      dark: '#6d28d9',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
      secondary: '#f1f5f9',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
      disabled: '#94a3b8',
    },
  },
  typography: {
    fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        },
      },
    },
  },
});

export default modernTheme;
EOF

# 复制样式文件
cat > src/styles/modern.css << 'EOF'
/* 现代化UI样式 */
body {
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f8fafc;
}

.modern-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 12px !important;
  border: 1px solid #e2e8f0;
}

.modern-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

.modern-button {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 8px !important;
  text-transform: none !important;
  font-weight: 500 !important;
}

.modern-button:hover {
  transform: translateY(-1px);
}
EOF

# 创建简化的ModernApp组件
cat > src/ModernApp.jsx << 'EOF'
import React, { useState } from 'react';
import {
  Box,
  ThemeProvider,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Button,
  Grid,
} from '@mui/material';
import { modernTheme } from './theme/modernTheme';

// 导入原有组件作为后备
import QueryBuilder from './components/QueryBuilder/QueryBuilder';
import DataGrid from './components/DataGrid';

const ModernApp = () => {
  const [dataSources, setDataSources] = useState([]);
  const [queryResults, setQueryResults] = useState({ columns: [], data: [] });

  return (
    <ThemeProvider theme={modernTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
        <AppBar position="static" elevation={1}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
              DataQuery Pro - 现代化数据分析平台
            </Typography>
          </Toolbar>
        </AppBar>
        
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, borderRadius: 3 }}>
                <Typography variant="h6" gutterBottom>
                  查询构建器
                </Typography>
                <QueryBuilder />
              </Paper>
            </Grid>
            
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 3, borderRadius: 3 }}>
                <Typography variant="h6" gutterBottom>
                  查询结果
                </Typography>
                <DataGrid 
                  columns={queryResults.columns}
                  data={queryResults.data}
                />
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default ModernApp;
EOF

echo "✅ 现代化UI文件准备完成"
