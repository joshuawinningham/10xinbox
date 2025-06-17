import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [react(), visualizer()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts', 'd3-array', 'd3-shape', 'd3-scale', 'd3-time', 'd3-color', 'd3-format'],
          supabase: ['@supabase/supabase-js'],
          zod: ['zod'],
        },
      },
    },
  },
});
