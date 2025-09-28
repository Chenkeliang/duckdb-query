#!/usr/bin/env python3
"""
生成大规模测试数据用于DuckDB性能测试
A表: 500万条数据，20列
B表: 1000万条数据，30列
C表: 700万条数据，10列
"""

import pandas as pd
import numpy as np
import random
import time
import os
from datetime import datetime, timedelta


def generate_table_a(rows=5000000, cols=20):
    """生成A表数据：500万行，20列"""
    print(f"正在生成A表数据: {rows:,} 行, {cols} 列...")
    start_time = time.time()

    # 基础列
    data = {
        "id": range(1, rows + 1),
        "user_id": [f"user_{i:08d}" for i in range(1, rows + 1)],
        "order_id": [f"order_{i:010d}" for i in range(1, rows + 1)],
        "product_id": [f"prod_{random.randint(1, 10000):06d}" for _ in range(rows)],
        "category": [
            random.choice(["Electronics", "Clothing", "Books", "Home", "Sports"])
            for _ in range(rows)
        ],
        "price": [round(random.uniform(10.0, 1000.0), 2) for _ in range(rows)],
        "quantity": [random.randint(1, 10) for _ in range(rows)],
        "discount": [round(random.uniform(0.0, 0.3), 3) for _ in range(rows)],
        "total_amount": [0.0] * rows,  # 将在后面计算
        "order_date": [
            datetime.now() - timedelta(days=random.randint(0, 365)) for _ in range(rows)
        ],
        "status": [
            random.choice(["pending", "completed", "cancelled", "shipped"])
            for _ in range(rows)
        ],
        "payment_method": [
            random.choice(["credit_card", "debit_card", "paypal", "cash"])
            for _ in range(rows)
        ],
        "shipping_address": [
            f"Address_{random.randint(1, 100000):06d}" for _ in range(rows)
        ],
        "customer_rating": [random.randint(1, 5) for _ in range(rows)],
        "region": [
            random.choice(["North", "South", "East", "West", "Central"])
            for _ in range(rows)
        ],
        "sales_rep": [f"rep_{random.randint(1, 100):03d}" for _ in range(rows)],
        "promotion_code": [
            f"PROMO_{random.randint(1, 50):03d}" if random.random() < 0.3 else None
            for _ in range(rows)
        ],
        "return_flag": [random.choice([True, False]) for _ in range(rows)],
        "warranty_years": [random.randint(1, 5) for _ in range(rows)],
        "last_updated": [
            datetime.now() - timedelta(hours=random.randint(0, 8760))
            for _ in range(rows)
        ],
    }

    # 计算total_amount
    for i in range(rows):
        data["total_amount"][i] = round(
            data["price"][i] * data["quantity"][i] * (1 - data["discount"][i]), 2
        )

    df = pd.DataFrame(data)

    # 保存为CSV
    csv_file = "test/table_a.csv"
    print(f"保存A表到 {csv_file}...")
    df.to_csv(csv_file, index=False)

    # 保存为Parquet
    parquet_file = "test/table_a.parquet"
    print(f"保存A表到 {parquet_file}...")
    df.to_parquet(parquet_file, index=False)

    elapsed = time.time() - start_time
    print(f"A表生成完成，耗时: {elapsed:.2f}秒")
    print(f"A表大小: {os.path.getsize(csv_file) / 1024 / 1024:.1f}MB (CSV)")
    print(f"A表大小: {os.path.getsize(parquet_file) / 1024 / 1024:.1f}MB (Parquet)")

    return df


