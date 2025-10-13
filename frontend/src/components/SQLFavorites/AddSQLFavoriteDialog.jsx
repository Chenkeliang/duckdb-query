import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography
} from '@mui/material';
import { Star } from 'lucide-react';
import React, { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

// API 调用函数
const apiClient = {
    async createFavorite(favorite) {
        const response = await fetch('/api/sql-favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(favorite)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '创建收藏失败');
        return data.data;
    }
};

const AddSQLFavoriteDialog = ({ open, onClose, sqlContent, sqlType = 'duckdb', onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        tags: []
    });
    const [tagInput, setTagInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { showToast } = useToast();

    // 重置表单
    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            tags: []
        });
        setTagInput('');
        setError('');
    };

    // 处理对话框关闭
    const handleClose = () => {
        resetForm();
        onClose();
    };

    // 处理添加收藏
    const handleAddFavorite = async () => {
        if (!formData.name.trim()) {
            setError('请填写收藏名称');
            return;
        }

        if (!sqlContent.trim()) {
            setError('SQL内容不能为空');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const favoriteData = {
                name: formData.name.trim(),
                sql: sqlContent.trim(),
                type: sqlType,  // 添加类型字段
                description: formData.description.trim(),
                tags: formData.tags
            };

            await apiClient.createFavorite(favoriteData);

            showToast('SQL收藏已添加', 'success');
            handleClose();

            if (onSuccess) {
                onSuccess();
            }
        } catch (err) {
            setError(err.message);
            showToast('添加收藏失败: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // 添加标签
    const addTag = () => {
        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
            setFormData({
                ...formData,
                tags: [...formData.tags, tagInput.trim()]
            });
            setTagInput('');
        }
    };

    // 删除标签
    const removeTag = (tagToRemove) => {
        setFormData({
            ...formData,
            tags: formData.tags.filter(tag => tag !== tagToRemove)
        });
    };

    // 处理键盘事件
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            if (e.target.id === 'tag-input') {
                addTag();
            } else {
                handleAddFavorite();
            }
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Star size={20} color="#1976d2" />
                添加SQL收藏
            </DialogTitle>

            <DialogContent>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <TextField
                    autoFocus
                    margin="dense"
                    label="收藏名称"
                    fullWidth
                    variant="outlined"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    onKeyPress={handleKeyPress}
                    sx={{ mb: 2 }}
                    placeholder="例如: 用户查询、数据分析等"
                />

                <TextField
                    margin="dense"
                    label="描述"
                    fullWidth
                    variant="outlined"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    onKeyPress={handleKeyPress}
                    sx={{ mb: 2 }}
                    placeholder="描述这个SQL的用途"
                />

                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>标签</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <TextField
                            id="tag-input"
                            size="small"
                            placeholder="输入标签"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            sx={{ flex: 1 }}
                        />
                        <Button size="small" onClick={addTag} variant="outlined">
                            添加
                        </Button>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {formData.tags.map((tag, index) => (
                            <Chip
                                key={index}
                                label={tag}
                                onDelete={() => removeTag(tag)}
                                size="small"
                                color="primary"
                                variant="outlined"
                            />
                        ))}
                    </Box>
                </Box>

                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>SQL内容</Typography>
                    <Box
                        sx={{
                            backgroundColor: '#f5f5f5',
                            border: '1px solid #e0e0e0',
                            borderRadius: 1,
                            padding: 2,
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                            maxHeight: 200,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap'
                        }}
                    >
                        {sqlContent}
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={handleClose} disabled={loading}>
                    取消
                </Button>
                <Button
                    onClick={handleAddFavorite}
                    variant="contained"
                    disabled={loading || !formData.name.trim() || !sqlContent.trim()}
                >
                    {loading ? '添加中...' : '添加收藏'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AddSQLFavoriteDialog;
