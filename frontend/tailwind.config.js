/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      width: {
        sidebar: '14rem',
      },
      colors: {
        background: '#05090F',
        surface: '#0b1524',
        elevated: '#13243d',
        overlay: 'rgba(10, 20, 36, 0.78)',
        primary: '#00c896',
        secondary: '#7a95b2',
        muted: '#3d5a78',
        accent: {
          DEFAULT: '#00c896',
          green: '#00c896',
          red: '#ff5c5c',
          blue: '#3d9eff',
          gold: '#f0b429',
        },
      },
    },
  },
  plugins: [],
}
