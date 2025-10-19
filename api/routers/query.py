from fastapi import APIRouter, Body, HTTPException, Request, BackgroundTasks
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse, JSONResponse
from models.query_models import (
    QueryRequest,
    QueryResponse,
    AsyncQueryRequest,
    AsyncQueryResponse,
    QueryResult,
    DatabaseConnection,
    DataSourceType,
)
from models.visual_query_models import (
    VisualQueryRequest,
    VisualQueryResponse,
    PreviewRequest,
    PreviewResponse,
    ColumnStatistics,
    TableMetadata,
    VisualQueryConfig,
    SetOperationRequest,
    SetOperationResponse,
    SetOperationConfig,
    SetOperationType,
    UnionOperationRequest,
    SetOperationExportRequest,
    UniversalExportRequest,
    QueryType,
)
from core.duckdb_engine import (
    get_db_connection,
    execute_query,
    create_persistent_table,
    create_varchar_table_from_dataframe,
    build_single_table_query,
    generate_improved_column_aliases,
    detect_column_conflicts,
)
from core.visual_query_generator import (
    validate_query_config,
    get_column_statistics,
    get_table_metadata,
    estimate_query_performance,
    generate_set_operation_sql,
    estimate_set_operation_rows,
    generate_visual_query_sql,
    _build_where_clause,
    _quote_identifier,
)
import pandas as pd
import numpy as np
import io
import os
import time
import traceback
import logging
import re
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
import duckdb
from io import StringIO
import tempfile

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()


class DistinctValuesMetric(BaseModel):
    agg: str = Field(..., description="聚合：SUM|COUNT|AVG|MIN|MAX")
    column: str = Field(..., description="用于指标排序的列名")


class DistinctValuesRequest(BaseModel):
    config: VisualQueryConfig = Field(
        ..., description="用于构造基础过滤的配置，仅需表与过滤条件"
    )
    column: str = Field(..., description="目标列（可为计算列别名）")
    limit: int = Field(12, description="Top-N 数量")
    order_by: Optional[str] = Field("frequency", description="frequency|metric")
    metric: Optional[DistinctValuesMetric] = None
    base_limit: Optional[int] = Field(None, description="基础采样行数上限，可选")


def remove_auto_added_limit(sql: str) -> str:
    """
    智能移除系统自动添加的LIMIT子句，恢复用户原始SQL

    保存功能应该使用用户的原始SQL意图：
    - 如果用户原始SQL有LIMIT，完全保留
    - 如果用户原始SQL无LIMIT，移除系统添加的LIMIT

    Args:
        sql: 前端传递的SQL（可能被系统修改过）

    Returns:
        用户原始SQL意图
    """
    from core.config_manager import config_manager

    # 获取系统配置的最大行数
    try:
        max_rows = config_manager.get_app_config().max_query_rows
    except:
        max_rows = 10000  # 默认值

    # 移除末尾的分号和空白
    sql_cleaned = sql.rstrip("; \t\n\r")

    # 只移除系统自动添加的LIMIT（等于配置的max_rows）
    # 保留用户原始的所有LIMIT（无论大小）
    limit_pattern = rf"\s+LIMIT\s+{max_rows}$"

    if re.search(limit_pattern, sql_cleaned, re.IGNORECASE):
        # 移除系统自动添加的LIMIT，恢复用户原始SQL
        sql_cleaned = re.sub(limit_pattern, "", sql_cleaned, flags=re.IGNORECASE)
        logger.info(f"移除了系统自动添加的LIMIT {max_rows}，恢复用户原始SQL")
    else:
        logger.info("保留用户原始SQL的LIMIT子句")

    return sql_cleaned.strip()


def get_join_type_sql(join_type):
    """将前端的join类型转换为正确的SQL JOIN语法"""
    join_type = join_type.lower()
    if join_type == "inner":
        return "INNER JOIN"
    elif join_type == "left":
        return "LEFT JOIN"
    elif join_type == "right":
        return "RIGHT JOIN"
    elif join_type == "outer" or join_type == "full_outer":
        return "FULL OUTER JOIN"  # 外连接的正确SQL语法
    elif join_type == "cross":
        return "CROSS JOIN"
    else:
        return "INNER JOIN"  # 默认使用内连接


def ensure_query_has_limit(query: str, default_limit: int = 1000) -> str:
    """确保SQL查询有LIMIT子句，防止返回过多数据。"""
    # 使用正则表达式检查LIMIT子句，更稳健
    if not re.search(r"\sLIMIT\s+\d+\s*($|;)", query, re.IGNORECASE):
        if query.strip().endswith(";"):
            return f"{query[:-1]} LIMIT {default_limit};"
        else:
            return f"{query} LIMIT {default_limit}"
    return query


def _strip_sql_semicolon(sql: str) -> str:
    return sql.rstrip().rstrip(";")


def _build_preview_count_sql(sql: str) -> str:
    cleaned = _strip_sql_semicolon(sql)
    return f"SELECT COUNT(*) AS total_rows FROM ({cleaned}) AS preview_count"


# ==================== Visual Query API 端点 ====================


@router.post("/api/visual-query/generate", tags=["Visual Query"])
async def generate_visual_query(request: VisualQueryRequest) -> VisualQueryResponse:
    try:
        validation_result = validate_query_config(request.config)

        if not validation_result.is_valid:
            return VisualQueryResponse(
                success=False,
                sql=None,
                base_sql=None,
                pivot_sql=None,
                errors=validation_result.errors,
                warnings=validation_result.warnings,
                metadata=None,
                mode=request.mode,
            )

        generation = generate_visual_query_sql(
            request.config,
            mode=request.mode,
            pivot_config=request.pivot_config,
        )

        combined_warnings = list(validation_result.warnings or [])
        combined_warnings.extend(generation.warnings)

        metadata: Optional[Dict[str, Any]] = None

        if request.include_metadata:
            try:
                con = get_db_connection()
                estimate = estimate_query_performance(request.config, con)
                metadata = {
                    "estimated_rows": estimate.estimated_rows,
                    "estimated_time": estimate.estimated_time,
                    "complexity_score": validation_result.complexity_score,
                }
            except Exception as perf_exc:
                logger.warning("查询性能估算失败: %s", perf_exc)
                combined_warnings.append("无法估算查询性能")
                metadata = {
                    "estimated_rows": None,
                    "estimated_time": None,
                    "complexity_score": validation_result.complexity_score,
                }

            if metadata is not None:
                metadata.update(generation.metadata or {})
        elif generation.metadata:
            metadata = generation.metadata

        return VisualQueryResponse(
            success=True,
            sql=generation.final_sql,
            base_sql=generation.base_sql,
            pivot_sql=generation.pivot_sql,
            errors=[],
            warnings=combined_warnings,
            metadata=metadata,
            mode=request.mode,
        )

    except Exception as exc:
        logger.error("生成可视化查询失败: %s", exc, exc_info=True)
        return VisualQueryResponse(
            success=False,
            sql=None,
            base_sql=None,
            pivot_sql=None,
            errors=[f"生成查询失败: {str(exc)}"],
            warnings=[],
            metadata=None,
            mode=request.mode,
        )


@router.post("/api/visual-query/preview", tags=["Visual Query"])
async def preview_visual_query(request: PreviewRequest) -> PreviewResponse:
    try:
        validation_result = validate_query_config(request.config)

        if not validation_result.is_valid:
            return PreviewResponse(
                success=False,
                data=None,
                columns=None,
                row_count=0,
                estimated_time=None,
                sql=None,
                base_sql=None,
                mode=request.mode,
                errors=validation_result.errors,
                warnings=validation_result.warnings,
            )

        generation = generate_visual_query_sql(
            request.config,
            mode=request.mode,
            pivot_config=request.pivot_config,
        )

        preview_limit = request.limit or 10
        preview_sql = ensure_query_has_limit(generation.final_sql, preview_limit)

        con = get_db_connection()
        preview_df = execute_query(preview_sql, con)

        data = preview_df.to_dict("records")
        columns = [str(col) for col in preview_df.columns.tolist()]
        total_rows = len(preview_df)

        try:
            count_sql = _build_preview_count_sql(generation.final_sql)
            count_df = execute_query(count_sql, con)
            if not count_df.empty:
                total_rows = int(count_df.iloc[0][0])
        except Exception as count_exc:
            logger.warning("计算预览总行数失败: %s", count_exc)

        estimated_time = None
        try:
            estimate = estimate_query_performance(request.config, con)
            estimated_time = estimate.estimated_time
        except Exception as perf_exc:
            logger.debug("预览性能估算失败: %s", perf_exc)

        combined_warnings = list(validation_result.warnings or [])
        combined_warnings.extend(generation.warnings)

        return PreviewResponse(
            success=True,
            data=data,
            columns=columns,
            row_count=total_rows,
            estimated_time=estimated_time,
            sql=preview_sql,
            base_sql=generation.base_sql,
            # Expose pivot fragment for frontend preview when in pivot mode
            # (safe even if None)
            # 注意：PreviewResponse 模型目前未包含 pivot_sql 字段，但 Pydantic 允许额外字段被忽略；
            # 我们按返回需求补充该字段供前端显示。
            pivot_sql=generation.pivot_sql,
            mode=request.mode,
            errors=[],
            warnings=combined_warnings,
        )

    except Exception as exc:
        logger.error("可视化查询预览失败: %s", exc, exc_info=True)
        return PreviewResponse(
            success=False,
            data=None,
            columns=None,
            row_count=0,
            estimated_time=None,
            sql=None,
            base_sql=None,
            mode=request.mode,
            errors=[f"查询预览失败: {str(exc)}"],
            warnings=[],
        )


