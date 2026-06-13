import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "var(--primary)",
        // AROFi brand rebrand: remap the emerald scale (used across the portal)
        // to the #155DFC blue so every existing emerald-* class becomes blue.
        emerald: {
          50: "#eef3ff",
          100: "#dbe6fe",
          200: "#bfd3fe",
          300: "#93b4fd",
          400: "#5b8cff",
          500: "#2f6dfd",
          600: "#155DFC",
          700: "#0c44c4",
          800: "#0d3a97",
          900: "#10357a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
