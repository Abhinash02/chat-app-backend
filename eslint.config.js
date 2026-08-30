import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'coverage/**', 'uploads/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URLSearchParams: 'readonly',
        // Node 20 globals used by the push provider.
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
    },
  },
  {
    // CLI scripts talk to the operator through stdout — that is the interface,
    // not a stray debug statement.
    // Startup failures are read at a terminal, so stderr is the interface.
    files: ['scripts/**/*.js', 'src/server.js'],
    rules: { 'no-console': 'off' },
  },
];
