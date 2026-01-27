"""
请求频率限制器 - 防止API被频繁调用
"""

import time
import logging
from typing import Dict, Tuple
from collections import defaultdict, deque

logger = logging.getLogger(__name__)


class RateLimiter:
    """请求频率限制器"""
    
    def __init__(self):
        # 存储每个客户端的请求时间戳
        self.client_requests: Dict[str, deque] = defaultdict(lambda: deque())
        # 存储每个API端点的全局请求时间戳
        self.endpoint_requests: Dict[str, deque] = defaultdict(lambda: deque())
        # 缓存最近的响应
        self.response_cache: Dict[str, Tuple[float, any]] = {}
        
    def _get_client_key(self, client_ip: str, user_agent: str) -> str:
        """生成客户端唯一标识"""
        return f"{client_ip}:{hash(user_agent) % 10000}"
    
    def _clean_old_requests(self, request_queue: deque, window_seconds: int):
        """清理过期的请求记录"""
        current_time = time.time()
        while request_queue and current_time - request_queue[0] > window_seconds:
            request_queue.popleft()
    
    def is_rate_limited(self, 
                       client_ip: str, 
                       user_agent: str, 
                       endpoint: str,
                       client_limit: int = 5,  # 每个客户端每10秒最多5次请求
                       global_limit: int = 10,  # 全局每10秒最多10次请求
                       window_seconds: int = 10) -> Tuple[bool, str]:
        """
        检查是否应该限制请求
        
        Returns:
            (is_limited, reason)
        """
        current_time = time.time()
        client_key = self._get_client_key(client_ip, user_agent)
        
        # 清理过期记录
        self._clean_old_requests(self.client_requests[client_key], window_seconds)
        self._clean_old_requests(self.endpoint_requests[endpoint], window_seconds)
        
        # 检查客户端限制
        if len(self.client_requests[client_key]) >= client_limit:
            logger.warning(f"Client {client_key} request rate too high: {len(self.client_requests[client_key])} times/{window_seconds}s")
            return True, f"Client request rate too high, please try again later"
        
        # 检查全局限制
        if len(self.endpoint_requests[endpoint]) >= global_limit:
            logger.warning(f"Endpoint {endpoint} global request rate too high: {len(self.endpoint_requests[endpoint])} times/{window_seconds}s")
            return True, f"Server busy, please try again later"
        
        return False, ""
    
    def record_request(self, client_ip: str, user_agent: str, endpoint: str):
        """记录请求"""
        current_time = time.time()
        client_key = self._get_client_key(client_ip, user_agent)
        
        self.client_requests[client_key].append(current_time)
        self.endpoint_requests[endpoint].append(current_time)
        
        logger.info(f"Recording request: client {client_key}, endpoint {endpoint}")
    
    def get_cached_response(self, cache_key: str, cache_seconds: int = 5) -> any:
        """getting缓存的响应"""
        if cache_key in self.response_cache:
            timestamp, response = self.response_cache[cache_key]
            if time.time() - timestamp < cache_seconds:
                logger.info(f"Returning cached response: {cache_key}")
                return response
        return None
    
    def cache_response(self, cache_key: str, response: any):
        """缓存响应"""
        self.response_cache[cache_key] = (time.time(), response)
        
        # 清理过期缓存
        current_time = time.time()
        expired_keys = [
            key for key, (timestamp, _) in self.response_cache.items()
            if current_time - timestamp > 60  # 1分钟后清理
        ]
        for key in expired_keys:
            del self.response_cache[key]
    
    def get_stats(self) -> dict:
        """getting统计info"""
        return {
            "active_clients": len(self.client_requests),
            "cached_responses": len(self.response_cache),
            "total_endpoints": len(self.endpoint_requests)
        }


# 全局限制器实例
rate_limiter = RateLimiter()


def rate_limit_middleware(client_ip: str, 
                         user_agent: str, 
                         endpoint: str,
                         response_data: any = None,
                         client_limit: int = 3,  # 更严格的限制
                         global_limit: int = 5,
                         window_seconds: int = 5,
                         cache_seconds: int = 3) -> Tuple[bool, any, str]:
    """
    请求频率限制中间件
    
    Returns:
        (should_block, cached_response_or_none, error_message)
    """
    
    # 生成缓存键
    cache_key = f"{endpoint}:{client_ip}"
    
    # 检查缓存
    cached_response = rate_limiter.get_cached_response(cache_key, cache_seconds)
    if cached_response is not None:
        return False, cached_response, ""
    
    # 检查频率限制
    is_limited, reason = rate_limiter.is_rate_limited(
        client_ip, user_agent, endpoint, 
        client_limit, global_limit, window_seconds
    )
    
    if is_limited:
        return True, None, reason
    
    # 记录请求
    rate_limiter.record_request(client_ip, user_agent, endpoint)
    
    # 如果提供了响应data，缓存它
    if response_data is not None:
        rate_limiter.cache_response(cache_key, response_data)
    
    return False, None, ""
