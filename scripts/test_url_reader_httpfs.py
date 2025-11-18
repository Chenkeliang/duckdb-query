#!/usr/bin/env python3
"""Simple helper to exercise /api/read_from_url with public datasets.

Usage:
    python scripts/test_url_reader_httpfs.py --base-url http://localhost:8000

The FastAPI server must be running locally (uvicorn main:app --reload) before
executing this script.
"""

import argparse
import json
from typing import Dict, Any, List

import requests


SAMPLES: List[Dict[str, Any]] = [
    {
        "url": "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv",
        "table_alias": "iris_http",
        "file_type": "csv",
        "options": {"header": True, "delimiter": ",", "encoding": "utf-8"},
    },
    {
        "url": "https://raw.githubusercontent.com/vega/vega-datasets/master/data/cars.json",
        "table_alias": "cars_json",
        "file_type": "json",
        "options": {},
    },
    {
        "url": "https://duckdb.org/data/prices.parquet",
        "table_alias": "prices_parquet",
        "file_type": "parquet",
        "options": {},
    },
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="FastAPI server base URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Request timeout in seconds",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    for sample in SAMPLES:
        payload = {
            "url": sample["url"],
            "table_alias": sample["table_alias"],
            "file_type": sample.get("file_type"),
            "encoding": sample.get("options", {}).get("encoding", "utf-8"),
            "delimiter": sample.get("options", {}).get("delimiter", ","),
            "header": sample.get("options", {}).get("header", True),
        }

        print(f"\nPosting {payload['url']} → table {payload['table_alias']} ...")
        resp = requests.post(
            f"{base_url}/api/read_from_url",
            json=payload,
            timeout=args.timeout,
        )
        try:
            resp.raise_for_status()
        except Exception:
            print("Request failed:", resp.status_code, resp.text)
            continue

        data = resp.json()
        print("Response:")
        print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
