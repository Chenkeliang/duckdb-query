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
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Typography
} from '@mui/material';
import { Star, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

const getIsDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

// API 调用函数
const apiClient = {
    async getFavorites() {
        const response = await fetch('/api/sql-favorites');
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '获取收藏失败');
        return data.data;
    },

    async useFavorite(id) {
        const response = await fetch(`/api/sql-favorites/${id}/use`, {
            method: 'POST'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '更新使用次数失败');
        return data.data;
    },

    async deleteFavorite(id) {
        const response = await fetch(`/api/sql-favorites/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '删除收藏失败');
        return data.data;
    }
};

const SQLFavoritesSelect = ({ onSelectFavorite, placeholder = "选择收藏的SQL", filterType = null }) => {
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedValue, setSelectedValue] = useState('');
    const [isDarkMode, setIsDarkMode] = useState(getIsDark);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // 加载收藏列表
    const loadFavorites = async (useSpinner = true) => {
        if (useSpinner) {
            setLoading(true);
        }
        setError('');
        try {
            const data = await apiClient.getFavorites();
            setFavorites(data);
        } catch (err) {
            setError(err.message);
        } finally {
            if (useSpinner) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        loadFavorites();

        // 监听收藏更新事件
        const handleFavoritesUpdate = () => {
            loadFavorites();
        };

        window.addEventListener('sqlFavoritesUpdated', handleFavoritesUpdate);

        const syncTheme = () => setIsDarkMode(getIsDark());
        const handleThemeChange = (event) => {
            if (event?.detail && typeof event.detail.isDark === 'boolean') {
                setIsDarkMode(event.detail.isDark);
            } else {
                syncTheme();
            }
        };

        window.addEventListener('duckquery-theme-change', handleThemeChange);
        let observer;
        if (typeof MutationObserver !== 'undefined') {
            observer = new MutationObserver(syncTheme);
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        }
        syncTheme();

        return () => {
            window.removeEventListener('sqlFavoritesUpdated', handleFavoritesUpdate);
            window.removeEventListener('duckquery-theme-change', handleThemeChange);
            if (observer) {
                observer.disconnect();
            }
        };
    }, []);

    // 处理选择变化
    const handleChange = async (event) => {
        const favoriteId = event.target.value;

        if (favoriteId && favoriteId !== '') {
            const favorite = favorites.find(fav => fav.id === favoriteId);
            if (favorite) {
                try {
                    // 增加使用次数
                    await apiClient.useFavorite(favorite.id);

                    // 通知父组件
                    if (onSelectFavorite) {
                        onSelectFavorite(favorite);
                    }

                    // 重新加载列表以更新使用次数
                    loadFavorites();
                } catch (err) {
                    console.error('更新使用次数失败:', err);
                }
            }
        }

        // 选择后立即清空，允许下次再选择同一项
        setSelectedValue('');
    };

    const openDeleteDialog = (event, favorite) => {
        event.preventDefault();
        event.stopPropagation();
        setDeleteTarget(favorite);
        setDeleteError('');
    };

    const closeDeleteDialog = () => {
        if (isDeleting) {
            return;
        }
        setDeleteTarget(null);
        setDeleteError('');
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) {
            return;
        }
        setIsDeleting(true);
        setDeleteError('');
        try {
            await apiClient.deleteFavorite(deleteTarget.id);
            await loadFavorites(false);
            window.dispatchEvent(new CustomEvent('sqlFavoritesUpdated'));
            setDeleteTarget(null);
        } catch (err) {
            setDeleteError(err.message || '删除收藏失败');
        } finally {
            setIsDeleting(false);
        }
    };

    // 渲染菜单项
    const accentColor = 'var(--dq-accent-100)';
    const renderMenuItem = (favorite) => (
        <MenuItem
            key={favorite.id}
            value={favorite.id}
            sx={{
                alignItems: 'flex-start',
                backgroundColor: isDarkMode ? 'var(--dq-surface)' : undefined,
                '&:hover': {
                    backgroundColor: isDarkMode ? 'var(--dq-surface-active)' : undefined
                }
            }}
        >
            <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
                        <Star size={16} color={isDarkMode ? accentColor : 'var(--dq-accent-primary)'} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isDarkMode ? 'var(--dq-text-primary)' : undefined }}>
                            {favorite.name}
                        </Typography>
                        {favorite.usage_count > 0 && (
                            <Chip
                                label={`${favorite.usage_count}次`}
                                size="small"
                                variant="outlined"
                                sx={{
                                    fontSize: '1rem',
                                    height: 20,
                                    borderColor: isDarkMode ? accentColor : undefined,
                                    color: isDarkMode ? accentColor : undefined
                                }}
                            />
                        )}
                    </Box>
                    <IconButton
                        size="small"
                        aria-label="删除收藏"
                        onClick={(event) => openDeleteDialog(event, favorite)}
                        sx={{
                            color: isDarkMode ? 'var(--dq-text-tertiary)' : 'var(--dq-text-secondary)',
                            p: 0.5,
                            '&:hover': {
                                color: 'var(--dq-status-error-fg)'
                            }
                        }}
                    >
                        <Trash2 size={16} />
                    </IconButton>
                </Box>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                        display: 'block',
                        mb: 0.5,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {favorite.description || '无描述'}
                </Typography>
                <Typography
                    variant="caption"
                    sx={{
                        fontFamily: 'monospace',
                        backgroundColor: isDarkMode ? 'var(--dq-surface-alt)' : 'var(--dq-surface)',
                        padding: '2px 6px',
                        borderRadius: 1,
                        display: 'block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '1rem',
                        color: isDarkMode ? 'var(--dq-text-secondary)' : undefined
                    }}
                >
                    {favorite.sql}
                </Typography>
                {favorite.tags && favorite.tags.length > 0 && (
                    <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {favorite.tags.slice(0, 3).map((tag, index) => (
                            <Chip
                                key={index}
                                label={tag}
                                size="small"
                                variant="outlined"
                                sx={{
                                    fontSize: '1rem',
                                    height: 18,
                                    borderColor: isDarkMode ? 'var(--dq-border-subtle)' : undefined,
                                    color: isDarkMode ? 'var(--dq-text-secondary)' : undefined
                                }}
                            />
                        ))}
                        {favorite.tags.length > 3 && (
                            <Chip
                                label={`+${favorite.tags.length - 3}`}
                                size="small"
                                variant="outlined"
                                sx={{
                                    fontSize: '1rem',
                                    height: 18,
                                    borderColor: isDarkMode ? 'var(--dq-border-subtle)' : undefined,
                                    color: isDarkMode ? 'var(--dq-text-secondary)' : undefined
                                }}
                            />
                        )}
                    </Box>
                )}
            </Box>
        </MenuItem>
    );

    if (loading) {
        return (
            <FormControl fullWidth>
                <InputLabel sx={{ color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}>选择收藏的SQL</InputLabel>
                <Select
                    value=""
                    label="选择收藏的SQL"
                    disabled
                    sx={{
                        backgroundColor: isDarkMode ? 'var(--dq-surface)' : undefined,
                        color: isDarkMode ? 'var(--dq-text-secondary)' : undefined,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: isDarkMode ? 'var(--dq-border-subtle)' : undefined
                        }
                    }}
                >
                    <MenuItem value="">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={16} />
                            <Typography>加载中...</Typography>
                        </Box>
                    </MenuItem>
                </Select>
            </FormControl>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ mb: 2 }}>
                加载收藏失败: {error}
            </Alert>
        );
    }

    const filteredFavorites = favorites.filter(fav => !filterType || fav.type === filterType);
    const hasFavorites = filteredFavorites.length > 0;

    return (
        <Box sx={{ mb: 2 }}>
            <FormControl fullWidth size="small">
                <InputLabel
                    id="sql-favorites-select-label"
                    shrink={!hasFavorites || selectedValue !== ''}
                    sx={{ color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}
                >
                    {hasFavorites ? placeholder : '暂无收藏的SQL'}
                </InputLabel>
                <Select
                    labelId="sql-favorites-select-label"
                    value={selectedValue}
                    label={hasFavorites ? placeholder : '暂无收藏的SQL'}
                    onChange={handleChange}
                    displayEmpty
                    notched={!hasFavorites || selectedValue !== ''}
                    renderValue={(value) => {
                        if (value === '') {
                            return hasFavorites ? '' : '';
                        }
                        const favorite = favorites.find(fav => fav.id === value);
                        return favorite ? favorite.name : value;
                    }}
                    sx={{
                        '& .MuiSelect-select': {
                            py: 1.5,
                            color: isDarkMode ? 'var(--dq-text-primary)' : undefined
                        },
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
                    {!hasFavorites ? (
                        <MenuItem value="" disabled>
                            <Typography color="text.secondary" variant="body2" sx={{ color: isDarkMode ? 'var(--dq-text-secondary)' : undefined }}>
                                暂无收藏的SQL
                            </Typography>
                        </MenuItem>
                    ) : (
                        filteredFavorites.map(renderMenuItem)
                    )}
                </Select>
            </FormControl>

            <Dialog
                className="dq-dialog"
                open={Boolean(deleteTarget)}
                onClose={closeDeleteDialog}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>删除收藏</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
                            确认要删除收藏
                            {deleteTarget ? ` “${deleteTarget.name}” ` : ''}吗？此操作不可撤销。
                        </Typography>
                        {deleteTarget && (
                            <Box sx={{ p: 2, borderRadius: 2, backgroundColor: 'var(--dq-surface-alt)' }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                    {deleteTarget.name}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>
                                    {deleteTarget.description || '无描述'}
                                </Typography>
                            </Box>
                        )}
                        {deleteError && (
                            <Alert severity="error">{deleteError}</Alert>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDeleteDialog} disabled={isDeleting}>取消</Button>
                    <Button
                        onClick={handleConfirmDelete}
                        color="error"
                        variant="contained"
                        disabled={isDeleting}
                    >
                        {isDeleting ? '删除中...' : '确认删除'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SQLFavoritesSelect;
