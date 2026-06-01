/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "var(--color-border)",
        surface: "var(--color-surface)",
        muted: "var(--color-text-muted)",
      },
    },
  },
  plugins: [],
};
