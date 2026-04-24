import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["**/node_modules/", "**/dist/", "**/.venv/"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "no-console": "off",
    },
  },
];
