// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');

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
            // Default password: 'admin' (hashed with bcrypt)
            passwordHash: bcrypt.hashSync('admin', 12),
            roles: ['admin']
          }
        ],
        jwtSecret: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
        tokenExpiry: parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
        refreshTokenExpiry: parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
      };

      // Create default user config for both 'default-user' and 'admin'
      await UserConfig.create({
        userId: 'default-user',
        config: defaultConfig
      });

      // Also create the same config for 'admin' user
      await UserConfig.create({
        userId: 'admin',
        config: defaultConfig
      });

      console.log('Default user configuration created successfully');
    } else {
      // Even if UserConfig collection exists, check if it has the admin user
      const userConfig = await UserConfig.findOne({ userId: 'default-user' });
      if (userConfig) {
        // Check if users array exists and has at least one user
        if (!userConfig.config.users || userConfig.config.users.length === 0) {
          console.log('User config exists but no users found, adding default admin user');

          // Add default admin user
          userConfig.config.users = [
            {
              username: 'admin',
              // Default password: 'admin' (hashed with bcrypt)
              passwordHash: bcrypt.hashSync('admin', 12),
              roles: ['admin']
            }
          ];

          // Save the updated config
          await userConfig.save();
          console.log('Default admin user added to existing config');
        }
      }

      // Check if there's a config for 'admin' userId
      const adminConfig = await UserConfig.findOne({ userId: 'admin' });
      if (!adminConfig) {
        console.log('Creating user configuration for admin userId...');

        // Copy config from default-user if it exists, otherwise create new default config
        const configToUse = userConfig ? userConfig.config : {
          users: [
            {
              username: 'admin',
              passwordHash: bcrypt.hashSync('admin', 12),
              roles: ['admin']
            }
          ],
          jwtSecret: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
          tokenExpiry: parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
          refreshTokenExpiry: parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
        };

        // Create config for admin userId
        await UserConfig.create({
          userId: 'admin',
          config: configToUse
        });

        console.log('User configuration for admin userId created successfully');
      }
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
            // Default password hash for 'admin' (hashed with bcrypt)
            passwordHash: bcrypt.hashSync('admin', 12),
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
