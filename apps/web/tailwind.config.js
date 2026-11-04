/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // SaaS Purple Palette (Reference Design Language)
        purple: {
          50: "#f0ecfc",
          100: "#e0d7f9",
          200: "#c4b3f4",
          300: "#a389ee",
          400: "#8156f2", // Secondary purple
          500: "#6738e8", // Primary purple
          600: "#582ecb",
          700: "#4925a8",
          800: "#3a1e84",
          900: "#2d1767",
        },
        navy: {
          900: "#171a2e", // Deep navy
          950: "#191b32", // Sidebar background
        },
        // Semantic Token Bindings
        "app-bg": "var(--app-bg)",
        "surface-primary": "var(--surface-primary)",
        "surface-secondary": "var(--surface-secondary)",
        "surface-elevated": "var(--surface-elevated)",
        "surface-subtle": "var(--surface-subtle)",
        "surface-hover": "var(--surface-hover)",
        "sidebar-bg": "var(--sidebar-bg)",
        "sidebar-border": "var(--sidebar-border)",
        "sidebar-text": "var(--sidebar-text)",
        "sidebar-text-active": "var(--sidebar-text-active)",
        "sidebar-active-bg": "var(--sidebar-active-bg)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "border-default": "var(--border-default)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        "accent-primary": "var(--accent-primary)",
        "accent-secondary": "var(--accent-secondary)",
        "accent-hover": "var(--accent-hover)",
        "accent-subtle": "var(--accent-subtle)",
        status: {
          success: "var(--success)",
          warning: "var(--warning)",
          danger: "var(--danger)",
          info: "var(--info)",
        },
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(23, 26, 46, 0.04)",
        subtle:
          "0 1px 3px 0 rgba(23, 26, 46, 0.06), 0 1px 2px -1px rgba(23, 26, 46, 0.04)",
        card: "0 2px 8px -1px rgba(23, 26, 46, 0.05), 0 1px 3px -1px rgba(23, 26, 46, 0.03)",
        elevated:
          "0 10px 25px -5px rgba(23, 26, 46, 0.08), 0 8px 10px -6px rgba(23, 26, 46, 0.04)",
        glow: "0 0 20px -3px rgba(103, 56, 232, 0.25)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
