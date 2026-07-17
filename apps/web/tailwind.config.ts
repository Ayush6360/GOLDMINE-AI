import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        phoenix: {
          gold: "#d4a017",
          ember: "#e2571e",
          ink: "#0b0e14",
          panel: "#131824",
          muted: "#8a94a6",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
