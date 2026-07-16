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
    // Eve local runtime snapshots and Nitro build output contain generated code
    // (incl. nested .next chunks) that must never be linted.
    ".eve/**",
    ".workflow-data/**",
    ".output/**",
    "**/.next/**",
  ]),
]);

export default eslintConfig;
