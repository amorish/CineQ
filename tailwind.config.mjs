/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#111111',
        card: '#161616',
        elevated: '#1e1e1e',
        accent: '#eab308',
        'accent-glow': 'rgba(234,179,8,0.28)',
        'accent-soft': 'rgba(234,179,8,0.08)',
        textMain: '#f0eeed',
        text2: '#a8a6a5',
        muted: '#4a4a4a',
      },
      fontFamily: {
        outfit: ['var(--font-outfit)', 'sans-serif'],
        inter: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
