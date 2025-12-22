import { useRef, useCallback } from 'react';

/**
 * 防抖Hook - 防止函数被频繁调用
 */
export const useDebounce = (callback, delay = 1000) => {
  const timeoutRef = useRef(null);
  const lastCallTimeRef = useRef(0);

  const debouncedCallback = useCallback((...args) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTimeRef.current;

    // 如果距离上次调用时间不足delay，则跳过
    if (timeSinceLastCall < delay) {
      return;
    }

    // 清除之前的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 设置新的定时器
    timeoutRef.current = setTimeout(() => {
      lastCallTimeRef.current = Date.now();
      callback(...args);
    }, 100); // 短暂延迟，确保不会有并发调用

  }, [callback, delay]);

  return debouncedCallback;
};

/**
 * 全局防抖管理器 - 跨组件防止重复调用
 */
class GlobalDebounceManager {
  constructor() {
    this.lastCallTimes = new Map();
    this.pendingCalls = new Map();
  }

  /**
   * 防抖执行函数
   */
  debounce(key, fn, delay = 2000) {
    const now = Date.now();
    const lastCallTime = this.lastCallTimes.get(key) || 0;
    const timeSinceLastCall = now - lastCallTime;

    // 如果距离上次调用时间不足delay，则跳过
    if (timeSinceLastCall < delay) {

      // 如果有正在进行的调用，返回该Promise
      if (this.pendingCalls.has(key)) {
        return this.pendingCalls.get(key);
      }

      // 否则返回一个resolved的Promise
      return Promise.resolve(null);
    }

    // 更新最后调用时间
    this.lastCallTimes.set(key, now);

    // 执行函数并缓存Promise
    const promise = fn().finally(() => {
      // 调用完成后清除缓存
      this.pendingCalls.delete(key);
    });

    this.pendingCalls.set(key, promise);
    return promise;
  }

  /**
   * 清除特定key的缓存
   */
  clear(key) {
    this.lastCallTimes.delete(key);
    this.pendingCalls.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clearAll() {
    this.lastCallTimes.clear();
    this.pendingCalls.clear();
  }
}

// 创建全局实例
export const globalDebounce = new GlobalDebounceManager();

// 开发模式下暴露到全局
if (process.env.NODE_ENV === 'development') {
  window.globalDebounce = globalDebounce;
}
