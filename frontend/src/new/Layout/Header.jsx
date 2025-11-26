import React from "react";

/**
 * Simple header bar for new layout.
 * Left: page title（或自定义节点）；Right: 页面级操作（Tabs / 按钮等）。
 */
const Header = ({ title, titleNode, children }) => {
  const renderedTitle =
    titleNode ||
    (title ? (
      <h1 className="text-lg font-semibold text-foreground">
        {title}
      </h1>
    ) : null);

  return (
    <div className="dq-layout-header-inner flex h-14 items-center justify-between px-6 bg-surface border-b border-border">
      <div className="flex items-center gap-6">{renderedTitle}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
};

export default Header;
