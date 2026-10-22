import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'prototype_ref', 'public', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Destructuring to drop fields ({ selected: _s, ...rest }) is intentional
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Audio cleanup swallows "already stopped/disconnected" errors on purpose
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['src/**/*.test.ts', 'e2e/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  }
);
