/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
theme: {
  extend: {
    fontFamily: {
      sans: ["Inter", "system-ui", "sans-serif"],
    },
    colors: {
      bgdark: "#050507",
      card: "#13131c",
      cardhover: "#191925",
      border: "#252536",
      accent: "#ffb020",
      accentdim: "#8a6218",
      accent2: "#a855f7",
      teal: "#22d3c8",
      green: "#00e6a0",
      red: "#ff3b5c",
    },
  },
},
  plugins: [],
};