import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lexend', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f3fbe9',
          100: '#e6f8d3',
          200: '#cdefa8',
          300: '#ace374',
          400: '#72d216',
          500: '#1da013',
          600: '#0d8520',
          700: '#056b28',
          800: '#075724',
          900: '#0a491f',
        },
        surface: {
          50: '#f8fbf7',
          100: '#f0f6ef',
          200: '#dbe8da',
          300: '#bfd2bf',
          700: '#4c5e52',
          800: '#314138',
          900: '#1b281f',
        },
      },
      boxShadow: {
        panel: '0 18px 40px -28px rgba(5, 107, 40, 0.18)',
        soft: '0 14px 30px -24px rgba(5, 107, 40, 0.14)',
      },
      backgroundImage: {
        'window-ribbons':
          'radial-gradient(circle at top right, rgba(114,210,22,0.16), transparent 28%), linear-gradient(135deg, rgba(5,107,40,0.08), transparent 34%), linear-gradient(225deg, rgba(29,160,19,0.1), transparent 32%)',
        'window-grid':
          'linear-gradient(rgba(5,107,40,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(5,107,40,0.06) 1px, transparent 1px)',
      },
      backgroundSize: {
        'window-grid': '34px 34px',
      },
    },
  },
  plugins: [],
} satisfies Config;
