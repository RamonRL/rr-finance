/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
      colors: {
        background: '#080f1a',
        surface: '#0e1c2f',
        elevated: '#162540',
        overlay: 'rgba(14, 28, 47, 0.85)',
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
