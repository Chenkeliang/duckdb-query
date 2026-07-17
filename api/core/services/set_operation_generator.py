# pylint: disable=duplicate-code
"""Set-operation SQL generation."""

import logging
from typing import List, Optional, Set

from core.common.sql_identifiers import quote_identifier
from models.set_operation_models import (
    SetOperationConfig,
    SetOperationType,
    TableConfig,
)

logger = logging.getLogger(__name__)


def format_set_table_reference(
    table_name: str, attach_aliases: Optional[Set[str]] = None
) -> str:
    """联邦表名 alias.schema_table → \"alias\".\"table\"。"""
    if attach_aliases and "." in table_name:
        schema, table_part = table_name.split(".", 1)
        if schema in attach_aliases:
            safe_schema = schema.replace('"', '""')
            safe_table = table_part.replace('"', '""')
            return f'"{safe_schema}"."{safe_table}"'
    safe_name = table_name.replace('"', '""')
    return f'"{safe_name}"'


class SetOperationQueryGenerator:
    """集合操作查询生成器"""

    def __init__(self):
        """初始化集合操作查询生成器"""
        self.logger = logging.getLogger(__name__)

    def build_set_operation_query(
        self,
        config: SetOperationConfig,
        preview_limit: int = None,
        attach_aliases: Optional[Set[str]] = None,
    ) -> str:
        """
        构建集合操作查询

        Args:
            config: 集合操作配置
            preview_limit: 预览模式下每个表的行数限制

        Returns:
            str: 生成的 SQL 查询
        """
        try:
            operation_type = config.operation_type
            tables = config.tables
            use_by_name = config.use_by_name

            # 验证配置
            self._validate_config(config)

            # 生成各个子查询
            subqueries = []
            for table in tables:
                subquery = self._build_table_subquery(
                    table, use_by_name, preview_limit, attach_aliases
                )
                subqueries.append(f"({subquery})")

            # 组合集合操作查询
            if use_by_name and operation_type in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                operation = f"{operation_type.value} BY NAME"
            else:
                operation = operation_type.value

            set_query = f" {operation} ".join(subqueries)

            self.logger.info(
                f"Generated set operation query: {operation_type}, table count: {len(tables)}"
            )
            return set_query

        except Exception as e:
            self.logger.error(f"Failed to build set operation query: {str(e)}")
            raise ValueError(f"Failed to build set operation query: {str(e)}")

    def _build_table_subquery(
        self,
        table: TableConfig,
        use_by_name: bool,
        limit: int = None,
        attach_aliases: Optional[Set[str]] = None,
    ) -> str:
        """
        构建单表子查询

        Args:
            table: 表配置
            use_by_name: 是否使用BY NAME模式
            limit: 可选的行数限制

        Returns:
            str: 子查询 SQL
        """
        table_name = table.table_name
        selected_columns = table.selected_columns
        column_mappings = table.column_mappings
        alias = table.alias

        table_ref = format_set_table_reference(table_name, attach_aliases)
        if alias:
            table_ref += f' AS {quote_identifier(alias)}'

        if use_by_name:
            # BY NAME 模式：DuckDB 会自动按列名匹配，使用 SELECT * 即可
            columns_sql = "*"
        else:
            # 位置模式：使用选择的列
            if not selected_columns:
                columns_sql = "*"
            else:
                # 转义列名(旧实现漏了双引号转义,是注入面——统一走共享函数)
                columns_sql = ", ".join(
                    quote_identifier(col) for col in selected_columns
                )

        subquery = f"SELECT {columns_sql} FROM {table_ref}"

        # 如果提供了限制，添加LIMIT子句
        if limit is not None and limit > 0:
            subquery += f" LIMIT {limit}"

        return subquery

    def _validate_config(self, config: SetOperationConfig):
        """
        验证集合操作配置

        Args:
            config: 集合操作配置

        Raises:
            ValueError: 配置验证失败
        """
        operation_type = config.operation_type
        tables = config.tables
        use_by_name = config.use_by_name

        # 验证表数量
        if len(tables) < 2:
            raise ValueError("Set operation requires at least two tables")

        if len(tables) > 10:
            raise ValueError("Set operation supports a maximum of 10 tables")

        # 验证BY NAME模式
        if use_by_name:
            if operation_type not in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                raise ValueError("Only UNION and UNION ALL support BY NAME mode")

        # 验证列兼容性（非 BY NAME 模式）
        if not use_by_name:
            self._validate_column_compatibility(tables)

    def _validate_column_compatibility(self, tables: List[TableConfig]):
        """
        验证列兼容性（位置模式）

        Args:
            tables: 表配置列表

        Raises:
            ValueError: 列兼容性验证失败
        """
        if not tables:
            return

        first_table = tables[0]
        first_columns = first_table.selected_columns or []

        for i, table in enumerate(tables[1:], 1):
            table_columns = table.selected_columns or []

            if len(first_columns) != len(table_columns):
                raise ValueError(
                    f"Table {table.table_name} column count ({len(table_columns)}) "
                    f"does not match first table {first_table.table_name} column count ({len(first_columns)})"
                )

    def estimate_result_rows(
        self,
        config: SetOperationConfig,
        connection=None,
        attach_aliases: Optional[Set[str]] = None,
    ) -> int:
        """
        估算集合操作结果行数

        Args:
            config: 集合操作配置
            connection: DuckDB 连接（可选）

        Returns:
            int: 预估结果行数
        """
        try:
            if not connection:
                # 如果没有提供连接，返回粗略估算
                return self._rough_estimate_rows(config)

            operation_type = config.operation_type
            tables = config.tables

            if operation_type == SetOperationType.UNION:
                # UNION：去重后的行数，通常小于所有表行数之和
                total_rows = 0
                for table in tables:
                    ref = format_set_table_reference(
                        table.table_name, attach_aliases
                    )
                    count_sql = f"SELECT COUNT(*) FROM {ref}"
                    rows = connection.execute(count_sql).fetchone()[0]
                    total_rows += rows
                # 粗略估算：假设去重率为20%
                return int(total_rows * 0.8)

            elif operation_type == SetOperationType.UNION_ALL:
                # UNION ALL：所有表行数之和
                total_rows = 0
                for table in tables:
                    ref = format_set_table_reference(
                        table.table_name, attach_aliases
                    )
                    count_sql = f"SELECT COUNT(*) FROM {ref}"
                    rows = connection.execute(count_sql).fetchone()[0]
                    total_rows += rows
                return total_rows

            elif operation_type == SetOperationType.EXCEPT:
                # EXCEPT：第一个表减去其他表，结果行数通常较小
                if len(tables) >= 2:
                    first_ref = format_set_table_reference(
                        tables[0].table_name, attach_aliases
                    )
                    first_table_rows = connection.execute(
                        f"SELECT COUNT(*) FROM {first_ref}"
                    ).fetchone()[0]
                    # 粗略估算：假设差集为第一个表的 10%
                    return int(first_table_rows * 0.1)
                return 0

            elif operation_type == SetOperationType.INTERSECT:
                # INTERSECT：交集，结果行数通常最小
                if len(tables) >= 2:
                    first_ref = format_set_table_reference(
                        tables[0].table_name, attach_aliases
                    )
                    first_table_rows = connection.execute(
                        f"SELECT COUNT(*) FROM {first_ref}"
                    ).fetchone()[0]
                    # 粗略估算：假设交集为第一个表的 5%
                    return int(first_table_rows * 0.05)
                return 0

            else:
                return 0

        except Exception as e:
            self.logger.warning(f"Failed to estimate result row count: {str(e)}")
            return 0

    def _rough_estimate_rows(self, config: SetOperationConfig) -> int:
        """
        粗略估算行数（无数据库连接时）

        Args:
            config: 集合操作配置

        Returns:
            int: 粗略估算的行数
        """
        operation_type = config.operation_type
        table_count = len(config.tables)

        # 基于操作类型和表数量的粗略估算
        if operation_type == SetOperationType.UNION:
            return 1000 * table_count  # 假设每表 1000 行，去重后约 800 行/表
        elif operation_type == SetOperationType.UNION_ALL:
            return 1000 * table_count  # 假设每表 1000 行
        elif operation_type == SetOperationType.EXCEPT:
            return 100  # 差集通常较小
        elif operation_type == SetOperationType.INTERSECT:
            return 50  # 交集通常最小
        else:
            return 1000


# 全局集合操作查询生成器实例
set_operation_generator = SetOperationQueryGenerator()


def generate_set_operation_sql(
    config: SetOperationConfig,
    preview_limit: int = None,
    attach_aliases: Optional[Set[str]] = None,
) -> str:
    """
    生成集合操作 SQL 查询

    Args:
        config: 集合操作配置
        preview_limit: 预览模式下每个表的行数限制

    Returns:
        str: 生成的 SQL 查询
    """
    return set_operation_generator.build_set_operation_query(
        config, preview_limit, attach_aliases
    )


def estimate_set_operation_rows(
    config: SetOperationConfig,
    connection=None,
    attach_aliases: Optional[Set[str]] = None,
) -> int:
    """
    估算集合操作结果行数

    Args:
        config: 集合操作配置
        connection: DuckDB 连接（可选）

    Returns:
        int: 预估结果行数
    """
    return set_operation_generator.estimate_result_rows(
        config, connection, attach_aliases
    )
