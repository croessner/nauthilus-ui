import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

// Determine API target similar to src/setupProxy.js
const API_ADDRESS = process.env.FRONTEND_ADDRESS || '0.0.0.0';
const API_PORT = process.env.FRONTEND_PORT || '3001';
const API_HOST = API_ADDRESS === '0.0.0.0' ? 'localhost' : API_ADDRESS;
const API_TARGET = `http://${API_HOST}:${API_PORT}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,
    proxy: {
      // Basic API proxy to Go backend
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      // Enhanced proxy for /proxy/* endpoints with header injection logic
      '/proxy': {
        target: API_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq: any, req: any) => {
            try {
              const url = new URL(req.url || '', 'http://localhost');
              const q = Object.fromEntries(url.searchParams.entries());

              // Forward target URL and optional auth meta for backend usage
              if (q.url) {
                proxyReq.setHeader('x-target-url', q.url);
              }
              if (q.authType) {
                proxyReq.setHeader('x-auth-type', q.authType);
              }
              if (q.authValue) {
                proxyReq.setHeader('x-auth-value', q.authValue);
              }

              // Mirror authUtils behavior for Authorization header when requested
              if (q.authType === 'basic' && q.authValue) {
                proxyReq.setHeader('Authorization', `Basic ${q.authValue}`);
              } else if (q.authType === 'bearer' && q.authValue) {
                proxyReq.setHeader('Authorization', `Bearer ${q.authValue}`);
              }

              // Ensure JSON content type for POST/PUT when not explicitly set
              const method = (req.method || 'GET').toUpperCase();
              if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !proxyReq.getHeader('Content-Type')) {
                proxyReq.setHeader('Content-Type', 'application/json');
              }
            } catch (e) {
              // ignore parse errors
            }
          });

          proxy.on('error', (err) => {
            console.error('Vite proxy error:', err);
          });
        },
      },
    },
  },
  build: {
    outDir: 'build', // Keep the same directory the Go server serves from
    sourcemap: true,
  },
  // Ensure Node builtins like 'crypto' are not polyfilled (default in Vite). No special alias needed.
});
