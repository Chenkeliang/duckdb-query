import { Activity, AlertTriangle, Database, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
    clearOldErrors,
    getConnectionPoolStatus,
    getErrorStatistics,
    resetConnectionPool
} from '../../services/apiClient';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '../ui/card';
import { Progress } from '../ui/progress';

const SystemMonitor = () => {
    const [poolStatus, setPoolStatus] = useState(null);
    const [errorStats, setErrorStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);

    const fetchPoolStatus = async () => {
        try {
            const response = await getConnectionPoolStatus();
            setPoolStatus(response.pool_status);
        } catch (error) {
            console.error('获取连接池状态失败:', error);
        }
    };

    const fetchErrorStats = async () => {
        try {
            const response = await getErrorStatistics();
            setErrorStats(response.error_statistics);
        } catch (error) {
            console.error('获取错误统计失败:', error);
        }
    };

    const handleResetPool = async () => {
        if (!confirm('确定要重置连接池吗？这将关闭所有现有连接。')) {
            return;
        }

        setLoading(true);
        try {
            await resetConnectionPool();
            await fetchPoolStatus();
            alert('连接池重置成功');
        } catch (error) {
            alert('连接池重置失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClearErrors = async () => {
        if (!confirm('确定要清理30天前的错误记录吗？')) {
            return;
        }

        try {
            await clearOldErrors(30);
            await fetchErrorStats();
            alert('错误记录清理成功');
        } catch (error) {
            alert('错误记录清理失败: ' + error.message);
        }
    };

    const refreshAll = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchPoolStatus(), fetchErrorStats()]);
            setLastUpdate(new Date());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshAll();

        // 每30秒自动刷新
        const interval = setInterval(refreshAll, 30000);
        return () => clearInterval(interval);
    }, []);

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'destructive';
            case 'high': return 'destructive';
            case 'medium': return 'default';
            case 'low': return 'secondary';
            default: return 'secondary';
        }
    };

    const getConnectionHealth = () => {
        if (!poolStatus) return 'unknown';

        const { total_connections, error_connections } = poolStatus;
        const errorRate = error_connections / total_connections;

        if (errorRate > 0.3) return 'poor';
        if (errorRate > 0.1) return 'fair';
        return 'good';
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">系统状态监控</h2>
                <Button onClick={refreshAll} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    刷新
                </Button>
            </div>

            {lastUpdate && (
                <p className="text-sm text-muted-foreground">
                    最后更新: {lastUpdate.toLocaleString()}
                </p>
            )}

            {/* 连接池状态 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        连接池状态
                    </CardTitle>
                    <CardDescription>
                        监控DuckDB连接池的健康状态和性能指标
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {poolStatus ? (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-600">
                                        {poolStatus.total_connections}
                                    </div>
                                    <div className="text-sm text-muted-foreground">总连接数</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-600">
                                        {poolStatus.idle_connections}
                                    </div>
                                    <div className="text-sm text-muted-foreground">空闲连接</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-orange-600">
                                        {poolStatus.busy_connections}
                                    </div>
                                    <div className="text-sm text-muted-foreground">忙碌连接</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-red-600">
                                        {poolStatus.error_connections}
                                    </div>
                                    <div className="text-sm text-muted-foreground">错误连接</div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>连接池健康度</span>
                                    <Badge variant={getConnectionHealth() === 'good' ? 'default' : 'destructive'}>
                                        {getConnectionHealth() === 'good' ? '良好' :
                                            getConnectionHealth() === 'fair' ? '一般' : '差'}
                                    </Badge>
                                </div>
                                <Progress
                                    value={(poolStatus.idle_connections / poolStatus.total_connections) * 100}
                                    className="h-2"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleResetPool}
                                    disabled={loading}
                                    className="flex-1"
                                >
                                    重置连接池
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            加载中...
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 错误统计 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        错误统计
                    </CardTitle>
                    <CardDescription>
                        系统错误统计和监控信息
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {errorStats ? (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-red-600">
                                        {errorStats.total_errors}
                                    </div>
                                    <div className="text-sm text-muted-foreground">总错误数</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-orange-600">
                                        {errorStats.severity_distribution?.high || 0}
                                    </div>
                                    <div className="text-sm text-muted-foreground">高严重性</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-yellow-600">
                                        {errorStats.severity_distribution?.medium || 0}
                                    </div>
                                    <div className="text-sm text-muted-foreground">中严重性</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-600">
                                        {errorStats.severity_distribution?.low || 0}
                                    </div>
                                    <div className="text-sm text-muted-foreground">低严重性</div>
                                </div>
                            </div>

                            {/* 错误类别分布 */}
                            {errorStats.category_distribution && (
                                <div className="space-y-2">
                                    <h4 className="font-medium">错误类别分布</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(errorStats.category_distribution).map(([category, count]) => (
                                            <Badge key={category} variant="outline">
                                                {category}: {count}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 最近错误 */}
                            {errorStats.recent_errors && errorStats.recent_errors.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="font-medium">最近错误</h4>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {errorStats.recent_errors.slice(0, 5).map((error, index) => (
                                            <Alert key={index}>
                                                <AlertTriangle className="h-4 w-4" />
                                                <AlertDescription>
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium">{error.type}</span>
                                                        <Badge variant={getSeverityColor(error.severity)}>
                                                            {error.severity}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {error.message}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {new Date(error.timestamp).toLocaleString()}
                                                    </p>
                                                </AlertDescription>
                                            </Alert>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleClearErrors}
                                    className="flex-1"
                                >
                                    清理旧错误记录
                                </Button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            加载中...
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 系统性能指标 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        系统性能指标
                    </CardTitle>
                    <CardDescription>
                        实时系统性能监控
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                        性能指标监控功能开发中...
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SystemMonitor;
