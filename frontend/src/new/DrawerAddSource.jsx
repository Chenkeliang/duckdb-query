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
    <div className="fixed inset-0 z-[70] flex justify-end bg-[var(--dq-overlay-strong)]">
      <div className="w-full sm:w-[640px] h-full bg-[var(--dq-surface)] border-l border-[var(--dq-border)] shadow-2xl flex flex-col">
        <div className="px-6 py-5 border-b border-[var(--dq-border)] flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--dq-text-primary)]">
            {title}
          </h3>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--dq-text-tertiary)] hover:text-[var(--dq-text-primary)]"
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
};

export default DrawerAddSource;
