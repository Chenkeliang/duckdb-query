import React from "react";

/**
 * Simple header bar for new layout.
 * Left: page title（或自定义节点）；Right: 页面级操作（Tabs / 按钮等）。
 * 
 * Note: This component is a container. Child components should use shadcn/ui Button
 * components when needed. The Header itself doesn't render buttons directly.
 */
const Header = ({ title, titleNode, children }) => {
  const renderedTitle =
    titleNode ||
    (title ? (
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
    ) : null);

  return (
    <div className="dq-layout-header-inner flex h-14 items-center justify-between px-4 bg-surface border-b border-border">
      <div className="flex items-center gap-6">{renderedTitle}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
};

export default Header;
