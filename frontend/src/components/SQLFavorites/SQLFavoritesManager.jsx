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
import { withOpacity, resolveColor } from '../../utils/colorUtils';

const getIsDarkMode = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

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
    const [isDarkMode, setIsDarkMode] = useState(getIsDarkMode);

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
    const accent = isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)';
    const accentFallback = resolveColor('var(--dq-accent-primary)', isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)');
    const accentOverlay = (amount) => withOpacity(accent, amount, accentFallback);
    const neutralOverlay = (amount) => withOpacity('var(--dq-border)', amount, resolveColor('var(--dq-border)', 'var(--dq-border)'));
    const accentGradientBase = `linear-gradient(135deg, color-mix(in oklab, ${accentFallback} 95%, transparent) 0%, color-mix(in oklab, ${accentFallback} 80%, transparent) 100%)`;
    const accentGradientHover = `linear-gradient(135deg, color-mix(in oklab, ${accentFallback} 100%, transparent) 0%, color-mix(in oklab, ${accentFallback} 90%, transparent) 100%)`;
    const accentShadow = 'var(--dq-accent-shadow)';
    const neutralDialogShadow = 'var(--dq-shadow-soft)';
    const inputFieldSx = {
        '& .MuiInputLabel-root': {
            color: isDarkMode ? 'var(--dq-text-secondary)' : undefined
        },
        '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            backgroundColor: 'var(--dq-surface)',
            '& fieldset': {
                borderColor: 'var(--dq-border-subtle)'
            },
            '&:hover fieldset': {
                borderColor: 'var(--dq-accent-100)'
            },
            '& input, & textarea': {
                color: isDarkMode ? 'var(--dq-text-primary)' : undefined
            }
        },
        '& .MuiFormHelperText-root': {
            color: isDarkMode ? 'var(--dq-text-tertiary)' : undefined
        }
    };
    const renderFavoriteItem = (favorite) => (
        <ListItem
            key={favorite.id}
            sx={{
                border: '1px solid var(--dq-border-subtle)',
                borderRadius: 2,
                mb: 1.5,
                backgroundColor: 'var(--dq-surface-card)',
                padding: 2,
                display: 'flex',
                alignItems: 'flex-start',
                transition: 'border-color 0.18s ease, background-color 0.18s ease',
                '&:hover': {
                    borderColor: 'var(--dq-border-card)',
                    backgroundColor: 'var(--dq-surface-card-active)'
                },
                '&:focus-within': {
                    borderColor: 'var(--dq-accent-100)',
                    backgroundColor: 'var(--dq-surface-card-active)',
                    boxShadow: 'none'
                }
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* 标题和使用次数 */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '16px', color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>
                        {favorite.name}
                    </Typography>
                    {favorite.usage_count > 0 && (
                        <Chip
                            label={`${favorite.usage_count}次`}
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: '1rem',
                                fontWeight: 500,
                                backgroundColor: accentOverlay(isDarkMode ? 0.25 : 0.12),
                                color: isDarkMode ? 'var(--dq-surface)' : accent
                            }}
                        />
                    )}
                </Box>

                {/* 描述 */}
                {favorite.description && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 1, fontSize: '1rem', lineHeight: 1.4, color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}
                    >
                        {favorite.description}
                    </Typography>
                )}

                {/* SQL代码 */}
                <Typography
                    variant="caption"
                    component="div"
                    sx={{
                        fontFamily: 'var(--dq-font-mono)',
                        backgroundColor: 'var(--dq-surface-card-active)',
                        border: '1px solid var(--dq-border-card)',
                        padding: '10px 12px',
                        borderRadius: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '1rem',
                        color: 'var(--dq-text-primary)',
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
                                    fontSize: '1rem',
                                    height: 20,
                                    borderColor: 'var(--dq-border-subtle)',
                                    color: 'var(--dq-text-secondary)'
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
                            sx={{
                                color: isDarkMode ? 'var(--dq-accent-100)' : accent,
                                backgroundColor: accentOverlay(isDarkMode ? 0.12 : 0.08),
                                '&:hover': {
                                    backgroundColor: accentOverlay(isDarkMode ? 0.22 : 0.16)
                                }
                            }}
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
                            sx={{
                                color: isDarkMode ? 'color-mix(in oklab, var(--dq-status-error-fg) 65%, transparent)' : 'var(--dq-text-primary)',
                                '&:hover': {
                            backgroundColor: isDarkMode ? 'color-mix(in oklab, var(--dq-status-error-fg) 18%, transparent)' : 'color-mix(in oklab, var(--dq-status-error-fg) 12%, transparent)'
                                }
                            }}
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
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>
                        <Star size={20} color={isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)'} />
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
                    <List
                        sx={{
                            maxHeight: 300,
                            overflow: 'auto',
                            pr: 0.5,
                            '&::-webkit-scrollbar': {
                                width: '6px'
                            },
                            '&::-webkit-scrollbar-thumb': {
                                backgroundColor: isDarkMode ? neutralOverlay(0.28) : neutralOverlay(0.4),
                                borderRadius: '999px'
                            }
                        }}
                    >
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
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>
                    <Star size={24} color={isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)'} />
                    SQL收藏管理
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<Plus size={16} />}
                    onClick={() => setAddDialogOpen(true)}
                    sx={{
                        textTransform: 'none',
                        borderRadius: 2,
                        fontWeight: 600,
                        background: accentGradientBase,
                        boxShadow: accentShadow,
                        '&:hover': {
                            background: accentGradientHover,
                            boxShadow: accentShadow
                        }
                    }}
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
                <List
                    sx={{
                        maxHeight: '50vh',
                        overflow: 'auto',
                        pr: 0.5,
                        '&::-webkit-scrollbar': {
                            width: '6px'
                        },
                        '&::-webkit-scrollbar-thumb': {
                        backgroundColor: isDarkMode ? neutralOverlay(0.28) : neutralOverlay(0.4),
                            borderRadius: '999px'
                        }
                    }}
                >
                    {favorites
                        .filter(fav => !filterType || fav.type === filterType)
                        .map(renderFavoriteItem)}
                </List>
            )}

            {/* 添加收藏对话框 */}
            <Dialog
                open={addDialogOpen}
                onClose={() => setAddDialogOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        backgroundColor: 'var(--dq-surface)',
                        borderRadius: 3,
                        border: `1px solid ${isDarkMode ? 'var(--dq-border)' : 'var(--dq-border-subtle)'}`,
                        boxShadow: neutralDialogShadow
                    }
                }}
            >
                <DialogTitle sx={{ color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>添加SQL收藏</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="收藏名称"
                        fullWidth
                        variant="outlined"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        sx={{ ...inputFieldSx, mb: 2 }}
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
                        sx={{ ...inputFieldSx, mb: 2, '& textarea': { fontFamily: 'monospace' } }}
                    />
                    <TextField
                        margin="dense"
                        label="描述"
                        fullWidth
                        variant="outlined"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        sx={{ ...inputFieldSx, mb: 2 }}
                    />
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}>标签</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <TextField
                                size="small"
                                placeholder="输入标签"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag();
                                    }
                                }}
                                sx={{ ...inputFieldSx, flex: 1 }}
                            />
                            <Button size="small" variant="outlined" onClick={addTag} sx={{
                                textTransform: 'none',
                                borderRadius: 2,
                                borderColor: 'var(--dq-border-subtle)',
                                color: 'var(--dq-text-secondary)',
                                '&:hover': {
                                    borderColor: 'var(--dq-border-hover)',
                                    color: 'var(--dq-accent-100)'
                                }
                            }}>添加</Button>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {formData.tags.map((tag, index) => (
                                <Chip
                                    key={index}
                                    label={tag}
                                    onDelete={() => removeTag(tag)}
                                    size="small"
                                    sx={{
                                        backgroundColor: accentOverlay(isDarkMode ? 0.18 : 0.12),
                                        color: isDarkMode ? 'var(--dq-surface)' : accent
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialogOpen(false)} sx={{ color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}>取消</Button>
                    <Button
                        onClick={handleAddFavorite}
                        variant="contained"
                        sx={{
                            textTransform: 'none',
                            borderRadius: 2,
                            background: accentGradientBase,
                            boxShadow: accentShadow,
                            '&:hover': {
                                background: accentGradientHover,
                                boxShadow: accentShadow
                            }
                        }}
                    >
                        添加
                    </Button>
                </DialogActions>
            </Dialog>

            {/* 编辑收藏对话框 */}
            <Dialog
                open={editDialogOpen}
                onClose={() => setEditDialogOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        backgroundColor: 'var(--dq-surface)',
                        borderRadius: 3,
                        border: `1px solid ${isDarkMode ? 'var(--dq-border)' : 'var(--dq-border-subtle)'}`,
                        boxShadow: neutralDialogShadow
                    }
                }}
            >
                <DialogTitle sx={{ color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>编辑SQL收藏</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="收藏名称"
                        fullWidth
                        variant="outlined"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        sx={{ ...inputFieldSx, mb: 2 }}
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
                        sx={{ ...inputFieldSx, mb: 2, '& textarea': { fontFamily: 'monospace' } }}
                    />
                    <TextField
                        margin="dense"
                        label="描述"
                        fullWidth
                        variant="outlined"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        sx={{ ...inputFieldSx, mb: 2 }}
                    />
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}>标签</Typography>
                        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <TextField
                                size="small"
                                placeholder="输入标签"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag();
                                    }
                                }}
                                sx={{ ...inputFieldSx, flex: 1 }}
                            />
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={addTag}
                                sx={{
                                    textTransform: 'none',
                                    borderRadius: 2,
                                    borderColor: 'var(--dq-border-subtle)',
                                    color: 'var(--dq-text-secondary)',
                                    '&:hover': {
                                        borderColor: 'var(--dq-border-hover)',
                                        color: 'var(--dq-accent-100)'
                                    }
                                }}
                            >
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
                                    sx={{
                                        backgroundColor: isDarkMode ? accentOverlay(0.18) : accentOverlay(0.12),
                                        color: isDarkMode ? 'var(--dq-surface)' : accentFallback
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)} sx={{ color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}>取消</Button>
                    <Button
                        onClick={handleEditFavorite}
                        variant="contained"
                        sx={{
                            textTransform: 'none',
                            borderRadius: 2,
                            background: accentGradientBase,
                            boxShadow: accentShadow,
                            '&:hover': {
                                background: accentGradientHover,
                                boxShadow: accentShadow
                            }
                        }}
                    >
                        保存
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SQLFavoritesManager;
