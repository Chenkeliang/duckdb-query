#!/usr/bin/env python3
"""
快速修复execute_sql端点
"""

import sys
import os
sys.path.append('/app')

import json
from datetime import datetime
from core.database_manager import db_manager
from models.query_models import DatabaseConnection, DataSourceType

def ensure_mysql_connection(datasource_id):
    """确保MySQL连接存在"""
    try:
        existing_conn = db_manager.get_connection(datasource_id)
        if existing_conn:
            return True
        
        with open('/app/mysql_configs.json', 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        config = None
        for cfg in configs:
            if cfg['id'] == datasource_id:
                config = cfg
                break
        
        if not config:
            return False
        
        db_connection = DatabaseConnection(
            id=config["id"],
            name=config.get("name", config["id"]),
            type=DataSourceType.MYSQL,
            params=config["params"],
            created_at=datetime.now(),
        )
        
        return db_manager.add_connection(db_connection)
        
    except Exception as e:
        print(f"确保连接失败: {str(e)}")
        return False

def execute_mysql_query(datasource_id, sql):
    """执行MySQL查询"""
    try:
        if not ensure_mysql_connection(datasource_id):
            return {"success": False, "error": f"无法创建数据库连接: {datasource_id}"}
        
        result_df = db_manager.execute_query(datasource_id, sql)
        
        # 处理数据类型
        import pandas as pd
        import numpy as np
        
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)
        
        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)
        
        data_records = result_df.to_dict(orient="records")
        columns_list = [str(col) for col in result_df.columns.tolist()]
        
        return {
            "success": True,
            "data": data_records,
            "columns": columns_list,
            "rowCount": len(result_df),
            "source_type": "database",
            "source_id": datasource_id,
            "sql_query": sql,
            "can_save_to_duckdb": True
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# 创建一个临时的API端点
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import JSONResponse

# 获取现有的app实例
import sys
for name, obj in sys.modules.items():
    if hasattr(obj, 'app') and hasattr(obj.app, 'post'):
        app = obj.app
        break
else:
    print("未找到FastAPI应用实例")
    sys.exit(1)

@app.post("/api/execute_mysql_sql")
async def execute_mysql_sql_direct(request: dict = Body(...)):
    """直接执行MySQL SQL查询的临时端点"""
    try:
        sql_query = request.get("sql", "")
        datasource = request.get("datasource", {})
        
        if not sql_query.strip():
            raise HTTPException(status_code=400, detail="请提供SQL查询语句")
        
        datasource_id = datasource.get("id")
        if not datasource_id:
            raise HTTPException(status_code=400, detail="缺少数据源ID")
        
        result = execute_mysql_query(datasource_id, sql_query)
        
        if result["success"]:
            return result
        else:
            raise HTTPException(status_code=500, detail=result["error"])
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

print("临时MySQL查询端点已创建: /api/execute_mysql_sql")
