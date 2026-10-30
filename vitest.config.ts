import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@flowforge/config': path.resolve(__dirname, './packages/config/src/index.ts'),
      '@flowforge/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
      '@flowforge/database': path.resolve(__dirname, './packages/database/src/index.ts'),
      '@flowforge/workflow-engine': path.resolve(__dirname, './packages/workflow-engine/src/index.ts'),
      '@flowforge/integrations': path.resolve(__dirname, './packages/integrations/src/index.ts'),
      '@flowforge/test-utils': path.resolve(__dirname, './packages/test-utils/src/index.ts')
    }
  }
});
