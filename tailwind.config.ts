import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand red, sampled from the Tabata Tuesday logo (#f93741 at 500).
        brand: {
          50: '#fef2f2',
          100: '#ffe1e3',
          200: '#ffc9cc',
          300: '#ffa0a6',
          400: '#fb6a72',
          500: '#f93741',
          600: '#e3202c',
          700: '#c01722',
          800: '#9e1820',
          900: '#83191f',
        },
      },
    },
  },
  plugins: [],
}
export default config
