import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts,js}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
} satisfies Config
