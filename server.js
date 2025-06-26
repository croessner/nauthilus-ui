// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
const EXPRESS_PORT = process.env.EXPRESS_PORT || 3001;
const EXPRESS_ADDRESS = process.env.EXPRESS_ADDRESS || '0.0.0.0';

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

// Function to initialize database with required collections and default admin user
const initializeDatabase = async () => {
  try {
    // Check if UserConfig collection has any documents
    const userConfigCount = await UserConfig.countDocuments();
    if (userConfigCount === 0) {
      console.log('Creating default user configuration...');

      // Default user configuration with admin user
      const defaultConfig = {
        users: [
          {
            username: 'admin',
            // Default password: 'admin'
            passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
            roles: ['admin']
          }
        ],
        jwtSecret: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
        tokenExpiry: parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
        refreshTokenExpiry: parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
      };

      // Create default user config
      await UserConfig.create({
        userId: 'default-user',
        config: defaultConfig
      });

      console.log('Default user configuration created successfully');
    }

    // Check if Profile collection has any documents
    const profileCount = await Profile.countDocuments();
    if (profileCount === 0) {
      console.log('Creating default profile...');

      // Default empty configuration
      const defaultConfig = {
        server: {
          address: '127.0.0.1:8080',
          instance_name: 'nauthilus',
          max_concurrent_requests: 100,
          max_password_history_entries: 10,
          redis: {
            database_number: 0,
            prefix: 'nt:',
            master: {
              address: '127.0.0.1:6379'
            }
          }
        },
        connection: {
          backend_url: 'http://127.0.0.1:8080',
          basic_auth: {
            enabled: false,
            username: '',
            password: ''
          },
          jwt_auth: {
            enabled: false,
            token: ''
          }
        }
      };

      // Create default profile
      await Profile.create({
        userId: 'default-user',
        profiles: [{ name: 'Default', config: defaultConfig }],
        currentProfileName: 'Default'
      });

      console.log('Default profile created successfully');
    }

    console.log('Database initialization completed');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Flag to track MongoDB connection status
let isMongoConnected = false;
let mongoConnectionRetryCount = 0;
const MAX_RETRY_COUNT = 5;
const RETRY_INTERVAL = 30000; // 30 seconds
const LONG_RETRY_INTERVAL = 300000; // 5 minutes

// Function to connect to MongoDB
const connectToMongoDB = (isInitialAttempt = false) => {
  if (isInitialAttempt) {
    mongoConnectionRetryCount = 0;
  }

  console.log(`Attempting to connect to MongoDB (attempt ${mongoConnectionRetryCount + 1}/${MAX_RETRY_COUNT + 1})...`);

  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // 5 seconds timeout for server selection
    connectTimeoutMS: 10000, // 10 seconds timeout for initial connection
    socketTimeoutMS: 45000, // 45 seconds timeout for operations
    family: 4 // Use IPv4, skip trying IPv6
  })
  .then(() => {
    console.log('Connected to MongoDB');
    isMongoConnected = true;
    mongoConnectionRetryCount = 0; // Reset retry count on successful connection

    // Initialize collections and create default admin user if needed
    initializeDatabase();
  })
  .catch(err => {
    console.log('MongoDB connection error:', err);
    console.error('MongoDB connection error:', err);
    isMongoConnected = false;

    // Don't terminate the application, but make it clear there's a DB issue
    console.error('WARNING: Application running without database connection. Collections will not be created.');

    // Retry connection if we haven't exceeded the maximum retry count
    if (mongoConnectionRetryCount < MAX_RETRY_COUNT) {
      mongoConnectionRetryCount++;
      console.log(`Will retry MongoDB connection in ${RETRY_INTERVAL/1000} seconds...`);
      setTimeout(connectToMongoDB, RETRY_INTERVAL);
    } else {
      console.error(`Maximum MongoDB connection retry attempts (${MAX_RETRY_COUNT + 1}) reached. Will try again in ${LONG_RETRY_INTERVAL/60000} minutes.`);
      // Schedule a long-term retry
      setTimeout(() => connectToMongoDB(true), LONG_RETRY_INTERVAL);
    }
  });
};

