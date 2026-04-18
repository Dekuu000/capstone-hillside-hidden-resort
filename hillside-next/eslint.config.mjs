import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const baseDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });
const nextCoreWebVitals = compat.extends("next/core-web-vitals");

const config = [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"],
  },
  ...nextCoreWebVitals,
];

export default config;
