import { defineConfig } from "eslint/config"
import js from "@eslint/js"
import globals from "globals"
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended"
import requireQmlDualExport from "./eslint-rules/require-qml-dual-export.js"
import requireResultReturn from "./eslint-rules/require-result-return.js"

const localPlugin = {
  rules: {
    "require-qml-dual-export": requireQmlDualExport,
    "require-result-return": requireResultReturn,
  },
}

export default defineConfig([
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["lib/**/*.js"],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        Intl: "readonly",
      },
    },
    plugins: {
      js,
      local: localPlugin,
    },
    extends: ["js/recommended"],
    rules: {
      "no-var": "off",
      "prefer-const": "off",
      strict: "off",
      "no-unused-vars": ["error", { caughtErrorsIgnorePattern: "^_" }],
      "local/require-qml-dual-export": "error",
    },
  },
  {
    files: ["lib/SnippetCatalog.js", "lib/OmarchyInstall.js"],
    plugins: { local: localPlugin },
    rules: {
      "local/require-result-return": "error",
    },
  },
  {
    files: ["lib/SnippetTransfer.js"],
    plugins: { local: localPlugin },
    rules: {
      "local/require-result-return": ["error", { functions: ["transferPlan"] }],
    },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.js", "eslint-rules/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: globals.node,
    },
    plugins: { js },
    extends: ["js/recommended"],
  },
  eslintPluginPrettierRecommended,
])
