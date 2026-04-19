export default {
  content: ["./landing-page/*.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "sans-serif"],
      },
      colors: {
        brand: {
          blue: "#1e3fda",
          light: "#eef2ff",
          green: "#10b981",
          purple: "#8b5cf6",
          bg: "#f8f9fa",
          surface: "#ffffff",
          text: "#0f172a",
          muted: "#64748b",
        },
      },
      boxShadow: {
        soft: "0 20px 40px -15px rgba(30, 63, 218, 0.08)",
        float: "0 30px 60px -20px rgba(30, 63, 218, 0.15)",
      },
      animation: {
        "float-slow": "float 6s ease-in-out infinite",
        "float-fast": "float 4s ease-in-out infinite",
        "pulse-soft": "pulseSoft 3s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-15px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.7 },
        },
      },
    },
  },
  plugins: [],
};
