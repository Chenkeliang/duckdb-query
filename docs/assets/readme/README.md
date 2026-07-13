# README media provenance

These screenshots and GIF animations were captured on 2026-07-13 from frontend
source commit `0b495ce64c4537e5c8dc1c685295093055de725e`. The GIFs used the
installed DuckQuery v1.1.4 desktop backend. The two source-list screenshots used
a separate temporary backend with an isolated `APP_ROOT` / `CONFIG_DIR` and
exactly two disposable connections. All displayed records, names, paths, and
connection details belong to synthetic demo data.

## Demo data

### Local DuckDB table: `readme_demo_orders`

```text
order_id INTEGER
customer_id VARCHAR
order_date DATE
region VARCHAR
amount DOUBLE
status VARCHAR
```

The table contains 12 synthetic orders. Nine rows have `status = 'completed'`.

### MySQL: `duckquery_readme.customers`

```text
customer_id VARCHAR(8)
customer_name VARCHAR(80)
segment VARCHAR(24)
city VARCHAR(40)
```

The table contains six synthetic customers in the disposable
`duckquery-readme-mysql` container.

### SQLite: `regions`

```text
region VARCHAR(16)
manager VARCHAR(40)
```

The table contains four synthetic regions in
`/tmp/duckquery-readme-demo/regions.sqlite`.

## Verified SQL

The hero animations show this cross-source query, which returned nine rows:

```sql
SELECT
  o.order_id,
  c.customer_name,
  c.segment,
  o.region,
  o.amount
FROM readme_demo_orders AS o
JOIN mysql_readme_demo_mysql.customers AS c
  ON o.customer_id = c.customer_id
WHERE o.status = 'completed'
ORDER BY o.amount DESC;
```

The Chinese AI workflow animation executed this model-generated SQL:

```sql
SELECT
  region AS 区域,
  COUNT(*) AS 订单数,
  SUM(amount) AS 销售额
FROM readme_demo_orders
WHERE status = 'completed'
GROUP BY region
ORDER BY 销售额 DESC;
```

The English AI workflow animation executed this model-generated SQL:

```sql
SELECT
  region,
  COUNT(*) AS order_count,
  SUM(amount) AS sales_amount
FROM readme_demo_orders
WHERE status = 'completed'
GROUP BY region
ORDER BY sales_amount DESC;
```

Both queries returned four regions, with East highest at `5055.25`.

## AI workflow animations

The Chinese and English SQL drafts are actual responses from a working model
provider configured in DuckQuery. The provider name, model name, endpoint, and
credentials are intentionally omitted. Each GIF captures the real prompt,
model response, "Insert into editor" action, manual execution, and chart switch.
The unchanged provider wait between the initial spinner and response was
shortened; no model text, query result, or application state was synthesized.

## Files

| File | UI locale | Dimensions | Frames | Duration | Size |
|---|---|---:|---:|---:|---:|
| `hero-cross-source-zh.gif` | Chinese | 1200 × 750 | 58 | 5.8 s | 304,375 bytes |
| `sources-zh.webp` | Chinese | 1440 × 900 | 1 | — | 18,844 bytes |
| `workflow-ai-chart-zh.gif` | Chinese | 1200 × 750 | 100 | 10.0 s | 555,763 bytes |
| `hero-cross-source-en.gif` | English | 1200 × 750 | 58 | 5.8 s | 357,930 bytes |
| `sources-en.webp` | English | 1440 × 900 | 1 | — | 20,172 bytes |
| `workflow-ai-chart-en.gif` | English | 1200 × 750 | 99 | 9.9 s | 521,443 bytes |

The two `sources-*` images are light-theme, full-window captures of the
isolated backend's real connection list. The visible count `2`, MySQL online
state, and SQLite local state are unaltered; no saved user connection was loaded
or hidden. The GIFs capture the complete relevant workbench state at 10 FPS.
Unrelated local tables and connections were kept out of the animations by
collapsing the data-source panel; controls and results shown in the animations
were otherwise unaltered.
