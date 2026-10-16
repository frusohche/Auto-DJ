import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  envDir: import.meta.dirname,
  plugins: [react()],
  server: {
    // Spotify no longer accepts "localhost" redirect URIs, so bind to the loopback IP.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:5174' },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