@router.get("/api/visual-query/table-metadata/{table_name}", tags=["Visual Query"])
async def get_visual_query_table_metadata(table_name: str):
    try:
        con = get_db_connection()
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )

        if table_name not in available_names:
            raise HTTPException(status_code=404, detail=f"数据表 {table_name} 不存在")

        metadata = get_table_metadata(con, table_name)
        metadata_dict = (
            metadata.model_dump()
            if hasattr(metadata, "model_dump")
            else metadata.dict()
        )

        return {
            "success": True,
            "metadata": metadata_dict,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("获取表元数据失败: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取表元数据失败: {str(exc)}")


@router.post("/api/visual-query/distinct-values", tags=["Visual Query"])
async def get_distinct_values(req: DistinctValuesRequest):
    """返回指定列的 Top-N 不同值，可按频次或指标聚合排序。

    安全注意：
    - 列名使用 _quote_identifier 包裹
    - 聚合函数白名单校验
    - LIMIT 使用参数化值
    """
    try:
        validation_result = validate_query_config(req.config)
        if not validation_result.is_valid:
            return {
                "success": False,
                "values": [],
                "stats": {},
                "errors": validation_result.errors,
                "warnings": validation_result.warnings,
            }

        con = get_db_connection()

        table = _quote_identifier(req.config.table_name)
        target_col = _quote_identifier(req.column)
        where_clause = _build_where_clause(req.config.filters)

        # 可选基础采样限制
        base_limit_sql = ""
        if req.base_limit and req.base_limit > 0:
            base_limit_sql = f" LIMIT {int(req.base_limit)}"

        base_cte = (
            f"WITH base AS (SELECT * FROM {table} {where_clause}{base_limit_sql})"
        )

        order_by = (req.order_by or "frequency").lower()
        sql = ""
        params = {}
        limit_val = int(req.limit or 12)

        if order_by == "metric" and req.metric:
            agg = (req.metric.agg or "").upper()
            if agg not in ["SUM", "COUNT", "AVG", "MIN", "MAX"]:
                raise HTTPException(status_code=400, detail="不支持的聚合函数")
            metric_col = _quote_identifier(req.metric.column)
            sql = (
                f"{base_cte} SELECT {target_col} AS v, COUNT(*) AS c, {agg}({metric_col}) AS m "
                f"FROM base WHERE {target_col} IS NOT NULL GROUP BY 1 ORDER BY m DESC, c DESC LIMIT {limit_val}"
            )
        else:
            sql = (
                f"{base_cte} SELECT {target_col} AS v, COUNT(*) AS c "
                f"FROM base WHERE {target_col} IS NOT NULL GROUP BY 1 ORDER BY c DESC LIMIT {limit_val}"
            )

        df = execute_query(sql, con)
        values = []
        topN = []
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                values.append(str(row["v"]))
                item = {"value": str(row["v"]), "count": int(row.get("c", 0))}
                if "m" in df.columns:
                    try:
                        item["metric"] = float(row.get("m"))
                    except Exception:
                        item["metric"] = None
                topN.append(item)

        # distinct_count 统计
        distinct_sql = f"{base_cte} SELECT COUNT(DISTINCT {target_col}) FROM base WHERE {target_col} IS NOT NULL"
        distinct_df = execute_query(distinct_sql, con)
        distinct_count = (
            int(distinct_df.iloc[0][0])
            if distinct_df is not None and not distinct_df.empty
            else None
        )

        return {
            "success": True,
            "values": values,
            "stats": {"distinct_count": distinct_count, "topN": topN},
            "errors": [],
            "warnings": validation_result.warnings,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("获取列去重值失败: %s", exc, exc_info=True)
        return {
            "success": False,
            "values": [],
            "stats": {},
            "errors": [str(exc)],
            "warnings": [],
        }


@router.get(
    "/api/visual-query/column-stats/{table_name}/{column_name}",
    tags=["Visual Query"],
)
async def get_visual_query_column_stats(table_name: str, column_name: str):
    try:
        con = get_db_connection()
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )

        if table_name not in available_names:
            raise HTTPException(status_code=404, detail=f"数据表 {table_name} 不存在")

        stats = get_column_statistics(con, table_name, column_name)
        stats_dict = (
            stats.model_dump() if hasattr(stats, "model_dump") else stats.dict()
        )

        return {
            "success": True,
            "statistics": stats_dict,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("获取列统计信息失败: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取列统计信息失败: {str(exc)}")


@router.post("/api/visual-query/validate", tags=["Visual Query"])
async def validate_visual_query_config_endpoint(config: VisualQueryConfig):
    try:
        result = validate_query_config(config)
        return {
            "success": True,
            "is_valid": result.is_valid,
            "errors": result.errors,
            "warnings": result.warnings,
            "complexity_score": result.complexity_score,
        }
    except Exception as exc:
        logger.error("可视化查询配置验证失败: %s", exc, exc_info=True)
        return {
            "success": False,
            "is_valid": False,
            "errors": [f"配置验证失败: {str(exc)}"],
            "warnings": [],
            "complexity_score": 0,
        }


def safe_alias(table, col):
    import re

    col_safe = re.sub(r"[^a-zA-Z0-9_]", "_", col)
    alias = f"{table}_{col_safe}"
    # 保证别名以字母或下划线开头
    if not re.match(r"^[a-zA-Z_]", alias):
        alias = f"col_{alias}"
    return f'"{alias}"'


def build_multi_table_join_query(query_request, con):
    """
    构建多表JOIN查询
    支持多个数据源的复杂JOIN操作
    增加关联结果列显示JOIN匹配状态
    使用改进的列名生成逻辑
    """
    sources = query_request.sources
    joins = query_request.joins

    if not sources:
        raise ValueError("至少需要一个数据源")

    if len(sources) == 1:
        # 单表查询
        source_id = sources[0].id.strip('"')
        return f'SELECT * FROM "{source_id}"'

    # 验证所有表都已注册
    available_tables = con.execute("SHOW TABLES").fetchdf()
    available_table_names = available_tables["name"].tolist()

    for source in sources:
        table_id = source.id.strip('"')
        if table_id not in available_table_names:
            raise ValueError(
                f"表 '{table_id}' 未注册到DuckDB中。可用表: {', '.join(available_table_names)}"
            )

    # 为每个source添加columns信息（如果还没有的话）
    for source in sources:
        if not hasattr(source, "columns") or source.columns is None:
            try:
                # 获取表的列信息
                cols_df = con.execute(f"PRAGMA table_info('{source.id}')").fetchdf()
                source.columns = cols_df["name"].tolist()
            except Exception as e:
                logger.error(f"获取表 {source.id} 的列信息失败: {e}")
                source.columns = []

    # 使用改进的列别名生成逻辑
    column_aliases = generate_improved_column_aliases(sources)

    # 构建SELECT子句 - 只为JOIN中涉及的表生成列
    select_fields = []

    # 为涉及的表生成列（如果有JOIN）
    if joins:
        involved_tables = set()
        for join in joins:
            involved_tables.add(join.left_source_id.strip('"'))
            involved_tables.add(join.right_source_id.strip('"'))

        for source in sources:
            table_id = source.id.strip('"')
            if table_id in involved_tables and source.columns:
                for col in source.columns:
                    alias = column_aliases[source.id][col]
                    select_fields.append(f'"{table_id}"."{col}" AS "{alias}"')
    else:
        # 如果没有JOIN，包含所有表的所有列
        for source in sources:
            table_id = source.id.strip('"')
            if source.columns:
                for col in source.columns:
                    alias = column_aliases[source.id][col]
                    select_fields.append(f'"{table_id}"."{col}" AS "{alias}"')

    # 添加关联结果列
    join_result_fields = []
    if joins:
        # 为简单起见，我们仍然使用字母前缀来生成JOIN结果列名
        table_prefixes = {}
        prefix_index = 0
        for source in sources:
            table_id = source.id.strip('"')
            prefix = chr(65 + prefix_index)  # A=65, B=66, C=67...
            table_prefixes[table_id] = prefix
            prefix_index += 1

        for i, join in enumerate(joins):
            left_table = join.left_source_id.strip('"')
            right_table = join.right_source_id.strip('"')

            # 生成关联结果列名
            left_prefix = table_prefixes.get(left_table, left_table)
            right_prefix = table_prefixes.get(right_table, right_table)
            join_result_column = f"join_result_{left_prefix}_{right_prefix}"

            # 根据JOIN类型生成CASE表达式
            join_type = join.join_type.lower()
            if join_type == "inner":
                # INNER JOIN: 只有匹配的记录，都标记为'both'
                join_result_expr = f"'both' AS {join_result_column}"
            elif join_type == "left":
                # LEFT JOIN: 检查右表关键字段是否为NULL
                if join.conditions and len(join.conditions) > 0:
                    right_key_col = (
                        f'"{right_table}"."{join.conditions[0].right_column}"'
                    )
                else:
                    # 如果没有条件，使用第一个列作为检查
                    right_cols = (
                        [col for col in sources if col.id.strip('"') == right_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == right_table for col in sources)
                        else []
                    )
                    right_key_col = (
                        f'"{right_table}"."{right_cols[0]}"'
                        if right_cols
                        else f'"{right_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {right_key_col} IS NULL THEN 'left' ELSE 'both' END AS {join_result_column}"
            elif join_type == "right":
                # RIGHT JOIN: 检查左表关键字段是否为NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{join.conditions[0].left_column}"'
                else:
                    # 如果没有条件，使用第一个列作为检查
                    left_cols = (
                        [col for col in sources if col.id.strip('"') == left_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == left_table for col in sources)
                        else []
                    )
                    left_key_col = (
                        f'"{left_table}"."{left_cols[0]}"'
                        if left_cols
                        else f'"{left_table}".rowid'
                    )
                join_result_expr = f"CASE WHEN {left_key_col} IS NULL THEN 'right' ELSE 'both' END AS {join_result_column}"
            elif join_type in ["full", "full_outer", "outer"]:
                # FULL OUTER JOIN: 检查两边关键字段是否为NULL
                if join.conditions and len(join.conditions) > 0:
                    left_key_col = f'"{left_table}"."{join.conditions[0].left_column}"'
                    right_key_col = (
                        f'"{right_table}"."{join.conditions[0].right_column}"'
                    )
                else:
                    # 如果没有条件，使用第一个列作为检查
                    left_cols = (
                        [col for col in sources if col.id.strip('"') == left_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == left_table for col in sources)
                        else []
                    )
                    right_cols = (
                        [col for col in sources if col.id.strip('"') == right_table][
                            0
                        ].columns
                        if any(col.id.strip('"') == right_table for col in sources)
                        else []
                    )
                    left_key_col = (
                        f'"{left_table}"."{left_cols[0]}"'
                        if left_cols
                        else f'"{left_table}".rowid'
                    )
                    right_key_col = (
                        f'"{right_table}"."{right_cols[0]}"'
                        if right_cols
                        else f'"{right_table}".rowid'
                    )
                join_result_expr = f"""CASE
                    WHEN {left_key_col} IS NULL THEN 'right'
                    WHEN {right_key_col} IS NULL THEN 'left'
                    ELSE 'both'
                END AS {join_result_column}"""
            else:
                # 其他类型的JOIN（如CROSS JOIN），默认标记为'both'
                join_result_expr = f"'both' AS {join_result_column}"

            join_result_fields.append(join_result_expr)

    # 合并所有字段
    all_fields = select_fields + join_result_fields
    select_clause = ", ".join(all_fields) if all_fields else "*"

    # 构建FROM和JOIN子句
    if not joins:
        # 没有JOIN条件，使用CROSS JOIN
        first_source_id = sources[0].id.strip('"')
        from_clause = f'"{first_source_id}"'
        for source in sources[1:]:
            source_id = source.id.strip('"')
            from_clause += f' CROSS JOIN "{source_id}"'
    else:
        # 构建JOIN链
        from_clause = build_join_chain(
            sources, joins, {source.id.strip('"'): source.columns for source in sources}
        )

    query = f"SELECT {select_clause} FROM {from_clause}"

    # 添加LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def build_join_chain(sources, joins, table_columns):
    """
    构建JOIN链，支持多表连接和多字段关联
    """
    if not joins:
        first_source_id = sources[0].id.strip('"')
        return f'"{first_source_id}"'

    # 创建表的映射
    source_map = {source.id.strip('"'): source for source in sources}

    # 跟踪已经加入查询的表
    joined_tables = set()

    # 从第一个JOIN开始构建
    first_join = joins[0]
    left_table = first_join.left_source_id.strip('"')
    right_table = first_join.right_source_id.strip('"')

    # 开始构建查询
    from_clause = f'"{left_table}"'
    joined_tables.add(left_table)

    # 收集所有相同表对的JOIN条件
    join_conditions_map = {}

    for join in joins:
        left_id = join.left_source_id.strip('"')
        right_id = join.right_source_id.strip('"')

        # 创建JOIN键，用于合并相同表对的JOIN条件
        join_key = tuple(sorted([left_id, right_id]))

        if join_key not in join_conditions_map:
            join_conditions_map[join_key] = {
                "left_table": left_id,
                "right_table": right_id,
                "join_type": join.join_type,
                "conditions": [],
            }

        # 添加条件到对应的JOIN
        if join.conditions:
            join_conditions_map[join_key]["conditions"].extend(join.conditions)

    # 处理所有JOIN（现在每个表对只处理一次）
    for join_key, join_info in join_conditions_map.items():
        left_id = join_info["left_table"]
        right_id = join_info["right_table"]
        join_type = join_info["join_type"]
        all_conditions = join_info["conditions"]

        # 确定哪个表需要被JOIN进来
        if left_id in joined_tables and right_id not in joined_tables:
            # 右表需要被JOIN进来
            table_to_join = right_id
        elif right_id in joined_tables and left_id not in joined_tables:
            # 左表需要被JOIN进来
            table_to_join = left_id
        elif left_id not in joined_tables and right_id not in joined_tables:
            # 两个表都不在查询中，JOIN右表
            table_to_join = right_id
        else:
            # 两个表都已经在查询中，跳过这个JOIN
            continue

        join_type_sql = get_join_type_sql(join_type)
        from_clause += f' {join_type_sql} "{table_to_join}"'

        # 添加所有JOIN条件（包括多字段关联）
        if join_type.lower() != "cross" and all_conditions:
            conditions = []
            for condition in all_conditions:
                left_table_id = left_id
                right_table_id = right_id

                # 智能数据类型转换和清洗
                left_col = f'"{left_table_id}"."{condition.left_column}"'
                right_col = f'"{right_table_id}"."{condition.right_column}"'

                # 检查是否需要数据清洗（针对包含JSON或复杂字符串的情况）
                # 如果左列包含复杂数据，尝试提取数字部分
                if condition.left_column == "uid" and left_table_id in ["0711", "0702"]:
                    # 使用正则表达式提取数字部分
                    left_col = (
                        f"CAST(REGEXP_EXTRACT({left_col}, '^([0-9]+)', 1) AS VARCHAR)"
                    )

                # 如果右列是数字类型，确保类型匹配
                if condition.right_column in [
                    "iget_uid",
                    "buyer_id",
                ] and right_table_id.startswith("query_result"):
                    # 确保右列也是字符串类型进行比较
                    right_col = f"CAST({right_col} AS VARCHAR)"

                conditions.append(f"{left_col} {condition.operator} {right_col}")

            if conditions:
                from_clause += f" ON {' AND '.join(conditions)}"

        joined_tables.add(table_to_join)

    return from_clause


@router.post("/api/query", tags=["Query"])
async def perform_query(query_request: QueryRequest):
    """Performs a join query on the specified data sources."""
    con = get_db_connection()

    try:
        # 确保文件存在并可访问
        for source in query_request.sources:
            if source.type == "file":
                original_path = source.params["path"]

                # 标准化文件路径，支持多种路径格式
                possible_paths = [
                    original_path,  # 原始路径
                    os.path.join(
                        "api", "temp_files", os.path.basename(original_path)
                    ),  # api/temp_files/filename
                    os.path.join(
                        os.path.dirname(os.path.dirname(__file__)),
                        "temp_files",
                        os.path.basename(original_path),
                    ),  # 绝对路径
                ]

                # 如果是相对路径，尝试不同的基础路径
                if original_path.startswith("temp_files/"):
                    filename = original_path.replace("temp_files/", "")
                    possible_paths.extend(
                        [
                            os.path.join("api", "temp_files", filename),
                            os.path.join(
                                os.path.dirname(os.path.dirname(__file__)),
                                "temp_files",
                                filename,
                            ),
                        ]
                    )

                # 找到实际存在的文件路径
                file_path = None
                for path in possible_paths:
                    if os.path.exists(path):
                        file_path = path
                        break

                if not file_path:
                    logger.error(f"文件不存在，尝试的路径: {possible_paths}")
                    raise ValueError(f"文件不存在: {original_path}")

                # 更新source中的路径为实际找到的路径
                source.params["path"] = file_path

                logger.info(f"注册数据源: {source.id}, 路径: {file_path}")

                # 根据文件扩展名选择合适的读取方法
                file_extension = file_path.lower().split(".")[-1]

                if file_extension in ["xlsx", "xls"]:
                    # Excel文件处理
                    try:
                        con.execute("INSTALL excel;")
                        con.execute("LOAD excel;")
                        duckdb_query = (
                            f"SELECT * FROM EXCEL_SCAN('{file_path}') LIMIT 1"
                        )
                        con.execute(duckdb_query).fetchdf()
                        # 先创建临时表
                        temp_table = f"temp_{source.id}_{int(time.time())}"
                        con.execute(
                            f"CREATE TABLE \"{temp_table}\" AS SELECT * FROM EXCEL_SCAN('{file_path}')"
                        )

                        # 获取列信息并转换为VARCHAR
                        columns_info = con.execute(
                            f'DESCRIBE "{temp_table}"'
                        ).fetchall()
                        cast_columns = []
                        for col_name, col_type, *_ in columns_info:
                            cast_columns.append(
                                f'CAST("{col_name}" AS VARCHAR) AS "{col_name}"'
                            )

                        cast_sql = ", ".join(cast_columns)

                        # 创建最终的VARCHAR表
                        con.execute(f'DROP TABLE IF EXISTS "{source.id}"')
                        con.execute(
                            f'CREATE TABLE "{source.id}" AS SELECT {cast_sql} FROM "{temp_table}"'
                        )

                        # 删除临时表
                        con.execute(f'DROP TABLE "{temp_table}"')
                        logger.info(f"使用duckdb EXCEL_SCAN 注册Excel表: {source.id}")
                    except Exception as duckdb_exc:
                        logger.warning(
                            f"duckdb EXCEL_SCAN 读取失败，降级为pandas: {duckdb_exc}"
                        )
                        df = pd.read_excel(file_path, dtype=str)
                        con.register(source.id, df)
                        logger.info(
                            f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                        )

                elif file_extension == "csv":
                    # CSV文件处理，优先使用DuckDB原生功能
                    try:
                        # 使用DuckDB读取CSV，然后转换所有列为VARCHAR
                        temp_table = f"temp_{source.id}_{int(time.time())}"

                        # 先用DuckDB读取到临时表
                        con.execute(
                            f"CREATE TABLE \"{temp_table}\" AS SELECT * FROM read_csv_auto('{file_path}')"
                        )

                        # 获取列信息并转换为VARCHAR
                        columns_info = con.execute(
                            f'DESCRIBE "{temp_table}"'
                        ).fetchall()
                        cast_columns = []
                        for col_name, col_type, *_ in columns_info:
                            cast_columns.append(
                                f'CAST("{col_name}" AS VARCHAR) AS "{col_name}"'
                            )

                        cast_sql = ", ".join(cast_columns)

                        # 创建最终表，所有列都是VARCHAR
                        con.execute(f'DROP TABLE IF EXISTS "{source.id}"')
                        con.execute(
                            f'CREATE TABLE "{source.id}" AS SELECT {cast_sql} FROM "{temp_table}"'
                        )

                        # 删除临时表
                        con.execute(f'DROP TABLE "{temp_table}"')

                        logger.info(
                            f"使用DuckDB read_csv_auto创建VARCHAR表: {source.id}"
                        )

                    except Exception as duckdb_exc:
                        logger.warning(f"DuckDB读取CSV失败，降级为pandas: {duckdb_exc}")
                        # 降级为pandas方案
                        df = pd.read_csv(file_path, dtype=str)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已用pandas.read_csv创建持久化表: {source.id}, shape: {df.shape}"
                        )

                else:
                    # 其他文件类型，尝试pandas通用读取
                    logger.warning(f"未知文件类型: {file_extension}，尝试pandas读取")
                    try:
                        df = pd.read_csv(file_path, dtype=str)  # 默认尝试CSV
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已用pandas.read_csv创建持久化表: {source.id}, shape: {df.shape}"
                        )
                    except Exception:
                        df = pd.read_excel(file_path, dtype=str)  # 再尝试Excel
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已用pandas.read_excel注册表: {source.id}, shape: {df.shape}"
                        )

            elif source.type in ["mysql", "postgresql", "sqlite"]:
                # 处理数据库数据源 - 支持三种模式：connectionId、数据源名称、直接连接参数
                connection_id = source.params.get("connectionId")
                datasource_name = source.params.get("datasource_name")

                if connection_id:
                    # 模式1：使用预先保存的数据库连接
                    logger.info(
                        f"处理数据库数据源: {source.id}, 连接ID: {connection_id}"
                    )

                    from core.database_manager import db_manager

                    try:
                        db_connection = db_manager.get_connection(connection_id)
                        if not db_connection:
                            raise ValueError(f"未找到数据库连接: {connection_id}")

                        if hasattr(db_connection.params, "query"):
                            query = db_connection.params.get(
                                "query", "SELECT * FROM dy_order LIMIT 1000"
                            )
                        else:
                            query = "SELECT * FROM dy_order LIMIT 1000"

                        df = db_manager.execute_query(connection_id, query)
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已创建持久化数据库表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as db_error:
                        logger.error(f"数据库连接处理失败: {db_error}")
                        raise ValueError(
                            f"数据库连接处理失败: {source.id}, 错误: {str(db_error)}"
                        )

                elif datasource_name:
                    # 模式2：使用数据源名称（安全模式）- 从配置文件读取连接信息
                    logger.info(
                        f"处理安全数据源: {source.id}, 数据源名称: {datasource_name}"
                    )

                    try:
                        import json
                        from sqlalchemy import create_engine

                        # 读取MySQL配置文件
                        mysql_config_file = os.path.join(
                            os.path.dirname(os.path.dirname(__file__)),
                            "config/mysql-configs.json",
                        )
                        if not os.path.exists(mysql_config_file):
                            raise ValueError("MySQL配置文件不存在")

                        with open(mysql_config_file, "r", encoding="utf-8") as f:
                            configs = json.load(f)

                        # 查找对应的配置
                        mysql_config = None
                        for config in configs:
                            if config["id"] == datasource_name:
                                mysql_config = config["params"]
                                break

                        if not mysql_config:
                            raise ValueError(f"未找到数据源配置: {datasource_name}")

                        # 获取查询语句
                        query = source.params.get(
                            "query",
                            mysql_config.get(
                                "query", "SELECT * FROM dy_order LIMIT 1000"
                            ),
                        )

                        # 创建连接字符串
                        connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=utf8mb4"

                        # 执行查询
                        engine = create_engine(connection_str)
                        df = pd.read_sql(query, engine)

                        # 注册到DuckDB
                        con.register(source.id, df)
                        logger.info(
                            f"已注册安全数据源表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as secure_db_error:
                        logger.error(f"安全数据源处理失败: {secure_db_error}")
                        raise ValueError(
                            f"安全数据源处理失败: {source.id}, 错误: {str(secure_db_error)}"
                        )
                else:
                    # 模式3：直接使用连接参数（兼容旧版本，但不推荐）
                    logger.warning(f"使用直接连接参数模式（不推荐）: {source.id}")

                    try:
                        from sqlalchemy import create_engine

                        # 获取连接参数
                        host = source.params.get("host", "localhost")
                        port = source.params.get(
                            "port", 3306 if source.type == "mysql" else 5432
                        )
                        user = source.params.get("user", "")
                        password = source.params.get("password", "")
                        database = source.params.get("database", "")
                        query = source.params.get("query", "SELECT 1 as test")

                        if not all([host, user, database, query]):
                            raise ValueError(f"数据库连接参数不完整: {source.id}")

                        # 创建连接字符串
                        if source.type == "mysql":
                            connection_str = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
                        elif source.type == "postgresql":
                            connection_str = f"postgresql://{user}:{password}@{host}:{port}/{database}"
                        elif source.type == "sqlite":
                            connection_str = f"sqlite:///{database}"
                        else:
                            raise ValueError(f"不支持的数据库类型: {source.type}")

                        # 创建引擎并执行查询
                        engine = create_engine(connection_str)
                        df = pd.read_sql(query, engine)

                        # 创建持久化表到DuckDB
                        create_varchar_table_from_dataframe(source.id, df, con)
                        logger.info(
                            f"已创建持久化直接连接数据库表: {source.id}, shape: {df.shape}"
                        )

                    except Exception as direct_db_error:
                        logger.error(f"直接数据库连接失败: {direct_db_error}")
                        raise ValueError(
                            f"直接数据库连接失败: {source.id}, 错误: {str(direct_db_error)}"
                        )

        # 获取当前可用的表
        available_tables = con.execute("SHOW TABLES").fetchdf()
        available_table_names = (
            available_tables["name"].tolist() if not available_tables.empty else []
        )
        logger.info(f"当前DuckDB中的表: {available_tables.to_string()}")

        # 验证是否有数据源
        if not query_request.sources:
            raise HTTPException(
                status_code=422, detail="查询请求必须包含至少一个数据源"
            )

        # 构建查询 - 确保表名使用双引号括起来
        if len(query_request.joins) > 0:
            # 多表JOIN查询 - 使用改进的多表JOIN支持
            query = build_multi_table_join_query(query_request, con)
        else:
            # 单表查询 - 使用build_single_table_query来处理表名
            query = build_single_table_query(query_request)

            # 验证表是否存在（从查询中提取实际表名）
            import re

            table_match = re.search(r'FROM "([^"]+)"', query)
            if table_match:
                actual_table_name = table_match.group(1)
                if actual_table_name not in available_table_names:
                    error_msg = f"无法执行查询，表 '{actual_table_name}' 不存在。可用的表: {', '.join(available_table_names)}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)

        # 根据is_preview标志决定是否添加LIMIT
        if query_request.is_preview:
            from core.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            query = ensure_query_has_limit(query, limit)
            logger.info(f"预览模式，已应用LIMIT {limit}")

        logger.info(f"执行查询: {query}")

        # 执行查询
        result_df = execute_query(query, con)
        logger.info(f"查询完成，结果形状: {result_df.shape}")

        # Replace NaN/inf with None, which is JSON serializable to null
        result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
        # 更彻底地将所有NaN转为None，防止JSON序列化报错
        result_df = result_df.astype(object).where(pd.notnull(result_df), None)

        # Convert non-serializable types to strings
        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        result = {
            "data": result_df.to_dict(orient="records"),
            "columns": result_df.columns.tolist(),
            "index": result_df.index.tolist(),
            "sql": query,  # 返回完整SQL
        }

        return jsonable_encoder(result)
    except HTTPException:
        # 重新抛出HTTPException，保持原始状态码
        raise
    except Exception as e:
        error_message = str(e)
        logger.error(f"查询失败: {error_message}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")

        # 使用统一的错误代码系统
        from core.error_codes import (
            analyze_error_type,
            create_error_response,
            get_http_status_code,
        )

        original_error = str(e)
        error_code = analyze_error_type(original_error)
        status_code = get_http_status_code(error_code)

        # 创建标准化的错误响应
        error_response = create_error_response(
            error_code=error_code,
            original_error=original_error,
            sql=getattr(query_request, "sql", None),
        )

        # 返回详细的错误响应
        raise HTTPException(status_code=status_code, detail=error_response)


@router.post("/api/execute_sql", tags=["Query"])
async def execute_sql(request: dict = Body(...)):
    """直接执行SQL查询语句，主要用于调试和验证数据源"""
    con = get_db_connection()
    sql_query = request.get("sql", "")
    datasource = request.get("datasource", {})
    is_preview = request.get("is_preview", True)  # 默认为预览模式

    try:
        # 如果是预览模式，则强制添加LIMIT
        if is_preview:
            from core.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            sql_query = ensure_query_has_limit(sql_query, limit)
            logger.info(f"预览模式，已应用LIMIT {limit} 到SQL: {sql_query}")

        logger.info(f"=== EXECUTE_SQL 函数开始执行 ===")
        logger.info(f"request type: {type(request)}, content: {request}")
        # 兼容 dict、Pydantic/BaseModel、FormData
        if isinstance(request, dict):
            sql_query = request.get("sql", "")
            datasource = request.get("datasource", {})
        else:
            sql_query = getattr(request, "sql", "")
            datasource = getattr(request, "datasource", {})
        logger.info(f"sql_query: {sql_query}, datasource: {datasource}")
        logger.info(
            f"datasource type: {getattr(datasource, 'type', None) if not isinstance(datasource, dict) else datasource.get('type')}"
        )
        logger.info(
            f"datasource id: {getattr(datasource, 'id', None) if not isinstance(datasource, dict) else datasource.get('id')}"
        )
        logger.info(
            f"datasource params: {getattr(datasource, 'params', None) if not isinstance(datasource, dict) else datasource.get('params')}"
        )

        # 检查数据源类型判断
        datasource_type = (
            datasource.get("type") if isinstance(datasource, dict) else None
        )
        logger.info(f"检查数据源类型: {datasource_type}")
        logger.info(f"是否为字典: {isinstance(datasource, dict)}")
        logger.info(
            f"类型检查结果: {datasource_type in ['mysql', 'postgresql', 'sqlite', 'duckdb']}"
        )
        logger.info(
            f"完整条件判断: {isinstance(datasource, dict) and datasource.get('type') in ['mysql', 'postgresql', 'sqlite', 'duckdb']}"
        )
        # 支持 file 类型数据源
        if isinstance(datasource, dict) and datasource.get("type") == "file":
            # 支持多种参数格式
            if "params" in datasource and "path" in datasource["params"]:
                file_path = datasource["params"]["path"]
            elif "path" in datasource:
                file_path = datasource["path"]
            else:
                # 如果没有指定路径，尝试从temp_files目录查找
                filename = datasource.get("filename") or datasource.get("id", "")
                if filename:
                    temp_dir = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)), "temp_files"
                    )
                    file_path = os.path.join(temp_dir, filename)
                else:
                    raise ValueError("缺少文件路径参数")

            table_id = datasource.get("id", "temp_table")

            # 检查文件是否存在
            if not os.path.exists(file_path):
                raise ValueError(f"文件不存在: {file_path}")

            # 读取文件并注册到 DuckDB
            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            elif file_path.endswith((".xls", ".xlsx")):
                df = pd.read_excel(file_path)
            else:
                raise ValueError("不支持的文件类型")
            con.register(table_id, df)

        # 如果是数据库类型的数据源，需要先执行SQL获取数据，然后可选择保存到DuckDB
        elif isinstance(datasource, dict) and datasource.get("type") in [
            "mysql",
            "postgresql",
            "sqlite",
            "duckdb",
        ]:
            # 数据库类型的数据源需要用户提供自定义SQL查询
            if not sql_query.strip():
                raise HTTPException(
                    status_code=400,
                    detail="数据库类型的数据源需要提供自定义SQL查询语句",
                )

            # 使用数据库管理器执行查询
            from core.database_manager import db_manager

            datasource_id = datasource.get("id")
            if not datasource_id:
                raise HTTPException(status_code=400, detail="缺少数据源ID")

            # 确保数据库连接存在，如果不存在则创建
            try:
                existing_conn = db_manager.get_connection(datasource_id)
                if not existing_conn:
                    logger.info(f"连接 {datasource_id} 不存在，尝试创建...")
                    # 读取配置文件并创建连接
                    import json
                    from datetime import datetime
                    from models.query_models import DatabaseConnection, DataSourceType

                    config_path = os.path.join(
                        os.path.dirname(os.path.dirname(__file__)),
                        "config/mysql-configs.json",
                    )
                    with open(config_path, "r", encoding="utf-8") as f:
                        configs = json.load(f)

                    config = None
                    for cfg in configs:
                        if cfg["id"] == datasource_id:
                            config = cfg
                            break

                    if not config:
                        raise HTTPException(
                            status_code=404, detail=f"未找到数据源配置: {datasource_id}"
                        )

                    # 创建连接
                    db_connection = DatabaseConnection(
                        id=config["id"],
                        name=config.get("name", config["id"]),
                        type=DataSourceType.MYSQL,
                        params=config["params"],
                        created_at=get_current_time(),
                    )

                    success = db_manager.add_connection(db_connection)
                    if not success:
                        raise HTTPException(
                            status_code=500,
                            detail=f"创建数据库连接失败: {datasource_id}",
                        )

                    logger.info(f"成功创建数据库连接: {datasource_id}")

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"创建数据库连接失败: {str(e)}")
                raise HTTPException(status_code=500, detail=f"数据库连接失败: {str(e)}")

            # 在原始数据库上执行SQL查询
            try:
                logger.info(
                    f"开始执行数据库查询: datasource_id={datasource_id}, sql={sql_query}"
                )
                result_df = db_manager.execute_query(datasource_id, sql_query)
                logger.info(f"数据库查询执行完成，结果形状: {result_df.shape}")

                # 处理数据类型和编码问题
                result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
                result_df = result_df.astype(object).where(pd.notnull(result_df), None)

                # 处理编码问题：安全地转换为字符串
                for col in result_df.columns:
                    if result_df[col].dtype == "object":
                        # 安全地处理可能的编码问题
                        def safe_str_convert(x):
                            if x is None or pd.isna(x):
                                return None
                            try:
                                if isinstance(x, bytes):
                                    # 尝试多种编码方式
                                    for encoding in [
                                        "utf-8",
                                        "gbk",
                                        "gb2312",
                                        "latin1",
                                    ]:
                                        try:
                                            return x.decode(encoding)
                                        except UnicodeDecodeError:
                                            continue
                                    # 如果所有编码都失败，使用错误处理
                                    return x.decode("utf-8", errors="replace")
                                else:
                                    return str(x)
                            except Exception:
                                return str(x) if x is not None else None

                        result_df[col] = result_df[col].apply(safe_str_convert)

                data_records = result_df.to_dict(orient="records")
                columns_list = [str(col) for col in result_df.columns.tolist()]

                logger.info(f"准备返回数据库查询结果，行数: {len(result_df)}")
                return {
                    "success": True,
                    "data": data_records,
                    "columns": columns_list,
                    "rowCount": len(result_df),
                    "source_type": "database",
                    "source_id": datasource_id,
                    "sql_query": sql_query,
                    "can_save_to_duckdb": True,  # 标识可以保存到DuckDB
                }

            except Exception as db_error:
                logger.error(f"数据库查询失败: {str(db_error)}")
                raise HTTPException(
                    status_code=500, detail=f"数据库查询失败: {str(db_error)}"
                )

        # 如果不是数据库类型，则在DuckDB中执行查询
        else:
            # 执行SQL查询
            result_df = execute_query(sql_query, con)
            logger.info(f"SQL查询执行完成，结果形状: {result_df.shape}")

            # Replace NaN/inf with None, which is JSON serializable to null
            result_df.replace([np.inf, -np.inf], np.nan, inplace=True)
            # 更彻底地将所有NaN转为None，防止JSON序列化报错
            result_df = result_df.astype(object).where(pd.notnull(result_df), None)

            # 将所有不可序列化的数据类型转换为字符串
            for col in result_df.columns:
                # 检查是否有不可序列化的对象类型列
                if result_df[col].dtype == "object":
                    # 将可能不可序列化的对象转换为字符串
                    result_df[col] = result_df[col].astype(str)

            # 使用to_dict方法，确保所有数据都是可JSON序列化的
            data_records = result_df.to_dict(orient="records")

            # 确保所有列名是字符串类型
            columns_list = [str(col) for col in result_df.columns.tolist()]

            # 返回结果 - 只使用简单的数据结构
            result = {
                "success": True,
                "data": data_records,
                "columns": columns_list,
                "rowCount": len(result_df),
            }

            return result
    except Exception as e:
        logger.error(f"SQL执行失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"SQL执行失败: {str(e)}")


@router.post("/api/save_query_to_duckdb", tags=["Query"])
async def save_query_to_duckdb(request: dict = Body(...)):
    """将数据库查询结果保存到DuckDB作为新的数据源"""
    try:
        logger.info(f"保存查询到DuckDB请求: {request}")

        # 获取请求参数，支持多种格式，确保安全处理None值
        datasource = (
            request.get("datasource") or request.get("originalDatasource") or {}
        )
        sql_query = request.get("sql") or request.get("sqlQuery", "")
        table_alias = request.get("table_alias") or request.get("tableAlias", "")
        query_data = request.get("query_data")  # 直接传递的查询结果数据

        # 确保datasource是字典类型
        if not isinstance(datasource, dict):
            datasource = {}

        # 参数验证
        if not table_alias or not table_alias.strip():
            raise HTTPException(status_code=400, detail="请提供DuckDB表别名")

        if not sql_query or not sql_query.strip():
            raise HTTPException(status_code=400, detail="请提供SQL查询语句")

        # 验证数据源，提供默认值防止None错误
        datasource_id = datasource.get("id", "duckdb_internal")
        datasource_type = datasource.get("type", "duckdb")

        logger.info(
            f"解析参数: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
        )

        logger.info(
            f"开始保存查询结果: datasource_id={datasource_id}, datasource_type={datasource_type}, table_alias={table_alias}"
        )

        # 根据数据源类型处理
        result_df = None

        # 对于保存功能，始终重新执行SQL以确保数据完整性
        # 智能移除系统自动添加的LIMIT，保留用户原始的所有SQL逻辑
        logger.info("重新执行SQL以获取完整数据，智能处理LIMIT限制")

        # 判断数据源类型
        if datasource_type in ["mysql"] and datasource_id != "duckdb_internal":
            # 处理MySQL等外部数据库
            try:
                logger.info(f"执行外部数据库查询: {datasource_id}")
                from core.database_manager import db_manager

                # 确保数据库连接存在
                existing_conn = db_manager.get_connection(datasource_id)
                if not existing_conn:
                    logger.info(f"连接 {datasource_id} 不存在，尝试从配置创建...")
                    # 尝试从配置文件创建连接
                    import json
                    from datetime import datetime
                    from models.query_models import (
                        DatabaseConnection,
                        DataSourceType,
                    )

                    try:
                        # 使用新的数据源配置文件
                        config_path = os.path.join(
                            os.getenv(
                                "CONFIG_DIR",
                                os.path.join(
                                    os.path.dirname(os.path.dirname(__file__)),
                                    "..",
                                    "config",
                                ),
                            ),
                            "datasources.json",
                        )
                        if os.path.exists(config_path):
                            with open(config_path, "r", encoding="utf-8") as f:
                                config_data = json.load(f)
                                configs = config_data.get("database_sources", [])

                            config = None
                            for cfg in configs:
                                if cfg["id"] == datasource_id:
                                    config = cfg
                                    break

                            if config:
                                db_connection = DatabaseConnection(
                                    id=config["id"],
                                    name=config.get("name", config["id"]),
                                    type=DataSourceType.MYSQL,
                                    params=config["params"],
                                    created_at=get_current_time(),
                                )
                                db_manager.add_connection(db_connection)
                                logger.info(f"成功创建数据库连接: {datasource_id}")
                            else:
                                raise Exception(f"未找到数据源配置: {datasource_id}")
                        else:
                            raise Exception(f"配置文件不存在: {config_path}")

                    except Exception as config_error:
                        logger.error(f"创建数据库连接失败: {str(config_error)}")
                        raise Exception(f"数据库连接失败: {str(config_error)}")

                # 智能清理SQL，移除系统自动添加的LIMIT，保留所有用户条件
                clean_sql = remove_auto_added_limit(sql_query)
                if clean_sql != sql_query.strip():
                    logger.info(
                        f"MySQL查询移除了系统自动添加的LIMIT: {sql_query} -> {clean_sql}"
                    )

                # 执行查询获取完整数据（保留所有WHERE条件和用户逻辑）
                result_df = db_manager.execute_query(datasource_id, clean_sql)
                logger.info(f"外部数据库查询执行完成，结果形状: {result_df.shape}")

            except Exception as db_error:
                logger.error(f"外部数据库查询失败: {str(db_error)}")
                raise HTTPException(
                    status_code=500, detail=f"外部数据库查询失败: {str(db_error)}"
                )
        else:
            # 处理DuckDB内部查询
            try:
                con = get_db_connection()

                # 智能清理SQL：移除系统自动添加的LIMIT，保留所有用户条件和逻辑
                clean_sql = sql_query.strip()
                logger.info(f"原始SQL: {clean_sql}")

                # 智能检测并移除系统自动添加的LIMIT（保留用户原始LIMIT和所有WHERE/JOIN/ORDER BY等条件）
                clean_sql = remove_auto_added_limit(clean_sql)

                if clean_sql != sql_query.strip():
                    logger.info(
                        f"DuckDB查询移除了系统自动添加的LIMIT，保留所有用户条件: {clean_sql}"
                    )
                else:
                    logger.info(f"SQL无需清理或包含用户原始LIMIT: {clean_sql}")

                logger.info(f"在DuckDB中执行完整查询: {clean_sql}")
                result_df = execute_query(clean_sql, con)
                logger.info(f"DuckDB查询执行完成，结果形状: {result_df.shape}")

            except Exception as duckdb_error:
                logger.error(f"DuckDB查询失败: {str(duckdb_error)}")
                raise HTTPException(
                    status_code=500, detail=f"DuckDB查询失败: {str(duckdb_error)}"
                )

        # 删除原来的重复处理逻辑
        if False:  # 禁用原来的逻辑
            if datasource_type not in ["duckdb"] and datasource_id != "duckdb_internal":
                try:
                    logger.info(f"尝试外部数据库查询: {datasource_id}")
                    from core.database_manager import db_manager

                    # 确保数据库连接存在
                    existing_conn = db_manager.get_connection(datasource_id)
                    if not existing_conn:
                        logger.info(f"连接 {datasource_id} 不存在，尝试从配置创建...")
                        # 尝试从配置文件创建连接
                        import json
                        from datetime import datetime
                        from models.query_models import (
                            DatabaseConnection,
                            DataSourceType,
                        )

                        try:
                            config_path = os.path.join(
                                os.path.dirname(os.path.dirname(__file__)),
                                "config/mysql-configs.json",
                            )
                            if os.path.exists(config_path):
                                with open(config_path, "r", encoding="utf-8") as f:
                                    configs = json.load(f)

                                config = None
                                for cfg in configs:
                                    if cfg["id"] == datasource_id:
                                        config = cfg
                                        break

                                if config:
                                    db_connection = DatabaseConnection(
                                        id=config["id"],
                                        name=config.get("name", config["id"]),
                                        type=DataSourceType.MYSQL,
                                        params=config["params"],
                                        created_at=get_current_time(),
                                    )
                                    db_manager.add_connection(db_connection)
                                    logger.info(f"成功创建数据库连接: {datasource_id}")
                                else:
                                    raise Exception(
                                        f"未找到数据源配置: {datasource_id}"
                                    )
                            else:
                                raise Exception(f"配置文件不存在: {config_path}")

                        except Exception as config_error:
                            logger.error(f"创建数据库连接失败: {str(config_error)}")
                            raise Exception(f"数据库连接失败: {str(config_error)}")

                    # 执行查询获取数据
                    result_df = db_manager.execute_query(datasource_id, sql_query)
                    logger.info(
                        f"外部数据库查询执行完成，准备保存到DuckDB: {result_df.shape}"
                    )

                except Exception as db_error:
                    logger.error(f"数据库查询失败: {str(db_error)}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"查询执行失败: {str(duckdb_error)} | 外部数据库查询也失败: {str(db_error)}",
                    )
            else:
                raise HTTPException(
                    status_code=500, detail=f"DuckDB查询失败: {str(duckdb_error)}"
                )

        # 验证查询结果
        if result_df is None or result_df.empty:
            raise HTTPException(status_code=400, detail="查询结果为空，无法保存")

        # 获取DuckDB连接并创建持久化表
        try:
            con = get_db_connection()

            # 检查表名是否已存在
            existing_tables = con.execute("SHOW TABLES").fetchdf()
            existing_table_names = (
                existing_tables["name"].tolist() if not existing_tables.empty else []
            )

            if table_alias in existing_table_names:
                logger.warning(f"表 {table_alias} 已存在，将被覆盖")
                con.execute(f'DROP TABLE IF EXISTS "{table_alias}"')

            # 使用改进的函数创建表
            success = create_varchar_table_from_dataframe(table_alias, result_df, con)

            if not success:
                raise Exception("查询结果持久化到DuckDB失败")

            logger.info(f"数据已持久化保存到DuckDB表: {table_alias}")

            # 验证表是否成功创建
            try:
                verification_result = con.execute(
                    f'SELECT COUNT(*) as count FROM "{table_alias}"'
                ).fetchdf()
                actual_count = verification_result.iloc[0]["count"]
                logger.info(f"表 {table_alias} 验证成功，行数: {actual_count}")
            except Exception as verify_error:
                logger.warning(f"表验证失败: {str(verify_error)}")

            # 使用统一的时区配置
            try:
                from core.timezone_utils import get_current_time_iso
                from core.file_datasource_manager import file_datasource_manager

                file_info = {
                    "source_id": table_alias,
                    "filename": f"{table_alias}_query_result",
                    "file_path": f"query_result_{table_alias}",  # 虚拟路径，实际数据在DuckDB中
                    "file_type": "duckdb_table",
                    "created_at": get_current_time_iso(),  # 使用统一的时区配置
                    "columns": result_df.columns.tolist(),
                    "row_count": len(result_df),
                    "column_count": len(result_df.columns),
                    "source_sql": sql_query,
                    "source_datasource": datasource_id,
                }

                # 保存到文件数据源管理器
                file_datasource_manager.save_file_datasource(file_info)
                logger.info(f"已创建查询结果表的文件数据源配置: {table_alias}")

            except Exception as config_error:
                logger.warning(f"创建文件数据源配置失败: {str(config_error)}")

            return {
                "success": True,
                "message": f"查询结果已保存为DuckDB表: {table_alias}",
                "table_alias": table_alias,
                "row_count": len(result_df),
                "columns": result_df.columns.tolist(),
                "source_sql": sql_query,
                "source_datasource": datasource_id,
                "created_at": get_current_time_iso(),  # 使用统一的时区配置
                "datasource": {
                    "id": table_alias,
                    "name": table_alias,
                    "type": "duckdb",
                    "table_name": table_alias,
                    "row_count": len(result_df),
                    "column_count": len(result_df.columns),
                    "created_at": get_current_time_iso(),  # 使用统一的时区配置
                    "updated_at": get_current_time_iso(),  # 使用统一的时区配置
                },
            }

        except Exception as duckdb_error:
            logger.error(f"DuckDB操作失败: {str(duckdb_error)}")
            raise HTTPException(
                status_code=500, detail=f"DuckDB操作失败: {str(duckdb_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"保存到DuckDB失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"保存到DuckDB失败: {str(e)}")


@router.get("/api/duckdb_tables", tags=["Query"])
async def list_duckdb_tables():
    """列出DuckDB中的所有可用表"""
    try:
        con = get_db_connection()
        tables_df = con.execute("SHOW TABLES").fetchdf()

        # 获取文件数据源管理器实例
        from core.file_datasource_manager import file_datasource_manager

        file_datasources = file_datasource_manager.list_file_datasources()
        # 创建source_id到上传时间的映射（统一使用 created_at 字段）
        datasource_timestamps = {}
        for datasource in file_datasources:
            source_id = datasource.get("source_id")
            created_at = datasource.get("created_at")  # 只使用标准的 created_at 字段
            if source_id and created_at:
                datasource_timestamps[source_id] = created_at

        tables_info = []
        for _, row in tables_df.iterrows():
            table_name = row["name"]
            # 获取表的基本信息
            try:
                # 对表名进行引号包围以处理特殊字符
                quoted_table_name = f'"{table_name}"'
                count_result = con.execute(
                    f"SELECT COUNT(*) as count FROM {quoted_table_name}"
                ).fetchdf()
                row_count = count_result.iloc[0]["count"]

                columns_result = con.execute(f"DESCRIBE {quoted_table_name}").fetchdf()
                columns = columns_result["column_name"].tolist()

                # 获取创建时间（如果有的话）
                created_at = datasource_timestamps.get(table_name)

                tables_info.append(
                    {
                        "table_name": table_name,
                        "row_count": int(row_count),
                        "columns": columns,
                        "column_count": len(columns),
                        "created_at": created_at,
                    }
                )
            except Exception as e:
                logger.warning(f"获取表 {table_name} 信息失败: {str(e)}")
                tables_info.append(
                    {
                        "table_name": table_name,
                        "row_count": 0,
                        "columns": [],
                        "column_count": 0,
                        "error": str(e),
                    }
                )

        # 按创建时间倒序排序，没有创建时间的表排在最后
        tables_info.sort(
            key=lambda x: x.get("created_at") or "1900-01-01", reverse=True
        )

        return {
            "success": True,
            "tables": tables_info,
            "total_tables": len(tables_info),
        }

    except Exception as e:
        logger.error(f"获取DuckDB表列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表列表失败: {str(e)}")


@router.delete("/api/duckdb_tables/{table_name}", tags=["Query"])
async def delete_duckdb_table(table_name: str):
    """删除DuckDB中的指定表，同时删除对应的源文件"""
    try:
        con = get_db_connection()

        # 检查表是否存在
        tables_df = con.execute("SHOW TABLES").fetchdf()
        existing_tables = tables_df["name"].tolist() if not tables_df.empty else []

        if table_name not in existing_tables:
            raise HTTPException(status_code=404, detail=f"表 '{table_name}' 不存在")

        # 尝试查找并删除对应的源文件
        deleted_files = []
        try:
            # 查找可能的文件路径
            temp_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "temp_files"
            )

            # 可能的文件名模式
            possible_filenames = [
                f"{table_name}.csv",
                f"{table_name}.xlsx",
                f"{table_name}.xls",
                f"{table_name}.json",
                f"{table_name}.parquet",
                f"{table_name}.pq",
            ]

            # 查找并删除匹配的文件
            if os.path.exists(temp_dir):
                for filename in os.listdir(temp_dir):
                    # 检查文件名是否匹配表名（去掉扩展名）
                    file_base_name = os.path.splitext(filename)[0]
                    if file_base_name == table_name or filename in possible_filenames:
                        file_path = os.path.join(temp_dir, filename)
                        try:
                            os.remove(file_path)
                            deleted_files.append(filename)
                            logger.info(f"已删除源文件: {filename}")
                        except Exception as file_e:
                            logger.warning(f"删除源文件失败 {filename}: {str(file_e)}")

            # 从文件数据源配置中删除记录
            try:
                from core.file_datasource_manager import file_datasource_manager

                file_datasource_manager.remove_file_datasource(table_name)
            except Exception as config_e:
                logger.warning(f"删除文件数据源配置失败: {str(config_e)}")

        except Exception as cleanup_e:
            logger.warning(f"清理源文件时出错: {str(cleanup_e)}")

        # 删除DuckDB中的表或视图
        try:
            drop_query = f'DROP TABLE IF EXISTS "{table_name}"'
            con.execute(drop_query)
        except Exception as e:
            if "is of type View" in str(e):
                # 如果是视图，则删除视图
                drop_query = f'DROP VIEW IF EXISTS "{table_name}"'
                con.execute(drop_query)
            else:
                raise e

        logger.info(f"成功删除DuckDB表: {table_name}")

        # 构建返回消息
        message = f"表 '{table_name}' 已成功删除"
        if deleted_files:
            message += f"，同时删除了源文件: {', '.join(deleted_files)}"

        return {"success": True, "message": message, "deleted_files": deleted_files}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除DuckDB表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除表失败: {str(e)}")


