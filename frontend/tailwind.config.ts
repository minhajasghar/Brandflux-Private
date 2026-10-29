import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        bg: {
          DEFAULT: "#05060A",
        },
        surface: {
          DEFAULT: "#0D0F16",
          secondary: "#131722",
          hover: "#191E2C",
        },
        border: {
          DEFAULT: "#1C2030",
          light: "#2A3048",
        },
        primary: {
          DEFAULT: "#1558C9",
          light: "#4C8DFF",
          glow: "rgba(21, 88, 201, 0.25)",
          hover: "#1E6BF3",
          muted: "rgba(21, 88, 201, 0.15)",
        },
        accent: {
          DEFAULT: "#D4FF24",
          hover: "#C5F216",
          muted: "rgba(212, 255, 36, 0.15)",
        },
        text: {
          DEFAULT: "#F4F5F7",
          muted: "#8A90A2",
        },
        muted: {
          DEFAULT: "#8A90A2",
        },
        success: {
          DEFAULT: "#10B981",
          muted: "rgba(16, 185, 129, 0.15)",
        },
        danger: {
          DEFAULT: "#EF4444",
          muted: "rgba(239, 68, 68, 0.15)",
        },
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(21, 88, 201, 0.25)",
        "cobalt-lg": "0 0 50px -10px rgba(21, 88, 201, 0.35)",
        "accent-glow": "0 0 24px -4px rgba(212, 255, 36, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
