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
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import {
  Code,
  List,
  Play,
  Star,
  Table
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  deleteDuckDBTableEnhanced,
  executeDuckDBSQL,
  getDuckDBTablesEnhanced,
  submitAsyncQuery,
} from "../services/apiClient";
import DuckDBManagementPage from "./DuckDBManager/DuckDBManagementPage";
import DuckDBSQLEditor from "./DuckDBSQLEditor";
import AddSQLFavoriteDialog from "./SQLFavorites/AddSQLFavoriteDialog";
import SQLFavoritesManager from "./SQLFavorites/SQLFavoritesManager";
import SQLTemplates from "./SQLTemplates";
import SQLValidator from "./SQLValidator";
import TreeTableView from "./TreeTableView";

const getIsDarkMode = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

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
  const [isDarkMode, setIsDarkMode] = useState(getIsDarkMode);
  const [editorTheme, setEditorTheme] = useState(() => (getIsDarkMode() ? 'dark' : 'light'));
  const [success, setSuccess] = useState("");
  const [duckdbTables, setDuckdbTables] = useState([]);
  const [tableManagerOpen, setTableManagerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [validationResult, setValidationResult] = useState(null);
  const sqlEditorRef = useRef(null); // Create a ref for the editor component

  // 收藏相关状态
  const [addFavoriteDialogOpen, setAddFavoriteDialogOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sync = () => setIsDarkMode(getIsDarkMode());
    const handleThemeChange = (event) => {
      if (event?.detail && typeof event.detail.isDark === 'boolean') {
        setIsDarkMode(event.detail.isDark);
      } else {
        sync();
      }
    };

    window.addEventListener('duckquery-theme-change', handleThemeChange);

    let observer;
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(sync);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    sync();

    return () => {
      window.removeEventListener('duckquery-theme-change', handleThemeChange);
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const nextTheme = isDarkMode ? 'dark' : 'light';
    setEditorTheme((current) => (current === nextTheme ? current : nextTheme));
  }, [isDarkMode]);

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
        // 优先使用original_error，如果没有则使用message
        if (err.details && err.details.original_error) {
          errorMessage = err.details.original_error;
        } else {
          // 后端现在返回中文错误消息，直接使用即可
          errorMessage = err.message;
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
      const response = await submitAsyncQuery(currentQuery);

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

  // 处理收藏SQL
  const handleAddFavorite = () => {
    const currentQuery = sqlEditorRef.current ? sqlEditorRef.current.getValue() : sqlQuery;
    if (!currentQuery.trim()) {
      setError('请先输入SQL查询语句');
      return;
    }
    setAddFavoriteDialogOpen(true);
  };

  // 处理选择收藏的SQL
  const handleSelectFavorite = (favorite) => {
    // 先切换到SQL编辑器标签页
    setActiveTab(0);

    // 使用 setTimeout 确保编辑器已经渲染完成
    setTimeout(() => {
      if (sqlEditorRef.current && sqlEditorRef.current.setValue) {
        sqlEditorRef.current.setValue(favorite.sql);
      } else {
        setSqlQuery(favorite.sql);
      }
    }, 100);
  };

  return (
    <Box>
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card
            sx={{
              height: 'fit-content',
              backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'var(--dq-surface)',
              borderRadius: 3,
              border: isDarkMode ? '1px solid var(--dq-border)' : '1px solid rgba(15, 23, 42, 0.08)',
              boxShadow: isDarkMode ? 'var(--dq-shadow-soft)' : '0 16px 32px -24px rgba(15, 23, 42, 0.12)'
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ mb: 1 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Table size={20} color={isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)'} />
                    <Typography variant="h6" sx={{ fontWeight: 600, color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>
                      DuckDB表
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    onClick={() => setTableManagerOpen(true)}
                    startIcon={<Table size={16} />}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500,
                      borderRadius: 2,
                      px: 2,
                      border: isDarkMode ? '1px solid var(--dq-border)' : '1px solid rgba(15,23,42,0.12)',
                      backgroundColor: isDarkMode ? 'var(--dq-surface-alt)' : 'var(--dq-surface)',
                      color: isDarkMode ? 'var(--dq-text-secondary)' : 'var(--dq-text-secondary)',
                      '&:hover': {
                        borderColor: 'var(--dq-accent-100)',
                        color: 'var(--dq-accent-100)',
                        backgroundColor: isDarkMode ? 'rgba(240, 115, 53, 0.12)' : 'rgba(25,118,210,0.1)'
                      }
                    }}
                  >
                    管理
                  </Button>
                </Box>

                <Box
                  sx={{
                    maxHeight: '50vh',
                    overflow: 'auto',
                    minHeight: '200px'
                  }}
                >
                  <TreeTableView
                    tables={duckdbTables}
                    onTableSelect={(table) => setSqlQuery(`SELECT * FROM "${table}" LIMIT 10000`)}
                  />
                </Box>

                {/* SQL收藏区域 */}
                <Box sx={{ mt: 2.5, borderTop: isDarkMode ? '1px solid var(--dq-border-subtle)' : '1px solid rgba(15,23,42,0.08)', pt: 2 }}>
                  <SQLFavoritesManager
                    onSelectFavorite={handleSelectFavorite}
                    compact={true}
                    filterType="duckdb"
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card
            sx={{
              backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'var(--dq-surface)',
              borderRadius: 3,
              border: isDarkMode ? '1px solid var(--dq-border)' : '1px solid rgba(15, 23, 42, 0.08)',
              boxShadow: isDarkMode ? 'var(--dq-shadow-soft)' : '0 18px 36px -24px rgba(15, 23, 42, 0.12)'
            }}
          >
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>
                SQL查询执行器
              </Typography>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <Tabs
                  value={activeTab}
                  onChange={(e, newValue) => setActiveTab(newValue)}
                  sx={{
                    '& .MuiTab-root': {
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '1rem',
                      minHeight: 44,
                      color: isDarkMode ? 'var(--dq-text-tertiary)' : 'var(--dq-text-tertiary)',
                      '&.Mui-selected': {
                        color: isDarkMode ? 'var(--dq-text-primary)' : 'var(--dq-text-secondary)'
                      }
                    },
                    '& .MuiTabs-indicator': {
                      backgroundColor: 'var(--dq-accent-100)',
                      height: 2,
                      borderRadius: 1
                    }
                  }}
                >
                  <Tab icon={<Code size={16} />} iconPosition="start" label="SQL编辑器" />
                  <Tab icon={<List size={16} />} iconPosition="start" label="查询模板" />
                </Tabs>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleAddFavorite}
                    startIcon={<Star size={16} />}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '1rem',
                      px: 2.5,
                      py: 0.5,
                      borderRadius: 2,
                      borderColor: isDarkMode ? 'var(--dq-border-subtle)' : 'var(--dq-border-subtle)',
                      color: isDarkMode ? 'var(--dq-text-tertiary)' : '#666',
                      backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'transparent',
                      height: '40px',
                      '&:hover': {
                        borderColor: 'var(--dq-accent-100)',
                        color: 'var(--dq-accent-100)',
                        backgroundColor: isDarkMode ? 'rgba(240, 115, 53, 0.12)' : 'rgba(25, 118, 210, 0.08)'
                      }
                    }}
                  >
                    收藏SQL
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => sqlEditorRef.current?.formatSQL()}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 500,
                      fontSize: '1rem',
                      px: 2.5,
                      py: 0.5,
                      borderRadius: 2,
                      borderColor: isDarkMode ? 'var(--dq-border-subtle)' : 'var(--dq-border-subtle)',
                      color: isDarkMode ? 'var(--dq-text-tertiary)' : '#666',
                      backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'transparent',
                      height: '40px',
                      '&:hover': {
                        borderColor: 'var(--dq-accent-100)',
                        color: 'var(--dq-accent-100)',
                        backgroundColor: isDarkMode ? 'rgba(240, 115, 53, 0.12)' : 'rgba(25, 118, 210, 0.08)'
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
                      fontSize: '1rem',
                      px: 2.5,
                      py: 0.5,
                      borderRadius: 2,
                      borderColor: isDarkMode ? 'var(--dq-border-subtle)' : 'var(--dq-border-subtle)',
                      color: isDarkMode ? 'var(--dq-text-tertiary)' : '#666',
                      backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'transparent',
                      height: '40px',
                      '&:hover': {
                        borderColor: 'var(--dq-accent-100)',
                        color: 'var(--dq-accent-100)',
                        backgroundColor: isDarkMode ? 'rgba(240, 115, 53, 0.12)' : 'rgba(25, 118, 210, 0.08)'
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
                      MenuProps={{
                        slotProps: {
                          paper: {
                            className: `dq-theme ${isDarkMode ? 'dq-theme--dark' : 'dq-theme--light'}`
                          }
                        }
                      }}
                      sx={{
                        height: '40px',
                        color: isDarkMode ? 'var(--dq-text-secondary)' : undefined,
                        backgroundColor: isDarkMode ? 'var(--dq-surface)' : undefined,
                        borderRadius: 2,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: isDarkMode ? 'var(--dq-border-subtle)' : undefined
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'var(--dq-accent-100)'
                        },
                        '& .MuiSvgIcon-root': {
                          color: isDarkMode ? 'var(--dq-text-tertiary)' : undefined
                        }
                      }}
                    >
                      <MenuItem value="dark"
                        sx={{
                          backgroundColor: isDarkMode ? 'var(--dq-surface)' : undefined,
                          '&:hover': {
                            backgroundColor: isDarkMode ? 'var(--dq-surface-active)' : undefined
                          }
                        }}
                      >
                        Dark
                      </MenuItem>
                      <MenuItem value="light"
                        sx={{
                          backgroundColor: isDarkMode ? 'var(--dq-surface)' : undefined,
                          '&:hover': {
                            backgroundColor: isDarkMode ? 'var(--dq-surface-active)' : undefined
                          }
                        }}
                      >
                        Light
                      </MenuItem>
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
                    databaseType="DuckDB"
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
              <Box
                sx={{
                  mb: 3,
                  p: 3,
                  backgroundColor: isDarkMode ? 'var(--dq-surface-alt)' : 'var(--dq-surface)',
                  borderRadius: 3,
                  border: isDarkMode ? '1px solid var(--dq-border)' : '1px solid var(--dq-border-subtle)',
                  boxShadow: isDarkMode ? 'var(--dq-shadow-soft)' : '0 6px 18px -12px rgba(15, 23, 42, 0.12)'
                }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{
                    mb: 2,
                    fontWeight: 600,
                    color: isDarkMode ? 'var(--dq-text-primary)' : 'var(--dq-text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  <Play size={20} color={isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)'} />
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
                          '& .MuiInputLabel-root': {
                            color: isDarkMode ? 'var(--dq-text-secondary)' : undefined
                          },
                          '& .MuiOutlinedInput-root': {
                            height: '48px',
                            borderRadius: 2,
                            backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'var(--dq-surface-card-active)',
                            '& fieldset': {
                              borderColor: isDarkMode ? 'var(--dq-border-subtle)' : undefined
                            },
                            '&:hover fieldset': {
                              borderColor: 'var(--dq-accent-100)'
                            },
                            '& input': {
                              color: isDarkMode ? 'var(--dq-text-primary)' : undefined
                            }
                          },
                          '& .MuiFormHelperText-root': {
                            color: isDarkMode ? 'var(--dq-text-tertiary)' : undefined
                          }
                        }}
                      />
                    </Box>
                  </Grid>

                  {/* 执行按钮 */}
                  <Grid item xs={12} md={4}>
                    <Box sx={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 2,
                      height: '100%',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}>
                      <Button
                        variant="contained"
                        onClick={() => executeSQL()}
                        disabled={loading || !sqlQuery || !sqlQuery.trim() || (validationResult && validationResult.hasErrors)}
                        startIcon={
                          loading ? <CircularProgress size={20} color="inherit" /> : <Play size={16} />
                        }
                        fullWidth
                        sx={{
                          height: '48px',
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '1rem',
                          borderRadius: 2,
                          background: isDarkMode
                            ? 'linear-gradient(135deg, rgba(240, 115, 53, 0.95) 0%, rgba(235, 99, 32, 0.98) 100%)'
                            : 'linear-gradient(135deg, var(--dq-accent-primary) 0%, var(--dq-accent-primary) 100%)',
                          boxShadow: isDarkMode
                            ? '0 18px 40px -20px rgba(240, 115, 53, 0.65)'
                            : '0 4px 12px rgba(25, 118, 210, 0.3)',
                          '&:hover': {
                            background: isDarkMode
                              ? 'linear-gradient(135deg, rgba(240, 115, 53, 1) 0%, rgba(235, 99, 32, 1) 100%)'
                              : 'linear-gradient(135deg, var(--dq-accent-primary) 0%, var(--dq-accent-primary-strong) 100%)',
                            boxShadow: isDarkMode
                              ? '0 22px 44px -18px rgba(240, 115, 53, 0.75)'
                              : '0 6px 16px rgba(25, 118, 210, 0.4)'
                          },
                          '&:disabled': {
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'var(--dq-border-subtle)',
                            color: isDarkMode ? 'var(--dq-text-tertiary)' : 'rgba(0,0,0,0.38)',
                            boxShadow: 'none'
                          }
                        }}
                      >
                        {loading ? '执行中...' : '执行预览'}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={executeAsyncSQL}
                        disabled={loading || !sqlQuery || !sqlQuery.trim() || (validationResult && validationResult.hasErrors)}
                        startIcon={<Play size={16} />}
                        fullWidth
                        sx={{
                          height: '48px',
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '1rem',
                          borderRadius: 2,
                          borderColor: isDarkMode ? 'var(--dq-border)' : 'var(--dq-accent-primary)',
                          color: isDarkMode ? 'var(--dq-text-secondary)' : 'var(--dq-accent-primary)',
                          borderWidth: 2,
                          backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'transparent',
                          '&:hover': {
                            borderWidth: 2,
                            borderColor: 'var(--dq-accent-100)',
                            color: 'var(--dq-accent-100)',
                            backgroundColor: isDarkMode ? 'rgba(240, 115, 53, 0.12)' : 'rgba(25, 118, 210, 0.08)'
                          },
                          '&:disabled': {
                            borderColor: isDarkMode ? 'var(--dq-border-subtle)' : 'var(--dq-border-subtle)',
                            color: isDarkMode ? 'var(--dq-text-tertiary)' : 'rgba(0,0,0,0.38)'
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
        PaperProps={{
          sx: {
            maxHeight: '90vh',
            borderRadius: 3,
            backgroundColor: isDarkMode ? 'var(--dq-surface)' : undefined,
            border: isDarkMode ? '1px solid var(--dq-border)' : undefined,
            boxShadow: isDarkMode ? '0 28px 56px -28px rgba(15, 23, 42, 0.6)' : undefined
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Table size={20} color={isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)'} />
            <Typography variant="h5" component="h2" fontWeight="bold" sx={{ color: 'inherit' }}>
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
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              background: isDarkMode
                ? 'linear-gradient(135deg, rgba(240, 115, 53, 0.95) 0%, rgba(235, 99, 32, 0.98) 100%)'
                : undefined,
              '&:hover': {
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(240, 115, 53, 1) 0%, rgba(235, 99, 32, 1) 100%)'
                  : undefined
              }
            }}
          >
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* 添加收藏对话框 */}
      <AddSQLFavoriteDialog
        open={addFavoriteDialogOpen}
        onClose={() => setAddFavoriteDialogOpen(false)}
        sqlContent={sqlEditorRef.current ? sqlEditorRef.current.getValue() : sqlQuery}
        sqlType="duckdb"
        onSuccess={() => {
          // 触发收藏列表刷新
          window.dispatchEvent(new CustomEvent('sqlFavoritesUpdated'));
        }}
      />
    </Box>
  );
};

export default EnhancedSQLExecutor;
