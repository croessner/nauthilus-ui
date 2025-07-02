const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();
const { addAuthorizationHeader } = require('./utils/authUtils');

module.exports = function(app) {
  // Get API server address and port from environment variables
  const API_ADDRESS = process.env.API_ADDRESS || '0.0.0.0';
  const API_PORT = process.env.API_PORT || '3001';
  const API_TARGET = `http://${API_ADDRESS === '0.0.0.0' ? 'localhost' : API_ADDRESS}:${API_PORT}`;

  // Proxy for API requests to the Go API server
  app.use(
    '/api',
    createProxyMiddleware({
      target: API_TARGET,
      changeOrigin: true,
      onError: (err, req, res) => {
        console.error('API proxy error:', err);
        res.status(500).json({ error: err.message });
      },
    })
  );
  // Proxy for backend health check
  app.use(
    '/proxy/ping',
    createProxyMiddleware({
      router: (req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }
        return targetUrl;
      },
      pathRewrite: {
        '^/proxy/ping': '/ping', // Rewrite path to /ping
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onError: (err, req, res) => {
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for JWT token endpoint
  app.use(
    '/proxy/jwt-token',
    createProxyMiddleware({
      router: (req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }
        return targetUrl;
      },
      pathRewrite: {
        '^/proxy/jwt-token': '/api/v1/jwt/token', // Rewrite path to /api/v1/jwt/token
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Set content type for POST requests
        proxyReq.setHeader('Content-Type', 'application/json');
      },
      onError: (err, req, res) => {
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for bruteforce list endpoint
  app.use(
    '/proxy/bruteforce/list',
    createProxyMiddleware({
      router: (req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }
        return targetUrl;
      },
      pathRewrite: {
        '^/proxy/bruteforce/list': '/api/v1/bruteforce/list', // Rewrite path to /api/v1/bruteforce/list
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);
      },
      onError: (err, req, res) => {
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for cache flush endpoint
  app.use(
    '/proxy/cache/flush',
    createProxyMiddleware({
      router: (req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }
        return targetUrl;
      },
      pathRewrite: {
        '^/proxy/cache/flush': '/api/v1/cache/flush', // Rewrite path to /api/v1/cache/flush
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);
        // Set content type for POST requests
        proxyReq.setHeader('Content-Type', 'application/json');
      },
      onError: (err, req, res) => {
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for bruteforce flush endpoint
  app.use(
    '/proxy/bruteforce/flush',
    createProxyMiddleware({
      router: (req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }
        return targetUrl;
      },
      pathRewrite: {
        '^/proxy/bruteforce/flush': '/api/v1/bruteforce/flush', // Rewrite path to /api/v1/bruteforce/flush
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);
        // Set content type for POST requests
        proxyReq.setHeader('Content-Type', 'application/json');
      },
      onError: (err, req, res) => {
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for config load endpoint
  app.use(
    '/proxy/config/load',
    createProxyMiddleware({
      router: (req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }
        return targetUrl;
      },
      pathRewrite: {
        '^/proxy/config/load': '/api/v1/config/load', // Rewrite path to /api/v1/config/load
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);
      },
      onError: (err, req, res) => {
        console.error('Proxy error for config/load:', err);

        // Provide more detailed error information
        const errorDetails = {
          error: 'Failed to connect to backend server',
          details: err.message,
          code: err.code || 'UNKNOWN_ERROR',
          target: req.query.url
        };

        res.status(502).json(errorDetails);
      },
    })
  );
};
