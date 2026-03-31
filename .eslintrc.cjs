module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: {
    project: ['./tsconfig.eslint.json', './extension/tsconfig.json'],
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['extension/**/*.ts'],
      parserOptions: {
        project: './extension/tsconfig.json',
      },
    },
  ],
};
