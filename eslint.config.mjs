import eslint from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'

const generatedAndVendor = [
  '**/node_modules/**',
  'dist/**',
  '.api-build/**',
  '.app-build/**',
  '.electron-build/**',
  '.main-build/**',
  '.scripts-build/**',
  '.cache/**',
  'release/**',
  'coverage/**',
  'api/**/*.js',
  'app/**/*.js',
  'shared/**/*.js',
  'electron/*.js',
  'main.js',
  'scripts/*.js',
  'plugins/**/*.cjs',
]

export default tseslint.config(
  {
    ignores: generatedAndVendor,
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{ts,mjs,cjs,js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        $operable: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'no-async-promise-executor': 'off',
      'no-irregular-whitespace': 'off',
      'no-control-regex': 'off',
      'prefer-const': 'warn',
      'vue/multi-word-component-names': 'off',
      'vue/no-v-text-v-html-on-component': 'off',
      'vue/no-mutating-props': 'warn',
      'vue/no-unused-vars': 'warn',
      'vue/valid-v-for': 'warn',
      'vue/valid-v-memo': 'warn',
      'vue/no-dupe-keys': 'warn',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['api/**/*.{ts,js}', 'app/**/*.{ts,js}', 'main.ts', 'electron/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['integrations/iina/**/*.js'],
    languageOptions: {
      globals: {
        iina: 'readonly',
      },
    },
  },
)
