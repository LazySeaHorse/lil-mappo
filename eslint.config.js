import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".agents/**",

      // Temporary feature exclusions. Remove these with the planned callout rewrite.
      "src/components/Inspector/CalloutInspector.tsx",
      "src/components/MapViewport/CalloutCard.tsx",
      "src/components/MapViewport/CalloutMarker.tsx",
      "src/components/MapViewport/hooks/useCalloutAnimationState.ts",
      "src/components/MapViewport/hooks/useCalloutAltitudeOffsets.ts",
      "src/components/Toolbar/CalloutAddDropdown.tsx",
      "src/engine/calloutAnimation.ts",
      "src/services/renderCallout.ts",

      // Cloud rendering and credit purchasing are disabled for now.
      "src/components/Account/CreditsModal.tsx",
      "src/components/Account/RendersModal.tsx",
      "src/components/ExportModal/hooks/useCloudRenderDispatch.ts",
      "src/components/RenderMode/**",
      "api/_lib/render.ts",
      "api/cleanup-free-accounts.ts",
      "api/render-complete.ts",
      "api/render-dispatch.ts",
      "api/render-fail.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
