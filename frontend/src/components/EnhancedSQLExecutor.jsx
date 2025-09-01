import {
  Code,
  Delete,
  PlayArrow,
  TableChart,
  ViewList,
  Visibility,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import {
  deleteDuckDBTableEnhanced,
  executeDuckDBSQL,
  getDuckDBTablesEnhanced,
  submitAsyncQuery,
} from "../services/apiClient";
import DuckDBSQLEditor from "./DuckDBSQLEditor";
import SQLTemplates from "./SQLTemplates";
import SQLValidator from "./SQLValidator";

const EnhancedSQLExecutor = ({
  onResultsReceived,
  onDataSourceSaved,
  previewQuery = "",
  onPreviewQueryUsed,
}) => {
  const [sqlQuery, setSqlQuery] = useState("");
  const [saveAsTable, setSaveAsTable] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [duckdbTables, setDuckdbTables] = useState([]);
  const [tableManagerOpen, setTableManagerOpen] = useState(false);
  const [format, setFormat] = useState("parquet");
  const [activeTab, setActiveTab] = useState(0);
  const [validationResult, setValidationResult] = useState(null);
  const sqlEditorRef = useRef(null); // Create a ref for the editor component

  const fetchDuckDBTables = async () => {
    try {
      const response = await getDuckDBTablesEnhanced();
      let tableNames = response.tables
        ? response.tables.map((table) => table.table_name)
        : [];
      const tableInfoMap = {};
      if (response.tables) {
        response.tables.forEach((table) => {
          tableInfoMap[table.table_name] = table;
        });
      }
      tableNames.sort((a, b) => {
        const tableA = tableInfoMap[a];
        const tableB = tableInfoMap[b];
        const timeA =
          tableA && tableA.created_at
            ? new Date(tableA.created_at)
            : new Date(0);
        const timeB =
          tableB && tableB.created_at
            ? new Date(tableB.created_at)
            : new Date(0);
        return timeB - timeA;
      });
      setDuckdbTables(tableNames);
    } catch (err) {
      console.error("获取表列表失败:", err);
    }
  };

  useEffect(() => {
    fetchDuckDBTables();
  }, []);

  const executeSQL = async (customQuery = null) => {
    // Get the most up-to-date query directly from the editor component via the ref
    const queryToExecute =
      customQuery ||
      (sqlEditorRef.current ? sqlEditorRef.current.getValue() : sqlQuery);

    if (!queryToExecute || !queryToExecute.trim()) {
      setError("请输入SQL查询语句");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await executeDuckDBSQL(
        queryToExecute,
        saveAsTable || null,
      );

      if (response.success) {
        onResultsReceived({
          data: response.data,
          columns: response.columns,
          sqlQuery: queryToExecute, // Use the fetched query
          executionTime: response.execution_time,
          rowCount: response.row_count,
        });

        if (saveAsTable) {
          setSuccess(`查询执行成功，结果已保存为表: ${saveAsTable}`);
          fetchDuckDBTables();
          if (onDataSourceSaved) {
            onDataSourceSaved({
              id: saveAsTable,
              type: "duckdb",
              name: `DuckDB表: ${saveAsTable}`,
              row_count: response.row_count,
              columns: response.columns,
            });
          }
        } else {
          setSuccess("查询执行成功");
        }
      }
    } catch (err) {
      setError(err.message || "查询执行失败");
    } finally {
      setLoading(false);
    }
  };

  const executeAsyncSQL = async () => {
    // Get the most up-to-date query directly from the editor component
    const currentQuery = sqlEditorRef.current
      ? sqlEditorRef.current.getValue()
      : sqlQuery;

    if (!currentQuery || !currentQuery.trim()) {
      setError("请输入SQL查询语句");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await submitAsyncQuery(currentQuery, format);

      if (response.success) {
        setSuccess(
          `异步任务已提交，任务ID: ${response.task_id.substring(
            0,
            8,
          )}...。请前往"异步任务"页面查看进度。`,
        );
      } else {
        setError(response.message || "提交异步任务失败");
      }
    } catch (err) {
      setError(err.message || "提交异步任务失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTable = async (tableName) => {
    try {
      await deleteDuckDBTableEnhanced(tableName);
      setSuccess(`表 ${tableName} 已删除`);
      fetchDuckDBTables();
      if (onDataSourceSaved) {
        onDataSourceSaved();
      }
    } catch (err) {
      setError(`删除表失败: ${err.message}`);
    }
  };

  return (
    <Box>
      <Typography
        variant="h4"
        gutterBottom
        sx={{ fontWeight: 600, color: "#1976d2" }}
      >
        🚀 增强SQL执行器
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "fit-content" }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🗃️ DuckDB表
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle1">可用表</Typography>
                  <Button
                    size="small"
                    onClick={() => setTableManagerOpen(true)}
                    startIcon={<TableChart />}
                  >
                    管理
                  </Button>
                </Box>

                <Box sx={{ maxHeight: 300, overflow: "auto" }}>
                  {duckdbTables.map((table) => (
                    <Chip
                      key={table}
                      label={table}
                      size="small"
                      sx={{ m: 0.5 }}
                      onClick={() =>
                        setSqlQuery(`SELECT * FROM "${table}" LIMIT 100`)
                      }
                    />
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ⚡ SQL查询执行器
              </Typography>

              <Tabs
                value={activeTab}
                onChange={(e, newValue) => setActiveTab(newValue)}
                sx={{ mb: 2 }}
              >
                <Tab icon={<Code />} label="SQL编辑器" />
                <Tab icon={<ViewList />} label="查询模板" />
              </Tabs>

              {activeTab === 0 && (
                <Box>
                  <DuckDBSQLEditor
                    ref={sqlEditorRef} // Assign the ref
                    value={sqlQuery}
                    onChange={setSqlQuery}
                    tables={duckdbTables}
                    height="300px"
                    placeholder="输入您的 SQL 查询语句..."
                    theme={activeTab === 0 ? "light" : "dark"}
                  />

                  <SQLValidator
                    sqlQuery={sqlQuery}
                    tables={duckdbTables}
                    onValidationChange={setValidationResult}
                  />
                </Box>
              )}

              {activeTab === 1 && (
                <Box>
                  <SQLTemplates
                    onTemplateSelect={(template) => {
                      setSqlQuery(template);
                      setActiveTab(0);
                    }}
                    onTemplateExecute={(template) => {
                      executeSQL(template);
                      setActiveTab(0);
                    }}
                    tables={duckdbTables}
                  />
                </Box>
              )}

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="保存结果为表 (可选)"
                    value={saveAsTable}
                    onChange={(e) => setSaveAsTable(e.target.value)}
                    fullWidth
                    placeholder="例如: query_result"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Button
                    variant="contained"
                    onClick={() => executeSQL()} // Ensure it's called without args
                    disabled={loading || !sqlQuery || !sqlQuery.trim()}
                    startIcon={
                      loading ? <CircularProgress size={20} /> : <PlayArrow />
                    }
                    fullWidth
                    sx={{ height: "56px" }}
                  >
                    执行预览
                  </Button>
                </Grid>
              </Grid>

              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>输出格式</InputLabel>
                    <Select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      label="输出格式"
                    >
                      <MenuItem value="parquet">Parquet格式</MenuItem>
                      <MenuItem value="csv">CSV格式</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Button
                    variant="outlined"
                    onClick={executeAsyncSQL}
                    disabled={loading || !sqlQuery || !sqlQuery.trim()}
                    startIcon={<PlayArrow />}
                    fullWidth
                    sx={{ height: "56px" }}
                  >
                    作为异步任务运行
                  </Button>
                </Grid>
              </Grid>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {success && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {success}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog
        open={tableManagerOpen}
        onClose={() => setTableManagerOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>🗃️ DuckDB表管理</DialogTitle>
        <DialogContent>
          <List>
            {duckdbTables.map((table) => (
              <ListItem key={table}>
                <ListItemText primary={table} />
                <IconButton
                  onClick={() =>
                    setSqlQuery(`SELECT * FROM "${table}" LIMIT 100`)
                  }
                >
                  <Visibility />
                </IconButton>
                <IconButton
                  onClick={() => handleDeleteTable(table)}
                  color="error"
                >
                  <Delete />
                </IconButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTableManagerOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EnhancedSQLExecutor;
