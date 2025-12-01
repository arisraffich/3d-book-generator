import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      process: 'process/browser',
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
        server: {
          proxy: {
            '/google-api': {
              target: 'https://generativelanguage.googleapis.com',
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(/^\/google-api/, ''),
              configure: (proxy, _options) => {
                proxy.on('error', (err, _req, res) => {
                  console.log('proxy error', err);
                });
              },
            },
            '/replicate-api': {
              target: 'https://api.replicate.com',
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path.replace(/^\/replicate-api/, ''),
              configure: (proxy, _options) => {
                proxy.on('error', (err, _req, res) => {
                  console.log('proxy error', err);
                });
              },
            },
          },
        },
})

