import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "fs";
import path from "path";
import obfuscatorPlugin from "rollup-plugin-obfuscator";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Demo build (`demo` branch, see DEMO.md). loadEnv reads the same value the client
  // sees as import.meta.env.VITE_DEMO (process.env first, then .env files).
  const isDemo = loadEnv(mode, process.cwd(), 'VITE_').VITE_DEMO === '1';
  const realSupabase = path.resolve(__dirname, "./src/lib/supabase.ts");
  const demoSupabase = path.resolve(__dirname, "./src/demo/private/supabase.ts");
  if (isDemo && !fs.existsSync(demoSupabase)) {
    throw new Error('The demo build needs the private bundle (src/demo/private/supabase.ts), see DEMO.md.');
  }

  // Validate required environment variables in production builds.
  // The demo never talks to the database, so it needs no Supabase keys.
  const requiredEnvVars = [
    'VITE_MAPBOX_TOKEN',
    ...(isDemo ? [] : ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']),
  ];

  if (mode === 'production') {
    const missing = requiredEnvVars.filter(name => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables for production build: ${missing.join(', ')}. Ensure they are set in your deployment environment (e.g., Vercel) with the VITE_ prefix.`);
    }
  }

  return {
    base: "/",
    define: {
      // Build identifier attached to analytics events (package.json stays at 0.0.0).
      __APP_VERSION__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      isDemo && demoSupabaseGuard(realSupabase),
      // Obfuscate the production bundle to raise the bar for reverse-engineering
      // client-side limits (duration cap, quality cap, load counter).
      // Does NOT protect against a determined attacker — server-side checks are
      // the real security boundary. This is defense-in-depth.
      //
      // Settings chosen to balance protection vs. performance:
      //   • No control flow flattening — inflates bundle & breaks async code
      //   • String array encoding deters casual inspection
      //   • Identifier name mangling makes variable purposes opaque
      ...(mode === 'production' && !isDemo
        ? [
            obfuscatorPlugin({
              // The analytics module lazy-loads posthog-js via dynamic import(); string-array
              // encoding would turn that specifier into a runtime expression Rollup cannot
              // split into a chunk. It carries no limits worth hiding, so skip it.
              // Per-frame rendering/animation code is excluded too: string-array decoding makes
              // its property access ~5x slower and it holds no limits. overlays/resolve.ts stays
              // obfuscated since it applies the free-tier brand mark.
              exclude: [
                'node_modules/**',
                'src/lib/analytics/**',
                'src/lib/lazyModules.ts',
                'src/engine/**',
                'src/components/MapViewport/runtime/**',
                'src/annotations/**',
                'src/overlays/drawOverlays.ts',
                'src/overlays/layout.ts',
                'src/overlays/assets.ts',
                'src/hooks/usePlayback.ts',
              ],
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
    build: {
      // Vite inlines assets under 4 KB. The map style thumbnails stay separate files, so the main bundle does not carry them.
      assetsInlineLimit: (file) => (file.includes('/assets/map-styles/') ? false : undefined),
      rollupOptions: {
        output: {
          // mapbox-gl rarely changes; its own chunk keeps it cached across app deploys.
          manualChunks(id) {
            if (id.includes('node_modules/mapbox-gl/')) return 'mapbox-gl';
          },
        },
      },
    },
    resolve: {
      alias: [
        // The demo swaps the whole Supabase client for the private fake one.
        ...(isDemo ? [{ find: /^@\/lib\/supabase$/, replacement: demoSupabase }] : []),
        { find: "@", replacement: path.resolve(__dirname, "./src") },
      ],
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});

/** Fails the demo build if anything reaches the real Supabase client by a path the alias does not cover. */
function demoSupabaseGuard(realSupabase: string): Plugin {
  return {
    name: "demo-supabase-guard",
    load(id) {
      if (id.split("?")[0] === realSupabase) {
        throw new Error(`The demo build must not include src/lib/supabase.ts (imported as ${id}). Import it as "@/lib/supabase" so the demo alias applies.`);
      }
    },
  };
}
