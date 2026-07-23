"""重复列名去重必须在 columns / records / column_types 三处同口径(复审 P2)。

旧 bug:columns 去重为 [id, id_1],但 cursor_types/describe 仍是 [(id,..),(id,..)]——
前端按名建类型 Map 时 id_1 拿不到类型、第一个 id 被第二个覆盖,重名列格式/排序/图表类型全错。
"""
from core.common.utils import (
    dedupe_column_names,
    describe_query_column_types,
    records_from_cursor,
)
from core.database.duckdb_engine import fetch_query_records, with_duckdb_connection


def test_dedupe_column_names_stable_and_ordered():
    assert dedupe_column_names(["a", "b"]) == ["a", "b"]
    assert dedupe_column_names(["id", "id"]) == ["id", "id_1"]
    assert dedupe_column_names(["id", "id", "id"]) == ["id", "id_1", "id_2"]
    # 已存在 id_1 时不与生成名冲突,保序
    assert dedupe_column_names(["id", "id_1", "id"]) == ["id", "id_1", "id_2"]


def test_dedupe_column_names_case_insensitive_conflicts():
    """复审 P1:DuckDB 标识符大小写不敏感——id 与 ID 是同一列名(read_csv 静默改名、
    CREATE TABLE 直接报错)。冲突键按 ASCII 折叠判定,显示大小写保留。"""
    assert dedupe_column_names(["id", "ID"]) == ["id", "ID_1"]
    assert dedupe_column_names(["ID", "id", "Id"]) == ["ID", "id_1", "Id_2"]
    # 生成的后缀名也按折叠键避让已有名(ID_1 与 id_1 冲突)
    assert dedupe_column_names(["id", "id_1", "ID"]) == ["id", "id_1", "ID_2"]


def test_dedupe_column_names_ascii_fold_not_unicode():
    """复审(Unicode casefold):DuckDB 的标识符折叠是 ASCII 级——实测 ß/SS、Ä/ä、İ/i 均可
    共存建表,read_csv 也不改名;Python casefold()/lower() 是 Unicode 折叠,会把它们误判冲突
    并擅自改名。冲突键只折叠 A-Z。"""
    # Unicode 大小写对在 DuckDB 中是不同列 → 不改名
    assert dedupe_column_names(["ß", "SS"]) == ["ß", "SS"]
    assert dedupe_column_names(["ß", "ss"]) == ["ß", "ss"]
    assert dedupe_column_names(["Ä", "ä"]) == ["Ä", "ä"]
    # ASCII 大小写对仍是冲突
    assert dedupe_column_names(["STRASSE", "strasse"]) == ["STRASSE", "strasse_1"]


def test_fetch_query_records_dedupes_columns_and_types_in_sync():
    sql = "SELECT * FROM (VALUES (1, 'x')) AS t(id, id)"
    with with_duckdb_connection() as con:
        columns, records, cursor_types = fetch_query_records(con, sql)
    # 列名去重
    assert columns == ["id", "id_1"]
    # 记录保留两个值(不因同名 dict 键丢失)
    assert records == [{"id": 1, "id_1": "x"}]
    # 类型名字与去重后的 columns 位置对齐:id_1 拿得到自己的类型,id 不被覆盖
    type_names = [str(n) for n, _ in cursor_types]
    assert type_names == ["id", "id_1"]
    tmap = {str(n): str(t).upper() for n, t in cursor_types}
    assert "INT" in tmap["id"]         # 第一个 id 是整数
    assert "VARCHAR" in tmap["id_1"]   # 第二个 id(→id_1)是文本,未被覆盖


def test_describe_query_column_types_dedupes():
    sql = "SELECT * FROM (VALUES (1, 'x')) AS t(id, id)"
    with with_duckdb_connection() as con:
        types = describe_query_column_types(con, sql)
    names = [d["name"] for d in types]
    assert names == ["id", "id_1"]


def test_records_from_cursor_dedup_matches_columns():
    sql = "SELECT * FROM (VALUES (1, 2, 3)) AS t(id, id, id)"
    with with_duckdb_connection() as con:
        res = con.execute(sql)
        columns, records = records_from_cursor(res)
    assert columns == ["id", "id_1", "id_2"]
    assert records == [{"id": 1, "id_1": 2, "id_2": 3}]
