const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();
const { addAuthorizationHeader } = require('./utils/authUtils');

module.exports = function(app) {
  // Get API server address and port from environment variables
  const API_ADDRESS = process.env.FRONTEND_ADDRESS || '0.0.0.0';
  const API_PORT = process.env.FRONTEND_PORT || '3001';
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
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        return '/proxy/ping'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onError: (err, req, res) => {
        console.error('Proxy error for ping:', err);
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for JWT token endpoint
  app.use(
    '/proxy/jwt-token',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        return '/proxy/jwt-token'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Set content type for POST requests
        proxyReq.setHeader('Content-Type', 'application/json');
      },
      onError: (err, req, res) => {
        console.error('Proxy error for jwt-token:', err);
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for bruteforce list endpoint
  app.use(
    '/proxy/bruteforce/list',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/bruteforce/list'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);
      },
      onError: (err, req, res) => {
        console.error('Proxy error for bruteforce/list:', err);
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for cache flush endpoint
  app.use(
    '/proxy/cache/flush',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/cache/flush'; // Keep the original path for the Go backend
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
        console.error('Proxy error for cache/flush:', err);
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for bruteforce flush endpoint
  app.use(
    '/proxy/bruteforce/flush',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/bruteforce/flush'; // Keep the original path for the Go backend
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
        console.error('Proxy error for bruteforce/flush:', err);
        res.status(500).json({ error: err.message });
      },
    })
  );

  // Proxy for config load endpoint
  app.use(
    '/proxy/config/load',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/config/load'; // Keep the original path for the Go backend
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

  // Proxy for distributed-brute-force-admin hook endpoint
  app.use(
    '/proxy/hooks/distributed-brute-force-admin',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Get the endpoint path from the query parameter
        const endpointPath = req.query.endpoint_path;
        if (!endpointPath) {
          throw new Error('Endpoint path is required');
        }

        // Store the endpoint path in the request object for the Go backend to use
        req.headers['x-endpoint-path'] = endpointPath;

        // If operation is provided, store it in the request object
        const operation = req.query.operation;
        if (operation) {
          req.headers['x-operation'] = operation;
        }

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/hooks/distributed-brute-force-admin'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);

        // Set content type for POST requests
        if (req.method === 'POST') {
          proxyReq.setHeader('Content-Type', 'application/json');
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error for distributed-brute-force-admin:', err);

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

  // Proxy for distributed-brute-force-test hook endpoint
  app.use(
    '/proxy/hooks/distributed-brute-force-test',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Get the endpoint path from the query parameter
        const endpointPath = req.query.endpoint_path;
        if (!endpointPath) {
          throw new Error('Endpoint path is required');
        }

        // Store the endpoint path in the request object for the Go backend to use
        req.headers['x-endpoint-path'] = endpointPath;

        // If operation is provided, store it in the request object
        const operation = req.query.operation;
        if (operation) {
          req.headers['x-operation'] = operation;
        }

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/hooks/distributed-brute-force-test'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);

        // Set content type for POST requests
        if (req.method === 'POST') {
          proxyReq.setHeader('Content-Type', 'application/json');
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error for distributed-brute-force-test:', err);

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

  // Proxy for learning-mode hook endpoint
  app.use(
    '/proxy/hooks/learning-mode',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Get the endpoint path from the query parameter
        const endpointPath = req.query.endpoint_path;
        if (!endpointPath) {
          throw new Error('Endpoint path is required');
        }

        // Store the endpoint path in the request object for the Go backend to use
        req.headers['x-endpoint-path'] = endpointPath;

        // If operation is provided, store it in the request object
        const operation = req.query.operation;
        if (operation) {
          req.headers['x-operation'] = operation;
        }

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/hooks/learning-mode'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);

        // Set content type for POST requests
        if (req.method === 'POST') {
          proxyReq.setHeader('Content-Type', 'application/json');
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error for learning-mode:', err);

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

  // Proxy for neural-feedback hook endpoint
  app.use(
    '/proxy/hooks/neural-feedback',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Get the endpoint path from the query parameter
        const endpointPath = req.query.endpoint_path;
        if (!endpointPath) {
          throw new Error('Endpoint path is required');
        }

        // Store the endpoint path in the request object for the Go backend to use
        req.headers['x-endpoint-path'] = endpointPath;

        // If operation is provided, store it in the request object
        const operation = req.query.operation;
        if (operation) {
          req.headers['x-operation'] = operation;
        }

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/hooks/neural-feedback'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);

        // Set content type for POST requests
        if (req.method === 'POST') {
          proxyReq.setHeader('Content-Type', 'application/json');
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error for neural-feedback:', err);

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

  // Proxy for train-neural-network hook endpoint
  app.use(
    '/proxy/hooks/train-neural-network',
    createProxyMiddleware({
      target: API_TARGET, // Route through Go backend
      pathRewrite: (path, req) => {
        // Get the target URL from the query parameter
        const targetUrl = req.query.url;
        if (!targetUrl) {
          throw new Error('Target URL is required');
        }

        // Store the target URL in the request object for the Go backend to use
        req.headers['x-target-url'] = targetUrl;

        // Get the endpoint path from the query parameter
        const endpointPath = req.query.endpoint_path;
        if (!endpointPath) {
          throw new Error('Endpoint path is required');
        }

        // Store the endpoint path in the request object for the Go backend to use
        req.headers['x-endpoint-path'] = endpointPath;

        // If operation is provided, store it in the request object
        const operation = req.query.operation;
        if (operation) {
          req.headers['x-operation'] = operation;
        }

        // Pass auth parameters in headers
        if (req.query.authType && req.query.authValue) {
          req.headers['x-auth-type'] = req.query.authType;
          req.headers['x-auth-value'] = req.query.authValue;
        }

        return '/proxy/hooks/train-neural-network'; // Keep the original path for the Go backend
      },
      changeOrigin: true,
      secure: true, // Ensure secure connections
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        addAuthorizationHeader(proxyReq, req);

        // Set content type for POST requests
        if (req.method === 'POST') {
          proxyReq.setHeader('Content-Type', 'application/json');
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error for train-neural-network:', err);

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
