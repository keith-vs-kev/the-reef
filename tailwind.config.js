/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        reef: {
          bg: '#1e1e1e',
          sidebar: '#252526',
          border: '#3c3c3c',
          accent: '#007acc',
          'accent-hover': '#1a8ad4',
          text: '#cccccc',
          'text-bright': '#e0e0e0',
          'text-dim': '#858585',
          success: '#4ec9b0',
          warning: '#dcdcaa',
          error: '#f44747',
          idle: '#ce9178',
        },
      },
    },
  },
  plugins: [],
};
