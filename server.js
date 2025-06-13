const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the React build
app.use(express.static(path.join(__dirname, 'build')));

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
    secure: false, // Allow insecure connections for testing
    onProxyReq: (proxyReq, req, res) => {
      // Add authentication headers if provided in the request
      if (req.query.authType === 'basic' && req.query.authValue) {
        proxyReq.setHeader('Authorization', `Basic ${req.query.authValue}`);
      } else if (req.query.authType === 'bearer' && req.query.authValue) {
        proxyReq.setHeader('Authorization', `Bearer ${req.query.authValue}`);
      }
    },
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
      secure: false, // Allow insecure connections for testing
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
      secure: false, // Allow insecure connections for testing
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        if (req.query.authType === 'basic' && req.query.authValue) {
          proxyReq.setHeader('Authorization', `Basic ${req.query.authValue}`);
        } else if (req.query.authType === 'bearer' && req.query.authValue) {
          proxyReq.setHeader('Authorization', `Bearer ${req.query.authValue}`);
        }
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
      secure: false, // Allow insecure connections for testing
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        if (req.query.authType === 'basic' && req.query.authValue) {
          proxyReq.setHeader('Authorization', `Basic ${req.query.authValue}`);
        } else if (req.query.authType === 'bearer' && req.query.authValue) {
          proxyReq.setHeader('Authorization', `Bearer ${req.query.authValue}`);
        }
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
      secure: false, // Allow insecure connections for testing
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication headers if provided in the request
        if (req.query.authType === 'basic' && req.query.authValue) {
          proxyReq.setHeader('Authorization', `Basic ${req.query.authValue}`);
        } else if (req.query.authType === 'bearer' && req.query.authValue) {
          proxyReq.setHeader('Authorization', `Bearer ${req.query.authValue}`);
        }
        // Set content type for POST requests
        proxyReq.setHeader('Content-Type', 'application/json');
      },
      onError: (err, req, res) => {
        res.status(500).json({ error: err.message });
      },
    })
  );

// All other requests go to the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
