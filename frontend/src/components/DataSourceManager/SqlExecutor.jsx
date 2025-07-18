import React, { useState } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  Alert, 
  Fade,
  CircularProgress,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CodeIcon from '@mui/icons-material/Code';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { executeSQL } from '../../services/apiClient';

const SqlExecutor = ({ dataSource }) => {
  const [sqlQuery, setSqlQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // 根据数据源类型预填充示例查询
  React.useEffect(() => {
    if (dataSource) {
      if (dataSource.type !== 'file') {
        // 数据库类型数据源
        if (dataSource.params && dataSource.params.database) {
          if (dataSource.type === 'mysql' || dataSource.type === 'postgresql') {
            setSqlQuery(`SHOW TABLES FROM ${dataSource.params.database}`);
          } else if (dataSource.type === 'sqlite' || dataSource.type === 'duckdb') {
            setSqlQuery("SELECT name FROM sqlite_master WHERE type='table'");
          }
        }
      } else {
        // 文件类型数据源
        setSqlQuery(`SELECT * FROM "${dataSource.id}" LIMIT 10`);
      }
    }
  }, [dataSource]);

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) {
      setError('请输入SQL查询语句');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      // 调用API执行SQL查询
      const result = await executeSQL(sqlQuery, dataSource);
      
      if (result) {
        setResults({
          columns: result.columns || [],
          data: result.data || []
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('查询未返回结果');
      }
    } catch (err) {
      setError(`执行失败: ${err.message || '未知错误'}`);
      console.error("SQL执行错误:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 如果没有数据源，不显示此组件
  if (!dataSource) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      {error && (
        <Fade in={!!error}>
          <Alert 
            severity="error" 
            sx={{ 
              mb: 2, 
              borderRadius: 2,
              fontSize: '0.875rem'
            }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        </Fade>
      )}

      {success && (
        <Fade in={success}>
          <Alert 
            severity="success" 
            sx={{ 
              mb: 2, 
              borderRadius: 2,
              fontSize: '0.875rem'
            }}
          >
            SQL查询执行成功
          </Alert>
        </Fade>
      )}
      
      <Accordion 
        expanded={expanded}
        onChange={() => setExpanded(!expanded)}
        disableGutters
        elevation={0}
        sx={{ 
          border: '1px solid rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          mb: 2,
          '&:before': { display: 'none' },
          overflow: 'hidden'
        }}
      >
        <AccordionSummary 
          expandIcon={<ExpandMoreIcon />}
          sx={{ 
            backgroundColor: '#f9f9f9',
            borderBottom: expanded ? '1px solid rgba(0, 0, 0, 0.1)' : 'none',
            minHeight: '48px',
            '& .MuiAccordionSummary-content': { my: 0 }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CodeIcon sx={{ mr: 1, fontSize: '1.2rem', color: '#1976d2' }} />
            <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
              SQL查询执行器 - {dataSource.id || dataSource.params?.database || '数据源'}
            </Typography>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ p: 2, pt: 2.5 }}>
          <TextField
            label="SQL查询"
            variant="outlined"
            size="small"
            multiline
            rows={4}
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            fullWidth
            sx={{ 
              mb: 2,
              borderRadius: '4px', 
              '& textarea': { fontFamily: 'monospace', fontSize: '0.9rem' }
            }}
            placeholder="输入SQL查询语句..."
          />
          
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={handleExecuteSql}
              disabled={loading}
              sx={{
                borderRadius: '20px',
                minWidth: '160px',
                py: 0.75,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.875rem'
              }}
            >
              {loading ? <CircularProgress size={24} /> : '执行SQL'}
            </Button>
          </Box>
          
          {results && results.data && results.data.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                查询结果 ({results.data.length} 条记录)
              </Typography>
              
              <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        {results.columns.map((column, index) => (
                          <TableCell 
                            key={index}
                            sx={{ 
                              fontWeight: 'bold', 
                              backgroundColor: '#f5f5f5',
                              fontSize: '0.85rem'
                            }}
                          >
                            {column}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {results.data
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((row, rowIndex) => (
                          <TableRow hover key={rowIndex}>
                            {results.columns.map((column, colIndex) => (
                              <TableCell 
                                key={colIndex}
                                sx={{ fontSize: '0.85rem' }}
                              >
                                {row[column] !== null && row[column] !== undefined 
                                  ? String(row[column]) 
                                  : <span style={{ color: '#999', fontStyle: 'italic' }}>null</span>}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                <TablePagination
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  component="div"
                  count={results.data.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  labelRowsPerPage="每页行数:"
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} 共 ${count}`}
                />
              </Paper>
            </Box>
          )}
          
          {results && results.data && results.data.length === 0 && (
            <Alert 
              severity="info" 
              sx={{ mt: 3 }}
            >
              查询执行成功，但没有返回数据
            </Alert>
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default SqlExecutor;