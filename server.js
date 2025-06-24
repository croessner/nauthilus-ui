// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const ADDRESS = process.env.ADDRESS || '0.0.0.0';

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define schemas
const ProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  profiles: [{ 
    name: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, required: true }
  }],
  currentProfileName: { type: String, required: true }
});

const UserConfigSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  config: { type: mongoose.Schema.Types.Mixed, required: true }
});

const TokenSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  token: { type: String },
  refreshToken: { type: String }
});

const ThemeSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  theme: { type: String, required: true }
});

// Create models
const Profile = mongoose.model('Profile', ProfileSchema);
const UserConfig = mongoose.model('UserConfig', UserConfigSchema);
const Token = mongoose.model('Token', TokenSchema);
const Theme = mongoose.model('Theme', ThemeSchema);

// Middleware for parsing JSON
app.use(bodyParser.json());

// API endpoints for data that was previously in localStorage

// Profiles API
app.get('/api/profiles/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const profileData = await Profile.findOne({ userId });

    if (!profileData) {
      return res.status(404).json({ error: 'Profiles not found' });
    }

    res.json({
      profiles: profileData.profiles,
      currentProfileName: profileData.currentProfileName
    });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

app.post('/api/profiles/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { profiles, currentProfileName } = req.body;

    // Update or create profile data
    const result = await Profile.findOneAndUpdate(
      { userId },
      { userId, profiles, currentProfileName },
      { upsert: true, new: true }
    );

    res.json({
      profiles: result.profiles,
      currentProfileName: result.currentProfileName
    });
  } catch (error) {
    console.error('Error saving profiles:', error);
    res.status(500).json({ error: 'Failed to save profiles' });
  }
});

// User Config API
app.get('/api/userconfig/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userConfig = await UserConfig.findOne({ userId });

    if (!userConfig) {
      return res.status(404).json({ error: 'User configuration not found' });
    }

    res.json({ config: userConfig.config });
  } catch (error) {
    console.error('Error fetching user config:', error);
    res.status(500).json({ error: 'Failed to fetch user configuration' });
  }
});

app.post('/api/userconfig/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { config } = req.body;

    // Update or create user config
    const result = await UserConfig.findOneAndUpdate(
      { userId },
      { userId, config },
      { upsert: true, new: true }
    );

    res.json({ config: result.config });
  } catch (error) {
    console.error('Error saving user config:', error);
    res.status(500).json({ error: 'Failed to save user configuration' });
  }
});

// Auth Tokens API
app.get('/api/tokens/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const tokenData = await Token.findOne({ userId });

    if (!tokenData) {
      return res.status(404).json({ error: 'Tokens not found' });
    }

    res.json({
      token: tokenData.token,
      refreshToken: tokenData.refreshToken
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

app.post('/api/tokens/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { token, refreshToken } = req.body;

    // Update or create token data
    const result = await Token.findOneAndUpdate(
      { userId },
      { userId, token, refreshToken },
      { upsert: true, new: true }
    );

    res.json({
      token: result.token,
      refreshToken: result.refreshToken
    });
  } catch (error) {
    console.error('Error saving tokens:', error);
    res.status(500).json({ error: 'Failed to save tokens' });
  }
});

app.delete('/api/tokens/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await Token.findOneAndDelete({ userId });
    res.json({ message: 'Tokens deleted successfully' });
  } catch (error) {
    console.error('Error deleting tokens:', error);
    res.status(500).json({ error: 'Failed to delete tokens' });
  }
});

// Theme API
app.get('/api/theme/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const themeData = await Theme.findOne({ userId });

    if (!themeData) {
      return res.status(404).json({ error: 'Theme not found' });
    }

    res.json({ theme: themeData.theme });
  } catch (error) {
    console.error('Error fetching theme:', error);
    res.status(500).json({ error: 'Failed to fetch theme' });
  }
});

app.post('/api/theme/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { theme } = req.body;

    // Update or create theme data
    const result = await Theme.findOneAndUpdate(
      { userId },
      { userId, theme },
      { upsert: true, new: true }
    );

    res.json({ theme: result.theme });
  } catch (error) {
    console.error('Error saving theme:', error);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

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

app.listen(PORT, ADDRESS, () => {
  console.log(`Server running on ${ADDRESS}:${PORT}`);
});
