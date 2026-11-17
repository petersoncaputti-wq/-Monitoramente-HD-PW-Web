// ESLint (flat config). Servidor/scripts em JavaScript (Node) e frontend em
// React + TypeScript. A formatação fica com o Prettier (eslint-config-prettier
// desliga as regras de estilo que conflitariam).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'deploy/',
      'node_modules/',
      'vendor/',
      'output/',
      'exports/',
      'tmp/',
      'public/',
      // Gerados pelo `tsc -b` a partir do vite.config.ts.
      'vite.config.js',
      'vite.config.d.ts',
    ],
  },

  // Servidor, API e scripts (Node, ESM).
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Frontend React + TypeScript.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // As regras do plugin voltadas ao React Compiler (set-state-in-effect,
      // purity, refs...) começam como aviso: são recomendações de performance,
      // não bugs. rules-of-hooks continua erro: hook fora de ordem é bug real.
      ...Object.fromEntries(Object.keys(reactHooks.configs.recommended.rules).map((rule) => [rule, 'warn'])),
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Arquivos de configuração em TypeScript executados pelo Node.
  {
    files: ['*.config.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },

  prettier,
);
