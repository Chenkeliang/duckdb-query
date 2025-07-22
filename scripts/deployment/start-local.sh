#!/bin/bash

# 本地启动脚本 - 不使用Docker
# 适用于快速开发和测试

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 启动本地开发环境${NC}"
echo "=========================="

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js未安装，请先安装Node.js${NC}"
    exit 1
fi

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3未安装，请先安装Python3${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 环境检查通过${NC}"

# 停止现有进程
echo -e "${BLUE}🛑 停止现有进程...${NC}"
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm start" 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true

# 启动后端
echo -e "${BLUE}🔧 启动后端服务...${NC}"
cd api

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}📦 创建Python虚拟环境...${NC}"
    python3 -m venv venv
fi

# 激活虚拟环境并安装依赖
source venv/bin/activate
pip install -r requirements.txt > /dev/null 2>&1

# 启动后端服务
echo -e "${GREEN}🚀 启动FastAPI服务器...${NC}"
uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

cd ..

# 启动前端
echo -e "${BLUE}🎨 启动前端服务...${NC}"
cd frontend

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 安装前端依赖...${NC}"
    npm install
fi

# 安装现代化UI依赖
echo -e "${YELLOW}🎨 安装现代化UI依赖...${NC}"
npm install @fontsource/inter ag-grid-react ag-grid-community > /dev/null 2>&1

# 创建现代化UI文件
echo -e "${YELLOW}📝 配置现代化UI...${NC}"

# 创建目录
mkdir -p src/theme src/components/Layout src/styles

# 创建主题文件
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
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
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

# 创建样式文件
cat > src/styles/modern.css << 'EOF'
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body {
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f8fafc;
  margin: 0;
  padding: 0;
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

# 创建现代化App组件
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
  Grid,
} from '@mui/material';
import { modernTheme } from './theme/modernTheme';
import './styles/modern.css';

// 导入原有组件
import QueryBuilder from './components/QueryBuilder/QueryBuilder';
import DataGrid from './components/DataGrid';

const ModernApp = () => {
  const [queryResults, setQueryResults] = useState({ columns: [], data: [] });

  return (
    <ThemeProvider theme={modernTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
        <AppBar position="static" elevation={1} sx={{ backgroundColor: 'white', color: 'text.primary' }}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 600, color: 'primary.main' }}>
              🚀 DataQuery Pro - 现代化数据分析平台
            </Typography>
          </Toolbar>
        </AppBar>
        
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'text.primary' }}>
                  查询构建器
                </Typography>
                <QueryBuilder onQueryResult={setQueryResults} />
              </Paper>
            </Grid>
            
            <Grid item xs={12} md={8}>
              <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'text.primary' }}>
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

# 更新入口文件
cat > src/index.js << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import ModernApp from './ModernApp';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ModernApp />);
EOF

# 启动前端服务
echo -e "${GREEN}🚀 启动React开发服务器...${NC}"
REACT_APP_API_URL=http://localhost:8000 npm start &
FRONTEND_PID=$!

cd ..

# 等待服务启动
echo -e "${BLUE}⏳ 等待服务启动...${NC}"
sleep 5

echo -e "${GREEN}🎉 服务启动完成！${NC}"
echo ""
echo "🌐 访问地址:"
echo "  前端 (现代化UI): http://localhost:3000"
echo "  后端 API:       http://localhost:8000"
echo "  API 文档:       http://localhost:8000/docs"
echo ""
echo "📋 进程信息:"
echo "  后端进程 PID: $BACKEND_PID"
echo "  前端进程 PID: $FRONTEND_PID"
echo ""
echo "🛑 停止服务:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo "  或者按 Ctrl+C"

# 等待用户中断
trap "echo -e '\n${YELLOW}🛑 停止服务...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT

# 保持脚本运行
wait
