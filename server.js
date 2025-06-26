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

// New schema for individual users
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  roles: { type: [String], required: true },
  displayName: { type: String },
  email: { type: String },
  avatar: { type: String },
  lastLogin: { type: String, default: null },
  lastModified: { type: String, required: true }
});

// New schema for JWT configuration
const JwtConfigSchema = new mongoose.Schema({
  jwtSecret: { type: String, required: true },
  tokenExpiry: { type: Number, required: true },
  refreshTokenExpiry: { type: Number, required: true }
});

// Keep the old schema for backward compatibility during migration
const UserConfigSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  config: { type: mongoose.Schema.Types.Mixed, required: true }
});


// Create models
const Profile = mongoose.model('Profile', ProfileSchema);
const User = mongoose.model('User', UserSchema);
const JwtConfig = mongoose.model('JwtConfig', JwtConfigSchema);
const UserConfig = mongoose.model('UserConfig', UserConfigSchema);

// Function to initialize database with required collections and default admin user
const initializeDatabase = async () => {
  try {
    // Check if JwtConfig collection has any documents
    const jwtConfigCount = await JwtConfig.countDocuments();
    if (jwtConfigCount === 0) {
      console.log('Creating default JWT configuration...');

      // Default JWT configuration
      await JwtConfig.create({
        jwtSecret: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
        tokenExpiry: parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
        refreshTokenExpiry: parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
      });

      console.log('Default JWT configuration created successfully');
    }

    // Check if User collection has any documents
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('Creating default admin user...');

      // Default admin user
      await User.create({
        username: 'admin',
        passwordHash: bcrypt.hashSync('admin', 12),
        roles: ['admin'],
        lastLogin: null,
        lastModified: new Date().toISOString()
      });

      console.log('Default admin user created successfully');
    }

    // Check if UserConfig collection has any documents (for migration)
    const userConfigCount = await UserConfig.countDocuments();
    if (userConfigCount > 0) {
      // Migrate users from UserConfig to User collection
      console.log('Migrating users from UserConfig to User collection...');

      // Get all user configs
      const userConfigs = await UserConfig.find({});

      // Set to track processed usernames to avoid duplicates
      const processedUsernames = new Set();

      // Process each user config
      for (const userConfig of userConfigs) {
        if (userConfig.config && userConfig.config.users && userConfig.config.users.length > 0) {
          // Process each user in the config
          for (const userData of userConfig.config.users) {
            // Skip if already processed
            if (processedUsernames.has(userData.username)) {
              continue;
            }

            // Mark as processed
            processedUsernames.add(userData.username);

            // Check if user already exists in User collection
            const existingUser = await User.findOne({ username: userData.username });
            if (!existingUser) {
              // Create user in User collection
              await User.create({
                username: userData.username,
                passwordHash: userData.passwordHash,
                roles: userData.roles,
                displayName: userData.displayName,
                email: userData.email,
                avatar: userData.avatar,
                lastLogin: userData.lastLogin || null,
                lastModified: userData.lastModified || new Date().toISOString()
              });
              console.log(`Migrated user ${userData.username} to User collection`);
            }
          }
        }
      }

      console.log('User migration completed');
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

// Middleware for parsing JSON with increased payload size limit
app.use(bodyParser.json({ limit: '50mb' }));

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

// New API endpoints for user management and JWT configuration

// User API
app.get('/api/users', async (req, res) => {
  // If MongoDB is not connected, return default users
  if (!isMongoConnected) {
    console.log('MongoDB not connected, returning default users');
    return res.json({
      users: [
        {
          username: 'admin',
          roles: ['admin'],
          lastLogin: null,
          lastModified: new Date().toISOString()
        }
      ]
    });
  }

  try {
    // Get all users without passwordHash
    const users = await User.find({}, { passwordHash: 0 });
    res.json({ users });
  } catch (error) {
    console.log('Error fetching users:', error);
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/users/:username', async (req, res) => {
  // If MongoDB is not connected, return error
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const { username } = req.params;
    // Get user without passwordHash
    const user = await User.findOne({ username }, { passwordHash: 0 });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.log('Error fetching user:', error);
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/api/users', async (req, res) => {
  // If MongoDB is not connected, return error
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const { username, password, roles, ...profileData } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      username,
      passwordHash,
      roles: roles || ['user'],
      lastLogin: null,
      lastModified: new Date().toISOString(),
      ...profileData
    });

    // Return user without passwordHash
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.passwordHash;

    res.status(201).json({ user: userWithoutPassword });
  } catch (error) {
    console.log('Error creating user:', error);
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:username', async (req, res) => {
  // If MongoDB is not connected, return error
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const { username } = req.params;
    const { password, roles, ...profileData } = req.body;

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user fields
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 12);
    }

    if (roles) {
      user.roles = roles;
    }

    // Update profile data
    Object.assign(user, profileData);

    // Update lastModified timestamp if not explicitly provided
    if (!profileData.lastModified) {
      user.lastModified = new Date().toISOString();
    }

    // Save user
    await user.save();

    // Return user without passwordHash
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.passwordHash;

    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.log('Error updating user:', error);
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:username', async (req, res) => {
  // If MongoDB is not connected, return error
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const { username } = req.params;

    // Delete user
    const result = await User.deleteOne({ username });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.log('Error deleting user:', error);
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// JWT Config API
app.get('/api/jwtconfig', async (req, res) => {
  // If MongoDB is not connected, return default JWT config
  if (!isMongoConnected) {
    console.log('MongoDB not connected, returning default JWT config');
    return res.json({
      jwtConfig: {
        jwtSecret: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
        tokenExpiry: parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
        refreshTokenExpiry: parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
      }
    });
  }

  try {
    // Get JWT config
    const jwtConfig = await JwtConfig.findOne();

    if (!jwtConfig) {
      return res.status(404).json({ error: 'JWT configuration not found' });
    }

    res.json({ jwtConfig });
  } catch (error) {
    console.log('Error fetching JWT config:', error);
    console.error('Error fetching JWT config:', error);
    res.status(500).json({ error: 'Failed to fetch JWT configuration' });
  }
});

app.put('/api/jwtconfig', async (req, res) => {
  // If MongoDB is not connected, return error
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const { jwtSecret, tokenExpiry, refreshTokenExpiry } = req.body;

    // Find JWT config
    let jwtConfig = await JwtConfig.findOne();

    if (!jwtConfig) {
      // Create new JWT config if none exists
      jwtConfig = new JwtConfig({
        jwtSecret: jwtSecret || process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
        tokenExpiry: tokenExpiry || parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
        refreshTokenExpiry: refreshTokenExpiry || parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
      });
    } else {
      // Update existing JWT config
      if (jwtSecret) jwtConfig.jwtSecret = jwtSecret;
      if (tokenExpiry) jwtConfig.tokenExpiry = tokenExpiry;
      if (refreshTokenExpiry) jwtConfig.refreshTokenExpiry = refreshTokenExpiry;
    }

    // Save JWT config
    await jwtConfig.save();

    res.json({ jwtConfig });
  } catch (error) {
    console.log('Error updating JWT config:', error);
    console.error('Error updating JWT config:', error);
    res.status(500).json({ error: 'Failed to update JWT configuration' });
  }
});

