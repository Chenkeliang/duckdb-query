import {
  Code,
  PlayArrow,
  TableChart,
  ViewList
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import {
  deleteDuckDBTableEnhanced,
  executeDuckDBSQL,
  getDuckDBTablesEnhanced,
  submitAsyncQuery,
} from "../services/apiClient";
import DuckDBManagementPage from "./DuckDBManager/DuckDBManagementPage";
import DuckDBSQLEditor from "./DuckDBSQLEditor";
import SQLTemplates from "./SQLTemplates";
import SQLValidator from "./SQLValidator";
import TreeTableView from "./TreeTableView";

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
  const [editorTheme, setEditorTheme] = useState("github-light");
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
          sqlQuery: queryToExecute, // 保存用户原始SQL用于导出
          originalSql: queryToExecute, // 显式保存原始SQL
          originalDatasource: { type: 'duckdb', id: 'duckdb' }, // 添加数据源信息
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
      // 处理详细的错误信息
      let errorMessage = err.message || "查询执行失败";

      // 如果有错误代码，显示更友好的错误信息
      if (err.code) {
        // 后端现在返回中文错误消息，直接使用即可
        errorMessage = err.message;

        // 如果有原始错误信息，添加到控制台日志
        if (err.details && err.details.original_error) {
          console.error('原始错误信息:', err.details.original_error);
        }

        // 如果有详细信息，添加到错误日志
        if (err.details) {
          console.error('错误详情:', err.details);
        }
      }

      setError(errorMessage);
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
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: "fit-content" }}>
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <TableChart sx={{ mr: 1, color: "primary.main" }} />
                    <Typography variant="h6">DuckDB表</Typography>
                  </Box>
                  <Button
                    size="small"
                    onClick={() => setTableManagerOpen(true)}
                    startIcon={<TableChart />}
                  >
                    管理
                  </Button>
                </Box>

                <Box sx={{
                  maxHeight: "70vh",
                  overflow: "auto",
                  minHeight: "200px"
                }}>
                  <TreeTableView
                    tables={duckdbTables}
                    onTableSelect={(table) => setSqlQuery(`SELECT * FROM "${table}" LIMIT 100`)}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                SQL查询执行器
              </Typography>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Tabs
                  value={activeTab}
                  onChange={(e, newValue) => setActiveTab(newValue)}
                >
                  <Tab icon={<Code />} label="SQL编辑器" />
                  <Tab icon={<ViewList />} label="查询模板" />
                </Tabs>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => sqlEditorRef.current?.formatSQL()}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '0.875rem',
                      px: 2.5,
                      py: 0.5,
                      borderRadius: 2,
                      borderColor: '#e0e0e0',
                      color: '#666',
                      height: '40px',
                      '&:hover': {
                        borderColor: '#1976d2',
                        color: '#1976d2',
                        backgroundColor: 'rgba(25, 118, 210, 0.04)'
                      }
                    }}
                  >
                    格式化SQL
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => sqlEditorRef.current?.toggleFullscreen()}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '0.875rem',
                      px: 2.5,
                      py: 0.5,
                      borderRadius: 2,
                      borderColor: '#e0e0e0',
                      color: '#666',
                      height: '40px',
                      '&:hover': {
                        borderColor: '#1976d2',
                        color: '#1976d2',
                        backgroundColor: 'rgba(25, 118, 210, 0.04)'
                      }
                    }}
                  >
                    全屏编辑
                  </Button>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select
                      value={editorTheme}
                      displayEmpty
                      onChange={(e) => setEditorTheme(e.target.value)}
                      sx={{ height: '40px' }}
                    >
                      <MenuItem value="dark">Dark</MenuItem>
                      <MenuItem value="github-light">GitHub Light</MenuItem>
                      <MenuItem value="solarized-light">Solarized Light</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              {activeTab === 0 && (
                <Box sx={{ mb: 4 }}>
                  <DuckDBSQLEditor
                    ref={sqlEditorRef} // Assign the ref
                    value={sqlQuery}
                    onChange={setSqlQuery}
                    tables={duckdbTables}
                    height="300px"
                    placeholder="输入您的 SQL 查询语句..."
                    theme={editorTheme}
                  />

                  <SQLValidator
                    sqlQuery={sqlQuery}
                    tables={duckdbTables}
                    onValidationChange={setValidationResult}
                  />
                </Box>
              )}

              {activeTab === 1 && (
                <Box sx={{ mb: 4 }}>
                  <SQLTemplates
                    onTemplateSelect={(template) => {
                      setSqlQuery(template);
                      setActiveTab(0);
                    }}
                    tables={duckdbTables}
                  />
                </Box>
              )}

              {/* 执行控制区域 */}
              <Box sx={{
                mb: 3,
                p: 3,
                backgroundColor: '#ffffff',
                borderRadius: 3,
                border: '1px solid #e1e5e9',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <Typography variant="subtitle1" sx={{
                  mb: 2,
                  fontWeight: 600,
                  color: '#2c3e50',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}>
                  <PlayArrow sx={{ fontSize: '1.2rem', color: '#1976d2' }} />
                  执行控制
                </Typography>

                <Grid container spacing={3}>
                  {/* 配置选项 */}
                  <Grid item xs={12} md={8}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                      <TextField
                        label="保存结果为表 (可选)"
                        value={saveAsTable}
                        onChange={(e) => setSaveAsTable(e.target.value)}
                        fullWidth
                        placeholder="例如: query_result"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            height: '48px',
                            borderRadius: 2,
                            backgroundColor: '#fafbfc'
                          }
                        }}
                      />
                      <FormControl fullWidth>
                        <InputLabel>输出格式</InputLabel>
                        <Select
                          value={format}
                          onChange={(e) => setFormat(e.target.value)}
                          label="输出格式"
                          sx={{
                            height: '48px',
                            borderRadius: 2,
                            backgroundColor: '#fafbfc'
                          }}
                        >
                          <MenuItem value="parquet">Parquet格式</MenuItem>
                          <MenuItem value="csv">CSV格式</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                  </Grid>

                  {/* 执行按钮 */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2.5,
                      height: '100%',
                      justifyContent: 'center'
                    }}>
                      <Button
                        variant="contained"
                        onClick={() => executeSQL()}
                        disabled={loading || !sqlQuery || !sqlQuery.trim()}
                        startIcon={
                          loading ? <CircularProgress size={20} color="inherit" /> : <PlayArrow />
                        }
                        fullWidth
                        sx={{
                          height: "48px",
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          borderRadius: 2,
                          background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                          boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
                            boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)'
                          },
                          '&:disabled': {
                            background: '#e0e0e0',
                            color: 'rgba(0,0,0,0.38)',
                            boxShadow: 'none'
                          }
                        }}
                      >
                        {loading ? '执行中...' : '执行预览'}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={executeAsyncSQL}
                        disabled={loading || !sqlQuery || !sqlQuery.trim()}
                        startIcon={<PlayArrow />}
                        fullWidth
                        sx={{
                          height: "48px",
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          borderRadius: 2,
                          borderColor: '#1976d2',
                          color: '#1976d2',
                          borderWidth: 2,
                          '&:hover': {
                            borderWidth: 2,
                            backgroundColor: 'rgba(25, 118, 210, 0.04)',
                            borderColor: '#1565c0'
                          },
                          '&:disabled': {
                            borderColor: '#e0e0e0',
                            color: 'rgba(0,0,0,0.38)'
                          }
                        }}
                      >
                        异步任务运行
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </Box>

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
        maxWidth="lg"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            maxHeight: '90vh',
            borderRadius: 2
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TableChart sx={{ color: 'primary.main' }} />
            <Typography variant="h5" component="h2" fontWeight="bold">
              DuckDB表管理
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 1 }}>
          <DuckDBManagementPage
            onDataSourceChange={() => {
              fetchDuckDBTables();
              if (onDataSourceSaved) {
                onDataSourceSaved();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setTableManagerOpen(false)}
            variant="contained"
            sx={{ borderRadius: 2 }}
          >
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EnhancedSQLExecutor;