# ==================== 集合操作API端点 ====================


# ==================== 集合操作API端点 ====================


@router.post("/api/set-operations/generate", tags=["Set Operations"])
async def generate_set_operation_query(request: SetOperationRequest):
    """
    生成集合操作SQL查询

    支持UNION, UNION ALL, EXCEPT, INTERSECT等集合操作
    支持BY NAME模式进行列名映射
    """
    try:
        config = request.config

        # 生成SQL查询
        sql = generate_set_operation_sql(config)

        # 估算结果行数
        con = get_db_connection()
        estimated_rows = estimate_set_operation_rows(config, con)

        # 构建元数据
        metadata = {
            "operation_type": config.operation_type,
            "table_count": len(config.tables),
            "use_by_name": config.use_by_name,
            "estimated_rows": estimated_rows,
            "tables": [
                {
                    "table_name": table.table_name,
                    "selected_columns": table.selected_columns,
                    "alias": table.alias,
                }
                for table in config.tables
            ],
        }

        return SetOperationResponse(
            success=True,
            sql=sql,
            errors=[],
            warnings=[],
            metadata=metadata if request.include_metadata else None,
            estimated_rows=estimated_rows,
        )

    except ValueError as e:
        logger.warning(f"集合操作查询生成失败: {str(e)}")
        return SetOperationResponse(
            success=False,
            sql=None,
            errors=[str(e)],
            warnings=[],
            metadata=None,
            estimated_rows=0,
        )
    except Exception as e:
        logger.error(f"集合操作查询生成失败: {str(e)}")
        return SetOperationResponse(
            success=False,
            sql=None,
            errors=[f"生成查询失败: {str(e)}"],
            warnings=[],
            metadata=None,
            estimated_rows=0,
        )


