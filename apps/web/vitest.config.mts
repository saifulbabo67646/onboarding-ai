import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      'server-only': path.resolve(__dirname, 'test/server-only-stub.ts'),
    },
  },
  test: { environment: 'node' },
});
