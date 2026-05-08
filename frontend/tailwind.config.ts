import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0D1117',
        panel: '#0F1620',
        border: '#1C2333',
        accent: '#58A6FF',
        positive: '#3FB950',
        danger: '#F85149',
        warning: '#E3B341',
        muted: '#8B949E',
        dim: '#6E7681',
        purple: '#BC8CFF',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