@router.post("/api/set-operations/preview", tags=["Set Operations"])
async def preview_set_operation(request: SetOperationRequest):
    """
    预览集合操作结果

    执行集合操作查询并返回前几行数据
    """
    try:
        config = request.config

        # 生成SQL查询
        sql = generate_set_operation_sql(config)

        # 添加LIMIT进行预览
        preview_sql = f"{sql} LIMIT 100"

        # 执行预览查询
        con = get_db_connection()
        result_df = con.execute(preview_sql).fetchdf()

        # 转换为字典列表
        preview_data = result_df.to_dict("records")

        # 获取总行数估算
        estimated_rows = estimate_set_operation_rows(config, con)

        return {
            "success": True,
            "data": preview_data,
            "row_count": len(preview_data),
            "estimated_total_rows": estimated_rows,
            "sql": preview_sql,
            "errors": [],
            "warnings": [],
        }

    except ValueError as e:
        logger.warning(f"集合操作预览失败: {str(e)}")
        return {
            "success": False,
            "data": None,
            "row_count": 0,
            "estimated_total_rows": 0,
            "sql": None,
            "errors": [str(e)],
            "warnings": [],
        }
    except Exception as e:
        logger.error(f"集合操作预览失败: {str(e)}")
        return {
            "success": False,
            "data": None,
            "row_count": 0,
            "estimated_total_rows": 0,
            "sql": None,
            "errors": [f"预览失败: {str(e)}"],
            "warnings": [],
        }


