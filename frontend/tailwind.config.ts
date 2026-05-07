import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#07111f',
        panel: '#0e1b2d',
        accent: '#2dd4bf',
        danger: '#f97316',
        positive: '#22c55e',
        muted: '#7c8aa5',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