def generate_table_b(rows=10000000, cols=30):
    """生成B表数据：1000万行，30列"""
    print(f"正在生成B表数据: {rows:,} 行, {cols} 列...")
    start_time = time.time()

    # 基础列
    data = {
        "id": range(1, rows + 1),
        "customer_id": [f"cust_{i:08d}" for i in range(1, rows + 1)],
        "transaction_id": [f"txn_{i:012d}" for i in range(1, rows + 1)],
        "account_number": [
            f"ACC_{random.randint(100000, 999999):06d}" for _ in range(rows)
        ],
        "transaction_type": [
            random.choice(["deposit", "withdrawal", "transfer", "payment", "refund"])
            for _ in range(rows)
        ],
        "amount": [round(random.uniform(1.0, 10000.0), 2) for _ in range(rows)],
        "currency": [
            random.choice(["USD", "EUR", "GBP", "JPY", "CAD"]) for _ in range(rows)
        ],
        "exchange_rate": [round(random.uniform(0.5, 2.0), 4) for _ in range(rows)],
        "transaction_date": [
            datetime.now() - timedelta(days=random.randint(0, 730)) for _ in range(rows)
        ],
        "bank_code": [f"BANK_{random.randint(1, 50):03d}" for _ in range(rows)],
        "branch_code": [f"BR_{random.randint(1, 1000):04d}" for _ in range(rows)],
        "employee_id": [f"EMP_{random.randint(1, 500):04d}" for _ in range(rows)],
        "channel": [
            random.choice(["online", "mobile", "atm", "branch", "phone"])
            for _ in range(rows)
        ],
        "device_id": [f"DEV_{random.randint(1, 10000):06d}" for _ in range(rows)],
        "ip_address": [
            f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"
            for _ in range(rows)
        ],
        "location": [f"LOC_{random.randint(1, 1000):04d}" for _ in range(rows)],
        "risk_score": [round(random.uniform(0.0, 1.0), 3) for _ in range(rows)],
        "fraud_flag": [random.choice([True, False]) for _ in range(rows)],
        "processing_time": [random.randint(100, 5000) for _ in range(rows)],
        "status": [
            random.choice(["success", "failed", "pending", "cancelled"])
            for _ in range(rows)
        ],
        "error_code": [
            f"ERR_{random.randint(1, 100):03d}" if random.random() < 0.1 else None
            for _ in range(rows)
        ],
        "reference_number": [
            f"REF_{random.randint(100000, 999999):06d}" for _ in range(rows)
        ],
        "merchant_id": [f"MERCH_{random.randint(1, 1000):04d}" for _ in range(rows)],
        "merchant_category": [
            random.choice(["retail", "restaurant", "gas_station", "online", "grocery"])
            for _ in range(rows)
        ],
        "card_type": [
            random.choice(["visa", "mastercard", "amex", "discover"])
            for _ in range(rows)
        ],
        "card_last_four": [f"{random.randint(1000, 9999)}" for _ in range(rows)],
        "authorization_code": [
            f"AUTH_{random.randint(100000, 999999):06d}" for _ in range(rows)
        ],
        "settlement_date": [
            datetime.now() - timedelta(days=random.randint(0, 30)) for _ in range(rows)
        ],
        "fee_amount": [round(random.uniform(0.0, 50.0), 2) for _ in range(rows)],
        "tax_amount": [round(random.uniform(0.0, 100.0), 2) for _ in range(rows)],
        "net_amount": [0.0] * rows,  # 将在后面计算
    }

    # 计算net_amount
    for i in range(rows):
        data["net_amount"][i] = round(
            data["amount"][i] - data["fee_amount"][i] - data["tax_amount"][i], 2
        )

    df = pd.DataFrame(data)

    # 保存为CSV
    csv_file = "test/table_b.csv"
    print(f"保存B表到 {csv_file}...")
    df.to_csv(csv_file, index=False)

    # 保存为Parquet
    parquet_file = "test/table_b.parquet"
    print(f"保存B表到 {parquet_file}...")
    df.to_parquet(parquet_file, index=False)

    elapsed = time.time() - start_time
    print(f"B表生成完成，耗时: {elapsed:.2f}秒")
    print(f"B表大小: {os.path.getsize(csv_file) / 1024 / 1024:.1f}MB (CSV)")
    print(f"B表大小: {os.path.getsize(parquet_file) / 1024 / 1024:.1f}MB (Parquet)")

    return df


