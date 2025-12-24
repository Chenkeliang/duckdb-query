/** @type {import('tailwindcss').Config} */

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  corePlugins: {
    preflight: true
  },
  theme: {
    extend: {
      colors: {
        // ========== 基础色彩 ==========
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // ========== 表面色彩 ==========
        surface: 'hsl(var(--surface))',
        "surface-hover": 'hsl(var(--surface-hover))',
        "surface-active": 'hsl(var(--surface-active))',
        "surface-elevated": 'hsl(var(--surface-elevated))',

        // ========== 弱化色彩 ==========
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },

        // ========== 主色调 ==========
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },

        // ========== 边框 ==========
        border: 'hsl(var(--border))',
        "border-subtle": 'hsl(var(--border-subtle))',
        "border-strong": 'hsl(var(--border-strong))',

        // ========== 输入框 ==========
        input: 'hsl(var(--input))',

        // ========== 状态色彩 ==========
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          bg: 'hsl(var(--success-bg))',
          border: 'hsl(var(--success-border))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          bg: 'hsl(var(--warning-bg))',
          border: 'hsl(var(--warning-border))',
        },
        error: {
          DEFAULT: 'hsl(var(--error))',
          foreground: 'hsl(var(--error-foreground))',
          bg: 'hsl(var(--error-bg))',
          border: 'hsl(var(--error-border))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          bg: 'hsl(var(--info-bg))',
          border: 'hsl(var(--info-border))',
        },

        // ========== Shadcn 兼容性别名 ==========
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        ring: 'hsl(var(--ring))',
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
        inner: 'var(--shadow-inner)',
      },

      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },

      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
        slower: '500ms',
      },

      zIndex: {
        dropdown: '1000',
        sticky: '1020',
        fixed: '1030',
        "modal-backdrop": '1040',
        modal: '1050',
        popover: '1060',
        tooltip: '1070',
        notification: '1080',
      },

      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        },
        'collapsible-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-collapsible-content-height)'
          }
        },
        'collapsible-up': {
          from: {
            height: 'var(--radix-collapsible-content-height)'
          },
          to: {
            height: '0'
          }
        },
        'filter-fade-in': {
          from: {
            opacity: '0',
            transform: 'scale(0.95)'
          },
          to: {
            opacity: '1',
            transform: 'scale(1)'
          }
        },
        'filter-fade-out': {
          from: {
            opacity: '1',
            transform: 'scale(1)'
          },
          to: {
            opacity: '0',
            transform: 'scale(0.95)'
          }
        },
        'filter-slide-in': {
          from: {
            opacity: '0',
            transform: 'translateX(-8px)'
          },
          to: {
            opacity: '1',
            transform: 'translateX(0)'
          }
        },
        'filter-pop': {
          '0%': {
            opacity: '0',
            transform: 'scale(0.8)'
          },
          '50%': {
            transform: 'scale(1.05)'
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1)'
          }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-out',
        'collapsible-up': 'collapsible-up 0.2s ease-out',
        'filter-fade-in': 'filter-fade-in 0.2s ease-out',
        'filter-fade-out': 'filter-fade-out 0.2s ease-out',
        'filter-slide-in': 'filter-slide-in 0.15s ease-out',
        'filter-pop': 'filter-pop 0.25s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
