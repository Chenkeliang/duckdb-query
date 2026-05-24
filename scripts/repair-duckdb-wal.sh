#!/usr/bin/env bash
# 隔离损坏的 DuckDB WAL，便于后端重新启动后打开 main.db
# 用法: ./scripts/repair-duckdb-wal.sh [数据目录，默认 ./data/duckdb]

set -euo pipefail

DATA_DIR="${1:-./data/duckdb}"
MAIN_DB="${DATA_DIR}/main.db"
TS="$(date +%s)"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "目录不存在: $DATA_DIR" >&2
  exit 1
fi

echo "数据目录: $DATA_DIR"
echo "请先停止所有访问该目录的后端进程（Docker / uvicorn）。"

moved=0
for wal in "${MAIN_DB}.wal" "${MAIN_DB}.wal.backup"; do
  if [[ -f "$wal" ]]; then
    dest="${wal}.broken.${TS}"
    mv "$wal" "$dest"
    echo "已隔离: $wal -> $dest"
    moved=$((moved + 1))
  fi
done

if [[ $moved -eq 0 ]]; then
  echo "未发现 ${MAIN_DB}.wal，无需处理。"
else
  echo "完成。请重启后端: docker compose restart backend  或  ./quick-start.sh"
fi
