import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography
} from '@mui/material';
import { Star } from 'lucide-react';
import React, { useEffect, useState } from 'react';

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
    }
};

const SQLFavoritesSelect = ({ onSelectFavorite, placeholder = "选择收藏的SQL", filterType = null }) => {
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedValue, setSelectedValue] = useState('');

    // 加载收藏列表
    const loadFavorites = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiClient.getFavorites();
            setFavorites(data);
        } catch (err) {
            setError(err.message);
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

    // 渲染菜单项
    const renderMenuItem = (favorite) => (
        <MenuItem key={favorite.id} value={favorite.id}>
            <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Star size={16} color="#1976d2" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {favorite.name}
                    </Typography>
                    {favorite.usage_count > 0 && (
                        <Chip
                            label={`${favorite.usage_count}次`}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ fontSize: '0.75rem', height: 20 }}
                        />
                    )}
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
                        backgroundColor: '#f5f5f5',
                        padding: '2px 6px',
                        borderRadius: 1,
                        display: 'block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.75rem'
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
                                sx={{ fontSize: '0.7rem', height: 18 }}
                            />
                        ))}
                        {favorite.tags.length > 3 && (
                            <Chip
                                label={`+${favorite.tags.length - 3}`}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 18 }}
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
                <InputLabel>选择收藏的SQL</InputLabel>
                <Select
                    value=""
                    label="选择收藏的SQL"
                    disabled
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

    return (
        <Box sx={{ mb: 2 }}>
            <FormControl fullWidth size="small">
                <InputLabel id="sql-favorites-select-label">{placeholder}</InputLabel>
                <Select
                    labelId="sql-favorites-select-label"
                    value={selectedValue}
                    label={placeholder}
                    onChange={handleChange}
                    displayEmpty
                    sx={{
                        '& .MuiSelect-select': {
                            py: 1.5
                        }
                    }}
                >
                    {favorites.filter(fav => !filterType || fav.type === filterType).length === 0 ? (
                        <MenuItem value="" disabled>
                            <Typography color="text.secondary" variant="body2">
                                暂无收藏的SQL
                            </Typography>
                        </MenuItem>
                    ) : (
                        favorites
                            .filter(fav => !filterType || fav.type === filterType)
                            .map(renderMenuItem)
                    )}
                </Select>
            </FormControl>
        </Box>
    );
};

export default SQLFavoritesSelect;
