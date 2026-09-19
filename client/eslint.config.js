import { fileURLToPath } from "node:url";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: (await import("@typescript-eslint/parser")).default,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": (await import("@typescript-eslint/eslint-plugin"))
        .default,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
];
