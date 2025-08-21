import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Button
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Storage as DatabaseIcon
} from '@mui/icons-material';
import { useToast } from '../../contexts/ToastContext';

const DataSourceList = ({ dataSources = [], databaseConnections = [], onRefresh }) => {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');

  // 只显示数据库连接
  const effectiveDatabases = databaseConnections || [];

  const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null, type: null });

  useEffect(() => {
    setInitialLoading(false);
  }, []);

  const confirmDelete = () => {
    const { item, type } = deleteDialog;
    if (type === 'database') {
      deleteDatabase(item.id);
    }
  };

  return (
    <Box>
      {/* 头部操作栏 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          数据源列表
        </Typography>
      </Box>

      {/* 数据库连接列表 */}
      <Paper sx={{ borderRadius: 2 }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <DatabaseIcon color="secondary" />
            数据库连接 ({effectiveDatabases.length})
          </Typography>
        </Box>
        <Divider />
        {effectiveDatabases.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            暂无数据库连接
          </Box>
        ) : (
          <List>
            {effectiveDatabases.map((db, index) => (
              <ListItem key={db.id} divider={index < effectiveDatabases.length - 1}>
                <ListItemText
                  primary={
                    <Box>
                      <Typography variant="body1" sx={{ mb: 1 }}>
                        {db.name || `${db.type} 连接`}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip label={(db.type || '').toUpperCase()} size="small" color="secondary" />
                        <Chip
                          label={db.status || 'unknown'}
                          size="small"
                          color={db.status === 'active' ? 'success' : 'default'}
                        />
                      </Box>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton 
                    onClick={() => handleDelete(db, 'database')} 
                    size="small"
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, item: null, type: null })}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除这个数据库连接吗？
          <br />
          <strong>
            {deleteDialog.item?.name || '未命名连接'}
          </strong>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, item: null, type: null })}>
            取消
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DataSourceList;