@router.post("/api/set-operations/validate", tags=["Set Operations"])
async def validate_set_operation(request: SetOperationRequest):
    """
    验证集合操作配置

    检查表是否存在、列是否兼容等
    """
    try:
        config = request.config
        con = get_db_connection()

        errors = []
        warnings = []

        # 检查所有表是否存在
        for table in config.tables:
            try:
                # 检查表是否存在
                check_sql = f'SELECT COUNT(*) FROM "{table.table_name}"'
                con.execute(check_sql).fetchone()
            except Exception as e:
                errors.append(f"表 {table.table_name} 不存在或无法访问: {str(e)}")

        # 检查列兼容性
        if not config.use_by_name:
            # 位置模式：检查列数量是否匹配
            if len(config.tables) >= 2:
                first_table = config.tables[0]
                first_columns = first_table.selected_columns or []

                for i, table in enumerate(config.tables[1:], 1):
                    table_columns = table.selected_columns or []
                    if len(first_columns) != len(table_columns):
                        errors.append(
                            f"表 {table.table_name} 的列数量({len(table_columns)}) "
                            f"与第一个表 {first_table.table_name} 的列数量({len(first_columns)})不匹配"
                        )

        # BY NAME模式验证
        if config.use_by_name:
            # DuckDB的BY NAME模式会自动按列名匹配，不需要手动列映射
            pass

        # 检查操作类型支持
        if config.use_by_name and config.operation_type not in [
            SetOperationType.UNION,
            SetOperationType.UNION_ALL,
        ]:
            errors.append("只有UNION和UNION ALL支持BY NAME模式")

        # 性能警告
        if len(config.tables) > 5:
            warnings.append("表数量较多，查询性能可能较慢")

        return {
            "success": len(errors) == 0,
            "is_valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "table_count": len(config.tables),
            "operation_type": config.operation_type,
            "use_by_name": config.use_by_name,
        }

    except Exception as e:
        logger.error(f"集合操作验证失败: {str(e)}")
        return {
            "success": False,
            "is_valid": False,
            "errors": [f"验证失败: {str(e)}"],
            "warnings": [],
            "table_count": 0,
            "operation_type": None,
            "use_by_name": False,
        }


