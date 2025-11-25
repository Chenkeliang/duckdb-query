import {
  AutoFixHigh as AutoDetectIcon,
  Clear as ClearIcon,
  Preview as PreviewIcon
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import { ClipboardList, Save } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../contexts/ToastContext";
import {
  CardSurface,
  RoundedButton,
  RoundedSwitch,
  RoundedTextField,
  SectionHeader
} from "../common";

const DataPasteBoard = ({ onDataSourceSaved }) => {
  const { t } = useTranslation("common");
  const { showSuccess, showError } = useToast();
  const [pastedData, setPastedData] = useState("");
  const [parsedData, setParsedData] = useState(null);
  const [tableName, setTableName] = useState("");
  const [columnNames, setColumnNames] = useState([]);
  const [columnTypes, setColumnTypes] = useState([]);
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeader, setHasHeader] = useState(false);
  const [unifyAsString, setUnifyAsString] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 数据类型选项
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

  // 自动检测分隔符
  const detectDelimiter = text => {
    const delimiters = [",", "\t", "|", ";", " "];
    const lines = text
      .trim()
      .split("\n")
      .slice(0, 5); // 检查前5行

    let bestDelimiter = ",";
    let maxConsistency = 0;

    for (const delim of delimiters) {
      const columnCounts = lines.map(line => line.split(delim).length);
      const avgCount =
        columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
      const consistency =
        columnCounts.filter(count => count === Math.round(avgCount)).length /
        columnCounts.length;

      if (consistency > maxConsistency && avgCount > 1) {
        maxConsistency = consistency;
        bestDelimiter = delim;
      }
    }

    return bestDelimiter;
  };

  // 自动检测数据类型
  const detectDataType = values => {
    const nonEmptyValues = values.filter(v => v && v.toString().trim() !== "");
    if (nonEmptyValues.length === 0) return "VARCHAR";

    // 检查是否为整数
    const isInteger = nonEmptyValues.every(v =>
      /^\d+$/.test(v.toString().trim())
    );
    if (isInteger) return "INTEGER";

    // 检查是否为小数
    const isFloat = nonEmptyValues.every(v =>
      /^\d*\.?\d+$/.test(v.toString().trim())
    );
    if (isFloat) return "DOUBLE";

    // 检查是否为日期
    const isDate = nonEmptyValues.every(
      v => !isNaN(Date.parse(v.toString().trim()))
    );
    if (isDate) return "DATE";

    // 检查是否为布尔值
    const isBool = nonEmptyValues.every(v =>
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

  // 清理单元格数据（去除引号和空格）
  const cleanCellData = cell => {
    if (!cell) return "";

    let cleaned = cell.toString().trim();

    // 处理引号包裹的情况
    if (cleaned.length >= 2) {
      // 处理双引号包裹: "content"
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1);
      }
      // 处理单引号包裹: 'content'
      else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
        cleaned = cleaned.slice(1, -1);
      }
    }

    // 再次去除内部可能的首尾空格
    return cleaned.trim();
  };

  // 解析粘贴的数据
  const parseData = () => {
    if (!pastedData.trim()) {
      setError(t("page.datasource.paste.error.noData"));
      return;
    }

    try {
      setError("");

      // 自动检测分隔符
      const detectedDelimiter = detectDelimiter(pastedData);
      setDelimiter(detectedDelimiter);

      const lines = pastedData.trim().split("\n");
      const rows = lines.map(line => {
        const cells = line
          .split(detectedDelimiter)
          .map(cell => cleanCellData(cell));
        // 如果最后一个单元格是空的（由末尾逗号导致），则移除它
        if (cells.length > 1 && cells[cells.length - 1] === "") {
          cells.pop();
        }
        return cells;
      });

      if (rows.length === 0) {
        setError(t("page.datasource.paste.error.noValid"));
        return;
      }

      // 检查列数一致性（改进版）
      const columnCounts = rows.map(row => row.length);
      const uniqueColumnCounts = [...new Set(columnCounts)];

      // 如果有多种列数，选择最常见的作为标准
      let standardColumnCount;
      if (uniqueColumnCounts.length === 1) {
        standardColumnCount = uniqueColumnCounts[0];
      } else {
        // 找出最常见的列数
        const countFrequency = {};
        columnCounts.forEach(count => {
          countFrequency[count] = (countFrequency[count] || 0) + 1;
        });
        standardColumnCount = parseInt(
          Object.keys(countFrequency).reduce((a, b) =>
            countFrequency[a] > countFrequency[b] ? a : b
          )
        );

        // 过滤掉列数不一致的行，但给出警告
        const inconsistentRows = rows.filter(
          row => row.length !== standardColumnCount
        );
        if (inconsistentRows.length > 0) {
          // 只保留列数一致的行
          const filteredRows = rows.filter(
            row => row.length === standardColumnCount
          );
          if (filteredRows.length === 0) {
            setError(t("page.datasource.paste.error.noConsistent"));
            return;
          }
          rows.splice(0, rows.length, ...filteredRows);
        }
      }

      const columnCount = standardColumnCount;

      // 生成默认列名
      const defaultColumnNames = Array.from(
        { length: columnCount },
        (_, i) => `column_${i + 1}`
      );
      setColumnNames(defaultColumnNames);

      // 自动检测数据类型或统一为文本类型
      let detectedTypes;
      if (unifyAsString) {
        detectedTypes = Array.from({ length: columnCount }, () => "VARCHAR");
      } else {
        detectedTypes = Array.from({ length: columnCount }, (_, colIndex) => {
          const columnValues = rows.map(row => row[colIndex]);
          return detectDataType(columnValues);
        });
      }
      setColumnTypes(detectedTypes);

      // 生成更友好的默认表名
      const timestamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[:-]/g, "")
        .replace("T", "_");
      setTableName(t("page.datasource.paste.defaultName", { timestamp }));

      setParsedData({
        rows,
        columnCount,
        rowCount: rows.length
      });

      showSuccess(
        t("page.datasource.paste.parseSuccess", {
          rows: rows.length,
          cols: columnCount
        })
      );
    } catch (err) {
      showError(t("page.datasource.paste.parseFail", { message: err.message }));
    }
  };

  // 保存数据到DuckDB
  const saveToDatabase = async () => {
    if (!parsedData || !tableName.trim()) {
      showError(t("page.datasource.paste.save.needParse"));
      return;
    }

    if (columnNames.some(name => !name.trim())) {
      showError(t("page.datasource.paste.save.needColumns"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/paste-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          table_name: tableName.trim(),
          column_names: columnNames,
          column_types: columnTypes,
          data_rows: parsedData.rows,
          delimiter: delimiter,
          has_header: hasHeader
        })
      });

      const result = await response.json();

      if (result.success) {
        showSuccess(t("page.datasource.paste.save.saveOk", { table: tableName }));
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: tableName,
            name: tableName,
            sourceType: "duckdb",
            type: "table",
            columns: columnNames,
            columnCount: columnNames.length,
            createdAt: result.createdAt
          });
        }
        // 清空表单
        clearForm();
      } else {
        showError(result.error || t("page.datasource.paste.save.saveFail"));
      }
    } catch (err) {
      showError(
        t("page.datasource.paste.save.saveFailDetail", { message: err.message })
      );
    } finally {
      setLoading(false);
    }
  };

  // 清空表单
  const clearForm = () => {
    setPastedData("");
    setParsedData(null);
    setTableName("");
    setColumnNames([]);
    setColumnTypes([]);
    setError("");
    setSuccess("");
  };

  // 更新列名
  const updateColumnName = (index, value) => {
    const newNames = [...columnNames];
    newNames[index] = value;
    setColumnNames(newNames);
  };

  // 更新列类型
  const updateColumnType = (index, value) => {
    const newTypes = [...columnTypes];
    newTypes[index] = value;
    setColumnTypes(newTypes);
  };

  // 处理统一为文本类型的切换
  const handleUnifyAsStringChange = event => {
    const checked = event.target.checked;
    setUnifyAsString(checked);

    if (checked && columnTypes.length > 0) {
      // 将所有列类型设置为VARCHAR
      const newTypes = Array.from(
        { length: columnTypes.length },
        () => "VARCHAR"
      );
      setColumnTypes(newTypes);
    } else if (!checked && parsedData) {
      // 重新自动检测数据类型
      const detectedTypes = Array.from(
        { length: columnTypes.length },
        (_, colIndex) => {
          const columnValues = parsedData.rows.map(row => row[colIndex]);
          return detectDataType(columnValues);
        }
      );
      setColumnTypes(detectedTypes);
    }
  };

  return (
    <Box>
      <CardSurface
        padding={3}
        elevation
        sx={{ borderColor: "var(--dq-border-card)", mb: 3 }}
      >
        <SectionHeader
          title={t("page.datasource.paste.title")}
          subtitle={t("page.datasource.paste.subtitle")}
          icon={<ClipboardList size={18} color="var(--dq-accent-primary)" />}
        />

        {error && (
          <Alert
            severity="error"
            sx={{ mt: 2, mb: 2, borderRadius: "var(--dq-radius-card)" }}
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}

        {success && (
          <Alert
            severity="success"
            sx={{ mt: 2, mb: 2, borderRadius: "var(--dq-radius-card)" }}
            onClose={() => setSuccess("")}
          >
            {success}
          </Alert>
        )}

        <RoundedTextField
          multiline
          minRows={6}
          fullWidth
          value={pastedData}
          onChange={e => setPastedData(e.target.value)}
          placeholder={t("page.datasource.paste.placeholder")}
          InputProps={{
            sx: {
              borderStyle: "dashed",
              borderWidth: 2,
              borderColor: pastedData
                ? "var(--dq-border-card)"
                : "var(--dq-border-subtle)"
            }
          }}
          sx={{ mt: 3, mb: 2 }}
        />

        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <RoundedButton
            startIcon={<AutoDetectIcon fontSize="small" />}
            onClick={parseData}
            disabled={!pastedData.trim()}
          >
            {t("page.datasource.paste.btnParse")}
          </RoundedButton>

          <RoundedButton
            variant="outlined"
            startIcon={<ClearIcon fontSize="small" />}
            onClick={clearForm}
          >
            {t("page.datasource.paste.btnClear")}
          </RoundedButton>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel sx={{ color: "var(--dq-text-tertiary)" }}>
              {t("page.datasource.paste.delimiter")}
            </InputLabel>
            <Select
              value={delimiter}
              onChange={e => setDelimiter(e.target.value)}
              label={t("page.datasource.paste.delimiter")}
              sx={{
                borderRadius: "var(--dq-radius-card)",
                "& .MuiOutlinedInput-notchedOutline": {
                  borderColor: "var(--dq-border-subtle)"
                },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "var(--dq-border-card)"
                }
              }}
            >
              <MenuItem value=",">
                {t("page.datasource.paste.delimiterComma")}
              </MenuItem>
              <MenuItem value="\t">
                {t("page.datasource.paste.delimiterTab")}
              </MenuItem>
              <MenuItem value="|">
                {t("page.datasource.paste.delimiterPipe")}
              </MenuItem>
              <MenuItem value=";">
                {t("page.datasource.paste.delimiterSemicolon")}
              </MenuItem>
              <MenuItem value=" ">
                {t("page.datasource.paste.delimiterSpace")}
              </MenuItem>
            </Select>
          </FormControl>
        </Box>
      </CardSurface>

      {parsedData && (
        <CardSurface
          padding={3}
          elevation
          sx={{ borderColor: "var(--dq-border-card)", mb: 3 }}
        >
          <SectionHeader
            title={t("page.datasource.paste.previewTitle")}
            subtitle={t("page.datasource.paste.previewSubtitle")}
            icon={
              <PreviewIcon fontSize="small" color="var(--dq-accent-primary)" />
            }
          />

          <Grid container spacing={3} sx={{ mt: 2, mb: 3 }}>
            <Grid item xs={12} md={8}>
              <RoundedTextField
                fullWidth
                label={t("page.datasource.paste.tableName")}
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                placeholder={t("page.datasource.paste.tableNamePlaceholder")}
                required
                helperText={t("page.datasource.paste.tableNameHelper")}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  height: "100%"
                }}
              >
                <Chip
                  label={t("page.datasource.paste.rows", {
                    count: parsedData.rowCount
                  })}
                  sx={{
                    backgroundColor: "var(--dq-surface-card-active)",
                    color: "var(--dq-accent-primary)",
                    fontWeight: 600
                  }}
                />
                <Chip
                  label={t("page.datasource.paste.cols", {
                    count: parsedData.columnCount
                  })}
                  sx={{
                    backgroundColor: "var(--dq-surface-card-active)",
                    color: "var(--dq-accent-primary)",
                    fontWeight: 600
                  }}
                />
              </Box>
            </Grid>
          </Grid>

          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <RoundedSwitch
                  checked={unifyAsString}
                  onChange={handleUnifyAsStringChange}
                  size="small"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {t("page.datasource.paste.unifyAsString")}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--dq-text-tertiary)" }}
                  >
                    {t("page.datasource.paste.unifyAsStringDesc")}
                  </Typography>
                </Box>
              }
            />
          </Box>

          <Typography variant="subtitle1" gutterBottom>
            {t("page.datasource.paste.columnConfig")}
          </Typography>

          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            {columnNames.map((name, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <RoundedTextField
                    size="small"
                    label={t("page.datasource.paste.columnName", {
                      index: index + 1
                    })}
                    value={name}
                    onChange={e => updateColumnName(index, e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel>{t("page.datasource.paste.type")}</InputLabel>
                    <Select
                      value={columnTypes[index] || "VARCHAR"}
                      onChange={e => updateColumnType(index, e.target.value)}
                      label={t("page.datasource.paste.type")}
                      disabled={unifyAsString}
                      sx={{
                        borderRadius: "var(--dq-radius-card)",
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: "var(--dq-border-subtle)"
                        },
                        "&:hover .MuiOutlinedInput-notchedOutline": {
                          borderColor: "var(--dq-border-card)"
                        }
                      }}
                    >
                      {dataTypes.map(type => (
                        <MenuItem key={type.value} value={type.value}>
                          {type.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle1" gutterBottom>
            {t("page.datasource.paste.previewData")}
          </Typography>

          <CardSurface
            padding={0}
            sx={{
              borderColor: "var(--dq-border-subtle)",
              overflow: "hidden",
              mb: 2
            }}
          >
            <TableContainer component={Box} sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {columnNames.map((colName, index) => (
                      <TableCell key={index} sx={{ fontWeight: 600 }}>
                        {colName ||
                          t("page.datasource.paste.columnName", {
                            index: index + 1
                          })}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedData.rows.slice(0, 5).map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardSurface>

          <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
            <RoundedButton
              startIcon={<Save size={18} />}
              onClick={saveToDatabase}
              disabled={loading || !tableName.trim()}
              sx={{ minWidth: 180 }}
            >
              {loading
                ? t("page.datasource.paste.save.saving")
                : t("page.datasource.paste.save.saveBtn")}
            </RoundedButton>
          </Box>
        </CardSurface>
      )}
    </Box>
  );
};

export default DataPasteBoard;
