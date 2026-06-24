import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config. Type-aware linting is intentionally left off (it needs a
 * parser project and is slow); the strict `tsc -b` in the build already covers
 * type correctness. ESLint here focuses on bug-prone patterns and React hooks.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Test + Node-context files: allow Node globals and relax a few rules.
    files: ['**/*.{test,spec}.{ts,tsx}', 'src/test/**', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
