import {
  Storage as DatabaseIcon,
  Delete as DeleteIcon,
  Autorenew as AutorenewIcon
} from "@mui/icons-material";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Tooltip,
  Typography
} from "@mui/material";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../contexts/ToastContext";
import {
  deleteDatabaseConnection,
  refreshDatabaseConnection
} from "../../services/apiClient";
import { CardSurface, RoundedButton, SectionHeader } from "../common";

const STATUS_STYLE_CLASS = {
  active: "dq-tag-status-success",
  ready: "dq-tag-status-success",
  connected: "dq-tag-status-success",
  syncing: "dq-tag-status-info",
  running: "dq-tag-status-info",
  pending: "dq-tag-status-warning",
  warning: "dq-tag-status-warning",
  error: "dq-tag-status-error",
  failed: "dq-tag-status-error"
};

const DataSourceList = ({
  dataSources = [],
  databaseConnections = [],
  onRefresh
}) => {
  const { t } = useTranslation("common");
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState(null);

  // 只显示数据库连接
  const effectiveDatabases = databaseConnections || [];

  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    item: null,
    type: null
  });

  useEffect(() => {
    setInitialLoading(false);
  }, []);

  // 处理删除操作
  const handleDelete = (item, type) => {
    setDeleteDialog({ open: true, item, type });
  };

  // 删除数据库连接
  const deleteDatabase = async connectionId => {
    try {
      setLoading(true);
      const response = await deleteDatabaseConnection(connectionId);

      if (response.success) {
        showSuccess(t("datasource.list.deleteSuccess"));
        // 关闭对话框
        setDeleteDialog({ open: false, item: null, type: null });
        // 刷新数据
        if (onRefresh) {
          onRefresh();
        }
      } else {
        showError(
          t("datasource.list.deleteFail", { message: response.message })
        );
      }
    } catch (err) {
      showError(t("datasource.list.deleteFail", { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    const { item, type } = deleteDialog;
    if (type === "database") {
      deleteDatabase(item.id);
    }
  };

  const handleRefresh = async connection => {
    try {
      setRefreshingId(connection.id);
      const response = await refreshDatabaseConnection(connection.id);
      if (response?.success) {
        showSuccess(response?.message || t("datasource.list.testSuccess"));
      } else {
        showError(response?.message || t("datasource.list.testFail"));
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      const message =
        err?.response?.data?.detail?.message ||
        err?.message ||
        t("datasource.list.testFail");
      showError(message);
    } finally {
      setRefreshingId(null);
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
          title={t("datasource.list.title")}
          subtitle={t("datasource.list.subtitle", {
            count: effectiveDatabases.length
          })}
        />

        <CardSurface
          padding={0}
          sx={{ mt: 2, borderColor: "var(--dq-border-subtle)" }}
        >
          {effectiveDatabases.length === 0 ? (
            <Box
              sx={{
                p: 3,
                textAlign: "center",
                color: "var(--dq-text-tertiary)"
              }}
            >
              {t("datasource.list.empty")}
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {effectiveDatabases.map((db, index) => (
                <ListItem
                  key={db.id}
                  className="hover-surface"
                  sx={{
                    py: 1.5,
                    borderBottom:
                      index < effectiveDatabases.length - 1
                        ? "1px solid var(--dq-border-subtle)"
                        : "none"
                  }}
                >
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography
                        component="div"
                        variant="body1"
                        sx={{
                          fontWeight: 600,
                          color: "var(--dq-text-primary)"
                        }}
                      >
                        {db.name ||
                          t("datasource.list.defaultName", { type: db.type })}
                      </Typography>
                    }
                    secondary={
                      <Box
                        component="div"
                        sx={{ display: "flex", gap: 1, mt: 0.5 }}
                      >
                        <Chip
                          label={(db.type || "unknown").toUpperCase()}
                          size="small"
                          className="dq-tag dq-tag-type"
                        />
                        <Chip
                          label={(db.status || "unknown").toUpperCase()}
                          size="small"
                          className={`dq-tag dq-tag-status ${STATUS_STYLE_CLASS[
                            (db.status || "").toLowerCase()
                          ] || "dq-tag-status-neutral"}`}
                        />
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Tooltip title={t("datasource.list.retry")}>
                        <span>
                          <IconButton
                            onClick={() => handleRefresh(db)}
                            size="small"
                            disabled={refreshingId === db.id}
                            sx={{
                              color: "var(--dq-accent-primary)",
                              "&:hover": {
                                backgroundColor: "var(--dq-surface-hover)"
                              }
                            }}
                          >
                            {refreshingId === db.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <AutorenewIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={t("datasource.list.delete")}>
                        <span>
                          <IconButton
                            onClick={() => handleDelete(db, "database")}
                            size="small"
                            sx={{
                              color: "var(--dq-status-error-fg)",
                              "&:hover": {
                                backgroundColor: "var(--dq-status-error-bg)"
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </CardSurface>
      </CardSurface>

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, item: null, type: null })}
      >
        <DialogTitle>{t("datasource.list.deleteConfirmTitle")}</DialogTitle>
        <DialogContent>
          {t("datasource.list.deleteConfirmDesc")}
          <br />
          <strong>
            {deleteDialog.item?.name || t("datasource.list.unnamed")}
          </strong>
        </DialogContent>
        <DialogActions>
          <RoundedButton
            variant="outlined"
            onClick={() =>
              setDeleteDialog({ open: false, item: null, type: null })
            }
            size="small"
          >
            {t("actions.cancel", { defaultValue: "取消" })}
          </RoundedButton>
          <RoundedButton
            onClick={confirmDelete}
            size="small"
            sx={{
              backgroundColor: "var(--dq-status-error-fg)",
              "&:hover": { backgroundColor: "var(--dq-status-error-fg)" }
            }}
          >
            {t("actions.delete", { defaultValue: "删除" })}
          </RoundedButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DataSourceList;
