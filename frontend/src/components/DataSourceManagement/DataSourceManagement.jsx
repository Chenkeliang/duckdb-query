import {
  Alert,
  Box,
  Card,
  CardContent,
  Snackbar,
  Typography
} from "@mui/material";
import { Database, FolderOpen } from "lucide-react";
import React, { useEffect, useState } from "react";
import { fetchDuckDBTableSummaries } from "../../services/apiClient";
import DataSourceList from "./DataSourceList";
import DataUploadSection from "./DataUploadSection";
import { useTranslation } from "react-i18next";

const DataSourceManagement = ({ onDataSaved }) => {
  const { t } = useTranslation("common");
  const [duckdbTables, setDuckdbTables] = useState([]);
  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "success"
  });

  // 获取DuckDB中的表列表
  const fetchDuckDBTables = async () => {
    try {
      const response = await fetchDuckDBTableSummaries();
      const tableNames = Array.isArray(response?.tables)
        ? response.tables.map(table => table.table_name)
        : [];
      setDuckdbTables(tableNames);
    } catch (err) {
      showNotification(t("datasource.manage.fetchFail"), "error");
    }
  };

  useEffect(() => {
    fetchDuckDBTables();
  }, []);

  const showNotification = (message, severity = "success") => {
    setNotification({ open: true, message, severity });
  };

  const handleNotificationClose = () => {
    setNotification({ ...notification, open: false });
  };

  const handleDataSourceSaved = newSource => {
    fetchDuckDBTables();
    if (onDataSaved) {
      onDataSaved(newSource);
    }
    showNotification(t("datasource.manage.saveSuccess"), "success");
  };

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <FolderOpen size={20} style={{ marginRight: "8px" }} />
            {t("datasource.manage.title")}
          </Typography>

          <DataUploadSection
            onDataSourceSaved={handleDataSourceSaved}
            showNotification={showNotification}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <Database size={20} style={{ marginRight: "8px" }} />
            {t("datasource.manage.uploadedTitle")}
          </Typography>
          <DataSourceList
            duckdbTables={duckdbTables}
            onRefresh={fetchDuckDBTables}
            showNotification={showNotification}
          />
        </CardContent>
      </Card>

      <Snackbar
        open={notification.open}
        autoHideDuration={3000}
        onClose={handleNotificationClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleNotificationClose}
          severity={notification.severity}
          sx={{ width: "100%" }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DataSourceManagement;