// Initial connection attempt
connectToMongoDB(true);

// Add a health check endpoint that can be used to manually trigger a reconnection
app.get('/api/health/mongodb', (req, res) => {
  if (isMongoConnected) {
    res.json({ status: 'connected' });
  } else {
    // Try to reconnect if not connected
    console.log('Manual reconnection attempt triggered via health check endpoint');
    connectToMongoDB(true);
    res.json({ status: 'disconnected', message: 'Reconnection attempt triggered' });
  }
});

// Middleware for parsing JSON
app.use(bodyParser.json());

// API endpoints for data that was previously in localStorage

// Profiles API
app.get('/api/profiles/:userId', async (req, res) => {
  // If MongoDB is not connected, return default profile
  if (!isMongoConnected) {
    console.log('MongoDB not connected, returning default profile');
    return res.json({
      profiles: [{ 
        name: 'Default', 
        config: {
          server: {
            address: '127.0.0.1:8080',
            instance_name: 'nauthilus',
            max_concurrent_requests: 100,
            max_password_history_entries: 10,
            redis: {
              database_number: 0,
              prefix: 'nt:',
              master: {
                address: '127.0.0.1:6379'
              }
            }
          },
          connection: {
            backend_url: 'http://127.0.0.1:8080',
            basic_auth: {
              enabled: false,
              username: '',
              password: ''
            },
            jwt_auth: {
              enabled: false,
              token: ''
            }
          }
        }
      }],
      currentProfileName: 'Default'
    });
  }

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
    console.log('Error fetching profiles:', error);
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

app.post('/api/profiles/:userId', async (req, res) => {
  // If MongoDB is not connected, return success but log warning
  if (!isMongoConnected) {
    console.log('MongoDB not connected, profile not saved but returning success');
    const { profiles, currentProfileName } = req.body;
    return res.json({
      profiles,
      currentProfileName
    });
  }

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
    console.log('Error saving profiles:', error);
    console.error('Error saving profiles:', error);
    res.status(500).json({ error: 'Failed to save profiles' });
  }
});

// User Config API
app.get('/api/userconfig/:userId', async (req, res) => {
  // If MongoDB is not connected, return default user config
  if (!isMongoConnected) {
    console.log('MongoDB not connected, returning default user config');
    return res.json({
      config: {
        users: [
          {
            username: 'admin',
            // Default password hash for 'admin'
            passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
            roles: ['admin']
          }
        ],
        jwtSecret: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
        tokenExpiry: parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
        refreshTokenExpiry: parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
      }
    });
  }

  try {
    const { userId } = req.params;
    const userConfig = await UserConfig.findOne({ userId });

    if (!userConfig) {
      return res.status(404).json({ error: 'User configuration not found' });
    }

    res.json({ config: userConfig.config });
  } catch (error) {
    console.log('Error fetching user config:', error);
    console.error('Error fetching user config:', error);
    res.status(500).json({ error: 'Failed to fetch user configuration' });
  }
});

app.post('/api/userconfig/:userId', async (req, res) => {
  // If MongoDB is not connected, return success but log warning
  if (!isMongoConnected) {
    console.log('MongoDB not connected, user config not saved but returning success');
    const { config } = req.body;
    return res.json({ config });
  }

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
    console.log('Error saving user config:', error);
    console.error('Error saving user config:', error);
    res.status(500).json({ error: 'Failed to save user configuration' });
  }
});

