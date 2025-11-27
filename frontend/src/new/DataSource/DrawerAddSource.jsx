import React from "react";

/**
 * Placeholder drawer component; replace with shadcn Dialog/Drawer.
 * Props allow integration without breaking current layout.
 */
const DrawerAddSource = ({
  open = false,
  onClose,
  title = "Add Data Source",
  children
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1040] bg-[var(--dq-backdrop-bg)] backdrop-blur-sm">
      <div className="fixed inset-0 z-[1050] flex justify-end">
        <div className="w-full sm:w-[640px] h-full bg-surface-elevated border-l border-border shadow-2xl flex flex-col">
          <div className="px-6 py-5 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            ) : null}
          </div>
          <div className="flex-1 overflow-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
};

export default DrawerAddSource;
