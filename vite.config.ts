import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Validate required environment variables in production builds
  const requiredEnvVars = [
    'VITE_MAPBOX_TOKEN',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
  ];

  if (mode === 'production') {
    const missing = requiredEnvVars.filter(name => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables for production build: ${missing.join(', ')}. Ensure they are set in your deployment environment (e.g., Vercel) with the VITE_ prefix.`);
    }
  }

  return {
    base: "/",
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
