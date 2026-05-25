/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#020617',
        },
      },
      fontFamily: {
        geometric: ['Orbitron', 'sans-serif'],
      },
      animation: {
        'satellite-spin': 'satellite-spin 4s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'shine': 'shine 3s ease-in-out infinite',
      },
      keyframes: {
        'satellite-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(34, 211, 238, 0.4)' },
          '50%': { boxShadow: '0 0 40px rgba(34, 211, 238, 0.8)' },
        },
        'shine': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}