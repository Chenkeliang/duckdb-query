/** @type {import('tailwindcss').Config} */

const dqColorVar = token => `var(--${token})`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        "dq-background": dqColorVar("dq-background"),
        "dq-surface": dqColorVar("dq-surface"),
        "dq-surface-alt": dqColorVar("dq-surface-alt"),
        "dq-surface-hover": dqColorVar("dq-surface-hover"),
        "dq-surface-active": dqColorVar("dq-surface-active"),
        "dq-border": dqColorVar("dq-border-subtle"),
        "dq-border-strong": dqColorVar("dq-border-strong"),
        "dq-accent": dqColorVar("dq-accent-primary"),
        "dq-text": dqColorVar("dq-text-primary"),
        "dq-text-secondary": dqColorVar("dq-text-tertiary"),
        background: dqColorVar("dq-background"),
        foreground: dqColorVar("dq-text-primary"),
        muted: dqColorVar("dq-surface"),
        "muted-foreground": dqColorVar("dq-text-tertiary"),
        accent: dqColorVar("dq-surface-active"),
        "accent-foreground": dqColorVar("dq-text-primary"),
        card: dqColorVar("dq-surface-card"),
        "card-foreground": dqColorVar("dq-text-primary"),
        primary: dqColorVar("dq-accent-primary"),
        "primary-foreground": dqColorVar("dq-text-on-primary"),
        secondary: dqColorVar("dq-surface-alt"),
        "secondary-foreground": dqColorVar("dq-text-primary"),
        ring: dqColorVar("dq-accent-primary"),
        input: dqColorVar("dq-border-subtle"),

        // State colors
        success: dqColorVar("dq-success"),
        "success-foreground": dqColorVar("dq-success-fg"),
        "success-bg": dqColorVar("dq-success-bg"),
        "success-border": dqColorVar("dq-success-border"),

        warning: dqColorVar("dq-warning"),
        "warning-foreground": dqColorVar("dq-warning-fg"),
        "warning-bg": dqColorVar("dq-warning-bg"),
        "warning-border": dqColorVar("dq-warning-border"),

        error: dqColorVar("dq-error"),
        "error-foreground": dqColorVar("dq-error-fg"),
        "error-bg": dqColorVar("dq-error-bg"),
        "error-border": dqColorVar("dq-error-border"),

        info: dqColorVar("dq-info"),
        "info-foreground": dqColorVar("dq-info-fg"),
        "info-bg": dqColorVar("dq-info-bg"),
        "info-border": dqColorVar("dq-info-border")
      },
      borderRadius: {
        none: "0",
        sm: dqColorVar("dq-radius-sm"),
        DEFAULT: dqColorVar("dq-radius-md"),
        md: dqColorVar("dq-radius-md"),
        lg: dqColorVar("dq-radius-lg"),
        xl: dqColorVar("dq-radius-xl"),
        "2xl": dqColorVar("dq-radius-2xl"),
        full: "9999px",
        card: dqColorVar("dq-radius-card"),
        cta: dqColorVar("dq-radius-cta")
      },
      boxShadow: {
        xs: dqColorVar("dq-shadow-xs"),
        sm: dqColorVar("dq-shadow-sm"),
        DEFAULT: dqColorVar("dq-shadow-sm"),
        md: dqColorVar("dq-shadow-md"),
        lg: dqColorVar("dq-shadow-lg"),
        xl: dqColorVar("dq-shadow-xl"),
        "2xl": dqColorVar("dq-shadow-2xl"),
        inner: dqColorVar("dq-shadow-inner"),
        "dq-soft": dqColorVar("dq-shadow-soft")
      },
      fontFamily: {
        sans: dqColorVar("dq-font-sans"),
        mono: dqColorVar("dq-font-mono")
      }
    }
  },
  plugins: []
};
