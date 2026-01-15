/**
 * useAutoScroll - 边缘自动滚动 Hook
 * 
 * 当拖拽到网格边缘时自动滚动
 * 阈值 50px，速度随距离递增
 */

import { useRef, useCallback, useEffect } from 'react';

/** 边缘检测阈值（像素） */
const EDGE_THRESHOLD = 50;
/** 最小滚动速度 */
const MIN_SCROLL_SPEED = 2;
/** 最大滚动速度 */
const MAX_SCROLL_SPEED = 20;

export interface UseAutoScrollOptions {
  /** 滚动容器 ref */
  containerRef: React.RefObject<HTMLElement | null>;
  /** 是否启用 */
  enabled: boolean;
}

export interface UseAutoScrollReturn {
  /** 处理鼠标移动（在拖拽过程中调用） */
  handleMouseMove: (clientX: number, clientY: number) => void;
  /** 停止自动滚动 */
  stopAutoScroll: () => void;
}

/**
 * 计算滚动速度（距离边缘越近，速度越快）
 */
function calculateScrollSpeed(distance: number): number {
  if (distance >= EDGE_THRESHOLD) return 0;
  
  // 线性插值：距离越近，速度越快
  const ratio = 1 - distance / EDGE_THRESHOLD;
  return MIN_SCROLL_SPEED + ratio * (MAX_SCROLL_SPEED - MIN_SCROLL_SPEED);
}

export function useAutoScroll({
  containerRef,
  enabled,
}: UseAutoScrollOptions): UseAutoScrollReturn {
  const animationFrameRef = useRef<number | null>(null);
  const scrollDirectionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 执行滚动动画
  const performScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { x, y } = scrollDirectionRef.current;
    
    if (x !== 0 || y !== 0) {
      container.scrollBy(x, y);
      animationFrameRef.current = requestAnimationFrame(performScroll);
    }
  }, [containerRef]);

  // 处理鼠标移动
  const handleMouseMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();

      // 计算到各边缘的距离
      const distanceToLeft = clientX - rect.left;
      const distanceToRight = rect.right - clientX;
      const distanceToTop = clientY - rect.top;
      const distanceToBottom = rect.bottom - clientY;

      // 计算滚动方向和速度
      let scrollX = 0;
      let scrollY = 0;

      if (distanceToLeft < EDGE_THRESHOLD) {
        scrollX = -calculateScrollSpeed(distanceToLeft);
      } else if (distanceToRight < EDGE_THRESHOLD) {
        scrollX = calculateScrollSpeed(distanceToRight);
      }

      if (distanceToTop < EDGE_THRESHOLD) {
        scrollY = -calculateScrollSpeed(distanceToTop);
      } else if (distanceToBottom < EDGE_THRESHOLD) {
        scrollY = calculateScrollSpeed(distanceToBottom);
      }

      scrollDirectionRef.current = { x: scrollX, y: scrollY };

      // 如果需要滚动且动画未启动，启动动画
      if ((scrollX !== 0 || scrollY !== 0) && !animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(performScroll);
      }
    },
    [enabled, containerRef, performScroll]
  );

  // 停止自动滚动
  const stopAutoScroll = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    scrollDirectionRef.current = { x: 0, y: 0 };
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    handleMouseMove,
    stopAutoScroll,
  };
}
