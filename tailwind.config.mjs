/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}"],
  theme: {
    extend: {
      colors: {
        // French flag palette + learning app accents
        "french-blue": "#002395",
        "french-red": "#ED2939",
        mastered: "#22c55e",
        learning: "#f59e0b",
        review: "#3b82f6",
        "new-card": "#8b5cf6",
      },
    },
  },
  plugins: [],
};