def generate_table_c(rows=7000000, cols=10):
    """生成C表数据：700万行，10列"""
    print(f"正在生成C表数据: {rows:,} 行, {cols} 列...")
    start_time = time.time()

    # 基础列
    data = {
        "id": range(1, rows + 1),
        "product_id": [f"prod_{random.randint(1, 10000):06d}" for _ in range(rows)],
        "product_name": [
            f"Product_{random.randint(1, 50000):06d}" for _ in range(rows)
        ],
        "brand": [
            random.choice(["Brand_A", "Brand_B", "Brand_C", "Brand_D", "Brand_E"])
            for _ in range(rows)
        ],
        "category": [
            random.choice(["Electronics", "Clothing", "Books", "Home", "Sports"])
            for _ in range(rows)
        ],
        "price": [round(random.uniform(5.0, 2000.0), 2) for _ in range(rows)],
        "stock_quantity": [random.randint(0, 1000) for _ in range(rows)],
        "supplier_id": [f"SUPP_{random.randint(1, 100):03d}" for _ in range(rows)],
        "created_date": [
            datetime.now() - timedelta(days=random.randint(0, 1095))
            for _ in range(rows)
        ],
        "is_active": [random.choice([True, False]) for _ in range(rows)],
    }

    df = pd.DataFrame(data)

    # 保存为CSV
    csv_file = "test/table_c.csv"
    print(f"保存C表到 {csv_file}...")
    df.to_csv(csv_file, index=False)

    # 保存为Parquet
    parquet_file = "test/table_c.parquet"
    print(f"保存C表到 {parquet_file}...")
    df.to_parquet(parquet_file, index=False)

    elapsed = time.time() - start_time
    print(f"C表生成完成，耗时: {elapsed:.2f}秒")
    print(f"C表大小: {os.path.getsize(csv_file) / 1024 / 1024:.1f}MB (CSV)")
    print(f"C表大小: {os.path.getsize(parquet_file) / 1024 / 1024:.1f}MB (Parquet)")

    return df


def main():
    """主函数"""
    print("=" * 60)
    print("DuckDB 大规模数据性能测试数据生成器")
    print("=" * 60)

    # 确保test目录存在
    os.makedirs("test", exist_ok=True)

    total_start = time.time()

    try:
        # 生成A表
        print("\n1. 生成A表 (500万行, 20列)")
        df_a = generate_table_a()

        # 生成B表
        print("\n2. 生成B表 (1000万行, 30列)")
        df_b = generate_table_b()

        # 生成C表
        print("\n3. 生成C表 (700万行, 10列)")
        df_c = generate_table_c()

        total_elapsed = time.time() - total_start

        print("\n" + "=" * 60)
        print("数据生成完成!")
        print("=" * 60)
        print(f"总耗时: {total_elapsed:.2f}秒")
        print(f"A表: {len(df_a):,} 行, {len(df_a.columns)} 列")
        print(f"B表: {len(df_b):,} 行, {len(df_b.columns)} 列")
        print(f"C表: {len(df_c):,} 行, {len(df_c.columns)} 列")

        # 计算总文件大小
        total_csv_size = 0
        total_parquet_size = 0
        for table in ["a", "b", "c"]:
            csv_file = f"test/table_{table}.csv"
            parquet_file = f"test/table_{table}.parquet"
            if os.path.exists(csv_file):
                total_csv_size += os.path.getsize(csv_file)
            if os.path.exists(parquet_file):
                total_parquet_size += os.path.getsize(parquet_file)

        print(f"总CSV文件大小: {total_csv_size / 1024 / 1024:.1f}MB")
        print(f"总Parquet文件大小: {total_parquet_size / 1024 / 1024:.1f}MB")

        print("\n生成的文件:")
        for table in ["a", "b", "c"]:
            csv_file = f"test/table_{table}.csv"
            parquet_file = f"test/table_{table}.parquet"
            if os.path.exists(csv_file):
                print(f"  - {csv_file}")
            if os.path.exists(parquet_file):
                print(f"  - {parquet_file}")

    except Exception as e:
        print(f"生成数据时出错: {e}")
        raise


if __name__ == "__main__":
    main()
