module.exports = function override(config) {
  // Add fallback for 'crypto' module
  config.resolve = {
    ...config.resolve,
    fallback: {
      ...config.resolve.fallback,
      "crypto": false
    }
  };
  
  return config;
};
