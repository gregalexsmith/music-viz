/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        stem: {
          vocals: '#f472b6',
          drums: '#fbbf24',
          bass: '#60a5fa',
          other: '#a78bfa',
        },
      },
    },
  },
  plugins: [],
};
