const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '.claude/**',
      'coverage/**',
      'eslint.config.js',
      'babel.config.js',
      'jest.setup.js',
      '**/__mocks__/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // Errors: things that are always bugs
      'react-hooks/rules-of-hooks': 'error',
      'no-undef': 'off', // TypeScript handles this
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      // Off: too noisy / handled by TypeScript already
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-console': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
