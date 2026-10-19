import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const PRIMITIVES = "/^(Button|IconButton|Badge|Toggle|AlertDialogAction|AlertDialogCancel)$/";
const APPEARANCE =
  "/(^|\\s)(h-(\\d|\\[)|rounded|text-(2xs|xs|sm|base|lg|xl|micro)(\\s|$)|font-(normal|medium|semibold|bold)(\\s|$)|bg-|shadow)/";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".agents/**",

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
  {
    // Design-system primitives take appearance from variants and sizes. A call site's className is for
    // layout (w-full, flex-1, shrink-0, margins, position). Add a variant instead of restyling one button.
    files: ["src/**/*.tsx"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["Literal[value", "TemplateElement[value.raw"].map((node) => ({
          selector: `JSXOpeningElement[name.name=${PRIMITIVES}] > JSXAttribute[name.name='className'] ${node}=${APPEARANCE}]`,
          message:
            "Style this primitive with a variant or size, not className (height, radius, text size, font weight, background, shadow). See src/components/ui.",
        })),
      ],
    },
  },
);
