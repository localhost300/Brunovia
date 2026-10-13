import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([".next/**", "output/**", "tmp/**", "next-env.d.ts"]),
]);
