import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Draco decoder, copied verbatim out of the three.js package so the
    // 3D viewer works without a CDN. Not our code, not ours to lint.
    "public/draco/**",
  ]),
  {
    // Server action signatures are fixed by React's useActionState: (prevState, formData).
    // An action that ignores one of them still has to declare it, so allow a leading _.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
