import {
  Cancel as CancelIcon,
  Info as InfoIcon,
  Link as LinkIcon
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from "@mui/material";
import {
  FileText,
  FolderOpen,
  HardDrive,
  Lightbulb,
  RefreshCw,
  Upload
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  browseServerDirectory,
  getServerMounts,
  importServerFile,
  readFromUrl,
  uploadFile
} from "../../services/apiClient";
import ChunkedUploader from "../ChunkedUpload/ChunkedUploader";
import {
  CardSurface,
  RoundedButton,
  RoundedSwitch,
  RoundedTextField,
  SectionHeader
} from "../common";
import ExcelSheetSelector from "./ExcelSheetSelector";
import { useTranslation } from "react-i18next";

const DataUploadSection = ({ onDataSourceSaved, showNotification }) => {
  const { t } = useTranslation("common");
  const [activeTab, setActiveTab] = useState(0);
  // 本地文件上传状态
  const [selectedFile, setSelectedFile] = useState(null);
  const [useChunkedUpload, setUseChunkedUpload] = useState(false);
  const [autoDetectSize, setAutoDetectSize] = useState(true);
  const [uploadMode, setUploadMode] = useState("auto"); // 'auto', 'standard', 'chunked'
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // 表别名和其他状态
  const [tableAlias, setTableAlias] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  // 服务器目录导入状态
  const [serverMounts, setServerMounts] = useState([]);
  const [serverMountLoading, setServerMountLoading] = useState(false);
  const [selectedServerMount, setSelectedServerMount] = useState("");
  const [serverEntries, setServerEntries] = useState([]);
  const [serverBreadcrumbs, setServerBreadcrumbs] = useState([]);
  const [serverCurrentPath, setServerCurrentPath] = useState("");
  const [serverSelectedFile, setServerSelectedFile] = useState(null);
  const [serverAlias, setServerAlias] = useState("");
  const [serverBrowseError, setServerBrowseError] = useState("");
  const [serverBrowseLoading, setServerBrowseLoading] = useState(false);
  const [serverImportLoading, setServerImportLoading] = useState(false);

  const filteredServerEntries = useMemo(
    () =>
      serverEntries.filter(
        entry => entry.type === "directory" || entry.supported
      ),
    [serverEntries]
  );

  // 添加成功消息状态管理
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [pendingExcel, setPendingExcel] = useState(null);
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);

  // 文件大小阈值（50MB）
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

  // 格式化文件大小
  const formatFileSize = bytes => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatModifiedTime = timestamp => {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString();
  };

  // 处理文件选择
  const handleFileSelect = event => {
    const file = event.target.files[0];
    if (!file) return;
    processSelectedFile(file);
  };

  // 处理选中的文件（通用函数）
  const processSelectedFile = file => {
    if (!file) return;

    setSelectedFile(file);

    // 自动生成表别名建议（去除文件扩展名）
    const alias = file.name.replace(/\.[^/.]+$/, "");
    setTableAlias(alias);

    // 自动检测上传方式
    if (autoDetectSize) {
      if (file.size > LARGE_FILE_THRESHOLD) {
        setUploadMode("chunked");
        setUseChunkedUpload(true);
      } else {
        setUploadMode("standard");
        setUseChunkedUpload(false);
      }
    }
  };

  // 手动切换上传方式
  const handleUploadModeChange = event => {
    setUseChunkedUpload(event.target.checked);
    setUploadMode(event.target.checked ? "chunked" : "standard");
    setAutoDetectSize(false);
  };

  // 重置文件选择
  const handleReset = () => {
    setSelectedFile(null);
    setUploadMode("auto");
    setAutoDetectSize(true);
    setUseChunkedUpload(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExcelPending = pending => {
    if (!pending) return;
    setPendingExcel(pending);
    setExcelDialogOpen(true);
  };

  const handleExcelSelectorClose = () => {
    setExcelDialogOpen(false);
    setPendingExcel(null);
  };

  const handleExcelImportComplete = result => {
    const items = result?.results || [];
    items.forEach(item => {
      onDataSourceSaved?.({
        id: item.target_table,
        type: "duckdb",
        name: t("page.datasource.duckdbTable", { table: item.target_table }),
        row_count: item.row_count,
        columns: item.columns || []
      });
    });
    handleExcelSelectorClose();
  };

  const handleServerMountChange = async newPath => {
    setSelectedServerMount(newPath);
    await loadServerDirectory(newPath);
  };

  const handleServerEntryClick = async entry => {
    if (entry.type === "directory") {
      await loadServerDirectory(entry.path);
      return;
    }
    if (!entry.supported) {
      showNotification?.(t("page.datasource.unsupportedType"), "warning");
      return;
    }
    setServerSelectedFile(entry);
    setServerAlias(
      entry.suggested_table_name || entry.name.replace(/\.[^/.]+$/, "")
    );
  };

  const handleServerBreadcrumbClick = async crumb => {
    if (!crumb?.path) return;
    await loadServerDirectory(crumb.path);
  };

  const loadServerDirectory = useCallback(async targetPath => {
    if (!targetPath) return;
    setServerBrowseLoading(true);
    setServerBrowseError("");
    setServerSelectedFile(null);
    setServerAlias("");
    try {
      const response = await browseServerDirectory(targetPath);
      setServerEntries(response.entries || []);
      setServerBreadcrumbs(response.breadcrumbs || []);
      setServerCurrentPath(response.path || targetPath);
    } catch (err) {
      setServerBrowseError(
        err?.response?.data?.detail ||
          err.message ||
          t("page.datasource.serverBrowseFail")
      );
    } finally {
      setServerBrowseLoading(false);
    }
  }, []);

  const loadServerMounts = useCallback(async () => {
    setServerMountLoading(true);
    setServerBrowseError("");
    try {
      const response = await getServerMounts();
      const mounts = response?.mounts || [];
      setServerMounts(mounts);
      if (mounts.length > 0) {
        const firstMount = mounts[0];
        setSelectedServerMount(firstMount.path);
        await loadServerDirectory(firstMount.path);
      } else {
        setServerEntries([]);
      }
    } catch (err) {
      setServerBrowseError(
        err?.response?.data?.detail ||
          err.message ||
          t("page.datasource.serverBrowseFail")
      );
    } finally {
      setServerMountLoading(false);
    }
  }, [loadServerDirectory]);

  useEffect(() => {
    if (activeTab === 2 && serverMounts.length === 0 && !serverMountLoading) {
      loadServerMounts();
    }
  }, [activeTab, serverMounts.length, serverMountLoading, loadServerMounts]);

  const handleServerImport = async () => {
    if (!serverSelectedFile) {
      showNotification?.(t("page.datasource.pickFileFirst"), "warning");
      return;
    }
    const alias = (
      serverAlias ||
      serverSelectedFile.suggested_table_name ||
      ""
    ).trim();
    if (!alias) {
      showNotification?.(t("page.datasource.enterAlias"), "warning");
      return;
    }

    setServerImportLoading(true);
    try {
      const response = await importServerFile({
        path: serverSelectedFile.path,
        table_alias: alias
      });

      showNotification?.(
        response.message || t("page.datasource.importSuccess"),
        "success"
      );
      onDataSourceSaved?.({
        id: response.table_name,
        type: "duckdb",
        name: t("page.datasource.duckdbTable", { table: response.table_name }),
        row_count: response.row_count,
        columns: response.columns || []
      });

      setServerSelectedFile(null);
      setServerAlias("");
    } catch (err) {
      showNotification?.(
        err?.response?.data?.detail ||
          err.message ||
          t("page.datasource.importFail"),
        "error"
      );
    } finally {
      setServerImportLoading(false);
    }
  };

  // 处理标准上传
  const handleStandardUpload = async () => {
    if (!selectedFile) {
      setError(t("page.datasource.pickFileFirst"));
      return;
    }

    // 表别名现在是可选的，如果为空则使用文件名

    // 前端文件大小校验
    if (selectedFile.size > LARGE_FILE_THRESHOLD) {
      setError(
        t("page.datasource.fileTooLarge", {
          size: formatFileSize(LARGE_FILE_THRESHOLD)
        })
      );
      return;
    }

    setIsUploading(true);
    setError("");
    setUploadProgress(0);

    try {
      const response = await uploadFile(selectedFile, tableAlias);

      if (response?.pending_excel) {
        showNotification(t("page.datasource.excelUploadSuccess"), "info");
        handleExcelPending({
          ...response.pending_excel,
          file_id: response.pending_excel.file_id
        });
        handleReset();
        return;
      }

      if (response.success) {
        showNotification(
          t("page.datasource.uploadSuccessTable", { table: response.file_id }),
          "success"
        );

        // 通知父组件数据源已保存
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: response.file_id,
            type: "duckdb",
            name: t("page.datasource.duckdbTable", { table: response.file_id }),
            row_count: response.row_count,
            columns: response.columns
          });
        }

        // 清空输入
        handleReset();
      } else {
        setError(response.message || t("page.datasource.uploadFail"));
        showNotification(
          response.message || t("page.datasource.uploadFail"),
          "error"
        );
      }
    } catch (err) {
      setError(err.message || t("page.datasource.uploadFail"));
      showNotification(err.message || t("page.datasource.uploadFail"), "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 拖拽事件处理
  const handleDragEnter = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      processSelectedFile(file);
    }
  };

  // 处理URL读取
  const handleUrlRead = async () => {
    if (!fileUrl.trim()) {
      setError(t("page.datasource.enterUrl"));
      return;
    }

    if (!tableAlias.trim()) {
      setError(t("page.datasource.enterAlias"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await readFromUrl(fileUrl, tableAlias);

      if (result.success) {
        showNotification(
          t("page.datasource.urlReadSuccess", { table: result.table_name }),
          "success"
        );

        // 通知父组件数据源已保存0
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: result.table_name,
            type: "duckdb",
            name: t("page.datasource.duckdbTable", {
              table: result.table_name
            }),
            row_count: result.row_count,
            columns: result.columns
          });
        }

        // 清空输入
        setFileUrl("");
        setTableAlias("");
      } else {
        setError(result.message || t("page.datasource.urlReadFail"));
        showNotification(
          result.message || t("page.datasource.urlReadFail"),
          "error"
        );
      }
    } catch (err) {
      setError(
        t("page.datasource.urlReadFailDetail", {
          message: err.message || t("common.unknown")
        })
      );
      showNotification(
        t("page.datasource.urlReadFailDetail", {
          message: err.message || t("common.unknown")
        }),
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  // 分块上传完成回调
  const handleChunkedUploadComplete = async result => {
    if (result?.pending_excel) {
      showNotification(t("page.datasource.excelUploadSuccess"), "info");
      handleExcelPending({
        ...result.pending_excel,
        file_id: result.pending_excel.file_id
      });
      setShowSuccessMessage(false);
      setError("");
      handleReset();
      return;
    }

    if (result && result.fileInfo) {
      try {
        const fileInfo = result.fileInfo;

        // 设置成功状态，显示成功消息
        setShowSuccessMessage(true);
        setError(""); // 清除错误状态

        showNotification(
          t("page.datasource.uploadSuccessTable", {
            table: fileInfo.source_id
          }),
          "success"
        );

        // 通知父组件数据源已保存
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: fileInfo.source_id,
            type: "duckdb",
            name: t("page.datasource.duckdbTable", {
              table: fileInfo.source_id
            }),
            row_count: fileInfo.row_count || 0,
            columns: fileInfo.columns || []
          });
        }

        handleReset();

        // 延迟清空输入，让用户看到成功消息
        setTimeout(() => {
          setShowSuccessMessage(false);
        }, 3000);
      } catch (err) {
        setError(t("page.datasource.processFail"));
        showNotification(t("page.datasource.processFail"), "error");
      }
    } else {
      // 错误情况
      const errorMessage =
        result?.message || result?.error || t("page.datasource.uploadFail");
      setError(errorMessage);
      setShowSuccessMessage(false);
      showNotification(
        t("page.datasource.uploadFailDetail", { message: errorMessage }),
        "error"
      );
    }
  };

  return (
    <Box>
      {error && !showSuccessMessage && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: "var(--dq-radius-card)" }}
        >
          {error}
        </Alert>
      )}

      {showSuccessMessage && (
        <Alert
          severity="success"
          sx={{ mb: 2, borderRadius: "var(--dq-radius-card)" }}
        >
          ${t("page.datasource.successToast")}
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onChange={(e, newValue) => setActiveTab(newValue)}
        sx={{
          mb: 2,
          "& .MuiTabs-indicator": {
            backgroundColor: "var(--dq-accent-primary)",
            height: 2,
            borderRadius: 999
          },
          "& .MuiTab-root": {
            fontSize: "var(--dq-tab-font-size-secondary)",
            fontWeight: "var(--dq-tab-font-weight-secondary-inactive)",
            textTransform: "none",
            minHeight: 48,
            color: "var(--dq-text-tertiary)",
            backgroundColor: "transparent",
            "&.Mui-selected": {
              color: "var(--dq-tab-active-color)",
              backgroundColor: "transparent",
              fontWeight: "var(--dq-tab-font-weight-secondary)"
            },
            "&:hover": {
              color: "var(--dq-text-primary)",
              backgroundColor: "transparent"
            }
          }
        }}
      >
        <Tab label={t("page.datasource.tabLocal")} sx={{ mr: 2 }} />
        <Tab label={t("page.datasource.tabRemote")} />
        <Tab label={t("page.datasource.tabServer")} sx={{ ml: 2 }} />
      </Tabs>

      {/* 本地文件上传 */}
      {activeTab === 0 && (
        <CardSurface
          padding={3}
          elevation
          sx={{
            borderColor: "var(--dq-border-card)",
            borderRadius: "var(--dq-radius-card)"
          }}
        >
          <SectionHeader
            title={t("page.datasource.cardLocalTitle")}
            subtitle={t("page.datasource.cardLocalDesc")}
            icon={<Upload size={18} color="var(--dq-accent-primary)" />}
          />

          {/* 上传方式选择 - 在文件选择之前 */}
          <Box
            sx={{
              mb: 3,
              p: 2,
              backgroundColor: "var(--dq-surface)",
              borderRadius: "var(--dq-radius-card)",
              border: "1px solid var(--dq-border-subtle)"
            }}
          >
            <FormControlLabel
              control={
                <RoundedSwitch
                  checked={useChunkedUpload}
                  onChange={handleUploadModeChange}
                  size="small"
                />
              }
              label={t("page.datasource.useChunked")}
              sx={{ gap: 1.5, "& .MuiSwitch-root": { mr: 1 } }}
            />
            <Typography
              variant="caption"
              sx={{ ml: 2, color: "var(--dq-text-tertiary)" }}
            >
              {useChunkedUpload
                ? t("page.datasource.chunkedOn")
                : t("page.datasource.chunkedOff")}
            </Typography>
          </Box>

          {/* 文件选择和拖拽区域 - 根据上传方式显示不同界面 */}
          {!useChunkedUpload ? (
            // 标准上传界面
            <Box sx={{ mb: 3 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
                onChange={handleFileSelect}
                style={{ display: "none" }}
                id="file-upload"
              />

              {/* 拖拽上传区域 */}
              <Box
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  border: "2px dashed",
                  borderColor: isDragOver
                    ? "var(--dq-accent-primary)"
                    : "var(--dq-border-subtle)",
                  borderRadius: "var(--dq-radius-card)",
                  p: 4,
                  textAlign: "center",
                  backgroundColor: isDragOver
                    ? "var(--dq-surface-hover)"
                    : "transparent",
                  transition:
                    "background-color 0.2s ease, border-color 0.2s ease",
                  cursor: "pointer",
                  "&:hover": {
                    borderColor: "var(--dq-accent-primary)",
                    backgroundColor: "var(--dq-surface-hover)"
                  }
                }}
              >
                <Upload
                  sx={{
                    fontSize: 48,
                    color: isDragOver
                      ? "var(--dq-accent-primary)"
                      : "var(--dq-text-tertiary)",
                    mb: 2
                  }}
                />
                <Typography
                  variant="h6"
                  sx={{
                    mb: 1,
                    color: isDragOver
                      ? "var(--dq-accent-primary)"
                      : "var(--dq-text-primary)"
                  }}
                >
                  {t("page.datasource.dragHere")}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: "var(--dq-text-tertiary)" }}
                >
                  {t("page.datasource.orClick")}
                </Typography>
              </Box>
            </Box>
          ) : (
            // 分块上传界面
            <Box sx={{ mb: 3 }}>
              {selectedFile ? (
                <>
                  {/* 文件信息显示 */}
                  <Alert
                    severity="info"
                    sx={{ mb: 2, borderRadius: "var(--dq-radius-card)" }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {t("page.datasource.selectedFile")}:{" "}
                          {selectedFile.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "var(--dq-text-tertiary)" }}
                        >
                          {t("page.datasource.fileSize")}:{" "}
                          {formatFileSize(selectedFile.size)}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={handleReset}>
                        <CancelIcon />
                      </IconButton>
                    </Box>
                  </Alert>

                  {/* 表别名输入 */}
                  <RoundedTextField
                    label={t("page.datasource.aliasLabel")}
                    value={tableAlias}
                    onChange={e => setTableAlias(e.target.value)}
                    fullWidth
                    sx={{ mb: 2 }}
                    placeholder={t("page.datasource.aliasPlaceholder")}
                    disabled={isUploading}
                    helperText={t("page.datasource.aliasHelper")}
                  />

                  {/* 分块上传组件 */}
                  <ChunkedUploader
                    file={selectedFile}
                    tableAlias={tableAlias}
                    onUploadComplete={handleChunkedUploadComplete}
                    onUploadProgress={progress => {}}
                  />
                </>
              ) : (
                <CardSurface
                  padding={3}
                  sx={{
                    borderColor: "var(--dq-border-subtle)",
                    textAlign: "center"
                  }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {t("page.datasource.pickFileFirst")}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "var(--dq-text-tertiary)", mb: 3 }}
                  >
                    {t("page.datasource.selectFileToStart")}
                  </Typography>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                    id="file-upload"
                  />
                  <RoundedButton
                    startIcon={<Upload size={20} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("page.datasource.btnSelectFile")}
                  </RoundedButton>
                </CardSurface>
              )}
            </Box>
          )}

          {/* 文件信息显示和标准上传按钮 */}
          {selectedFile && !useChunkedUpload && (
            <Box sx={{ mb: 3 }}>
              <Alert
                severity="info"
                sx={{ mb: 2, borderRadius: "var(--dq-radius-card)" }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {t("page.datasource.selectedFile")}: {selectedFile.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--dq-text-tertiary)" }}
                    >
                      {t("page.datasource.fileSize")}:{" "}
                      {formatFileSize(selectedFile.size)}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={handleReset}>
                    <CancelIcon />
                  </IconButton>
                </Box>
              </Alert>

              {/* 表别名输入 */}
              <RoundedTextField
                label={t("page.datasource.aliasLabel")}
                value={tableAlias}
                onChange={e => setTableAlias(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
                placeholder={t("page.datasource.aliasPlaceholder")}
                disabled={isUploading}
                helperText={t("page.datasource.aliasHelper")}
              />

              {/* 上传方式提示 */}
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Chip
                    label={
                      selectedFile.size > LARGE_FILE_THRESHOLD
                        ? t("page.datasource.chunkHintOn")
                        : t("page.datasource.chunkHintOff")
                    }
                    color={
                      selectedFile.size > LARGE_FILE_THRESHOLD
                        ? "warning"
                        : "success"
                    }
                    variant="outlined"
                    size="small"
                  />
                  <Tooltip
                    title={
                      selectedFile.size > LARGE_FILE_THRESHOLD
                        ? t("page.datasource.chunkTooltipLarge")
                        : t("page.datasource.chunkTooltipSmall")
                    }
                  >
                    <IconButton size="small" sx={{ ml: 1 }}>
                      <InfoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              <Divider sx={{ mb: 2 }} />

              {/* 标准上传按钮 */}
              <RoundedButton
                fullWidth
                onClick={handleStandardUpload}
                sx={{ py: 1.5 }}
                disabled={isUploading || !selectedFile}
              >
                {isUploading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  t("page.datasource.btnStartUpload")
                )}
              </RoundedButton>
            </Box>
          )}

          {/* 功能说明 */}
          <Box
            sx={{
              mt: 3,
              p: 2,
              backgroundColor: "var(--dq-surface-alt)",
              borderRadius: "var(--dq-radius-card)",
              border: "1px solid var(--dq-border-subtle)"
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "var(--dq-text-secondary)" }}
            >
              <Lightbulb size={16} style={{ marginRight: "8px" }} />
              <strong>{t("page.datasource.localTipsTitle")}</strong>
              <br />• {t("page.datasource.localTipsStd")}
              <br />• {t("page.datasource.localTipsChunk")}
              <br />• {t("page.datasource.localTipsFormats")}
            </Typography>
          </Box>
        </CardSurface>
      )}

      {/* 远程文件导入 */}
      {activeTab === 1 && (
        <CardSurface
          padding={3}
          elevation
          sx={{
            borderColor: "var(--dq-border-card)",
            borderRadius: "var(--dq-radius-card)"
          }}
        >
          <SectionHeader
            title={t("page.datasource.cardRemoteTitle")}
            subtitle={t("page.datasource.cardRemoteDesc")}
            icon={<LinkIcon sx={{ color: "var(--dq-accent-primary)" }} />}
          />

          <RoundedTextField
            label={t("page.datasource.remoteUrlLabel")}
            value={fileUrl}
            onChange={e => setFileUrl(e.target.value)}
            fullWidth
            sx={{ mb: 1 }}
            placeholder="https://example.com/data.csv"
            helperText={t("page.datasource.remoteUrlHelper")}
            disabled={loading}
          />

          <Box
            sx={{
              mb: 2,
              p: 1.5,
              backgroundColor: "var(--dq-surface)",
              borderRadius: "var(--dq-radius-card)",
              border: "1px solid var(--dq-border-subtle)"
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "var(--dq-text-secondary)" }}
            >
              <Lightbulb size={16} style={{ marginRight: "8px" }} />
              <strong>{t("page.datasource.remoteTipsTitle")}</strong>
              <br />• {t("page.datasource.remoteTips1")}
              <br />• {t("page.datasource.remoteTips2")}
              <br />• {t("page.datasource.remoteTips3")}
            </Typography>
          </Box>

          <RoundedTextField
            label={t("page.datasource.remoteAliasLabel")}
            value={tableAlias}
            onChange={e => setTableAlias(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder={t("page.datasource.remoteAliasPlaceholder")}
            disabled={loading}
          />

          <RoundedButton
            disabled={loading || !fileUrl || !tableAlias}
            startIcon={<LinkIcon />}
            fullWidth
            onClick={handleUrlRead}
            sx={{ py: 1.5 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              t("page.datasource.btnReadRemote")
            )}
          </RoundedButton>

          {/* 功能说明 */}
          <Box
            sx={{
              mt: 3,
              p: 2,
              backgroundColor: "var(--dq-surface)",
              borderRadius: "var(--dq-radius-card)",
              border: "1px solid var(--dq-border-subtle)"
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: "var(--dq-text-secondary)" }}
            >
              <Lightbulb size={16} style={{ marginRight: "8px" }} />
              <strong>{t("page.datasource.remoteTipsTitle")}</strong>
              <br />• {t("page.datasource.remoteTips1")}
              <br />• {t("page.datasource.remoteTips2")}
              <br />• {t("page.datasource.remoteTips3")}
            </Typography>
          </Box>
        </CardSurface>
      )}

      {/* 服务器目录导入 */}
      {activeTab === 2 && (
        <CardSurface
          padding={3}
          elevation
          sx={{
            borderColor: "var(--dq-border-card)",
            borderRadius: "var(--dq-radius-card)"
          }}
        >
          <SectionHeader
            title={t("page.datasource.cardServerTitle")}
            subtitle={t("page.datasource.cardServerDesc")}
            icon={<HardDrive size={18} color="var(--dq-accent-primary)" />}
          />

          <Alert
            severity="info"
            sx={{ mb: 2, borderRadius: "var(--dq-radius-card)" }}
          >
            <Typography variant="body2">
              {t("page.datasource.serverMountAlert")}
            </Typography>
          </Alert>

          {serverMountLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress size={32} />
            </Box>
          ) : serverMounts.length === 0 ? (
            <Alert
              severity="warning"
              sx={{ borderRadius: "var(--dq-radius-card)" }}
            >
              {t("page.datasource.serverNoMount")}
            </Alert>
          ) : (
            <>
              <Box
                sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}
              >
                <RoundedTextField
                  select
                  label={t("page.datasource.serverSelectMount")}
                  value={selectedServerMount}
                  onChange={e => handleServerMountChange(e.target.value)}
                  sx={{ flex: 1 }}
                >
                  {serverMounts.map(mount => (
                    <MenuItem key={mount.path} value={mount.path}>
                      {mount.label}{" "}
                      {mount.exists === false
                        ? t("page.datasource.serverNotExists")
                        : ""}
                    </MenuItem>
                  ))}
                </RoundedTextField>
                <IconButton
                  aria-label="refresh-directory"
                  onClick={() =>
                    loadServerDirectory(
                      selectedServerMount || serverMounts[0]?.path
                    )
                  }
                  sx={{
                    border: "1px solid var(--dq-border-subtle)",
                    borderRadius: "var(--dq-radius-card)"
                  }}
                >
                  <RefreshCw size={18} />
                </IconButton>
              </Box>

              {serverBreadcrumbs.length > 0 && (
                <Box
                  sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2 }}
                >
                  {serverBreadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                      <Chip
                        label={crumb.name}
                        icon={
                          crumb.is_root ? (
                            <HardDrive size={14} />
                          ) : (
                            <FolderOpen size={14} />
                          )
                        }
                        onClick={() => handleServerBreadcrumbClick(crumb)}
                        sx={{ cursor: "pointer" }}
                      />
                      {index < serverBreadcrumbs.length - 1 && (
                        <Typography
                          variant="caption"
                          sx={{ color: "var(--dq-text-tertiary)" }}
                        >
                          /
                        </Typography>
                      )}
                    </React.Fragment>
                  ))}
                </Box>
              )}

              {serverBrowseError && (
                <Alert
                  severity="error"
                  sx={{ mb: 2, borderRadius: "var(--dq-radius-card)" }}
                >
                  {serverBrowseError}
                </Alert>
              )}

              <Box
                sx={{
                  border: "1px solid var(--dq-border-subtle)",
                  borderRadius: "var(--dq-radius-card)",
                  mb: 3,
                  maxHeight: 320,
                  overflowY: "auto",
                  backgroundColor: "var(--dq-surface)"
                }}
              >
                {serverBrowseLoading ? (
                  <Box
                    sx={{ display: "flex", justifyContent: "center", py: 6 }}
                  >
                    <CircularProgress size={28} />
                  </Box>
                ) : filteredServerEntries.length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{ p: 3, color: "var(--dq-text-tertiary)" }}
                  >
                    {t("page.datasource.serverNoFiles")}
                  </Typography>
                ) : (
                  filteredServerEntries.map(entry => {
                    const isSelected = serverSelectedFile?.path === entry.path;
                    return (
                      <Box
                        key={entry.path}
                        onClick={() => handleServerEntryClick(entry)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          p: 1.5,
                          borderBottom: "1px solid var(--dq-border-subtle)",
                          cursor: "pointer",
                          backgroundColor: isSelected
                            ? "color-mix(in oklab, var(--dq-accent-primary) 12%, transparent)"
                            : "transparent",
                          "&:hover": {
                            backgroundColor: "var(--dq-surface-hover)"
                          }
                        }}
                      >
                        {entry.type === "directory" ? (
                          <FolderOpen
                            size={20}
                            color="var(--dq-text-secondary)"
                          />
                        ) : (
                          <FileText
                            size={20}
                            color={
                              entry.supported
                                ? "var(--dq-accent-primary)"
                                : "var(--dq-text-tertiary)"
                            }
                          />
                        )}
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: entry.type === "directory" ? 600 : 500
                            }}
                          >
                            {entry.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: "var(--dq-text-tertiary)" }}
                          >
                            {entry.type === "directory"
                              ? t("page.datasource.serverTypeFolder")
                              : `${(
                                  entry.extension || ""
                                ).toUpperCase()} · ${formatFileSize(
                                  entry.size || 0
                                )}`}{" "}
                            · {formatModifiedTime(entry.modified)}
                          </Typography>
                        </Box>
                        {entry.type === "file" && (
                          <Chip
                            size="small"
                            label={
                              entry.supported
                                ? t("page.datasource.serverTypeSupport")
                                : t("page.datasource.serverTypeUnsupport")
                            }
                            color={entry.supported ? "success" : "default"}
                          />
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>

              {serverSelectedFile && (
                <Alert
                  severity="success"
                  sx={{ mb: 2, borderRadius: "var(--dq-radius-card)" }}
                >
                  {t("page.datasource.serverSelected")}：
                  {serverSelectedFile.name}（
                  {formatFileSize(serverSelectedFile.size || 0)}）
                </Alert>
              )}

              <RoundedTextField
                label={t("page.datasource.remoteAliasLabel")}
                value={serverAlias}
                onChange={e => setServerAlias(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
                placeholder={t("page.datasource.serverAliasPlaceholder")}
                helperText={t("page.datasource.serverAliasHelper")}
                disabled={!serverSelectedFile || serverImportLoading}
              />

              <RoundedButton
                fullWidth
                startIcon={!serverImportLoading && <Upload size={18} />}
                disabled={!serverSelectedFile || serverImportLoading}
                onClick={handleServerImport}
                sx={{ py: 1.5 }}
              >
                {serverImportLoading ? (
                  <CircularProgress size={22} color="inherit" />
                ) : (
                  t("page.datasource.btnImportServer")
                )}
              </RoundedButton>
            </>
          )}
        </CardSurface>
      )}

      <ExcelSheetSelector
        open={excelDialogOpen}
        pendingInfo={pendingExcel}
        onClose={handleExcelSelectorClose}
        onImported={handleExcelImportComplete}
        showNotification={showNotification}
      />
    </Box>
  );
};

export default DataUploadSection;
