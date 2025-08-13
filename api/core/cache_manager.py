"""
缓存管理系统
提供查询结果缓存、文件缓存、配置缓存等功能
"""

import hashlib
import json
import logging
import time
from typing import Any, Dict, Optional, Union
from datetime import datetime, timedelta
import pandas as pd
import pickle
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class CacheManager:
    """缓存管理器"""
    
    def __init__(self, cache_dir: str = None, default_ttl: int = 3600):
        if cache_dir is None:
            self.cache_dir = Path.cwd() / "data" / "cache"
        else:
            self.cache_dir = Path(cache_dir)
        
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.default_ttl = default_ttl
        
        # 内存缓存
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        
        # 缓存统计
        self.stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'deletes': 0,
            'cleanups': 0
        }
    
    def _generate_cache_key(self, key_data: Union[str, Dict[str, Any]]) -> str:
        """生成缓存键"""
        if isinstance(key_data, str):
            return hashlib.md5(key_data.encode()).hexdigest()
        else:
            # 对字典进行排序后序列化，确保一致性
            sorted_data = json.dumps(key_data, sort_keys=True, ensure_ascii=False)
            return hashlib.md5(sorted_data.encode()).hexdigest()
    
    def _is_expired(self, cache_entry: Dict[str, Any]) -> bool:
        """检查缓存是否过期"""
        if 'expires_at' not in cache_entry:
            return False
        
        return datetime.now() > datetime.fromisoformat(cache_entry['expires_at'])
    
    def _get_file_path(self, cache_key: str) -> Path:
        """获取缓存文件路径"""
        return self.cache_dir / f"{cache_key}.cache"
    
    def set(self, key: Union[str, Dict[str, Any]], value: Any, ttl: Optional[int] = None) -> bool:
        """设置缓存"""
        try:
            cache_key = self._generate_cache_key(key)
            
            if ttl is None:
                ttl = self.default_ttl
            
            expires_at = datetime.now() + timedelta(seconds=ttl)
            
            cache_entry = {
                'value': value,
                'created_at': datetime.now().isoformat(),
                'expires_at': expires_at.isoformat(),
                'ttl': ttl
            }
            
            # 内存缓存
            self._memory_cache[cache_key] = cache_entry
            
            # 文件缓存（用于持久化）
            try:
                file_path = self._get_file_path(cache_key)
                with open(file_path, 'wb') as f:
                    pickle.dump(cache_entry, f)
            except Exception as e:
                logger.warning(f"文件缓存写入失败: {str(e)}")
            
            self.stats['sets'] += 1
            return True
            
        except Exception as e:
            logger.error(f"设置缓存失败: {str(e)}")
            return False
    
    def get(self, key: Union[str, Dict[str, Any]]) -> Optional[Any]:
        """获取缓存"""
        try:
            cache_key = self._generate_cache_key(key)
            
            # 先检查内存缓存
            if cache_key in self._memory_cache:
                cache_entry = self._memory_cache[cache_key]
                if not self._is_expired(cache_entry):
                    self.stats['hits'] += 1
                    return cache_entry['value']
                else:
                    # 过期，删除内存缓存
                    del self._memory_cache[cache_key]
            
            # 检查文件缓存
            file_path = self._get_file_path(cache_key)
            if file_path.exists():
                try:
                    with open(file_path, 'rb') as f:
                        cache_entry = pickle.load(f)
                    
                    if not self._is_expired(cache_entry):
                        # 恢复到内存缓存
                        self._memory_cache[cache_key] = cache_entry
                        self.stats['hits'] += 1
                        return cache_entry['value']
                    else:
                        # 过期，删除文件
                        file_path.unlink()
                except Exception as e:
                    logger.warning(f"文件缓存读取失败: {str(e)}")
                    # 删除损坏的缓存文件
                    try:
                        file_path.unlink()
                    except:
                        pass
            
            self.stats['misses'] += 1
            return None
            
        except Exception as e:
            logger.error(f"获取缓存失败: {str(e)}")
            self.stats['misses'] += 1
            return None
    
    def delete(self, key: Union[str, Dict[str, Any]]) -> bool:
        """删除缓存"""
        try:
            cache_key = self._generate_cache_key(key)
            
            # 删除内存缓存
            if cache_key in self._memory_cache:
                del self._memory_cache[cache_key]
            
            # 删除文件缓存
            file_path = self._get_file_path(cache_key)
            if file_path.exists():
                file_path.unlink()
            
            self.stats['deletes'] += 1
            return True
            
        except Exception as e:
            logger.error(f"删除缓存失败: {str(e)}")
            return False
    
    def clear(self) -> bool:
        """清空所有缓存"""
        try:
            # 清空内存缓存
            self._memory_cache.clear()
            
            # 清空文件缓存
            for cache_file in self.cache_dir.glob("*.cache"):
                cache_file.unlink()
            
            logger.info("缓存已清空")
            return True
            
        except Exception as e:
            logger.error(f"清空缓存失败: {str(e)}")
            return False
    
    def cleanup_expired(self) -> int:
        """清理过期缓存"""
        cleaned_count = 0
        
        try:
            # 清理内存缓存
            expired_keys = []
            for cache_key, cache_entry in self._memory_cache.items():
                if self._is_expired(cache_entry):
                    expired_keys.append(cache_key)
            
            for key in expired_keys:
                del self._memory_cache[key]
                cleaned_count += 1
            
            # 清理文件缓存
            for cache_file in self.cache_dir.glob("*.cache"):
                try:
                    with open(cache_file, 'rb') as f:
                        cache_entry = pickle.load(f)
                    
                    if self._is_expired(cache_entry):
                        cache_file.unlink()
                        cleaned_count += 1
                        
                except Exception:
                    # 损坏的文件，直接删除
                    cache_file.unlink()
                    cleaned_count += 1
            
            self.stats['cleanups'] += 1
            logger.info(f"清理了 {cleaned_count} 个过期缓存项")
            return cleaned_count
            
        except Exception as e:
            logger.error(f"清理过期缓存失败: {str(e)}")
            return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'hits': self.stats['hits'],
            'misses': self.stats['misses'],
            'hit_rate': f"{hit_rate:.2f}%",
            'sets': self.stats['sets'],
            'deletes': self.stats['deletes'],
            'cleanups': self.stats['cleanups'],
            'memory_cache_size': len(self._memory_cache),
            'file_cache_size': len(list(self.cache_dir.glob("*.cache")))
        }


