import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    List,
    ListItem,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {
    Play,
    Plus,
    Star,
    Trash2
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

// API 调用函数
const apiClient = {
    async getFavorites() {
        const response = await fetch('/api/sql-favorites');
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '获取收藏失败');
        return data.data;
    },

    async createFavorite(favorite) {
        const response = await fetch('/api/sql-favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(favorite)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '创建收藏失败');
        return data.data;
    },

    async updateFavorite(id, favorite) {
        const response = await fetch(`/api/sql-favorites/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(favorite)
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '更新收藏失败');
        return data.data;
    },

    async deleteFavorite(id) {
        const response = await fetch(`/api/sql-favorites/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '删除收藏失败');
        return data.data;
    },

    async useFavorite(id) {
        const response = await fetch(`/api/sql-favorites/${id}/use`, {
            method: 'POST'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '更新使用次数失败');
        return data.data;
    }
};

const SQLFavoritesManager = ({ onSelectFavorite, compact = false, filterType = null }) => {
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingFavorite, setEditingFavorite] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        sql: '',
        description: '',
        tags: []
    });
    const [tagInput, setTagInput] = useState('');
    const { showToast } = useToast();

    // 加载收藏列表
    const loadFavorites = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiClient.getFavorites();
            setFavorites(data);
        } catch (err) {
            setError(err.message);
            showToast('加载收藏失败: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFavorites();

        // 监听收藏更新事件
        const handleFavoritesUpdate = () => {
            loadFavorites();
        };

        window.addEventListener('sqlFavoritesUpdated', handleFavoritesUpdate);

        return () => {
            window.removeEventListener('sqlFavoritesUpdated', handleFavoritesUpdate);
        };
    }, []);

    // 处理收藏选择
    const handleSelectFavorite = async (favorite) => {
        try {
            // 增加使用次数
            await apiClient.useFavorite(favorite.id);

            // 通知父组件
            if (onSelectFavorite) {
                onSelectFavorite(favorite);
            }

            // 重新加载列表以更新使用次数
            loadFavorites();

            showToast(`已选择收藏: ${favorite.name}`, 'success');
        } catch (err) {
            showToast('选择收藏失败: ' + err.message, 'error');
        }
    };

    // 处理添加收藏
    const handleAddFavorite = async () => {
        if (!formData.name.trim() || !formData.sql.trim()) {
            showToast('请填写名称和SQL内容', 'warning');
            return;
        }

        try {
            await apiClient.createFavorite(formData);
            setAddDialogOpen(false);
            setFormData({ name: '', sql: '', description: '', tags: [] });
            loadFavorites();
            showToast('收藏已添加', 'success');
        } catch (err) {
            showToast('添加收藏失败: ' + err.message, 'error');
        }
    };

    // 处理编辑收藏
    const handleEditFavorite = async () => {
        if (!formData.name.trim() || !formData.sql.trim()) {
            showToast('请填写名称和SQL内容', 'warning');
            return;
        }

        try {
            await apiClient.updateFavorite(editingFavorite.id, formData);
            setEditDialogOpen(false);
            setEditingFavorite(null);
            setFormData({ name: '', sql: '', description: '', tags: [] });
            loadFavorites();
            showToast('收藏已更新', 'success');
        } catch (err) {
            showToast('更新收藏失败: ' + err.message, 'error');
        }
    };

    // 处理删除收藏
    const handleDeleteFavorite = async (favorite) => {
        try {
            await apiClient.deleteFavorite(favorite.id);
            loadFavorites();
            showToast(`收藏 "${favorite.name}" 已删除`, 'success');
            // 触发全局刷新事件
            window.dispatchEvent(new CustomEvent('sqlFavoritesUpdated'));
        } catch (err) {
            showToast('删除收藏失败: ' + err.message, 'error');
        }
    };

    // 打开编辑对话框
    const openEditDialog = (favorite) => {
        setEditingFavorite(favorite);
        setFormData({
            name: favorite.name,
            sql: favorite.sql,
            description: favorite.description || '',
            tags: favorite.tags || []
        });
        setEditDialogOpen(true);
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

    // 渲染收藏项
    const renderFavoriteItem = (favorite) => (
        <ListItem
            key={favorite.id}
            sx={{
                border: '1px solid #e0e0e0',
                borderRadius: 2,
                mb: 1.5,
                backgroundColor: '#fff',
                padding: 2,
                display: 'flex',
                alignItems: 'flex-start',
                '&:hover': {
                    backgroundColor: '#ffffff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                }
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* 标题和使用次数 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        {favorite.name}
                    </Typography>
                    {favorite.usage_count > 0 && (
                        <Chip
                            label={`${favorite.usage_count}次`}
                            size="small"
                            color="primary"
                            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500 }}
                        />
                    )}
                </Box>

                {/* 描述 */}
                {favorite.description && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 1, fontSize: '0.85rem', lineHeight: 1.4 }}
                    >
                        {favorite.description}
                    </Typography>
                )}

                {/* SQL代码 */}
                <Typography
                    variant="caption"
                    component="div"
                    sx={{
                        fontFamily: 'monospace',
                        backgroundColor: '#f5f5f5',
                        padding: '6px 10px',
                        borderRadius: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.75rem',
                        color: '#555',
                        mb: 1
                    }}
                >
                    {favorite.sql}
                </Typography>

                {/* 标签 */}
                {favorite.tags && favorite.tags.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {favorite.tags.map((tag, index) => (
                            <Chip
                                key={index}
                                label={tag}
                                size="small"
                                variant="outlined"
                                sx={{
                                    fontSize: '0.7rem',
                                    height: 20,
                                    borderColor: '#ddd',
                                    color: '#666'
                                }}
                            />
                        ))}
                    </Box>
                )}
            </Box>
            <Box sx={{ ml: 2, display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="使用此SQL">
                        <IconButton
                            size="small"
                            onClick={() => handleSelectFavorite(favorite)}
                            sx={{ color: 'primary.main' }}
                        >
                            <Play size={16} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="删除">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFavorite(favorite);
                            }}
                            sx={{ color: 'error.main' }}
                        >
                            <Trash2 size={16} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </ListItem>
    );

    if (compact) {
        return (
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Star size={20} color="#1976d2" />
                        收藏的SQL
                    </Typography>
                </Box>

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {!loading && !error && favorites.length === 0 && (
                    <Alert severity="info">
                        暂无收藏的SQL，点击"添加收藏"开始收藏常用的SQL语句。
                    </Alert>
                )}

                {!loading && !error && favorites.length > 0 && (
                    <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                        {favorites
                            .filter(fav => !filterType || fav.type === filterType)
                            .map(renderFavoriteItem)}
                    </List>
                )}
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Star size={24} color="#1976d2" />
                    SQL收藏管理
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<Plus size={16} />}
                    onClick={() => setAddDialogOpen(true)}
                >
                    添加收藏
                </Button>
            </Box>

            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                </Box>
            )}

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {!loading && !error && favorites.length === 0 && (
                <Alert severity="info">
                    暂无收藏的SQL，点击"添加收藏"开始收藏常用的SQL语句。
                </Alert>
            )}

            {!loading && !error && favorites.length > 0 && (
                <List>
                    {favorites
                        .filter(fav => !filterType || fav.type === filterType)
                        .map(renderFavoriteItem)}
                </List>
            )}

            {/* 添加收藏对话框 */}
            <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>添加SQL收藏</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="收藏名称"
                        fullWidth
                        variant="outlined"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="SQL内容"
                        fullWidth
                        multiline
                        rows={6}
                        variant="outlined"
                        value={formData.sql}
                        onChange={(e) => setFormData({ ...formData, sql: e.target.value })}
                        sx={{ mb: 2, '& textarea': { fontFamily: 'monospace' } }}
                    />
                    <TextField
                        margin="dense"
                        label="描述"
                        fullWidth
                        variant="outlined"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>标签</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <TextField
                                size="small"
                                placeholder="输入标签"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addTag()}
                            />
                            <Button size="small" onClick={addTag}>添加</Button>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {formData.tags.map((tag, index) => (
                                <Chip
                                    key={index}
                                    label={tag}
                                    onDelete={() => removeTag(tag)}
                                    size="small"
                                />
                            ))}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialogOpen(false)}>取消</Button>
                    <Button onClick={handleAddFavorite} variant="contained">添加</Button>
                </DialogActions>
            </Dialog>

            {/* 编辑收藏对话框 */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>编辑SQL收藏</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="收藏名称"
                        fullWidth
                        variant="outlined"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="SQL内容"
                        fullWidth
                        multiline
                        rows={6}
                        variant="outlined"
                        value={formData.sql}
                        onChange={(e) => setFormData({ ...formData, sql: e.target.value })}
                        sx={{ mb: 2, '& textarea': { fontFamily: 'monospace' } }}
                    />
                    <TextField
                        margin="dense"
                        label="描述"
                        fullWidth
                        variant="outlined"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>标签</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <TextField
                                size="small"
                                placeholder="输入标签"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addTag()}
                            />
                            <Button size="small" onClick={addTag}>添加</Button>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {formData.tags.map((tag, index) => (
                                <Chip
                                    key={index}
                                    label={tag}
                                    onDelete={() => removeTag(tag)}
                                    size="small"
                                />
                            ))}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
                    <Button onClick={handleEditFavorite} variant="contained">保存</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SQLFavoritesManager;
