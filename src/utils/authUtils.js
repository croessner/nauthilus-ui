// Utility function to add authorization headers to proxy requests
const addAuthorizationHeader = (proxyReq, req) => {
  // Add authentication headers if provided in the request
  if (req.query.authType === 'basic' && req.query.authValue) {
    proxyReq.setHeader('Authorization', `Basic ${req.query.authValue}`);
  } else if (req.query.authType === 'bearer' && req.query.authValue) {
    proxyReq.setHeader('Authorization', `Bearer ${req.query.authValue}`);
  }
};

module.exports = {
  addAuthorizationHeader
};