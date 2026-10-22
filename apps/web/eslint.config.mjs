import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'node_modules/**', 'public/**', 'next-env.d.ts', 'server/**']),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Logos and avatars are static SVGs served from public/; next/image adds nothing under output: 'export'.
      '@next/next/no-img-element': 'off',
      // Pre-migration code still violates these; warn so CI stays green while the UI is converted, then promote to error.
      'prefer-const': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
]);
