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
        input: dqColorVar("dq-border-subtle")
      },
      borderRadius: {
        card: dqColorVar("dq-radius-card"),
        cta: dqColorVar("dq-radius-cta")
      },
      boxShadow: {
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