@router.post("/api/set-operations/execute", tags=["Set Operations"])
async def execute_set_operation(request: SetOperationRequest):
    """
    执行集合操作查询

    执行完整的集合操作并返回结果
    """
    try:
        config = request.config

        # 生成SQL查询，根据模式决定是否应用子查询限制
        if request.preview or (not request.save_as_table):
            # 预览模式或默认执行：在子查询级别应用限制，避免大数据集内存问题
            from core.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            sql = generate_set_operation_sql(config, preview_limit=limit)
        else:
            # 保存到表模式：生成完整查询
            sql = generate_set_operation_sql(config)

        # 执行查询
        con = get_db_connection()

        if request.preview:
            # 预览模式：使用配置的max_query_rows限制
            from core.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            preview_sql = f"{sql} LIMIT {limit}"
            result_df = con.execute(preview_sql).fetchdf()

            # 转换为字典列表
            data = result_df.to_dict("records")

            # 获取列信息
            columns = [
                {"name": col, "type": str(result_df[col].dtype)}
                for col in result_df.columns
            ]

            return {
                "success": True,
                "data": data,
                "row_count": len(data),
                "column_count": len(columns),
                "columns": columns,
                "sql": sql,
                "sqlQuery": sql,  # 为前端兼容性
                "originalDatasource": {
                    "type": "set_operation",
                    "operation": config.operation_type,
                    "tables": [source.table_name for source in config.tables],
                },
                "isSetOperation": True,
                "setOperationConfig": config,
                "errors": [],
                "warnings": [],
            }
        elif request.save_as_table:
            # 保存到表模式：直接创建表，不使用fetchdf避免内存溢出
            table_name = request.save_as_table.strip()
            logger.info(f"开始保存集合操作结果到表: {table_name}")

            # 检查表名是否已存在
            existing_tables = con.execute("SHOW TABLES").fetchdf()
            existing_table_names = (
                existing_tables["name"].tolist() if not existing_tables.empty else []
            )

            if table_name in existing_table_names:
                logger.warning(f"表 {table_name} 已存在，将被替换")

            # 直接创建表，不使用fetchdf
            create_sql = f'CREATE OR REPLACE TABLE "{table_name}" AS ({sql})'
            logger.info(f"执行创建表SQL: {create_sql}")
            con.execute(create_sql)

            # 获取统计信息（不使用fetchdf）
            row_count_result = con.execute(
                f'SELECT COUNT(*) FROM "{table_name}"'
            ).fetchone()
            row_count = row_count_result[0] if row_count_result else 0

            # 获取列信息（使用LIMIT 1避免大数据集问题）
            sample_sql = f'SELECT * FROM "{table_name}" LIMIT 1'
            sample_df = con.execute(sample_sql).fetchdf()
            columns = [
                {"name": col, "type": str(sample_df[col].dtype)}
                for col in sample_df.columns
            ]

            logger.info(f"表 {table_name} 创建成功，行数: {row_count}")

            return {
                "success": True,
                "saved_table": table_name,
                "table_alias": table_name,  # 为前端兼容性
                "row_count": row_count,
                "column_count": len(columns),
                "columns": columns,
                "sql": sql,
                "sqlQuery": sql,  # 为前端兼容性
                "originalDatasource": {
                    "type": "set_operation",
                    "operation": config.operation_type,
                    "tables": [source.table_name for source in config.tables],
                },
                "isSetOperation": True,
                "setOperationConfig": config,
                "errors": [],
                "warnings": [],
                "message": f"集合操作结果已保存到表: {table_name}，共 {row_count:,} 行数据。",
            }
        else:
            # 默认行为：执行集合操作预览，使用配置的max_query_rows限制
            from core.config_manager import config_manager

            limit = config_manager.get_app_config().max_query_rows
            preview_sql = f"{sql} LIMIT {limit}"
            result_df = con.execute(preview_sql).fetchdf()

            # 转换为字典列表
            data = result_df.to_dict("records")

            # 获取列信息
            columns = [
                {"name": col, "type": str(result_df[col].dtype)}
                for col in result_df.columns
            ]

            return {
                "success": True,
                "data": data,
                "row_count": len(data),
                "column_count": len(columns),
                "columns": columns,
                "sql": sql,
                "sqlQuery": sql,  # 为前端兼容性
                "originalDatasource": {
                    "type": "set_operation",
                    "operation": config.operation_type,
                    "tables": [source.table_name for source in config.tables],
                },
                "isSetOperation": True,
                "setOperationConfig": config,
                "errors": [],
                "warnings": [],
            }

    except ValueError as e:
        logger.warning(f"集合操作执行失败: {str(e)}")
        return {
            "success": False,
            "data": None,
            "row_count": 0,
            "column_count": 0,
            "columns": [],
            "sql": None,
            "errors": [str(e)],
            "warnings": [],
        }
    except Exception as e:
        logger.error(f"集合操作执行失败: {str(e)}")
        return {
            "success": False,
            "data": None,
            "row_count": 0,
            "column_count": 0,
            "columns": [],
            "sql": None,
            "errors": [f"执行失败: {str(e)}"],
            "warnings": [],
        }


