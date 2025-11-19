#!/usr/bin/env python3
"""Helper script to exercise the chunked upload API (streaming path).

Example:
    python scripts/test_chunked_upload_streaming.py --base-url http://127.0.0.1:8000 \
        --rows 500 --chunk-size 2048 --table-alias upload_demo

The FastAPI service (uvicorn main:app --reload) must be running before executing
this script.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from typing import Iterable, Tuple

import requests


def build_csv(rows: int) -> bytes:
    header = "id,value\n"
    body = "".join(f"{idx},{idx * 2}\n" for idx in range(rows))
    return (header + body).encode("utf-8")


def build_jsonl(rows: int) -> bytes:
    lines = [json.dumps({"id": idx, "value": idx * 2}) for idx in range(rows)]
    return ("\n".join(lines) + "\n").encode("utf-8")


def chunk_bytes(data: bytes, chunk_size: int) -> Iterable[Tuple[int, bytes]]:
    for chunk_number in range((len(data) + chunk_size - 1) // chunk_size):
        start = chunk_number * chunk_size
        yield chunk_number, data[start : start + chunk_size]


def post_json(method: str, url: str, **kwargs):
    resp = requests.request(method, url, **kwargs)
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="FastAPI service root URL")
    parser.add_argument("--rows", type=int, default=200, help="CSV rows to generate")
    parser.add_argument("--chunk-size", type=int, default=1024 * 32, help="Chunk size sent to the API (bytes)")
    parser.add_argument("--table-alias", default="stream_upload_demo", help="Desired table alias")
    parser.add_argument("--format", choices=["csv", "jsonl"], default="csv", help="Payload format")
    parser.add_argument("--cleanup", action="store_true", help="Delete the created table when done")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    if args.format == "jsonl":
        payload = build_jsonl(args.rows)
        file_name = "stream_upload.jsonl"
    else:
        payload = build_csv(args.rows)
        file_name = "stream_upload.csv"

    file_hash = hashlib.md5(payload).hexdigest()

    print(f"Generated {args.format.upper()} payload: {len(payload)} bytes, rows={args.rows}")

    init_resp = post_json(
        "POST",
        f"{base_url}/api/upload/init",
        data={
            "file_name": file_name,
            "file_size": str(len(payload)),
            "chunk_size": str(args.chunk_size),
            "file_hash": file_hash,
            "table_alias": args.table_alias,
        },
    )
    upload_id = init_resp["upload_id"]
    total_chunks = init_resp["total_chunks"]
    print(f"Upload session created: {upload_id} ({total_chunks} chunks)")

    for chunk_number, chunk in chunk_bytes(payload, args.chunk_size):
        files = {"chunk": (f"chunk_{chunk_number}", io.BytesIO(chunk))}
        data = {"upload_id": upload_id, "chunk_number": str(chunk_number)}
        resp = post_json("POST", f"{base_url}/api/upload/chunk", data=data, files=files)
        sys.stdout.write(
            f"\rUploaded chunk {chunk_number + 1}/{total_chunks} | progress={resp.get('progress', 0):5.1f}%"
        )
        sys.stdout.flush()
    print()

    complete_resp = post_json("POST", f"{base_url}/api/upload/complete", data={"upload_id": upload_id})
    file_info = complete_resp.get("file_info", {})
    table_name = file_info.get("source_id")
    print("Upload complete:")
    print(json.dumps(complete_resp, ensure_ascii=False, indent=2))

    if not table_name:
        print("Unable to determine created table name from response", file=sys.stderr)
        sys.exit(1)

    tables = post_json("GET", f"{base_url}/api/duckdb/tables")
    matched = next((t for t in tables.get("tables", []) if t.get("table_name") == table_name), None)
    if matched:
        print(f"Table '{table_name}' detected with row_count={matched.get('row_count')}")
    else:
        print(f"Warning: table '{table_name}' not found in /api/duckdb/tables response")

    if args.cleanup:
        del_resp = requests.delete(f"{base_url}/api/duckdb/tables/{table_name}")
        if del_resp.ok:
            print(f"Table '{table_name}' removed via DELETE /api/duckdb/tables/{table_name}")
        else:
            print(f"Warning: failed to delete table '{table_name}': {del_resp.status_code} {del_resp.text}")


if __name__ == "__main__":
    main()
