import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
    // tsconfig ma "jsx": "preserve" (Next) — testy renderowania (*.test.tsx) potrzebują transformacji JSX
    esbuild: { jsx: 'automatic' },
    test: {
        // domyślnie node; testy renderowania przełączają się na jsdom komentarzem `@vitest-environment jsdom`
        environment: 'node',
        include: ['src/**/*.test.{ts,tsx}'],
    },
});
