import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Hermetic: vitest copies .env VITE_ vars into process.env / import.meta.env, which would
    // give every test the real PostHog key. Tests that need analytics enabled stub their own dummy key.
    env: { VITE_POSTHOG_KEY: "" },
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "api/**/*.{test,spec}.{ts,tsx}",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
