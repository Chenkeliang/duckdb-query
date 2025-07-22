# 脚本目录说明

## 📁 目录结构

```
scripts/
├── README.md                    # 本说明文档
├── deployment/                  # 部署相关脚本
│   ├── deploy-ui-improvements.sh      # UI改进部署脚本
│   ├── start-fixed.sh                 # 修复版启动脚本
│   ├── start-local.sh                 # 本地开发启动脚本
│   ├── start-modern-ui.sh             # 现代UI启动脚本
│   ├── start-simple.sh                # 简化启动脚本
│   └── verify-deployment.sh           # 部署验证脚本
├── docker/                      # Docker相关脚本（如有）
├── testing/                     # 测试相关脚本（如有）
└── development/                 # 开发工具脚本
    ├── compare_database_approaches.py  # 数据库方案对比工具
    └── test_enhanced_features.py       # 增强功能测试工具
```

## 🚀 使用说明

### 部署脚本 (deployment/)
- **start-local.sh** - 本地开发环境启动
- **start-modern-ui.sh** - 现代UI版本启动
- **start-fixed.sh** - 修复版本启动
- **start-simple.sh** - 简化版本启动
- **deploy-ui-improvements.sh** - UI改进部署
- **verify-deployment.sh** - 部署后验证

### 开发工具 (development/)
- **compare_database_approaches.py** - 数据库集成方案对比分析
- **test_enhanced_features.py** - 增强功能测试和验证

## 📋 使用方法

### 启动开发环境
```bash
# 本地开发启动
./scripts/deployment/start-local.sh

# 现代UI版本启动
./scripts/deployment/start-modern-ui.sh
```

### 部署验证
```bash
# 验证部署状态
./scripts/deployment/verify-deployment.sh
```

### 开发工具
```bash
# 数据库方案对比
python scripts/development/compare_database_approaches.py

# 增强功能测试
python scripts/development/test_enhanced_features.py
```

## 🔧 维护说明

- 新的部署脚本请放入 `deployment/` 目录
- 新的开发工具请放入 `development/` 目录
- 确保脚本有适当的执行权限
- 添加必要的文档说明
