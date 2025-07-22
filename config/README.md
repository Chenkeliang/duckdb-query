# 配置文件目录说明

## 📁 目录结构

```
config/
├── README.md                    # 本说明文档
├── docker/                      # Docker配置文件
│   ├── docker-compose.yml             # 标准Docker Compose配置
│   ├── docker-compose.simple.yml      # 简化版Docker配置
│   ├── docker-compose.fixed.yml       # 修复版Docker配置
│   └── fix-docker-registry.sh         # Docker注册表修复脚本
└── deployment/                  # 部署配置文件
    └── vercel.json                     # Vercel部署配置
```

## 🐳 Docker配置

### docker-compose.yml
标准的Docker Compose配置文件，包含完整的服务定义

### docker-compose.simple.yml  
简化版配置，适用于快速开发和测试

### docker-compose.fixed.yml
修复版配置，解决了特定的部署问题

### fix-docker-registry.sh
Docker注册表相关问题的修复脚本

## 🚀 部署配置

### vercel.json
Vercel平台的部署配置文件，定义了：
- 构建设置
- 路由规则
- 环境变量
- 部署选项

## 📋 使用方法

### Docker部署
```bash
# 使用标准配置
docker-compose -f config/docker/docker-compose.yml up

# 使用简化配置
docker-compose -f config/docker/docker-compose.simple.yml up

# 使用修复版配置
docker-compose -f config/docker/docker-compose.fixed.yml up
```

### Vercel部署
```bash
# 使用Vercel配置部署
vercel --local-config config/deployment/vercel.json
```

### Docker问题修复
```bash
# 修复Docker注册表问题
./config/docker/fix-docker-registry.sh
```

## 🔧 配置说明

### Docker配置要点
- 服务端口映射
- 卷挂载设置
- 环境变量配置
- 网络设置

### Vercel配置要点
- 构建命令设置
- 输出目录配置
- 路由重写规则
- 环境变量管理

## 📝 维护指南

- 新的Docker配置请放入 `docker/` 目录
- 新的部署配置请放入 `deployment/` 目录
- 配置文件修改后请测试验证
- 重要配置变更请记录在文档中
