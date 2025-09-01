/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        'brand': {
          500: '#06b6d4',
          600: '#0891b2',
        }
      }
    },
  },
  plugins: [],
}
