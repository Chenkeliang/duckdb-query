import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Paste-data import with tokenized UI (no legacy deps).
 * Reuses旧逻辑：智能分隔符检测、类型检测、预览、保存到 /api/paste-data。
 */
const DataPasteCard = ({ onDataSourceSaved }) => {
  const { t } = useTranslation("common");
  const [pastedData, setPastedData] = useState("");
  const [parsedData, setParsedData] = useState(null);
  const [tableName, setTableName] = useState("");
  const [columnNames, setColumnNames] = useState([]);
  const [columnTypes, setColumnTypes] = useState([]);
  const [delimiter, setDelimiter] = useState(",");
  const [format, setFormat] = useState("auto"); // auto | csv | json
  const [hasHeader, setHasHeader] = useState(false);
  const [unifyAsString, setUnifyAsString] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const dataTypes = useMemo(
    () => [
      { value: "VARCHAR", label: t("page.datasource.paste.types.text") },
      { value: "INTEGER", label: t("page.datasource.paste.types.int") },
      { value: "DOUBLE", label: t("page.datasource.paste.types.float") },
      { value: "DATE", label: t("page.datasource.paste.types.date") },
      { value: "BOOLEAN", label: t("page.datasource.paste.types.bool") }
    ],
    [t]
  );

  const detectDelimiter = text => {
    const delimiters = [",", "\t", "|", ";", " "];
    const lines = text
      .trim()
      .split("\n")
      .slice(0, 5);
    let best = ",";
    let maxScore = 0;
    delimiters.forEach(delim => {
      const counts = lines.map(line => line.split(delim).length);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const score =
        counts.filter(c => c === Math.round(avg)).length / counts.length;
      if (score > maxScore && avg > 1) {
        maxScore = score;
        best = delim;
      }
    });
    return best;
  };

  const detectDataType = values => {
    const nonEmpty = values.filter(v => v && v.toString().trim() !== "");
    if (nonEmpty.length === 0) return "VARCHAR";
    const isInteger = nonEmpty.every(v => /^\d+$/.test(v.toString().trim()));
    if (isInteger) return "INTEGER";
    const isFloat = nonEmpty.every(v =>
      /^\d*\.?\d+$/.test(v.toString().trim())
    );
    if (isFloat) return "DOUBLE";
    const isDate = nonEmpty.every(v => !isNaN(Date.parse(v.toString().trim())));
    if (isDate) return "DATE";
    const isBool = nonEmpty.every(v =>
      ["true", "false", "1", "0", "yes", "no"].includes(
        v
          .toString()
          .toLowerCase()
          .trim()
      )
    );
    if (isBool) return "BOOLEAN";
    return "VARCHAR";
  };

  const cleanCell = cell => {
    if (!cell) return "";
    let s = cell.toString().trim();
    if (s.length >= 2) {
      if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
      ) {
        s = s.slice(1, -1);
      }
    }
    return s.trim();
  };

  const parseData = () => {
    if (!pastedData.trim()) {
      setError(t("page.datasource.paste.error.noData"));
      return;
    }
    try {
      setError("");
      setSuccess("");

      let bodyRows = [];
      let colCount = 0;
      let inferredNames = [];
      let effectiveDelimiter = delimiter;
      let effectiveHasHeader = hasHeader;

      if (format === "json") {
        const raw = pastedData.trim();
        let json;
        try {
          // 尝试解析 JSON（数组或对象）
          json = JSON.parse(raw);
        } catch (err) {
          setError(
            t("page.datasource.paste.parseFail", { message: err.message })
          );
          return;
        }

        let rowsArray;
        if (Array.isArray(json)) {
          rowsArray = json;
        } else if (
          json &&
          typeof json === "object" &&
          Array.isArray(json.data)
        ) {
          rowsArray = json.data;
        } else {
          rowsArray = [json];
        }

        const columnSet = new Set();
        rowsArray.forEach(row => {
          if (row && typeof row === "object") {
            Object.keys(row).forEach(key => columnSet.add(key));
          }
        });
        inferredNames = Array.from(columnSet);
        if (!inferredNames.length) {
          setError(t("page.datasource.paste.error.noValid"));
          return;
        }
        bodyRows = rowsArray.map(row =>
          inferredNames.map(name =>
            row && Object.prototype.hasOwnProperty.call(row, name)
              ? cleanCell(row[name])
              : ""
          )
        );
        colCount = inferredNames.length;
        effectiveHasHeader = false;
      } else {
        // CSV / 自动检测
        const raw = pastedData.trim();
        const detected =
          format === "csv" ? delimiter || "," : detectDelimiter(raw);
        effectiveDelimiter = detected;
        setDelimiter(detected);

        const lines = raw.split("\n");
        const rows = lines.map(line => {
          const cells = line.split(detected).map(cleanCell);
          if (cells.length > 1 && cells[cells.length - 1] === "") cells.pop();
          return cells;
        });
        if (!rows.length) {
          setError(t("page.datasource.paste.error.noValid"));
          return;
        }
        const colCounts = rows.map(r => r.length);
        const freq = {};
        colCounts.forEach(c => {
          freq[c] = (freq[c] || 0) + 1;
        });
        const standard = Number(
          Object.keys(freq).reduce((a, b) => (freq[a] > freq[b] ? a : b))
        );
        const filtered = rows
          .map(r => r.slice(0, standard))
          .filter(r => r.length === standard);
        if (!filtered.length || standard < 1) {
          setError(t("page.datasource.paste.error.noConsistent"));
          return;
        }
        bodyRows = filtered;
        let headerRow = null;
        if (effectiveHasHeader) {
          headerRow = filtered[0];
          bodyRows = filtered.slice(1);
        }
        colCount = standard;
        inferredNames =
          headerRow && headerRow.length === colCount
            ? headerRow
            : Array.from({ length: colCount }, (_, i) =>
                t("page.datasource.paste.columnName", { index: i + 1 })
              );
      }

      const inferredTypes = Array.from({ length: colCount }, (_, colIdx) =>
        detectDataType(bodyRows.map(r => r[colIdx]))
      );
      const previewRows = bodyRows.slice(0, 5);
      setColumnNames(inferredNames);
      setColumnTypes(inferredTypes);
      setParsedData({
        rows: bodyRows,
        preview: previewRows,
        columns: colCount
      });
      if (!tableName) {
        const ts = Date.now();
        setTableName(t("page.datasource.paste.defaultName", { timestamp: ts }));
      }
      setSuccess(
        t("page.datasource.paste.parseSuccess", {
          rows: bodyRows.length,
          cols: colCount
        })
      );
    } catch (err) {
      setError(t("page.datasource.paste.parseFail", { message: err.message }));
    }
  };

  const saveToDatabase = async () => {
    if (!parsedData || !tableName.trim()) {
      setError(t("page.datasource.paste.save.needParse"));
      return;
    }
    if (columnNames.some(n => !n.trim())) {
      setError(t("page.datasource.paste.save.needColumns"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/paste-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_name: tableName.trim(),
          column_names: columnNames,
          column_types: columnTypes,
          data_rows: parsedData.rows,
          delimiter,
          has_header: hasHeader
        })
      });
      const result = await res.json();
      if (result.success) {
        setSuccess(
          t("page.datasource.paste.save.saveOk", { table: tableName.trim() })
        );
        onDataSourceSaved?.({
          id: tableName.trim(),
          name: tableName.trim(),
          sourceType: "duckdb",
          type: "table",
          columns: columnNames,
          columnCount: columnNames.length
        });
        clearForm();
      } else {
        setError(
          result.error ||
            result.message ||
            t("page.datasource.paste.save.saveFail")
        );
      }
    } catch (err) {
      setError(
        t("page.datasource.paste.save.saveFailDetail", {
          message: err.message || ""
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setPastedData("");
    setParsedData(null);
    setTableName("");
    setColumnNames([]);
    setColumnTypes([]);
    setError("");
    setSuccess("");
  };

  const updateColumnName = (idx, value) => {
    const next = [...columnNames];
    next[idx] = value;
    setColumnNames(next);
  };

  const updateColumnType = (idx, value) => {
    const next = [...columnTypes];
    next[idx] = value;
    setColumnTypes(next);
  };

  const toggleUnify = checked => {
    setUnifyAsString(checked);
    if (checked && columnTypes.length) {
      setColumnTypes(
        Array.from({ length: columnTypes.length }, () => "VARCHAR")
      );
    } else if (!checked && parsedData) {
      const inferred = Array.from({ length: columnTypes.length }, (_, colIdx) =>
        detectDataType(parsedData.rows.map(r => r[colIdx]))
      );
      setColumnTypes(inferred);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">
            {t("page.datasource.paste.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("page.datasource.paste.subtitle")}
          </p>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-error-border bg-error-bg px-3 py-2 text-sm text-error">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-3 rounded-lg border border-success-border bg-success-bg px-3 py-2 text-sm text-success">
            {success}
          </div>
        ) : null}

        <textarea
          className="mt-4 min-h-[180px] w-full rounded-xl border-2 border-dashed border-border-subtle bg-surface px-3 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none"
          value={pastedData}
          onChange={e => setPastedData(e.target.value)}
          placeholder={t("page.datasource.paste.placeholder")}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={parseData}
            disabled={!pastedData.trim()}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 shadow-sm"
          >
            {t("page.datasource.paste.btnParse")}
          </button>
          <button
            type="button"
            onClick={clearForm}
            className="px-3 py-2 rounded-md border border-border bg-surface text-sm text-foreground hover:bg-surface-hover"
          >
            {t("page.datasource.paste.btnClear")}
          </button>
          <label className="text-xs text-muted-foreground ml-2">
            {t("page.datasource.paste.format")}
          </label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground"
          >
            <option value="auto">
              {t("page.datasource.paste.formatAuto")}
            </option>
            <option value="csv">{t("page.datasource.paste.formatCsv")}</option>
            <option value="json">
              {t("page.datasource.paste.formatJson")}
            </option>
          </select>
          <label className="text-xs text-muted-foreground ml-2">
            {t("page.datasource.paste.delimiter")}
          </label>
          <select
            value={delimiter}
            onChange={e => setDelimiter(e.target.value)}
            className="h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground"
          >
            <option value=",">
              {t("page.datasource.paste.delimiterComma")}
            </option>
            <option value="\t">
              {t("page.datasource.paste.delimiterTab")}
            </option>
            <option value="|">
              {t("page.datasource.paste.delimiterPipe")}
            </option>
            <option value=";">
              {t("page.datasource.paste.delimiterSemicolon")}
            </option>
            <option value=" ">
              {t("page.datasource.paste.delimiterSpace")}
            </option>
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={e => setHasHeader(e.target.checked)}
              className="accent-primary"
            />
            {t("page.datasource.paste.sheetInfo.target", { table: "" }) ||
              t("page.datasource.tabPaste")}
          </label>
        </div>
      </div>

      {parsedData ? (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-dq-soft space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs text-muted-foreground">
                {t("page.datasource.paste.tableName")}
              </label>
              <input
                className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                placeholder={t("page.datasource.paste.tableNamePlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("page.datasource.paste.tableNameHelper")}
              </p>
            </div>
            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={unifyAsString}
                  onChange={e => toggleUnify(e.target.checked)}
                />
                {t("page.datasource.paste.unifyAsString")}
              </label>
              <p className="text-[11px] text-muted-foreground">
                {t("page.datasource.paste.unifyAsStringDesc")}
              </p>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border border-border-subtle">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover text-foreground">
                <tr>
                  {columnNames.map((name, idx) => (
                    <th key={idx} className="px-3 py-2 text-left">
                      <div className="space-y-1">
                        <input
                          className="w-full rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          value={name}
                          onChange={e => updateColumnName(idx, e.target.value)}
                        />
                        <select
                          className="w-full rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground"
                          value={columnTypes[idx] || "VARCHAR"}
                          onChange={e => updateColumnType(idx, e.target.value)}
                        >
                          {dataTypes.map(dt => (
                            <option key={dt.value} value={dt.value}>
                              {dt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-foreground">
                {parsedData.preview.map((row, rIdx) => (
                  <tr key={rIdx} className="border-t border-border-subtle">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3 py-2 text-muted-foreground"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveToDatabase}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 shadow-sm"
            >
              {loading
                ? t("page.datasource.paste.save.saving")
                : t("page.datasource.paste.save.saveBtn")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DataPasteCard;