class QueryCache:
    """查询结果缓存"""
    
    def __init__(self, cache_manager: CacheManager):
        self.cache_manager = cache_manager
    
    def get_query_cache_key(self, sql: str, connection_params: Dict[str, Any] = None) -> Dict[str, Any]:
        """生成查询缓存键"""
        key_data = {
            'type': 'query',
            'sql': sql.strip().lower(),
        }
        
        if connection_params:
            # 只包含影响查询结果的参数，排除密码等敏感信息
            safe_params = {
                'host': connection_params.get('host'),
                'port': connection_params.get('port'),
                'database': connection_params.get('database'),
                'user': connection_params.get('user') or connection_params.get('username')
            }
            key_data['connection'] = safe_params
        
        return key_data
    
    def get_cached_query_result(self, sql: str, connection_params: Dict[str, Any] = None) -> Optional[pd.DataFrame]:
        """获取缓存的查询结果"""
        cache_key = self.get_query_cache_key(sql, connection_params)
        cached_data = self.cache_manager.get(cache_key)
        
        if cached_data is not None:
            try:
                # 将缓存的数据转换回DataFrame
                if isinstance(cached_data, dict) and 'data' in cached_data and 'columns' in cached_data:
                    df = pd.DataFrame(cached_data['data'], columns=cached_data['columns'])
                    logger.info(f"使用缓存的查询结果，{len(df)} 行")
                    return df
            except Exception as e:
                logger.warning(f"缓存数据格式错误: {str(e)}")
        
        return None
    
    def cache_query_result(self, sql: str, result_df: pd.DataFrame, 
                          connection_params: Dict[str, Any] = None, ttl: int = 3600) -> bool:
        """缓存查询结果"""
        try:
            cache_key = self.get_query_cache_key(sql, connection_params)
            
            # 将DataFrame转换为可序列化的格式
            cached_data = {
                'data': result_df.to_dict(orient='records'),
                'columns': result_df.columns.tolist(),
                'row_count': len(result_df),
                'cached_at': datetime.now().isoformat()
            }
            
            return self.cache_manager.set(cache_key, cached_data, ttl)
            
        except Exception as e:
            logger.error(f"缓存查询结果失败: {str(e)}")
            return False


# 全局缓存管理器实例
cache_manager = CacheManager()
query_cache = QueryCache(cache_manager)
