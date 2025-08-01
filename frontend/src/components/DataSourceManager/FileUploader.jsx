import React, { useState } from 'react';
import { Button, CircularProgress, Box, Typography, Alert, Fade } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useToast } from '../../contexts/ToastContext';

const FileUploader = ({ onUpload }) => {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    handleFiles(file);
  };

  const handleFiles = async (file) => {
    // 检查文件类型
    const fileType = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileType)) {
      const errorMsg = '不支持的文件格式，请上传 CSV 或 Excel 文件';
      setError(errorMsg);
      showError(errorMsg);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await onUpload(file);
      setSuccess(true);
      showSuccess(`文件 "${file.name}" 上传成功`);
      setTimeout(() => setSuccess(false), 3000); // 3秒后隐藏成功提示
    } catch (err) {
      const errorMsg = `文件上传失败: ${err.message}`;
      setError(errorMsg);
      showError(errorMsg);
      console.error("Error uploading file:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ my: 2 }}>
      {error && (
        <Fade in={!!error}>
          <Alert 
            severity="error" 
            sx={{ 
              mb: 2, 
              borderRadius: 2,
              border: '1px solid rgba(211, 47, 47, 0.1)',
              '& .MuiAlert-icon': {
                color: '#d32f2f',
              }
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
            icon={<CheckCircleOutlineIcon fontSize="inherit" />}
            severity="success" 
            sx={{ 
              mb: 2, 
              borderRadius: 2,
              backgroundColor: 'rgba(46, 125, 50, 0.08)',
              color: '#2e7d32',
              border: '1px solid rgba(46, 125, 50, 0.1)',
              '& .MuiAlert-icon': {
                color: '#2e7d32',
              }
            }}
          >
            文件上传成功
          </Alert>
        </Fade>
      )}

      <Box 
        sx={{ 
          position: 'relative',
          border: '1px dashed',
          borderColor: dragActive ? 'primary.main' : 'rgba(0,0,0,0.12)',
          borderRadius: 3,
          p: 4,
          backgroundColor: dragActive ? 'rgba(0, 113, 227, 0.04)' : 'rgba(0,0,0,0.01)',
          transition: 'all 0.2s ease-in-out',
          textAlign: 'center',
          cursor: 'pointer',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'rgba(0, 113, 227, 0.04)'
          }
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload').click()}
      >
        <input 
          id="file-upload" 
          type="file" 
          hidden 
          onChange={handleFileChange} 
          accept=".csv,.xlsx,.xls" 
        />
        
        {loading ? (
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress 
              size={36} 
              sx={{ 
                color: 'primary.main',
                mb: 2
              }} 
            />
            <Typography 
              variant="body1" 
              color="text.secondary"
              sx={{ 
                fontWeight: 500,
              }}
            >
              正在上传...
            </Typography>
          </Box>
        ) : (
          <Box>
            <ArrowUpwardIcon 
              sx={{ 
                fontSize: 36, 
                color: dragActive ? 'primary.main' : 'text.secondary',
                mb: 1
              }} 
            />
            <Typography 
              variant="body1" 
              sx={{ 
                mb: 1, 
                fontWeight: 500, 
                color: dragActive ? 'primary.main' : 'text.primary'
              }}
            >
              拖放文件到此处
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              或点击选择文件
            </Typography>
            
            <Button
              variant="contained"
              size="small"
              sx={{ 
                borderRadius: 6, 
                textTransform: 'none',
                px: 3,
                py: 0.75,
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: '0 2px 8px rgba(0, 113, 227, 0.3)'
                }
              }}
            >
              选择文件
            </Button>
          </Box>
        )}
      </Box>
      
      <Box sx={{ 
        mt: 2, 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5
      }}>
        <InfoOutlinedIcon 
          fontSize="small" 
          sx={{ 
            fontSize: '0.875rem',
            color: 'text.secondary' 
          }} 
        />
        <Typography 
          variant="caption" 
          sx={{ 
            color: 'text.secondary',
            fontWeight: 400
          }}
        >
          支持的文件格式: CSV, Excel (.xlsx, .xls)
        </Typography>
      </Box>
    </Box>
  );
};

export default FileUploader;
