/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Professional, muted palette - avoids "rage-bait" design
        primary: {
          50: '#f5f7fa',
          100: '#ebeef3',
          200: '#d2dae5',
          300: '#aab9ce',
          400: '#7c93b2',
          500: '#5c7599',
          600: '#485e7f',
          700: '#3b4d67',
          800: '#344256',
          900: '#2e3949',
          950: '#1e2530',
        },
        accent: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        evidence: {
          high: '#059669',
          medium: '#d97706',
          low: '#9ca3af',
        },
        status: {
          draft: '#6b7280',
          review: '#8b5cf6',
          published: '#059669',
          disputed: '#f59e0b',
          corrected: '#3b82f6',
          retracted: '#dc2626',
          archived: '#9ca3af',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
