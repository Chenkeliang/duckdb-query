/** @type {import('tailwindcss').Config} */

const dqVar = token => `var(--${token})`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class", // 使用 .dark 类切换暗色模式
  corePlugins: {
    preflight: true
  },
  theme: {
    extend: {
      colors: {
        // ========== 基础色彩 ==========
        // 用法：bg-background, text-foreground
        background: dqVar("dq-background"),
        foreground: dqVar("dq-foreground"),

        // ========== 表面色彩 ==========
        // 用法：bg-surface, bg-surface-hover, bg-surface-elevated
        surface: dqVar("dq-surface"),
        "surface-hover": dqVar("dq-surface-hover"),
        "surface-active": dqVar("dq-surface-active"),
        "surface-elevated": dqVar("dq-surface-elevated"),

        // ========== 弱化色彩 ==========
        // 用法：bg-muted, text-muted-foreground
        muted: dqVar("dq-muted"),
        "muted-foreground": dqVar("dq-muted-fg"),

        // ========== 主色调 ==========
        // 用法：bg-primary, text-primary-foreground
        primary: dqVar("dq-primary"),
        "primary-foreground": dqVar("dq-primary-fg"),

        // ========== 边框 ==========
        // 用法：border-border, border-border-subtle
        border: dqVar("dq-border"),
        "border-subtle": dqVar("dq-border-subtle"),
        "border-strong": dqVar("dq-border-strong"),

        // ========== 输入框 ==========
        // 用法：bg-input
        input: dqVar("dq-input-bg"),

        // ========== 状态色彩 ==========
        // Success
        success: dqVar("dq-success"),
        "success-foreground": dqVar("dq-success-fg"),
        "success-bg": dqVar("dq-success-bg"),
        "success-border": dqVar("dq-success-border"),

        // Warning
        warning: dqVar("dq-warning"),
        "warning-foreground": dqVar("dq-warning-fg"),
        "warning-bg": dqVar("dq-warning-bg"),
        "warning-border": dqVar("dq-warning-border"),

        // Error
        error: dqVar("dq-error"),
        "error-foreground": dqVar("dq-error-fg"),
        "error-bg": dqVar("dq-error-bg"),
        "error-border": dqVar("dq-error-border"),

        // Info
        info: dqVar("dq-info"),
        "info-foreground": dqVar("dq-info-fg"),
        "info-bg": dqVar("dq-info-bg"),
        "info-border": dqVar("dq-info-border"),

        // ========== Shadcn 兼容性别名 ==========
        card: dqVar("dq-surface-card"),
        "card-foreground": dqVar("dq-foreground"),
        secondary: dqVar("dq-surface-alt"),
        "secondary-foreground": dqVar("dq-foreground"),
        accent: dqVar("dq-surface-active"),
        "accent-foreground": dqVar("dq-foreground"),
        ring: dqVar("dq-primary"),

        // ========== 旧版兼容性别名（仅用于过渡期）==========
        // 新代码请使用无前缀的语义化类名（如 bg-surface 而非 bg-dq-surface）
        "dq-background": dqVar("dq-background"),
        "dq-surface": dqVar("dq-surface"),
        "dq-surface-hover": dqVar("dq-surface-hover"),
        "dq-border": dqVar("dq-border-subtle"),
        "dq-text": dqVar("dq-text-primary"),
        "dq-text-secondary": dqVar("dq-text-tertiary")
      },

      borderRadius: {
        none: "0",
        sm: dqVar("dq-radius-sm"), // 4px - 小元素
        DEFAULT: dqVar("dq-radius-md"),
        md: dqVar("dq-radius-md"), // 6px - 输入框/按钮
        lg: dqVar("dq-radius-lg"), // 8px - 标签页
        xl: dqVar("dq-radius-xl"), // 12px - 卡片
        "2xl": dqVar("dq-radius-2xl"), // 16px - 大卡片
        full: "9999px" // 圆形
      },

      boxShadow: {
        xs: dqVar("dq-shadow-xs"),
        sm: dqVar("dq-shadow-sm"), // 卡片阴影（标准）
        DEFAULT: dqVar("dq-shadow-sm"),
        md: dqVar("dq-shadow-md"),
        lg: dqVar("dq-shadow-lg"), // Toast 阴影
        xl: dqVar("dq-shadow-xl"),
        "2xl": dqVar("dq-shadow-2xl"), // 对话框阴影
        inner: dqVar("dq-shadow-inner"),
        "dq-soft": dqVar("dq-shadow-soft")
      },

      fontFamily: {
        sans: dqVar("dq-font-sans"),
        mono: dqVar("dq-font-mono")
      },

      // ========== 动画时长 ==========
      // 用法：duration-fast, duration-normal, duration-slow
      transitionDuration: {
        fast: dqVar("dq-duration-fast"), // 150ms - 悬停效果
        normal: dqVar("dq-duration-normal"), // 200ms - 标准过渡
        slow: dqVar("dq-duration-slow"), // 300ms - 展开/收起
        slower: dqVar("dq-duration-slower") // 500ms - 页面切换
      },

      // ========== Z-Index 层级 ==========
      // 用法：z-dropdown, z-modal, z-tooltip
      zIndex: {
        dropdown: dqVar("dq-z-dropdown"), // 1000
        sticky: dqVar("dq-z-sticky"), // 1020
        fixed: dqVar("dq-z-fixed"), // 1030
        "modal-backdrop": dqVar("dq-z-modal-backdrop"), // 1040
        modal: dqVar("dq-z-modal"), // 1050
        popover: dqVar("dq-z-popover"), // 1060
        tooltip: dqVar("dq-z-tooltip"), // 1070
        notification: dqVar("dq-z-notification") // 1080
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