@router.post("/api/set-operations/simple-union", tags=["Set Operations"])
async def simple_union_operation(request: UnionOperationRequest):
    """
    简化的UNION操作

    提供简化的UNION操作接口，只需要表名列表
    """
    try:
        tables = request.tables
        operation_type = request.operation_type
        use_by_name = request.use_by_name
        column_mappings = request.column_mappings

        # 构建简化的配置
        table_configs = []
        for table_name in tables:
            table_config = {
                "table_name": table_name,
                "selected_columns": [],  # 使用所有列
                "alias": None,
            }

            # 如果有列映射，添加到配置中
            if use_by_name and column_mappings and table_name in column_mappings:
                table_config["column_mappings"] = column_mappings[table_name]

            table_configs.append(table_config)

        # 创建集合操作配置
        config = SetOperationConfig(
            operation_type=operation_type, tables=table_configs, use_by_name=use_by_name
        )

        # 生成SQL查询
        sql = generate_set_operation_sql(config)

        # 估算结果行数
        con = get_db_connection()
        estimated_rows = estimate_set_operation_rows(config, con)

        return {
            "success": True,
            "sql": sql,
            "estimated_rows": estimated_rows,
            "table_count": len(tables),
            "operation_type": operation_type,
            "use_by_name": use_by_name,
            "errors": [],
            "warnings": [],
        }

    except ValueError as e:
        logger.warning(f"简化UNION操作失败: {str(e)}")
        return {
            "success": False,
            "sql": None,
            "estimated_rows": 0,
            "table_count": 0,
            "operation_type": None,
            "use_by_name": False,
            "errors": [str(e)],
            "warnings": [],
        }
    except Exception as e:
        logger.error(f"简化UNION操作失败: {str(e)}")
        return {
            "success": False,
            "sql": None,
            "estimated_rows": 0,
            "table_count": 0,
            "operation_type": None,
            "use_by_name": False,
            "errors": [f"操作失败: {str(e)}"],
            "warnings": [],
        }


