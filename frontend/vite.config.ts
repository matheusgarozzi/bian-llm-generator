import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, as chamadas a /api vão para o backend Express.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
