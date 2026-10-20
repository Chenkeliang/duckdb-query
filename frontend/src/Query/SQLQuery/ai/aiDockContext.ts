/**
 * 工作台为 AI 面板预留的停靠位（QueryWorkspace 右侧可伸缩分栏）。
 * AiChatDrawer 仍由 QueryTabs 单例挂载（对话状态不随布局变化丢失），
 * 渲染时经 portal 放进这个停靠元素；没有停靠位时（单测、其他宿主）就地渲染。
 */
import { createContext, useContext } from 'react';

export const AiDockContext = createContext<HTMLElement | null>(null);

export function useAiDock(): HTMLElement | null {
  return useContext(AiDockContext);
}
