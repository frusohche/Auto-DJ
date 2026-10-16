import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  envDir: import.meta.dirname,
  plugins: [react()],
  server: {
    // Listen on the home network too so a phone on the same Wi-Fi can open the remote.
    // (Log in on the computer via http://127.0.0.1:5173 - Spotify rejects "localhost" redirects.)
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:5174' },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