app.get('/api/tokens/:userId', async (req, res) => {
  // If MongoDB is not connected, return empty tokens
  if (!isMongoConnected) {
    console.log('MongoDB not connected, returning empty tokens');
    return res.json({
      token: null,
      refreshToken: null
    });
  }

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
    console.log('Error fetching tokens:', error);
    console.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

app.post('/api/tokens/:userId', async (req, res) => {
  // If MongoDB is not connected, return success but log warning
  if (!isMongoConnected) {
    console.log('MongoDB not connected, tokens not saved but returning success');
    const { token, refreshToken } = req.body;
    return res.json({
      token,
      refreshToken
    });
  }

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
    console.log('Error saving tokens:', error);
    console.error('Error saving tokens:', error);
    res.status(500).json({ error: 'Failed to save tokens' });
  }
});

app.delete('/api/tokens/:userId', async (req, res) => {
  // If MongoDB is not connected, return success but log warning
  if (!isMongoConnected) {
    console.log('MongoDB not connected, tokens not deleted but returning success');
    return res.json({ message: 'Tokens deleted successfully' });
  }

  try {
    const { userId } = req.params;
    await Token.findOneAndDelete({ userId });
    res.json({ message: 'Tokens deleted successfully' });
  } catch (error) {
    console.log('Error deleting tokens:', error);
    console.error('Error deleting tokens:', error);
    res.status(500).json({ error: 'Failed to delete tokens' });
  }
});

// Theme API
app.get('/api/theme/:userId', async (req, res) => {
  // If MongoDB is not connected, return default theme
  if (!isMongoConnected) {
    console.log('MongoDB not connected, returning default theme');
    return res.json({ theme: 'light' });
  }

  try {
    const { userId } = req.params;
    const themeData = await Theme.findOne({ userId });

    if (!themeData) {
      return res.status(404).json({ error: 'Theme not found' });
    }

    res.json({ theme: themeData.theme });
  } catch (error) {
    console.log('Error fetching theme:', error);
    console.error('Error fetching theme:', error);
    res.status(500).json({ error: 'Failed to fetch theme' });
  }
});

app.post('/api/theme/:userId', async (req, res) => {
  // If MongoDB is not connected, return success but log warning
  if (!isMongoConnected) {
    console.log('MongoDB not connected, theme not saved but returning success');
    const { theme } = req.body;
    return res.json({ theme });
  }

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
    console.log('Error saving theme:', error);
    console.error('Error saving theme:', error);
    res.status(500).json({ error: 'Failed to save theme' });
  }
});

// Create a middleware to inject environment variables into window._env_
app.use((req, res, next) => {
  if (req.path === '/env-config.js') {
    // Create a JavaScript file that sets window._env_
    const envConfig = {
      JWT_SECRET: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
      TOKEN_EXPIRY: process.env.REACT_APP_TOKEN_EXPIRY || '3600',
      REFRESH_TOKEN_EXPIRY: process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400'
    };

    res.setHeader('Content-Type', 'application/javascript');
    res.send(`window._env_ = ${JSON.stringify(envConfig)};`);
  } else {
    next();
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
      console.log('Proxy error:', err.message);
      console.error('Proxy error:', err.message);
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
        console.log('Proxy error:', err.message);
        console.error('Proxy error:', err.message);
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
        console.log('Proxy error:', err.message);
        console.error('Proxy error:', err.message);
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
        console.log('Proxy error:', err.message);
        console.error('Proxy error:', err.message);
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
        console.log('Proxy error:', err.message);
        console.error('Proxy error:', err.message);
        res.status(500).json({ error: err.message });
      },
    })
  );

// All other requests go to the React app
app.get('*', (req, res) => {
  // Read the HTML file
  const indexPath = path.join(__dirname, 'build', 'index.html');
  const fs = require('fs');

  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      console.log('Error reading index.html:', err);
      console.error('Error reading index.html:', err);
      return res.status(500).send('Error loading application');
    }

    // Inject the env-config.js script before the closing head tag
    const modifiedHtml = data.replace(
      '</head>',
      '<script src="/env-config.js"></script></head>'
    );

    res.send(modifiedHtml);
  });
});

app.listen(EXPRESS_PORT, EXPRESS_ADDRESS, () => {
  console.log(`Server running on ${EXPRESS_ADDRESS}:${EXPRESS_PORT}`);
});
