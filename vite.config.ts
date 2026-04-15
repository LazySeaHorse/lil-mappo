import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import obfuscatorPlugin from "rollup-plugin-obfuscator";

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
    plugins: [
      react(),
      // Obfuscate the production bundle to raise the bar for reverse-engineering
      // client-side limits (duration cap, quality cap, load counter).
      // Does NOT protect against a determined attacker — server-side checks are
      // the real security boundary. This is defense-in-depth.
      //
      // Settings chosen to balance protection vs. performance:
      //   • No control flow flattening — inflates bundle & breaks async code
      //   • String array encoding deters casual inspection
      //   • Identifier name mangling makes variable purposes opaque
      ...(mode === 'production'
        ? [
            obfuscatorPlugin({
              options: {
                compact: true,
                identifierNamesGenerator: 'hexadecimal',
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayThreshold: 0.75,
                rotateStringArray: true,
                shuffleStringArray: true,
                splitStrings: false,
                controlFlowFlattening: false,
                deadCodeInjection: false,
                debugProtection: false,
                disableConsoleOutput: false,
                selfDefending: false,
                transformObjectKeys: false,
              },
            }),
          ]
        : []),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
