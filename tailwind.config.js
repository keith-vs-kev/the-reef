/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        reef: {
          bg: 'var(--reef-bg)',
          'bg-elevated': 'var(--reef-bg-elevated)',
          sidebar: 'var(--reef-sidebar)',
          border: 'var(--reef-border)',
          'border-subtle': 'var(--reef-border-subtle)',
          accent: 'var(--reef-accent)',
          'accent-hover': 'var(--reef-accent-hover)',
          'accent-muted': 'var(--reef-accent-muted)',
          text: 'var(--reef-text)',
          'text-bright': 'var(--reef-text-bright)',
          'text-dim': 'var(--reef-text-dim)',
          'text-muted': 'var(--reef-text-muted)',
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
          idle: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Menlo', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