// Legacy User Config API - for backward compatibility during transition
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
            roles: ['admin'],
            lastLogin: null, // Explicitly set lastLogin to null
            lastModified: new Date().toISOString()
          }
        ],
        jwtSecret: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
        tokenExpiry: parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
        refreshTokenExpiry: parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
      }
    });
  }

  try {
    // Get all users from User collection
    const users = await User.find();

    // Get JWT config
    const jwtConfig = await JwtConfig.findOne();

    // Construct config object in the old format
    const config = {
      users: users.map(user => ({
        username: user.username,
        passwordHash: user.passwordHash,
        roles: user.roles,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        lastLogin: user.lastLogin,
        lastModified: user.lastModified
      })),
      jwtSecret: jwtConfig ? jwtConfig.jwtSecret : (process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production'),
      tokenExpiry: jwtConfig ? jwtConfig.tokenExpiry : parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
      refreshTokenExpiry: jwtConfig ? jwtConfig.refreshTokenExpiry : parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
    };

    res.json({ config });
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
    const { config } = req.body;

    // Process users
    if (config && config.users && Array.isArray(config.users)) {
      for (const userData of config.users) {
        // Ensure lastLogin is explicitly set
        if (!('lastLogin' in userData)) {
          userData.lastLogin = null;
        }

        // Check if user exists
        const existingUser = await User.findOne({ username: userData.username });

        if (existingUser) {
          // Update existing user
          Object.assign(existingUser, {
            passwordHash: userData.passwordHash,
            roles: userData.roles,
            displayName: userData.displayName,
            email: userData.email,
            avatar: userData.avatar,
            lastLogin: userData.lastLogin,
            lastModified: userData.lastModified || new Date().toISOString()
          });

          await existingUser.save();
        } else {
          // Create new user
          await User.create({
            username: userData.username,
            passwordHash: userData.passwordHash,
            roles: userData.roles,
            displayName: userData.displayName,
            email: userData.email,
            avatar: userData.avatar,
            lastLogin: userData.lastLogin,
            lastModified: userData.lastModified || new Date().toISOString()
          });
        }
      }
    }

    // Process JWT config
    if (config && (config.jwtSecret || config.tokenExpiry || config.refreshTokenExpiry)) {
      // Find JWT config
      let jwtConfig = await JwtConfig.findOne();

      if (!jwtConfig) {
        // Create new JWT config if none exists
        jwtConfig = new JwtConfig({
          jwtSecret: config.jwtSecret || process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
          tokenExpiry: config.tokenExpiry || parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
          refreshTokenExpiry: config.refreshTokenExpiry || parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
        });
      } else {
        // Update existing JWT config
        if (config.jwtSecret) jwtConfig.jwtSecret = config.jwtSecret;
        if (config.tokenExpiry) jwtConfig.tokenExpiry = config.tokenExpiry;
        if (config.refreshTokenExpiry) jwtConfig.refreshTokenExpiry = config.refreshTokenExpiry;
      }

      await jwtConfig.save();
    }

    // Return the updated config
    const users = await User.find();
    const jwtConfig = await JwtConfig.findOne();

    const updatedConfig = {
      users: users.map(user => ({
        username: user.username,
        passwordHash: user.passwordHash,
        roles: user.roles,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        lastLogin: user.lastLogin,
        lastModified: user.lastModified
      })),
      jwtSecret: jwtConfig ? jwtConfig.jwtSecret : (process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production'),
      tokenExpiry: jwtConfig ? jwtConfig.tokenExpiry : parseInt(process.env.REACT_APP_TOKEN_EXPIRY || '3600'),
      refreshTokenExpiry: jwtConfig ? jwtConfig.refreshTokenExpiry : parseInt(process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400')
    };

    res.json({ config: updatedConfig });
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
      REACT_APP_JWT_SECRET: process.env.REACT_APP_JWT_SECRET || 'nauthilus-ui-default-secret-key-change-in-production',
      REACT_APP_TOKEN_EXPIRY: process.env.REACT_APP_TOKEN_EXPIRY || '3600',
      REACT_APP_REFRESH_TOKEN_EXPIRY: process.env.REACT_APP_REFRESH_TOKEN_EXPIRY || '86400'
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
