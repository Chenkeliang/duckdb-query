# MySQL配置保护说明

## 🔒 配置文件保护

### 生产环境配置位置
- **当前配置**: `api/mysql_configs.json`
- **备份位置**: `config/mysql-backups/`
- **模板文件**: `config/mysql-production-template.json`

### 安全注意事项
1. **敏感信息**: mysql_configs.json包含数据库密码等敏感信息
2. **Git保护**: 建议添加到.gitignore，防止意外提交敏感信息
3. **备份策略**: 定期备份配置文件到安全位置

### 当前保存的配置详情
- **配置ID**: sorder
- **数据库类型**: MySQL
- **主机**: rr-2ze4ks6ww80gpae5z723.mysql.rds.aliyuncs.com
- **端口**: 3306
- **数据库**: store_order
- **用户**: dataread
- **查询**: SELECT * FROM dy_order limit 10

### 生产部署步骤
1. 确保配置文件存在: `api/mysql_configs.json`
2. 验证数据库连接信息正确
3. 确保文件权限正确: `chmod 600 api/mysql_configs.json`
4. 测试数据库连接

### 恢复配置
如果配置丢失，可以从备份恢复：
```bash
# 查看可用备份
ls config/mysql-backups/

# 恢复配置（替换YYYYMMDD_HHMMSS为实际时间戳）
cp config/mysql-backups/mysql_configs_backup_YYYYMMDD_HHMMSS.json api/mysql_configs.json
```

### 配置验证
使用以下API端点测试配置：
- 测试连接: `POST /api/test_connection_simple`
- 获取配置: `GET /api/mysql_configs`

### 备份历史
- 2025-01-22 11:44:00: 初始备份创建，包含sorder配置

## 🛡️ 安全建议

1. **不要将包含密码的配置文件提交到公共代码仓库**
2. **定期更新数据库密码**
3. **使用环境变量存储敏感信息（生产环境推荐）**
4. **限制配置文件的访问权限**
5. **定期备份配置文件**

## 🔧 故障排除

### 连接失败
1. 检查网络连接
2. 验证主机地址和端口
3. 确认用户名和密码
4. 检查数据库是否存在

### 配置丢失
1. 从备份恢复配置
2. 重新配置数据库连接
3. 测试连接有效性

### 权限问题
1. 检查数据库用户权限
2. 确认查询语句正确
3. 验证数据库表存在