@router.post("/api/set-operations/export", tags=["Set Operations"])
async def export_set_operation(request: SetOperationExportRequest):
    """
    集合操作异步导出 - 使用DuckDB COPY命令

    支持Excel、CSV、Parquet格式，使用DuckDB COPY命令直接导出完整数据，
    避免内存限制问题。
    """
    import uuid
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    from core.task_manager import task_manager

    try:
        config = request.config
        export_format = request.format
        custom_filename = request.filename

        logger.info(
            f"开始集合操作导出: 格式={export_format}, 操作类型={config.operation_type}"
        )

        # 生成完整SQL（无LIMIT）
        sql = generate_set_operation_sql(config)
        logger.info(f"生成的完整SQL: {sql}")

        # 创建异步导出任务
        task_id = str(uuid.uuid4())

        # 生成文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if custom_filename:
            base_filename = custom_filename
        else:
            operation_name = config.operation_type.replace(" ", "_").lower()
            base_filename = f"set_operation_{operation_name}_{timestamp}"

        # 根据格式确定文件扩展名和DuckDB COPY格式
        if export_format == "csv":
            file_extension = "csv"
            copy_format = "CSV"
            copy_options = "HEADER"
        elif export_format == "parquet":
            file_extension = "parquet"
            copy_format = "PARQUET"
            copy_options = ""
        elif export_format == "excel":
            file_extension = "xlsx"
            copy_format = "CSV"  # 先导出为CSV，然后转换为Excel
            copy_options = "HEADER"
        else:
            raise ValueError(f"不支持的导出格式: {export_format}")

        # 构建文件路径
        filename = f"{base_filename}.{file_extension}"
        file_path = f"/app/exports/{filename}"

        # 创建任务记录
        task_info = {
            "task_id": task_id,
            "type": "set_operation_export",
            "status": "running",
            "created_at": datetime.now().isoformat(),
            "config": config.dict(),
            "format": export_format,
            "filename": filename,
            "file_path": file_path,
            "progress": 0,
            "message": "正在准备导出...",
        }

        # 注册任务
        task_manager.add_task(task_id, task_info)

        # 在后台线程中执行导出任务
        def export_task():
            try:
                # 更新任务状态
                task_manager.update_task(
                    task_id,
                    {
                        "status": "running",
                        "progress": 10,
                        "message": "正在连接数据库...",
                    },
                )

                # 获取数据库连接
                con = get_db_connection()

                # 更新任务状态
                task_manager.update_task(
                    task_id, {"progress": 30, "message": "正在执行查询..."}
                )

                if export_format == "excel":
                    # Excel需要特殊处理：先导出为CSV，然后转换为Excel
                    csv_path = file_path.replace(".xlsx", ".csv")
                    copy_sql = f"COPY ({sql}) TO '{csv_path}' (FORMAT {copy_format}, {copy_options})"

                    logger.info(f"执行CSV导出: {copy_sql}")
                    con.execute(copy_sql)

                    # 更新任务状态
                    task_manager.update_task(
                        task_id, {"progress": 70, "message": "正在转换为Excel格式..."}
                    )

                    # 将CSV转换为Excel
                    import pandas as pd

                    df = pd.read_csv(csv_path)
                    df.to_excel(file_path, index=False)

                    # 删除临时CSV文件
                    import os

                    os.remove(csv_path)

                else:
                    # 直接使用DuckDB COPY命令
                    copy_sql = f"COPY ({sql}) TO '{file_path}' (FORMAT {copy_format}, {copy_options})"

                    logger.info(f"执行导出: {copy_sql}")
                    con.execute(copy_sql)

                # 检查文件是否创建成功
                import os

                if not os.path.exists(file_path):
                    raise Exception("导出文件未创建")

                file_size = os.path.getsize(file_path)

                # 更新任务状态为完成
                task_manager.update_task(
                    task_id,
                    {
                        "status": "completed",
                        "progress": 100,
                        "message": f"导出完成，文件大小: {file_size / 1024 / 1024:.2f} MB",
                        "file_size": file_size,
                        "download_url": f"/api/async-tasks/{task_id}/download",
                    },
                )

                logger.info(f"集合操作导出完成: {filename}, 大小: {file_size} bytes")

            except Exception as e:
                logger.error(f"导出任务执行失败: {str(e)}")
                task_manager.update_task(
                    task_id,
                    {
                        "status": "failed",
                        "progress": 0,
                        "message": f"导出失败: {str(e)}",
                        "error": str(e),
                    },
                )

        # 在后台线程中执行导出任务
        executor = ThreadPoolExecutor(max_workers=1)
        executor.submit(export_task)

        return {
            "success": True,
            "task_id": task_id,
            "message": "导出任务已创建，请稍后查看异步任务列表",
            "filename": filename,
            "format": export_format,
        }

    except Exception as e:
        logger.error(f"集合操作导出失败: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "message": f"创建导出任务失败: {str(e)}",
        }
