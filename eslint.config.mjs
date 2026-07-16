import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        setInterval: "readonly",
        __dirname: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        Promise: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      semi: ["warn", "always"],
      quotes: ["warn", "double", { avoidEscape: true }],
      "comma-dangle": ["warn", "always-multiline"],
      eqeqeq: ["warn", "always"],
      "no-var": "warn",
      "prefer-const": "warn",
      "prefer-template": "warn",
      "object-shorthand": ["warn", "always"],
      "arrow-body-style": ["warn", "as-needed"],
      curly: ["warn", "multi-line"],
      "no-trailing-spaces": "warn",
      "eol-last": ["warn", "always"],
      "no-multiple-empty-lines": ["warn", { max: 2, maxEOF: 1 }],
    },
  },
  {
    ignores: ["node_modules/", "coverage/", "package-lock.json"],
  },
];
